import { describe, it, expect } from 'vitest'
import {
  reasoningFamily,
  buildReasoningParams,
  supportsReasoning,
  isBinaryReasoning,
} from '../electron/llm/reasoning'

describe('reasoningFamily', () => {
  it('identifies OpenAI models', () => {
    expect(reasoningFamily('o1-mini')).toBe('openai')
    expect(reasoningFamily('o3-mini')).toBe('openai')
    expect(reasoningFamily('gpt-5-preview')).toBe('openai')
  })

  it('identifies Claude models', () => {
    expect(reasoningFamily('claude-3-7-sonnet')).toBe('claude')
    expect(reasoningFamily('claude-opus-4')).toBe('claude')
  })

  it('identifies DeepSeek reasoning models while excluding coders', () => {
    expect(reasoningFamily('deepseek-r1')).toBe('deepseek')
    expect(reasoningFamily('deepseek_reasoner')).toBe('deepseek')
    expect(reasoningFamily('deepseek-coder')).toBe('none')
  })

  it('identifies Qwen thinking/reasoning models', () => {
    expect(reasoningFamily('qwq-32b-preview')).toBe('qwen')
    expect(reasoningFamily('qwen-plus-thinking')).toBe('qwen')
    expect(reasoningFamily('qwen3-72b')).toBe('qwen')
  })

  it('identifies Gemini models with thinking while excluding non-thinking models', () => {
    expect(reasoningFamily('gemini-2.0-flash-thinking-exp')).toBe('gemini')
    expect(reasoningFamily('gemini-2.5-pro')).toBe('gemini')
    expect(reasoningFamily('gemini-3-flash-preview')).toBe('gemini')
    expect(reasoningFamily('gemini-2.0-flash')).toBe('none')
    expect(reasoningFamily('gemini-2.0-flash-lite')).toBe('none')
  })

  it('identifies Hermes models', () => {
    expect(reasoningFamily('deephermes-3-llama-3-8b')).toBe('hermes')
    expect(reasoningFamily('hermes-3-llama-3.1-405b')).toBe('hermes')
    expect(reasoningFamily('hermes-4-preview')).toBe('hermes')
    expect(reasoningFamily('nous-hermes-2-mixtral')).toBe('hermes')
  })

  it('returns none for non-reasoning models', () => {
    expect(reasoningFamily('gpt-4o')).toBe('none')
    expect(reasoningFamily('llama-3.3-70b')).toBe('none')
  })
})

describe('buildReasoningParams', () => {
  it('builds OpenAI reasoning_effort', () => {
    expect(buildReasoningParams('o1-mini', 'high', true)).toEqual({ reasoning_effort: 'high' })
    expect(buildReasoningParams('o1-mini', 'low', true)).toEqual({ reasoning_effort: 'low' })
    expect(buildReasoningParams('o1-mini', 'medium', false)).toEqual({})
    expect(buildReasoningParams('o1-mini', 'invalid', true)).toEqual({ reasoning_effort: 'medium' })
  })

  it('builds Claude effort + budget_tokens and clamps to max_tokens', () => {
    const res = buildReasoningParams('claude-3-7-sonnet', 'medium', true)
    expect(res.reasoning_effort).toBe('medium')
    expect(res.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
    expect(buildReasoningParams('claude-3-7-sonnet', 'medium', false)).toEqual({})

    // Clamps when maxTokens is smaller than default budget
    const clamped = buildReasoningParams('claude-3-7-sonnet', 'high', true, { maxTokens: 4000 })
    expect(clamped.thinking.budget_tokens).toBe(3999)
  })

  it('builds DeepSeek explicit on/off', () => {
    expect(buildReasoningParams('deepseek-r1', 'high', true)).toEqual({ thinking: { type: 'enabled' } })
    expect(buildReasoningParams('deepseek-r1', 'high', false)).toEqual({ thinking: { type: 'disabled' } })
  })

  it('builds Qwen enable_thinking and budget', () => {
    const onRes = buildReasoningParams('qwq-32b-preview', 'low', true)
    expect(onRes.enable_thinking).toBe(true)
    expect(onRes.thinking_budget).toBe(2048)
    expect(buildReasoningParams('qwq-32b-preview', 'low', false)).toEqual({ enable_thinking: false })
  })

  it('builds Gemini thinking_config', () => {
    const onRes = buildReasoningParams('gemini-2.0-flash-thinking-exp', 'medium', true)
    expect(onRes.thinking_config).toEqual({ thinking_budget: 4096 })
    expect(onRes.reasoning_effort).toBe('medium')
    expect(buildReasoningParams('gemini-2.0-flash-thinking-exp', 'medium', false)).toEqual({
      thinking_config: { thinking_budget: 0 },
    })
  })

  it('builds Hermes params with budget, reasoning effort, and disabled state', () => {
    const onRes = buildReasoningParams('deephermes-3', 'medium', true)
    expect(onRes.enable_thinking).toBe(true)
    expect(onRes.thinking_budget).toBe(8192)
    expect(onRes.reasoning).toEqual({ effort: 'medium', max_tokens: 8192 })

    expect(buildReasoningParams('deephermes-3', 'medium', false)).toEqual({
      enable_thinking: false,
      thinking: { type: 'disabled' },
      reasoning: { effort: 'none' },
    })

    const clamped = buildReasoningParams('hermes-4', 'high', true, { maxTokens: 4000 })
    expect(clamped.thinking_budget).toBe(3999)
    expect(clamped.reasoning.max_tokens).toBe(3999)
  })
})

describe('supportsReasoning & isBinaryReasoning', () => {
  it('supports reasoning for all recognized families', () => {
    expect(supportsReasoning('o3-mini')).toBe(true)
    expect(supportsReasoning('claude-3-7-sonnet')).toBe(true)
    expect(supportsReasoning('deepseek-r1')).toBe(true)
    expect(supportsReasoning('qwq-32b')).toBe(true)
    expect(supportsReasoning('gemini-2.5-pro')).toBe(true)
    expect(supportsReasoning('deephermes-3')).toBe(true)
    expect(supportsReasoning('hermes-3-llama-3.1')).toBe(true)
    expect(supportsReasoning('llama-3.1')).toBe(false)
  })

  it('identifies binary-only models correctly', () => {
    expect(isBinaryReasoning('deepseek-r1')).toBe(true)
    expect(isBinaryReasoning('deephermes-3')).toBe(true)
    expect(isBinaryReasoning('hermes-4')).toBe(false)
    expect(isBinaryReasoning('o1-mini')).toBe(false)
    expect(isBinaryReasoning('claude-3-7-sonnet')).toBe(false)
    expect(isBinaryReasoning('qwq-32b')).toBe(false)
  })
})
