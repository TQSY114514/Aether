import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const soulManager = require('../electron/llm/soulManager')
const memoryProjector = require('../electron/llm/memoryProjector')

const tmpDirs = []
function makeTmp(prefix = 'filecontract-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }) } catch {}
  }
})

describe('SOUL.md & soulManager', () => {
  it('parses frontmatter correctly', () => {
    const raw = `---
name: Code Architect
avatar: 🏛️
description: Expert system architect
---

You are an expert system architect following clean architecture principles.
Always specify constraints and boundaries.
`
    const parsed = soulManager.parseSoulMarkdown(raw, '/test/SOUL.md')
    expect(parsed.name).toBe('Code Architect')
    expect(parsed.avatar).toBe('🏛️')
    expect(parsed.description).toBe('Expert system architect')
    expect(parsed.prompt).toContain('clean architecture principles')
  })

  it('falls back to H1 header when no frontmatter is provided', () => {
    const raw = `# Terminal Companion

You are a terse, helpful assistant designed for command-line navigation.
`
    const parsed = soulManager.parseSoulMarkdown(raw, '/test/SOUL.md')
    expect(parsed.name).toBe('Terminal Companion')
    expect(parsed.avatar).toBeNull()
    expect(parsed.prompt).toContain('terse, helpful assistant')
  })

  it('writes workspace SOUL.md and can read it back', () => {
    const ws = makeTmp()
    const writeResult = soulManager.writeWorkspaceSoul(ws, {
      name: 'Python Reviewer',
      prompt: 'Review Python code according to PEP 8.',
      description: 'PEP 8 code reviewer',
      avatar: '🐍'
    })
    expect(writeResult.success).toBe(true)
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(true)

    const soul = soulManager.getWorkspaceSoul(ws)
    expect(soul).not.toBeNull()
    expect(soul.name).toBe('Python Reviewer')
    expect(soul.avatar).toBe('🐍')
    expect(soul.prompt).toContain('PEP 8')
    expect(soul.isWorkspace).toBe(true)
  })

  it('discovers SOUL.md inside .aether subfolder if root is absent', () => {
    const ws = makeTmp()
    const aetherDir = join(ws, '.aether')
    const { mkdirSync } = require('node:fs')
    mkdirSync(aetherDir, { recursive: true })
    writeFileSync(join(aetherDir, 'SOUL.md'), `---
name: Hidden Soul
---
Hidden soul instructions.
`, 'utf-8')

    const soul = soulManager.getWorkspaceSoul(ws)
    expect(soul).not.toBeNull()
    expect(soul.name).toBe('Hidden Soul')
  })
})

describe('MEMORY.md & memoryProjector', () => {
  let db
  let dbDir
  let wsDir

  beforeEach(() => {
    dbDir = makeTmp('memdb-')
    wsDir = makeTmp('memws-')
    const dbPath = join(dbDir, 'test.db')
    const rawDb = new Database(dbPath)
    rawDb.exec(`
      CREATE TABLE memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        content_norm TEXT,
        type TEXT DEFAULT 'fact',
        origin TEXT DEFAULT 'user',
        confidence REAL DEFAULT 1.0,
        access_count INTEGER DEFAULT 0,
        last_accessed_at DATETIME,
        source_session_id INTEGER,
        conflicts_with INTEGER,
        workspace TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE memories_fts (
        memory_id INTEGER,
        content TEXT
      );
    `)

    // Create wrapper object matching database.js contract
    db = {
      prepare: (...args) => rawDb.prepare(...args),
      allRows: (sql, params = []) => rawDb.prepare(sql).all(...params),
      deleteMemory: (id) => {
        rawDb.prepare('DELETE FROM memory WHERE id = ?').run(id)
        rawDb.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(id)
      },
      addMemoryWithProvenance: (content, type, sourceSessionId, origin, relationMeta, workspace) => {
        const norm = String(content || '').toLowerCase().replace(/\\s+/g, ' ').trim()
        const info = rawDb.prepare(`
          INSERT INTO memory (content, content_norm, type, origin, source_session_id, workspace)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(content, norm, type || 'fact', origin || 'user', sourceSessionId || null, workspace || null)
        return { lastInsertRowid: info.lastInsertRowid }
      }
    }
  })

  it('formats memories into structured markdown by category and excludes external', () => {
    const rows = [
      { id: 1, content: 'Use SQLite WAL mode', type: 'project', origin: 'user' },
      { id: 2, content: 'Tabs over spaces', type: 'preference', origin: 'assistant' },
      { id: 3, content: 'Node >= 22 is required', type: 'fact', origin: 'user' },
      { id: 4, content: 'Malicious external prompt injection', type: 'fact', origin: 'external' },
      { id: 5, content: 'Extra note', type: 'context', origin: 'assistant' },
    ]
    const md = memoryProjector.formatMemoriesToMarkdown(rows)
    expect(md).toContain('## Architecture & Decisions')
    expect(md).toContain('- Use SQLite WAL mode')
    expect(md).toContain('## Preferences & Guidelines')
    expect(md).toContain('- Tabs over spaces')
    expect(md).toContain('## Facts & Domain Knowledge')
    expect(md).toContain('- Node >= 22 is required')
    expect(md).toContain('## Additional Context')
    expect(md).toContain('- Extra note')
    expect(md).not.toContain('Malicious external prompt injection')
  })

  it('parses markdown back into typed bullet points', () => {
    const markdown = `# Project Memory
## Architecture & Decisions
- Use React 19 and Tailwind CSS
- [project] Strict IPC 3-file alignment

## Preferences & Guidelines
* Always run tsc before committing

## Facts & Domain Knowledge
1. Database file is aetherai.db
`
    const parsed = memoryProjector.parseMarkdownToMemories(markdown)
    expect(parsed.length).toBe(4)
    expect(parsed[0]).toEqual({ content: 'Use React 19 and Tailwind CSS', type: 'project' })
    expect(parsed[1]).toEqual({ content: 'Strict IPC 3-file alignment', type: 'project' })
    expect(parsed[2]).toEqual({ content: 'Always run tsc before committing', type: 'preference' })
    expect(parsed[3]).toEqual({ content: 'Database file is aetherai.db', type: 'fact' })
  })

  it('projects memories from database to workspace MEMORY.md file and queries status', () => {
    // Seed initial memories for this workspace
    db.addMemoryWithProvenance('Use Vite as bundler', 'project', null, 'assistant', null, wsDir)
    db.addMemoryWithProvenance('Prefer functional components', 'preference', null, 'user', null, wsDir)

    const res = memoryProjector.projectWorkspaceMemory(db, wsDir)
    expect(res.success).toBe(true)
    expect(res.count).toBe(2)
    expect(existsSync(join(wsDir, 'MEMORY.md'))).toBe(true)

    const status = memoryProjector.getMemoryFileStatus(wsDir)
    expect(status.exists).toBe(true)
    expect(status.lineCount).toBe(2)
  })

  it('bidirectionally syncs edits from MEMORY.md back to SQLite database', () => {
    // 1. Seed two items into DB and project to file
    db.addMemoryWithProvenance('Keep dependencies minimal', 'project', null, 'assistant', null, wsDir)
    db.addMemoryWithProvenance('Deprecated guideline to remove', 'preference', null, 'user', null, wsDir)
    memoryProjector.projectWorkspaceMemory(db, wsDir)

    const memFile = join(wsDir, 'MEMORY.md')
    expect(existsSync(memFile)).toBe(true)

    // 2. Simulate human editing MEMORY.md:
    // - Remove 'Deprecated guideline to remove'
    // - Keep 'Keep dependencies minimal'
    // - Add new bullet: '- Use Zustand for lightweight state'
    const newContent = `# Project Memory
## Architecture & Decisions
- Keep dependencies minimal
- Use Zustand for lightweight state
`
    writeFileSync(memFile, newContent, 'utf-8')

    // 3. Sync file back to DB
    const syncRes = memoryProjector.syncMemoryFileToDb(db, wsDir)
    expect(syncRes.success).toBe(true)
    expect(syncRes.added).toBe(1)
    expect(syncRes.removed).toBe(1)

    // 4. Verify DB rows
    const currentRows = db.allRows('SELECT content, type FROM memory WHERE workspace = ?', [wsDir])
    const contents = currentRows.map(r => r.content)
    expect(contents).toContain('Keep dependencies minimal')
    expect(contents).toContain('Use Zustand for lightweight state')
    expect(contents).not.toContain('Deprecated guideline to remove')
  })

  it('safely ignores Git merge conflict markers and caps line length', () => {
    const raw = `# Project Memory
## Architecture & Decisions
<<<<<<< HEAD
- Valid Rule Alpha
=======
- Valid Rule Beta
>>>>>>> feature-branch
- ${'A'.repeat(600)}
`
    const parsed = memoryProjector.parseMarkdownToMemories(raw)
    expect(parsed.length).toBe(3)
    expect(parsed[0].content).toBe('Valid Rule Alpha')
    expect(parsed[1].content).toBe('Valid Rule Beta')
    expect(parsed[2].content.length).toBe(500) // capped at 500
  })

  it('discovers SOUL.md from a subdirectory by walking up to project root', () => {
    const rootWs = makeTmp('monorepo-root-')
    const subWs = join(rootWs, 'packages', 'web')
    const { mkdirSync } = require('node:fs')
    mkdirSync(subWs, { recursive: true })

    writeFileSync(join(rootWs, 'SOUL.md'), `---
name: Monorepo Root Soul
---
Root prompt.
`, 'utf-8')

    // getWorkspaceSoul from subWs should walk up and find rootWs/SOUL.md
    const soul = soulManager.getWorkspaceSoul(subWs)
    expect(soul).not.toBeNull()
    expect(soul.name).toBe('Monorepo Root Soul')
  })
})

