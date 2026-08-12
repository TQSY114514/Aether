// ─────────────────────────────────────────────────────────────────────────────
// contextInfo.js — /context 上下文占用展示的纯逻辑（W1-t11）
//
// token 估算器选择（文档写明）：复用桌面 compaction 引擎的 ./tokenizer
// （app/electron/llm/tokenizer.js, Electron-free 审计见 compact.js 文件头）。
//   - 导出 countTokens(text, provider, model)：OpenAI 系模型走 js-tiktoken
//     cl100k_base 精确计数（js-tiktoken 未安装时内部回退字符估算, tokenizer.js
//     getEncoding try/catch）; Anthropic/未知 provider 走 CJK-aware 字符估算
//     （CJK ≈1.5 token/字, 其余 ≈0.25, tokenizer.js countTokensFallback）。
//   - 与桌面 compaction 同一估算器 → 不引入第二套（计划要求, 防漂移）。
// 本模块只做薄封装：空文本 → 0（fallback 对空串返回 1, 展示场景需要 0）。
// ─────────────────────────────────────────────────────────────────────────────
import tok from '../electron/llm/tokenizer.js'

/**
 * 估算单条文本的 token 数。空文本/非字符串 → 0。
 * provider/model 传入时对 OpenAI 系模型启用精确计数（自动回退）。
 * @param {string} text
 * @param {string|null} [provider]
 * @param {string|null} [model]
 * @returns {number}
 */
export function estimateTokens(text, provider = null, model = null) {
  if (text == null || String(text) === '') return 0
  try {
    const n = tok.countTokens(String(text), provider || undefined, model || undefined)
    return Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : 0
  } catch {
    return 0
  }
}

/**
 * 估算一批消息的总 token（只统计 user/assistant 文本——与 runSession 落库
 * 语义一致; system 行是界面提示, 不占模型上下文）。
 * @param {Array<{role:string,text:string}>} messages
 * @param {string|null} [provider]
 * @param {string|null} [model]
 */
export function estimateMessagesTokens(messages, provider = null, model = null) {
  if (!Array.isArray(messages)) return 0
  return messages.reduce((s, m) => {
    if (m && (m.role === 'user' || m.role === 'assistant')) s += estimateTokens(m.text, provider, model)
    return s
  }, 0)
}

/**
 * 组装 /context 展示行（纯函数）。
 * @param {object} p
 * @param {number} p.messageCount  user/assistant 消息条数
 * @param {number} p.estTokens      估算 token
 * @param {number|null} p.contextLimit  模型 context_window; null → '—'
 * @param {{input:number,output:number}} [p.usage]
 * @param {string|null} [p.modelName]
 * @returns {string}  如 "messages: 12 · est: 3480 tokens / limit: 128000 (3%) · used in/out: 1000/2200"
 */
export function buildContextLine({ messageCount, estTokens, contextLimit, usage = { input: 0, output: 0 }, modelName = null }) {
  const msgs = Number.isFinite(messageCount) ? messageCount : 0
  const est = Number.isFinite(estTokens) ? Math.max(0, Math.floor(estTokens)) : 0
  const limit = contextLimit && Number.isFinite(contextLimit) && contextLimit > 0 ? contextLimit : null
  const pct = limit && limit > 0 ? Math.min(999, Math.round((est / limit) * 100)) : null
  const u = usage || {}
  const inTok = Number.isFinite(u.input) ? u.input : 0
  const outTok = Number.isFinite(u.output) ? u.output : 0
  const limitPart = limit != null ? `${limit.toLocaleString('en-US')} (${pct}%)` : '—'
  const modelPart = modelName ? ` · model: ${modelName}` : ''
  return `context: messages: ${msgs} · est: ${est.toLocaleString('en-US')} tokens / limit: ${limitPart} · used in/out: ${inTok}/${outTok}${modelPart}`
}
