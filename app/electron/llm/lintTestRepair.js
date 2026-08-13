// ───────────────────────────────────────────────────────────────────────────
// Lint / Test Auto-Repair Loop (Task 2.3).
//
// After the agent writes/edits files, detect file-change tool calls and run
// the user-configured `lint_command` / `test_command`. If they produce errors,
// we return a context block that the agent loop injects so the model can fix
// them — up to MAX_REPAIR_ROUNDS rounds.
//
// Integration: toolLoop.js PostToolUse path. After each round where at least
// one file-change tool succeeded, `check()` is called. If it returns errors,
// toolLoop injects `buildRepairContext()` into the conversation and continues;
// the model then edits the affected files and the next round re-checks.
//
// Safety: commands run in the workspace root, with a timeout, buffered output,
// and the sandbox command guard. Non-zero exit = error. Commands are never run
// through a shell unless shell metacharacters require it.
// ───────────────────────────────────────────────────────────────────────────

const { getWorkspaceRoot, checkCommand } = require('../tools/sandbox')
const { runCommand } = require('../tools/exec')

const MAX_REPAIR_ROUNDS = 3
const RUN_TIMEOUT_MS = 60000
const MAX_ERROR_OUTPUT = 8000

// File-change tools that should trigger a lint/test re-check.
const FILE_TOOLS = new Set([
  'write_file', 'edit_file', 'apply_patch', 'delete_file',
  'create_or_update_file', 'push_files',
])

// Default lint/test commands, auto-detected from the project type when the user
// has not configured explicit `lint_command` / `test_command` settings.
const DEFAULTS = {
  node: {
    lint: ['npm run lint'],
    test: ['npm test', 'npm run test'],
  },
  python: {
    lint: ['flake8', 'ruff check'],
    test: ['pytest', 'python -m pytest', 'python -m unittest discover'],
  },
  rust: {
    lint: ['cargo clippy'],
    test: ['cargo test'],
  },
  go: {
    lint: ['golint'],
    test: ['go test ./...'],
  },
  java: {
    lint: ['mvn checkstyle:check', 'gradle check'],
    test: ['mvn test', 'gradle test'],
  },
}

function detectProjectType(rootDir) {
  try {
    const fs = require('fs'), path = require('path')
    if (fs.existsSync(path.join(rootDir, 'package.json'))) return 'node'
    if (fs.existsSync(path.join(rootDir, 'requirements.txt')) || fs.existsSync(path.join(rootDir, 'pyproject.toml'))) return 'python'
    if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) return 'rust'
    if (fs.existsSync(path.join(rootDir, 'go.mod'))) return 'go'
    if (fs.existsSync(path.join(rootDir, 'pom.xml')) || fs.existsSync(path.join(rootDir, 'build.gradle'))) return 'java'
  } catch {}
  return null
}

// Whether a tool name is a file-change tool that should trigger a re-check.
function shouldRunOnTool(toolName) {
  return FILE_TOOLS.has(String(toolName || ''))
}

// Split a command string into [program, args[]] without invoking a shell.
function splitCmd(cmd) {
  const parts = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  return [parts[0], parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''))]
}

// Run a single command. Returns { ok, output, exitCode, timedOut }.
// Non-zero exit code or a timeout => ok=false. Errors are captured, not thrown.
async function runOne(cmd, cwd, timeoutMs) {
  const guard = checkCommand(cmd)
  if (!guard.ok) return { ok: false, output: `[blocked by sandbox] ${guard.reason}`, exitCode: null, timedOut: false }

  const needsShell = /[|&;`$(){}!\\]/.test(cmd)
  const [prog, args] = splitCmd(cmd)
  const result = needsShell
    ? await runCommand('cmd.exe', ['/c', cmd], { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024, shell: true })
    : await runCommand(prog, args, { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 })

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim().slice(0, MAX_ERROR_OUTPUT)
  const exitCode = result.exitCode ?? -1
  return { ok: exitCode === 0 && !result.timedOut, output, exitCode, timedOut: !!result.timedOut }
}

// Resolve the effective lint command for a workspace.
// Prefers the user-configured `lint_command` setting; falls back to defaults.
function resolveLintCommand(db, root, projectType) {
  try {
    const custom = db && typeof db.getSetting === 'function' ? db.getSetting('lint_command') : null
    if (custom && String(custom).trim()) return String(custom).trim()
  } catch {}
  const defaults = DEFAULTS[projectType]?.lint
  if (defaults && defaults.length) return defaults[0]
  return null
}

// Resolve the effective test command for a workspace.
// Prefers the user-configured `test_command` setting; falls back to defaults.
function resolveTestCommand(db, root, projectType) {
  try {
    const custom = db && typeof db.getSetting === 'function' ? db.getSetting('test_command') : null
    if (custom && String(custom).trim()) return String(custom).trim()
  } catch {}
  const defaults = DEFAULTS[projectType]?.test
  if (defaults && defaults.length) return defaults[0]
  return null
}

// Run both lint and test (if configured). Never throws — returns a result.
//
// Returns:
//   { ok, errors, lint, test }
//   ok: true if no errors (or neither command was available)
//   errors: array of { kind: 'lint'|'test', command, output, exitCode }
async function check({ db, sessionId, onStatus } = {}) {
  const root = getWorkspaceRoot(sessionId)
  if (!root) return { ok: true, errors: [], lint: null, test: null }

  const projectType = detectProjectType(root)
  const lintCmd = resolveLintCommand(db, root, projectType)
  const testCmd = resolveTestCommand(db, root, projectType)

  const lint = lintCmd
    ? await runOne(lintCmd, root, RUN_TIMEOUT_MS)
    : { ok: true, output: null, exitCode: null, timedOut: false }
  const test = testCmd
    ? await runOne(testCmd, root, RUN_TIMEOUT_MS)
    : { ok: true, output: null, exitCode: null, timedOut: false }

  const errors = []
  if (lintCmd && !lint.ok) {
    errors.push({ kind: 'lint', command: lintCmd, output: lint.output || '(no output)', exitCode: lint.exitCode, timedOut: lint.timedOut })
  }
  if (testCmd && !test.ok) {
    errors.push({ kind: 'test', command: testCmd, output: test.output || '(no output)', exitCode: test.exitCode, timedOut: test.timedOut })
  }

  try {
    if (errors.length) onStatus?.({ kind: 'lint_test_error', text: `⚠ 检测到 ${errors.length} 个 lint/test 错误` })
    else if (lintCmd || testCmd) onStatus?.({ kind: 'lint_test_ok', text: '✓ lint/test 通过' })
  } catch {}

  return { ok: errors.length === 0, errors, lint, test }
}

// Build the context block to inject into the conversation so the model can fix
// the reported errors. `round` is the current repair attempt (1-based).
// Desktop polish #3: when `changedFiles` is provided, narrow the injected
// output to lines mentioning those files — the model sees only errors relevant
// to what it just touched, not the whole test run.
function buildRepairContext({ errors, round, changedFiles }, maxRounds = MAX_REPAIR_ROUNDS) {
  if (!errors || !errors.length) return null
  const lines = []
  const narrow = Array.isArray(changedFiles) && changedFiles.length > 0
  lines.push(`[自动检查发现 ${errors.length} 个 lint/test 错误 (第 ${round}/${maxRounds} 轮修复)]`)
  if (narrow) {
    lines.push(`[仅显示与本次修改文件相关的错误: ${changedFiles.slice(0, 8).join(', ')}${changedFiles.length > 8 ? ' …' : ''}]`)
  }
  for (const e of errors) {
    lines.push(`\n--- ${e.kind === 'lint' ? 'Lint' : 'Test'} 失败: ${e.command}${e.timedOut ? ' (超时)' : ''} ---`)
    const raw = e.output || '(无输出)'
    if (!narrow) {
      lines.push(raw)
    } else {
      // 只保留命中 changedFiles 的行(±1 行上下文), 其余折叠计数
      const rows = raw.split('\n')
      const kept = []
      let skipped = 0
      const isErrorLine = (l) => /^\s*(FAIL|PASS|ERROR|error|Error|npm ERR|×|✗|✓|\d+ error|\d+ warning)/.test(l)
      for (let i = 0; i < rows.length; i++) {
        const hit = changedFiles.some((f) => rows[i].includes(f))
        if (hit) {
          if (skipped > 0) { kept.push(`… (省略 ${skipped} 行无关输出)`); skipped = 0 }
          kept.push(rows[i])
          // 带上下一行详情(常见于 "file:line:col: error" 后跟说明), 但跳过
          // 以错误标记开头的行(它们是下一处错误, 不应被吞)
          if (i + 1 < rows.length && !isErrorLine(rows[i + 1])) kept.push(rows[i + 1])
        } else {
          skipped++
        }
      }
      if (skipped > 0 && kept.length > 0) kept.push(`… (省略 ${skipped} 行无关输出)`)
      if (kept.length === 0) {
        lines.push(`(无命中修改文件的错误行 — 全量输出 ${rows.length} 行已折叠)`)
      } else {
        lines.push(kept.join('\n'))
      }
    }
  }
  lines.push('\n请根据以上错误信息修复相关文件（使用 edit_file / write_file）。修复后会自动重新运行 lint/test 验证。')
  return lines.join('\n')
}

// 获取当前 git 工作区已修改的文件列表（相对路径）。非 git 仓库 → []。
function getChangedFiles(root) {
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    return String(out || '').split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

// Orchestrates a single lint/test check and returns the context to inject
// (or null if clean). This is the entry toolLoop calls after file changes.
//
// Desktop polish #3: the repair context is narrowed to errors mentioning the
// currently-modified files (git diff --name-only), so the model sees only what
// it touched. Non-git workspaces fall back to the full output.
//
// Returns: { repaired: boolean, context: string|null, errors, round }
async function runLintAndRepair({ db, sessionId, round = 1, onStatus } = {}) {
  const result = await check({ db, sessionId, onStatus })
  if (result.ok) return { repaired: true, context: null, errors: [], round }
  const changedFiles = getChangedFiles(getWorkspaceRoot(sessionId))
  const context = buildRepairContext({ errors: result.errors, round, changedFiles })
  return { repaired: false, context, errors: result.errors, round }
}

module.exports = {
  MAX_REPAIR_ROUNDS,
  FILE_TOOLS,
  shouldRunOnTool,
  check,
  runOne,
  buildRepairContext,
  runLintAndRepair,
  detectProjectType,
  resolveLintCommand,
  resolveTestCommand,
  splitCmd,
  getChangedFiles,
}