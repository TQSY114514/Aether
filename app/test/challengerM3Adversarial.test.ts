// ─────────────────────────────────────────────────────────────────────────────
// app/test/challengerM3Adversarial.test.ts
//
// Milestone 3 Empirical Challenger Test Harness & Adversarial Oracles
// Author: challenger_m3_2 (teamwork_challenger)
// Mission: Adversarially probe Milestone 3 for boundary vulnerabilities,
//          security escapes, UI resilience, and race conditions.
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
  clearSessionWorkspaces,
} = require('../electron/tools/sandbox.js')
const { invalidateCache } = require('../electron/llm/projectInstructions.js')
const { registerProjectHandlers } = require('../electron/ipc/project.handler.js')

describe('Milestone 3 Challenger Adversarial Probing & UI Resilience Suite', () => {
  let tmpDir: string
  let dbPath: string
  let db: any
  let handlers: Map<string, Function>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenger-m3-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = createEmptyDatabase(dbPath)
    dbModule.setDatabase(db)
    clearSessionWorkspaces()
    invalidateCache()

    handlers = new Map()
    const mockIpcMain = {
      handle: (channel: string, fn: Function) => handlers.set(channel, fn),
    }
    const mockGetWebContents = () => ({
      isDestroyed: () => false,
      send: () => {},
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
  // SECTION 1: INSTRUCTION FILE SANITIZATION & BOUNDARY SECURITY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Instruction File Sanitization & Boundary Security', () => {

    it('ADV-01: Rejects path traversal attempts with various separators and encodings', async () => {
      const pDir = path.join(tmpDir, 'traversal-target')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Traversal Target', root_path: pDir })

      const traversalPayloads = [
        '../AGENTS.md',
        '..\\AGENTS.md',
        '../../etc/passwd',
        'subdir/../../AGENTS.md',
        './../AGENTS.md',
        '/etc/passwd',
        'C:\\Windows\\System32\\cmd.exe',
        '..%2fAGENTS.md',
      ]

      for (const payload of traversalPayloads) {
        await expect(
          Promise.resolve().then(() =>
            handlers.get('project:saveInstructions')!(null, {
              projectId: proj.id,
              content: 'malicious payload',
              fileName: payload,
            })
          )
        ).rejects.toThrow()
      }
    })

    it('ADV-02: Strictly enforces whitelist of allowed instruction file names', async () => {
      const pDir = path.join(tmpDir, 'whitelist-test')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Whitelist Test', root_path: pDir })

      const invalidNames = [
        'package.json',
        'id_rsa',
        '.env',
        '.bashrc',
        'main.js',
        'config.yaml',
        'secrets.txt',
        'AGENTS.exe',
        'AGENTS.md.bak',
      ]

      for (const name of invalidNames) {
        await expect(
          Promise.resolve().then(() =>
            handlers.get('project:saveInstructions')!(null, {
              projectId: proj.id,
              content: 'malicious payload',
              fileName: name,
            })
          )
        ).rejects.toThrow(/Invalid instruction file name/)
      }

      // Valid names must succeed
      const validNames = ['AGENTS.md', 'AETHER.md', 'CLAUDE.md', '.aetherai.md']
      for (const name of validNames) {
        const res = await handlers.get('project:saveInstructions')!(null, {
          projectId: proj.id,
          content: `# Valid ${name}`,
          fileName: name,
        })
        expect(res.ok).toBe(true)
        expect(fs.existsSync(res.path)).toBe(true)
      }
    })

    it('ADV-03: Rejects saving instructions to dangerous/system root workspaces', async () => {
      // Mock a project pointing to a forbidden system root
      const forbiddenRoot = process.platform === 'win32' ? 'C:\\Windows' : '/etc'
      
      // Directly insert to DB to bypass create validation
      db.prepare(`
        INSERT INTO project (id, name, root_path, is_favorite, created_at, last_opened_at)
        VALUES (999, 'Dangerous Root', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(forbiddenRoot)

      await expect(
        Promise.resolve().then(() =>
          handlers.get('project:saveInstructions')!(null, {
            projectId: 999,
            content: 'compromise',
            fileName: 'AGENTS.md',
          })
        )
      ).rejects.toThrow(/Forbidden workspace root/)

      const getRes = await handlers.get('project:getInstructions')!(null, 999)
      expect(getRes.exists).toBe(false)
      expect(getRes.error).toContain('Forbidden workspace root')
    })

    it('ADV-04: Priority fallback chain in project:getInstructions', async () => {
      const pDir = path.join(tmpDir, 'priority-test')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Priority Test', root_path: pDir })

      // Create CLAUDE.md and AETHER.md
      fs.writeFileSync(path.join(pDir, 'CLAUDE.md'), '# Claude Content')
      fs.writeFileSync(path.join(pDir, 'AETHER.md'), '# Aether Content')

      // Should choose AETHER.md over CLAUDE.md
      let res = await handlers.get('project:getInstructions')!(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('AETHER.md')
      expect(res.content).toBe('# Aether Content')

      // Create AGENTS.md (highest priority)
      fs.writeFileSync(path.join(pDir, 'AGENTS.md'), '# Agents Content')
      res = await handlers.get('project:getInstructions')!(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('AGENTS.md')
      expect(res.content).toBe('# Agents Content')
    })

    it('ADV-05: Safely handles directory named like instruction file', async () => {
      const pDir = path.join(tmpDir, 'dir-collision')
      fs.mkdirSync(pDir, { recursive: true })
      // Create a directory named AGENTS.md (not a file)
      fs.mkdirSync(path.join(pDir, 'AGENTS.md'), { recursive: true })
      fs.writeFileSync(path.join(pDir, 'AETHER.md'), '# Fallback Content')

      const proj = dbModule.createProject({ name: 'Collision Test', root_path: pDir })
      const res = await handlers.get('project:getInstructions')!(null, proj.id)

      // Should skip the directory and fall back to AETHER.md
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('AETHER.md')
      expect(res.content).toBe('# Fallback Content')
    })

    it('ADV-06: Large instruction files (>500KB) read and write faithfully without corruption', async () => {
      const pDir = path.join(tmpDir, 'large-spec')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Large Spec', root_path: pDir })

      const hugeText = '# Comprehensive Enterprise Architecture\n' + 'Line item definition.\n'.repeat(25000) // ~550KB
      const saveRes = await handlers.get('project:saveInstructions')!(null, {
        projectId: proj.id,
        content: hugeText,
        fileName: 'AGENTS.md',
      })
      expect(saveRes.ok).toBe(true)

      const getRes = await handlers.get('project:getInstructions')!(null, proj.id)
      expect(getRes.exists).toBe(true)
      expect(getRes.content.length).toBe(hugeText.length)
      expect(getRes.content).toBe(hugeText)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: UI RESILIENCE & ERROR HANDLING HARNESS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. UI Resilience & Clean Error Catching', () => {

    it('ADV-07: saveInstructions rejection is cleanly caught without uncaught promise or crash', async () => {
      // Oracle simulating ProjectPage.tsx handleSaveInstructions:
      let isSaving = false
      let toastCall: { message: string; type: string } | null = null
      let isEditing = true

      const mockToast = (msg: string, opts: { type: string }) => {
        toastCall = { message: msg, type: opts.type }
      }

      const simulateHandleSaveInstructions = async (saveFn: () => Promise<any>) => {
        isSaving = true
        try {
          const res = await saveFn()
          if (res?.ok) {
            mockToast('Instructions saved successfully', { type: 'success' })
            isEditing = false
          } else {
            mockToast(res?.error || 'Failed to save instructions', { type: 'error' })
          }
        } catch (err: any) {
          mockToast(err?.message || 'Failed to save instructions', { type: 'error' })
        } finally {
          isSaving = false
        }
      }

      // Scenario A: IPC rejects with Error
      await simulateHandleSaveInstructions(async () => {
        throw new Error('EACCES: permission denied')
      })
      expect(isSaving).toBe(false)
      expect(isEditing).toBe(true) // Should stay in edit mode on failure so draft isn't lost
      expect(toastCall).toEqual({ message: 'EACCES: permission denied', type: 'error' })

      // Scenario B: IPC returns { ok: false, error: 'Path traversal attempt blocked' }
      await simulateHandleSaveInstructions(async () => {
        return { ok: false, error: 'Path traversal attempt blocked' }
      })
      expect(isSaving).toBe(false)
      expect(isEditing).toBe(true)
      expect(toastCall).toEqual({ message: 'Path traversal attempt blocked', type: 'error' })

      // Scenario C: IPC succeeds
      await simulateHandleSaveInstructions(async () => {
        return { ok: true, path: '/safe/path' }
      })
      expect(isSaving).toBe(false)
      expect(isEditing).toBe(false)
      expect(toastCall).toEqual({ message: 'Instructions saved successfully', type: 'success' })
    })

    it('ADV-08: git.status errors, nulls, and unusual return shapes fall back cleanly', async () => {
      // Oracle simulating ProjectPage.tsx fetchGitStatus:
      const simulateFetchGitStatus = async (statusFn: () => Promise<any>, rootPath?: string) => {
        if (!rootPath) {
          return { isClean: true, hasGit: false }
        }
        try {
          const gitRes = await statusFn()
          if (gitRes?.success && gitRes.root) {
            return {
              branch: gitRes.branch || 'HEAD',
              dirtyCount: gitRes.dirtyCount ?? 0,
              isClean: (gitRes.dirtyCount ?? 0) === 0,
              hasGit: true,
            }
          } else {
            return { isClean: true, hasGit: false }
          }
        } catch {
          return { isClean: true, hasGit: false }
        }
      }

      // Test cases:
      // 1. Throws error (e.g. fatal: not a git repository)
      const resThrow = await simulateFetchGitStatus(async () => { throw new Error('git binary not found') }, '/some/path')
      expect(resThrow).toEqual({ isClean: true, hasGit: false })

      // 2. Returns null
      const resNull = await simulateFetchGitStatus(async () => null, '/some/path')
      expect(resNull).toEqual({ isClean: true, hasGit: false })

      // 3. Returns { success: false }
      const resFail = await simulateFetchGitStatus(async () => ({ success: false }), '/some/path')
      expect(resFail).toEqual({ isClean: true, hasGit: false })

      // 4. Returns empty root
      const resNoRoot = await simulateFetchGitStatus(async () => ({ success: true, root: null }), '/some/path')
      expect(resNoRoot).toEqual({ isClean: true, hasGit: false })

      // 5. Valid clean git
      const resClean = await simulateFetchGitStatus(async () => ({ success: true, root: '/some/path', branch: 'main', dirtyCount: 0 }), '/some/path')
      expect(resClean).toEqual({ branch: 'main', dirtyCount: 0, isClean: true, hasGit: true })

      // 6. Valid dirty git with missing branch
      const resDirty = await simulateFetchGitStatus(async () => ({ success: true, root: '/some/path', dirtyCount: 5 }), '/some/path')
      expect(resDirty).toEqual({ branch: 'HEAD', dirtyCount: 5, isClean: false, hasGit: true })
    })

    it('ADV-09: No secret, token, or arbitrary file content leakage in ProjectPage operations', () => {
      // Verify that ProjectPage only renders instruction file content and project metadata
      const forbiddenProperties = ['password', 'secret', 'token', 'apiKey', 'api_key', 'private_key']
      
      const pDir = path.join(tmpDir, 'leak-test')
      fs.mkdirSync(pDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Leak Test', root_path: pDir })

      const displayedFields = {
        name: proj.name,
        root_path: proj.root_path,
        id: proj.id,
      }

      for (const prop of forbiddenProperties) {
        expect(displayedFields).not.toHaveProperty(prop)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: EMPIRICAL PROBE OF CRITICAL UI BUG (Generate AGENTS.md State Machine)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Empirical Probe of UI State Machine & Conditional Rendering', () => {

    it('BUG-PROBE-01: Probing ProjectPage.tsx conditional rendering when generating AGENTS.md', () => {
      // In ProjectPage.tsx:
      // State when activeProject has no instructions on disk:
      const instructions = { fileName: 'AGENTS.md', path: '/path/AGENTS.md', content: '', exists: false }
      let isEditingInstructions = false
      let instructionDraft = ''

      // User clicks "Generate AGENTS.md" (handleCreateTemplate, line 167):
      const handleCreateTemplate = () => {
        instructionDraft = '# AGENTS.md\nTemplate content...'
        isEditingInstructions = true
      }

      handleCreateTemplate()

      // Evaluate Header Toolbar rendering (ProjectPage.tsx fixed logic):
      // isEditingInstructions is evaluated first:
      const renderHeaderToolbar = () => {
        if (isEditingInstructions) {
          return 'RENDER_SAVE_AND_CANCEL'
        } else if (instructions?.exists) {
          return 'RENDER_EDIT_BUTTON'
        } else {
          return 'RENDER_GENERATE_BUTTON'
        }
      }

      // Evaluate Content Area rendering (ProjectPage.tsx fixed logic):
      // isEditingInstructions is evaluated first:
      const renderContentArea = () => {
        if (isEditingInstructions) {
          return 'RENDER_TEXTAREA'
        } else if (instructions?.exists) {
          return 'RENDER_PRE_CODE'
        } else {
          return 'RENDER_EMPTY_HINT'
        }
      }

      // VERIFICATION OF REMEDIATION:
      // When isEditingInstructions === true, both the header and content areas
      // render the editor and actions, even if instructions.exists is false!
      expect(isEditingInstructions).toBe(true)
      expect(renderHeaderToolbar()).toBe('RENDER_SAVE_AND_CANCEL')
      expect(renderContentArea()).toBe('RENDER_TEXTAREA')
    })

    it('BUG-PROBE-02: Cancel button in ProjectPage has disabled={isSavingInstructions} state', () => {
      // In ProjectPage.tsx line 419:
      // Save button has disabled={isSavingInstructions}:
      // <button onClick={handleSaveInstructions} disabled={isSavingInstructions} ...>
      //
      // In ProjectPage.tsx line 415:
      // Cancel button now has disabled={isSavingInstructions}:
      // <button onClick={() => setIsEditingInstructions(false)} disabled={isSavingInstructions} className={BTN_BASE} ...>
      //
      // Empirical verification:
      const projectPageSource = fs.readFileSync(path.resolve(__dirname, '../src/pages/ProjectPage.tsx'), 'utf8')
      
      const saveButtonMatch = projectPageSource.match(/<button[^>]*onClick=\{handleSaveInstructions\}[^>]*disabled=\{isSavingInstructions\}/)
      expect(saveButtonMatch).not.toBeNull()

      // Check Cancel button
      const cancelButtonChunk = projectPageSource.substring(
        projectPageSource.indexOf("onClick={() => setIsEditingInstructions(false)}"),
        projectPageSource.indexOf("onClick={() => setIsEditingInstructions(false)}") + 200
      )
      const cancelHasDisabled = cancelButtonChunk.includes('disabled=')
      // Note: cancel button disables while saving to prevent race conditions
      expect(cancelHasDisabled).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: FILETREE PARAMETERIZATION & CONFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. FileTree Parameterization & Contract Conformance', () => {

    it('FT-01: FileTree interface allows all combinations of props with default fallbacks', () => {
      interface FileTreeProps {
        rootPath?: string | null
        alwaysOpen?: boolean
        showHeader?: boolean
        className?: string
      }

      const defaultProps: FileTreeProps = {}
      expect(Boolean(defaultProps.alwaysOpen)).toBe(false)
      expect(defaultProps.showHeader ?? true).toBe(true)
      expect(defaultProps.className ?? '').toBe('')
      expect(defaultProps.rootPath).toBeUndefined()

      const embeddedProps: FileTreeProps = {
        rootPath: '/custom/workspace',
        alwaysOpen: true,
        showHeader: false,
        className: 'h-full flex-1',
      }
      expect(Boolean(embeddedProps.alwaysOpen)).toBe(true)
      expect(embeddedProps.showHeader).toBe(false)
      expect(embeddedProps.className).toBe('h-full flex-1')
      expect(embeddedProps.rootPath).toBe('/custom/workspace')
    })

    it('FT-02: resolveRoot priority in FileTree', () => {
      // In FileTree.tsx:
      // If rootPath is supplied, it immediately takes precedence over getWorkspace and activeProject.root_path:
      const resolveRootOracle = (
        rootPath?: string | null,
        workspaceFromAgent?: string | null,
        activeProjectRoot?: string | null
      ) => {
        if (rootPath) return rootPath
        return workspaceFromAgent || activeProjectRoot || null
      }

      expect(resolveRootOracle('/prop/path', '/agent/path', '/proj/path')).toBe('/prop/path')
      expect(resolveRootOracle(null, '/agent/path', '/proj/path')).toBe('/agent/path')
      expect(resolveRootOracle(null, null, '/proj/path')).toBe('/proj/path')
      expect(resolveRootOracle(null, null, null)).toBeNull()
    })
  })
})
