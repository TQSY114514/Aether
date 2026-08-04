// ─── Anthropic prompt cache policy tests ────────────────────────────────────
// Covers applyAnthropicCache (cache_control breakpoint injection) and
// applyCachePolicy dispatch (non-Anthropic pass-through).

import { describe, it, expect } from 'vitest'
import { applyAnthropicCache, applyCachePolicy } from '../electron/llm/cachePolicy'

describe('applyAnthropicCache', () => {
  it('converts a long string system into a block with cache_control', () => {
    const body = { system: 'x'.repeat(600), messages: [] }
    applyAnthropicCache(body)
    expect(Array.isArray(body.system)).toBe(true)
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('leaves a short string system untouched', () => {
    const body = { system: 'short', messages: [] }
    applyAnthropicCache(body)
    expect(body.system).toBe('short')
  })

  it('injects cache_control on the last user message content block', () => {
    const body = {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'first' }] },
        { role: 'user', content: [{ type: 'text', text: 'second' }] },
      ],
    }
    applyAnthropicCache(body)
    expect(body.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.messages[0].content[0].cache_control).toBeUndefined()
  })

  it('injects cache_control on the last tool definition', () => {
    const body = { messages: [], tools: [{ name: 'a' }, { name: 'b' }] }
    applyAnthropicCache(body)
    expect(body.tools[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.tools[0].cache_control).toBeUndefined()
  })

  it('returns the body unchanged for a non-object', () => {
    expect(applyAnthropicCache(null)).toBeNull()
    expect(applyAnthropicCache(undefined)).toBeUndefined()
  })
})

describe('applyCachePolicy', () => {
  it('applies Anthropic cache for the anthropic format', () => {
    const body = { system: 'x'.repeat(600), messages: [] }
    applyCachePolicy(body, 'anthropic')
    expect(Array.isArray(body.system)).toBe(true)
  })

  it('passes non-Anthropic bodies through unchanged', () => {
    const body = { system: 'x'.repeat(600), messages: [] }
    const out = applyCachePolicy(body, 'openai')
    expect(out).toBe(body)
    expect(typeof body.system).toBe('string')
  })
})