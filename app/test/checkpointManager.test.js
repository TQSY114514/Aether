import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const checkpointMgr = require('../electron/llm/checkpointManager')

describe('Agent Checkpoint Manager', () => {
  let db

  beforeEach(() => {
    db = new Database(':memory:')
    checkpointMgr.createTable(db)
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('creates the agent_turn_checkpoint table and indexes idempotently', () => {
    const tableInfo = db.prepare("PRAGMA table_info('agent_turn_checkpoint')").all()
    const cols = tableInfo.map(c => c.name)
    expect(cols).toContain('session_id')
    expect(cols).toContain('turn_id')
    expect(cols).toContain('step_index')
    expect(cols).toContain('messages')
    expect(cols).toContain('tool_trace')
    expect(cols).toContain('checkpoint_meta')

    // Idempotent call doesn't throw
    expect(() => checkpointMgr.createTable(db)).not.toThrow()
  })

  it('saves and loads turn checkpoints with JSON serialization', () => {
    const messages = [{ role: 'user', content: 'test' }]
    const toolTrace = [{ name: 'read_file', latencyMs: 12 }]
    const meta = { tag: 'milestone' }

    const id = checkpointMgr.save(db, 101, 1, 0, messages, toolTrace, meta)
    expect(typeof id === 'number' || id > 0).toBe(true)

    const loaded = checkpointMgr.load(db, 101, 1)
    expect(loaded).not.toBeNull()
    expect(loaded.session_id).toBe(101)
    expect(loaded.turn_id).toBe(1)
    expect(loaded.step_index).toBe(0)
    expect(loaded.messages).toEqual(messages)
    expect(loaded.toolTrace).toEqual(toolTrace)
    expect(loaded.meta).toEqual(meta)
  })

  it('filters checkpoints with beforeStep when loading', () => {
    checkpointMgr.save(db, 101, 1, 0, [{ content: 'step 0' }])
    checkpointMgr.save(db, 101, 1, 5, [{ content: 'step 5' }])
    checkpointMgr.save(db, 101, 1, 10, [{ content: 'step 10' }])

    const loaded = checkpointMgr.load(db, 101, 1, 8)
    expect(loaded).not.toBeNull()
    expect(loaded.step_index).toBe(5)
    expect(loaded.messages).toEqual([{ content: 'step 5' }])
  })

  it('lists checkpoints for a session in descending order', () => {
    checkpointMgr.save(db, 101, 1, 0, [{ content: 'first' }], [], { label: 'cp1' })
    checkpointMgr.save(db, 101, 1, 5, [{ content: 'second' }], [], { label: 'cp2' })

    const list = checkpointMgr.listForSession(db, 101)
    expect(list.length).toBe(2)
    expect(list[0].stepIndex).toBe(5)
    expect(list[0].meta.label).toBe('cp2')
    expect(list[1].stepIndex).toBe(0)
    expect(list[1].meta.label).toBe('cp1')
  })

  it('deletes checkpoints for a session or by single id', () => {
    const id1 = checkpointMgr.save(db, 101, 1, 0, [{ content: 'a' }])
    const id2 = checkpointMgr.save(db, 101, 1, 1, [{ content: 'b' }])

    checkpointMgr.deleteOne(db, id1)
    let list = checkpointMgr.listForSession(db, 101)
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(id2)

    checkpointMgr.deleteForSession(db, 101)
    list = checkpointMgr.listForSession(db, 101)
    expect(list.length).toBe(0)
  })

  it('shouldAutoCheckpoint triggers every 5 steps', () => {
    expect(checkpointMgr.shouldAutoCheckpoint(0, [])).toBe(false)
    expect(checkpointMgr.shouldAutoCheckpoint(5, [])).toBe(true)
    expect(checkpointMgr.shouldAutoCheckpoint(10, [])).toBe(true)
    expect(checkpointMgr.shouldAutoCheckpoint(3, [])).toBe(false)
  })
})
