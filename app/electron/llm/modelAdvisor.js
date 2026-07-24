// ───────────────────────────────────────────────────────────────────────────
// Model Advisor — suggests the best model for a given request.
//
// Inspired by Claude Code's model selection logic: match the task to the
// right-sized model to save cost and latency.
//
// Heuristics (in order of priority):
//   1. User has explicitly selected a model → use it (already resolved in
//      chat.handler before we get here).
//   2. Tools are enabled → prefer a reasoning-capable model (Claude, o-series).
//   3. Simple greeting / chitchat → fastest available model.
//   4. Complex multi-step → strongest model.
//   5. Coding task → model with coding ELO score.
// ───────────────────────────────────────────────────────────────────────────

const { reasoningFamily } = require('./reasoning')

// Model capability hints.
const REASONING_FAMILIES = new Set(['openai', 'claude', 'deepseek', 'qwen'])
const FAST_FAMILIES = new Set(['openai']) // o-series are fast + capable

function suggestModel({ allModels, userMessage, useTools, intent }) {
  if (!allModels || !allModels.length) return null

  const text = String(userMessage || '').toLowerCase()
  const isComplex = /implement|refactor|build|create.*from|analyze.*fix|migrate|rewrite|build.*app|write.*code|debug|fix.*bug/i.test(text)
  const isCoding = intent === 'coding' || /代码|编程|python|javascript|function|class |import |debug|compile|error|git/i.test(text)
  const isSimple = /^(hi|hello|hey|你好|嗨|hey|yo)[\s!！.。]*$/i.test(text.trim()) || text.length < 20

  // When tools are on, prefer a reasoning-capable model.
  if (useTools) {
    const reasoning = allModels.filter(m => REASONING_FAMILIES.has(reasoningFamily(m.model_name)))
    if (reasoning.length > 0) return reasoning[0]
  }

  // Coding tasks → prefer coding-scored models.
  if (isCoding && !isComplex) {
    const coding = allModels.filter(m => /claude|gpt|deepseek|qwen/i.test(m.model_name))
    if (coding.length > 0) return coding[0]
  }

  // Simple chitchat → fastest model.
  if (isSimple && !useTools) {
    return allModels[0]
  }

  // Complex → strongest.
  if (isComplex) {
    const strong = allModels.filter(m => /claude|gpt-4|gpt-5|o[134]/i.test(m.model_name))
    if (strong.length > 0) return strong[0]
  }

  return null
}

module.exports = { suggestModel }
