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
