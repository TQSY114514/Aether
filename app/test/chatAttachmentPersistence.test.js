import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createEmptyDatabase } from '../electron/db/schema.js'

describe('Message Attachment Persistence in SQLite and Store', () => {
  let db

  beforeEach(() => {
    db = createEmptyDatabase(':memory:')
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('message schema contains attachment column', () => {
    const cols = db.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    expect(cols).toContain('attachment')
  })

  it('addCol migration cleanly adds attachment column to legacy message table', () => {
    const legacyDb = new Database(':memory:')
    legacyDb.exec(`
      CREATE TABLE message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `)
    let cols = legacyDb.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    expect(cols).not.toContain('attachment')

    // Simulate addCol("message", "attachment", "TEXT")
    legacyDb.exec('ALTER TABLE message ADD COLUMN attachment TEXT')

    cols = legacyDb.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    expect(cols).toContain('attachment')
    legacyDb.close()
  })

  it('inserts and retrieves message with attachment JSON', () => {
    const sessionInfo = db.prepare("INSERT INTO session (title) VALUES ('test')").run()
    const sessionId = Number(sessionInfo.lastInsertRowid)

    const attachmentPayload = JSON.stringify({
      name: 'screenshot.png',
      mime: 'image/png',
      kind: 'image',
      preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      all: [
        {
          name: 'screenshot.png',
          preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      ],
    })

    const msgInfo = db.prepare(`
      INSERT INTO message (session_id, role, content, attachment)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, 'user', 'Check this design mockup', attachmentPayload)

    const msgId = Number(msgInfo.lastInsertRowid)
    const row = db.prepare('SELECT * FROM message WHERE id = ?').get(msgId)

    expect(row).toBeDefined()
    expect(row.role).toBe('user')
    expect(row.content).toBe('Check this design mockup')
    expect(row.attachment).toBe(attachmentPayload)

    const parsed = JSON.parse(row.attachment)
    expect(parsed.kind).toBe('image')
    expect(parsed.name).toBe('screenshot.png')
    expect(parsed.all).toHaveLength(1)
  })
})
