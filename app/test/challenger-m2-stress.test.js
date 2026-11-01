// ─────────────────────────────────────────────────────────────────────────────
// app/test/challenger-m2-stress.test.js
//
// Milestone 2 Empirical Stress Test Harness & Adversarial Oracles
// Author: challenger_m2_1 (teamwork_challenger)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const { createEmptyDatabase } = require('../electron/db/schema.js')
const dbModule = require('../electron/database.js')
const { registerProjectHandlers } = require('../electron/ipc/project.handler.js')
const { registerSessionHandlers } = require('../electron/ipc/session.handler.js')
const { clearSessionWorkspaces } = require('../electron/tools/sandbox.js')
const { invalidateCache } = require('../electron/llm/projectInstructions.js')

describe('Challenger M2 Empirical Stress Suite', () => {
  let tmpDir
  let dbPath
  let db
  let projectHandlers
  let sessionHandlers

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenger-m2-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = createEmptyDatabase(dbPath)
    dbModule.setDatabase(db)
    clearSessionWorkspaces()
    invalidateCache()

    projectHandlers = new Map()
    sessionHandlers = new Map()

    const mockProjectIpc = {
      handle: (channel, fn) => projectHandlers.set(channel, fn),
    }
    const mockSessionIpc = {
      handle: (channel, fn) => sessionHandlers.set(channel, fn),
    }

    const mockGetWebContents = () => ({
      isDestroyed: () => false,
      send: () => {},
    })

    registerProjectHandlers(mockProjectIpc, dbModule, mockGetWebContents)
    registerSessionHandlers(mockSessionIpc, dbModule)
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
  // SUITE 1: Instruction Reading & Saving Empirical Stress Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Suite 1: Instruction Reading & Saving Empirical Stress', () => {
    it('1.1 Large instruction file (>100KB, e.g. 250KB and 500KB) roundtrips without truncation or corruption', async () => {
      const projDir = path.join(tmpDir, 'large-inst-workspace')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Large Inst Workspace', root_path: projDir })

      // Generate a ~250KB instruction payload with markdown headers, codeblocks, unicode, and emojis
      const chunk = '### Section Header with Unicode (测试 & 🚀)\n' +
        '```typescript\nconst rule = "Follow strict sandbox boundary rules";\nconsole.log(rule);\n```\n' +
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.\n'
      const repeatCount = Math.ceil(250 * 1024 / chunk.length)
      const largeContent = `# Full Enterprise AGENTS.md\n\n` + chunk.repeat(repeatCount)
      const expectedByteLength = Buffer.byteLength(largeContent, 'utf8')
      expect(expectedByteLength).toBeGreaterThan(250 * 1024) // Verified >250KB

      // Save via project:saveInstructions
      const saveRes = await projectHandlers.get('project:saveInstructions')(null, {
        projectId: proj.id,
        content: largeContent,
        fileName: 'AGENTS.md',
      })
      expect(saveRes.ok).toBe(true)
      expect(saveRes.path).toBe(path.resolve(projDir, 'AGENTS.md'))

      // Read back via project:getInstructions
      const getRes = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(getRes.exists).toBe(true)
      expect(getRes.fileName).toBe('AGENTS.md')
      expect(getRes.content.length).toBe(largeContent.length)
      expect(getRes.content).toBe(largeContent)
      expect(getRes.error).toBeUndefined()

      // Further stress: 500KB payload test
      const hugeContent = largeContent + largeContent
      const saveHugeRes = await projectHandlers.get('project:saveInstructions')(null, {
        projectId: proj.id,
        content: hugeContent,
        fileName: 'AGENTS.md',
      })
      expect(saveHugeRes.ok).toBe(true)

      const getHugeRes = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(getHugeRes.exists).toBe(true)
      expect(getHugeRes.content.length).toBe(hugeContent.length)
      expect(getHugeRes.content).toBe(hugeContent)
    })

    it('1.2 Empty instruction file (0 bytes) returns exists: true and content: ""', async () => {
      const projDir = path.join(tmpDir, 'empty-inst-workspace')
      fs.mkdirSync(projDir, { recursive: true })
      const emptyFile = path.join(projDir, 'AGENTS.md')
      fs.writeFileSync(emptyFile, '', 'utf8') // Exactly 0 bytes
      expect(fs.statSync(emptyFile).size).toBe(0)

      const proj = dbModule.createProject({ name: 'Empty Inst Workspace', root_path: projDir })

      const getRes = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(getRes.exists).toBe(true)
      expect(getRes.fileName).toBe('AGENTS.md')
      expect(getRes.path).toBe(emptyFile)
      expect(getRes.content).toBe('')
      expect(getRes.error).toBeUndefined()
    })

    it('1.3 Project with no instruction files at all returns exists: false, content: "", fileName: "AGENTS.md"', async () => {
      const projDir = path.join(tmpDir, 'no-inst-workspace')
      fs.mkdirSync(projDir, { recursive: true })
      // No AGENTS.md, AETHER.md, CLAUDE.md, .aetherai.md created
      const proj = dbModule.createProject({ name: 'No Inst Workspace', root_path: projDir })

      const getRes = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(getRes.exists).toBe(false)
      expect(getRes.fileName).toBe('AGENTS.md')
      expect(getRes.path).toBe(path.join(projDir, 'AGENTS.md'))
      expect(getRes.content).toBe('')
      expect(getRes.error).toBeUndefined()
    })

    it('1.4 Project with non-existent root directory returns exists: false and Directory not found error', async () => {
      const ghostDir = path.join(tmpDir, 'non-existent-folder-' + Date.now())
      const proj = dbModule.createProject({ name: 'Ghost Workspace', root_path: ghostDir })

      const getRes = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(getRes.exists).toBe(false)
      expect(getRes.fileName).toBe('AGENTS.md')
      expect(getRes.path).toBe('')
      expect(getRes.content).toBe('')
      expect(getRes.error).toBe('Directory not found')
    })

    it('1.5 Multi-file priority order strictly prioritizes AGENTS.md > AETHER.md > CLAUDE.md > .aetherai.md', async () => {
      const projDir = path.join(tmpDir, 'priority-workspace')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Priority Workspace', root_path: projDir })

      const fAgents = path.join(projDir, 'AGENTS.md')
      const fAether = path.join(projDir, 'AETHER.md')
      const fClaude = path.join(projDir, 'CLAUDE.md')
      const fDotAether = path.join(projDir, '.aetherai.md')

      // Case A: Only CLAUDE.md and .aetherai.md exist -> CLAUDE.md wins
      fs.writeFileSync(fClaude, '# Claude Instructions', 'utf8')
      fs.writeFileSync(fDotAether, '# Dot Aether Instructions', 'utf8')

      let res = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('CLAUDE.md')
      expect(res.content).toBe('# Claude Instructions')

      // Case B: Add AETHER.md -> AETHER.md wins over CLAUDE.md and .aetherai.md
      fs.writeFileSync(fAether, '# Aether Instructions', 'utf8')
      res = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('AETHER.md')
      expect(res.content).toBe('# Aether Instructions')

      // Case C: Add AGENTS.md -> AGENTS.md wins over all others
      fs.writeFileSync(fAgents, '# AGENTS Instructions', 'utf8')
      res = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('AGENTS.md')
      expect(res.content).toBe('# AGENTS Instructions')

      // Case D: Remove AGENTS.md and AETHER.md, keep only .aetherai.md -> .aetherai.md wins
      fs.unlinkSync(fAgents)
      fs.unlinkSync(fAether)
      fs.unlinkSync(fClaude)
      res = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(res.exists).toBe(true)
      expect(res.fileName).toBe('.aetherai.md')
      expect(res.content).toBe('# Dot Aether Instructions')
    })

    it('1.6 Saving instructions rejects null/undefined content and gracefully writes empty string', async () => {
      const projDir = path.join(tmpDir, 'save-edge-workspace')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Save Edge Workspace', root_path: projDir })

      // Content as undefined
      const resUndef = await projectHandlers.get('project:saveInstructions')(null, {
        projectId: proj.id,
        content: undefined,
        fileName: 'AGENTS.md',
      })
      expect(resUndef.ok).toBe(true)
      const readUndef = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(readUndef.content).toBe('')

      // Content as null
      const resNull = await projectHandlers.get('project:saveInstructions')(null, {
        projectId: proj.id,
        content: null,
        fileName: 'AGENTS.md',
      })
      expect(resNull.ok).toBe(true)
      const readNull = await projectHandlers.get('project:getInstructions')(null, proj.id)
      expect(readNull.content).toBe('')
    })

    it('1.7 Saving instructions blocks directory traversal variants and non-whitelisted extensions', () => {
      const projDir = path.join(tmpDir, 'sec-test-workspace')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Security Workspace', root_path: projDir })

      const illegalNames = [
        '../AGENTS.md',
        '..\\AGENTS.md',
        'sub/AGENTS.md',
        'sub\\AGENTS.md',
        'AGENTS.md/../AGENTS.md',
        'CLAUDE.md.exe',
        'AGENTS.sh',
        'evil.js',
        '.bashrc',
        'config.json',
      ]

      for (const name of illegalNames) {
        expect(() => {
          projectHandlers.get('project:saveInstructions')(null, {
            projectId: proj.id,
            content: 'malicious payload',
            fileName: name,
          })
        }).toThrow()
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 2: Session Defaults Inheritance & Resilience Stress Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Suite 2: Session Defaults Inheritance & Resilience Stress', () => {
    it('2.1 session:create-and-select handles null, undefined, or missing projectId gracefully', async () => {
      // Direct IPC call with null projectId
      const res1 = await sessionHandlers.get('session:create-and-select')(null, {
        projectId: null,
      })
      expect(res1.session).toBeDefined()
      expect(res1.session.id).toBeGreaterThan(0)
      expect(res1.session.project_id).toBeNull()

      // Direct IPC call with undefined
      const res2 = await sessionHandlers.get('session:create-and-select')(null, {})
      expect(res2.session).toBeDefined()
      expect(res2.session.id).toBeGreaterThan(0)
      expect(res2.session.project_id).toBeNull()

      // Direct IPC call with valid projectId
      const projDir = path.join(tmpDir, 'session-proj')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Session Proj', root_path: projDir })

      const res3 = await sessionHandlers.get('session:create-and-select')(null, {
        projectId: proj.id,
      })
      expect(res3.session).toBeDefined()
      expect(res3.session.project_id).toBe(proj.id)

      const fetched = dbModule.getSession(res3.session.id)
      expect(fetched.project_id).toBe(proj.id)
    })

    it('2.2 session:create-and-select accepts non-existent modelId without database crash', async () => {
      const res = await sessionHandlers.get('session:create-and-select')(null, {
        providerId: 99999,
        modelId: 88888,
        personaId: null,
        projectId: null,
      })
      expect(res.session).toBeDefined()
      expect(res.config.providerId).toBe(99999)
      expect(res.config.modelId).toBe(88888)

      const dbCfg = dbModule.getSessionConfig(res.session.id)
      expect(dbCfg.providerId).toBe(99999)
      expect(dbCfg.modelId).toBe(88888)
    })

    it('2.3 Store createSession simulation: when activeProject.default_model_id is null, falls back to store defaultModelId or enabled provider', async () => {
      // Setup mock providers and models in db
      const provRow = dbModule.addProvider
        ? dbModule.addProvider({ name: 'TestProvider', api_format: 'openai', api_url: 'https://api.openai.com/v1', enabled: 1 })
        : { lastInsertRowid: 10 }
      const provId = Number(provRow.lastInsertRowid || 10)

      const mockModels = [
        { id: 101, provider_id: provId, name: 'primary-model', is_primary: 1 },
        { id: 102, provider_id: provId, name: 'secondary-model', is_primary: 0 },
      ]
      const mockProviders = [{ id: provId, name: 'TestProvider', enabled: true }]

      // Recreate sessionSlice createSession algorithm
      async function simulateCreateSession(storeState, electronAPI) {
        const s = storeState
        const activeProject = s.activeProject
        const allProviders = await electronAPI.provider.list()
        const enabledProviders = allProviders.filter(p => p.enabled)
        let cfg = {
          providerId: null,
          modelId: null,
          personaId: null,
          projectId: activeProject?.id ? Number(activeProject.id) : null,
        }

        const targetModelId = activeProject?.default_model_id != null
          ? activeProject.default_model_id
          : s.defaultModelId

        if (targetModelId) {
          const defModel = (s.allModels.find(m => m.id === targetModelId) ||
            (await electronAPI.model.listAll()).find(m => m.id === targetModelId))
          if (defModel) {
            cfg.providerId = defModel.provider_id
            cfg.modelId = defModel.id
          }
        }
        if (s.defaultPersonaId) {
          cfg.personaId = s.defaultPersonaId
        }
        if (!cfg.providerId && enabledProviders.length > 0) {
          cfg.providerId = enabledProviders[0].id
          const models = await electronAPI.model.list(cfg.providerId)
          const primary = models.find(m => m.is_primary) || models[0]
          if (primary) cfg.modelId = primary.id
        }
        if (cfg.providerId && !cfg.modelId) {
          const models = await electronAPI.model.list(cfg.providerId)
          const primary = models.find(m => m.is_primary) || models[0]
          if (primary) cfg.modelId = primary.id
        }
        const result = await electronAPI.session.createAndSelect(cfg)
        const sid = result.session.id
        const sessionCfg = result.config

        let updatedAgentMode = s.agentMode
        if (activeProject?.default_agent_mode) {
          updatedAgentMode = activeProject.default_agent_mode
        }

        const boundSession = {
          ...result.session,
          project_id: result.session.project_id ?? (activeProject?.id ? Number(activeProject.id) : null),
        }

        return { sid, boundSession, sessionCfg, updatedAgentMode }
      }

      const mockElectronAPI = {
        provider: { list: async () => mockProviders },
        model: {
          list: async (pid) => mockModels.filter(m => m.provider_id === pid),
          listAll: async () => mockModels,
        },
        session: {
          createAndSelect: async (cfg) => sessionHandlers.get('session:create-and-select')(null, cfg),
        },
      }

      // Scenario A: activeProject has default_model_id: null, store has defaultModelId: 102
      const stateA = {
        activeProject: { id: 7, name: 'Proj A', default_model_id: null, default_agent_mode: 'auto_review' },
        defaultModelId: 102,
        allModels: mockModels,
        agentMode: 'workspace',
      }
      const resA = await simulateCreateSession(stateA, mockElectronAPI)
      expect(resA.boundSession.project_id).toBe(7)
      expect(resA.sessionCfg.modelId).toBe(102)
      expect(resA.sessionCfg.providerId).toBe(provId)
      expect(resA.updatedAgentMode).toBe('auto_review')

      // Scenario B: activeProject has default_model_id pointing to a deleted / invalid model (e.g. 9999)
      const stateB = {
        activeProject: { id: 8, name: 'Proj B', default_model_id: 9999, default_agent_mode: 'explore' },
        defaultModelId: 102,
        allModels: mockModels,
        agentMode: 'workspace',
      }
      const resB = await simulateCreateSession(stateB, mockElectronAPI)
      // Must not throw; falls back to enabled provider primary model 101
      expect(resB.boundSession.project_id).toBe(8)
      expect(resB.sessionCfg.modelId).toBe(101)
      expect(resB.sessionCfg.providerId).toBe(provId)
      expect(resB.updatedAgentMode).toBe('explore')

      // Scenario C: activeProject is null
      const stateC = {
        activeProject: null,
        defaultModelId: null,
        allModels: mockModels,
        agentMode: 'workspace',
      }
      const resC = await simulateCreateSession(stateC, mockElectronAPI)
      expect(resC.boundSession.project_id).toBeNull()
      expect(resC.sessionCfg.modelId).toBe(101) // falls back to primary model
      expect(resC.updatedAgentMode).toBe('workspace') // preserved
    })

    it('2.4 Session creation with messages preserves project_id and survives empty session pruning', async () => {
      const projDir = path.join(tmpDir, 'prune-safe-proj')
      fs.mkdirSync(projDir, { recursive: true })
      const proj = dbModule.createProject({ name: 'Prune Safe Proj', root_path: projDir })

      // Create 5 sessions, adding an initial message to each immediately
      const createdSessions = []
      for (let i = 0; i < 5; i++) {
        const res = await sessionHandlers.get('session:create-and-select')(null, {
          projectId: i % 2 === 0 ? proj.id : null,
          providerId: 1,
          modelId: 2,
        })
        const sid = res.session.id
        // Add message so it ceases to be an uncommitted empty placeholder
        dbModule.addMessage({
          session_id: sid,
          role: 'user',
          content: `Initial prompt for session ${i}`,
        })
        createdSessions.push({ sid, expectedPid: i % 2 === 0 ? proj.id : null })
      }

      // Now trigger another create-and-select to force pruneEmptySessions to run
      const freshRes = await sessionHandlers.get('session:create-and-select')(null, {
        projectId: proj.id,
      })
      expect(freshRes.session.project_id).toBe(proj.id)

      // All 5 sessions with messages must survive with accurate project_id
      for (const item of createdSessions) {
        const row = dbModule.getSession(item.sid)
        expect(row).toBeDefined()
        expect(row.project_id).toBe(item.expectedPid)
      }
    })
  })
})
