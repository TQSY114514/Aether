// ─── Background task scheduler tests (queue, priority, retry, persistence) ──
// The tool loop is injected via initBackgroundTasks({ runToolLoop }) — the
// TaskManager's dependency-injection seam (same shape as execution backends).
// Each test gets a fresh module instance (module-level state) and a fresh
// mock loop, so tests never leak tasks into each other.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── helpers ────────────────────────────────────────────────────────────────

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function until(fn, timeout = 4000, label = 'condition') {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (fn()) return
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error(`until: timed out waiting for ${label}`)
}

function makeFakeDb({ queueOn = false } = {}) {
  const agentTasks = new Map()
  let nextId = 1
  const db = {
    getSetting: (k) => (k === 'feature_flag.scheduler.queue' ? (queueOn ? '1' : '0') : null),
    createSession: () => ({ lastInsertRowid: nextId++ }),
    addMessage: () => ({ lastInsertRowid: 100 + nextId }),
    updateMessage: () => {},
    addAuditLog: () => {},
    getModel: (id) => (id === 1 ? { id: 1, provider_id: 1, model_name: 'm' } : null),
    getProvider: (id) => (id === 1 ? { id: 1, api_url: 'x', api_format: 'openai' } : null),
    createAgentTask: ({ session_id, title, content, model_id, agent_mode, priority, max_retry }) => {
      const id = nextId++
      agentTasks.set(id, {
        id, session_id, title, content, model_id, agent_mode,
        status: 'pending', priority, max_retry, attempts: 0,
        error: null, result: null, created_at: new Date().toISOString(),
      })
      return id
    },
    updateAgentTask: (id, patch) => {
      const row = agentTasks.get(id)
      if (!row) return
      Object.assign(row, patch)
    },
    getAgentTask: (id) => agentTasks.get(id) || null,
    listAgentTasks: () => Array.from(agentTasks.values()),
    _rows: agentTasks,
  }
  return db
}

// ─── module setup ───────────────────────────────────────────────────────────

let bt            // re-imported backgroundTasks module
let runToolLoop   // the injected mock loop
let db
let openDeferreds

beforeEach(async () => {
  vi.resetModules()
  runToolLoop = vi.fn()
  openDeferreds = []
  db = makeFakeDb()
  bt = await import('../electron/llm/backgroundTasks')
  bt.initBackgroundTasks({ getWebContents: () => null, db, runToolLoop })
})

afterEach(async () => {
  // Settle any tasks still waiting on a deferred so no run stays pending
  // across the next test's module reset.
  for (const d of openDeferreds) d.resolve('cleanup')
  await new Promise(r => setTimeout(r, 30))
})

// Every runToolLoop() call hangs on a fresh deferred until the test resolves.
function hangMode() {
  runToolLoop.mockImplementation(() => {
    const d = deferred()
    openDeferreds.push(d)
    return d.promise
  })
}

async function start(opts = {}) {
  return bt.startTask({
    db,
    content: opts.content || 'task content',
    modelId: 1,
    agentMode: 'ask',
    priority: opts.priority ?? 0,
    maxRetry: opts.maxRetry ?? 2,
    emit: opts.emit || vi.fn(),
  })
}

function statusMap() {
  return Array.from(bt.listTasks(db)).reduce((m, t) => { m[t.id] = t.status; return m }, {})
}

function statusMapFor(mod, dbb = db) {
  return Array.from(mod.listTasks(dbb)).reduce((m, t) => { m[t.id] = t.status; return m }, {})
}

// ─── legacy mode (queue off) ────────────────────────────────────────────────

describe('legacy mode (scheduler.queue off)', () => {
  it('runs immediately and persists the terminal state', async () => {
    runToolLoop.mockResolvedValueOnce('the final answer')
    const emit = vi.fn()
    const { taskId, sessionId } = await start({ emit })

    expect(taskId).toBeTypeOf('number')
    expect(sessionId).toBeTypeOf('number')

    await until(() => emit.mock.calls.some(c => c[1].type === 'done'), 3000, 'done emit')
    expect(bt.getTask(taskId).status).toBe('done')
    expect(bt.getTask(taskId).finalContent).toBe('the final answer')

    // Persisted row updated.
    const row = db._rows.get(taskId)
    expect(row.status).toBe('done')
    expect(row.result).toBe('the final answer')
  })

  it('throws when the concurrency cap is hit (legacy behavior)', async () => {
    hangMode()
    await start()
    await start()
    await start()
    await expect(start()).rejects.toThrow('已达最大并发任务数')
  })
})

// ─── queue mode ─────────────────────────────────────────────────────────────

describe('queue mode (scheduler.queue on)', () => {
  beforeEach(() => {
    db = makeFakeDb({ queueOn: true })
  })

  it('caps concurrency at MAX_CONCURRENT_TASKS and drains as slots free', async () => {
    hangMode()
    const tasks = []
    for (let i = 0; i < 5; i++) tasks.push(await start({ content: `t${i}` }))

    // 3 running, 2 pending.
    await until(() => {
      const s = statusMap()
      return tasks.filter(t => s[t.taskId] === 'running').length === 3 &&
             tasks.filter(t => s[t.taskId] === 'pending').length === 2
    }, 3000, '3 running + 2 pending')

    // Free one slot → one pending starts.
    openDeferreds[0].resolve('a')
    openDeferreds.splice(0, 1)
    await until(() => statusMap()[tasks[3].taskId] === 'running', 3000, '4th task running')

    // Finish everything: repeatedly settle until no open deferreds remain
    // (each resolve can dispatch a new pending task which hangs again).
    for (let guard = 0; guard < 10 && openDeferreds.length; guard++) {
      const batch = openDeferreds.splice(0)
      for (const d of batch) d.resolve('done')
      await new Promise(r => setTimeout(r, 20))
    }
    await until(() => statusMap()[tasks[4].taskId] === 'done', 3000, 'all tasks terminal')
  })

  it('dispenses pending tasks by priority (higher first)', async () => {
    hangMode()
    const ids = []
    for (const p of [0, 0, 0, 5, 2, 0]) {
      const t = await start({ content: `p${p}`, priority: p })
      ids.push(t.taskId)
    }
    // First three (three p0) run; p5 / p2 / p0 wait in the queue.
    await until(() => statusMap()[ids[0]] === 'running', 3000, 'first running')

    // Free slot 0 → p5 must be picked, not p2, not the remaining p0.
    openDeferreds[0].resolve('a')
    openDeferreds.splice(0, 1)
    await until(() => statusMap()[ids[3]] === 'running', 3000, 'p5 run')
    expect(statusMap()[ids[4]]).not.toBe('running')

    // Free one more slot → now p2 runs (highest of the rest).
    const secondSlot = [1, 2].find(i => statusMap()[ids[i]] === 'running')
    const removed = openDeferreds.splice(secondSlot, 1)[0]
    removed.resolve('b')
    await until(() => statusMap()[ids[4]] === 'running', 3000, 'p2 run')
    expect(statusMap()[ids[5]]).not.toBe('running')
  })

  it('retries failures up to maxRetry, then gives up with error', async () => {
    runToolLoop
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('retried ok')
    const emit = vi.fn()
    const { taskId } = await start({ maxRetry: 2, emit })

    await until(() => statusMap()[taskId] === 'done', 4000, 'done after retry')
    expect(runToolLoop).toHaveBeenCalledTimes(2)
    const t = bt.getTask(taskId)
    expect(t.attempts).toBe(1)
    expect(t.finalContent).toBe('retried ok')
    const row = db._rows.get(taskId)
    expect(row.attempts).toBe(1)
    expect(row.status).toBe('done')
  })

  it('marks error when retry budget is exhausted', async () => {
    runToolLoop.mockRejectedValue(new Error('always fails'))
    const { taskId } = await start({ maxRetry: 2 })

    await until(() => statusMap()[taskId] === 'error', 4000, 'error after retries')
    expect(runToolLoop).toHaveBeenCalledTimes(2) // initial + 1 retry
    const t = bt.getTask(taskId)
    expect(t.attempts).toBe(2)
    expect(t.error).toContain('always fails')
    expect(db._rows.get(taskId).status).toBe('error')
  })

  it('cancels a pending task without running it', async () => {
    hangMode()
    const running = [await start(), await start(), await start()]
    const pending = await start()
    await until(() => statusMap()[pending.taskId] === 'pending', 3000, 'pending')

    const callsBefore = runToolLoop.mock.calls.length
    bt.cancelTask(pending.taskId)
    expect(statusMap()[pending.taskId]).toBe('cancelled')
    await new Promise(r => setTimeout(r, 50))
    expect(runToolLoop.mock.calls.length).toBe(callsBefore)
    expect(db._rows.get(pending.taskId).status).toBe('cancelled')
    expect(openDeferreds.length).toBe(running.length)
  })
})

// ─── persistence / restore ──────────────────────────────────────────────────

describe('persistence & restore', () => {
  it('lists persisted history rows not present in memory (fresh module)', async () => {
    runToolLoop.mockResolvedValueOnce('done')
    const { taskId } = await start({ content: 'memory task' })
    await until(() => statusMap()[taskId] === 'done', 3000, 'done')

    // New module instance = fresh memory; DB still holds the finished row.
    vi.resetModules()
    const bt2 = await import('../electron/llm/backgroundTasks')
    bt2.restorePendingTasks(db)  // nothing pending → nothing re-dispatched

    const rows = bt2.listTasks(db)
    expect(rows.find(r => r.id === taskId).status).toBe('done')
  })

  it('rehydrates and re-dispatches pending/running rows across restart', async () => {
    // Seed the queue-enabled DB with rows a crash would leave behind.
    const queueDb = makeFakeDb({ queueOn: true })
    const id1 = queueDb.createAgentTask({ session_id: 1, title: 't1', content: 'c1', model_id: 1, agent_mode: 'ask', priority: 0, max_retry: 2 })
    const id2 = queueDb.createAgentTask({ session_id: 2, title: 't2', content: 'c2', model_id: 1, agent_mode: 'ask', priority: 0, max_retry: 2 })
    queueDb.updateAgentTask(id1, { status: 'pending' })
    queueDb.updateAgentTask(id2, { status: 'running' })

    // Fresh module; loop hangs so we can observe the dispatch.
    vi.resetModules()
    const loop2 = vi.fn(() => {
      const d = deferred()
      openDeferreds.push(d)
      return d.promise
    })
    const bt2 = await import('../electron/llm/backgroundTasks')
    bt2.initBackgroundTasks({ getWebContents: () => null, db: queueDb, runToolLoop: loop2 })

    bt2.restorePendingTasks(queueDb)

    // Both rows are rehydrated and dispatched (queue flag on → pending→running).
    await until(() => {
      const s = statusMapFor(bt2, queueDb)
      return Object.values(s).filter(v => v === 'running').length >= 1
    }, 3000, 'rehydrated tasks dispatched')
    const s = statusMapFor(bt2, queueDb)
    expect(Object.values(s).filter(v => v === 'pending').length).toBe(0)
  })
})