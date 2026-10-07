// ─── Follow-up deferral tests ───────────────────────────────────────────────
// Regression cover for the silent-drop bug: when the background-task
// concurrency cap was already reached, startTask threw before persisting
// anything and the accepted follow-up was marked failed and never retried.
//
// The fix keeps such a follow-up pending and retries it from notifySlotFree()
// when a running task finishes. The tool loop is injected exactly like
// taskScheduler.test.js does, so these tests never spawn a real agent run.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'

// backgroundTasks reaches steering through a nested `require`, so vitest's
// `import()` would hand this test a *different* steering instance than the one
// the drain reads. Load both through Node's CJS registry so module identity
// matches, and clear that registry between tests for fresh module state.
const nodeRequire = createRequire(import.meta.url)

const CONCURRENCY_CAP = 3   // must match DEFAULT_CONCURRENT_TASKS

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

function makeFakeDb() {
  const agentTasks = new Map()
  let nextId = 1
  return {
    getSetting: (k) => (k === 'feature_flag.scheduler.queue' ? '0' : null),
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
        status: 'queued', priority, max_retry, attempts: 0,
        error: null, result: null, created_at: new Date().toISOString(),
      })
      return id
    },
    updateAgentTask: (id, patch) => {
      const row = agentTasks.get(id)
      if (row) Object.assign(row, patch)
    },
    getAgentTask: (id) => agentTasks.get(id) || null,
    listAgentTasks: () => Array.from(agentTasks.values()),
    // Live by default; a test flips `db._sessionExists` to model a deleted session.
    getSession: (id) => (db._sessionExists === false ? null : { id: Number(id) }),
    _sessionExists: true,
  }
}

let bt, steering, db, runToolLoop, openDeferreds
const SESSION_ID = 42

beforeEach(async () => {
  vi.resetModules()
  for (const key of Object.keys(nodeRequire.cache)) {
    if (/[\\/]llm[\\/](backgroundTasks|steering)\.js$/.test(key)) delete nodeRequire.cache[key]
  }
  openDeferreds = []
  db = makeFakeDb()
  runToolLoop = vi.fn(() => {
    const d = deferred()
    openDeferreds.push(d)
    return d.promise
  })
  bt = nodeRequire('../electron/llm/backgroundTasks')
  steering = nodeRequire('../electron/llm/steering')
  bt.initBackgroundTasks({ getWebContents: () => null, db, runToolLoop })
})

afterEach(async () => {
  for (const d of openDeferreds) d.resolve('cleanup')
  await new Promise(r => setTimeout(r, 30))
})

// Occupy every concurrency slot with a hung run.
async function fillSlots() {
  for (let i = 0; i < CONCURRENCY_CAP; i++) {
    await bt.startTask({ db, content: `busy ${i}`, modelId: 1, agentMode: 'ask', emit: vi.fn() })
  }
  expect(runToolLoop).toHaveBeenCalledTimes(CONCURRENCY_CAP)
}

function runningCount() {
  return Array.from(bt.listTasks(db)).filter(t => t.status === 'running').length
}

describe('backgroundTasks.dispatchPendingFollowUps', () => {
  it('starts follow-ups immediately when a slot is free', async () => {
    steering.followUp(SESSION_ID, 'do the thing')

    const res = await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })

    expect(res).toEqual({ started: 1, waiting: 0 })
    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(0)
    expect(runningCount()).toBe(1)
  })

  it('keeps a follow-up pending instead of failing it when the cap is reached', async () => {
    await fillSlots()
    steering.followUp(SESSION_ID, 'must not be dropped')

    const res = await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })

    expect(res).toEqual({ started: 0, waiting: 1 })
    // Still pending — the user's text is intact, not marked failed.
    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(1)
    expect(runningCount()).toBe(CONCURRENCY_CAP)
  })

  it('retries the deferred follow-up once a slot frees up', async () => {
    await fillSlots()
    steering.followUp(SESSION_ID, 'runs later')
    await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })

    // A running task finishes → notifySlotFree retries the deferred follow-up.
    openDeferreds[0].resolve('done')

    await until(
      () => steering.getPendingFollowUps(SESSION_ID).length === 0,
      4000,
      'deferred follow-up to start'
    )
    expect(runningCount()).toBe(CONCURRENCY_CAP - 1 + 1)
  })

  it('fails a follow-up only for a real error, not for a busy scheduler', async () => {
    await fillSlots()
    // agentMode 'plan' bypasses the concurrency guard, so a plan follow-up
    // succeeds while slots are busy.
    steering.followUp(SESSION_ID, '')

    const res = await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })

    expect(res).toEqual({ started: 0, waiting: 0 })
    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(0)
  })

  it('does not double-start a follow-up when drains overlap', async () => {
    steering.followUp(SESSION_ID, 'only once')

    const [a, b] = await Promise.all([
      bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 }),
      bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 }),
    ])

    const startedTotal = a.started + b.started
    expect(startedTotal).toBe(1)
    expect(runningCount()).toBe(1)
  })

  // ── lifecycle guards ──────────────────────────────────────────────────────

  it('abandons deferred follow-ups when their session was deleted', async () => {
    await fillSlots()
    steering.followUp(SESSION_ID, 'should not run')
    await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })
    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(1)

    // The session goes away while the follow-up is still waiting for a slot.
    db.getSession = (id) => (id === SESSION_ID ? null : { id })

    openDeferreds[0].resolve('done')
    await until(() => runningCount() < CONCURRENCY_CAP, 4000, 'a slot to free')

    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(0)
    // Nothing new was spawned for the deleted session.
    expect(bt.listTasks(db).every(t => t.title !== '任务: should not run')).toBe(true)
  })

  it('retries a deferred follow-up after a task fails to resolve its model', async () => {
    await fillSlots()
    steering.followUp(SESSION_ID, 'runs after failure')
    await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })
    steering.followUp(SESSION_ID, 'runs after second failure')
    await bt.dispatchPendingFollowUps(SESSION_ID)

    // The first completed task frees a slot and starts the first follow-up.
    // Make that follow-up fail model resolution before it enters runToolLoop;
    // its early return must notifySlotFree so the second follow-up starts too.
    const originalGetModel = db.getModel
    db.getModel = (id) => {
      // Fail model resolution specifically for the 'runs after failure' task.
      // This forces the newly dispatched task into the early return path.
      const tasks = bt.listTasks(db)
      const isFailingTask = tasks.some(t => t.modelId === id && t.content === 'runs after failure' && t.status === 'running')
      return isFailingTask ? null : originalGetModel(id)
    }

    openDeferreds[0].resolve('done')

    await until(
      () => steering.getPendingFollowUps(SESSION_ID).length === 0,
      4000,
      'follow-ups to start after failed model resolution'
    )
    db.getModel = originalGetModel
  })

  it('drains a follow-up that arrives mid-drain', async () => {
    // A slot is free so the first drain starts immediately rather than deferring.
    steering.followUp(SESSION_ID, 'first')

    const drain = bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })
    // Queued while the drain is awaiting startTask — absent from its snapshot.
    steering.followUp(SESSION_ID, 'second')
    await drain

    // The drain must re-run for the late entry instead of stranding it with
    // nothing left to retry it.
    await vi.waitFor(() => {
      expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(0)
    })
  })

  it('keeps the follow-up queued when the adapter cannot answer the liveness question', async () => {
    // Headless taskDbAdapter exposes no getSession at all. "Cannot tell" is
    // neither alive nor dead — failing the user's follow-ups here would be a
    // false negative during a transient lookup gap. Leave them queued.
    delete db.getSession
    steering.followUp(SESSION_ID, 'unverifiable parent')

    const res = await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })

    expect(res).toEqual({ started: 0, waiting: 1 })
    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(1)
    expect(bt.listTasks(db)).toHaveLength(0)
  })

  it('keeps the follow-up queued when the liveness lookup throws', async () => {
    // A throwing lookup is also "cannot tell" — fail closed would discard a
    // live session's follow-ups during a transient DB error. Preserve them.
    db.getSession = () => { throw new Error('db unavailable') }
    steering.followUp(SESSION_ID, 'throwing lookup')

    const res = await bt.dispatchPendingFollowUps(SESSION_ID, { db, modelId: 1 })

    expect(res).toEqual({ started: 0, waiting: 1 })
    expect(steering.getPendingFollowUps(SESSION_ID)).toHaveLength(1)
    expect(bt.listTasks(db)).toHaveLength(0)
  })
})
