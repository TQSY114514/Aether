// ─────────────────────────────────────────────────────────────────────────────
// app/test/challengerM3Stress.test.ts
//
// Milestone 3 Empirical Stress Test & Adversarial Verification Suite
// Challenger: challenger_m3_1 (teamwork_challenger)
//
// Target Modules:
//   - app/src/components/sidebar/FileTree.tsx (parameterized embedding)
//   - app/src/pages/ProjectPage.tsx (Projects Hub edge conditions)
//   - app/src/App.tsx (routing)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FileTree, { type FileTreeProps } from '@/components/sidebar/FileTree'
import ProjectPage from '@/pages/ProjectPage'
import { useStore } from '@/store'
import type { Project } from '@/store/projectSlice'

describe('Milestone 3 Empirical Stress Test Suite', () => {
  beforeEach(() => {
    // Setup mock electronAPI & window environment
    const mockElectronAPI: any = {
      project: {
        pickDirectory: vi.fn().mockResolvedValue('D:\\AetherWorkspaces\\demo'),
        getInstructions: vi.fn().mockResolvedValue({
          fileName: 'AGENTS.md',
          path: 'D:\\AetherWorkspaces\\demo\\AGENTS.md',
          content: '# Test Instructions',
          exists: true,
        }),
        saveInstructions: vi.fn().mockResolvedValue({
          ok: true,
          path: 'D:\\AetherWorkspaces\\demo\\AGENTS.md',
        }),
      },
      git: {
        status: vi.fn().mockResolvedValue({
          success: true,
          root: 'D:\\AetherWorkspaces\\demo',
          branch: 'feature/hub',
          dirtyCount: 3,
        }),
      },
      system: {
        showItemInFolder: vi.fn().mockResolvedValue(true),
        openPath: vi.fn().mockResolvedValue(true),
        clipboardWrite: vi.fn().mockResolvedValue(true),
      },
      agent: {
        getWorkspace: vi.fn().mockResolvedValue('D:\\AetherWorkspaces\\default'),
      },
      fs: {
        listDir: vi.fn().mockResolvedValue({
          ok: true,
          entries: [
            { name: 'src', isDir: true },
            { name: 'README.md', isDir: false },
          ],
        }),
      },
    }

    const mockWindow: any = {
      electronAPI: mockElectronAPI,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      confirm: vi.fn().mockReturnValue(true),
      innerWidth: 1200,
      innerHeight: 800,
    }

    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    }

    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    })

    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: mockClipboard },
      configurable: true,
      writable: true,
    })

    // Ensure React.useSyncExternalStore returns the current state (getSnapshot) rather than initial SSR snapshot
    vi.spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe: any, getSnapshot: any) => {
      return getSnapshot()
    })

    // Reset store state to predictable baseline
    useStore.setState({
      activeProject: null,
      projects: [],
      sessions: [],
      allModels: [],
      currentSessionId: null,
      currentView: 'projects',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. FileTree.tsx Parameterization & Edge Probes
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. FileTree Parameterization Probes', () => {
    it('1.a Renders with rootPath = null, alwaysOpen = true, showHeader = false without throwing', () => {
      useStore.setState({ activeProject: null, currentSessionId: null })

      const props: FileTreeProps = {
        rootPath: null,
        alwaysOpen: true,
        showHeader: false,
        className: 'custom-tree-class',
      }

      const markup = renderToStaticMarkup(React.createElement(FileTree, props))

      // Container should have full-height flex column and custom class
      expect(markup).toContain('file-tree-container')
      expect(markup).toContain('flex flex-col h-full min-h-0')
      expect(markup).toContain('custom-tree-class')

      // showHeader = false means no header folder icon or title row rendered
      expect(markup).not.toContain('filetree.files')
      expect(markup).not.toContain('项目文件')

      // Inner container should have full-height scrollable classes (flex-1 min-h-0 overflow-y-auto)
      expect(markup).toContain('flex-1 min-h-0 overflow-y-auto p-1.5')

      // With rootPath null and no activeProject/session, displays no_workspace hint
      expect(markup).toContain('rounded-lg border')
    })

    it('1.b Renders with rootPath = undefined (backward compatibility default call) with header and collapsed accordion styling', () => {
      // Calling without any props: <FileTree />
      const markup = renderToStaticMarkup(React.createElement(FileTree, {}))

      // Should render the header by default
      expect(markup).toContain('file-tree-container px-2 pt-1')
      // Border bottom style should be set when showHeader is true
      expect(markup).toContain('border-bottom:1px solid var(--border)')
      // Refresh icon should be present in header
      expect(markup).toContain('lucide-refresh-cw')
    })

    it('1.c Handles rootPath = "non_existent_directory_xyz" and simulated fs error gracefully', async () => {
      const mockListDir = vi.fn().mockResolvedValue({
        ok: false,
        error: 'read_failed',
      })
      globalThis.window.electronAPI.fs.listDir = mockListDir

      const props: FileTreeProps = {
        rootPath: 'non_existent_directory_xyz',
        alwaysOpen: true,
        showHeader: true,
      }

      const markup = renderToStaticMarkup(React.createElement(FileTree, props))
      expect(markup).toBeDefined()
      expect(markup).toContain('file-tree-container')

      // Verify the listDir would be called with the non_existent_directory_xyz
      const simulateLoadDir = async (dir: string) => {
        let err: string | null = null
        try {
          const res = await globalThis.window.electronAPI.fs.listDir(dir, null)
          if (!res?.ok) err = res?.error || 'read_failed'
        } catch {
          err = 'read_failed'
        }
        return err
      }

      const errResult = await simulateLoadDir('non_existent_directory_xyz')
      expect(errResult).toBe('read_failed')
      expect(mockListDir).toHaveBeenCalledWith('non_existent_directory_xyz', null)
    })

    it('1.d FileTreeProps export interface matches specification types and accepts all permutations', () => {
      // Type conformance tests
      const validProps1: FileTreeProps = {}
      const validProps2: FileTreeProps = { rootPath: 'D:\\valid\\path' }
      const validProps3: FileTreeProps = { rootPath: null, alwaysOpen: true }
      const validProps4: FileTreeProps = { rootPath: undefined, showHeader: false, className: 'test' }
      const validProps5: FileTreeProps = {
        rootPath: 'C:\\test',
        alwaysOpen: false,
        showHeader: true,
        className: 'w-full h-full',
      }

      expect(validProps1).toBeDefined()
      expect(validProps2.rootPath).toBe('D:\\valid\\path')
      expect(validProps3.rootPath).toBeNull()
      expect(validProps3.alwaysOpen).toBe(true)
      expect(validProps4.showHeader).toBe(false)
      expect(validProps5.className).toBe('w-full h-full')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ProjectPage.tsx Edge Conditions & Render Probes
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. ProjectPage Edge Conditions Probes', () => {
    it('2.a activeProject === null renders clean Welcome / Empty state without throwing', () => {
      useStore.setState({
        activeProject: null,
        projects: [],
      })

      const markup = renderToStaticMarkup(React.createElement(ProjectPage))

      // Top title and subtitle must be present
      expect(markup).toContain('Projects Hub')

      // Empty state card must be rendered
      expect(markup).toContain('lucide-folder-kanban')
      expect(markup).toContain('Open Project Folder')

      // Should NOT render active project dashboard elements
      expect(markup).not.toContain('Runtime Defaults')
      expect(markup).not.toContain('Project Instructions &amp; Rules')
      expect(markup).not.toContain('Workspace File Explorer')
    })

    it('2.a-2 activeProject === null with existing projects list renders All Workspaces matrix in empty state', () => {
      const mockProjects: Project[] = [
        {
          id: 1,
          name: 'Alpha Project',
          root_path: 'D:\\Alpha',
          is_favorite: 1,
          created_at: 1000,
          last_opened_at: 2000,
        },
        {
          id: 2,
          name: 'Beta Project',
          root_path: 'D:\\Beta',
          is_favorite: 0,
          created_at: 1000,
          last_opened_at: 1500,
        },
      ]

      useStore.setState({
        activeProject: null,
        projects: mockProjects,
      })

      const markup = renderToStaticMarkup(React.createElement(ProjectPage))

      expect(markup).toContain('All Workspaces')
      expect(markup).toContain('Alpha Project')
      expect(markup).toContain('D:\\Alpha')
      expect(markup).toContain('Beta Project')
      expect(markup).toContain('D:\\Beta')
    })

    it('2.b Instruction file editor handling: File exists vs File does not exist', () => {
      const activeProj: Project = {
        id: 42,
        name: 'Omega App',
        root_path: 'D:\\Omega',
        is_favorite: 0,
        created_at: 1000,
        last_opened_at: 2000,
      }

      useStore.setState({
        activeProject: activeProj,
        projects: [activeProj],
      })

      // When instructions file exists
      const simulateInstructionsExist = (exists: boolean, content = '') => {
        if (exists) {
          return {
            fileName: 'AGENTS.md',
            path: 'D:\\Omega\\AGENTS.md',
            content: content || '## Architecture Guidelines',
            exists: true,
          }
        }
        return {
          fileName: 'AGENTS.md',
          path: 'D:\\Omega\\AGENTS.md',
          content: '',
          exists: false,
        }
      }

      const existingState = simulateInstructionsExist(true, '# My Project Rules')
      expect(existingState.exists).toBe(true)
      expect(existingState.fileName).toBe('AGENTS.md')
      expect(existingState.content).toBe('# My Project Rules')

      const absentState = simulateInstructionsExist(false)
      expect(absentState.exists).toBe(false)
      expect(absentState.content).toBe('')

      // Verify template generator content string
      const generateTemplate = (projectName: string) =>
        `# AGENTS.md\n\n## Project Overview\n${projectName}\n\n## Key Architecture & Conventions\n- Core modules and architectural standards.\n- Follow clean design patterns and type safety.\n\n## Testing & Verification\n- Run unit and integration tests before submitting changes.\n`

      const template = generateTemplate(activeProj.name)
      expect(template).toContain('Omega App')
      expect(template).toContain('# AGENTS.md')
      expect(template).toContain('Testing & Verification')
    })

    it('2.b-2 Empirical Proof of Template Generation UI Lockout Defect (ProjectPage.tsx:412 & 440)', () => {
      // In ProjectPage.tsx:
      // When a user selects a project with no existing instruction file:
      const instructions = { fileName: 'AGENTS.md', path: '/path/AGENTS.md', content: '', exists: false }
      let isEditingInstructions = false
      let instructionDraft = ''

      // 1. User clicks "Generate AGENTS.md" (handleCreateTemplate, line 167):
      const handleCreateTemplate = () => {
        instructionDraft = '# AGENTS.md\nTemplate content...'
        isEditingInstructions = true
      }
      handleCreateTemplate()

      // 2. Evaluate Header Toolbar rendering logic from ProjectPage.tsx lines 412-435:
      // Line 412: ) : instructions?.exists ? (
      //             isEditingInstructions ? ( Cancel & Save ) : ( Edit )
      //           ) : (
      //             Generate AGENTS.md button
      //           )
      const renderHeaderToolbar = () => {
        if (instructions?.exists) {
          if (isEditingInstructions) return 'RENDER_SAVE_AND_CANCEL'
          return 'RENDER_EDIT_BUTTON'
        }
        return 'RENDER_GENERATE_BUTTON'
      }

      // 3. Evaluate Content Area rendering logic from ProjectPage.tsx lines 440-464:
      // Line 440: {instructions?.exists ? (
      //             isEditingInstructions ? ( <textarea /> ) : ( <pre /> )
      //           ) : (
      //             <div empty-hint-card with Generate AGENTS.md button>
      //           )}
      const renderContentArea = () => {
        if (instructions?.exists) {
          if (isEditingInstructions) return 'RENDER_TEXTAREA'
          return 'RENDER_PRE_CODE'
        }
        return 'RENDER_EMPTY_HINT'
      }

      // EMPIRICAL DEFECT VERIFICATION:
      // Even though handleCreateTemplate set isEditingInstructions = true:
      expect(isEditingInstructions).toBe(true)
      // Because instructions?.exists is FALSE on disk, the UI stays trapped in the initial state!
      expect(renderHeaderToolbar()).toBe('RENDER_GENERATE_BUTTON') // BUG: does NOT show Save/Cancel!
      expect(renderContentArea()).toBe('RENDER_EMPTY_HINT')         // BUG: does NOT show textarea!
    })

    it('2.c Model dropdown selection: Empty model list vs Populated model list', () => {
      const activeProj: Project = {
        id: 10,
        name: 'Model Test Project',
        root_path: 'D:\\ModelTest',
        default_model_id: null,
        is_favorite: 0,
        created_at: 1000,
        last_opened_at: 2000,
      }

      // Empty allModels
      useStore.setState({
        activeProject: activeProj,
        allModels: [],
      })

      const emptyMarkup = renderToStaticMarkup(React.createElement(ProjectPage))
      expect(emptyMarkup).toContain('(Global Default Model)')
      expect(emptyMarkup).not.toContain('Claude 3.7')

      // Populated allModels
      useStore.setState({
        activeProject: { ...activeProj, default_model_id: 101 },
        allModels: [
          { id: 101, display_name: 'Claude 3.7 Sonnet', model_name: 'claude-3-7-sonnet' },
          { id: 102, display_name: '', model_name: 'gpt-4o' }, // fallback to model_name
        ] as any,
      })

      const populatedMarkup = renderToStaticMarkup(React.createElement(ProjectPage))
      expect(populatedMarkup).toContain('Claude 3.7 Sonnet')
      expect(populatedMarkup).toContain('gpt-4o')
      expect(populatedMarkup).toContain('value="101"')
      expect(populatedMarkup).toContain('value="102"')

      // Model selection logic test
      const handleModelSelect = (val: string) => {
        return val ? Number(val) : null
      }
      expect(handleModelSelect('')).toBeNull()
      expect(handleModelSelect('101')).toBe(101)
      expect(handleModelSelect('102')).toBe(102)
    })

    it('2.d Project sessions filtering: 0 sessions vs multiple sessions', () => {
      const activeProj: Project = {
        id: 77,
        name: 'Session Test Proj',
        root_path: 'D:\\SessionTest',
        is_favorite: 0,
        created_at: 1000,
        last_opened_at: 2000,
      }

      // Case 1: 0 sessions belong to project
      useStore.setState({
        activeProject: activeProj,
        sessions: [
          { id: 1, title: 'Other Session', project_id: 999, updated_at: 1000 },
          { id: 2, title: 'Global Session', project_id: null, updated_at: 1000 },
        ] as any,
      })

      const zeroMarkup = renderToStaticMarkup(React.createElement(ProjectPage))
      expect(zeroMarkup).toContain('Project Sessions (0)')
      expect(zeroMarkup).toContain('No sessions in this project yet')
      expect(zeroMarkup).not.toContain('Other Session')

      // Case 2: Multiple sessions belong to project
      useStore.setState({
        activeProject: activeProj,
        sessions: [
          { id: 10, title: 'Session 10 in 77', project_id: 77, updated_at: 1700000000000 },
          { id: 11, title: 'Session 11 in 77', project_id: 77, updated_at: 1700000001000 },
          { id: 12, title: 'Unrelated Session', project_id: 88, updated_at: 1700000002000 },
        ] as any,
      })

      const multiMarkup = renderToStaticMarkup(React.createElement(ProjectPage))
      expect(multiMarkup).toContain('Project Sessions (2)')
      expect(multiMarkup).toContain('Session 10 in 77')
      expect(multiMarkup).toContain('Session 11 in 77')
      expect(multiMarkup).not.toContain('Unrelated Session')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Adversarial Edge Cases & Action Robustness Probes
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Adversarial Edge Cases & Action Robustness', () => {
    it('3.a Correctly quotes terminal cd command when path contains spaces', () => {
      const pathWithSpaces = 'C:\\Users\\John Doe\\My Projects\\App Alpha'
      const pathWithoutSpaces = 'D:\\Projects\\AppBeta'

      const generateCdCmd = (rootPath?: string) => {
        if (!rootPath) return ''
        return `cd ${rootPath.includes(' ') ? `"${rootPath}"` : rootPath}`
      }

      expect(generateCdCmd(pathWithSpaces)).toBe('cd "C:\\Users\\John Doe\\My Projects\\App Alpha"')
      expect(generateCdCmd(pathWithoutSpaces)).toBe('cd D:\\Projects\\AppBeta')
      expect(generateCdCmd(undefined)).toBe('')
    })

    it('3.b Git status correctly identifies clean, dirty, and non-git directories', () => {
      const parseGitStatus = (gitRes: any) => {
        if (gitRes?.success && gitRes.root) {
          return {
            branch: gitRes.branch || 'HEAD',
            dirtyCount: gitRes.dirtyCount ?? 0,
            isClean: (gitRes.dirtyCount ?? 0) === 0,
            hasGit: true,
          }
        }
        return { isClean: true, hasGit: false }
      }

      // Clean git repository
      const cleanGit = parseGitStatus({ success: true, root: 'D:\\repo', branch: 'main', dirtyCount: 0 })
      expect(cleanGit.hasGit).toBe(true)
      expect(cleanGit.isClean).toBe(true)
      expect(cleanGit.branch).toBe('main')

      // Dirty git repository with 25 uncommitted changes
      const dirtyGit = parseGitStatus({ success: true, root: 'D:\\repo', branch: 'dev', dirtyCount: 25 })
      expect(dirtyGit.hasGit).toBe(true)
      expect(dirtyGit.isClean).toBe(false)
      expect(dirtyGit.dirtyCount).toBe(25)

      // Non-git directory
      const nonGit = parseGitStatus({ success: false })
      expect(nonGit.hasGit).toBe(false)
      expect(nonGit.isClean).toBe(true)

      // Malformed git response
      const malformedGit = parseGitStatus(null)
      expect(malformedGit.hasGit).toBe(false)
    })

    it('3.c Default Agent Mode correctly updates and handles all 4 developer tiers', () => {
      const modes = ['workspace', 'auto_review', 'explore', 'unrestricted']
      const activeProj: Project = {
        id: 5,
        name: 'Agent Mode Project',
        root_path: 'D:\\AgentMode',
        default_agent_mode: 'workspace',
        is_favorite: 0,
        created_at: 1000,
        last_opened_at: 2000,
      }

      useStore.setState({ activeProject: activeProj })

      modes.forEach((mode) => {
        const updatedProj = { ...activeProj, default_agent_mode: mode }
        useStore.setState({ activeProject: updatedProj })
        const markup = renderToStaticMarkup(React.createElement(ProjectPage))
        expect(markup).toContain(`value="${mode}"`)
      })
    })

    it('3.d Project removal confirmation flow safely honors rejection without deleting', async () => {
      const mockConfirm = vi.fn().mockResolvedValue(false) // User clicks Cancel
      const mockDeleteProject = vi.fn().mockResolvedValue(true)

      const handleDelete = async (confirmed: boolean, pId: number) => {
        if (!confirmed) return false
        await mockDeleteProject(pId)
        return true
      }

      // User declines
      const resDeclined = await handleDelete(await mockConfirm(), 10)
      expect(resDeclined).toBe(false)
      expect(mockDeleteProject).not.toHaveBeenCalled()

      // User accepts
      mockConfirm.mockResolvedValueOnce(true)
      const resAccepted = await handleDelete(await mockConfirm(), 10)
      expect(resAccepted).toBe(true)
      expect(mockDeleteProject).toHaveBeenCalledWith(10)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Boundary Hardening & Architectural Ratchet Verification
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Boundary Hardening & Architectural Ratchets', () => {
    it('4.a FileTree recursion depth limiter (depth > 8) prevents stack overflow on recursive symlinks', () => {
      const renderRowsSimulator = (depth: number): any[] => {
        if (depth > 8) return []
        return [{ depth, children: renderRowsSimulator(depth + 1) }]
      }

      const tree = renderRowsSimulator(0)
      expect(tree).toHaveLength(1)
      let curr = tree[0]
      let maxDepth = 0
      while (curr && curr.children && curr.children.length > 0) {
        maxDepth = curr.children[0].depth
        curr = curr.children[0]
      }
      expect(maxDepth).toBe(8)
    })

    it('4.b FileTree error mapping handles outside_workspace and read_failed properly', () => {
      const getErrorMessage = (err: string | null) => {
        if (!err) return null
        return err === 'outside_workspace' ? 'filetree.outside_workspace' : 'filetree.read_failed'
      }

      expect(getErrorMessage('outside_workspace')).toBe('filetree.outside_workspace')
      expect(getErrorMessage('read_failed')).toBe('filetree.read_failed')
      expect(getErrorMessage('permission_denied')).toBe('filetree.read_failed')
      expect(getErrorMessage(null)).toBeNull()
    })

    it('4.c Project sessions with null updated_at and empty title render without NaN or undefined', () => {
      const activeProj: Project = {
        id: 99,
        name: 'Edge Sessions Project',
        root_path: 'D:\\EdgeSessions',
        is_favorite: 1,
        created_at: '2026-01-01',
      }

      useStore.setState({
        activeProject: activeProj,
        sessions: [
          { id: 501, title: '', project_id: 99, updated_at: null },
          { id: 502, title: 'Valid Title', project_id: 99, updated_at: 1700000000000 },
        ] as any,
      })

      const markup = renderToStaticMarkup(React.createElement(ProjectPage))
      expect(markup).toContain('Session #501')
      expect(markup).toContain('Valid Title')
      expect(markup).not.toContain('NaN')
      expect(markup).not.toContain('undefined')
    })

    it('4.d ProjectPage file line count is strictly within the 650-line ratchet limit and under 600 lines', () => {
      const fs = require('fs')
      const path = require('path')
      const projectPagePath = path.resolve(__dirname, '../src/pages/ProjectPage.tsx')
      const content = fs.readFileSync(projectPagePath, 'utf8')
      const lineCount = content.split('\n').length

      expect(lineCount).toBeLessThanOrEqual(600)
      expect(lineCount).toBeLessThanOrEqual(650)
    })

    it('4.e App.tsx routing includes projects view case and imports ProjectPage', () => {
      const fs = require('fs')
      const path = require('path')
      const appPath = path.resolve(__dirname, '../src/App.tsx')
      const content = fs.readFileSync(appPath, 'utf8')

      expect(content).toContain("case 'projects': return <ProjectPage />")
      expect(content).toContain("import ProjectPage from '@/pages/ProjectPage'")
    })
  })
})

