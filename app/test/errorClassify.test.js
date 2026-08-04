// ─── Error classification unit tests ────────────────────────────────────────
// Tests for electron/llm/errorClassify.js classifyError function.

import { describe, it, expect } from 'vitest'
import { classifyError } from '../electron/llm/errorClassify'

// ─── Helpers ────────────────────────────────────────────────────────────────
function err(msg, status, extra) {
  const e = new Error(msg)
  e.status = status
  return Object.assign(e, extra || {})
}

// ─── Auth errors ─────────────────────────────────────────────────────────────
describe('classifyError — auth', () => {
  it('treats HTTP 401 as auth', () => {
    const r = classifyError(err('Unauthorized', 401))
    expect(r.kind).toBe('auth')
    expect(r.retryable).toBe(false)
    expect(r.recover.action).toBe('none')
    expect(r.recover.hint).toContain('API Key')
  })

  it('treats HTTP 403 as auth', () => {
    const r = classifyError(err('Forbidden', 403))
    expect(r.kind).toBe('auth')
    expect(r.retryable).toBe(false)
  })
})

// ─── Rate-limit errors ───────────────────────────────────────────────────────
describe('classifyError — rate_limit', () => {
  it('treats HTTP 429 as rate_limit', () => {
    const r = classifyError(err('Too Many Requests', 429))
    expect(r.kind).toBe('rate_limit')
    expect(r.retryable).toBe(true)
    expect(r.recover.action).toBe('retry')
    expect(r.recover.hint).toContain('限流')
  })

  it('extracts retryAfter from error object', () => {
    const r = classifyError(err('Too Many Requests', 429, { retryAfter: 30 }))
    expect(r.kind).toBe('rate_limit')
    expect(r.recover.hint).toContain('30')
  })

  it('extracts retry-after from message header', () => {
    const r = classifyError(err('HTTP 429: retry-after 15 seconds', 429))
    expect(r.kind).toBe('rate_limit')
    expect(r.recover.hint).toContain('15')
  })

  it('handles retry after with colon format', () => {
    const r = classifyError(err('HTTP 429: retry after: 25', 429))
    expect(r.kind).toBe('rate_limit')
    expect(r.recover.hint).toContain('25')
  })
})

// ─── Server errors ───────────────────────────────────────────────────────────
describe('classifyError — server', () => {
  it('treats 500 as server error', () => {
    const r = classifyError(err('Internal Server Error', 500))
    expect(r.kind).toBe('server')
    expect(r.retryable).toBe(true)
    expect(r.recover.action).toBe('retry')
  })

  it('treats 502 as server error', () => {
    const r = classifyError(err('Bad Gateway', 502))
    expect(r.kind).toBe('server')
    expect(r.retryable).toBe(true)
  })

  it('treats 503 as server error', () => {
    const r = classifyError(err('Service Unavailable', 503))
    expect(r.kind).toBe('server')
    expect(r.retryable).toBe(true)
  })

  it('detects overloaded 503 with specific hint', () => {
    const r = classifyError(err('model overloaded', 503))
    expect(r.kind).toBe('server')
    expect(r.recover.hint).toContain('过载')
  })

  it('detects 503 capacity message', () => {
    const r = classifyError(err('server at capacity', 503))
    expect(r.kind).toBe('server')
    expect(r.recover.hint).toContain('过载')
  })

  it('detects 503 busy message', () => {
    const r = classifyError(err('server busy', 503))
    expect(r.kind).toBe('server')
    expect(r.recover.hint).toContain('过载')
  })
})

// ─── Network errors ──────────────────────────────────────────────────────────
describe('classifyError — network', () => {
  it('detects ECONNREFUSED', () => {
    const r = classifyError(new Error('ECONNREFUSED'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
    expect(r.recover.action).toBe('retry')
    expect(r.recover.hint).toContain('网络')
  })

  it('detects ECONNRESET', () => {
    const r = classifyError(new Error('ECONNRESET'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
  })

  it('detects ENOTFOUND', () => {
    const r = classifyError(new Error('ENOTFOUND api.example.com'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
  })

  it('detects ETIMEDOUT', () => {
    const r = classifyError(new Error('ETIMEDOUT'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
  })

  it('detects EAI_AGAIN', () => {
    const r = classifyError(new Error('EAI_AGAIN'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
  })

  it('detects fetch failed', () => {
    const r = classifyError(new Error('fetch failed'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
  })

  it('detects network keyword in message', () => {
    const r = classifyError(new Error('network error'))
    expect(r.kind).toBe('network')
    expect(r.retryable).toBe(true)
  })
})

// ─── Context-length errors ───────────────────────────────────────────────────
describe('classifyError — context_length', () => {
  it('detects context length mention with 400', () => {
    const r = classifyError(err('context length exceeded', 400))
    expect(r.kind).toBe('context_length')
    expect(r.retryable).toBe(true)
    expect(r.recover.action).toBe('new_chat')
    expect(r.recover.hint).toContain('新对话')
  })

  it('detects too many tokens with 400', () => {
    const r = classifyError(err('too many tokens', 400))
    expect(r.kind).toBe('context_length')
    expect(r.retryable).toBe(true)
  })

  it('detects maximum context with 400', () => {
    const r = classifyError(err('maximum context length exceeded', 400))
    expect(r.kind).toBe('context_length')
    expect(r.retryable).toBe(true)
  })
})

// ─── Content-filter errors ───────────────────────────────────────────────────
describe('classifyError — content_filter', () => {
  it('detects content_filter keyword', () => {
    const r = classifyError(new Error('content_filter'))
    expect(r.kind).toBe('content_filter')
    expect(r.retryable).toBe(false)
    expect(r.recover.action).toBe('rephrase')
    expect(r.recover.hint).toContain('安全策略')
  })

  it('detects content policy keyword', () => {
    const r = classifyError(new Error('content policy violation'))
    expect(r.kind).toBe('content_filter')
    expect(r.retryable).toBe(false)
  })

  it('detects content management policy', () => {
    const r = classifyError(new Error('content management policy'))
    expect(r.kind).toBe('content_filter')
    expect(r.retryable).toBe(false)
  })

  it('detects safety keyword', () => {
    const r = classifyError(new Error('safety system triggered'))
    expect(r.kind).toBe('content_filter')
    expect(r.retryable).toBe(false)
  })
})

// ─── Abort errors ────────────────────────────────────────────────────────────
describe('classifyError — abort', () => {
  it('detects AbortError by name', () => {
    const e = new Error('The operation was aborted')
    e.name = 'AbortError'
    const r = classifyError(e)
    expect(r.kind).toBe('abort')
    expect(r.retryable).toBe(false)
    expect(r.recover.action).toBe('none')
    expect(r.recover.hint).toContain('已中止')
  })
})

// ─── Unknown errors ──────────────────────────────────────────────────────────
describe('classifyError — unknown', () => {
  it('returns unknown for generic errors', () => {
    const r = classifyError(new Error('something went wrong'))
    expect(r.kind).toBe('unknown')
    expect(r.retryable).toBe(true)
    expect(r.recover.action).toBe('retry')
  })

  it('returns unknown for null/undefined', () => {
    expect(classifyError(null).kind).toBe('unknown')
    expect(classifyError(undefined).kind).toBe('unknown')
  })

  it('returns unknown for non-Error objects', () => {
    expect(classifyError('just a string').kind).toBe('unknown')
    expect(classifyError({}).kind).toBe('unknown')
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────────────
describe('classifyError — edge cases', () => {
  it('auth takes priority over network patterns', () => {
    const r = classifyError(err('network error', 401))
    expect(r.kind).toBe('auth')
  })

  it('rate_limit takes priority over content_filter patterns', () => {
    const r = classifyError(err('content_filter', 429))
    expect(r.kind).toBe('rate_limit')
  })

  it('context_length requires status 400', () => {
    const r = classifyError(err('context length exceeded', 0))
    expect(r.kind).toBe('unknown')
  })

  it('server errors handle non-503 overload gracefully', () => {
    const r = classifyError(err('Unknown Server Error', 503))
    expect(r.kind).toBe('server')
  })
})