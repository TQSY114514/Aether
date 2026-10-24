import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const { createEmptyDatabase } = require('../electron/db/schema.js')
const migration006 = require('../electron/migrations/006_project_multi_workspace.js')
const dbModule = require('../electron/database.js')
const {
  isDangerousRoot,
  hasUnsafeWindowsPrefix,
  setActiveProjectRoot,
  getActiveProjectRoot,
  getWorkspaceRoot,
  setWorkspaceRoot,
  clearSessionWorkspaces,
  isAuthorizedWorkspace,
} = require('../electron/tools/sandbox.js')
const {
  loadModularRules,
  buildProjectContextMessage,
  hasProjectInstructions,
  invalidateCache,
} = require('../electron/llm/projectInstructions.js')
const { registerProjectHandlers } = require('../electron/ipc/project.handler.js')

describe('Milestone 1: Project-Based Multi-Workspace Architecture', () => {
  let tmpDir
  let dbPath
  let db

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-m1-test-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = createEmptyDatabase(dbPath)
    dbModule.setDatabase(db)
    clearSessionWorkspaces()
    invalidateCache()
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

  describe('1. Schema & Reversible Migration 006', () => {
    it('creates project table with all required columns and indices', () => {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project'").get()
      expect(table).toBeDefined()
      expect(table.name).toBe('project')

      const cols = db.prepare("PRAGMA table_info(project)").all().map(c => c.name)
      expect(cols).toContain('id')
      expect(cols).toContain('name')
      expect(cols).toContain('root_path')
      expect(cols).toContain('icon')
      expect(cols).toContain('color')
      expect(cols).toContain('default_model_id')
      expect(cols).toContain('default_agent_mode')
      expect(cols).toContain('is_favorite')
      expect(cols).toContain('created_at')
      expect(cols).toContain('last_opened_at')

      // Indices
      const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='project'").all().map(i => i.name)
      expect(indices).toContain('idx_project_last_opened')
      expect(indices).toContain('idx_project_favorite')
    })

    it('session table has project_id column and idx_session_project index', () => {
      const sessionCols = db.prepare("PRAGMA table_info(session)").all().map(c => c.name)
      expect(sessionCols).toContain('project_id')

      const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='session'").all().map(i => i.name)
      expect(indices).toContain('idx_session_project')
    })

    it('migration 006 applies up and reverses down cleanly', () => {
      const memDb = new Database(':memory:')
      memDb.exec(`
        CREATE TABLE session (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)

      migration006.up(memDb)
      expect(memDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project'").get()).toBeDefined()
      const cols = memDb.prepare("PRAGMA table_info(session)").all().map(c => c.name)
      expect(cols).toContain('project_id')

      migration006.down(memDb)
      expect(memDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project'").get()).toBeUndefined()
      memDb.close()
    })
  })

  describe('2. Database Project CRUD Methods', () => {
    it('creates, lists, gets, and updates a project', () => {
      const dbModule = require('../electron/database.js')
      const projectRoot = path.join(tmpDir, 'my-workspace')
      fs.mkdirSync(projectRoot, { recursive: true })

      const project = dbModule.createProject({
        name: 'Alpha Project',
        root_path: projectRoot,
        icon: 'folder',
        color: '#3b82f6',
        default_agent_mode: 'workspace',
        is_favorite: 1,
      })

      expect(project.id).toBeGreaterThan(0)
      expect(project.name).toBe('Alpha Project')
      expect(path.resolve(project.root_path)).toBe(path.resolve(projectRoot))
      expect(project.is_favorite).toBe(1)
      expect(project.default_agent_mode).toBe('workspace')

      const list = dbModule.listProjects()
      expect(list.length).toBeGreaterThanOrEqual(1)
      expect(list.some(p => p.id === project.id)).toBe(true)

      const byId = dbModule.getProject(project.id)
      expect(byId.name).toBe('Alpha Project')

      const byPath = dbModule.getProjectByPath(projectRoot)
      expect(byPath.id).toBe(project.id)

      const updated = dbModule.updateProject(project.id, {
        name: 'Alpha Project Renamed',
        default_agent_mode: 'auto_review',
        is_favorite: 0,
      })
      expect(updated.name).toBe('Alpha Project Renamed')
      expect(updated.default_agent_mode).toBe('auto_review')
      expect(updated.is_favorite).toBe(0)
    })

    it('rejects creating or updating a project with dangerous root paths', () => {
      const dbModule = require('../electron/database.js')
      const winDir = process.env.WINDIR || 'C:\\Windows'
      expect(() => {
        dbModule.createProject({ name: 'Malicious', root_path: winDir })
      }).toThrow(/Forbidden workspace root/)

      expect(() => {
        dbModule.createProject({ name: 'Root Drive', root_path: 'C:\\' })
      }).toThrow(/Forbidden workspace root/)

      const safeRoot = path.join(tmpDir, 'safe-proj')
      fs.mkdirSync(safeRoot, { recursive: true })
      const safe = dbModule.createProject({ name: 'Safe', root_path: safeRoot })

      expect(() => {
        dbModule.updateProject(safe.id, { root_path: winDir })
      }).toThrow(/Forbidden workspace root/)
    })

    it('active project lifecycle: setActiveProject, getActiveProject, and delete unlinking', () => {
      const dbModule = require('../electron/database.js')
      const p1Root = path.join(tmpDir, 'p1')
      fs.mkdirSync(p1Root, { recursive: true })
      const p1 = dbModule.createProject({ name: 'P1', root_path: p1Root })

      dbModule.setActiveProject(p1.id)
      const active = dbModule.getActiveProject()
      expect(active).toBeDefined()
      expect(active.id).toBe(p1.id)

      // Create session and verify it inherits active project_id
      const sess = dbModule.createSession({ title: 'Workspace Chat' })
      const sessRow = dbModule.getSession(sess.lastInsertRowid)
      expect(sessRow.project_id).toBe(p1.id)

      // Fork session and verify it preserves parent's project_id
      const forked = dbModule.forkSession(sess.lastInsertRowid, 'Forked Chat')
      const forkedRow = dbModule.getSession(forked.id || forked.lastInsertRowid)
      expect(forkedRow.project_id).toBe(p1.id)

      // Delete project should unlink sessions, not delete them
      const delRes = dbModule.deleteProject(p1.id)
      expect(delRes.ok).toBe(true)

      const unlinkedSess = dbModule.getSession(sess.lastInsertRowid)
      expect(unlinkedSess).toBeDefined()
      expect(unlinkedSess.project_id).toBeNull()

      expect(dbModule.getActiveProject()).toBeNull()
    })

    it('strictly rejects UNC paths and \\?\\ device prefixes in createProject and updateProject', () => {
      expect(() => dbModule.createProject({ name: 'UNC Project', root_path: '\\\\192.168.1.1\\share' }))
        .toThrow(/Forbidden workspace root/)
      expect(() => dbModule.createProject({ name: 'Device Project', root_path: '\\\\?\\C:\\Windows' }))
        .toThrow(/Forbidden workspace root/)

      const safeProjDir = path.join(tmpDir, 'safe-db-proj')
      fs.mkdirSync(safeProjDir, { recursive: true })
      const safeProj = dbModule.createProject({ name: 'Safe Project', root_path: safeProjDir })

      expect(() => dbModule.updateProject(safeProj.id, { root_path: '\\\\192.168.1.1\\share' }))
        .toThrow(/Forbidden workspace root/)
      expect(() => dbModule.updateProject(safeProj.id, { root_path: '\\\\?\\C:\\Windows' }))
        .toThrow(/Forbidden workspace root/)
    })
  })

  describe('3. Sandbox Path Resolution & Security Boundaries', () => {
    it('isDangerousRoot correctly identifies dangerous and safe paths', () => {
      if (process.platform === 'win32') {
        expect(isDangerousRoot('C:\\')).toBe(true)
        expect(isDangerousRoot('c:/')).toBe(true)
        const winDir = process.env.WINDIR || 'C:\\Windows'
        expect(isDangerousRoot(winDir)).toBe(true)
        expect(isDangerousRoot(path.join(winDir, 'System32'))).toBe(true)

        const progFiles = process.env.ProgramFiles || 'C:\\Program Files'
        expect(isDangerousRoot(progFiles)).toBe(true)
        expect(isDangerousRoot(path.join(progFiles, 'Common Files'))).toBe(true)

        const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
        expect(isDangerousRoot(progFilesX86)).toBe(true)

        // UNC and \\?\ device prefix verification
        expect(isDangerousRoot('\\\\?\\C:\\Windows')).toBe(true)
        expect(isDangerousRoot('\\\\192.168.1.1\\share')).toBe(true)
        expect(isDangerousRoot('\\\\?\\C:\\')).toBe(true)
      }
      expect(isDangerousRoot('/')).toBe(true)
      expect(isDangerousRoot('\\')).toBe(true)

      expect(isDangerousRoot(tmpDir)).toBe(false)
      expect(isDangerousRoot(path.join(tmpDir, 'project'))).toBe(false)
    })

    it('hasUnsafeWindowsPrefix detects UNC and raw prefix', () => {
      expect(hasUnsafeWindowsPrefix('\\\\?\\C:\\Workspace')).toBe(true)
      expect(hasUnsafeWindowsPrefix('\\\\server\\share\\repo')).toBe(true)
      expect(hasUnsafeWindowsPrefix('//192.168.1.1/share')).toBe(true)
      expect(hasUnsafeWindowsPrefix('C:\\Workspace')).toBe(false)
      expect(hasUnsafeWindowsPrefix('/home/user/project')).toBe(false)
    })

    it('setActiveProjectRoot stores root and enforces isDangerousRoot and hasUnsafeWindowsPrefix', () => {
      const projDir = path.join(tmpDir, 'active-proj')
      fs.mkdirSync(projDir, { recursive: true })

      setActiveProjectRoot(projDir)
      expect(getActiveProjectRoot()).toBe(path.resolve(projDir))
      expect(getWorkspaceRoot()).toBe(path.resolve(projDir))

      const winDir = process.env.WINDIR || 'C:\\Windows'
      expect(() => setActiveProjectRoot(winDir)).toThrow(/Forbidden workspace root/)
      expect(() => setActiveProjectRoot('\\\\?\\C:\\Windows')).toThrow(/Forbidden workspace root/)
      expect(() => setActiveProjectRoot('\\\\192.168.1.1\\share')).toThrow(/Forbidden workspace root/)
      expect(() => setWorkspaceRoot('\\\\?\\C:\\Windows')).toThrow(/Forbidden workspace root/)
      expect(() => setWorkspaceRoot('\\\\server\\share')).toThrow(/Forbidden workspace root/)
    })

    it('getWorkspaceRoot resolves session project root if session has project_id', () => {
      const dbModule = require('../electron/database.js')
      const projDir = path.join(tmpDir, 'session-proj')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'SessProj', root_path: projDir })

      const sess = dbModule.createSession({ title: 'Project Chat', project_id: proj.id })
      const sid = sess.lastInsertRowid

      // Without any global active project set, getWorkspaceRoot(sid) returns projDir
      setActiveProjectRoot(null)
      const resolved = getWorkspaceRoot(sid)
      expect(path.resolve(resolved)).toBe(path.resolve(projDir))
    })

    it('isAuthorizedWorkspace includes registered project roots', () => {
      const dbModule = require('../electron/database.js')
      const projDir = path.join(tmpDir, 'auth-proj')
      fs.mkdirSync(projDir, { recursive: true })
      dbModule.createProject({ name: 'AuthProj', root_path: projDir })

      expect(isAuthorizedWorkspace(dbModule.getDatabase(), projDir)).toBe(true)
    })
  })

  describe('4. Project Rule Discovery (.aether/rules and AGENTS.md)', () => {
    it('scans .aether/rules/*.md and *.mdc modular rule files', () => {
      const projDir = path.join(tmpDir, 'rules-proj')
      const rulesDir = path.join(projDir, '.aether', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      fs.writeFileSync(path.join(rulesDir, 'code_style.md'), 'Always use TypeScript strict mode.')
      fs.writeFileSync(path.join(rulesDir, 'security.mdc'), 'Never log raw API credentials.')
      fs.writeFileSync(path.join(rulesDir, 'ignored.txt'), 'Not a rule file.')

      const rules = loadModularRules(projDir)
      expect(rules.length).toBe(2)
      const names = rules.map(r => r.name).sort()
      expect(names).toEqual(['code_style.md', 'security.mdc'])

      const codeStyle = rules.find(r => r.name === 'code_style.md')
      expect(codeStyle.content).toBe('Always use TypeScript strict mode.')
    })

    it('buildProjectContextMessage combines AGENTS.md and modular rules', () => {
      const projDir = path.join(tmpDir, 'context-proj')
      const rulesDir = path.join(projDir, '.aether', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      fs.writeFileSync(path.join(projDir, 'AGENTS.md'), '# Agents Guide\nFollow minimal change principle.')
      fs.writeFileSync(path.join(rulesDir, 'testing.md'), 'Write unit tests for all new modules.')

      setActiveProjectRoot(projDir)
      invalidateCache()

      expect(hasProjectInstructions()).toBe(true)

      const ctxMsg = buildProjectContextMessage()
      expect(ctxMsg).toBeDefined()
      expect(ctxMsg.role).toBe('system')
      expect(ctxMsg.content).toContain('Project Instructions (AGENTS.md)')
      expect(ctxMsg.content).toContain('Follow minimal change principle')
      expect(ctxMsg.content).toContain('Workspace Rules (.aether/rules)')
      expect(ctxMsg.content).toContain('Write unit tests for all new modules')
    })

    it('loadModularRules ignores symlinks, caps file size at 64KB, and respects max rules count', () => {
      const projDir = path.join(tmpDir, 'hardened-rules-proj')
      const rulesDir = path.join(projDir, '.aether', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })

      // Create a normal rule
      fs.writeFileSync(path.join(rulesDir, '00_normal.md'), 'Normal rule.')

      // Create an oversized rule (>64KB)
      const oversized = 'A'.repeat(70000)
      fs.writeFileSync(path.join(rulesDir, '01_oversized.md'), oversized)

      // Try creating a symlink rule
      const outsideFile = path.join(tmpDir, 'secret.md')
      fs.writeFileSync(outsideFile, 'Sensitive outside content')
      try {
        fs.symlinkSync(outsideFile, path.join(rulesDir, '02_symlink.md'))
      } catch {
        // Windows unprivileged symlink fallback (if Developer Mode is off)
      }

      invalidateCache()
      const rules = loadModularRules(projDir)

      const normalRule = rules.find(r => r.name === '00_normal.md')
      expect(normalRule).toBeDefined()
      expect(normalRule.content).toBe('Normal rule.')

      const overRule = rules.find(r => r.name === '01_oversized.md')
      expect(overRule).toBeDefined()
      expect(overRule.content.length).toBe(65536)

      const symlinkRule = rules.find(r => r.name === '02_symlink.md')
      expect(symlinkRule).toBeUndefined()
    })
  })

  describe('5. Project IPC Handlers Contract', () => {
    it('registers and handles all 6 channels: list, create, open, update, delete, current', async () => {
      const handlers = new Map()
      const mockIpcMain = {
        handle: (channel, fn) => {
          handlers.set(channel, fn)
        },
      }
      let openedEventPayload = null
      const mockGetWebContents = () => ({
        isDestroyed: () => false,
        send: (channel, data) => {
          if (channel === 'project:opened') openedEventPayload = data
        },
      })

      const dbModule = require('../electron/database.js')
      registerProjectHandlers(mockIpcMain, dbModule, mockGetWebContents)

      expect(handlers.has('project:list')).toBe(true)
      expect(handlers.has('project:create')).toBe(true)
      expect(handlers.has('project:open')).toBe(true)
      expect(handlers.has('project:update')).toBe(true)
      expect(handlers.has('project:delete')).toBe(true)
      expect(handlers.has('project:current')).toBe(true)

      // Test project:create
      const projDir = path.join(tmpDir, 'ipc-workspace')
      const created = await handlers.get('project:create')(null, {
        name: 'IPC Project',
        root_path: projDir,
        icon: 'code',
        color: '#10b981',
      })
      expect(created.id).toBeGreaterThan(0)
      expect(created.name).toBe('IPC Project')
      expect(fs.existsSync(projDir)).toBe(true)

      // Test project:open
      const opened = await handlers.get('project:open')(null, created.id)
      expect(opened.id).toBe(created.id)
      expect(openedEventPayload).toBeDefined()
      expect(openedEventPayload.id).toBe(created.id)

      // Test project:current
      const current = await handlers.get('project:current')(null)
      expect(current).toBeDefined()
      expect(current.id).toBe(created.id)

      // Test project:update
      const updated = await handlers.get('project:update')(null, created.id, {
        name: 'IPC Project Renamed',
      })
      expect(updated.name).toBe('IPC Project Renamed')

      // Test project:list
      const list = await handlers.get('project:list')(null)
      expect(list.some(p => p.id === created.id)).toBe(true)

      // Test project:delete
      const del = await handlers.get('project:delete')(null, created.id)
      expect(del.ok).toBe(true)
      const afterDel = await handlers.get('project:current')(null)
      expect(afterDel).toBeNull()
    })

    it('strictly rejects UNC paths and \\?\\ device prefixes in IPC handlers', async () => {
      const handlers = new Map()
      const mockIpcMain = {
        handle: (channel, fn) => {
          handlers.set(channel, fn)
        },
      }
      const dbModule = require('../electron/database.js')
      registerProjectHandlers(mockIpcMain, dbModule)

      // project:create with UNC
      expect(() => handlers.get('project:create')(null, {
        name: 'Unsafe UNC',
        root_path: '\\\\192.168.1.1\\share',
      })).toThrow(/Forbidden workspace root/)

      // project:create with device prefix
      expect(() => handlers.get('project:create')(null, {
        name: 'Unsafe Device',
        root_path: '\\\\?\\C:\\Windows',
      })).toThrow(/Forbidden workspace root/)

      // project:update with UNC
      const safeDir = path.join(tmpDir, 'safe-ipc-proj')
      fs.mkdirSync(safeDir, { recursive: true })
      const safeProj = handlers.get('project:create')(null, {
        name: 'Safe IPC Proj',
        root_path: safeDir,
      })

      expect(() => handlers.get('project:update')(null, safeProj.id, {
        root_path: '\\\\192.168.1.1\\share',
      })).toThrow(/Forbidden workspace root/)

      expect(() => handlers.get('project:update')(null, safeProj.id, {
        root_path: '\\\\?\\C:\\Windows',
      })).toThrow(/Forbidden workspace root/)
    })

    it('project:open(null) deactivates project and switches cleanly to default workspace', async () => {
      const handlers = new Map()
      const mockIpcMain = {
        handle: (channel, fn) => {
          handlers.set(channel, fn)
        },
      }
      const dbModule = require('../electron/database.js')
      registerProjectHandlers(mockIpcMain, dbModule)

      const safeDir = path.join(tmpDir, 'deactivate-proj')
      fs.mkdirSync(safeDir, { recursive: true })
      const safeProj = handlers.get('project:create')(null, {
        name: 'Deactivate Proj',
        root_path: safeDir,
      })

      // Open project
      await handlers.get('project:open')(null, safeProj.id)
      const current = await handlers.get('project:current')(null)
      expect(current.id).toBe(safeProj.id)
      expect(getActiveProjectRoot()).toBe(safeDir)

      // Open with null (deactivate)
      const deactivated = await handlers.get('project:open')(null, null)
      expect(deactivated).toBeNull()
      const currentAfter = await handlers.get('project:current')(null)
      expect(currentAfter).toBeNull()
      expect(getActiveProjectRoot()).toBeNull()
    })

    it('agent:has-project-instructions returns rule count and rule names', async () => {
      const handlers = new Map()
      const mockIpcMain = {
        handle: (channel, fn) => {
          handlers.set(channel, fn)
        },
      }
      const dbModule = require('../electron/database.js')
      const { registerAgentHandlers } = require('../electron/ipc/agent.handler.js')
      registerAgentHandlers(mockIpcMain, dbModule)

      const safeDir = path.join(tmpDir, 'rules-proj')
      const rulesDir = path.join(safeDir, '.aether', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(safeDir, 'AGENTS.md'), '# Agents Guide')
      fs.writeFileSync(path.join(rulesDir, 'code-style.md'), 'Prefer TypeScript')

      setWorkspaceRoot(safeDir)
      invalidateCache()

      const res = await handlers.get('agent:has-project-instructions')(null)
      expect(res.has).toBe(true)
      expect(res.fileName).toBe('AGENTS.md')
      expect(res.rulesCount).toBe(1)
      expect(res.rules).toContain('code-style.md')
    })
  })
})
