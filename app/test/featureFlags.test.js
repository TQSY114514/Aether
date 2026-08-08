// 鈹€鈹€鈹€ Feature-flag registry unit tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
import { describe, it, expect, beforeEach } from 'vitest'
import flags from '../electron/featureFlags'

// In-memory stub of the database settings surface the registry touches.
function makeDb() {
  const store = new Map()
  return {
    getSetting: (k) => (store.has(k) ? store.get(k) : null),
    setSetting: (k, v) => { store.set(k, String(v)) },
    _store: store,
  }
}

describe('featureFlags registry', () => {
  let db

  beforeEach(() => { db = makeDb() })

  it('exposes the declared registry with defaults', () => {
    const defs = flags.defs()
    expect(defs.length).toBeGreaterThan(10)
    // Phase 1/6 forward-looking flags exist and default off.
    expect(defs.find(d => d.key === 'exec.docker').default).toBe(false)
    expect(defs.find(d => d.key === 'plugin.sdk').default).toBe(false)
    // Shipped capability defaults on.
    expect(defs.find(d => d.key === 'repoMap.enabled').default).toBe(true)
    // Every def carries the full shape.
    for (const d of defs) {
      expect(d.key).toBeTruthy()
      expect(typeof d.default).toBe('boolean')
      expect(d.category).toBeTruthy()
      expect(d.description).toBeTruthy()
    }
  })

  it('returns declared defaults when nothing is stored', () => {
    expect(flags.isEnabled(db, 'debug.fileLog')).toBe(true)
    expect(flags.isEnabled(db, 'repoMap.enabled')).toBe(true)
    expect(flags.isEnabled(db, 'exec.docker')).toBe(false)
    expect(flags.isEnabled(db, 'scheduler.queue')).toBe(false)
  })

  it('unknown keys are safe no-ops', () => {
    expect(flags.isEnabled(db, 'does.not.exist')).toBe(false)
    expect(flags.has('does.not.exist')).toBe(false)
    const r = flags.set(db, 'does.not.exist', true)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('unknown feature flag')
  })

  it('set persists under the feature_flag. prefix and flips isEnabled', () => {
    const r = flags.set(db, 'exec.docker', true)
    expect(r.ok).toBe(true)
    expect(r.value).toBe('1')
    expect(db._store.get('feature_flag.exec.docker')).toBe('1')
    expect(flags.isEnabled(db, 'exec.docker')).toBe(true)
    // round-trips through the stored value
    expect(flags.getRaw(db, 'exec.docker')).toBe('1')
  })

  it('set off stores 0', () => {
    expect(flags.set(db, 'repoMap.enabled', false).ok).toBe(true)
    expect(db._store.get('feature_flag.repoMap.enabled')).toBe('0')
    expect(flags.isEnabled(db, 'repoMap.enabled')).toBe(false)
  })

  it('value spellings normalize', () => {
    for (const truthy of [true, 1, '1', 'true', 'on', 'yes']) {
      const m = makeDb()
      flags.set(m, 'exec.ssh', truthy)
      expect(flags.isEnabled(m, 'exec.ssh')).toBe(true)
    }
    for (const falsy of [false, 0, '0', 'false', 'off', 'no', null, undefined, '']) {
      const m = makeDb()
      flags.set(m, 'exec.ssh', falsy)
      expect(flags.isEnabled(m, 'exec.ssh')).toBe(false)
    }
  })

  it('rejects unparseable values', () => {
    const r = flags.set(db, 'exec.ssh', 'maybe?')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid feature flag value')
  })

  it('headless (no db) mode: defaults apply, set fails cleanly', () => {
    expect(flags.isEnabled(null, 'repoMap.enabled')).toBe(true)
    expect(flags.isEnabled(null, 'exec.docker')).toBe(false)
    const r = flags.set(null, 'exec.docker', true)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('db unavailable')
  })

  it('list reports effective state', () => {
    flags.set(db, 'exec.docker', true)
    const all = flags.list(db)
    const docker = all.find(f => f.key === 'exec.docker')
    expect(docker.value).toBe('1')
    expect(docker.enabled).toBe(true)
    const unused = all.find(f => f.key === 'plugin.sdk')
    expect(unused.value).toBe(null)
    expect(unused.enabled).toBe(false) // default
    expect(all.every(f => f.key.includes('.') )).toBe(true)
  })

  it('brok锚n db never throws', () => {
    const broken = { getSetting: () => { throw new Error('boom') }, setSetting: () => { throw new Error('boom') } }
    expect(flags.isEnabled(broken, 'debug.fileLog')).toBe(true) // default fallback
    expect(flags.getRaw(broken, 'debug.fileLog')).toBe(null)
    const r = flags.set(broken, 'exec.docker', true)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
    expect(() => flags.list(broken)).not.toThrow()
  })

  it('default flag overrides when stored value is unparseable', () => {
    db._store.set('feature_flag.debug.fileLog', 'banana')
    expect(flags.isEnabled(db, 'debug.fileLog')).toBe(true) // default, not crash
  })
})
