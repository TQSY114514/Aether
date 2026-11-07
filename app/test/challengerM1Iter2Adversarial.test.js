// ─────────────────────────────────────────────────────────────────────────────
// app/test/challengerM1Iter2Adversarial.test.js
// Empirical Challenger 2 Stress Harness for Milestone 1 Iteration 2 Gate
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const { checkWritePath, resolveInside } = nodeRequire('../electron/tools/sandbox')
const { buildSessionContext } = nodeRequire('../electron/llm/sessionContext')
const { TOOLS } = nodeRequire('../electron/tools/registry')

describe('Empirical Challenger 2 Adversarial Stress Suite', () => {
  let tmpBase

  beforeAll(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-c2-vitest-'))
  })

  afterAll(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true })
    } catch {}
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SUITE 1: Sandbox Path Validation & File Tools Boundary
  // ═════════════════════════════════════════════════════════════════════════
  describe('Suite 1: Sandbox Path Validation & Dynamic CWD File Tools', () => {
    const writeFileTool = TOOLS.find(t => t.name === 'write_file')
    const readFileTool = TOOLS.find(t => t.name === 'read_file')
    const editFileTool = TOOLS.find(t => t.name === 'edit_file')
    const applyPatchTool = TOOLS.find(t => t.name === 'apply_patch')

    it('1.1.1 write_file & read_file operate across arbitrary user directories', async () => {
      const arbitraryDir = path.join(tmpBase, 'user_workspace', 'nested')
      fs.mkdirSync(arbitraryDir, { recursive: true })
      const targetFile = path.join(arbitraryDir, 'data.txt')

      await writeFileTool.run({ path: targetFile, content: 'Initial Content Line 1\nLine 2\n' }, {})
      const readContent = readFileTool.run({ path: targetFile }, {})
      expect(readContent).toContain('Initial Content Line 1')
    })

    it('1.1.2 edit_file modifies files in arbitrary user directories', async () => {
      const targetFile = path.join(tmpBase, 'user_workspace', 'nested', 'data.txt')
      await editFileTool.run({ path: targetFile, old_string: 'Line 2', new_string: 'Line 2 Edited' }, {})
      const readContent = readFileTool.run({ path: targetFile }, {})
      expect(readContent).toContain('Line 2 Edited')
    })

    it('1.1.3 apply_patch modifies files in arbitrary user directories', async () => {
      const targetFile = path.join(tmpBase, 'user_workspace', 'nested', 'data.txt')
      const patch = '<<<<<<< SEARCH\nLine 2 Edited\n=======\nLine 2 Patched\n>>>>>>> REPLACE'
      await applyPatchTool.run({ path: targetFile, patch }, {})
      const readContent = readFileTool.run({ path: targetFile }, {})
      expect(readContent).toContain('Line 2 Patched')
    })

    it('1.2.1 write_file is strictly blocked on .git/hooks/pre-commit', async () => {
      const hookFile = path.join(tmpBase, '.git', 'hooks', 'pre-commit')
      fs.mkdirSync(path.dirname(hookFile), { recursive: true })
      await expect(writeFileTool.run({ path: hookFile, content: 'malicious' }, {})).rejects.toThrow()
    })

    it('1.2.2 write_file is strictly blocked on .git/config', async () => {
      const configFile = path.join(tmpBase, '.git', 'config')
      fs.mkdirSync(path.dirname(configFile), { recursive: true })
      fs.writeFileSync(configFile, '[core]\n')
      await expect(writeFileTool.run({ path: configFile, content: 'overwritten' }, {})).rejects.toThrow()
    })

    it('1.2.3 write_file is strictly blocked on .aether/ directory and files', async () => {
      const aetherFile = path.join(tmpBase, '.aether', 'state.json')
      fs.mkdirSync(path.dirname(aetherFile), { recursive: true })
      await expect(writeFileTool.run({ path: aetherFile, content: '{}' }, {})).rejects.toThrow()
    })

    it('1.2.4 edit_file is strictly blocked on .git/config and .git/hooks', async () => {
      const configFile = path.join(tmpBase, '.git', 'config')
      await expect(editFileTool.run({ path: configFile, old_string: '[core]', new_string: '[hacked]' }, {})).rejects.toThrow()
    })

    it('1.2.5 apply_patch is strictly blocked on .git/config and .git/hooks', async () => {
      const configFile = path.join(tmpBase, '.git', 'config')
      const p = '<<<<<<< SEARCH\n[core]\n=======\n[hacked]\n>>>>>>> REPLACE'
      await expect(applyPatchTool.run({ path: configFile, patch: p }, {})).rejects.toThrow()
    })

    it('1.3.1 Case and ADS bypass attempts on sensitive paths are rejected', () => {
      const upperHook = path.join(tmpBase, '.GIT', 'HOOKS', 'pre-commit')
      const upperConfig = path.join(tmpBase, '.Git', 'Config')
      const adsConfig = path.join(tmpBase, '.git', 'config::$DATA')
      const upperAether = path.join(tmpBase, '.AETHER', 'config.json')

      expect(checkWritePath(upperHook).ok).toBe(false)
      expect(checkWritePath(upperConfig).ok).toBe(false)
      expect(checkWritePath(adsConfig).ok).toBe(false)
      expect(checkWritePath(upperAether).ok).toBe(false)
    })

    it('1.4.1 read_file remains permitted for .git/config (strictly read-only)', () => {
      const configFile = path.join(tmpBase, '.git', 'config')
      fs.writeFileSync(configFile, '[core]\nrepositoryformatversion = 0\n')
      const content = readFileTool.run({ path: configFile }, {})
      expect(content).toContain('repositoryformatversion = 0')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SUITE 2: SessionContext Edge Cases & Exception Resilience
  // ═════════════════════════════════════════════════════════════════════════
  describe('Suite 2: SessionContext Edge Cases & Exception Resilience', () => {
    it('2.1 buildSessionContext() with undefined opts returns gracefully', () => {
      const res = buildSessionContext()
      expect(res).toBeDefined()
      expect(Array.isArray(res.prefix)).toBe(true)
      expect(typeof res.memoryCount).toBe('number')
    })

    it('2.2 buildSessionContext({}) with empty object returns gracefully', () => {
      const res = buildSessionContext({})
      expect(res).toBeDefined()
      expect(Array.isArray(res.prefix)).toBe(true)
      expect(typeof res.memoryCount).toBe('number')
    })

    it('2.3 buildSessionContext({ cwd: nonExistent }) handles missing directory without crashing', () => {
      const res = buildSessionContext({ cwd: '/does/not/exist/at/all' })
      expect(res).toBeDefined()
      expect(Array.isArray(res.prefix)).toBe(true)
    })

    it('2.4 buildSessionContext({ sessionId: -999999, db: null }) returns gracefully', () => {
      const res = buildSessionContext({ sessionId: -999999, db: null })
      expect(res).toBeDefined()
      expect(Array.isArray(res.prefix)).toBe(true)
    })

    it('2.5 buildSessionContext handles throwing DB operations gracefully', () => {
      const mockFailingDb = {
        getSession: () => { throw new Error('Database disk image is malformed') },
        getMemories: () => { throw new Error('No memory table') },
        prepare: () => { throw new Error('SQLite syntax error') },
      }
      const res = buildSessionContext({ sessionId: 1, db: mockFailingDb, userMessage: 'test prompt' })
      expect(res).toBeDefined()
      expect(Array.isArray(res.prefix)).toBe(true)
      expect(res.memoryCount).toBe(0)
    })

    it('2.6 buildSessionContext injects both AGENTS.md and relevant memory with memoryCount', () => {
      const integrationDir = path.join(tmpBase, 'integration_test')
      fs.mkdirSync(integrationDir, { recursive: true })
      fs.writeFileSync(path.join(integrationDir, 'AGENTS.md'), '# Integration Directive: Always write empirical tests.')

      const mockWorkingDb = {
        getSession: (id) => ({ id, cwd: integrationDir }),
        getMemories: () => [{ id: 1, content: 'Verified port 9090', origin: 'user', created_at: new Date().toISOString() }],
        getMemoriesScoped: () => [{ id: 1, content: 'Verified port 9090', origin: 'user', created_at: new Date().toISOString() }],
      }

      const res = buildSessionContext({
        db: mockWorkingDb,
        sessionId: 42,
        cwd: integrationDir,
        userMessage: 'What is the verified port?'
      })

      expect(res.prefix.some(p => p.content.includes('Always write empirical tests'))).toBe(true)
      expect(res.prefix.some(p => p.content.includes('Verified port 9090'))).toBe(true)
      expect(res.memoryCount).toBeGreaterThan(0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SUITE 3: e2eArchitectureTrack.test.ts Test Authenticity Inspection
  // ═════════════════════════════════════════════════════════════════════════
  describe('Suite 3: e2eArchitectureTrack.test.ts Authenticity Inspection', () => {
    const trackFile = path.resolve(__dirname, 'e2eArchitectureTrack.test.ts')
    const trackSource = fs.readFileSync(trackFile, 'utf8')
    const t1F01toF08 = trackSource.slice(
      trackSource.indexOf("describe('F01: Delete Project IPC Handler'"),
      trackSource.indexOf("describe('F09: Eliminate Model Router Auto-Downgrade'")
    )

    it('3.1 No mockSessionContext dummy literal in F01-F08 Tier 1', () => {
      expect(t1F01toF08.includes('buildSessionContext: (')).toBe(false)
    })

    it('3.2 No mockAutoMemory dummy literal in F01-F08 Tier 1', () => {
      expect(t1F01toF08.includes('resolveMemoryScopeKey: (')).toBe(false)
    })

    it('3.3 No mockSandbox dummy literal in F01-F08 Tier 1', () => {
      expect(t1F01toF08.includes('validatePath: (')).toBe(false)
    })

    it('3.4 Genuine real calls to sessionContext in Tier 1', () => {
      expect(t1F01toF08.includes('sessionContext.buildSessionContext(')).toBe(true)
    })

    it('3.5 Genuine real calls to sandbox in Tier 1', () => {
      expect(t1F01toF08.includes('sandbox.checkWritePath(')).toBe(true)
    })

    it('3.6 Genuine real calls to database in Tier 1', () => {
      expect(t1F01toF08.includes('db.createSession(')).toBe(true)
      expect(t1F01toF08.includes('db.getMemoriesScoped(')).toBe(true)
    })

    it('3.7 Genuine real calls to projectInstructions in Tier 1', () => {
      expect(t1F01toF08.includes('projectInstructions.loadProjectInstructions(')).toBe(true)
    })
  })
})
