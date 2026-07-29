// ───────────────────────────────────────────────────────────────────────────
// Mixture of Agents (MoA) — 并行 fan-out 多个参考模型,综合建议后注入 aggregator。
//
// 借鉴自 Hermes-Agent 的 moa_loop.py。MoA 是 per-turn 增强:
//   1. 并行调 N 个 reference model(纯顾问,不能调工具,tool result 截断到 4000 字符)
//   2. 把各 reference output 拼成 guidance block
//   3. guidance block prepend 到 aggregator 的 user message
//   4. aggregator 正常走 toolLoop(它是真正 act 的模型)
//
// 每个 reference 独立计费。隐私:reference output 不含敏感信息(走 toolResultMiddleware)。
// ───────────────────────────────────────────────────────────────────────────

const { completeChatMessage } = require('./providerAdapter')
const { applyMiddleware } = require('./toolResultMiddleware')
const { computeCost } = require('../utils/cost')
const log = require('../logger')

const REFERENCE_TOOL_RESULT_BUDGET = 4000
const REFERENCE_SYSTEM_PROMPT = `You are an advisor model in a Mixture-of-Agents pipeline. Analyze the conversation and provide concise, actionable guidance. You cannot execute tools — only analyze and advise. Focus on the key points that would help the aggregator model produce a better response. Be brief and specific.`

// 并行运行所有 reference model,返回 guidance string。
// references_config: [{ provider_id, model_id }] (解析后含 provider + model 对象)
async function runReferences({ references, messages, signal, db, sessionId }) {
  if (!references || references.length === 0) return ''

  // 裁剪 tool result 到 budget 字符,保留 tool call 全文(cheap + high-signal)
  const trimmedMessages = messages.map(m => {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > REFERENCE_TOOL_RESULT_BUDGET) {
      return { ...m, content: m.content.slice(0, REFERENCE_TOOL_RESULT_BUDGET) + '\n[…truncated…]' }
    }
    return m
  })

  const systemIdx = trimmedMessages.findIndex(m => m.role === 'system')
  const refMessages = [
    { role: 'system', content: REFERENCE_SYSTEM_PROMPT },
    ...trimmedMessages.filter(m => m.role !== 'system'),
  ]

  const results = await Promise.allSettled(
    references.map(async (ref) => {
      try {
        const result = await completeChatMessage({
          provider: ref.provider,
          model: ref.model,
          messages: refMessages,
          signal,
          options: { max_tokens: 1024 },
        })
        // 计费
        if (result.usage && db) {
          try {
            const cost = computeCost(ref.model, result.usage)
            db.logUsage({
              session_id: sessionId,
              provider_id: ref.provider.id,
              provider_name: ref.provider.name,
              model_name: ref.model.model_name,
              prompt_tokens: result.usage.prompt_tokens || 0,
              completion_tokens: result.usage.completion_tokens || 0,
              total_tokens: result.usage.total_tokens || 0,
              cache_read_tokens: result.usage.cache_read_tokens || 0,
              cache_creation_tokens: result.usage.cache_creation_tokens || 0,
              cost,
              source: 'moa_reference',
            })
          } catch {}
        }
        return { model_name: ref.model.display_name || ref.model.model_name, content: result.content || '' }
      } catch (e) {
        log.debug('MoA reference failed:', ref.model?.model_name, e?.message)
        return null
      }
    })
  )

  const outputs = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
    .filter(r => r.content && r.content.trim())

  if (outputs.length === 0) return ''

  // 拼成 guidance block
  const guidance = outputs.map(o => `[Advisor (${o.model_name})]: ${o.content}`).join('\n\n')
  return `\n\n--- MoA Advisor Guidance ---\n${guidance}\n--- End Guidance ---\n\nBased on the above advisor guidance, provide the best response:`
}

// 解析 moa:// 模型名,返回 preset 配置。
// 格式: moa://<preset_id> 或 moa://<preset_name>
async function resolveMoaPreset(modelName, db) {
  const match = /^moa:\/\/(.+)$/.exec(modelName)
  if (!match) return null
  const key = match[1]

  const presets = db.getMoaPresets()
  const preset = presets.find(p => String(p.id) === key || p.name === key)
  if (!preset) return null

  const aggregatorModel = db.getModel(preset.aggregator_model_id)
  if (!aggregatorModel) return null
  const aggregatorProvider = db.getProvider(aggregatorModel.provider_id)
  if (!aggregatorProvider) return null

  let references_config = []
  try { references_config = JSON.parse(preset.references_config) } catch {}

  const references = references_config.map(rc => {
    const model = db.getModel(rc.model_id)
    if (!model) return null
    const provider = db.getProvider(model.provider_id)
    if (!provider) return null
    return { provider, model }
  }).filter(Boolean)

  return {
    preset,
    aggregator: { provider: aggregatorProvider, model: aggregatorModel },
    references,
  }
}

// 检查是否 MoA 模型,如果是,运行 reference fan-out 并返回 guidance。
// 返回 null 表示非 MoA 模型,正常走原流程。
async function maybeRunMoA({ modelName, messages, signal, db, sessionId }) {
  if (!/^moa:\/\//.test(modelName)) return null

  const moaConfig = await resolveMoaPreset(modelName, db)
  if (!moaConfig) {
    log.warn('MoA preset not found for:', modelName)
    return null
  }

  const guidance = await runReferences({
    references: moaConfig.references,
    messages,
    signal,
    db,
    sessionId,
  })

  return { guidance, aggregator: moaConfig.aggregator }
}

module.exports = { runReferences, resolveMoaPreset, maybeRunMoA, REFERENCE_SYSTEM_PROMPT }
