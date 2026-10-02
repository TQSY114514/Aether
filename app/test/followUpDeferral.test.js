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
})