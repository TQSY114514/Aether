// ─── Session lifecycle tests against the REAL database.js ───────────────────
// database.js is a singleton: initDatabase() binds a module-scoped `db` from
// app.getPath('userData'). 'electron' is an external dep (node_modules), so
// vitest's vi.mock registry does NOT intercept database.js's internal
// require('electron') — instead we seed Node's real require.cache with an
// Electron stub (app.getPath → temp dir + safeStorage). This is hit by both
// vitest-transformed and native requires. We then call the real initDatabase()
// so the real schema is created, exercise the exported CRUD functions, and
// close + remove the temp dir afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const nodeRequire = createRequire(import.meta.url)

let database
let tmpDir = null
let restoredEntry = null

describe('session lifecycle (real SQLite via initDatabase)', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-session-test-'))
    const electronPath = nodeRequire.resolve('electron')
    restoredEntry = nodeRequire.cache[electronPath]
    nodeRequire.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        app: { getPath: () => tmpDir },
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (s) => Buffer.from(String(s)),
          decryptString: (b) => b.toString(),
        },
      },
    }
    database = await import('../electron/database')
    database.initDatabase()
  })

  afterAll(() => {
    if (database && typeof database.closeDatabase === 'function') database.closeDatabase()
    if (restoredEntry === undefined) {
      const electronPath = nodeRequire.resolve('electron')
      delete nodeRequire.cache[electronPath]
    }
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it('createSession writes an is_placeholder=1 row', () => {
    const { lastInsertRowid } = database.createSession({ title: 't1' })
    const row = database.getSession(lastInsertRowid)
    expect(row && row.is_placeholder).toBe(1)
  })

  it('deleteSession removes the session and its messages', () => {
    const sid = database.createSession({ title: 't2' }).lastInsertRowid
    database.addMessage({ session_id: sid, role: 'user', content: 'hi' })
    expect(database.getMessages(sid).length).toBe(1)
    database.deleteSession(sid)
    expect(database.getSession(sid)).toBeNull()
    expect(database.getMessages(sid).length).toBe(0)
  })

  it('pruneEmptySessions removes only placeholder sessions without messages', () => {
    const empty = database.createSession({ title: 'empty' }).lastInsertRowid // placeholder, no messages
    const used = database.createSession({ title: 'used' }).lastInsertRowid
    database.addMessage({ session_id: used, role: 'user', content: 'keeps me' }) // flips is_placeholder to 0
    database.pruneEmptySessions()
    expect(database.getSession(empty)).toBeNull()
    expect(database.getSession(used)).not.toBeNull()
  })

  it('deleteAssistantAfterLastUser drops assistant rows after the last user message', () => {
    const sid = database.createSession({ title: 't3' }).lastInsertRowid
    database.addMessage({ session_id: sid, role: 'user', content: 'u1' })
    database.addMessage({ session_id: sid, role: 'assistant', content: 'a1' })
    database.addMessage({ session_id: sid, role: 'assistant', content: 'a2' })
    database.addMessage({ session_id: sid, role: 'user', content: 'u2' })
    database.addMessage({ session_id: sid, role: 'assistant', content: 'a3' })
    database.deleteAssistantAfterLastUser(sid)
    expect(database.getMessages(sid).map((m) => m.content)).toEqual(['u1', 'a1', 'a2', 'u2'])
  })

  it('settings round-trip (the onboarding_done persistence surface)', async () => {
    expect(database.getSetting('onboarding_done')).toBeNull()
    await database.setSetting('onboarding_done', '1')
    expect(database.getSetting('onboarding_done')).toBe('1')
  })
})
