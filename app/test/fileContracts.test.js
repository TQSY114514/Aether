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
        const norm = String(content || '').toLowerCase().replace(/\s+/g, ' ').trim()
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

  it('safely ignores Git merge conflict markers and preserves full memory content without artificial truncation', () => {
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
    expect(parsed[2].content.length).toBe(600)
  })

  it('rejects writing to symlinks for both SOUL.md and MEMORY.md', () => {
    const ws = makeTmp('symlink-ws-')
    const externalTarget = makeTmp('external-target-')
    const soulTarget = join(externalTarget, 'outside-soul.txt')
    const memTarget = join(externalTarget, 'outside-mem.txt')
    const { symlinkSync } = require('node:fs')

    writeFileSync(soulTarget, 'original soul', 'utf-8')
    writeFileSync(memTarget, 'original mem', 'utf-8')

    try {
      symlinkSync(soulTarget, join(ws, 'SOUL.md'))
      const soulRes = soulManager.writeWorkspaceSoul(ws, { name: 'Exploit' })
      expect(soulRes.success).toBe(false)
      expect(soulRes.error).toContain('symbolic link')
      expect(readFileSync(soulTarget, 'utf-8')).toBe('original soul')
    } catch (e) {
      // Symlinks may require elevated privileges on some Windows configurations; skip if not permitted
      if (e.code !== 'EPERM') throw e
    }

    try {
      symlinkSync(memTarget, join(ws, 'MEMORY.md'))
      const memRes = memoryProjector.projectWorkspaceMemory(db, ws)
      expect(memRes.success).toBe(false)
      expect(memRes.error).toContain('symbolic link')
      expect(readFileSync(memTarget, 'utf-8')).toBe('original mem')
    } catch (e) {
      if (e.code !== 'EPERM') throw e
    }
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

  it('performs 3-way reconciliation: deletes removed baseline items but preserves newly added DB items', () => {
    const ws = makeTmp('3way-reconcile-')
    const memFile = join(ws, 'MEMORY.md')

    // Initial projection baseline: contains M1 and M2
    db.addMemoryWithProvenance('Memory Alpha', 'project', null, 'user', null, ws)
    db.addMemoryWithProvenance('Memory Beta', 'preference', null, 'assistant', null, ws)
    memoryProjector.projectWorkspaceMemory(db, ws)

    const baselineContent = readFileSync(memFile, 'utf-8')

    // Mid-turn action: LLM tool creates M3 in DB (not present in baseline or file)
    db.addMemoryWithProvenance('Memory Gamma (mid-turn)', 'fact', null, 'assistant', null, ws)

    // User edited MEMORY.md: removed Alpha, kept Beta, added Delta
    const editedContent = `# Project Memory
## User Preferences
- Memory Beta
## Development Patterns
- Memory Delta (user added)
`
    writeFileSync(memFile, editedContent, 'utf-8')

    // Run syncMemoryFileToDb with baselineContent
    const res = memoryProjector.syncMemoryFileToDb(db, ws, {
      deleteMissing: false,
      baselineContent,
    })

    expect(res.success).toBe(true)
    expect(res.added).toBe(1) // Memory Delta added
    expect(res.removed).toBe(1) // Memory Alpha removed because it was in baseline but not in file

    // Check final SQLite rows
    const rows = db.allRows('SELECT content FROM memory WHERE workspace = ?', [ws]).map(r => r.content)
    expect(rows).not.toContain('Memory Alpha') // deleted
    expect(rows).toContain('Memory Beta') // kept
    expect(rows).toContain('Memory Delta (user added)') // added from file
    expect(rows).toContain('Memory Gamma (mid-turn)') // preserved! (not wiped out)
  })

  it('supports multi-workspace caching for SOUL.md without cross-contamination', () => {
    const ws1 = makeTmp('ws1-soul-')
    const ws2 = makeTmp('ws2-soul-')

    writeFileSync(join(ws1, 'SOUL.md'), `---
name: Soul Project One
---
Prompt One.
`, 'utf-8')

    writeFileSync(join(ws2, 'SOUL.md'), `---
name: Soul Project Two
---
Prompt Two.
`, 'utf-8')

    const soul1 = soulManager.getWorkspaceSoul(ws1)
    const soul2 = soulManager.getWorkspaceSoul(ws2)

    expect(soul1?.name).toBe('Soul Project One')
    expect(soul2?.name).toBe('Soul Project Two')

    // Cache hit verification
    const cached1 = soulManager.getWorkspaceSoul(ws1)
    const cached2 = soulManager.getWorkspaceSoul(ws2)
    expect(cached1?.name).toBe('Soul Project One')
    expect(cached2?.name).toBe('Soul Project Two')
  })

  it('rejects projection if existing MEMORY.md exceeds 1MB limit', () => {
    const ws = makeTmp('large-mem-ws-')
    const memFile = join(ws, 'MEMORY.md')
    // Write 1.1MB dummy content
    writeFileSync(memFile, 'X'.repeat(1024 * 1024 + 100), 'utf-8')

    const res = memoryProjector.projectWorkspaceMemory(db, ws)
    expect(res.success).toBe(false)
    expect(res.error).toContain('byte limit')
  })

  it('blocks reading and writing to sensitive or unsafe paths', () => {
    const { mkdirSync } = require('node:fs')
    const sensitiveWs = join(makeTmp('sensitive-parent-'), '.ssh')
    mkdirSync(sensitiveWs, { recursive: true })

    const soulWrite = soulManager.writeWorkspaceSoul(sensitiveWs, { name: 'Exploit' })
    expect(soulWrite.success).toBe(false)
    expect(soulWrite.error).toContain('forbidden')

    const memProject = memoryProjector.projectWorkspaceMemory(db, sensitiveWs)
    expect(memProject.success).toBe(false)
    expect(memProject.error).toContain('forbidden')

    const memSync = memoryProjector.syncMemoryFileToDb(db, sensitiveWs)
    expect(memSync.success).toBe(false)
    expect(memSync.error).toContain('forbidden')

    const soulGet = soulManager.getWorkspaceSoul(sensitiveWs)
    expect(soulGet).toBeNull()
  })

  it('blocks alias bypass where a harmless symlink directory points to a sensitive path', () => {
    const { mkdirSync, symlinkSync } = require('node:fs')
    const parent = makeTmp('alias-test-')
    const sensitiveTarget = join(parent, '.ssh')
    mkdirSync(sensitiveTarget, { recursive: true })
    const innocentAlias = join(parent, 'harmless-project')

    try {
      symlinkSync(sensitiveTarget, innocentAlias, 'junction')

      const soulWrite = soulManager.writeWorkspaceSoul(innocentAlias, { name: 'Exploit' })
      expect(soulWrite.success).toBe(false)
      expect(soulWrite.error).toContain('forbidden')

      const memProject = memoryProjector.projectWorkspaceMemory(db, innocentAlias)
      expect(memProject.success).toBe(false)
      expect(memProject.error).toContain('forbidden')

      const memSync = memoryProjector.syncMemoryFileToDb(db, innocentAlias)
      expect(memSync.success).toBe(false)
      expect(memSync.error).toContain('forbidden')

      const soulGet = soulManager.getWorkspaceSoul(innocentAlias)
      expect(soulGet).toBeNull()
    } catch (e) {
      if (e.code !== 'EPERM') throw e
    }
  })

  it('validates workspace authorization and containment via isAuthorizedWorkspace', () => {
    const { isAuthorizedWorkspace, setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    clearSessionWorkspaces()

    const allowedDir = makeTmp('auth-ws-')
    const rogueDir = makeTmp('rogue-ws-')

    // Mock db with session config
    const mockDb = {
      prepare: (sql) => ({
        all: () => [{ config: JSON.stringify({ workspace: allowedDir }) }]
      }),
      getSetting: () => null
    }

    expect(isAuthorizedWorkspace(mockDb, allowedDir)).toBe(true)
    expect(isAuthorizedWorkspace(mockDb, join(allowedDir, 'subfolder'))).toBe(true)
    expect(isAuthorizedWorkspace(mockDb, rogueDir)).toBe(false)
  })

  it('validates workspace trust and sets external provenance origin for untrusted workspaces', () => {
    const { isWorkspaceTrusted } = require('../electron/tools/sandbox')
    const untrustedWs = makeTmp('untrusted-ws-')
    const trustedWs = makeTmp('trusted-ws-')

    const mockDbWithSettings = {
      getSetting: (k) => {
        if (k === 'trusted_workspaces') return JSON.stringify([trustedWs])
        return null
      },
      getSessionConfig: (sessionId) => {
        if (sessionId === 42) return { trusted: true }
        return null
      }
    }

    expect(isWorkspaceTrusted(mockDbWithSettings, trustedWs)).toBe(true)
    expect(isWorkspaceTrusted(mockDbWithSettings, untrustedWs)).toBe(false)
    expect(isWorkspaceTrusted(mockDbWithSettings, untrustedWs, 42)).toBe(true)

    // Verify syncMemoryFileToDb accepts origin and stores it
    writeFileSync(join(untrustedWs, 'MEMORY.md'), '# Project Memory\n## Facts\n- Remote Repo Guideline\n', 'utf-8')
    const syncRes = memoryProjector.syncMemoryFileToDb(db, untrustedWs, { origin: 'external' })
    expect(syncRes.success).toBe(true)
    expect(syncRes.added).toBe(1)

    const mem = db.prepare('SELECT content, origin FROM memory WHERE workspace = ?').all(untrustedWs)
    expect(mem.length).toBe(1)
    expect(mem[0].content).toBe('Remote Repo Guideline')
    expect(mem[0].origin).toBe('external')
  })
})

