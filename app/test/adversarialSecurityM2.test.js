// ─────────────────────────────────────────────────────────────────────────────
// app/test/adversarialSecurityM2.test.js
//
// Milestone 2 Adversarial Security Probe Suite
// Rigorously challenges path traversal, whitelist boundaries, dangerous roots,
// and cache invalidation mechanics on project instruction handlers.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const { createEmptyDatabase } = require('../electron/db/schema.js')
const dbModule = require('../electron/database.js')
const {
  isDangerousRoot,
  hasUnsafeWindowsPrefix,
  setActiveProjectRoot,
  getWorkspaceRoot,
  clearSessionWorkspaces,
} = require('../electron/tools/sandbox.js')
const {
  loadProjectInstructions,
  invalidateCache,
} = require('../electron/llm/projectInstructions.js')
const { registerProjectHandlers } = require('../electron/ipc/project.handler.js')

describe('Milestone 2 Adversarial Security Probes', () => {
  let db
  let dbPath
  let tmpDir
  let safeProjectDir
  let testProject
  const handlers = new Map()

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-adv-sec-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = createEmptyDatabase(dbPath)
    dbModule.setDatabase(db)

    safeProjectDir = path.join(tmpDir, 'safe-workspace')
    fs.mkdirSync(safeProjectDir, { recursive: true })

    testProject = dbModule.createProject({
      name: 'Safe Target Workspace',
      root_path: safeProjectDir,
    })

    handlers.clear()
    const mockIpcMain = {
      handle: (channel, fn) => {
        handlers.set(channel, fn)
      },
    }
    const mockGetWebContents = () => ({
      isDestroyed: () => false,
      send: () => {},
    })

    registerProjectHandlers(mockIpcMain, dbModule, mockGetWebContents)
    invalidateCache()
    clearSessionWorkspaces()
  })

  afterEach(() => {
    if (db) {
      try { db.close() } catch {}
    }
    dbModule.setDatabase(null)
    clearSessionWorkspaces()
    invalidateCache()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VECTOR 1: PATH TRAVERSAL ATTACKS ON project:saveInstructions
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Vector 1: Path Traversal Attacks', () => {
    const saveInstructions = (data) => handlers.get('project:saveInstructions')(null, data)

    it('blocks POSIX parent traversal: ../test.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: '../test.md',
        content: 'malicious payload',
      })).toThrow()

      // Verify no file written outside workspace
      expect(fs.existsSync(path.join(tmpDir, 'test.md'))).toBe(false)
    })

    it('blocks Windows backslash parent traversal: ..\\test.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: '..\\test.md',
        content: 'malicious payload',
      })).toThrow()

      expect(fs.existsSync(path.join(tmpDir, 'test.md'))).toBe(false)
    })

    it('blocks subdirectory traversal attempt: sub/AGENTS.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: 'sub/AGENTS.md',
        content: 'malicious payload',
      })).toThrow()

      expect(fs.existsSync(path.join(safeProjectDir, 'sub', 'AGENTS.md'))).toBe(false)
    })

    it('blocks Windows subdirectory traversal attempt: sub\\AGENTS.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: 'sub\\AGENTS.md',
        content: 'malicious payload',
      })).toThrow()

      expect(fs.existsSync(path.join(safeProjectDir, 'sub', 'AGENTS.md'))).toBe(false)
    })

    it('blocks UNC network paths: \\\\attacker\\share\\AGENTS.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: '\\\\attacker\\share\\AGENTS.md',
        content: 'malicious payload',
      })).toThrow()
    })

    it('blocks Windows raw device paths: \\\\?\\C:\\Windows\\System32\\AGENTS.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: '\\\\?\\C:\\Windows\\System32\\AGENTS.md',
        content: 'malicious payload',
      })).toThrow()
    })

    it('blocks null byte poisoning and control characters in fileName', () => {
      const hostileFilenames = [
        'AGENTS.md\0',
        'AGENTS.md\0.txt',
        'AGENTS\x00.md',
        'AGENTS.md\x00',
        'AGENTS\r\n.md',
        'AGENTS\n.md',
        'AGENTS\t.md',
        'AGENTS\x08.md',
      ]

      for (const hostileName of hostileFilenames) {
        expect(() => saveInstructions({
          projectId: testProject.id,
          fileName: hostileName,
          content: 'poison payload',
        })).toThrow()
      }
    })

    it('blocks absolute paths: /AGENTS.md or C:\\AGENTS.md', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: '/AGENTS.md',
        content: 'malicious payload',
      })).toThrow()

      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: 'C:\\AGENTS.md',
        content: 'malicious payload',
      })).toThrow()
    })

    it('blocks deep directory escape sequences: ../../../../../../Windows/System32/drivers/etc/hosts', () => {
      expect(() => saveInstructions({
        projectId: testProject.id,
        fileName: '../../../../../../Windows/System32/drivers/etc/hosts',
        content: '127.0.0.1 evil.com',
      })).toThrow()
    })

    it('blocks operations when project root itself is dangerous or UNC (via DB guard and handler guard)', () => {
      // 1. Database layer defense
      expect(() => dbModule.createProject({
        name: 'Dangerous Project',
        root_path: 'C:\\Windows\\System32',
      })).toThrow(/Forbidden workspace root/)

      expect(() => dbModule.createProject({
        name: 'UNC Project',
        root_path: '\\\\attacker\\share\\folder',
      })).toThrow(/Forbidden workspace root/)

      // 2. Handler layer defense: Tampered DB row simulation
      db.prepare(`
        INSERT INTO project (name, root_path, icon, color, default_model_id, default_agent_mode, is_favorite, last_opened_at)
        VALUES ('Tampered Dangerous', 'C:\\Windows\\System32', NULL, NULL, NULL, 'workspace', 0, CURRENT_TIMESTAMP)
      `).run()
      const dangerousRow = db.prepare("SELECT * FROM project WHERE name = 'Tampered Dangerous'").get()

      expect(() => saveInstructions({
        projectId: dangerousRow.id,
        fileName: 'AGENTS.md',
        content: 'hacked',
      })).toThrow(/Forbidden workspace root/)

      db.prepare(`
        INSERT INTO project (name, root_path, icon, color, default_model_id, default_agent_mode, is_favorite, last_opened_at)
        VALUES ('Tampered UNC', '\\\\attacker\\share\\folder', NULL, NULL, NULL, 'workspace', 0, CURRENT_TIMESTAMP)
      `).run()
      const uncRow = db.prepare("SELECT * FROM project WHERE name = 'Tampered UNC'").get()

      expect(() => saveInstructions({
        projectId: uncRow.id,
        fileName: 'AGENTS.md',
        content: 'hacked',
      })).toThrow(/Forbidden workspace root/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VECTOR 2: WHITELIST ATTACKS ON project:saveInstructions
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Vector 2: Whitelist Attacks', () => {
    const saveInstructions = (data) => handlers.get('project:saveInstructions')(null, data)

    it('rejects forbidden file types: package.json, .env, id_rsa, app.exe, script.bat', () => {
      const forbiddenTargets = [
        'package.json',
        '.env',
        'id_rsa',
        'app.exe',
        'script.bat',
        'config.ini',
        'main.js',
        '.bashrc',
        'setup.ps1',
        'exploit.vbs',
      ]

      for (const forbidden of forbiddenTargets) {
        expect(() => saveInstructions({
          projectId: testProject.id,
          fileName: forbidden,
          content: '{"evil": true}',
        })).toThrow(/Invalid instruction file name/)

        expect(fs.existsSync(path.join(safeProjectDir, forbidden))).toBe(false)
      }
    })

    it('strictly enforces exact casing (rejects agents.md, Agents.md, CLAUDE.MD)', () => {
      const caseVariants = [
        'agents.md',
        'Agents.md',
        'aether.md',
        'Aether.md',
        'claude.md',
        'Claude.md',
        'CLAUDE.MD',
        '.AETHERAI.MD',
      ]

      for (const variant of caseVariants) {
        expect(() => saveInstructions({
          projectId: testProject.id,
          fileName: variant,
          content: 'case test',
        })).toThrow(/Invalid instruction file name/)
      }
    })

    it('rejects extension append attacks: AGENTS.md.bak, AGENTS.md.exe', () => {
      const extensionVariants = [
        'AGENTS.md.bak',
        'AGENTS.md.exe',
        'AGENTS.md.old',
        'AGENTS.md.txt',
        'AGENTS.markdown',
        'AGENTS.mdown',
      ]

      for (const ext of extensionVariants) {
        expect(() => saveInstructions({
          projectId: testProject.id,
          fileName: ext,
          content: 'extension test',
        })).toThrow(/Invalid instruction file name/)
      }
    })

    it('accepts legitimate whitelisted files: AGENTS.md, AETHER.md, CLAUDE.md, .aetherai.md', () => {
      const allowed = ['AGENTS.md', 'AETHER.md', 'CLAUDE.md', '.aetherai.md']

      for (const legit of allowed) {
        const result = saveInstructions({
          projectId: testProject.id,
          fileName: legit,
          content: `# Instructions for ${legit}`,
        })

        expect(result.ok).toBe(true)
        expect(result.path).toBe(path.join(safeProjectDir, legit))
        expect(fs.readFileSync(result.path, 'utf8')).toBe(`# Instructions for ${legit}`)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VECTOR 3: CACHE INVALIDATION & INSTANT PROPAGATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Vector 3: Cache Invalidation & Instant Propagation', () => {
    const saveInstructions = (data) => handlers.get('project:saveInstructions')(null, data)

    it('immediately reflects saved instructions in loadProjectInstructions without delay', () => {
      setActiveProjectRoot(safeProjectDir)

      // Step 1: Initial save
      saveInstructions({
        projectId: testProject.id,
        fileName: 'AGENTS.md',
        content: 'Generation 1: Initial rules',
      })

      const loaded1 = loadProjectInstructions()
      expect(loaded1).not.toBeNull()
      expect(loaded1.fileName).toBe('AGENTS.md')
      expect(loaded1.content).toBe('Generation 1: Initial rules')

      // Step 2: Immediate update to Generation 2
      saveInstructions({
        projectId: testProject.id,
        fileName: 'AGENTS.md',
        content: 'Generation 2: Updated rules after hot-edit',
      })

      // Immediate load without waiting for 30s cache TTL
      const loaded2 = loadProjectInstructions()
      expect(loaded2).not.toBeNull()
      expect(loaded2.fileName).toBe('AGENTS.md')
      expect(loaded2.content).toBe('Generation 2: Updated rules after hot-edit')

      // Step 3: Immediate update to Generation 3
      saveInstructions({
        projectId: testProject.id,
        fileName: 'AGENTS.md',
        content: 'Generation 3: Final verified rules',
      })

      const loaded3 = loadProjectInstructions()
      expect(loaded3).not.toBeNull()
      expect(loaded3.content).toBe('Generation 3: Final verified rules')
    })

    it('immediately propagates updates to session-associated workspace', () => {
      // Create a session attached to testProject
      const sessionInfo = dbModule.createSession({
        title: 'Project Tied Session',
        project_id: testProject.id,
      })
      const sessionId = sessionInfo.lastInsertRowid

      // Write instructions
      saveInstructions({
        projectId: testProject.id,
        fileName: 'CLAUDE.md',
        content: 'Session-specific instructions v1',
      })

      // Query with sessionId
      const res1 = loadProjectInstructions(sessionId)
      expect(res1).not.toBeNull()
      expect(res1.fileName).toBe('CLAUDE.md')
      expect(res1.content).toBe('Session-specific instructions v1')

      // Update instructions
      saveInstructions({
        projectId: testProject.id,
        fileName: 'CLAUDE.md',
        content: 'Session-specific instructions v2',
      })

      const res2 = loadProjectInstructions(sessionId)
      expect(res2).not.toBeNull()
      expect(res2.content).toBe('Session-specific instructions v2')
    })
  })
})
