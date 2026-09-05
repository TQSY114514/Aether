// sandbox.js with whitelist mode
const fs = require('fs')
const path = require('path')
// In headless mode (cli.js) `require('electron')` resolves to a path string,
// so destructuring `app` yields undefined. Guard the only call site.
const electron = (() => { try { return require('electron') } catch { return null } })()
const app = (electron && typeof electron === 'object' && electron.app) ? electron.app : null

let _workspaceRoot = null
let _sessionWorkspaces = new Map()

function isDangerousRoot(p) {
  if (!p) return false
  const norm = path.resolve(p).toLowerCase()
  if (/^[a-z]:\\?$/i.test(norm) || norm === '/' || norm === '\\') return true
  const winDir = (process.env.WINDIR || 'C:\\Windows').toLowerCase()
  const progFiles = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase()
  if (norm === winDir || norm.startsWith(winDir + path.sep)) return true
  if (norm === progFiles || norm.startsWith(progFiles + path.sep)) return true
  return false
}

function setWorkspaceRoot(p) {
  if (p && isDangerousRoot(p)) {
    throw new Error(`Forbidden workspace root: ${p} is a system-critical directory`)
  }
  _workspaceRoot = p ? path.resolve(p) : null
}
function setWorkspaceRootForSession(sessionId, p) {
  if (p && String(p).trim()) {
    if (isDangerousRoot(p)) {
      throw new Error(`Forbidden workspace root: ${p} is a system-critical directory`)
    }
    _sessionWorkspaces.set(sessionId, path.resolve(p))
  }
  else { _sessionWorkspaces.delete(sessionId) }
}
function clearSessionWorkspaces() { _sessionWorkspaces.clear() }

function getWorkspaceRoot(sessionId) {
  if (sessionId && _sessionWorkspaces.has(sessionId)) return _sessionWorkspaces.get(sessionId)
  return _workspaceRoot || defaultWorkspace()
}

function defaultWorkspace() {
  // Headless fallback: cwd-relative .aether-workspace when no Electron userData.
  const base = app && typeof app.getPath === 'function'
    ? app.getPath('userData')
    : path.join(process.cwd(), '.aether-workspace')
  const dir = path.join(base, 'workspace')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

function resolveInside(target, { mustExist = false } = {}, sessionId) {
  const root = getWorkspaceRoot(sessionId)
  let abs = path.isAbsolute(target) ? target : path.join(root, target)
  // todo 19：Windows 不安全前缀（\\?\ 原始路径 / UNC 共享）直接拒绝（平台无关判定）
  if (hasUnsafeWindowsPrefix(abs)) {
    return { ok: false, reason: 'unsafe Windows path prefix (\\\\?\\ or UNC)', abs }
  }
  let resolved
  try { resolved = fs.realpathSync(abs) }
  catch {
    if (mustExist) return { ok: false, reason: 'path does not exist', abs }
    try {
      const parentReal = fs.realpathSync(path.dirname(abs))
      resolved = path.join(parentReal, path.basename(abs))
    } catch { resolved = path.normalize(abs) }
  }
  const rootResolved = path.normalize(root)
  const inside = resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)
  return { ok: inside, resolved, root: rootResolved, abs }
}

function isInsideWorkspace(target, sessionId) {
  const r = resolveInside(target, {}, sessionId)
  return r.ok === true
}

// ── Windows 路径强化（todo 19）────────────────────────────────────────────
// \\?\ 长路径前缀 / UNC \\server\share / 重解析点（symlink/junction）逃逸 /
// 点击即执行的危险扩展名。不减弱既有 3 层防御（root 包含 / realpath / 白名单）。

const DANGEROUS_EXTENSIONS = new Set([
  '.lnk', '.url', '.pif', '.cpl', '.scr', '.msi', '.msp', '.hta', '.jse', '.wsf',
])

// \\?\ 原始路径前缀（绕过规范化）与 UNC \\server\share（本地工作区不含远程共享）。
// 纯字符串判定，跨平台可用。
function hasUnsafeWindowsPrefix(p) {
  const s = String(p || '')
  if (/^\\\\\?\\/.test(s)) return true
  if (/^\\\\[^\\]+\\[^\\]+/.test(s)) return true
  return false
}

function hasDangerousExtension(p) {
  const ext = path.extname(String(p || '')).toLowerCase()
  return DANGEROUS_EXTENSIONS.has(ext)
}

// Windows 上 lstat.isSymbolicLink() 对符号链接与 junction 均返回 true。
function isReparsePoint(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

// ── 敏感路径默认拒绝（spec P0-C4：防持久化 RCE）───────────────────────────
// `.aetherai/hooks`、`.aetherai/skills`、`.claude`、`.git`、`.ssh` 任一路径
// 段命中即拒（大小写不敏感、正/反斜杠通吃）。yolo 例外由调用方
// （registry 各工具 `ctx?.agentMode !== 'yolo'` 的门）保证，本函数只在
// 非 yolo 语境下被调用。
const SENSITIVE_DIR_SEGMENTS = new Set(['.git', '.ssh', '.claude'])
const SENSITIVE_DIR_PAIRS = { '.aetherai': new Set(['hooks', 'skills']) }
const SENSITIVE_FILE_NAMES = new Set([
  '.npmrc', '.gitconfig', '.bashrc', '.bash_profile', '.zshrc', '.profile',
  'authorized_keys', 'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa',
])

function isSensitivePath(p) {
  const segs = String(p || '').replace(/\\/g, '/').toLowerCase().split('/')
  for (const seg of segs) {
    if (SENSITIVE_DIR_SEGMENTS.has(seg)) return true
  }
  for (let i = 0; i < segs.length - 1; i++) {
    const next = SENSITIVE_DIR_PAIRS[segs[i]]
    if (next && next.has(segs[i + 1])) return true
  }
  if (segs.length > 0 && SENSITIVE_FILE_NAMES.has(segs[segs.length - 1])) {
    return true
  }
  return false
}

function checkWritePath(target, sessionId) {
  const r = resolveInside(target, { mustExist: false }, sessionId)
  if (r.ok !== true) return { ok: false, reason: r.reason || 'path outside workspace', abs: r.abs }
  // P0-C4：敏感路径（hooks/skills/.git/.ssh/.claude）默认拒绝，防写入
  // post-commit 钩子 /authorized_keys 之类的持久化 RCE 载体。
  if (isSensitivePath(r.resolved || r.abs)) {
    return { ok: false, reason: '敏感路径禁止写入：.aetherai/hooks、.aetherai/skills、.claude、.git、.ssh（防持久化 RCE）', abs: r.abs }
  }
  // P1-10: 仓库级配置忽略路径检查 (.aether/config.json 中的 ignorePatterns)
  const ws = getWorkspaceRoot(sessionId)
  if (ws) {
    try {
      const { isPathIgnored } = require('../config/projectConfig')
      if (isPathIgnored(r.resolved || r.abs, ws)) {
        return { ok: false, reason: '路径匹配项目配置 (.aether/config.json) 中的 ignorePatterns', abs: r.abs }
      }
    } catch {}
  }
  // todo 19：危险扩展名块（.lnk/.url/.scr/... 点击即执行）
  if (hasDangerousExtension(target)) {
    return { ok: false, reason: 'dangerous file extension blocked', abs: r.abs }
  }
  // todo 19：最终组件是重解析点（symlink/junction）→ 显式拒绝（realpath 层兜底越界）
  if (isReparsePoint(r.abs)) {
    return { ok: false, reason: 'reparse point (symlink/junction) blocked', abs: r.abs }
  }
  return { ok: true }
}

// Command Whitelist（白名单默认拒绝：不在此列的首词一律拒绝）
const SAFE_COMMAND_WHITELIST = new Set([
  'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun',
  'git', 'python', 'python3', 'py', 'pip', 'pip3',
  'dir', 'ls', 'tree', 'type', 'cat', 'head', 'tail', 'more',
  'echo', 'mkdir', 'rmdir', 'cd', 'pwd', 'copy', 'move',
  'where', 'which', 'whoami', 'date', 'time', 'ver',
  'make', 'cmake', 'ninja', 'cargo', 'go', 'rustc',
  'apt', 'apt-get', 'brew', 'choco', 'winget',
  'findstr', 'grep', 'sort', 'uniq', 'wc',
  'ping', 'nslookup', 'tracert', 'netstat', 'tasklist', 'ps',
])

function isWhitelistedCommand(cmd) {
  const c = String(cmd || '').trim()
  if (!c) return false
  const base = c.split(/\s+/)[0].toLowerCase()
  const baseNoExt = base.replace(/\.(exe|cmd|bat|com|ps1)$/i, '')
  let basename = ''
  try { basename = path.basename(base).replace(/\.(exe|cmd|bat|com|ps1)$/i, '') } catch {}
  return SAFE_COMMAND_WHITELIST.has(base) || SAFE_COMMAND_WHITELIST.has(baseNoExt) || SAFE_COMMAND_WHITELIST.has(basename)
}

// Command Blocklist
const BLOCKED_COMMAND_PATTERNS = [
  /\bformat\b\s+[a-z]:/i, /\bformat\b\s+\/fs/i, /\/dev\/(?:sd|nvme|hd)/i,
  /\bdiskpart\b/i, /\brm\s+-rf\s+(?:\/|\/[a-z]+\s|~|C:\\windows|C:\\users\\[^/\\]+\\desktop)/i,
  /\brmdir\s+\/s\b/i, /\bdel\s+\/[fsq]/i,
  /\bshutdown\b/i, /\bshutdown\.exe\b/i, /\breboot\b/i, /\breboot\.exe\b/i, /\bhalt\b/i,
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(?:sh|bash|powershell|cmd|pwsh)\b/i,
  /\breg\s+delete\s+.*\/f\b/i, /\bchmod\s+-R\s+777\s+\//i,
  /\bSET\s+PATH\s*=/i, /\bNODE_OPTIONS\s*=/i,
]

function splitCommandSegments(cmd) {
  const segments = []
  let current = '', inQuote = false, quoteChar = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (inQuote) {
      current += ch
      if (ch === quoteChar && cmd[i - 1] !== '\\') inQuote = false
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch; current += ch
    } else if ('&|;'.includes(ch)) {
      if (current.trim()) segments.push(current.trim()); current = ''
    } else { current += ch }
  }
  if (current.trim()) segments.push(current.trim())
  return segments
}

// ===== Granular parameter checking for whitelisted commands =====

// Dangerous git subcommand/flag combinations that destroy or rewrite history.
const GIT_DANGEROUS_PATTERNS = [
  { re: /\bclean\b[^\n]*\s+-[a-z]*f[a-z]*\b/, msg: 'git clean force (-f) is blocked by sandbox' },
  { re: /\bpush\b[^\n]*\s+--force\b/, msg: 'git push --force is blocked by sandbox' },
  { re: /\bpush\b[^\n]*\s+--force-with-lease\b/, msg: 'git push --force-with-lease is blocked by sandbox' },
  { re: /\bpush\b[^\n]*\s+-[a-z]*f[a-z]*\b/, msg: 'git push -f is blocked by sandbox' },
  { re: /\breset\b[^\n]*\s+--hard\b/, msg: 'git reset --hard is blocked by sandbox' },
  { re: /\bbranch\b[^\n]*\s+-D\b/, msg: 'git branch -D is blocked by sandbox' },
]

// Unsafe constructs inside `python -c "..."` / `python -c '...'`.
const PYTHON_DYNAMIC_CODE_PATTERNS = [
  /\bos\.system\s*\(/i,
  /\b__import__\s*\(\s*['"]os['"]\s*\)/i,
  /\bimport\s+subprocess\b/i,
  /\bimport\s+socket\b/i,
  /\bimport\s+shutil\b/i,
  /\bshutil\.rmtree\s*\(/i,
  /\bopen\s*\(\s*['"][^'"]*['"]\s*,\s*['"]w['"]/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /\bcompile\s*\(/i,
]

// Unsafe constructs inside `node -e "..."` / `node -e '...'`.
const NODE_DYNAMIC_CODE_PATTERNS = [
  /require\s*\(\s*['"]child_process['"]\s*\)/i,
  /\bchild_process\b/i,
  /require\s*\(\s*['"]fs['"]\s*\)/i,
  /\bprocess\.(exit|kill)\b/i,
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bexec(Sync)?\s*\(/i,
  /\bspawn(Sync)?\s*\(/i,
  /\bunlinkSync\s*\(/i,
  /\brmSync\s*\(/i,
  /\bwriteFileSync\s*\(/i,
]

// Packages that npx should not be allowed to fetch & execute.
const NPX_BLOCKED_PACKAGES = new Set([
  'rimraf', 'del-cli', 'shx', 'shelljs', 'ssh2', 'child_process', 'execa',
  'open', 'kill-port', 'systeminformation', 'nodemailer', 'portfinder',
])

// npx 显式安全包白名单（P0-C2）：npx 会下载并执行任意包，仅放行常见
// 开发工具与官方 MCP server（market.js 里的 @modelcontextprotocol/* 全家
// + 任务用例中的 tsx/vitest 等）。不在清单内的一律拒绝。
const NPX_ALLOWED_PACKAGES = new Set([
  'tsx', 'vitest', 'jest', 'eslint', 'prettier', 'typescript', 'tsc',
  'create-next-app', 'create-vite', 'create-react-app', 'create-expo-app',
  'http-server', 'serve', 'nodemon', 'cross-env',
  'inspect', // @modelcontextprotocol/inspector 的 bin 名
])
// 作用域整体放行：官方 MCP server 系列（filesystem/github/postgres/puppeteer/
// memory/everything/sequential-thinking…）。
const NPX_ALLOWED_SCOPES = new Set(['@modelcontextprotocol'])

function tokenizeCommand(cmd) {
  const tokens = []
  let current = '', inQuote = false, quoteChar = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (inQuote) {
      current += ch
      if (ch === quoteChar && cmd[i - 1] !== '\\') inQuote = false
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch; current += ch
    } else if (/\s/.test(ch)) {
      if (current.trim()) tokens.push(current.trim())
      current = ''
    } else { current += ch }
  }
  if (current.trim()) tokens.push(current.trim())
  return tokens
}

// Return the inline-code argument following a flag like -c / -e / --eval.
function findCodeArg(args, flags) {
  for (let i = 0; i < args.length; i++) {
    if (flags.includes(args[i])) return args[i + 1] || ''
  }
  return null
}

// Extract the package name npx would install/run (first non-flag arg).
// Returns { full, bare, scope }: full 保留作用域（@scope/name），bare 是去
// 作用域去版本号的短名（与 bin 名一致的常见形态）。
function findNpxPackage(args) {
  for (const a of args) {
    if (!a || a.startsWith('-')) continue
    const full = a.split('@').length > 2 || a.startsWith('@')
      ? a.replace(/@[^/@]*$/, '').toLowerCase() // @scope/name@ver → @scope/name
      : a.split('@')[0].toLowerCase()
    const bare = full.replace(/^@[^/]+\//, '')
    const scope = full.startsWith('@') ? full.split('/')[0] : ''
    return { full, bare: bare || null, scope: scope || null }
  }
  return null
}

// Extra review applied to whitelisted commands. Keeps the whitelist itself
// unchanged while rejecting dangerous flag/argument combinations.
function checkCommandParams(cmd, base) {
  const low = base.replace(/\.(exe|cmd|bat|com|ps1)$/i, '').toLowerCase()
  let tokens
  let args

  if (low === 'git') {
    for (const p of GIT_DANGEROUS_PATTERNS) {
      if (p.re.test(cmd)) return { ok: false, reason: `命令被拒绝：${p.msg}` }
    }
  }

  if (low === 'python' || low === 'python3' || low === 'py') {
    tokens = tokens || tokenizeCommand(cmd)
    args = args || tokens.slice(1)
    const codeArg = findCodeArg(args, ['-c', '--command'])
    if (codeArg != null) {
      for (const re of PYTHON_DYNAMIC_CODE_PATTERNS) {
        if (re.test(codeArg)) return { ok: false, reason: '命令被拒绝：python -c 内联代码包含不安全调用（os.system/eval 等），已被沙箱拦截' }
      }
    }
  }

  if (low === 'node') {
    tokens = tokens || tokenizeCommand(cmd)
    args = args || tokens.slice(1)
    const codeArg = findCodeArg(args, ['-e', '--eval'])
    if (codeArg != null) {
      for (const re of NODE_DYNAMIC_CODE_PATTERNS) {
        if (re.test(codeArg)) return { ok: false, reason: '命令被拒绝：node -e 内联代码包含不安全调用（child_process/写文件等），已被沙箱拦截' }
      }
    }
  }

  if (low === 'npx') {
    tokens = tokens || tokenizeCommand(cmd)
    args = args || tokens.slice(1)
    const pkg = findNpxPackage(args)
    if (pkg) {
      if (pkg.bare && NPX_BLOCKED_PACKAGES.has(pkg.bare)) {
        return { ok: false, reason: `命令被拒绝：npx 包 ${pkg.full} 在禁止清单中（可执行任意破坏性操作）` }
      }
      const scopeOk = pkg.scope && NPX_ALLOWED_SCOPES.has(pkg.scope)
      const nameOk = (pkg.full && NPX_ALLOWED_PACKAGES.has(pkg.full)) ||
        (pkg.bare && NPX_ALLOWED_PACKAGES.has(pkg.bare))
      if (!scopeOk && !nameOk) {
        return { ok: false, reason: `命令被拒绝：npx 仅允许白名单包（@modelcontextprotocol/*、tsx、vitest、eslint 等常用开发工具），${pkg.full} 不在白名单内。如确需运行请让用户手动执行` }
      }
    }
  }

  return { ok: true }
}

// checkCommand（P0-C2 反转）：白名单默认拒绝。
//   1. `&` `|` `;` 拼接的多段命令逐段校验（引号内的分隔符不算）；
//   2. 每段先过危险模式黑名单（可解释），再要求首词命中白名单，最后过
//      该命令的细粒度参数检查（git -f / python -c / node -e / npx 包）；
//   3. 任何一段不通过即整体拒绝。certutil/mshta/bitsadmin 等 LOLBAS 因
//      不在白名单被默认拒绝。
function checkCommand(cmd) {
  const c = String(cmd || '')
  if (!c.trim()) return { ok: false, reason: '命令为空' }
  const segments = splitCommandSegments(c)
  for (const seg of segments) {
    for (const re of BLOCKED_COMMAND_PATTERNS) {
      if (re.test(seg)) return { ok: false, reason: `命令被拒绝：命中沙箱危险命令模式（${seg.slice(0, 80)}）` }
    }
    if (!isWhitelistedCommand(seg)) {
      const first = seg.split(/\s+/)[0]
      return { ok: false, reason: `命令被拒绝：${first} 不在沙箱命令白名单内（默认拒绝，仅放行常见开发命令）。如确需运行请让用户手动执行或请求用户批准` }
    }
    const guard = checkCommandParams(seg, seg.split(/\s+/)[0])
    if (!guard.ok) return guard
  }
  return { ok: true }
}

function isSandboxExecutorEnabled(db) {
  if (!db || typeof db.getSetting !== 'function') return false
  try { const val = db.getSetting('sandbox_executor_enabled'); return val === 'true' || val === true || val === '1' } catch { return false }
}

async function runInSandboxExecutor(command, opts = {}) {
  const { db, ...executorOpts } = opts
  if (!isSandboxExecutorEnabled(db)) {
    const result = checkCommand(command)
    if (!result.ok) return { ok: false, stdout: '', stderr: result.reason, exitCode: null }
    return { ok: true, stdout: '', stderr: 'sandbox executor disabled', exitCode: null }
  }
  try {
    const sandboxExecutor = require('./sandboxExecutor')
    return await sandboxExecutor.runInSandbox(command, executorOpts)
  } catch (err) { return { ok: false, stdout: '', stderr: 'sandbox error: ' + err.message, exitCode: null } }
}

module.exports = { getWorkspaceRoot, setWorkspaceRoot, setWorkspaceRootForSession, clearSessionWorkspaces, isInsideWorkspace, resolveInside, checkWritePath, checkCommand, isWhitelistedCommand, isSandboxExecutorEnabled, runInSandboxExecutor, hasUnsafeWindowsPrefix, hasDangerousExtension, isReparsePoint, isSensitivePath, DANGEROUS_EXTENSIONS, NPX_ALLOWED_PACKAGES, NPX_ALLOWED_SCOPES, NPX_BLOCKED_PACKAGES }