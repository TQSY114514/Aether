// ─── Background Code Review unit tests ─────────────────────────────────────
// Tests for electron/llm/backgroundReview.js: the post-commit review queue.
//
// Uses a fake db whose agent_task/memory surfaces are in-memory arrays, and a
// temp git-less dir for file loading. The feature flag is toggled by
// persisting `feature_flag.agent.backgroundReview` in the fake settings map.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import backgroundReview from '../electron/llm/backgroundReview'

// ─── Fake db ───────────────────────────────────────────────────────────────
// agentTask rows: [{ id, session_id, title, content, status, result, error, created_at }]
function mkDb({ tasks = [], settings = {}, memories = [] } = {}) {
  let nextId = tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1
  const db = {
    _tasks: tasks.slice().map(t => ({ ...t })),
    _settings: { ...settings },
    _memories: memories,
    created: [],
    updated: [],
    getSetting: (key) => db._settings[key] ?? null,
    setSetting: (key, value) => { db._settings[key] = value },
    createAgentTask({ session_id, title, content, model_id, agent_mode, priority, max_retry }) {
      const row = {
        id: nextId++,
        session_id, title, content, model_id, agent_mode,
        priority, max_retry,
        status: 'pending', result: null, error: null,
        created_at: new Date().toISOString(),
      }
      db._tasks.push(row)
      db.created.push(row)
      return row.id
    },
    updateAgentTask(id, patch) {
      const row = db._tasks.find(t => t.id === id)
      if (!row) return
      Object.assign(row, patch)
      db.updated.push({ id, ...patch })
    },
    listAgentTasks(limit = 100) {
      return db._tasks.slice(0, limit).map(t => ({ ...t }))
    },
    addMemoryWithProvenance(content, type, sessionId) {
      db._memories.push({ content, type, sessionId })
    },
  }
  return db
}

// ─── Temp dir helpers ──────────────────────────────────────────────────────
let tmpRoot
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backgroundReview-'))
})
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

function writeTmp(file, content) {
  const abs = path.join(tmpRoot, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

const ENABLED_SETTINGS = { 'feature_flag.agent.backgroundReview': '1' }

// ─── isReviewEnabled ───────────────────────────────────────────────────────
describe('isReviewEnabled', () => {
  it('returns false when the flag row is absent (default)', () => {
    const db = mkDb()
    expect(backgroundReview.isReviewEnabled(db)).toBe(false)
  })

  it('returns true when the flag is set to 1', () => {
    const db = mkDb({ settings: ENABLED_SETTINGS })
    expect(backgroundReview.isReviewEnabled(db)).toBe(true)
  })

  it('returns false for a null db without throwing', () => {
    expect(backgroundReview.isReviewEnabled(null)).toBe(false)
  })
})

// ─── parseChangedFilesOutput ────────────────────────────────────────────────
describe('parseChangedFilesOutput', () => {
  it('splits git stdout into trimmed non-empty lines', () => {
    expect(backgroundReview.parseChangedFilesOutput(' a.js\nb.ts \n\n  c.py\n')).toEqual(['a.js', 'b.ts', 'c.py'])
  })

  it('returns [] for empty/blank output', () => {
    expect(backgroundReview.parseChangedFilesOutput('')).toEqual([])
    expect(backgroundReview.parseChangedFilesOutput('   \n \n')).toEqual([])
  })
})

// ─── buildReviewFiles ───────────────────────────────────────────────────────
describe('buildReviewFiles', () => {
  it('reads existing files and returns path+content descriptors', () => {
    writeFile('src/a.js', 'const x = 1\n')
    writeFile('README.md', '# hi\n')
    const out = backgroundReview.buildReviewFiles(tmpRoot, ['src/a.js', 'README.md'])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ path: 'src/a.js', content: 'const x = 1\n' })
    expect(out[1]).toEqual({ path: 'README.md', content: '# hi\n' })
  })

  it('skips missing files', () => {
    writeFile('a.js', 'x')
    const out = backgroundReview.buildReviewFiles(tmpRoot, ['a.js', 'nope.js', 'sub/missing.js'])
    expect(out).toHaveLength(1)
    expect(out[0].path).toBe('a.js')
  })

  it('caps at MAX_REVIEW_FILES and ignores empty entries', () => {
    writeFile('f01.js', '1')
    writeFile('f02.js', '2')
    writeFile('f03.js', '3')
    writeFile('f04.js', '4')
    writeFile('f05.js', '5')
    writeFile('f06.js', '6')
    writeFile('f07.js', '7')
    writeFile('f08.js', '8')
    writeFile('f09.js', '9')
    writeFile('f10.js', '10')
    writeFile('f11.js', '11')
    const out = backgroundReview.buildReviewFiles(tmpRoot, [
      'f01.js', 'f02.js', 'f03.js', 'f04.js', 'f05.js',
      'f06.js', 'f07.js', 'f08.js', 'f09.js',
      'f10.js', 'f11.js',
    ])
    expect(out).toHaveLength(10)
  })
})

// ─── pendingReviewRows ───────────────────────────────────────────────────────
describe('pendingReviewRows', () => {
  it('returns only pending rows whose title starts with the prefix', () => {
    const db = mkDb({
      tasks: [
        { id: 1, title: 'background-review', status: 'pending', content: '{}', created_at: new Date().toISOString() },
        { id: 2, title: 'background-review', status: 'done', content: '{}', created_at: new Date().toISOString() },
        { id: 3, title: 'other task', status: 'pending', content: '{}', created_at: new Date().toISOString() },
        { id: 4, title: 'background-review-x', status: 'pending', content: '{}', created_at: new Date().toISOString() },
        { id: 5, title: 'background-review', status: 'pending', content: '{}', created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
      ],
    })
    const rows = backgroundReview.pendingReviewRows(db)
    expect(rows.map(r => r.id).sort()).toEqual([1, 4]) // skips done, other, stale
  })

  it('returns [] when db lacks the surface', () => {
    expect(backgroundReview.pendingReviewRows(null)).toEqual([])
    expect(backgroundReview.pendingReviewRows({})).toEqual([])
  })
})

// ─── parseReviewContent ──────────────────────────────────────────────────────
describe('parseReviewContent', () => {
  it('parses cwd/sessionId/files from JSON content', () => {
    const row = { content: JSON.stringify({ cwd: '/repo', sessionId: 7, files: ['a.js'] }) }
    expect(backgroundReview.parseReviewContent(row)).toEqual({ cwd: '/repo', sessionId: 7, files: ['a.js'] })
  })

  it('degrades to safe defaults on malformed content', () => {
    const row = { content: 'not-json' }
    expect(backgroundReview.parseReviewContent(row)).toEqual({ cwd: '', sessionId: null, files: [] })
    expect(backgroundReview.parseReviewContent({})).toEqual({ cwd: '', sessionId: null, files: [] })
  })
})

// ─── enqueueReview ───────────────────────────────────────────────────────────
describe('enqueueReview', () => {
  it('creates a pending task when enabled with changed files', () => {
    const db = mkDb({ settings: ENABLED_SETTINGS })
    const taskId = backgroundReview.enqueueReview({ db, cwd: tmpRoot, sessionId: 3, changedFiles: ['a.js', 'b.js'] })
    expect(taskId).toBeDefined()
    expect(typeof taskId).toBe('number')
    const row = db._tasks.find(t => t.id === taskId)
    expect(row.title).toBe('background-review')
    expect(row.status).toBe('pending')
    expect(JSON.parse(row.content)).toEqual({ cwd: tmpRoot, sessionId: 3, files: ['a.js', 'b.js'] })
  })

  it('skips when the flag is off', () => {
    const db = mkDb()
    const taskId = backgroundReview.enqueueReview({ db, cwd: tmpRoot, changedFiles: ['a.js'] })
    expect(taskId).toBeNull()
    expect(db.created).toHaveLength(0)
  })

  it('skips with an empty changed-file list', () => {
    const db = mkDb({ settings: ENABLED_SETTINGS })
    const taskId = backgroundReview.enqueueReview({ db, cwd: tmpRoot, changedFiles: [] })
    expect(taskId).toBeNull()
  })

  it('returns null when db lacks createAgentTask', () => {
    const db = { ...mkDb({ settings: ENABLED_SETTINGS }) }
    delete db.createAgentTask
    const taskId = backgroundReview.enqueueReview({ db, cwd: tmpRoot, changedFiles: ['a.js'] })
    expect(taskId).toBeNull()
  })

  it('never throws on a broken db', () => {
    const db = mkDb({ settings: ENABLED_SETTINGS })
    db.createAgentTask = () => { throw new Error('boom') }
    expect(() => backgroundReview.enqueueReview({ db, cwd: tmpRoot, changedFiles: ['a.js'] })).not.toThrow()
  })
})

// ─── writeTaskResult ──────────────────────────────────────────────────────────
describe('writeTaskResult', () => {
  const mkTask = () => ({
    id: 42, title: 'background-review', status: 'pending',
    content: JSON.stringify({ cwd: '/repo', sessionId: 7, files: ['a.js'] }),
    created_at: new Date().toISOString(),
  })

  it('persists status done + JSON result and mirrors a memory row', () => {
    const db = mkDb()
    const task = mkTask()
    db._tasks.push(task)
    backgroundReview.writeTaskResult(db, task, { issues: [{ severity: 'high' }], summary: 'found an issue' })
    const updated = db._tasks.find(t => t.id === 42)
    expect(updated.status).toBe('done')
    expect(JSON.parse(updated.result).issues).toHaveLength(1)
    expect(db._memories).toHaveLength(1)
    expect(db._memories[0].type).toBe('review')
    expect(db._memories[0].sessionId).toBe(7)
  })

  it('writes an empty result when result is missing', () => {
    const db = mkDb()
    const task = mkTask()
    db._tasks.push(task)
    backgroundReview.writeTaskResult(db, task, undefined)
    expect(JSON.parse(db._tasks[0].result)).toEqual({ issues: [], summary: '' })
  })

  it('does not throw on a db lacking the memory surface', () => {
    const db = mkDb()
    delete db.addMemoryWithProvenance
    const task = mkTask()
    db._tasks.push(task)
    expect(() => backgroundReview.writeTaskResult(db, task, { summary: 'x' })).not.toThrow()
  })
})

// ─── runPendingReviews ─────────────────────────────────────────────────────────
describe('runPendingReviews', () => {
  function mkReviewableDb() {
    writeFile('src/a.js', 'const x = 1\n')
    const db = mkDb({
      settings: ENABLED_SETTINGS,
      tasks: [
        {
          id: 10, title: 'background-review', status: 'pending',
          content: JSON.stringify({ cwd: tmpRoot, sessionId: 5, files: ['src/a.js'] }),
          created_at: new Date().toISOString(),
        },
      ],
    })
    return db
  }

  it('reviews pending tasks with the injected reviewFiles and marks them done', async () => {
    const db = mkReviewableDb()
    const calls = []
    const reviewFiles = async ({ files }) => {
      calls.push(files)
      return { issues: [], summary: `reviewed ${files.length} file(s)` }
    }
    const res = await backgroundReview.runPendingReviews(db, { provider: {}, model: {}, reviewFiles })
    expect(res).toEqual({ reviewed: 1, failed: 0 })
    expect(calls).toHaveLength(1)
    expect(calls[0][0].content).toBe('const x = 1\n')
    const row = db._tasks.find(t => t.id === 10)
    expect(row.status).toBe('done')
    expect(JSON.parse(row.result).summary).toContain('reviewed')
    expect(db._memories).toHaveLength(1)
  })

  it('marks a task done with a placeholder when no files are readable', async () => {
    const db = mkDb({
      settings: ENABLED_SETTINGS,
      tasks: [{ id: 11, title: 'background-review', status: 'pending', content: JSON.stringify({ cwd: tmpRoot, files: ['missing.js'] }), created_at: new Date().toISOString() }],
    })
    const reviewFiles = async () => ({ issues: [], summary: 'should not be called' })
    const res = await backgroundReview.runPendingReviews(db, { provider: {}, model: {}, reviewFiles })
    expect(res).toEqual({ reviewed: 1, failed: 0 })
    expect(db._tasks.find(t => t.id === 11).status).toBe('done')
    expect(JSON.parse(db._tasks.find(t => t.id === 11).result).summary).toBe('no files available to review')
  })

  it('marks a throwing reviewFiles as error and continues', async () => {
    writeFile('src/a.js', 'x')
    const db = mkDb({
      settings: ENABLED_SETTINGS,
      tasks: [
        { id: 12, title: 'background-review', status: 'pending', content: JSON.stringify({ cwd: tmpRoot, files: ['src/a.js'] }), created_at: new Date().toISOString() },
      ],
    })
    const reviewFiles = async () => { throw new Error('review boom') }
    const res = await backgroundReview.runPendingReviews(db, { provider: {}, model: {}, reviewFiles })
    expect(res).toEqual({ reviewed: 0, failed: 1 })
    expect(db._tasks.find(t => t.id === 12).status).toBe('error')
    expect(db._tasks.find(t => t.id === 12).error).toContain('review boom')
  })

  it('returns zero counts when there are no pending tasks', async () => {
    const db = mkDb()
    const res = await backgroundReview.runPendingReviews(db, { provider: {}, model: {}, reviewFiles: async () => ({ issues: [], summary: '' }) })
    expect(res).toEqual({ reviewed: 0, failed: 0 })
  })
})

function writeFile(rel, content) {
  const abs = path.join(tmpRoot, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}