import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

const {
  SUMMARY_SECTIONS,
  buildSummarizerSystemPrompt,
  extractErrorAnchors,
  maybeCompact,
  clearCompactionState,
} = require('../electron/llm/compaction')
const { generateHandoffDraft, commitHandoff } = require('../electron/llm/handoff')
import { parseSessionCommand, SLASH_COMMANDS } from '../tui/sessionCommands.js'

function createMinimalDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      persona_id INTEGER,
      parent_session_id INTEGER,
      config TEXT,
      session_kind TEXT DEFAULT 'chat',
      project_id INTEGER,
      cwd TEXT,
      model_id INTEGER,
      updated_at TEXT,
      is_placeholder INTEGER DEFAULT 0
    );
    CREATE TABLE message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      status TEXT DEFAULT 'done',
      created_at TEXT
    );
    CREATE VIRTUAL TABLE messages_fts USING fts5(content, session_id UNINDEXED, message_id UNINDEXED);
  `)
  return db
}

describe('Anchored Compaction (8 sections & error anchors)', () => {
  beforeEach(() => clearCompactionState())
  afterEach(() => clearCompactionState())

  it('defines all 8 code-anchored summary sections and verified/unverified integrity rule', () => {
    expect(SUMMARY_SECTIONS).toEqual([
      'Goal',
      'Constraints & Decisions',
      'Files & Locations',
      'Progress',
      'Errors & Verification Status',
      'Next Steps',
      'Critical Context',
      'Open Questions',
    ])
    const sys = buildSummarizerSystemPrompt(null, 'Prioritize TypeScript compiler failures')
    expect(sys).toContain('≤600 词')
    expect(sys).toContain('严禁把未验证的修改提案或局部/过滤测试结果写成已验证通过')
    expect(sys).toContain('Prioritize TypeScript compiler failures')
    expect(sys).toContain('## Errors & Verification Status')
  })

  it('extracts concise deduplicated error anchors from tool/assistant messages', () => {
    const msgs = [
      { role: 'user', content: 'Run tests' },
      { role: 'tool', content: 'ok: build succeeded' },
      { role: 'tool', content: 'FAIL test/auth.test.js\nTypeError: Cannot read properties of undefined (reading id)' },
      { role: 'assistant', content: 'Attempting fix now' },
      { role: 'tool', content: 'Error: ENOENT: no such file or directory, open foo.ts' },
    ]
    const anchors = extractErrorAnchors(msgs, 4)
    expect(anchors).toHaveLength(2)
    expect(anchors[0]).toContain('FAIL test/auth.test.js')
    expect(anchors[1]).toContain('ENOENT')
  })

  it('injects error anchors into fallback compaction block when summarization fails', async () => {
    const big = Array.from({ length: 500 }, (_, j) => `token_${j}`).join(' ')
    const msgs = [
      { role: 'system', content: 'sys' },
      ...Array.from({ length: 24 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0
          ? `user turn ${i}`
          : (i === 3 ? `${big}\nTypeError: boom at auth.ts:42` : `${big} assistant_${i}`),
      })),
    ]
    const out = await maybeCompact({
      provider: { api_url: 'http://127.0.0.1:1', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: msgs,
      budget: 12000,
      force: true,
    })
    expect(out).not.toBeNull()
    const sysSummary = out.find(m => m.role === 'system' && m !== msgs[0])
    expect(sysSummary.content).toContain('recent error anchors')
    expect(sysSummary.content).toContain('TypeError: boom at auth.ts:42')
  })
})

describe('Amp-style 2-step Editable Handoff', () => {
  let db

  beforeEach(() => {
    db = createMinimalDb()
    db.prepare("INSERT INTO session (title, cwd, updated_at) VALUES (?, ?, '2026-11-14 12:00:00')").run('Debug Auth', '/repo')
    db.prepare("INSERT INTO message (session_id, role, content) VALUES (1, 'user', 'Fix token refresh bug in src/auth.ts')").run()
    db.prepare("INSERT INTO message (session_id, role, content) VALUES (1, 'assistant', 'Found bug in app/electron/llm/auth.js')").run()
    db.prepare("INSERT INTO message (session_id, role, content) VALUES (1, 'tool', 'FAIL test/auth.test.js TypeError: invalid token')").run()
  })

  afterEach(() => {
    try { db.close() } catch {}
  })

  it('generateHandoffDraft produces deterministic structured fallback when no provider exists', async () => {
    const draft = await generateHandoffDraft({
      db,
      sessionId: 1,
      goal: 'Patch auth refresh and rerun full vitest suite',
    })
    expect(draft.source).toBe('fallback')
    expect(draft.title).toContain('Patch auth refresh')
    expect(draft.draftPrompt).toContain('## Objective')
    expect(draft.draftPrompt).toContain('Patch auth refresh and rerun full vitest suite')
    expect(draft.draftPrompt).toContain('app/electron/llm/auth.js')
    expect(draft.draftPrompt).toContain('TypeError: invalid token')
  })

  it('generateHandoffDraft uses LLM completeChat when provider/model are provided', async () => {
    const draft = await generateHandoffDraft({
      db,
      sessionId: 1,
      goal: 'Finish migration',
      provider: { api_format: 'openai', api_url: 'http://localhost', api_key: 'test' },
      model: { id: 1, model_name: 'gpt-4o-mini' },
      completeChat: async () => '## Objective\nFinish migration cleanly\n\n## Immediate Next Action\nRun npm test',
    })
    expect(draft.source).toBe('llm')
    expect(draft.modelUsed).toBe('gpt-4o-mini')
    expect(draft.draftPrompt).toContain('Finish migration cleanly')
  })

  it('commitHandoff creates a clean child session with zero parent noise, parent link, FTS entry, and parent notice', () => {
    const editedPrompt = '## Objective\nUser-edited clean handoff\n## Immediate Next Action\nVerify tests'
    const created = commitHandoff({
      db,
      parentSessionId: 1,
      prompt: editedPrompt,
      title: 'Clean Auth Continuation',
    })

    expect(created.sessionId).toBeGreaterThan(1)
    expect(created.parentSessionId).toBe(1)

    const childSess = db.prepare('SELECT * FROM session WHERE id = ?').get(created.sessionId)
    expect(childSess.parent_session_id).toBe(1)
    expect(childSess.title).toBe('Clean Auth Continuation')
    expect(childSess.cwd).toBeTruthy()

    const childMsgs = db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY id ASC').all(created.sessionId)
    expect(childMsgs).toHaveLength(1)
    expect(childMsgs[0].role).toBe('user')
    expect(childMsgs[0].content).toBe(editedPrompt)

    const ftsHits = db.prepare('SELECT * FROM messages_fts WHERE session_id = ?').all(created.sessionId)
    expect(ftsHits).toHaveLength(1)

    const parentMsgs = db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY id ASC').all(1)
    expect(parentMsgs[parentMsgs.length - 1].content).toContain(`[Handoff -> #${created.sessionId}]`)
  })

  it('commitHandoff supports insertInitialMessage=false for Start & Run UI flow', () => {
    const created = commitHandoff({
      db,
      parentSessionId: 1,
      prompt: 'Clean task brief',
      insertInitialMessage: false,
    })
    const childMsgs = db.prepare('SELECT * FROM message WHERE session_id = ?').all(created.sessionId)
    expect(childMsgs).toHaveLength(0)
  })

  it('TUI parseSessionCommand supports /handoff [goal]', () => {
    expect(SLASH_COMMANDS).toContain('/handoff')
    expect(parseSessionCommand('/handoff')).toEqual({ type: 'handoff' })
    expect(parseSessionCommand('/handoff verify build')).toEqual({ type: 'handoff', goal: 'verify build' })
  })
})
