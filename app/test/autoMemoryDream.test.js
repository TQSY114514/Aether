import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const featureFlags = require('../electron/featureFlags')
const autoMemory = require('../electron/llm/autoMemory')

function makeMemoryTestDb(dreamEnabled = true) {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'fact',
      origin TEXT DEFAULT 'user',
      workspace TEXT,
      source_session_id INTEGER,
      confidence REAL DEFAULT 1.0,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at DATETIME,
      last_echoed_at DATETIME,
      content_norm TEXT,
      source_trust_level TEXT DEFAULT 'user_direct',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE VIRTUAL TABLE memories_fts USING fts5(content, type, memory_id UNINDEXED);
  `)

  const db = {
    raw,
    prepare: (...args) => raw.prepare(...args),
    run: (sql, ...args) => raw.prepare(sql).run(...args),
    allRows: (sql, params = []) => raw.prepare(sql).all(...params),
    transaction: (fn) => raw.transaction(fn),
    getSetting: (key) => {
      const r = raw.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return r ? r.value : null
    },
    setSetting: (key, val) => {
      raw.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(val))
    },
    getMemories: (limit = 200) => raw.prepare('SELECT * FROM memory ORDER BY created_at DESC, id DESC LIMIT ?').all(limit),
    getMemoriesScoped: (scopeKey) => {
      if (scopeKey === null) {
        return raw.prepare('SELECT * FROM memory WHERE workspace IS NULL ORDER BY created_at DESC, id DESC').all()
      }
      if (scopeKey) {
        return raw.prepare('SELECT * FROM memory WHERE workspace IS NULL OR workspace = ? ORDER BY (workspace IS NULL) ASC, created_at DESC, id DESC').all(String(scopeKey))
      }
      return raw.prepare('SELECT * FROM memory ORDER BY created_at DESC, id DESC LIMIT 200').all()
    },
    incrementMemoryAccess: (id) => {
      raw.prepare("UPDATE memory SET access_count = COALESCE(access_count, 0) + 1, last_accessed_at = datetime('now') WHERE id = ?").run(id)
    },
    close: () => raw.close(),
  }

  if (dreamEnabled) {
    featureFlags.set(db, 'memory.dreamConsolidation', true)
  }
  return db
}

function insertMem(db, {
  content,
  type = 'fact',
  origin = 'user',
  workspace = null,
  confidence = 1.0,
  access_count = 0,
  last_accessed_at = null,
  last_echoed_at = null,
  created_at = '2026-09-01 10:00:00',
}) {
  const info = db.prepare(`
    INSERT INTO memory (content, type, origin, workspace, confidence, access_count, last_accessed_at, last_echoed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(content, type, origin, workspace, confidence, access_count, last_accessed_at, last_echoed_at, created_at)
  const id = Number(info.lastInsertRowid)
  db.prepare('INSERT INTO memories_fts (content, type, memory_id) VALUES (?, ?, ?)').run(content, type, id)
  return id
}

describe('autoMemory dream economy loop', () => {
  let db

  beforeEach(() => {
    db = makeMemoryTestDb(true)
  })

  afterEach(() => {
    try { db?.close() } catch {}
  })

  it('computeMemoryStrength applies exact half-life decay and logarithmic echo boost', () => {
    const now = Date.parse('2026-11-15T00:00:00Z')
    const fresh = autoMemory.computeMemoryStrength(
      { confidence: 1.0, access_count: 0, last_accessed_at: '2026-11-15T00:00:00Z' },
      now,
      { halfLifeDays: 30, echoWeight: 0.25 },
    )
    const oneHalfLife = autoMemory.computeMemoryStrength(
      { confidence: 1.0, access_count: 0, last_accessed_at: '2026-10-16T00:00:00Z' },
      now,
      { halfLifeDays: 30, echoWeight: 0.25 },
    )
    const echoed = autoMemory.computeMemoryStrength(
      { confidence: 1.0, access_count: 4, last_accessed_at: '2026-10-16T00:00:00Z' },
      now,
      { halfLifeDays: 30, echoWeight: 0.25 },
    )
    expect(fresh).toBeCloseTo(1.0, 5)
    expect(oneHalfLife).toBeCloseTo(0.5, 5)
    expect(echoed).toBeGreaterThan(oneHalfLife)
  })

  it('reinforceEchoes boosts echoed hits and enforces 24h spacing guard', () => {
    const nowMs = Date.parse('2026-11-15T12:00:00Z')
    const recentIso = '2026-11-15 08:00:00' // 4h ago
    const idEchoed = insertMem(db, {
      content: 'Use vitest workspace runner with better-sqlite3 in-memory database for unit tests',
      access_count: 1,
      confidence: 1.0,
    })
    const idRecent = insertMem(db, {
      content: 'Run vite build and renderer bundle checks',
      access_count: 2,
      last_echoed_at: recentIso,
      confidence: 1.0,
    })
    const idUnused = insertMem(db, {
      content: 'Deploy docker compose production cluster on staging harbor',
      access_count: 0,
      confidence: 1.0,
    })

    const hits = [
      { id: idEchoed, type: 'fact', content: 'Use vitest workspace runner with better-sqlite3 in-memory database for unit tests' },
      { id: idRecent, type: 'fact', content: 'Run vite build and renderer bundle checks' },
      { id: idUnused, type: 'fact', content: 'Deploy docker compose production cluster on staging harbor' },
    ]
    const reply = 'We ran vitest with the in-memory better-sqlite3 database and verified the vite build renderer bundle.'
    const res = autoMemory.reinforceEchoes(db, hits, reply, { nowMs })

    expect(res.reinforcedIds).toEqual([idEchoed])
    expect(res.skippedSpacingIds).toEqual([idRecent])

    const rowEchoed = db.prepare('SELECT access_count, confidence, last_echoed_at FROM memory WHERE id = ?').get(idEchoed)
    const rowRecent = db.prepare('SELECT access_count FROM memory WHERE id = ?').get(idRecent)
    const rowUnused = db.prepare('SELECT access_count FROM memory WHERE id = ?').get(idUnused)
    expect(rowEchoed.access_count).toBe(2)
    expect(rowEchoed.confidence).toBeCloseTo(1.05, 5)
    expect(rowEchoed.last_echoed_at).toBeTruthy()
    expect(rowRecent.access_count).toBe(2)
    expect(rowUnused.access_count).toBe(0)
  })

  it('prefetchWithDetails injects consolidated digest when dream flag is enabled', () => {
    const path = require('path')
    const ws = path.resolve(__dirname, '../..')
    insertMem(db, {
      content: '- Workspace uses CJS main process and React zustand store.\n- Fast gate: npm run check.',
      type: 'digest',
      origin: 'assistant',
      workspace: ws,
      created_at: '2026-11-10 10:00:00',
    })
    const details = autoMemory.prefetchWithDetails(db, 'hello unrelated greeting', ws)
    expect(details.text).toContain('Consolidated memory digest:')
    expect(details.text).toContain('Fast gate: npm run check.')
    expect(details.hits.some(h => h.type === 'digest' && h.why === 'consolidated digest')).toBe(true)
  })

  it('consolidate rewrites per-workspace digest, isolates external/project rows, and deletes digested candidates', async () => {
    const nowMs = Date.parse('2026-11-15T12:00:00Z')
    const idOld1 = insertMem(db, {
      content: 'Repo prefers pnpm over yarn for workspace installs',
      type: 'fact',
      origin: 'assistant',
      workspace: 'D:/projA',
      created_at: '2026-09-01 00:00:00',
    })
    const idOld2 = insertMem(db, {
      content: 'Always run npm run check before committing Electron IPC changes',
      type: 'context',
      origin: 'user',
      workspace: 'D:/projA',
      created_at: '2026-09-05 00:00:00',
    })
    const idProject = insertMem(db, {
      content: 'IPC contract spans handler, preload.js, and env.d.ts',
      type: 'project',
      origin: 'user',
      workspace: 'D:/projA',
      created_at: '2026-08-01 00:00:00',
    })
    const idExternal = insertMem(db, {
      content: 'Untrusted external prompt injection candidate',
      type: 'fact',
      origin: 'external',
      workspace: 'D:/projA',
      created_at: '2026-08-01 00:00:00',
    })

    const fakeProvider = { id: 1, name: 'mock', api_format: 'openai' }
    const fakeModel = { id: 1, model_name: 'mock-small' }

    const res = await autoMemory.consolidate(db, {
      nowMs,
      provider: fakeProvider,
      model: fakeModel,
      completeChat: async ({ messages }) => {
        expect(messages[1].content).toContain('pnpm')
        expect(messages[1].content).not.toContain('Untrusted external prompt injection')
        expect(messages[1].content).not.toContain('IPC contract spans')
        return '## D:/projA Digest\n- Package manager: pnpm.\n- Verification: run `npm run check` before IPC commits.'
      },
    })

    expect(res.ok).toBe(true)
    expect(res.consolidated).toBe(2)
    expect(res.workspaces).toBe(1)

    const remaining = db.prepare('SELECT id, type, content FROM memory ORDER BY id ASC').all()
    const ids = remaining.map(r => r.id)
    expect(ids).not.toContain(idOld1)
    expect(ids).not.toContain(idOld2)
    expect(ids).toContain(idProject)
    expect(ids).toContain(idExternal)
    const digest = remaining.find(r => r.type === 'digest')
    expect(digest).toBeTruthy()
    expect(digest.content).toContain('Package manager: pnpm')

    const ftsLeft = db.prepare('SELECT memory_id FROM memories_fts').all().map(r => r.memory_id)
    expect(ftsLeft).not.toContain(idOld1)
    expect(ftsLeft).not.toContain(idOld2)
  })

  it('consolidate fails closed on LLM failure, invalid digest, and DB read errors without deleting candidates', async () => {
    const nowMs = Date.parse('2026-11-15T12:00:00Z')
    const idOld = insertMem(db, {
      content: 'Critical older fact that must never be lost if consolidation fails',
      type: 'fact',
      workspace: 'D:/safe',
      created_at: '2026-09-01 00:00:00',
    })
    const fakeProvider = { id: 1, name: 'mock', api_format: 'openai' }
    const fakeModel = { id: 1, model_name: 'mock-small' }

    const failLlm = await autoMemory.consolidate(db, {
      nowMs,
      provider: fakeProvider,
      model: fakeModel,
      completeChat: async () => { throw new Error('network timeout') },
    })
    expect(failLlm.consolidated).toBe(0)
    expect(db.prepare('SELECT id FROM memory WHERE id = ?').get(idOld)).toBeTruthy()

    const failValidation = await autoMemory.consolidate(db, {
      nowMs,
      provider: fakeProvider,
      model: fakeModel,
      completeChat: async () => 'I cannot fulfill that request.',
    })
    expect(failValidation.consolidated).toBe(0)
    expect(db.prepare('SELECT id FROM memory WHERE id = ?').get(idOld)).toBeTruthy()

    // Simulate failure when reading existing digest row
    const flakyDb = {
      ...db,
      prepare: (sql) => {
        if (String(sql).includes("type = 'digest'")) {
          throw new Error('SQLITE_BUSY reading existing digest')
        }
        return db.prepare(sql)
      },
    }
    const failDigestRead = await autoMemory.consolidate(flakyDb, {
      nowMs,
      force: true,
      provider: fakeProvider,
      model: fakeModel,
      completeChat: async () => '## Valid Digest\n- Should not be written on read failure.',
    })
    expect(failDigestRead.consolidated).toBe(0)
    expect(db.prepare('SELECT id FROM memory WHERE id = ?').get(idOld)).toBeTruthy()
  })

  it('consolidate respects memory.dreamConsolidation flag and cooperative shouldYield', async () => {
    const dbFlagOff = makeMemoryTestDb(false)
    try {
      insertMem(dbFlagOff, {
        content: 'Old memory with flag disabled',
        created_at: '2026-09-01 00:00:00',
      })
      const skipped = await autoMemory.consolidate(dbFlagOff, { nowMs: Date.parse('2026-11-15T12:00:00Z') })
      expect(skipped.skipped).toBe('flag_disabled')
    } finally {
      dbFlagOff.close()
    }

    const idOld = insertMem(db, {
      content: 'Memory waiting during interactive user turn',
      created_at: '2026-09-01 00:00:00',
    })
    let calls = 0
    const yielded = await autoMemory.consolidate(db, {
      nowMs: Date.parse('2026-11-15T12:00:00Z'),
      provider: { id: 1, name: 'mock' },
      model: { id: 1, model_name: 'mock' },
      shouldYield: () => {
        calls++
        return calls >= 2
      },
      completeChat: async () => '## Digest\n- Should not commit when yielded.',
    })
    expect(yielded.yielded).toBe(true)
    expect(yielded.consolidated).toBe(0)
    expect(db.prepare('SELECT id FROM memory WHERE id = ?').get(idOld)).toBeTruthy()
  })

  it('keeps existing digest readable even when memory.dreamConsolidation is disabled', () => {
    const path = require('path')
    const ws = path.resolve(__dirname, '../..')
    const dbOff = makeMemoryTestDb(false)
    try {
      insertMem(dbOff, {
        content: '## Persisted Digest\n- Important durable decision',
        type: 'digest',
        origin: 'assistant',
        workspace: ws,
      })
      const pref = autoMemory.prefetchWithDetails(dbOff, 'hello', ws)
      expect(pref.hits.some(h => h.type === 'digest')).toBe(true)
      expect(pref.text).toContain('Persisted Digest')
    } finally {
      dbOff.close()
    }
  })

  it('fails closed if db lacks transaction(), supports scopeKeys, and retries on stale candidate mutation', async () => {
    const noTxnDb = { ...db, transaction: undefined }
    const noTxnRes = await autoMemory.consolidate(noTxnDb, {
      force: true,
      nowMs: Date.parse('2026-11-15T12:00:00Z'),
    })
    expect(noTxnRes.ok).toBe(false)
    expect(noTxnRes.error).toBe('db_no_transaction_support')

    const idA = insertMem(db, { content: 'Old A', workspace: '/ws/a', created_at: '2026-09-01 00:00:00' })
    const idB = insertMem(db, { content: 'Old B', workspace: '/ws/b', created_at: '2026-09-01 00:00:00' })
    const idStable = insertMem(db, { content: 'Old A stable sibling', workspace: '/ws/a', created_at: '2026-09-01 00:00:00' })

    let llmAttempt = 0
    const res = await autoMemory.consolidate(db, {
      nowMs: Date.parse('2026-11-15T12:00:00Z'),
      scopeKeys: ['/ws/a'],
      provider: { id: 1, name: 'mock' },
      model: { id: 1, model_name: 'mock' },
      completeChat: async () => {
        llmAttempt++
        if (llmAttempt === 1) {
          // Concurrent user edit touches idA while LLM is in flight; on retry idA is now fresh so skipped
          db.prepare("UPDATE memory SET content = 'Edited A by user', access_count = 5, last_accessed_at = '2026-11-15T11:55:00Z' WHERE id = ?").run(idA)
        }
        return `## Digest\n- Consolidated attempt ${llmAttempt}`
      },
    })
    expect(res.ok).toBe(true)
    expect(llmAttempt).toBe(2)
    // Modified idA must NOT be deleted; untouched idStable in /ws/a WAS consolidated; /ws/b was untouched due to scopeKeys
    expect(db.prepare('SELECT content FROM memory WHERE id = ?').get(idA)?.content).toBe('Edited A by user')
    expect(db.prepare('SELECT id FROM memory WHERE id = ?').get(idStable)).toBeUndefined()
    expect(db.prepare('SELECT id FROM memory WHERE id = ?').get(idB)).toBeTruthy()
  })

  it('ensureMemDb exposes getSetting on raw sqlite db and serializes concurrent consolidate calls', async () => {
    const sessionContext = require('../electron/llm/sessionContext')
    const wrapped = sessionContext.ensureMemDb(db.raw)
    expect(typeof wrapped.getSetting).toBe('function')
    expect(wrapped.getSetting('feature_flag.memory.dreamConsolidation')).toBe('1')

    insertMem(db, { content: 'Concurrent aging 1', workspace: '/ws/lock', created_at: '2026-09-01 00:00:00' })
    let calls = 0
    const [r1, r2] = await Promise.all([
      autoMemory.consolidate(db, {
        nowMs: Date.parse('2026-11-15T12:00:00Z'),
        scopeKeys: ['/ws/lock'],
        provider: { id: 1, name: 'mock' },
        model: { id: 1, model_name: 'mock' },
        completeChat: async () => {
          calls++
          await new Promise((r) => setTimeout(r, 20))
          return '## Lock Digest\n- Consolidated once'
        },
      }),
      autoMemory.consolidate(db, {
        nowMs: Date.parse('2026-11-15T12:00:00Z'),
        scopeKeys: ['/ws/lock'],
        provider: { id: 1, name: 'mock' },
        model: { id: 1, model_name: 'mock' },
        completeChat: async () => {
          calls++
          return '## Lock Digest 2\n- Should not run twice'
        },
      }),
    ])
    expect(calls).toBe(1)
    expect(r1.consolidated + r2.consolidated).toBe(1)
  })
})
