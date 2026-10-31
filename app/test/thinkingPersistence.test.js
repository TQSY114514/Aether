import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import migration007 from '../electron/migrations/007_message_thinking_content.js'
import { createEmptyDatabase } from '../electron/db/schema.js'
import { buildToolLoopCallbacks } from '../electron/ipc/toolLoopCallbacks.js'

const tmpDirs = []
function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'thinking-test-'))
  tmpDirs.push(dir)
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  return { db, dbPath, dir }
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }) } catch {}
  }
})

describe('Feature 1: Thinking Content Persistence in SQLite', () => {
  it('Migration 007 adds thinking_content and thinking_duration_ms columns to message table', () => {
    const { db } = makeTempDb()
    db.exec(`
      CREATE TABLE message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `)

    let cols = db.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    expect(cols).not.toContain('thinking_content')
    expect(cols).not.toContain('thinking_duration_ms')

    migration007.up(db)

    cols = db.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    expect(cols).toContain('thinking_content')
    expect(cols).toContain('thinking_duration_ms')

    // Test down() does not throw
    expect(() => migration007.down(db)).not.toThrow()
    db.close()
  })

  it('Fresh headless DB schema includes thinking columns in message table', () => {
    const { dir } = makeTempDb()
    const dbPath = join(dir, 'fresh.db')
    const db = createEmptyDatabase(dbPath)

    const cols = db.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    expect(cols).toContain('thinking_content')
    expect(cols).toContain('thinking_duration_ms')

    const testThinking = 'Analyzing the problem deeply...\nStep 1: check parameters.'
    const testDuration = 4520

    const stmt = db.prepare(`
      INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `)
    const info = stmt.run(1, 'assistant', 'Final answer here', testThinking, testDuration)
    const msgId = Number(info.lastInsertRowid)

    const row = db.prepare('SELECT id, role, content, thinking_content, thinking_duration_ms FROM message WHERE id = ?').get(msgId)
    expect(row).toBeDefined()
    expect(row.thinking_content).toBe(testThinking)
    expect(row.thinking_duration_ms).toBe(testDuration)

    // Verify update
    db.prepare('UPDATE message SET thinking_content = ?, thinking_duration_ms = ? WHERE id = ?')
      .run('Updated reasoning', 5100, msgId)

    const updated = db.prepare('SELECT thinking_content, thinking_duration_ms FROM message WHERE id = ?').get(msgId)
    expect(updated.thinking_content).toBe('Updated reasoning')
    expect(updated.thinking_duration_ms).toBe(5100)
    db.close()
  })

  it('toolLoopCallbacks accumulates thinking deltas and records duration accurately', () => {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: () => {},
      },
    }

    const callbacks = buildToolLoopCallbacks({
      messageId: 42,
      sessionId: 10,
      targetWindow: mockWindow,
      onStreamChunk: () => {},
    })

    expect(typeof callbacks.getThinkingData).toBe('function')
    expect(callbacks.getThinkingData()).toEqual({
      content: '',
      durationMs: 0,
    })

    // Simulate start of thinking
    callbacks.onThinkingStart?.()

    // Simulate streaming deltas
    callbacks.onThinkingDelta?.('Thinking step 1... ')
    callbacks.onThinkingDelta?.('Step 2 completes.')

    // Simulate end of thinking
    callbacks.onThinkingEnd?.()

    const thinkingData = callbacks.getThinkingData()
    expect(thinkingData.content).toBe('Thinking step 1... Step 2 completes.')
    expect(typeof thinkingData.durationMs).toBe('number')
    expect(thinkingData.durationMs).toBeGreaterThanOrEqual(0)
  })
})
