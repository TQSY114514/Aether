// ─── Logger forwarding / file-logging toggle tests (real module) ────────────
// The real electron/logger.js is importable in plain Node: its electron
// dependency is lazily resolved only when a log path is needed, so the ring
// buffer, forward listeners and the file-logging switch are all testable.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import log from '../electron/logger'

describe('logger file-logging switch (Phase 0)', () => {
  it('defaults file logging ON (backward compatible)', () => {
    expect(log.getFileLogging()).toBe(true)
  })

  it('setFileLogging flips the runtime switch', () => {
    log.setFileLogging(false)
    expect(log.getFileLogging()).toBe(false)
    log.setFileLogging(true)
    expect(log.getFileLogging()).toBe(true)
  })

  it('write() survives both switch states without throwing', () => {
    log.setFileLogging(false)
    expect(() => log.info('no file')).not.toThrow()
    log.setFileLogging(true)
    expect(() => log.warn('file again')).not.toThrow()
  })
})

describe('logger entry forwarding', () => {
  let received

  beforeEach(() => {
    received = []
    log.clear()
    log.setFileLogging(true)
  })

  afterEach(() => {
    // Always detach listeners so suites don't leak into each other.
    log.clear() // ring buffer only; listeners are detached explicitly below
  })

  it('forwards entries to listeners with the entry shape', () => {
    const unsub = log.addEntryListener((e) => received.push(e))
    log.info('forward me')
    unsub()
    expect(received).toHaveLength(1)
    expect(received[0].level).toBe('info')
    expect(received[0].msg).toBe('forward me')
    expect(typeof received[0].time).toBe('string')
  })

  it('multi-arg args are joined like console', () => {
    const unsub = log.addEntryListener((e) => received.push(e))
    log.warn('a', 1, { b: 2 })
    unsub()
    expect(received[0].msg).toBe('a 1 {"b":2}')
  })

  it('unsubscribe stops delivery', () => {
    const unsub = log.addEntryListener((e) => received.push(e))
    unsub()
    log.info('after unsub')
    expect(received).toHaveLength(0)
  })

  it('multiple listeners all receive every entry', () => {
    const a = []
    const b = []
    const ua = log.addEntryListener((e) => a.push(e))
    const ub = log.addEntryListener((e) => b.push(e))
    log.error('fan out')
    ua(); ub()
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0].msg).toBe('fan out')
    expect(b[0].msg).toBe('fan out')
  })

  it('a throwing listener does not break other listeners or write()', () => {
    const good = []
    log.addEntryListener(() => { throw new Error('listener exploded') })
    const ug = log.addEntryListener((e) => good.push(e))
    expect(() => log.info('resilient')).not.toThrow()
    ug()
    expect(good).toHaveLength(1)
  })

  it('non-function argument is ignored', () => {
    expect(() => log.addEntryListener(null)).not.toThrow()
    expect(() => log.addEntryListener('nope')).not.toThrow()
  })
})