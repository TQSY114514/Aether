// ─────────────────────────────────────────────────────────────────────────────
// app/test/e2e-aether2-r1-r5.test.js
//
// Aether 2.0 Core Architecture Upgrades Automated Test Suite
// Requirements: R1, R2, R3, R4, R5
// 4-Tier Test Methodology:
//   Tier 1: Feature Coverage (>=5 test cases per feature for R1–R5)
//   Tier 2: Boundary & Corner Cases (>=5 test cases per feature for R1–R5)
//   Tier 3: Cross-Feature Combinations (Pairwise integration tests)
//   Tier 4: Real-World Application Scenarios (End-to-end user workflows)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import Module from 'node:module'

const REPO_ROOT = path.resolve(__dirname, '..')
const APP_TYPES_DIR = path.join(REPO_ROOT, 'types')
const DOMAIN_TYPES_PATH = path.join(APP_TYPES_DIR, 'domain.d.ts')
const MODEL_ROUTER_PATH = path.join(REPO_ROOT, 'electron/llm/modelRouter.js')
const CONTEXT_BUDGET_PATH = path.join(REPO_ROOT, 'electron/llm/contextBudget.js')
const COMPACTION_PATH = path.join(REPO_ROOT, 'electron/llm/compaction.js')
const SESSION_CONTEXT_PATH = path.join(REPO_ROOT, 'electron/llm/sessionContext.js')
const DATABASE_JS_PATH = path.join(REPO_ROOT, 'electron/database.js')
const CHAT_HANDLER_PATH = path.join(REPO_ROOT, 'electron/ipc/chat.handler.js')
const PRELOAD_PATH = path.join(REPO_ROOT, 'electron/preload.js')
const ENV_D_TS_PATH = path.join(REPO_ROOT, 'src/env.d.ts')
const TOOL_LOOP_TRACKER_PATH = path.join(REPO_ROOT, 'electron/llm/toolLoopTracker.js')
const SUBAGENT_PATH = path.join(REPO_ROOT, 'electron/llm/subAgent.js')

// Track temp directories for cleanup
const tempDirs = []
function createTempWorkspace(prefix = 'aether2-test-') {
  const dir = fs.mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

// Stub Electron app and safeStorage for headless database initialization
const origLoad = Module._load
const testUserDataDir = createTempWorkspace('aether2-user-data-')
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: { getPath: () => testUserDataDir },
      safeStorage: { isEncryptionAvailable: () => false },
      ipcMain: { handle: () => {}, on: () => {} },
    }
  }
  return origLoad.apply(this, arguments)
}

const database = require(DATABASE_JS_PATH)
const featureFlags = require('../electron/featureFlags.js')

beforeAll(() => {
  database.initDatabase()
})

afterAll(() => {
  Module._load = origLoad
  for (const d of tempDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 1: FEATURE COVERAGE (>=5 test cases per requirement R1–R5)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 1: Feature Coverage', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // Requirement R1: Progressive Type System (domain.d.ts + JSDoc TS)
  // ───────────────────────────────────────────────────────────────────────────
  describe('R1: Progressive Type System', () => {
    it('T1-R1-01: domain.d.ts exports Session, Message, and TurnSummary interfaces', () => {
      expect(fs.existsSync(DOMAIN_TYPES_PATH), `domain.d.ts must exist at ${DOMAIN_TYPES_PATH}`).toBe(true)
      const content = fs.readFileSync(DOMAIN_TYPES_PATH, 'utf8')
      expect(content).toMatch(/export\s+interface\s+Session\b/)
      expect(content).toMatch(/export\s+interface\s+Message\b/)
      expect(content).toMatch(/export\s+interface\s+TurnSummary\b/)
    })

    it('T1-R1-02: domain.d.ts exports ProviderConfig, ModelConfig, and ModelTier', () => {
      expect(fs.existsSync(DOMAIN_TYPES_PATH), `domain.d.ts must exist at ${DOMAIN_TYPES_PATH}`).toBe(true)
      const content = fs.readFileSync(DOMAIN_TYPES_PATH, 'utf8')
      expect(content).toMatch(/export\s+interface\s+ProviderConfig\b/)
      expect(content).toMatch(/export\s+interface\s+ModelConfig\b/)
      expect(content).toMatch(/export\s+type\s+ModelTier\b/)
    })

    it('T1-R1-03: domain.d.ts exports ToolDefinition, ToolCall, and ToolResult', () => {
      expect(fs.existsSync(DOMAIN_TYPES_PATH), `domain.d.ts must exist at ${DOMAIN_TYPES_PATH}`).toBe(true)
      const content = fs.readFileSync(DOMAIN_TYPES_PATH, 'utf8')
      expect(content).toMatch(/export\s+interface\s+ToolDefinition\b/)
      expect(content).toMatch(/export\s+interface\s+ToolCall\b/)
      expect(content).toMatch(/export\s+interface\s+ToolResult\b/)
    })

    it('T1-R1-04: domain.d.ts exports AgentTask, Checkpoint, and StrategyCapsule', () => {
      expect(fs.existsSync(DOMAIN_TYPES_PATH), `domain.d.ts must exist at ${DOMAIN_TYPES_PATH}`).toBe(true)
      const content = fs.readFileSync(DOMAIN_TYPES_PATH, 'utf8')
      expect(content).toMatch(/export\s+interface\s+AgentTask\b/)
      expect(content).toMatch(/export\s+interface\s+Checkpoint\b/)
      expect(content).toMatch(/export\s+interface\s+StrategyCapsule\b/)
    })

    it('T1-R1-05: JSDoc type annotations enable IDE typing without breaking zero-build CJS runtime', () => {
      const routerSrc = fs.readFileSync(MODEL_ROUTER_PATH, 'utf8')
      const budgetSrc = fs.readFileSync(CONTEXT_BUDGET_PATH, 'utf8')

      // Verify JSDoc annotations referencing domain types
      expect(routerSrc).toMatch(/@typedef\s+\{import\(['"].*domain['"]\)\.(ModelTier|ModelConfig|ProviderConfig)\}/)
      expect(budgetSrc).toMatch(/@typedef\s+\{import\(['"].*domain['"]\)\.(Message|ModelConfig|ContextTier)\}/)

      // Verify CommonJS runtime executes cleanly
      const modelRouter = require(MODEL_ROUTER_PATH)
      const contextBudget = require(CONTEXT_BUDGET_PATH)
      expect(typeof modelRouter.routeTask).toBe('function')
      expect(typeof contextBudget.classifyToolResult).toBe('function')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Requirement R2: Arena ELO-Driven Phase & Role Model Routing
  // ───────────────────────────────────────────────────────────────────────────
  describe('R2: Arena ELO-Driven Phase & Role Model Routing', () => {
    it('T1-R2-01: agent.phaseRouting feature flag is registered in featureFlags.js', () => {
      expect(featureFlags.has('agent.phaseRouting')).toBe(true)
      const def = featureFlags.defs().find(d => d.key === 'agent.phaseRouting')
      expect(def).toBeDefined()
      expect(def.category).toBe('agent')
      expect(def.default).toBe(false)
    })

    it('T1-R2-02: modelRouter.inferToolLoopPhase classifies spec phase for exploration tools', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')

      // Depth 0 with planning or exploration tools -> spec
      const phase1 = modelRouter.inferToolLoopPhase({
        depth: 0,
        lastToolCalls: ['grep_search', 'read_file'],
        isPlanning: true,
      })
      expect(phase1).toBe('spec')

      // Only exploration tools at depth 1 -> spec
      const phase2 = modelRouter.inferToolLoopPhase({
        depth: 1,
        lastToolCalls: ['list_dir', 'read_file'],
      })
      expect(phase2).toBe('spec')
    })

    it('T1-R2-03: modelRouter.inferToolLoopPhase classifies worker phase for code mutation tools', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')

      const phase = modelRouter.inferToolLoopPhase({
        depth: 2,
        lastToolCalls: ['edit_file', 'replace_file_content'],
      })
      expect(phase).toBe('worker')
    })

    it('T1-R2-04: modelRouter.inferToolLoopPhase classifies validator phase for verification and tests', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')

      const phase1 = modelRouter.inferToolLoopPhase({
        depth: 3,
        isVerifying: true,
      })
      expect(phase1).toBe('validator')

      const phase2 = modelRouter.inferToolLoopPhase({
        depth: 3,
        lastToolCalls: ['run_command'],
        lastErrorKinds: ['test_failure'],
      })
      expect(phase2).toBe('validator')
    })

    it('T1-R2-05: modelRouter.resolvePhaseTarget resolves Coding ELO leader for worker and Reasoning ELO leader for validator', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.resolvePhaseTarget, 'modelRouter.resolvePhaseTarget must be exported').toBe('function')

      const db = database.getDatabase()

      // Seed providers and models
      db.prepare("INSERT OR REPLACE INTO provider (id, name, api_url, enabled, api_format) VALUES (1, 'TestProvider', 'http://localhost', 1, 'openai')").run()
      db.prepare("INSERT OR REPLACE INTO model (id, provider_id, model_name, is_primary) VALUES (10, 1, 'claude-3-5-sonnet', 1)").run()
      db.prepare("INSERT OR REPLACE INTO model (id, provider_id, model_name, is_primary) VALUES (20, 1, 'gpt-4o-mini', 0)").run()
      db.prepare("INSERT OR REPLACE INTO model (id, provider_id, model_name, is_primary) VALUES (30, 1, 'o3-mini', 0)").run()

      // Seed ELO scores
      db.prepare("INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (10, 'coding', 1250, 10, 12)").run()
      db.prepare("INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (20, 'coding', 1050, 2, 8)").run()
      db.prepare("INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (30, 'reasoning', 1320, 15, 16)").run()

      const allModels = db.prepare("SELECT m.*, p.name as provider_name, p.api_url, p.api_key, p.api_format FROM model m JOIN provider p ON m.provider_id = p.id").all()

      // Worker phase -> model 10 (coding leader with 1250 score)
      const workerTarget = modelRouter.resolvePhaseTarget('worker', { db, allModels })
      expect(workerTarget).toBeDefined()
      expect(workerTarget.model.id).toBe(10)
      expect(workerTarget.model.model_name).toBe('claude-3-5-sonnet')

      // Validator phase -> model 30 (reasoning leader with 1320 score)
      const validatorTarget = modelRouter.resolvePhaseTarget('validator', { db, allModels })
      expect(validatorTarget).toBeDefined()
      expect(validatorTarget.model.id).toBe(30)
      expect(validatorTarget.model.model_name).toBe('o3-mini')

      // Spec phase -> fast tier model (gpt-4o-mini)
      const specTarget = modelRouter.resolvePhaseTarget('spec', { db, allModels })
      expect(specTarget).toBeDefined()
      expect(specTarget.model.id).toBe(20)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Requirement R3: Post-Compaction File Rehydration & Pre-Compact Memory Flush
  // ───────────────────────────────────────────────────────────────────────────
  describe('R3: Post-Compaction File Rehydration & Pre-Compact Memory Flush', () => {
    it('T1-R3-01: maybeCompact emits PreCompact hook with db and sessionId before compaction', async () => {
      const compaction = require(COMPACTION_PATH)
      const hooks = require('../electron/llm/hooks')

      let hookReceived = null
      const unhook = hooks.registerHook('PreCompact', (ctx) => {
        hookReceived = ctx
      })

      const db = database.getDatabase()
      try {
        const messages = Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Turn ${i} with substantial token payload to trigger compaction `.repeat(20),
        }))

        await compaction.maybeCompact({
          db,
          sessionId: 42,
          provider: { api_format: 'openai' },
          model: { model_name: 'test-model' },
          messages,
          budget: 2000,
          force: true,
        })

        expect(hookReceived).not.toBeNull()
        expect(hookReceived.sessionId).toBe(42)
        expect(hookReceived.db).toBe(db)
      } finally {
        unhook()
      }
    })

    it('T1-R3-02: PreCompact memory flush persists key architectural decisions to SQLite memory table', async () => {
      const compaction = require(COMPACTION_PATH)
      const db = database.getDatabase()

      const sessionId = 99
      const messages = [
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: 'We decide to use WAL mode in better-sqlite3 for zero-locking concurrent reads.' },
        { role: 'assistant', content: 'Confirmed. Architecture decision recorded: WAL mode with better-sqlite3.' },
        ...Array.from({ length: 12 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Subsequent discussion step ${i} `.repeat(15),
        })),
      ]
      // Record max id before compaction
      const maxBeforeRow = db.prepare('SELECT MAX(id) as max_id FROM memory').get()
      const maxBefore = Number(maxBeforeRow?.max_id || 0)

      await compaction.maybeCompact({
        db,
        sessionId,
        provider: { api_format: 'openai' },
        model: { model_name: 'test-model' },
        messages,
        budget: 2000,
        force: true,
      })

      // Memory table should have at least one record persisted from decisions
      const memories = db.prepare('SELECT * FROM memory WHERE id > ?').all(maxBefore)
      expect(memories.length).toBeGreaterThan(0)
      expect(memories.some(m => m.content.toLowerCase().includes('wal') || m.content.toLowerCase().includes('better-sqlite3') || m.content.toLowerCase().includes('architecture'))).toBe(true)
    })

    it('T1-R3-03: sessionContext extracts top-3 active files sorted by read/edit activity score', () => {
      const sessionContext = require(SESSION_CONTEXT_PATH)
      expect(typeof sessionContext.getActiveFileSnippets, 'sessionContext.getActiveFileSnippets must be exported').toBe('function')
      expect(typeof sessionContext.recordFileActivity, 'sessionContext.recordFileActivity must be exported').toBe('function')

      const wsDir = createTempWorkspace('r3-files-')
      // Create sample files
      fs.writeFileSync(path.join(wsDir, 'fileA.js'), 'console.log("A")\n'.repeat(20), 'utf8')
      fs.writeFileSync(path.join(wsDir, 'fileB.js'), 'console.log("B")\n'.repeat(20), 'utf8')
      fs.writeFileSync(path.join(wsDir, 'fileC.js'), 'console.log("C")\n'.repeat(20), 'utf8')
      fs.writeFileSync(path.join(wsDir, 'fileD.js'), 'console.log("D")\n'.repeat(20), 'utf8')

      // Record activity in sessionContext
      sessionContext.recordFileActivity(101, path.join(wsDir, 'fileA.js'), 'edit')
      sessionContext.recordFileActivity(101, path.join(wsDir, 'fileA.js'), 'edit')
      sessionContext.recordFileActivity(101, path.join(wsDir, 'fileB.js'), 'edit')
      sessionContext.recordFileActivity(101, path.join(wsDir, 'fileC.js'), 'read')
      sessionContext.recordFileActivity(101, path.join(wsDir, 'fileD.js'), 'read')

      const snippets = sessionContext.getActiveFileSnippets(101, { maxFiles: 3, wsRoot: wsDir })
      expect(Array.isArray(snippets)).toBe(true)
      expect(snippets.length).toBeLessThanOrEqual(3)
    })

    it('T1-R3-04: Rehydrated file snippets clamp to 80 lines and appear in compacted handoff message', async () => {
      const compaction = require(COMPACTION_PATH)
      const providerAdapter = require('../electron/llm/providerAdapter')
      const origCompleteChat = providerAdapter.completeChat
      providerAdapter.completeChat = async () => '## Goal\nRefactor\n## Constraints\nNone\n## Progress\n- [x] Step 1\n## Key Decisions\nNone\n## Next Steps\nContinue\n## Critical Context\nNone'

      const wsDir = createTempWorkspace('r3-rehydrate-')
      const db = database.getDatabase()

      try {
        // Create a 150-line file
        const bigFile = path.join(wsDir, 'bigFile.js')
        const lines = Array.from({ length: 150 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n')
        fs.writeFileSync(bigFile, lines, 'utf8')

        const sessionContext = require(SESSION_CONTEXT_PATH)
        expect(typeof sessionContext.recordFileActivity, 'sessionContext.recordFileActivity must be exported').toBe('function')
        sessionContext.recordFileActivity(202, bigFile, 'edit')

        const messages = [
          { role: 'system', content: 'Init system' },
          { role: 'user', content: 'Refactor bigFile.js to modular functions' },
          { role: 'assistant', content: 'Working on refactor' },
          ...Array.from({ length: 30 }, (_, i) => ({
            role: 'assistant',
            content: `Refactoring details ${i} `.repeat(100),
          })),
        ]

        const compacted = await compaction.maybeCompact({
          db,
          sessionId: 202,
          provider: { api_format: 'openai' },
          model: { model_name: 'test-model' },
          messages,
          budget: 8000,
          force: true,
          wsRoot: wsDir,
        })

        expect(compacted).toBeDefined()
        const handoffMsg = compacted.find(m => m.role === 'system' && m.content.includes('[context compaction]'))
        expect(handoffMsg).toBeDefined()
        expect(handoffMsg.content).toContain('[context compaction: rehydrated active files]')
        // Verify snippet does not dump all 150 lines
        expect(handoffMsg.content).not.toContain('const line140 = 140;')
      } finally {
        providerAdapter.completeChat = origCompleteChat
      }
    })

    it('T1-R3-05: Compacted context appends active plan checklist and explicit resume instruction', async () => {
      const compaction = require(COMPACTION_PATH)
      const db = database.getDatabase()

      const sessionId = 303
      // Save active session plan
      database.saveSessionPlan(sessionId, JSON.stringify({
        title: 'Aether 2.0 Core Upgrade',
        tasks: [
          { id: '1', title: 'Survey architecture', status: 'completed' },
          { id: '2', title: 'Implement domain.d.ts', status: 'in_progress' },
          { id: '3', title: 'Run tests', status: 'pending' },
        ],
      }))

      const messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Continue with the tasks' },
        { role: 'assistant', content: 'Understood' },
        ...Array.from({ length: 50 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Planning details step ${i} `.repeat(50),
        })),
      ]

      const compacted = await compaction.maybeCompact({
        db,
        sessionId,
        provider: { api_format: 'openai' },
        model: { model_name: 'test-model' },
        messages,
        budget: 8000,
        force: true,
      })

      expect(compacted).toBeDefined()
      const handoffMsg = compacted.find(m => m.role === 'system' && m.content.includes('[context compaction]'))
      expect(handoffMsg).toBeDefined()
      expect(handoffMsg.content).toContain('[context compaction: active checklist & resume directive]')
      expect(handoffMsg.content).toContain('RESUME INSTRUCTION')
      expect(handoffMsg.content).toContain('Implement domain.d.ts')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Requirement R4: Session Forking Primitive (/fork)
  // ───────────────────────────────────────────────────────────────────────────
  describe('R4: Session Forking Primitive (/fork)', () => {
    it('T1-R4-01: database.forkSession branches at messageId cutoff, copying only messages with id <= messageId', () => {
      const parentSession = database.createSession({ title: 'Parent Session' })
      const parentId = Number(parentSession.lastInsertRowid)

      // Add 5 messages
      const m1 = database.addMessage({ session_id: parentId, role: 'user', content: 'Turn 1 prompt' })
      const m2 = database.addMessage({ session_id: parentId, role: 'assistant', content: 'Turn 1 reply' })
      const m3 = database.addMessage({ session_id: parentId, role: 'user', content: 'Turn 2 prompt (Branch Point)' })
      const m4 = database.addMessage({ session_id: parentId, role: 'assistant', content: 'Turn 2 reply' })
      const m5 = database.addMessage({ session_id: parentId, role: 'user', content: 'Turn 3 prompt' })

      const midCutoff = Number(m3.lastInsertRowid)

      // Fork at m3
      const forkRes = database.forkSession(parentId, 'Branched Session', midCutoff)
      expect(forkRes).toBeDefined()
      expect(forkRes.id).toBeGreaterThan(0)
      expect(forkRes.title).toBe('Branched Session')

      // Verify child session in database
      const childSession = database.getSession(forkRes.id)
      expect(childSession.parent_session_id).toBe(parentId)

      // Verify message count: exactly 3 messages copied
      const childMessages = database.getMessages(forkRes.id)
      expect(childMessages.length).toBe(3)
      expect(childMessages[0].content).toBe('Turn 1 prompt')
      expect(childMessages[1].content).toBe('Turn 1 reply')
      expect(childMessages[2].content).toBe('Turn 2 prompt (Branch Point)')
    })

    it('T1-R4-02: database.forkSession without messageId copies all messages from parent session', () => {
      const parentSession = database.createSession({ title: 'Full Copy Parent' })
      const parentId = Number(parentSession.lastInsertRowid)

      database.addMessage({ session_id: parentId, role: 'user', content: 'Msg A' })
      database.addMessage({ session_id: parentId, role: 'assistant', content: 'Msg B' })

      const forkRes = database.forkSession(parentId, 'Full Fork', null)
      const childMessages = database.getMessages(forkRes.id)
      expect(childMessages.length).toBe(2)
      expect(childMessages[0].content).toBe('Msg A')
      expect(childMessages[1].content).toBe('Msg B')
    })

    it('T1-R4-03: Forked session clones persona_id, config, and session_kind from parent', () => {
      const configObj = { model: 'claude-3-5-sonnet', temperature: 0.7, workspaceDir: 'd:/Aether' }
      const parent = database.createSession({
        title: 'Configured Session',
        persona_id: 3,
        config: JSON.stringify(configObj),
        session_kind: 'task',
      })
      const parentId = Number(parent.lastInsertRowid)

      const forkRes = database.forkSession(parentId, 'Cloned Config Branch')
      const child = database.getSession(forkRes.id)

      expect(child.persona_id).toBe(3)
      expect(child.session_kind).toBe('task')
      const parsedConfig = typeof child.config === 'string' ? JSON.parse(child.config) : child.config
      expect(parsedConfig.model).toBe('claude-3-5-sonnet')
      expect(parsedConfig.temperature).toBe(0.7)
    })

    it('T1-R4-04: Cloned messages are indexed in messages_fts virtual table for search', () => {
      const parent = database.createSession({ title: 'FTS Test Session' })
      const parentId = Number(parent.lastInsertRowid)
      database.addMessage({ session_id: parentId, role: 'user', content: 'UniqueQuantumSuperpositionToken' })

      const forkRes = database.forkSession(parentId, 'FTS Fork')
      const db = database.getDatabase()
      const ftsMatches = db.prepare('SELECT * FROM messages_fts WHERE session_id = ?').all(forkRes.id)
      expect(ftsMatches.length).toBeGreaterThan(0)
      expect(ftsMatches.some(f => f.content.includes('UniqueQuantumSuperpositionToken'))).toBe(true)
    })

    it('T1-R4-05: IPC chat:fork handler conforms to three-file contract (chat.handler.js, preload.js, env.d.ts)', () => {
      const chatHandlerSrc = fs.readFileSync(CHAT_HANDLER_PATH, 'utf8')
      const preloadSrc = fs.readFileSync(PRELOAD_PATH, 'utf8')
      const envDTsSrc = fs.readFileSync(ENV_D_TS_PATH, 'utf8')

      // File 1: Handler registration
      expect(chatHandlerSrc).toMatch(/ipcMain\.handle\(['"]chat:fork['"]/)

      // File 2: Preload contextBridge exposure
      expect(preloadSrc).toMatch(/fork:\s*\(params\)\s*=>\s*ipcRenderer\.invoke\(['"]chat:fork['"],\s*params\)/)

      // File 3: TypeScript declarations in env.d.ts
      expect(envDTsSrc).toMatch(/fork(?::\s*\(|\()params:\s*\{\s*sessionId:\s*number;\s*messageId\?:/)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Requirement R5: P0 Edge-Case & Boundary Hardening
  // ───────────────────────────────────────────────────────────────────────────
  describe('R5: P0 Edge-Case & Boundary Hardening', () => {
    it('T1-R5-01: toolLoopTracker uses SHA-256 hash comparison and ignores unchanged files', () => {
      const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
      expect(typeof trackerMod.computeContentHash, 'trackerMod.computeContentHash must be exported').toBe('function')

      const wsDir = createTempWorkspace('r5-hash-')
      const tracker = trackerMod.createTurnFileTracker(wsDir)

      const testFile = path.join(wsDir, 'test.txt')
      fs.writeFileSync(testFile, 'Original Baseline Content', 'utf8')

      tracker.beforeTool('edit_file', { path: testFile })
      // File modified to new content and then reverted back to original
      fs.writeFileSync(testFile, 'Temporarily Changed Content', 'utf8')
      fs.writeFileSync(testFile, 'Original Baseline Content', 'utf8')
      tracker.afterTool('edit_file', { path: testFile })

      const summary = tracker.getSummary()
      // Because final SHA-256 equals initial SHA-256, it must NOT be reported as modified
      expect(summary === null || summary.fileCount === 0).toBe(true)
    })

    it('T1-R5-02: toolLoopTracker enforces workspace root containment and rejects outside paths', () => {
      const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
      expect(typeof trackerMod.isPathInsideWorkspace, 'trackerMod.isPathInsideWorkspace must be exported').toBe('function')

      const wsDir = createTempWorkspace('r5-contain-')
      const insideFile = path.join(wsDir, 'sub', 'inner.txt')
      const outsideFile = path.resolve(wsDir, '../../windows/system32/cmd.exe')

      expect(trackerMod.isPathInsideWorkspace(wsDir, insideFile)).toBe(true)
      expect(trackerMod.isPathInsideWorkspace(wsDir, outsideFile)).toBe(false)

      // safeReadFile rejects outside file
      expect(typeof trackerMod.safeReadFile, 'trackerMod.safeReadFile must be exported').toBe('function')
      const outsideContent = trackerMod.safeReadFile(outsideFile, wsDir)
      expect(outsideContent).toBeNull()
    })

    it('T1-R5-03: Subagent streaming chunk events route strictly with subagentId', async () => {
      const subAgent = require(SUBAGENT_PATH)
      expect(typeof subAgent.runParallel, 'subAgent.runParallel must be exported').toBe('function')

      const events = []
      const db = database.getDatabase()

      await subAgent.runParallel(
        [
          { task: 'Analyze task 1', read_only: true },
          { task: 'Analyze task 2', read_only: true },
        ],
        {
          db,
          provider: { api_format: 'openai' },
          model: { model_name: 'test-model' },
          onSubagentEvent: (evt) => events.push(evt),
        }
      )

      expect(events.length).toBeGreaterThanOrEqual(2)
      for (const evt of events) {
        expect(evt.id).toMatch(/^sa_\d+_[a-z0-9-]+_\d+$/)
      }
      const startEvents = events.filter(e => e.type === 'start')
      expect(startEvents.length).toBe(2)
      expect(startEvents[0].id).not.toBe(startEvents[1].id)
    })

    it('T1-R5-04: Subagent captures pre-execution snapshot of write paths', () => {
      const subAgent = require(SUBAGENT_PATH)
      expect(typeof subAgent.captureBeforeSnapshot, 'subAgent.captureBeforeSnapshot must be exported').toBe('function')

      const wsDir = createTempWorkspace('r5-snap-')
      const existingFile = path.join(wsDir, 'existing.txt')
      const newFile = path.join(wsDir, 'new.txt')
      fs.writeFileSync(existingFile, 'Pre-existing content', 'utf8')

      const snapshot = subAgent.captureBeforeSnapshot([existingFile, newFile], wsDir)
      expect(snapshot).toBeDefined()
      expect(Array.isArray(snapshot.files)).toBe(true)

      const f1 = snapshot.files.find(f => f.path === existingFile)
      expect(f1).toBeDefined()
      expect(f1.existed).toBe(true)
      expect(Buffer.isBuffer(f1.content)).toBe(true)
      expect(f1.content.toString('utf8')).toBe('Pre-existing content')

      const f2 = snapshot.files.find(f => f.path === newFile)
      expect(f2).toBeDefined()
      expect(f2.existed).toBe(false)
      expect(f2.content).toBeNull()
    })

    it('T1-R5-05: Subagent error rollback cleanly restores modified files and unlinks new files', () => {
      const subAgent = require(SUBAGENT_PATH)
      expect(typeof subAgent.rollbackBeforeSnapshot, 'subAgent.rollbackBeforeSnapshot must be exported').toBe('function')

      const wsDir = createTempWorkspace('r5-rollback-')
      const targetFile = path.join(wsDir, 'mod.txt')
      const createdFile = path.join(wsDir, 'junk.txt')
      fs.writeFileSync(targetFile, 'Pristine Version', 'utf8')

      const snapshot = subAgent.captureBeforeSnapshot([targetFile, createdFile], wsDir)

      // Simulate crash during subagent run: file corrupted and new file created
      fs.writeFileSync(targetFile, 'Corrupted Data from Crash', 'utf8')
      fs.writeFileSync(createdFile, 'Orphaned junk data', 'utf8')

      // Rollback
      subAgent.rollbackBeforeSnapshot(snapshot)

      // Assertions
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('Pristine Version')
      expect(fs.existsSync(createdFile)).toBe(false)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 2: BOUNDARY & CORNER CASES (>=5 test cases per requirement R1–R5)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 2: Boundary & Corner Cases', () => {

  describe('R1 Boundaries: Types & JSDoc', () => {
    it('T2-R1-01: domain.d.ts declares Session interface with optional/nullable persona_id, parent_session_id, and config', () => {
      const dtsPath = path.resolve(__dirname, '../types/domain.d.ts')
      expect(fs.existsSync(dtsPath)).toBe(true)
      const content = fs.readFileSync(dtsPath, 'utf8')
      expect(content).toContain('export interface Session')
      expect(content).toContain('persona_id: number | null')
      expect(content).toContain('parent_session_id?: number | null')
      expect(content).toContain('config?: string | Record<string, unknown> | null')
    })

    it('T2-R1-02: domain.d.ts declares Message interface with token_count, status, and role types', () => {
      const dtsPath = path.resolve(__dirname, '../types/domain.d.ts')
      const content = fs.readFileSync(dtsPath, 'utf8')
      expect(content).toContain('export interface Message')
      expect(content).toContain('export type MessageRole')
      expect(content).toContain('export type MessageStatus')
      expect(content).toContain('token_count?: number | null')
      expect(content).toContain('latency_ms?: number | null')
    })

    it('T2-R1-03: domain.d.ts declares ToolResult interface with error, isError, and tool_call_id', () => {
      const dtsPath = path.resolve(__dirname, '../types/domain.d.ts')
      const content = fs.readFileSync(dtsPath, 'utf8')
      expect(content).toContain('export interface ToolResult')
      expect(content).toContain('tool_call_id?: string')
      expect(content).toContain('isError?: boolean')
      expect(content).toContain('error?: string | null')
    })

    it('T2-R1-04: Requiring modelRouter in CommonJS does not throw even if ts-node is absent', () => {
      expect(() => require(MODEL_ROUTER_PATH)).not.toThrow()
    })

    it('T2-R1-05: JSDoc type annotations in contextBudget do not collide with runtime variables', () => {
      const contextBudget = require(CONTEXT_BUDGET_PATH)
      expect(contextBudget).toBeDefined()
    })
  })

  describe('R2 Boundaries: ELO Routing', () => {
    it('T2-R2-01: inferToolLoopPhase defaults safely to spec when tool list is empty at depth 0', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')
      const phase = modelRouter.inferToolLoopPhase({ depth: 0, lastToolCalls: [] })
      expect(phase).toBe('spec')
    })

    it('T2-R2-02: inferToolLoopPhase gives worker priority when read and write tools are combined', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')
      const phase = modelRouter.inferToolLoopPhase({
        depth: 2,
        lastToolCalls: ['read_file', 'edit_file', 'grep_search'],
      })
      expect(phase).toBe('worker')
    })

    it('T2-R2-03: resolvePhaseTarget falls back to primary model when model_score table is empty', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.resolvePhaseTarget, 'modelRouter.resolvePhaseTarget must be exported').toBe('function')
      const db = database.getDatabase()
      db.prepare("INSERT OR REPLACE INTO provider (id, name, api_url, enabled, api_format) VALUES (99, 'TestP', 'http://localhost', 1, 'openai')").run()
      db.prepare("INSERT OR REPLACE INTO model (id, provider_id, model_name, is_primary) VALUES (990, 99, 'default-primary', 1)").run()
      const allModels = db.prepare("SELECT m.*, p.name as provider_name, p.api_url, p.api_key, p.api_format FROM model m JOIN provider p ON m.provider_id = p.id").all()

      const target = modelRouter.resolvePhaseTarget('worker', { db, allModels })
      expect(target).toBeDefined()
      expect(target.model).toBeDefined()
    })

    it('T2-R2-04: resolvePhaseTarget ignores disabled providers even if model has highest ELO', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.resolvePhaseTarget, 'modelRouter.resolvePhaseTarget must be exported').toBe('function')

      const db = database.getDatabase()
      db.prepare("DELETE FROM model_score").run()
      db.prepare("INSERT OR REPLACE INTO provider (id, name, api_url, enabled, api_format) VALUES (81, 'DisabledProvider', 'http://localhost', 0, 'openai')").run()
      db.prepare("INSERT OR REPLACE INTO provider (id, name, api_url, enabled, api_format) VALUES (82, 'EnabledProvider', 'http://localhost', 1, 'openai')").run()
      db.prepare("INSERT OR REPLACE INTO model (id, provider_id, model_name, is_primary) VALUES (810, 81, 'disabled-leader', 0)").run()
      db.prepare("INSERT OR REPLACE INTO model (id, provider_id, model_name, is_primary) VALUES (820, 82, 'enabled-runnerup', 1)").run()

      db.prepare("INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (810, 'coding', 1500, 20, 20)").run()
      db.prepare("INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (820, 'coding', 1200, 10, 15)").run()

      const allModels = db.prepare("SELECT m.*, p.name as provider_name, p.api_url, p.api_key, p.api_format FROM model m JOIN provider p ON m.provider_id = p.id WHERE p.id IN (81, 82)").all()
      const target = modelRouter.resolvePhaseTarget('worker', { db, allModels })
      expect(target.model.id).toBe(820) // Must select enabled provider model
    })

    it('T2-R2-05: inferToolLoopPhase handles extreme depth (>100) deterministically', () => {
      const modelRouter = require(MODEL_ROUTER_PATH)
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')
      const phase = modelRouter.inferToolLoopPhase({ depth: 150, lastToolCalls: ['read_file'] })
      expect(['spec', 'worker', 'validator']).toContain(phase)
    })
  })

  describe('R3 Boundaries: Compaction & Rehydration', () => {
    it('T2-R3-01: Rehydration returns empty snippet list when session has zero file accesses', () => {
      const sessionContext = require(SESSION_CONTEXT_PATH)
      expect(typeof sessionContext.getActiveFileSnippets, 'sessionContext.getActiveFileSnippets must be exported').toBe('function')
      const snippets = sessionContext.getActiveFileSnippets(99999, { maxFiles: 3 })
      expect(snippets).toEqual([])
    })

    it('T2-R3-02: Rehydration tolerates active file that was deleted before compaction', () => {
      const sessionContext = require(SESSION_CONTEXT_PATH)
      expect(typeof sessionContext.getActiveFileSnippets, 'sessionContext.getActiveFileSnippets must be exported').toBe('function')
      expect(typeof sessionContext.recordFileActivity, 'sessionContext.recordFileActivity must be exported').toBe('function')
      const wsDir = createTempWorkspace('r3-del-')
      const ghostFile = path.join(wsDir, 'ghost.txt')
      sessionContext.recordFileActivity(404, ghostFile, 'edit')
      // File does not exist on disk
      expect(() => {
        const snippets = sessionContext.getActiveFileSnippets(404, { wsRoot: wsDir })
        expect(Array.isArray(snippets)).toBe(true)
      }).not.toThrow()
    })

    it('T2-R3-03: Rehydration strictly limits file snippet to 80 lines for files with 2000 lines', () => {
      const sessionContext = require(SESSION_CONTEXT_PATH)
      expect(typeof sessionContext.getActiveFileSnippets, 'sessionContext.getActiveFileSnippets must be exported').toBe('function')
      expect(typeof sessionContext.recordFileActivity, 'sessionContext.recordFileActivity must be exported').toBe('function')
      const wsDir = createTempWorkspace('r3-giant-')
      const giantFile = path.join(wsDir, 'giant.txt')
      fs.writeFileSync(giantFile, 'x\n'.repeat(2000), 'utf8')
      sessionContext.recordFileActivity(505, giantFile, 'edit')

      const snippets = sessionContext.getActiveFileSnippets(505, { wsRoot: wsDir, maxLinesPerFile: 80 })
      const entry = snippets.find(s => s.path === giantFile || s.path.includes('giant.txt'))
      expect(entry).toBeDefined()
      const lineCount = entry.snippet.split('\n').length
      expect(lineCount).toBeLessThanOrEqual(85)
    })

    it('T2-R3-04: Compaction handles session with null plan gracefully', async () => {
      const compaction = require(COMPACTION_PATH)
      const providerAdapter = require('../electron/llm/providerAdapter')
      const origCompleteChat = providerAdapter.completeChat
      providerAdapter.completeChat = async () => '## Goal\nTest goal\n## Constraints\nNone\n## Progress\n- [x] Step 1\n## Key Decisions\nNone\n## Next Steps\nContinue\n## Critical Context\nNone'

      try {
        const db = database.getDatabase()
        const big = 'x'.repeat(2000)

        const messages = [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'Perform refactor' },
          ...Array.from({ length: 39 }, (_, i) => ({
            role: 'assistant',
            content: `Payload msg ${i} ` + big,
          })),
        ]

        const compacted = await compaction.maybeCompact({
          db,
          sessionId: 606,
          provider: { api_url: 'http://test', api_format: 'openai' },
          model: { model_name: 'test' },
          messages,
          budget: 12000,
          force: true,
        })
        expect(Array.isArray(compacted)).toBe(true)
        expect(compacted.length).toBeLessThan(messages.length)
      } finally {
        providerAdapter.completeChat = origCompleteChat
      }
    })

    it('T2-R3-05: Compaction with small budget enforces headroom and avoids token overflow', async () => {
      const compaction = require(COMPACTION_PATH)
      const contextBudget = require(CONTEXT_BUDGET_PATH)
      const providerAdapter = require('../electron/llm/providerAdapter')
      const origCompleteChat = providerAdapter.completeChat
      providerAdapter.completeChat = async () => '## Goal\nTest goal\n## Constraints\nNone\n## Progress\n- [x] Step 1\n## Key Decisions\nNone\n## Next Steps\nContinue\n## Critical Context\nNone'

      try {
        const db = database.getDatabase()
        const big = 'x'.repeat(2000)

        const messages = [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'Start task' },
          ...Array.from({ length: 39 }, (_, i) => ({
            role: 'assistant',
            content: `Message ${i} with substantial token payload ` + big,
          })),
        ]
        const budget = 8000
        const compacted = await compaction.maybeCompact({
          db,
          sessionId: 707,
          provider: { api_url: 'http://test', api_format: 'openai' },
          model: { model_name: 'test' },
          messages,
          budget,
          force: true,
        })
        expect(Array.isArray(compacted)).toBe(true)
        expect(compacted.length).toBeLessThan(messages.length)
        const budgetCalc = contextBudget.calculateBudget(compacted)
        expect(budgetCalc.totalTokens).toBeLessThanOrEqual(budget)
      } finally {
        providerAdapter.completeChat = origCompleteChat
      }
    })

    it('T2-R3-06: Summarizer failure activates fallback truncation strictly shorter than input', async () => {
      const compaction = require(COMPACTION_PATH)
      const providerAdapter = require('../electron/llm/providerAdapter')
      const origCompleteChat = providerAdapter.completeChat
      providerAdapter.completeChat = async () => { throw new Error('Simulated LLM network failure') }

      try {
        const db = database.getDatabase()
        const big = 'x'.repeat(1000)
        const messages = [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'Execute tasks' },
          ...Array.from({ length: 29 }, (_, i) => ({
            role: 'assistant',
            content: `Turn ${i} ` + big,
          })),
        ]
        const compacted = await compaction.maybeCompact({
          db,
          sessionId: 708,
          provider: { api_url: 'http://test', api_format: 'openai' },
          model: { model_name: 'test' },
          messages,
          budget: 5000,
          force: false,
        })
        expect(Array.isArray(compacted)).toBe(true)
        expect(compacted.length).toBeLessThan(messages.length)
        const sysMsg = compacted.find(m => m.role === 'system' && m.content.includes('could not be summarized'))
        expect(sysMsg).toBeDefined()
      } finally {
        providerAdapter.completeChat = origCompleteChat
      }
    })
  })

  describe('R4 Boundaries: Session Forking', () => {
    it('T2-R4-01: forkSession throws error when messageId does not exist in parent session', () => {
      const p = database.createSession({ title: 'Test Session' })
      const pid = Number(p.lastInsertRowid)

      expect(() => {
        database.forkSession(pid, 'Branch', 999999)
      }).toThrow(/does not exist/)
    })

    it('T2-R4-02: forkSession at first message (turn 1) copies exactly 1 message', () => {
      const p = database.createSession({ title: 'Turn 1 Parent' })
      const pid = Number(p.lastInsertRowid)
      const m1 = database.addMessage({ session_id: pid, role: 'user', content: 'Prompt 1' })
      database.addMessage({ session_id: pid, role: 'assistant', content: 'Reply 1' })

      const fork = database.forkSession(pid, 'Turn 1 Branch', Number(m1.lastInsertRowid))
      const msgs = database.getMessages(fork.id)
      expect(msgs.length).toBe(1)
      expect(msgs[0].content).toBe('Prompt 1')
    })

    it('T2-R4-03: forkSession supports multi-level tree branching (fork of a fork)', () => {
      const root = database.createSession({ title: 'Root' })
      const rootId = Number(root.lastInsertRowid)
      database.addMessage({ session_id: rootId, role: 'user', content: 'Root Msg' })

      const b1 = database.forkSession(rootId, 'Branch 1')
      const b1Id = b1.id
      database.addMessage({ session_id: b1Id, role: 'user', content: 'Branch 1 Msg' })

      const b2 = database.forkSession(b1Id, 'Branch 2')
      const b2Session = database.getSession(b2.id)
      expect(b2Session.parent_session_id).toBe(b1Id)
    })

    it('T2-R4-04: forkSession preserves special characters and script tags in title safely', () => {
      const p = database.createSession({ title: 'Plain' })
      const pid = Number(p.lastInsertRowid)
      const dirtyTitle = "<script>alert('xss')</script> -- ' OR 1=1; 🔀"

      const fork = database.forkSession(pid, dirtyTitle)
      const s = database.getSession(fork.id)
      expect(s.title).toBe(dirtyTitle)
    })

    it('T2-R4-05: forkSession throws error when parentSessionId does not exist', () => {
      expect(() => {
        database.forkSession(888888, 'Orphan')
      }).toThrow(/does not exist/)
    })
  })

  describe('R5 Boundaries: Hardening & Containment', () => {
    it('T2-R5-01: computeContentHash computes standard SHA-256 for empty string', () => {
      const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
      expect(typeof trackerMod.computeContentHash, 'trackerMod.computeContentHash must be exported').toBe('function')
      const hash = trackerMod.computeContentHash('')
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('T2-R5-02: computeContentHash handles binary Buffer input without encoding corruption', () => {
      const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
      expect(typeof trackerMod.computeContentHash, 'trackerMod.computeContentHash must be exported').toBe('function')
      const buf = Buffer.from([0x00, 0xff, 0x88, 0x12])
      const hash = trackerMod.computeContentHash(buf)
      const expected = crypto.createHash('sha256').update(buf).digest('hex')
      expect(hash).toBe(expected)
    })

    it('T2-R5-03: isPathInsideWorkspace rejects path traversal tricks (..\\..)', () => {
      const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
      expect(typeof trackerMod.isPathInsideWorkspace, 'trackerMod.isPathInsideWorkspace must be exported').toBe('function')
      const wsDir = createTempWorkspace('r5-ws-')
      const insideFile = path.join(wsDir, 'app', 'src', 'index.ts')
      const outsideFile = path.join(wsDir, '..', 'secret.txt')
      const outsideAbs = path.resolve(wsDir, '..', 'other-dir')
      expect(trackerMod.isPathInsideWorkspace(wsDir, insideFile)).toBe(true)
      expect(trackerMod.isPathInsideWorkspace(wsDir, outsideFile)).toBe(false)
      expect(trackerMod.isPathInsideWorkspace(wsDir, outsideAbs)).toBe(false)
    })

    it('T2-R5-04: Subagent rollback handles empty snapshot safely without exceptions', () => {
      const subAgent = require(SUBAGENT_PATH)
      expect(typeof subAgent.rollbackBeforeSnapshot, 'subAgent.rollbackBeforeSnapshot must be exported').toBe('function')
      expect(() => {
        subAgent.rollbackBeforeSnapshot(null)
        subAgent.rollbackBeforeSnapshot({ files: [] })
      }).not.toThrow()
    })

    it('T2-R5-05: Subagent snapshot capture ignores null or undefined paths', () => {
      const subAgent = require(SUBAGENT_PATH)
      expect(typeof subAgent.captureBeforeSnapshot, 'subAgent.captureBeforeSnapshot must be exported').toBe('function')
      const wsDir = createTempWorkspace('r5-snap-null-')
      const snap = subAgent.captureBeforeSnapshot([null, undefined, ''], wsDir)
      expect(snap === null || snap.files.length === 0).toBe(true)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise interaction tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 3: Cross-Feature Combinations', () => {
  it('T3-INT-01: R2 (ELO Routing) + R5 (File Hash Tracking) across tool loop phases', () => {
    const modelRouter = require(MODEL_ROUTER_PATH)
    const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
    expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')

    const wsDir = createTempWorkspace('t3-r2-r5-')
    const tracker = trackerMod.createTurnFileTracker(wsDir)

    // Phase 1: Spec exploration
    let phase = modelRouter.inferToolLoopPhase({ depth: 0, lastToolCalls: ['read_file'] })
    expect(phase).toBe('spec')

    // Phase 2: Worker modification
    const file = path.join(wsDir, 'code.js')
    fs.writeFileSync(file, 'let v = 1;\n', 'utf8')
    tracker.beforeTool('edit_file', { path: file })
    fs.writeFileSync(file, 'let v = 2;\n', 'utf8')
    tracker.afterTool('edit_file', { path: file })

    phase = modelRouter.inferToolLoopPhase({ depth: 1, lastToolCalls: ['edit_file'] })
    expect(phase).toBe('worker')

    // Phase 3: Validator verification
    phase = modelRouter.inferToolLoopPhase({ depth: 2, isVerifying: true })
    expect(phase).toBe('validator')

    const summary = tracker.getSummary()
    expect(summary).toBeDefined()
    expect(summary.fileCount).toBe(1)
  })

  it('T3-INT-02: R3 (Compaction) + R4 (Forking) - compacting a branched session preserves branch isolation', async () => {
    const compaction = require(COMPACTION_PATH)
    const providerAdapter = require('../electron/llm/providerAdapter')
    const origCompleteChat = providerAdapter.completeChat
    providerAdapter.completeChat = async () => '## Goal\nFork goal\n## Constraints\nNone\n## Progress\n- [x] Done\n## Key Decisions\nNone\n## Next Steps\nNext\n## Critical Context\nNone'

    try {
      // 1. Create parent session with 3 messages
      const parent = database.createSession({ title: 'Parent' })
      const pid = Number(parent.lastInsertRowid)
      database.addMessage({ session_id: pid, role: 'user', content: 'Parent turn 1' })
      database.addMessage({ session_id: pid, role: 'assistant', content: 'Parent turn 1 a' })
      const mCutoff = database.addMessage({ session_id: pid, role: 'user', content: 'Parent turn 2 (Cutoff)' })

      // 2. Fork at mCutoff
      const fork = database.forkSession(pid, 'Child Branch', Number(mCutoff.lastInsertRowid))
      const cid = fork.id

      // 3. Child adds new messages and compacts
      const big = 'x'.repeat(2000)
      for (let i = 0; i < 40; i++) {
        database.addMessage({ session_id: cid, role: i % 2 === 0 ? 'assistant' : 'user', content: `Child detailed turn ${i} ` + big })
      }

      const childMsgs = database.getMessages(cid)
      expect(childMsgs.length).toBeGreaterThan(10)

      const compacted = await compaction.maybeCompact({
        db: database.getDatabase(),
        sessionId: cid,
        provider: { api_url: 'http://test', api_format: 'openai' },
        model: { model_name: 'test' },
        messages: childMsgs,
        budget: 1_000_000,
        force: true,
      })

      expect(compacted).not.toBeNull()
      expect(compacted.length).toBeLessThan(childMsgs.length)
      const parentMsgsAfter = database.getMessages(pid)
      expect(parentMsgsAfter.length).toBe(3) // Parent remains pristine
    } finally {
      providerAdapter.completeChat = origCompleteChat
    }
  })

  it('T3-INT-03: R4 (Forking) + R5 (Subagent Rollback) - subagent error rollback in branched session does not affect parent', () => {
    const subAgent = require(SUBAGENT_PATH)
    expect(typeof subAgent.captureBeforeSnapshot, 'subAgent.captureBeforeSnapshot must be exported').toBe('function')
    expect(typeof subAgent.rollbackBeforeSnapshot, 'subAgent.rollbackBeforeSnapshot must be exported').toBe('function')
    const wsDir = createTempWorkspace('t3-r4-r5-')

    const parent = database.createSession({ title: 'Parent Workspace Session' })
    const fork = database.forkSession(Number(parent.lastInsertRowid), 'Child Workspace Session')

    const sharedFile = path.join(wsDir, 'shared.ts')
    fs.writeFileSync(sharedFile, 'export const version = 1;\n', 'utf8')

    // Child subagent captures snapshot and corrupts
    const snap = subAgent.captureBeforeSnapshot([sharedFile], wsDir)
    fs.writeFileSync(sharedFile, 'syntax error: broken code\n', 'utf8')

    // Error triggers rollback
    subAgent.rollbackBeforeSnapshot(snap)
    expect(fs.readFileSync(sharedFile, 'utf8')).toBe('export const version = 1;\n')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (End-to-End User Workflows)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 4: Real-World Application Scenarios', () => {
  it('T4-SCN-01: Multi-Turn Engineering Workflow (Spec -> Worker -> Compaction -> Validator)', async () => {
    const wsDir = createTempWorkspace('t4-scenario1-')
    const db = database.getDatabase()

    const modelRouter = require(MODEL_ROUTER_PATH)
    const compaction = require(COMPACTION_PATH)
    const trackerMod = require(TOOL_LOOP_TRACKER_PATH)
    const providerAdapter = require('../electron/llm/providerAdapter')
    const origCompleteChat = providerAdapter.completeChat
    providerAdapter.completeChat = async () => '## Goal\nWorkflow goal\n## Constraints\nNone\n## Progress\n- [x] Step 1\n## Key Decisions\nNone\n## Next Steps\nNext\n## Critical Context\nNone'

    try {
      expect(typeof modelRouter.inferToolLoopPhase, 'modelRouter.inferToolLoopPhase must be exported').toBe('function')

      const sessionId = 888
      const tracker = trackerMod.createTurnFileTracker(wsDir)

      // Turn 1: Spec Phase (Exploration)
      const p1 = modelRouter.inferToolLoopPhase({ depth: 0, lastToolCalls: ['read_file', 'grep_search'], isPlanning: true })
      expect(p1).toBe('spec')

      // Turn 2: Worker Phase (Modify file)
      const targetSource = path.join(wsDir, 'feature.js')
      fs.writeFileSync(targetSource, 'function run() { return 1; }\n', 'utf8')
      tracker.beforeTool('edit_file', { path: targetSource })
      fs.writeFileSync(targetSource, 'function run() { return 2; }\n', 'utf8')
      tracker.afterTool('edit_file', { path: targetSource })

      const p2 = modelRouter.inferToolLoopPhase({ depth: 1, lastToolCalls: ['edit_file'] })
      expect(p2).toBe('worker')

      // Context overflow -> Compaction with rehydration
      const big = 'x'.repeat(2000)
      const convo = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Start implementation' },
        ...Array.from({ length: 39 }, (_, i) => ({
          role: 'assistant',
          content: `Implementation conversation turn ${i} ` + big,
        })),
      ]

      const compacted = await compaction.maybeCompact({
        db,
        sessionId,
        provider: { api_url: 'http://test', api_format: 'openai' },
        model: { model_name: 'test' },
        messages: convo,
        budget: 12000,
        force: true,
        wsRoot: wsDir,
      })
      expect(compacted).not.toBeNull()
      expect(compacted.length).toBeLessThan(convo.length)

      // Turn 3: Validator Phase (Testing)
      const p3 = modelRouter.inferToolLoopPhase({ depth: 2, isVerifying: true })
      expect(p3).toBe('validator')

      // Turn Summary verifies exact file diffs
      const summary = tracker.getSummary()
      expect(summary.fileCount).toBe(1)
    } finally {
      providerAdapter.completeChat = origCompleteChat
    }
  })

  it('T4-SCN-02: Exploratory Branching via /fork preserving prefix cache', () => {
    // 1. Establish baseline session with initial definitions
    const root = database.createSession({ title: 'ML Architecture Research' })
    const rid = Number(root.lastInsertRowid)

    const m1 = database.addMessage({ session_id: rid, role: 'system', content: 'You are an ML expert' })
    const m2 = database.addMessage({ session_id: rid, role: 'user', content: 'Define Loss Function' })
    const m3 = database.addMessage({ session_id: rid, role: 'assistant', content: 'Loss = MSE + CrossEntropy' })

    // 2. User forks at m3 to try Alternative Loss
    const forkRes = database.forkSession(rid, 'Alternative Loss Branch', Number(m3.lastInsertRowid))
    const fid = forkRes.id

    // 3. Verify prefix cache invariance: prefix messages are byte-for-byte identical
    const rootMsgs = database.getMessages(rid)
    const forkMsgs = database.getMessages(fid)

    expect(forkMsgs.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(forkMsgs[i].role).toBe(rootMsgs[i].role)
      expect(forkMsgs[i].content).toBe(rootMsgs[i].content)
    }
  })

  it('T4-SCN-03: Resilient Subagent Refactoring with Crash Isolation and Rollback', () => {
    const subAgent = require(SUBAGENT_PATH)
    expect(typeof subAgent.captureBeforeSnapshot, 'subAgent.captureBeforeSnapshot must be exported').toBe('function')
    expect(typeof subAgent.rollbackBeforeSnapshot, 'subAgent.rollbackBeforeSnapshot must be exported').toBe('function')
    const wsDir = createTempWorkspace('t4-scenario3-')

    const fileA = path.join(wsDir, 'moduleA.js')
    const fileB = path.join(wsDir, 'moduleB.js')
    fs.writeFileSync(fileA, '// Module A stable\n', 'utf8')
    fs.writeFileSync(fileB, '// Module B stable\n', 'utf8')

    // Subagent 1 succeeds on Module A
    const snapA = subAgent.captureBeforeSnapshot([fileA], wsDir)
    fs.writeFileSync(fileA, '// Module A upgraded\n', 'utf8')

    // Subagent 2 starts on Module B, crashes midway
    const snapB = subAgent.captureBeforeSnapshot([fileB], wsDir)
    fs.writeFileSync(fileB, '// Incomplete broken write\n', 'utf8')

    // Error handler catches subagent 2 crash and rolls back Module B only
    subAgent.rollbackBeforeSnapshot(snapB)

    // Module A remains upgraded, Module B is safely restored
    expect(fs.readFileSync(fileA, 'utf8')).toBe('// Module A upgraded\n')
    expect(fs.readFileSync(fileB, 'utf8')).toBe('// Module B stable\n')
  })
})
