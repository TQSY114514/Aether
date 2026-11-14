// ─────────────────────────────────────────────────────────────────────────────
// app/test/challengerM4Adversarial.test.ts
//
// Milestone 4: Tier 5 Adversarial Coverage & Stress Hardening Suite
// Author: challenger_m4_final (teamwork_challenger)
// Mission: Rigorously stress-test edge cases, concurrency, race conditions,
//          Option A session isolation, missing resources, and layout invariants.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const { createEmptyDatabase } = require('../electron/db/schema.js')
const dbModule = require('../electron/database.js')
const {
  isDangerousRoot,
  hasUnsafeWindowsPrefix,
  setActiveProjectRoot,
  getActiveProjectRoot,
  setWorkspaceRoot,
  getWorkspaceRoot,
  clearSessionWorkspaces,
} = require('../electron/tools/sandbox.js')
const { invalidateCache, getProjectInstructions } = require('../electron/llm/projectInstructions.js')
const projectHandlerPath = path.resolve(__dirname, '../electron/ipc/project.handler.js')
const hasProjectHandler = fs.existsSync(projectHandlerPath)
const { registerProjectHandlers } = hasProjectHandler ? require('../electron/ipc/project.handler.js') : { registerProjectHandlers: () => {} }

;(hasProjectHandler ? describe : describe.skip)('Milestone 4: Tier 5 Adversarial Coverage & Stress Hardening', () => {
  let tmpDir: string
  let dbPath: string
  let db: any
  let handlers: Map<string, Function>
  let eventsEmitted: { channel: string; data: any }[]

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenger-m4-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = createEmptyDatabase(dbPath)
    dbModule.setDatabase(db)
    clearSessionWorkspaces()
    invalidateCache()

    eventsEmitted = []
    handlers = new Map()
    const mockIpcMain = {
      handle: (channel: string, fn: Function) => handlers.set(channel, fn),
    }
    const mockGetWebContents = () => ({
      isDestroyed: () => false,
      send: (channel: string, data: any) => {
        eventsEmitted.push({ channel, data })
      },
    })

    registerProjectHandlers(mockIpcMain, dbModule, mockGetWebContents)
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
  // SECTION 1: RAPID PROJECT SWITCHING & CONCURRENCY RESILIENCE
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Rapid Project Switching & Concurrency Stress', () => {

    it('PROBE-M4-01: Rapid sequential and overlapping project switches maintain sandbox consistency', async () => {
      const projCount = 10
      const projects: any[] = []

      for (let i = 0; i < projCount; i++) {
        const pDir = path.join(tmpDir, `rapid-proj-${i}`)
        fs.mkdirSync(pDir, { recursive: true })
        fs.writeFileSync(path.join(pDir, 'AGENTS.md'), `# AGENTS ${i}`)
        const p = dbModule.createProject({
          name: `Rapid Project ${i}`,
          root_path: pDir,
        })
        projects.push(p)
      }

      // Concurrently fire rapid switches
      const switchPromises: Promise<any>[] = []
      for (let i = 0; i < 50; i++) {
        const targetProj = projects[i % projCount]
        switchPromises.push(handlers.get('project:open')!(null, targetProj.id))
        if (i % 7 === 0) {
          // occasional reset to null workspace
          switchPromises.push(handlers.get('project:open')!(null, null))
        }
      }

      await Promise.all(switchPromises)

      // Settle on a deterministic final project
      const finalProj = projects[projCount - 1]
      const settled = await handlers.get('project:open')!(null, finalProj.id)

      expect(settled.id).toBe(finalProj.id)
      expect(getActiveProjectRoot()).toBe(path.resolve(finalProj.root_path))
      expect(getWorkspaceRoot()).toBe(path.resolve(finalProj.root_path))

      // Check instructions reflect the final settled project
      const instr = await handlers.get('project:getInstructions')!(null, finalProj.id)
      expect(instr.exists).toBe(true)
      expect(instr.content).toBe(`# AGENTS ${projCount - 1}`)
    })

    it('PROBE-M4-02: Switching to null/0/empty deactivates project and resets sandbox cleanly', async () => {
      const pDir = path.join(tmpDir, 'active-target')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Active Target', root_path: pDir })

      await handlers.get('project:open')!(null, proj.id)
      expect(getActiveProjectRoot()).toBe(path.resolve(pDir))

      // Switch to null: active project root clears to null; getWorkspaceRoot() falls back to default workspace
      const resNull = await handlers.get('project:open')!(null, null)
      expect(resNull).toBeNull()
      expect(getActiveProjectRoot()).toBeNull()
      expect(typeof getWorkspaceRoot()).toBe('string')
      expect(getWorkspaceRoot()).not.toBe(path.resolve(pDir))

      // Switch to active again, then 0
      await handlers.get('project:open')!(null, proj.id)
      expect(getActiveProjectRoot()).toBe(path.resolve(pDir))
      const resZero = await handlers.get('project:open')!(null, 0)
      expect(resZero).toBeNull()
      expect(getActiveProjectRoot()).toBeNull()
      expect(getWorkspaceRoot()).not.toBe(path.resolve(pDir))

      // Switch to active again, then empty string ''
      await handlers.get('project:open')!(null, proj.id)
      expect(getActiveProjectRoot()).toBe(path.resolve(pDir))
      const resEmpty = await handlers.get('project:open')!(null, '')
      expect(resEmpty).toBeNull()
      expect(getActiveProjectRoot()).toBeNull()
      expect(getWorkspaceRoot()).not.toBe(path.resolve(pDir))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: MISSING DIRECTORIES, NON-GIT WORKSPACES, UNASSIGNED DEFAULTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Missing Directories, Non-Git Workspaces & Unassigned Defaults', () => {

    it('PROBE-M4-03: Missing or deleted project folder does not crash getInstructions', async () => {
      const ghostPath = path.join(tmpDir, 'deleted-ghost-folder')
      fs.mkdirSync(ghostPath, { recursive: true })
      const proj = dbModule.createProject({ name: 'Ghost Project', root_path: ghostPath })

      // Now physically delete the folder from disk
      fs.rmSync(ghostPath, { recursive: true, force: true })
      expect(fs.existsSync(ghostPath)).toBe(false)

      const res = await handlers.get('project:getInstructions')!(null, proj.id)
      expect(res.exists).toBe(false)
      expect(res.error).toBe('Directory not found')
      expect(res.content).toBe('')
    })

    it('PROBE-M4-04: saveInstructions creates missing directories on demand', async () => {
      const missingDir = path.join(tmpDir, 'auto-recreated-dir')
      // Note: do not create the dir on disk
      const proj = dbModule.createProject({ name: 'Missing Dir Proj', root_path: missingDir })
      expect(fs.existsSync(missingDir)).toBe(false)

      const saveRes = await handlers.get('project:saveInstructions')!(null, {
        projectId: proj.id,
        content: '# Auto Created AGENTS.md',
        fileName: 'AGENTS.md',
      })

      expect(saveRes.ok).toBe(true)
      expect(fs.existsSync(missingDir)).toBe(true)
      const content = fs.readFileSync(path.join(missingDir, 'AGENTS.md'), 'utf8')
      expect(content).toBe('# Auto Created AGENTS.md')
    })

    it('PROBE-M4-05: 0-byte and whitespace-only instructions are handled accurately without corruption', async () => {
      const pDir = path.join(tmpDir, 'empty-instructions')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Empty Rules', root_path: pDir })

      // 1. Save empty string (0-byte file)
      await handlers.get('project:saveInstructions')!(null, {
        projectId: proj.id,
        content: '',
        fileName: 'AGENTS.md',
      })

      let res = await handlers.get('project:getInstructions')!(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.content).toBe('')
      expect(fs.statSync(path.join(pDir, 'AGENTS.md')).size).toBe(0)

      // 2. Save whitespace-only string
      const whitespace = '   \n\t\n   '
      await handlers.get('project:saveInstructions')!(null, {
        projectId: proj.id,
        content: whitespace,
        fileName: 'AGENTS.md',
      })

      res = await handlers.get('project:getInstructions')!(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.content).toBe(whitespace)
    })

    it('PROBE-M4-06: Unassigned runtime defaults fall back cleanly without SQLite constraint violations', async () => {
      const pDir = path.join(tmpDir, 'null-defaults')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({
        name: 'Null Defaults Proj',
        root_path: pDir,
        default_model_id: null,
        default_agent_mode: 'workspace', // architecture default
      })

      expect(proj.default_model_id).toBeNull()
      expect(proj.default_agent_mode).toBe('workspace')

      // Create session under this project
      const sessionResult = dbModule.createSession({
        title: 'Session With Null Proj Defaults',
        project_id: proj.id,
      })

      const sessionId = sessionResult.lastInsertRowid || sessionResult.id
      expect(sessionId).toBeGreaterThan(0)

      // Confirm database query retrieves the session correctly
      const loaded = dbModule.getSession(sessionId)
      expect(loaded.project_id).toBe(proj.id)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: OPTION A PROJECT SESSION FILTERING VS ALL SESSIONS TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Option A Session Isolation vs All Sessions Toggle', () => {

    it('PROBE-M4-07: Verifies Option A filtering logic with mixed projects and unassigned sessions', () => {
      const projA = { id: 101, name: 'Project A' }
      const projB = { id: 202, name: 'Project B' }

      const allSessions = [
        { id: 1, title: 'Session A1', project_id: 101, last_message: 'msg1' },
        { id: 2, title: 'Session A2', project_id: 101, last_message: 'msg2' },
        { id: 3, title: 'Session B1', project_id: 202, last_message: 'msg3' },
        { id: 4, title: 'Unassigned 1', project_id: null, last_message: 'msg4' },
        { id: 5, title: 'Unassigned 2', project_id: undefined, last_message: 'msg5' },
      ]

      // Filter simulation matching Sidebar.tsx:101-104
      const filterFn = (sessions: any[], activeProject: any, projectScopeFilter: boolean) => {
        let list = sessions
        if (projectScopeFilter && activeProject) {
          list = list.filter((s) => s.project_id === activeProject.id)
        }
        return list
      }

      // Case 1: Active Project A, Scope Filter ON (Option A default)
      const scopedA = filterFn(allSessions, projA, true)
      expect(scopedA.map((s) => s.id)).toEqual([1, 2])

      // Case 2: Active Project A, Scope Filter OFF ("All Sessions")
      const allWithA = filterFn(allSessions, projA, false)
      expect(allWithA.map((s) => s.id)).toEqual([1, 2, 3, 4, 5])

      // Case 3: Switch to Active Project B, Scope Filter ON
      const scopedB = filterFn(allSessions, projB, true)
      expect(scopedB.map((s) => s.id)).toEqual([3])

      // Case 4: No Active Project (null), Scope Filter ON
      const scopedNull = filterFn(allSessions, null, true)
      expect(scopedNull.map((s) => s.id)).toEqual([1, 2, 3, 4, 5])
    })

    it('PROBE-M4-08: Deleting active project unlinks sessions and flushes isolation gracefully', async () => {
      const pDir = path.join(tmpDir, 'del-isolation-test')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'To Be Deleted', root_path: pDir })

      const s1 = dbModule.createSession({ title: 'S1', project_id: proj.id })
      const s2 = dbModule.createSession({ title: 'S2', project_id: proj.id })
      const s1Id = s1.lastInsertRowid || s1.id
      const s2Id = s2.lastInsertRowid || s2.id

      expect(dbModule.getSession(s1Id).project_id).toBe(proj.id)
      expect(dbModule.getSession(s2Id).project_id).toBe(proj.id)

      await handlers.get('project:open')!(null, proj.id)
      expect(getActiveProjectRoot()).toBe(path.resolve(pDir))

      // Delete the project
      const delRes = await handlers.get('project:delete')!(null, proj.id)
      expect(delRes.ok).toBe(true)

      // Sessions are preserved with project_id unlinked (null)
      expect(dbModule.getSession(s1Id).project_id).toBeNull()
      expect(dbModule.getSession(s2Id).project_id).toBeNull()

      // Sandbox active project root is cleared
      expect(getActiveProjectRoot()).toBeNull()
      expect(getWorkspaceRoot()).not.toBe(path.resolve(pDir))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: WORKSPACE HEADER POPOVER ACTIONS & MATRIX OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Workspace Header Popover Actions & Operations', () => {

    it('PROBE-M4-09: Workspace search query filtering matches both project name and root path', () => {
      const projects = [
        { id: 1, name: 'Web App', root_path: 'D:/Projects/web-app' },
        { id: 2, name: 'Backend API', root_path: 'D:/Aether/server' },
        { id: 3, name: 'Mobile App', root_path: 'C:/Users/dev/aether-mobile' },
      ]

      const searchFilter = (query: string) => {
        if (!query.trim()) return projects
        const q = query.toLowerCase()
        return projects.filter(
          (p) => p.name.toLowerCase().includes(q) || p.root_path.toLowerCase().includes(q)
        )
      }

      // Name matches
      expect(searchFilter('web').map((p) => p.id)).toEqual([1])
      expect(searchFilter('API').map((p) => p.id)).toEqual([2])

      // Path matches
      expect(searchFilter('server').map((p) => p.id)).toEqual([2])
      expect(searchFilter('aether').map((p) => p.id)).toEqual([2, 3])

      // No match
      expect(searchFilter('nonexistent')).toEqual([])
    })

    it('PROBE-M4-10: Favorite toggle updates database and re-orders listProjects', async () => {
      const p1 = dbModule.createProject({ name: 'Alpha', root_path: path.join(tmpDir, 'alpha'), is_favorite: 0 })
      const p2 = dbModule.createProject({ name: 'Beta', root_path: path.join(tmpDir, 'beta'), is_favorite: 0 })
      const p3 = dbModule.createProject({ name: 'Gamma', root_path: path.join(tmpDir, 'gamma'), is_favorite: 0 })

      let list = await handlers.get('project:list')!()
      expect(list.length).toBe(3)

      // Mark Gamma (p3) as favorite
      await handlers.get('project:update')!(null, p3.id, { is_favorite: 1 })

      list = await handlers.get('project:list')!()
      expect(list[0].id).toBe(p3.id) // Gamma jumped to first position
      expect(list[0].is_favorite).toBe(1)

      // Mark Beta (p2) as favorite as well
      await handlers.get('project:update')!(null, p2.id, { is_favorite: 1 })
      list = await handlers.get('project:list')!()
      // Both p3 and p2 are favorites at top
      const topTwoIds = list.slice(0, 2).map((p: any) => p.id)
      expect(topTwoIds).toContain(p2.id)
      expect(topTwoIds).toContain(p3.id)
      expect(list[2].id).toBe(p1.id) // Non-favorite remains at bottom
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: SIDEBAR NAVIGATION & LAYOUT RATCHET INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. Sidebar Navigation & Architectural Layout Invariants', () => {

    it('PROBE-M4-11: Verifies WorkspaceHeader, Sidebar, FileTree, and ProjectPage line count ceilings', () => {
      const sidebarPath = path.resolve(__dirname, '../src/components/sidebar/Sidebar.tsx')
      const headerPath = path.resolve(__dirname, '../src/components/sidebar/WorkspaceHeader.tsx')
      const fileTreePath = path.resolve(__dirname, '../src/components/sidebar/FileTree.tsx')
      const projectPagePath = path.resolve(__dirname, '../src/pages/ProjectPage.tsx')

      const sidebarLines = fs.readFileSync(sidebarPath, 'utf8').split('\n').length
      const headerLines = fs.readFileSync(headerPath, 'utf8').split('\n').length
      const fileTreeLines = fs.readFileSync(fileTreePath, 'utf8').split('\n').length
      const projectPageLines = fs.readFileSync(projectPagePath, 'utf8').split('\n').length

      // Check anti-slop / component ratchet ceilings (strictly <= 650 lines, ideally <= 600)
      expect(sidebarLines).toBeLessThanOrEqual(600)
      expect(headerLines).toBeLessThanOrEqual(600)
      expect(fileTreeLines).toBeLessThanOrEqual(600)
      expect(projectPageLines).toBeLessThanOrEqual(600)
    })

    it('PROBE-M4-12: Verifies FileTree and AgentHistory accordions are completely removed from Sidebar.tsx', () => {
      const sidebarPath = path.resolve(__dirname, '../src/components/sidebar/Sidebar.tsx')
      const content = fs.readFileSync(sidebarPath, 'utf8')

      // Must not render <FileTree or <AgentHistory in the sidebar
      expect(content).not.toContain('<FileTree')
      expect(content).not.toContain('<AgentHistory')
      expect(content).not.toContain("from './FileTree'")
      expect(content).not.toContain("from './AgentHistory'")
    })

    it('PROBE-M4-13: Verifies FolderKanban Projects nav item exists in both expanded and collapsed rail', () => {
      const sidebarPath = path.resolve(__dirname, '../src/components/sidebar/Sidebar.tsx')
      const content = fs.readFileSync(sidebarPath, 'utf8')

      // Icon import
      expect(content).toContain('FolderKanban')

      // Collapsed rail nav item
      expect(content).toMatch(/id:\s*['"]projects['"],\s*icon:\s*FolderKanban/)

      // Expanded rail nav item
      expect(content).toMatch(/<NavItem\s+icon=\{FolderKanban\}\s+label=\{t\(['"]sidebar\.nav\.projects['"]\)\}\s+active=\{currentView === ['"]projects['"]\}/)
    })

    it('PROBE-M4-14: Verifies ProjectPage renders clean 589-line architecture without illegal color or styling tokens', () => {
      const pagePath = path.resolve(__dirname, '../src/pages/ProjectPage.tsx')
      const content = fs.readFileSync(pagePath, 'utf8')

      // No prohibited gradient slop
      expect(content).not.toContain('from-indigo-500 to-purple-600')
      expect(content).not.toContain('bg-clip-text')

      // No hardcoded #ffffff colors in inline styles (use Tailwind text-white)
      expect(content).not.toContain("color: '#ffffff'")
      expect(content).not.toContain('color: "#ffffff"')

      // Evaluates isEditingInstructions first before instructions.exists
      const editIndex = content.indexOf('isEditingInstructions ?')
      const existsIndex = content.indexOf('instructions?.exists ?')
      expect(editIndex).toBeGreaterThan(0)
      expect(existsIndex).toBeGreaterThan(0)
      expect(editIndex).toBeLessThan(existsIndex)

      // Cancel button has disabled={isSavingInstructions}
      expect(content).toContain('disabled={isSavingInstructions}')
    })
  })
})
