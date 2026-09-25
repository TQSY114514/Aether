// ───────────────────────────────────────────────────────────────────────────
// toolLoop/runtime.js — Model Stream & Invocation Runtime Driver.
//
// Handles completeChatMessage invocation, thinking delta streaming, abort
// signal coordination, and token accounting for the agent loop.
// ───────────────────────────────────────────────────────────────────────────

const { completeChatMessage, normalizeUsage } = require('../providerAdapter')
const { computeCost } = require('../../utils/cost')
const log = require('../../logger')

class RuntimeDriver {
  /**
   * @param {object} options
   * @param {object} options.provider
   * @param {object} options.model
   * @param {object} [options.db]
   * @param {string|number} [options.sessionId]
   * @param {AbortSignal} [options.signal]
   * @param {Function} [options.onThinkingStart]
   * @param {Function} [options.onThinkingDelta]
   * @param {Function} [options.onThinkingEnd]
   * @param {Function} [options.onStreamDelta]
   */
  constructor(options = {}) {
    this.provider = options.provider
    this.model = options.model
    this.db = options.db
    this.sessionId = options.sessionId
    this.signal = options.signal
    this.onThinkingStart = options.onThinkingStart
    this.onThinkingDelta = options.onThinkingDelta
    this.onThinkingEnd = options.onThinkingEnd
    this.onStreamDelta = options.onStreamDelta
  }

  /**
   * Execute one LLM completion round.
   * @param {Array<object>} convo - Conversation history messages
   * @param {Array<object>} toolPayload - Tool specifications
   * @param {object} [extraOptions]
   * @returns {Promise<object>} Model response message { role, content, tool_calls, reasoning, usage }
   */
  async next(convo, toolPayload = [], extraOptions = {}) {
    let hasStreamedThinking = false

    try {
      this.onThinkingStart?.()
    } catch {}

    const callOpts = {
      tools: toolPayload.length ? toolPayload : undefined,
      ...extraOptions,
      onThinkingDelta: (delta) => {
        if (delta) hasStreamedThinking = true
        try { this.onThinkingDelta?.(delta) } catch {}
      },
      onStreamDelta: (delta) => {
        try { this.onStreamDelta?.(delta) } catch {}
      },
    }

    try {
      const resp = await completeChatMessage({
        provider: this.provider,
        model: this.model,
        messages: convo,
        signal: this.signal,
        options: callOpts,
      })

      if (resp?.reasoning && !hasStreamedThinking) {
        try { this.onThinkingDelta?.(resp.reasoning) } catch {}
      }
      try { this.onThinkingEnd?.() } catch {}

      this._accountUsage(resp?.usage, 200)
      return resp
    } catch (err) {
      try { this.onThinkingEnd?.() } catch {}
      this._accountUsage(null, err?.status || 500)
      throw err
    }
  }

  _accountUsage(rawUsage, status = 200) {
    if (!this.db || !this.sessionId || !this.model) return
    try {
      const u = normalizeUsage(rawUsage)
      const cost = u ? computeCost(this.model, u) : 0
      this.db.logUsage?.({
        session_id: this.sessionId,
        provider_id: this.provider?.id || null,
        provider_name: this.provider?.name || null,
        model_name: this.model?.model_name || this.model?.id || 'unknown',
        prompt_tokens: u?.prompt_tokens || 0,
        completion_tokens: u?.completion_tokens || 0,
        total_tokens: u?.total_tokens || 0,
        cost,
        latency_ms: 0,
        status,
        source: 'agent',
      })
    } catch (e) {
      log.warn('RuntimeDriver: failed to log usage:', e?.message)
    }
  }
}

module.exports = {
  RuntimeDriver,
}
