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

  it('reports busy when subagentSupervisor has running subagents', async () => {
    const subagentSupervisor = require('../electron/llm/subagentSupervisor')
    const scheduler = require('../electron/cron/scheduler')
    const origMap = new Map(subagentSupervisor.activeSubagents)
    subagentSupervisor.activeSubagents.clear()
    try {
      expect(scheduler.isSystemBusy()).toBe(false)
      subagentSupervisor.activeSubagents.set('sa-busy-test', { id: 'sa-busy-test', status: 'running' })
      expect(scheduler.isSystemBusy()).toBe(true)
      subagentSupervisor.activeSubagents.set('sa-busy-test', { id: 'sa-busy-test', status: 'completed' })
      expect(scheduler.isSystemBusy()).toBe(false)
    } finally {
      subagentSupervisor.activeSubagents.clear()
      for (const [k, v] of origMap.entries()) subagentSupervisor.activeSubagents.set(k, v)
    }
  })

  it('prune supports onlyNonConsolidatable and preserveDigest fallback', () => {
    const Database = require('better-sqlite3')
    const autoMemory = require('../electron/llm/autoMemory')
    const raw = new Database(':memory:')
    try {
      raw.exec(`
        CREATE TABLE memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          type TEXT DEFAULT 'fact',
          origin TEXT DEFAULT 'user',
          workspace TEXT,
          confidence REAL DEFAULT 1.0,
          access_count INTEGER NOT NULL DEFAULT 0,
          last_accessed_at DATETIME,
          created_at DATETIME
        );
      `)
      const db = {
        run: (sql, params) => raw.prepare(sql).run(...(Array.isArray(params) ? params : [params])),
      }
      raw.prepare("INSERT INTO memory (content, type, origin, access_count, created_at) VALUES (?, ?, ?, ?, ?)").run('Old external web snippet', 'fact', 'external', 0, '2020-01-01T00:00:00Z')
      raw.prepare("INSERT INTO memory (content, type, origin, access_count, created_at) VALUES (?, ?, ?, ?, ?)").run('Old user fact', 'fact', 'user', 0, '2020-01-01T00:00:00Z')
      raw.prepare("INSERT INTO memory (content, type, origin, access_count, created_at) VALUES (?, ?, ?, ?, ?)").run('Old consolidatable assistant fact', 'fact', 'assistant', 0, '2020-01-01T00:00:00Z')
      raw.prepare("INSERT INTO memory (content, type, origin, access_count, created_at) VALUES (?, ?, ?, ?, ?)").run('Project architecture rule', 'project', 'user', 0, '2020-01-01T00:00:00Z')
      raw.prepare("INSERT INTO memory (content, type, origin, access_count, created_at) VALUES (?, ?, ?, ?, ?)").run('## Old Digest', 'digest', 'assistant', 0, '2020-01-01T00:00:00Z')

      const res = autoMemory.prune(db, 90, { onlyNonConsolidatable: true, preserveDigest: true })
      expect(res.deleted).toBeGreaterThanOrEqual(1)
      const remaining = raw.prepare('SELECT content, type FROM memory ORDER BY id').all()
      expect(remaining.map(r => r.content)).toEqual([
        'Old user fact',
        'Old consolidatable assistant fact',
        'Project architecture rule',
        '## Old Digest',
      ])
    } finally {
      raw.close()
    }
  })
})
