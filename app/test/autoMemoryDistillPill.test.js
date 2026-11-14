import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import autoMemory from '../electron/llm/autoMemory'
import memorySkillBridge from '../electron/llm/memorySkillBridge'

describe('AutoMemory Zero-Disturbance Invisibility & Skill Distillation', () => {
  let db
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-mem-test-'))
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'fact',
        origin TEXT DEFAULT 'user',
        source_trust_level TEXT DEFAULT 'user_direct',
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        confidence REAL DEFAULT 1.0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        workspace TEXT
      );
      CREATE TABLE IF NOT EXISTS message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        memory_hits TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    db.getMemories = (limit = 100) => {
      return db.prepare('SELECT * FROM memory ORDER BY id DESC LIMIT ?').all(limit)
    }
    db.getMemoriesScoped = (_scope) => {
      return db.prepare('SELECT * FROM memory ORDER BY id DESC').all()
    }
    db.incrementMemoryAccess = (id) => {
      db.prepare('UPDATE memory SET access_count = access_count + 1 WHERE id = ?').run(id)
    }
  })

  afterEach(() => {
    try { db.close() } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it('prefetchWithDetails returns structured hits with explainable reasons (Why Injected)', () => {
    db.prepare("INSERT INTO memory (content, type, origin) VALUES (?, ?, ?)").run(
      'Use pnpm instead of npm in this project',
      'project',
      'user'
    )
    db.prepare("INSERT INTO memory (content, type, origin) VALUES (?, ?, ?)").run(
      'Always format with prettier',
      'fact',
      'user'
    )

    const details = autoMemory.prefetchWithDetails(db, 'Please install packages and format', tmpDir)
    expect(details).toHaveProperty('text')
    expect(details).toHaveProperty('hits')
    expect(Array.isArray(details.hits)).toBe(true)
    expect(details.hits.length).toBeGreaterThanOrEqual(1)

    const projectHit = details.hits.find(h => h.content.includes('pnpm'))
    expect(projectHit).toBeDefined()
    expect(projectHit.why).toBe('project convention')
    expect(projectHit.type).toBe('project')

    // prefetch() returns identical text as details.text
    const rawText = autoMemory.prefetch(db, 'Please install packages and format', tmpDir)
    expect(rawText).toBe(details.text)
  })

  it('message table stores and retrieves memory_hits JSON array', () => {
    const hits = [
      { id: 1, content: 'Rule 1', type: 'project', origin: 'user', why: 'project convention' },
      { id: 2, content: 'Rule 2', type: 'fact', origin: 'user', why: 'kw:format' },
    ]

    db.prepare("INSERT INTO message (session_id, role, content, memory_hits) VALUES (?, ?, ?, ?)").run(
      10,
      'assistant',
      'Hello world',
      JSON.stringify(hits)
    )

    const row = db.prepare("SELECT * FROM message WHERE session_id = 10").get()
    expect(row).toBeDefined()
    expect(row.memory_hits).toBeDefined()
    const parsed = JSON.parse(row.memory_hits)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].why).toBe('project convention')
  })

  it('memorySkillBridge clusters repeated memories and saves drafted skill', () => {
    const memories = [
      { id: 1, content: 'always run vitest with coverage for authentication module', type: 'fact' },
      { id: 2, content: 'authentication module requires coverage check before PR', type: 'fact' },
      { id: 3, content: 'coverage for authentication module must exceed 90 percent', type: 'fact' },
    ]

    const clusters = memorySkillBridge.clusterMemories(memories)
    expect(clusters.length).toBeGreaterThanOrEqual(1)
    expect(clusters[0].length).toBeGreaterThanOrEqual(3)

    // Save draft skill to disk
    const draftContent = `---
name: auth-coverage-guard
description: Enforce vitest coverage on authentication module
---
# Auth Coverage Guard
Always run vitest with coverage before submitting changes to the auth module.
`
    const skillsDir = path.join(tmpDir, 'skills')
    const saved = memorySkillBridge.saveDraftSkill(draftContent, skillsDir)
    expect(saved).toBeDefined()
    expect(saved.name).toBe('auth-coverage-guard')
    expect(fs.existsSync(saved.path)).toBe(true)
    const contentOnDisk = fs.readFileSync(saved.path, 'utf8')
    expect(contentOnDisk).toContain('auth-coverage-guard')
  })

  it('pins memory to AGENTS.md cleanly under ## Pinned Rules / Memories', () => {
    const agentsFile = path.join(tmpDir, 'AGENTS.md')
    fs.writeFileSync(agentsFile, '# Existing Constitution\n\nSome guidelines.\n', 'utf8')

    // Simulate pinToAgentsMd logic
    const content = 'Never use floating point numbers for currency calculations'
    let prev = fs.readFileSync(agentsFile, 'utf8')
    const header = '## Pinned Rules / Memories'
    const entry = `- ${content.trim()}`
    let next = ''
    if (prev.includes(header)) {
      next = prev.replace(header, `${header}\n${entry}`)
    } else {
      next = `${prev.trim()}\n\n${header}\n${entry}\n`.trimStart()
    }
    fs.writeFileSync(agentsFile, next, 'utf8')

    const updated = fs.readFileSync(agentsFile, 'utf8')
    expect(updated).toContain('## Pinned Rules / Memories')
    expect(updated).toContain('- Never use floating point numbers for currency calculations')

    // Second pin appends under the same header
    const content2 = 'Always log monetary conversions'
    prev = fs.readFileSync(agentsFile, 'utf8')
    const entry2 = `- ${content2.trim()}`
    next = prev.replace(header, `${header}\n${entry2}`)
    fs.writeFileSync(agentsFile, next, 'utf8')

    const updated2 = fs.readFileSync(agentsFile, 'utf8')
    expect(updated2.match(/## Pinned Rules \/ Memories/g)).toHaveLength(1)
    expect(updated2).toContain('- Always log monetary conversions')
  })
})
