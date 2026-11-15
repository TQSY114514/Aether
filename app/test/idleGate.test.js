import { describe, it, expect, vi } from 'vitest'
import { IdleGate } from '../electron/cron/idleGate'

describe('IdleGate', () => {
  it('blocks until idleMs elapses and respects isBusy()', async () => {
    let clock = 1_000_000
    let busy = false
    const runPass = vi.fn(async () => ({ ok: true }))

    const gate = new IdleGate({
      idleMs: 300_000,
      cooldownMs: 3_600_000,
      minRetryMs: 60_000,
      now: () => clock,
      isBusy: () => busy,
      runPass,
    })

    // User just interacted at t=1_000_000
    expect(await gate.tick()).toEqual({ ran: false, reason: 'active-user' })

    // 5 minutes pass, but a tool loop is busy
    clock += 300_000
    busy = true
    expect(await gate.tick()).toEqual({ ran: false, reason: 'busy' })

    // Busy clears, run succeeds
    busy = false
    const res = await gate.tick()
    expect(res.ran).toBe(true)
    expect(runPass).toHaveBeenCalledTimes(1)
  })

  it('stamps lastAttemptAt before expensive cooldown/material checks (no hot-spin)', async () => {
    let clock = 1_000_000
    const hasMaterial = vi.fn(() => false)
    const gate = new IdleGate({
      idleMs: 1000,
      cooldownMs: 10_000,
      minRetryMs: 60_000,
      now: () => clock,
      lastFullPassAt: () => null,
      hasMaterial,
      runPass: async () => ({ ok: true }),
    })

    clock += 2000
    expect(await gate.tick()).toEqual({ ran: false, reason: 'no-material' })
    expect(hasMaterial).toHaveBeenCalledTimes(1)

    // Subsequent poll within minRetryMs is rejected by backoff BEFORE calling hasMaterial
    clock += 10_000
    expect(await gate.tick()).toEqual({ ran: false, reason: 'backoff' })
    expect(hasMaterial).toHaveBeenCalledTimes(1)
  })

  it('signals shouldYield() immediately when user activity resumes mid-pass', async () => {
    let clock = 1_000_000
    let observedYieldDuring = false
    let gate
    gate = new IdleGate({
      idleMs: 1000,
      minRetryMs: 100,
      now: () => clock,
      runPass: async ({ shouldYield }) => {
        expect(shouldYield()).toBe(false)
        gate.noteActivity()
        observedYieldDuring = shouldYield()
        return { ok: false, yielded: observedYieldDuring }
      },
    })

    clock += 2000
    const res = await gate.tick()
    expect(observedYieldDuring).toBe(true)
    expect(res.yielded).toBe(true)
  })

  it('force: true bypasses idle/cooldown/backoff for manual triggers', async () => {
    const runPass = vi.fn(async () => ({ ok: true }))
    const gate = new IdleGate({
      idleMs: 999_999,
      cooldownMs: 999_999,
      now: () => 1000,
      runPass,
    })

    const res = await gate.tick({ force: true })
    expect(res.ran).toBe(true)
    expect(runPass).toHaveBeenCalledTimes(1)
  })
})
