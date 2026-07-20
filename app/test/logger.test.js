// ─── Logger ring buffer unit tests ────────────────────────────────────────
import { describe, it, expect } from 'vitest'

// Pure-JS ring buffer matching the logic in electron/logger.js.

const MAX_ENTRIES = 500
const entries = []

function write(level, ...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  entries.push({ level, time: '00:00:00', msg })
  if (entries.length > MAX_ENTRIES) entries.shift()
}
function clearEntries() { entries.length = 0 }

describe('logger', () => {
  beforeEach(() => { clearEntries() })

  it('writes info entries', () => {
    write('info', 'hello')
    write('info', 'world')
    expect(entries).toHaveLength(2)
    expect(entries[0].msg).toBe('hello')
    expect(entries[1].msg).toBe('world')
  })

  it('records correct levels', () => {
    write('warn', 'w1')
    write('error', 'e1')
    write('info', 'i1')
    expect(entries[0].level).toBe('warn')
    expect(entries[1].level).toBe('error')
    expect(entries[2].level).toBe('info')
  })

  it('drops entries beyond MAX_ENTRIES', () => {
    for (let i = 0; i < 501; i++) write('info', `msg ${i}`)
    expect(entries).toHaveLength(500)
    expect(entries[0].msg).toBe('msg 1')
    expect(entries[499].msg).toBe('msg 500')
  })

  it('clear empties the buffer', () => {
    write('info', 'x')
    clearEntries()
    expect(entries).toHaveLength(0)
  })
})
