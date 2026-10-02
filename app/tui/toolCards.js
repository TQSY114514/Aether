// ─────────────────────────────────────────────────────────────────────────────
// toolCards.js — 工具调用卡（todo 3）：纯格式化助手（测试目标）
// reducer 存卡形 { name, status, summary, latencyMs }；App 渲染时用
// TOOL_STATUS 的状态色/标签。本模块 Electron-free、无 react 依赖，纯函数。
// isToolStart 语义收敛自 electron/tools/toolEntry.js（全库单一来源）。
// ─────────────────────────────────────────────────────────────────────────────
import { isToolStart } from '../electron/tools/toolEntry.js'

export { isToolStart }

export const TOOL_STATUS = {
  running: { color: 'yellow', label: 'RUN' },
  done: { color: 'green', label: 'OK' },
  error: { color: 'red', label: 'ERR' },
}

/**
 * 截断多行文本：超过 maxLines 行时保留前 maxLines 行并追加省略说明。
 * @param {unknown} text
 * @param {number} [maxLines]
 * @returns {string}
 */
export function truncateLines(text, maxLines = 80) {
  const s = String(text ?? '')
  const lines = s.split('\n')
  if (lines.length <= maxLines) return s
  return `${lines.slice(0, maxLines).join('\n')}\n… (${lines.length - maxLines} more lines)`
}

/**
 * 参数摘要：JSON 序列化，超长截断到 120 字符。
 * @param {unknown} args
 * @returns {string}
 */
export function summarizeArgs(args) {
  try {
    const s = JSON.stringify(args ?? {})
    return s.length > 120 ? `${s.slice(0, 117)}…` : s
  } catch {
    return String(args ?? '')
  }
}

/**
 * 原始 tool entry（cli.js:209-216 形状 { name, args, result, error, risk, latencyMs }）
 * → 卡形摘要。startedAt 有值且 result/error 均空 = running。
 * @param {object} [entry]
 * @returns {{ name: string, status: 'running'|'done'|'error', color: string, label: string, summary: string, latencyMs: number|null }}
 */
export function summarizeTool(entry = {}) {
  const isStart = isToolStart(entry)
  const status = isStart ? 'running' : entry.error ? 'error' : 'done'
  const meta = TOOL_STATUS[status] || TOOL_STATUS.done
  return {
    name: entry.name || 'tool',
    status,
    color: meta.color,
    label: meta.label,
    summary: entry.error
      ? truncateLines(String(entry.error), 5)
      : isStart
        ? summarizeArgs(entry.args)
        : truncateLines(entry.result, 80),
    latencyMs: typeof entry.latencyMs === 'number' ? entry.latencyMs : null,
  }
}

/**
 * 清除终端 ANSI 逃逸序列（用于纯文本日志、复制、折叠）。
 * @param {unknown} text
 * @returns {string}
 */
export function stripAnsi(text) {
  if (!text) return ''
  return String(text).replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g, '')
}

/**
 * 格式化 Warp 风格终端卡片块（用于 run_command 等执行工具输出卡片化）。
 * @param {object} [entry]
 * @returns {object|null}
 */
export function formatWarpBlock(entry = {}) {
  const isCmd = entry.name === 'run_command' || Boolean(entry.args && typeof entry.args === 'object' && entry.args.command)
  if (!isCmd) return null

  const isStart = isToolStart(entry)
  const args = (entry.args && typeof entry.args === 'object') ? entry.args : {}
  const command = String(args.command || entry.name)
  const cwd = args.cwd ? String(args.cwd) : ''

  const raw = entry.error ? String(entry.error) : String(entry.result ?? '')
  const clean = stripAnsi(raw)

  // RPC entry 不带独立 exitCode 字段——run_command 的退出状态以文本标记内嵌在
  // result 里（registry.js: [FAILED: exit N] / [TIMED OUT] / [COMMAND NOT FOUND]）。
  let exitCode = typeof entry.exitCode === 'number' ? entry.exitCode : (entry.error ? 1 : (entry.result != null ? 0 : null))
  if (exitCode == null || exitCode === 0) {
    // Anchor on the markers registry.js prepends. Scanning the whole output let a
    // command whose own stdout mentions "exit code: 1" render as failed.
    const m = raw.match(/\[FAILED:\s*exit\s+(-?\d+)/i)
    if (m && parseInt(m[1], 10) !== 0) exitCode = parseInt(m[1], 10)
    else if (/^\s*\[COMMAND NOT FOUND\]/im.test(raw)) exitCode = 127
    else if (/^\s*\[TIMED OUT\]/im.test(raw)) exitCode = 1
  }
  const status = isStart ? 'running' : exitCode === 0 && !entry.error ? 'done' : 'error'

  return {
    isCommand: true,
    command,
    cwd,
    status,
    exitCode,
    latencyMs: typeof entry.latencyMs === 'number' ? entry.latencyMs : null,
    cleanOutput: clean,
    summary: truncateLines(clean, 25),
  }
}

