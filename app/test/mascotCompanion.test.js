import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import flags from '../electron/featureFlags'
import {
  resolveMascotState,
  getMascotPokeKey,
  MASCOT_IDLE_TIMEOUT_MS,
} from '../src/utils/mascotState'

function makeDb() {
  const store = new Map()
  return {
    getSetting: (k) => (store.has(k) ? store.get(k) : null),
    setSetting: (k, v) => { store.set(k, String(v)) },
  }
}

describe('mascot companion feature flag', () => {
  it('registers ux.mascotCompanion defaulting to false under ux category', () => {
    const def = flags.defs().find((d) => d.key === 'ux.mascotCompanion')
    expect(def).toBeTruthy()
    expect(def.default).toBe(false)
    expect(def.category).toBe('ux')
  })

  it('persists toggle and resets to false under applySafeMode', () => {
    const db = makeDb()
    expect(flags.isEnabled(db, 'ux.mascotCompanion')).toBe(false)
    expect(flags.set(db, 'ux.mascotCompanion', true).ok).toBe(true)
    expect(flags.isEnabled(db, 'ux.mascotCompanion')).toBe(true)
    flags.applySafeMode(db)
    expect(flags.isEnabled(db, 'ux.mascotCompanion')).toBe(false)
  })
})

describe('mascotState resolver', () => {
  it('follows deterministic priority: alert > working > poked(ready) > idle(sleeping) > ready', () => {
    expect(resolveMascotState({ needsInput: true, isWorking: true, isIdle: true, poked: true })).toBe('alert')
    expect(resolveMascotState({ needsInput: false, isWorking: true, isIdle: true, poked: true })).toBe('working')
    expect(resolveMascotState({ needsInput: false, isWorking: false, isIdle: true, poked: true })).toBe('ready')
    expect(resolveMascotState({ needsInput: false, isWorking: false, isIdle: true, poked: false })).toBe('sleeping')
    expect(resolveMascotState({ needsInput: false, isWorking: false, isIdle: false })).toBe('ready')
  })

  it('maps all states to valid i18n poke keys and defines idle timeout', () => {
    expect(getMascotPokeKey('alert')).toBe('mascot.poke.alert')
    expect(getMascotPokeKey('working')).toBe('mascot.poke.working')
    expect(getMascotPokeKey('ready')).toBe('mascot.poke.ready')
    expect(getMascotPokeKey('sleeping')).toBe('mascot.poke.ready')
    expect(MASCOT_IDLE_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('mascot visual assets', () => {
  it('provides compact WebP assets for portrait and all 4 companion states', () => {
    const dir = path.resolve(__dirname, '../src/assets/mascot')
    const expected = [
      'portrait.webp',
      'avatar-ready.webp',
      'avatar-working.webp',
      'avatar-sleeping.webp',
      'avatar-alert.webp',
    ]
    for (const file of expected) {
      const full = path.join(dir, file)
      expect(fs.existsSync(full), `missing ${file}`).toBe(true)
      const stat = fs.statSync(full)
      expect(stat.size).toBeGreaterThan(1000)
      expect(stat.size).toBeLessThan(100 * 1024)
    }
  })
})
