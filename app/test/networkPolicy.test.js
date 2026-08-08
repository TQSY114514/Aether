// ─── Network Policy unit tests ──────────────────────────────────────────────
// Tests for electron/llm/networkPolicy.js: settings-backed allowlist layered
// over the existing SSRF guard. Uses a fake db with getSetting/setSetting.

import { describe, it, expect } from 'vitest'
import networkPolicy from '../electron/llm/networkPolicy'

const {
  getPolicy, getWhitelist, setPolicy, setWhitelist,
  matchesWhitelist, matchesAllowlist, checkUrlPolicy, assertUrlAllowed, summary, policyActive,
} = networkPolicy

function mkDb(settings = {}) {
  const db = {
    _settings: { ...settings },
    getSetting: (k) => db._settings[k] ?? null,
    setSetting: (k, v) => { db._settings[k] = v },
  }
  return db
}

// ─── policy mode / whitelist persistence ────────────────────────────────────

describe('policy persistence', () => {
  it('defaults to whitelist mode with an empty list', () => {
    const db = mkDb()
    expect(getPolicy(db)).toBe('whitelist')
    expect(getWhitelist(db)).toEqual([])
  })

  it('reads stored policy and whitelist', () => {
    const db = mkDb({
      'network.policy': 'allow',
      'network.whitelist': JSON.stringify(['example.com', '*.docs.example.com']),
    })
    expect(getPolicy(db)).toBe('allow')
    expect(getWhitelist(db)).toEqual(['example.com', '*.docs.example.com'])
  })

  it('setPolicy validates the mode', () => {
    const db = mkDb()
    expect(setPolicy(db, 'allow')).toEqual({ ok: true })
    expect(getPolicy(db)).toBe('allow')
    expect(setPolicy(db, 'bogus').ok).toBe(false)
    expect(setPolicy(null, 'allow').ok).toBe(false)
  })

  it('setWhitelist cleans, lowercases, and persists', () => {
    const db = mkDb()
    const res = setWhitelist(db, ['  Example.COM ', 'https://api.test.io ', ''])
    expect(res.ok).toBe(true)
    expect(getWhitelist(db)).toEqual(['example.com', 'api.test.io'])
  })
})

// ─── host matching ──────────────────────────────────────────────────────────

describe('matchesWhitelist', () => {
  const list = ['example.com', '*.docs.example.com', 'api.test.io']

  it('matches exact hosts case-insensitively', () => {
    expect(matchesWhitelist('example.com', list)).toBe(true)
    expect(matchesWhitelist('EXAMPLE.COM', list)).toBe(true)
  })

  it('matches wildcard subdomains at any depth', () => {
    expect(matchesWhitelist('docs.example.com', list)).toBe(true)
    expect(matchesWhitelist('a.b.docs.example.com', list)).toBe(true)
  })

  it('does not match unrelated subdomains or bare wildcard tails', () => {
    expect(matchesWhitelist('com', list)).toBe(false)
    expect(matchesWhitelist('example.com.evil.net', list)).toBe(false)
    expect(matchesWhitelist('notdocs.example.com', list)).toBe(false)
  })

  it('matchesAllowlist is an alias', () => {
    expect(matchesAllowlist).toBe(matchesWhitelist)
  })
})

// ─── checkUrlPolicy ─────────────────────────────────────────────────────────

describe('checkUrlPolicy', () => {
  const whitelisted = { 'network.whitelist': JSON.stringify(['example.com']) }

  it('passes a whitelisted host in whitelist mode', () => {
    const db = mkDb(whitelisted)
    expect(checkUrlPolicy(db, 'https://example.com/page').ok).toBe(true)
  })

  it('blocks a non-whitelisted host in whitelist mode', () => {
    const db = mkDb(whitelisted)
    const r = checkUrlPolicy(db, 'https://evil.io/')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('not in whitelist')
  })

  it('always applies the SSRF guard, even in allow mode', () => {
    const db = mkDb({ 'network.policy': 'allow' })
    expect(checkUrlPolicy(db, 'http://localhost:3000').ok).toBe(false)
    expect(checkUrlPolicy(db, 'file:///etc/passwd').ok).toBe(false)
    expect(checkUrlPolicy(db, 'https://example.com').ok).toBe(true)
  })

  it('blocks everything in block mode', () => {
    const db = mkDb({ 'network.policy': 'block' })
    expect(checkUrlPolicy(db, 'https://example.com').ok).toBe(false)
  })

  it('rejects invalid urls', () => {
    expect(checkUrlPolicy(mkDb({ 'network.policy': 'allow' }), 'not a url').ok).toBe(false)
  })
})

// ─── assertUrlAllowed (async, with DNS) ─────────────────────────────────────

describe('assertUrlAllowed', () => {
  const db = mkDb({ 'network.policy': 'allow' })

  it('resolves for allowed-and-public hosts', async () => {
    await expect(assertUrlAllowed(db, 'https://example.com')).resolves.toBeUndefined()
  })

  it('rejects localhost targets', async () => {
    await expect(assertUrlAllowed(db, 'http://localhost:3000')).rejects.toThrow()
  })
})

// ─── summary ────────────────────────────────────────────────────────────────

describe('policyActive', () => {
  it('only bites when the flag is on and a whitelist exists', () => {
    expect(policyActive(mkDb())).toBe(false)
    expect(policyActive(mkDb({ 'network.whitelist': JSON.stringify(['a.com']) }))).toBe(false)
    expect(policyActive(mkDb({ 'feature_flag.network.policy': '1' }))).toBe(false)
    expect(policyActive(mkDb({ 'feature_flag.network.policy': '1', 'network.whitelist': JSON.stringify(['a.com']) }))).toBe(true)
  })
})

describe('summary', () => {
  it('describes the current policy', () => {
    const db = mkDb({ 'network.whitelist': JSON.stringify(['a.com']) })
    const s = summary(db)
    expect(s.policy).toBe('whitelist')
    expect(s.whitelist).toEqual(['a.com'])
  })
})
