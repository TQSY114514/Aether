// ─────────────────────────────────────────────────────────────────────────────
// recap.js — /recap 一行会话摘要的纯逻辑（W1-t14）
//   - buildRecapMessages：最近 N 条 user/assistant 消息 + 追加总结指令
//     （runAgent 的 messages 参数会整体替换 convo, prompt 被忽略——
//     agentCore.js:179-181, 指令必须作为最后一条 user 消息传入）
//   - buildRecapFallback：无模型/失败时 "前 N 条消息首行拼接" 回退
//   - resolveRecapKey：镜像 runSession.js envKeyFor/authKeyFor 的密钥回退
//     （runSession.js 为只读文件, 不导出这些私有函数, 此处按同语义复刻,
//     文档写明; 顺序: 环境变量 <PROVIDER>_API_KEY → AETHER_API_KEY →
//     auth.json 持久化密钥）
// Electron-free：只依赖 authStore（无 electron）。
// ─────────────────────────────────────────────────────────────────────────────
import { loadAuthKeys } from './authStore.js'

// 单发摘要的总结指令（低 token, 与桌面 PreCompact 摘要风格一致）
export const RECAP_INSTRUCTION = '用一句话概括当前会话的进展、当前状态与未决问题（≤80 字, 保留文件路径等标识符原样）。'

/**
 * 取最近 maxCount 条 user/assistant 消息（API 形状 {role, content}）, 并追加
 * 总结指令作为最后一条 user 消息（runAgent messages 整体替换语义）。
 * @param {Array<{role:string,text:string}>} messages
 * @param {number} [maxCount]
 * @returns {Array<{role:string,content:string}>}
 */
export function buildRecapMessages(messages, maxCount = 10) {
  const ua = Array.isArray(messages) ? messages.filter((m) => m.role === 'user' || m.role === 'assistant') : []
  const tail = ua.slice(-Math.max(1, maxCount))
  return [
    ...tail.map((m) => ({ role: m.role, content: String(m.text || '') })),
    { role: 'user', content: RECAP_INSTRUCTION },
  ]
}

/**
 * 回退摘要：最近 ≤maxLines 条消息各取首行拼接（"第一行"= 首个换行前）。
 * @param {Array<{role:string,text:string}>} messages
 * @param {number} [maxLines]
 * @returns {string}  空会话 → ''
 */
export function buildRecapFallback(messages, maxLines = 5) {
  if (!Array.isArray(messages) || !messages.length) return ''
  const lines = messages
    .slice(-Math.max(1, maxLines))
    .map((m) => {
      const t = String(m && m.text || '')
      const first = t.split('\n')[0] || ''
      return first.trim()
    })
    .filter(Boolean)
  return lines.join(' | ')
}

/**
 * 状态栏展示截断（约 120 字符, 超出加 …）。
 * @param {string} text
 * @param {number} [maxChars]
 */
export function truncateRecap(text, maxChars = 120) {
  const s = String(text || '').trim()
  if (s.length <= maxChars) return s
  return `${s.slice(0, maxChars)}…`
}

/**
 * 密钥回退（镜像 runSession.js envKeyFor/authKeyFor, 文档写明）。
 * @param {{name:string, api_key:string|null}} provider
 * @returns {string|null}
 */
export function resolveRecapKey(provider) {
  if (!provider) return null
  if (provider.api_key) return provider.api_key
  const name = String(provider.name || '').trim()
  if (!name) return process.env.AETHER_API_KEY || null
  const norm = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const fromEnv = process.env[`AETHER_API_KEY_${norm}`] || process.env[`${norm}_API_KEY`] || process.env.AETHER_API_KEY
  if (fromEnv) return fromEnv
  try {
    const keys = loadAuthKeys()
    if (!keys) return null
    return (name && keys[name]) || keys['*'] || null
  } catch {
    return null
  }
}
