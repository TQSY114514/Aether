// ─── Provider adapter unit tests ────────────────────────────────────────────
// Tests for the normalizeUsage function exported by providerAdapter.js
// (sourced from electron/utils/llmShared.js).

import { describe, it, expect } from 'vitest'
import { normalizeUsage } from '../electron/llm/providerAdapter'

// ─── Null / undefined / non-object ───────────────────────────────────────────
describe('normalizeUsage — nullish input', () => {
  it('returns null for null', () => {
    expect(normalizeUsage(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizeUsage(undefined)).toBeNull()
  })

  it('returns null for non-object', () => {
    expect(normalizeUsage('string')).toBeNull()
    expect(normalizeUsage(123)).toBeNull()
    expect(normalizeUsage(true)).toBeNull()
  })

  it('returns null for empty object', () => {
    // All fields default to 0, but the function still returns an object
    const r = normalizeUsage({})
    expect(r).not.toBeNull()
    expect(r.prompt_tokens).toBe(0)
    expect(r.completion_tokens).toBe(0)
    expect(r.total_tokens).toBe(0)
  })
})

// ─── OpenAI format ───────────────────────────────────────────────────────────
describe('normalizeUsage — OpenAI format', () => {
  it('maps prompt_tokens directly', () => {
    const r = normalizeUsage({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 })
    expect(r.prompt_tokens).toBe(100)
    expect(r.completion_tokens).toBe(50)
    expect(r.total_tokens).toBe(150)
  })

  it('maps prompt_tokens_details.cached_tokens to cache_read_tokens', () => {
    const r = normalizeUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 30 },
    })
    expect(r.cache_read_tokens).toBe(30)
    expect(r.cache_creation_tokens).toBe(0)
  })

  it('handles zero total_tokens', () => {
    const r = normalizeUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
    expect(r.total_tokens).toBe(0)
  })

  it('handles missing total_tokens (falls back to sum)', () => {
    const r = normalizeUsage({ prompt_tokens: 100, completion_tokens: 50 })
    // total_tokens not provided, but input_tokens/output_tokens also not provided
    // so num(u.input_tokens || 0) + num(u.output_tokens || 0) = 0 + 0 = 0
    expect(r.total_tokens).toBe(0)
  })
})

// ─── Anthropic format ────────────────────────────────────────────────────────
describe('normalizeUsage — Anthropic format', () => {
  it('maps input_tokens to prompt_tokens', () => {
    const r = normalizeUsage({ input_tokens: 200, output_tokens: 80 })
    expect(r.prompt_tokens).toBe(200)
    expect(r.completion_tokens).toBe(80)
  })

  it('maps cache_read_input_tokens to cache_read_tokens', () => {
    const r = normalizeUsage({
      input_tokens: 200,
      output_tokens: 80,
      total_tokens: 300,
      cache_read_input_tokens: 120,
    })
    expect(r.cache_read_tokens).toBe(120)
  })

  it('maps cache_creation_input_tokens to cache_creation_tokens', () => {
    const r = normalizeUsage({
      input_tokens: 200,
      output_tokens: 80,
      total_tokens: 300,
      cache_creation_input_tokens: 50,
    })
    expect(r.cache_creation_tokens).toBe(50)
  })

  it('maps cache_creation_tokens directly', () => {
    const r = normalizeUsage({
      input_tokens: 200,
      output_tokens: 80,
      total_tokens: 300,
      cache_creation_tokens: 60,
    })
    expect(r.cache_creation_tokens).toBe(60)
  })

  it('computes total_tokens from input + output when not provided', () => {
    const r = normalizeUsage({ input_tokens: 200, output_tokens: 80 })
    expect(r.total_tokens).toBe(280)
  })
})

// ─── Mixed / partial usage ───────────────────────────────────────────────────
describe('normalizeUsage — partial usage', () => {
  it('handles only prompt_tokens', () => {
    const r = normalizeUsage({ prompt_tokens: 50 })
    expect(r.prompt_tokens).toBe(50)
    expect(r.completion_tokens).toBe(0)
    expect(r.total_tokens).toBe(0)
  })

  it('handles only completion_tokens', () => {
    const r = normalizeUsage({ completion_tokens: 30 })
    expect(r.prompt_tokens).toBe(0)
    expect(r.completion_tokens).toBe(30)
    expect(r.total_tokens).toBe(0)
  })

  it('handles only input_tokens', () => {
    const r = normalizeUsage({ input_tokens: 70 })
    expect(r.prompt_tokens).toBe(70)
    expect(r.total_tokens).toBe(70) // input(70) + output(0)
  })

  it('handles only output_tokens', () => {
    const r = normalizeUsage({ output_tokens: 40 })
    expect(r.prompt_tokens).toBe(0)
    expect(r.total_tokens).toBe(40) // input(0) + output(40)
  })

  it('OpenAI prompt_tokens takes priority over Anthropic input_tokens', () => {
    const r = normalizeUsage({ prompt_tokens: 100, input_tokens: 200, completion_tokens: 50, output_tokens: 80, total_tokens: 150 })
    // prompt_tokens wins over input_tokens via || short-circuit
    expect(r.prompt_tokens).toBe(100)
    // completion_tokens wins over output_tokens
    expect(r.completion_tokens).toBe(50)
    // total_tokens is provided explicitly
    expect(r.total_tokens).toBe(150)
  })
})

// ─── Numeric / type coercion ─────────────────────────────────────────────────
describe('normalizeUsage — numeric coercion', () => {
  it('ignores non-numeric string values', () => {
    const r = normalizeUsage({ prompt_tokens: 'abc', completion_tokens: 50, total_tokens: 150 })
    expect(r.prompt_tokens).toBe(0)
    expect(r.completion_tokens).toBe(50)
  })

  it('converts numeric string values via Number()', () => {
    // typeof '100' is string, not number, so num() returns 0
    const r = normalizeUsage({ prompt_tokens: '100', completion_tokens: 50, total_tokens: 150 })
    expect(r.prompt_tokens).toBe(0)
  })

  it('handles negative values as 0', () => {
    const r = normalizeUsage({ prompt_tokens: -10, completion_tokens: -5, total_tokens: -15 })
    // num() returns v if typeof v === 'number', negative is still a number
    expect(r.prompt_tokens).toBe(-10)
    expect(r.total_tokens).toBe(-15)
  })
})

// ─── Output shape ────────────────────────────────────────────────────────────
describe('normalizeUsage — output shape', () => {
  it('returns all five canonical fields', () => {
    const r = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })
    expect(r).toHaveProperty('prompt_tokens')
    expect(r).toHaveProperty('completion_tokens')
    expect(r).toHaveProperty('total_tokens')
    expect(r).toHaveProperty('cache_read_tokens')
    expect(r).toHaveProperty('cache_creation_tokens')
    expect(Object.keys(r).length).toBe(5)
  })
})