// ─── Credential pool unit tests ────────────────────────────────────────────
// Tests for electron/llm/credentialPool.js: multi-key rotation with
// rate-limit backoff per provider.
//
// credentialPool is backed by a SQLite db injected via init(db) and uses the
// better-sqlite3-style API (stmt.get()/stmt.all()/db.run()). We inject a fake
// in-memory db that mimics that API so no real database is needed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as pool from '../electron/llm/credentialPool'

// ─── Fake in-memory db mimicking sql.js-style API ──────────────────────────
function createFakeDb() {
  const providers = []
  const creds = []
  let nextId = 1
  let lastRowId = null

  function addProvider({ id, api_key = null, api_url = null }) {
    providers.push({ id, api_key, api_url })
  }

  function addCredential({ provider_id, api_key, label = '', enabled = 1, last_used_at = '2000-01-01T00:00:00.000Z', error_count = 0, cooldown_until = null, disable_reason = null }) {
    const id = nextId++
    creds.push({ id, provider_id, api_key, label, enabled, last_used_at, error_count, cooldown_until, disable_reason })
    lastRowId = id
    return id
  }

  function computeRows(sql, p) {
    if (sql.includes('SELECT count(*) as n FROM provider_credential')) {
      return [{ n: creds.filter(c => c.provider_id === p[0]).length }]
    }
    if (sql.includes('SELECT api_key FROM provider')) {
      const r = providers.find(x => x.id === p[0])
      return r ? [{ api_key: r.api_key }] : []
    }
    if (sql.includes('SELECT api_url FROM provider')) {
      const r = providers.find(x => x.id === p[0])
      return r ? [{ api_url: r.api_url }] : []
    }
    if (sql.includes('SELECT id, api_key, cooldown_until FROM provider_credential')) {
      const [provider_id, now] = p
      const viable = creds
        .filter(c => c.provider_id === provider_id && c.enabled === 1 && (c.cooldown_until == null || c.cooldown_until <= now))
        .sort((a, b) => (a.last_used_at < b.last_used_at ? -1 : a.last_used_at > b.last_used_at ? 1 : 0))
      return viable.length ? [{ id: viable[0].id, api_key: viable[0].api_key, cooldown_until: viable[0].cooldown_until }] : []
    }
    if (sql.includes('SELECT error_count FROM provider_credential')) {
      const r = creds.find(c => c.id === p[0])
      return r ? [{ error_count: r.error_count }] : []
    }
    if (sql.includes('SELECT id FROM provider_credential') && sql.includes('ORDER BY last_used_at DESC')) {
      const [provider_id] = p
      const enabled = creds.filter(c => c.provider_id === provider_id && c.enabled === 1)
        .sort((a, b) => (a.last_used_at < b.last_used_at ? 1 : -1))
      return enabled.length ? [{ id: enabled[0].id }] : []
    }
    if (sql.includes('SELECT * FROM provider_credential')) {
      const [provider_id] = p
      return creds.filter(c => c.provider_id === provider_id)
        .sort((a, b) => a.id - b.id)
        .map(c => ({ ...c }))
    }
    return []
  }

  const db = {
    addProvider,
    addCredential,
    _allCreds: () => creds.map(c => ({ ...c })),
    _allProviders: () => providers.map(p => ({ ...p })),
    lastInsertRowid: () => lastRowId,
    run(sql, params = []) {
      const p = params
      if (sql.startsWith('UPDATE provider_credential SET last_used_at')) {
        const r = creds.find(c => c.id === p[1]); if (r) r.last_used_at = p[0]
      } else if (sql.startsWith('UPDATE provider SET api_key=NULL')) {
        const r = providers.find(x => x.id === p[0]); if (r) r.api_key = null
      } else if (sql.startsWith('UPDATE provider_credential SET cooldown_until')) {
        const r = creds.find(c => c.id === p[2]); if (r) { r.cooldown_until = p[0]; r.error_count = p[1] }
      } else if (sql.startsWith('UPDATE provider_credential SET error_count=0')) {
        const r = creds.find(c => c.id === p[0]); if (r) { r.error_count = 0; r.cooldown_until = null }
      } else if (sql.startsWith('UPDATE provider_credential SET enabled=0')) {
        const r = creds.find(c => c.id === p[1]); if (r) { r.enabled = 0; r.disable_reason = p[0] }
      } else if (sql.includes('INSERT INTO provider_credential (provider_id, api_key, label, enabled, last_used_at)')) {
        const id = nextId++
        creds.push({ id, provider_id: p[0], api_key: p[1], label: p[2], enabled: p[3], last_used_at: p[4], error_count: 0, cooldown_until: null, disable_reason: null })
        lastRowId = id
      } else if (sql.includes('INSERT INTO provider_credential (provider_id, api_key, label, enabled)')) {
        const id = nextId++
        creds.push({ id, provider_id: p[0], api_key: p[1], label: p[2] || '', enabled: p[3], last_used_at: '2000-01-01T00:00:00.000Z', error_count: 0, cooldown_until: null, disable_reason: null })
        lastRowId = id
      } else if (sql.startsWith('DELETE FROM provider_credential')) {
        const idx = creds.findIndex(c => c.id === p[0]); if (idx >= 0) creds.splice(idx, 1)
      }
    },
    prepare(sql) {
      const p = []
      return {
        bind: (arr) => { p.push(...arr) },
        get(...args) {
          if (args.length) p.push(...args)
          return computeRows(sql, p)[0] ?? undefined
        },
        all(...args) {
          if (args.length) p.push(...args)
          return computeRows(sql, p)
        },
        run(...args) {
          if (args.length) p.push(...args)
          db.run(sql, p)
          return { lastInsertRowid: lastRowId ?? 0 }
        },
      }
    },
    exec() { return [{ values: [] }] },
  }
  return db
}

let db
beforeEach(() => {
  db = createFakeDb()
  pool.init(db)
})
afterEach(() => {
  pool.init(null)
})

// ─── computeCooldownSec ─────────────────────────────────────────────────────
describe('computeCooldownSec', () => {
  it('applies exponential backoff 30 → 60 → 120 → 240 → 480', () => {
    expect(pool.computeCooldownSec(1)).toBe(30)
    expect(pool.computeCooldownSec(2)).toBe(60)
    expect(pool.computeCooldownSec(3)).toBe(120)
    expect(pool.computeCooldownSec(4)).toBe(240)
    expect(pool.computeCooldownSec(5)).toBe(480)
  })

  it('caps at 600s for high error counts', () => {
    expect(pool.computeCooldownSec(6)).toBe(600)
    expect(pool.computeCooldownSec(10)).toBe(600)
    expect(pool.computeCooldownSec(100)).toBe(600)
  })

  it('treats 0/negative/NaN as error count 1', () => {
    expect(pool.computeCooldownSec(0)).toBe(30)
    expect(pool.computeCooldownSec(-5)).toBe(30)
    expect(pool.computeCooldownSec(NaN)).toBe(30)
    expect(pool.computeCooldownSec('abc')).toBe(30)
  })
})

// ─── pickCredential ─────────────────────────────────────────────────────────
describe('pickCredential', () => {
  it('returns the least-recently-used viable key and bumps last_used_at', () => {
    db.addProvider({ id: 'p1' })
    db.addCredential({ provider_id: 'p1', api_key: 'k1', last_used_at: '2000-01-01' })
    db.addCredential({ provider_id: 'p1', api_key: 'k2', last_used_at: '2010-01-01' })
    const picked = pool.pickCredential('p1')
    expect(picked.api_key).toBe('k1')
    const row = db._allCreds().find(c => c.api_key === 'k1')
    expect(row.last_used_at).not.toBe('2000-01-01')
  })

  it('skips disabled and cooled-down credentials', () => {
    db.addProvider({ id: 'p1' })
    db.addCredential({ provider_id: 'p1', api_key: 'disabled', enabled: 0 })
    db.addCredential({ provider_id: 'p1', api_key: 'cooldown', cooldown_until: '9999-01-01T00:00:00.000Z' })
    db.addCredential({ provider_id: 'p1', api_key: 'good', last_used_at: '2000-01-01' })
    const picked = pool.pickCredential('p1')
    expect(picked.api_key).toBe('good')
  })

  it('returns null when all keys are in cooldown', () => {
    db.addProvider({ id: 'p1' })
    db.addCredential({ provider_id: 'p1', api_key: 'k1', cooldown_until: '9999-01-01T00:00:00.000Z' })
    expect(pool.pickCredential('p1')).toBeNull()
  })

  it('returns null when db is not initialized', () => {
    pool.init(null)
    expect(pool.pickCredential('p1')).toBeNull()
  })

  it('migrates a legacy provider api_key into the credential table', () => {
    db.addProvider({ id: 'p1', api_key: 'legacy-key' })
    const picked = pool.pickCredential('p1')
    expect(picked.api_key).toBe('legacy-key')
    // the provider row should be cleared after migration
    expect(db._allProviders()[0].api_key).toBeNull()
  })
})

// ─── markCooldown ───────────────────────────────────────────────────────────
describe('markCooldown', () => {
  it('increments error_count and sets cooldown_until', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    pool.markCooldown(id)
    let row = db._allCreds().find(c => c.id === id)
    expect(row.error_count).toBe(1)
    expect(row.cooldown_until).toBeTruthy()
  })

  it('grows the cooldown with each successive error', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    pool.markCooldown(id)
    const first = db._allCreds().find(c => c.id === id).cooldown_until
    pool.markCooldown(id)
    const second = db._allCreds().find(c => c.id === id).cooldown_until
    expect(db._allCreds().find(c => c.id === id).error_count).toBe(2)
    expect(second > first).toBe(true)
  })
})

// ─── markCooldownForProvider ────────────────────────────────────────────────
describe('markCooldownForProvider', () => {
  it('marks the most recently used credential for a provider', () => {
    db.addProvider({ id: 'p1' })
    const old = db.addCredential({ provider_id: 'p1', api_key: 'k1', last_used_at: '2000-01-01' })
    const recent = db.addCredential({ provider_id: 'p1', api_key: 'k2', last_used_at: '2010-01-01' })
    pool.markCooldownForProvider('p1')
    const row = db._allCreds().find(c => c.id === recent)
    expect(row.error_count).toBe(1)
    expect(db._allCreds().find(c => c.id === old).error_count).toBe(0)
  })

  it('is a no-op when no enabled credential exists', () => {
    db.addProvider({ id: 'p1' })
    db.addCredential({ provider_id: 'p1', api_key: 'k1', enabled: 0 })
    expect(() => pool.markCooldownForProvider('p1')).not.toThrow()
    expect(db._allCreds().find(c => c.api_key === 'k1').error_count).toBe(0)
  })
})

// ─── markSuccess ────────────────────────────────────────────────────────────
describe('markSuccess', () => {
  it('resets error_count and clears cooldown', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1', error_count: 3, cooldown_until: '9999-01-01T00:00:00.000Z' })
    pool.markSuccess(id)
    const row = db._allCreds().find(c => c.id === id)
    expect(row.error_count).toBe(0)
    expect(row.cooldown_until).toBeNull()
  })
})

// ─── markInvalid / markInvalidDetail ────────────────────────────────────────
describe('markInvalid / markInvalidDetail', () => {
  it('disables a credential with invalid_api_key reason', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    pool.markInvalid(id)
    const row = db._allCreds().find(c => c.id === id)
    expect(row.enabled).toBe(0)
    expect(row.disable_reason).toBe('invalid_api_key')
  })

  it('marks insufficient_quota distinctly', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    pool.markInvalidDetail(id, 'insufficient_quota')
    const row = db._allCreds().find(c => c.id === id)
    expect(row.enabled).toBe(0)
    expect(row.disable_reason).toBe('insufficient_quota')
  })

  it('falls back to invalid_api_key for unknown details', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    pool.markInvalidDetail(id, 'something_else')
    const row = db._allCreds().find(c => c.id === id)
    expect(row.disable_reason).toBe('invalid_api_key')
  })
})

// ─── verifyCredential ───────────────────────────────────────────────────────
describe('verifyCredential', () => {
  const origFetch = global.fetch
  afterEach(() => {
    global.fetch = origFetch
  })

  it('returns false for missing provider fields', async () => {
    expect(await pool.verifyCredential(null)).toBe(false)
    expect(await pool.verifyCredential({})).toBe(false)
    expect(await pool.verifyCredential({ api_url: 'http://x' })).toBe(false)
    expect(await pool.verifyCredential({ api_key: 'k' })).toBe(false)
  })

  it('returns true on 2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 })
    expect(await pool.verifyCredential({ api_url: 'http://x', api_key: 'k' })).toBe(true)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/models'), expect.any(Object))
  })

  it('returns false on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 401 })
    expect(await pool.verifyCredential({ api_url: 'http://x', api_key: 'k' })).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    expect(await pool.verifyCredential({ api_url: 'http://x', api_key: 'k' })).toBe(false)
  })
})

// ─── addCredential / removeCredential / listCredentials ────────────────────
describe('addCredential / removeCredential / listCredentials', () => {
  it('addCredential inserts a row and returns lastInsertRowid', () => {
    db.addProvider({ id: 'p1' })
    const r = pool.addCredential('p1', 'new-key', '本地')
    expect(r.lastInsertRowid).toBeTruthy()
    const row = db._allCreds().find(c => c.api_key === 'new-key')
    expect(row).toBeTruthy()
    expect(row.enabled).toBe(1)
  })

  it('removeCredential deletes the row', () => {
    db.addProvider({ id: 'p1' })
    const id = db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    pool.removeCredential(id)
    expect(db._allCreds().find(c => c.id === id)).toBeUndefined()
  })

  it('listCredentials returns rows ordered by id', () => {
    db.addProvider({ id: 'p1' })
    db.addCredential({ provider_id: 'p1', api_key: 'k1' })
    db.addCredential({ provider_id: 'p1', api_key: 'k2' })
    const rows = pool.listCredentials('p1')
    expect(rows.map(r => r.api_key)).toEqual(['k1', 'k2'])
  })
})