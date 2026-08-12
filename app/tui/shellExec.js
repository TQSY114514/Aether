// ─────────────────────────────────────────────────────────────────────────────
// shellExec.js — W3-t19: !shell 纯助手（Electron-free, 无新依赖）
//   parseShellLine(input)        '!cmd args' → {command, rest, line}; 非 '!' 开头
//                               或 '!!'（转义）→ null
//   isBlockedShellCommand(cmd)   sandbox.js 破坏性模式镜像（BLOCKED_COMMAND_PATTERNS,
//                               只读源 app/electron/tools/sandbox.js; 与 run_command
//                               同规则, !shell 不裸奔）
//   formatShellContext(...)      [shell: !cmd] 上下文块（注入 user 消息用）
//   truncateOutput(text, max)    输出截断 8KB + '… (truncated)' 标注
//   formatRecentShellContext()   最近 shell 块 → 下次提交前置注入（模型可见）
// 标记格式（文档写入 AGENTS/README 语义）:
//   [shell: !cmd]\n<output>\n[/shell]
// W4 钩子: isBlockedShellCommand 接受可选 denyCheck(命令字符串) → 布尔/原因,
// 届时把 deny 规则接入点放在此处（当前实现仅镜像破坏性 blocklist）。
// ─────────────────────────────────────────────────────────────────────────────

// ── 破坏性命令模式镜像（源: app/electron/tools/sandbox.js BLOCKED_COMMAND_PATTERNS）──
// 注意: 此列表是 sandbox.js 只读源的镜像副本。修改 sandbox.js 后必须同步此表。
// 镜像范围 = 破坏性 blocklist; sandbox 的 SAFE_COMMAND_WHITELIST 不镜像——
// !shell 是用户显式执行自己的命令, 不套白名单（计划: 仅拦截破坏性模式）。
const BLOCKED_COMMAND_PATTERNS = [
  /\bformat\b\s+[a-z]:/i, /\bformat\b\s+\/fs/i, /\/dev\/(?:sd|nvme|hd)/i,
  /\bdiskpart\b/i, /\brm\s+-rf\s+(?:\/|\/[a-z]+\s|~|C:\\windows|C:\\users\\[^/\\]+\\desktop)/i,
  /\brmdir\s+\/s\b/i, /\bdel\s+\/[fsq]/i,
  /\bshutdown\b/i, /\bshutdown\.exe\b/i, /\breboot\b/i, /\breboot\.exe\b/i, /\bhalt\b/i,
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(?:sh|bash|powershell|cmd|pwsh)\b/i,
  /\breg\s+delete\s+.*\/f\b/i, /\bchmod\s+-R\s+777\s+\//i,
  /\bSET\s+PATH\s*=/i, /\bNODE_OPTIONS\s*=/i,
]

// sandbox.js 同款分段: 按 & | ; 切段后逐段查（镜像 checkCommand 语义）
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

/**
 * 破坏性命令拦截（sandbox.js 破坏性 blocklist 镜像）。
 * @param {string} command  '!' 后的完整命令文本
 * @param {(cmd: string) => {ok: boolean, reason?: string} | boolean | string | null} [denyCheck]
 *   W4 钩子: deny 规则检查点（插件点）。返回 {ok:false,reason} / false / 原因字符串 →
 *   拒绝; null/undefined/true/{ok:true} → 放行。
 * @returns {{ok: boolean, reason?: string}}
 */
export function isBlockedShellCommand(command, denyCheck) {
  const c = String(command || '')
  if (!c.trim()) return { ok: false, reason: 'empty command' }
  const checkAll = (text) => {
    for (const re of BLOCKED_COMMAND_PATTERNS) {
      if (re.test(text)) return re
    }
    return null
  }
  if (checkAll(c)) return { ok: false, reason: 'blocked by sandbox' }
  for (const seg of splitCommandSegments(c)) {
    if (checkAll(seg)) return { ok: false, reason: 'blocked by sandbox' }
  }
  // ── W4 deny 规则钩子（插件点）: 届时在此接入 permission deny 规则 ──
  if (typeof denyCheck === 'function') {
    const r = denyCheck(c)
    if (r === false || (r && typeof r === 'object' && r.ok === false)) {
      return { ok: false, reason: (r && r.reason) || 'denied by rule' }
    }
    if (typeof r === 'string' && r) return { ok: false, reason: r }
  }
  return { ok: true }
}

/**
 * 解析 '!' 开头的 shell 输入。
 * @param {string} input
 * @returns {{command: string, rest: string, line: string} | null}
 *   command = 首个词（命令名, 展示/拦截用）; rest = 其余参数;
 *   line = '!' 后完整文本（执行用, execFile 的 /c 参数）;
 *   '!!' 开头视为转义（普通文本）→ null; 非 '!' 开头 → null。
 */
export function parseShellLine(input) {
  const text = String(input || '')
  if (!text.startsWith('!') || text.startsWith('!!')) return null
  const line = text.slice(1).trim()
  if (!line) return null
  const sp = line.search(/\s/)
  const command = sp === -1 ? line : line.slice(0, sp)
  const rest = sp === -1 ? '' : line.slice(sp + 1).trim()
  return { command, rest, line }
}

/**
 * [shell: !cmd] 上下文块（与 fileRef 的 [file: @path] 块同模式）。
 * @param {string} command
 * @param {string} output
 * @param {number|string} exitCode
 * @returns {string}  形如 '\n\n[shell: !cmd]\n<output>\n[/shell]\n'
 */
export function formatShellContext(command, output, exitCode) {
  return `\n\n[shell: !${String(command || '')}]\n${String(output || '')}\n[/shell] (exit ${exitCode})\n`
}

/**
 * 输出截断: 超过 max 字符 → 保留前 max 字符 + '… (truncated)' 标注。
 * @param {string} text
 * @param {number} [max]
 */
export function truncateOutput(text, max = 8000) {
  const s = String(text || '')
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n… (truncated)`
}

/**
 * 最近 shell 块 → 下次提交时前置注入的上下文前缀。
 * 实现: 取缓冲内（最多 SHELL_CONTEXT_MAX 条, 合计 ≤8KB）块的格式化拼接。
 * @param {Array<{command: string, output: string, exitCode: number|string}>} recent
 * @returns {string}  空缓冲 → ''
 */
export const SHELL_CONTEXT_MAX = 3

export function formatRecentShellContext(recent) {
  const list = Array.isArray(recent) ? recent.slice(-SHELL_CONTEXT_MAX) : []
  let total = 0
  const blocks = []
  for (const b of list) {
    const block = formatShellContext(b.command, truncateOutput(b.output, 4000), b.exitCode)
    total += block.length
    if (total > 8000) break
    blocks.push(block)
  }
  return blocks.join('').trim()
}
