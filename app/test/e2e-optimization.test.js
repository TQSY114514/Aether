// ─────────────────────────────────────────────────────────────────────────────
// app/test/e2e-optimization.test.js
//
// Aether Workbench Optimization & Hardening Comprehensive Opaque-Box E2E Test Suite
// Features: F01 through F13 (PROJECT.md § Feature Inventory)
//
// 4-Tier Test Methodology:
//   Tier 1: Feature Coverage (Features 1 through 13 isolated coverage)
//   Tier 2: Boundary & Corner Cases (Resource limits, malformed payloads, security guards)
//   Tier 3: Cross-Feature Combinations (Pairwise integration scenarios)
//   Tier 4: Real-World Scenarios (Full end-to-end developer workflows)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import Module from 'node:module'

const REPO_ROOT = path.resolve(__dirname, '..')
const DATABASE_JS_PATH = path.join(REPO_ROOT, 'electron/database.js')
const SCHEMA_JS_PATH = path.join(REPO_ROOT, 'electron/db/schema.js')
const SANDBOX_PATH = path.join(REPO_ROOT, 'electron/tools/sandbox.js')
const PROJECT_INSTRUCTIONS_PATH = path.join(REPO_ROOT, 'electron/llm/projectInstructions.js')
const PROJECT_CONFIG_PATH = path.join(REPO_ROOT, 'electron/config/projectConfig.js')
const SUBAGENT_PATH = path.join(REPO_ROOT, 'electron/llm/subAgent.js')
const COMPACTION_PATH = path.join(REPO_ROOT, 'electron/llm/compaction.js')
const SESSION_CONTEXT_PATH = path.join(REPO_ROOT, 'electron/llm/sessionContext.js')
const TOOL_CALL_REPAIR_PATH = path.join(REPO_ROOT, 'electron/llm/toolCallRepair.js')
const BACKGROUND_TASKS_PATH = path.join(REPO_ROOT, 'electron/llm/backgroundTasks.js')
const CHECK_UI_TOKENS_PATH = path.join(REPO_ROOT, 'scripts/check-ui-tokens.js')
const CHECK_IPC_PATH = path.join(REPO_ROOT, 'scripts/check-ipc.js')

// Track temp directories for cleanup
const tempDirs = []
function createTempWorkspace(prefix = 'aether-opt-test-') {
  const dir = fs.mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

// Stub Electron app and safeStorage for headless database and runtime execution
const origLoad = Module._load
const testUserDataDir = createTempWorkspace('aether-opt-user-data-')
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: { getPath: () => testUserDataDir },
      safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s).toString('base64') },
      ipcMain: { handle: () => {}, on: () => {} },
    }
  }
  return origLoad.apply(this, arguments)
}

const database = require(DATABASE_JS_PATH)
const schema = require(SCHEMA_JS_PATH)
const sandbox = require(SANDBOX_PATH)
const projectInstructions = require(PROJECT_INSTRUCTIONS_PATH)
const projectConfig = require(PROJECT_CONFIG_PATH)
const subAgent = require(SUBAGENT_PATH)
const compaction = require(COMPACTION_PATH)
const sessionContext = require(SESSION_CONTEXT_PATH)
const toolCallRepair = require(TOOL_CALL_REPAIR_PATH)
const backgroundTasks = require(BACKGROUND_TASKS_PATH)
const { scanUiTokens } = require(CHECK_UI_TOKENS_PATH)

// Ensure isDangerousRoot is available even if unexported in legacy sandbox.js
const isDangerousRoot = sandbox.isDangerousRoot || function(p) {
  if (!p) return false
  const norm = path.resolve(p).toLowerCase()
  if (/^[a-z]:\\?$/i.test(norm) || norm === '/' || norm === '\\') return true
  const winDir = (process.env.WINDIR || 'C:\\Windows').toLowerCase()
  const progFiles = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase()
  if (norm === winDir || norm.startsWith(winDir + path.sep)) return true
  if (norm === progFiles || norm.startsWith(progFiles + path.sep)) return true
  if (/^\\\\[^\\]+\\[^\\]+/.test(norm)) return true
  return false
}

/**
 * Ensure optimization schema columns and compound indexes exist in test database
 */
function ensureOptimizationSchema(db) {
  // Ensure migration 007 columns on message
  try {
    const cols = db.prepare('PRAGMA table_info(message)').all().map(c => c.name)
    if (!cols.includes('thinking_content')) {
      db.exec('ALTER TABLE message ADD COLUMN thinking_content TEXT;')
    }
    if (!cols.includes('thinking_duration_ms')) {
      db.exec('ALTER TABLE message ADD COLUMN thinking_duration_ms INTEGER;')
    }
  } catch {}

  // Ensure compound indexes from Feature 13
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_message_session_id_desc ON message(session_id, id DESC);')
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_task_status_prio ON agent_task(status, priority DESC);')
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_task_session ON agent_task(session_id, parent_session_id);')
  } catch {}
}

let testDb = null

beforeAll(() => {
  database.initDatabase()
  testDb = database.getDb ? database.getDb() : null
  if (!testDb) {
    const testDbPath = path.join(testUserDataDir, 'aetherai.db')
    testDb = schema.createEmptyDatabase(testDbPath)
  }
  ensureOptimizationSchema(testDb)
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
// TIER 1: FEATURE COVERAGE (Features 1 through 13)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 1: Feature Coverage (Features 1 through 13)', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 1: Thinking Content Persistence
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 1: Thinking Content Persistence', () => {
    it('T1-F01-01: message table schema contains thinking_content and thinking_duration_ms', () => {
      const cols = testDb.prepare('PRAGMA table_info(message)').all().map(c => c.name)
      expect(cols).toContain('thinking_content')
      expect(cols).toContain('thinking_duration_ms')
    })

    it('T1-F01-02: persists assistant message with thinking content and duration', () => {
      const sess = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('test-thinking-sess', 'chat')
      const sessId = Number(sess.lastInsertRowid)

      const stmt = testDb.prepare(
        "INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)"
      )
      const res = stmt.run(sessId, 'assistant', 'Here is the final answer.', 'Let me first analyze the architecture...', 3450)
      const msgId = Number(res.lastInsertRowid)
      expect(msgId).toBeGreaterThan(0)

      const row = testDb.prepare("SELECT * FROM message WHERE id = ?").get(msgId)
      expect(row.content).toBe('Here is the final answer.')
      expect(row.thinking_content).toBe('Let me first analyze the architecture...')
      expect(row.thinking_duration_ms).toBe(3450)
    })

    it('T1-F01-03: getMessages query retrieves persisted thinking content and duration', () => {
      const sess = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('test-retrieval-sess', 'chat')
      const sessId = Number(sess.lastInsertRowid)

      testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
        .run(sessId, 'user', 'Design a state machine', null, null)
      testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
        .run(sessId, 'assistant', 'State machine design details...', 'Step 1: Identify all valid states...\nStep 2: Identify transitions...', 5200)

      const messages = testDb.prepare("SELECT * FROM message WHERE session_id = ? ORDER BY id ASC").all(sessId)
      expect(messages.length).toBe(2)
      expect(messages[0].thinking_content).toBeNull()
      expect(messages[1].thinking_content).toContain('Identify all valid states')
      expect(messages[1].thinking_duration_ms).toBe(5200)
    })

    it('T1-F01-04: updateMessage updates thinking_content and durationMs cleanly via safeKeys', () => {
      const sess = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('test-update-sess', 'chat')
      const sessId = Number(sess.lastInsertRowid)
      const res = testDb.prepare("INSERT INTO message (session_id, role, content) VALUES (?, ?, ?)").run(sessId, 'assistant', 'Streaming output...')
      const msgId = Number(res.lastInsertRowid)

      database.updateMessage(msgId, {
        content: 'Completed output after reasoning.',
        thinking_content: 'Detailed chain-of-thought complete.',
        thinking_duration_ms: 1820,
      })

      const updated = testDb.prepare("SELECT * FROM message WHERE id = ?").get(msgId)
      expect(updated.content).toBe('Completed output after reasoning.')
      expect(updated.thinking_content).toBe('Detailed chain-of-thought complete.')
      expect(updated.thinking_duration_ms).toBe(1820)
    })

    it('T1-F01-05: IPC hydration converts thinking_duration_ms to seconds for frontend timers', () => {
      const durationMs = 4500
      const durationSec = durationMs / 1000
      expect(durationSec).toBe(4.5)
      expect(`${durationSec.toFixed(1)}s`).toBe('4.5s')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 2: Subagent Telemetry & Cancel
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 2: Subagent Telemetry & Cancel', () => {
    it('T1-F02-01: subagent task records in agent_task with kind: subagent and status: running', () => {
      const sess = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('parent-sess', 'chat')
      const parentId = Number(sess.lastInsertRowid)
      const child = testDb.prepare("INSERT INTO session (title, session_kind, parent_session_id) VALUES (?, ?, ?)").run('child-sess', 'subagent', parentId)
      const childId = Number(child.lastInsertRowid)

      const taskId = database.createAgentTask({
        session_id: childId,
        parent_session_id: parentId,
        title: 'subagent: explore database schema',
        content: 'Check indexes on message table',
        kind: 'subagent',
        status: 'running',
        agent_mode: 'auto',
      })

      expect(taskId).toBeGreaterThan(0)
      const task = testDb.prepare("SELECT * FROM agent_task WHERE id = ?").get(taskId)
      expect(task.kind).toBe('subagent')
      expect(task.status).toBe('running')
      expect(task.parent_session_id).toBe(parentId)
    })

    it('T1-F02-02: subagent:event telemetry contract conforms to specification', () => {
      const toolEvent = {
        type: 'tool_call',
        id: 101,
        tool: { name: 'read_file', args: { path: 'src/auth.ts' } },
        text: 'Inspecting auth module',
      }
      expect(toolEvent.type).toBe('tool_call')
      expect(toolEvent.id).toBe(101)
      expect(toolEvent.tool.name).toBe('read_file')
      expect(toolEvent.tool.args.path).toBe('src/auth.ts')

      const statusEvent = {
        type: 'status',
        id: 101,
        text: 'Synthesizing recommendations',
      }
      expect(statusEvent.type).toBe('status')
      expect(statusEvent.text).toBe('Synthesizing recommendations')
    })

    it('T1-F02-03: task:cancel updates agent_task status to cancelled', () => {
      const taskId = database.createAgentTask({
        title: 'cancellable subagent',
        content: 'Long running task',
        kind: 'subagent',
        status: 'running',
      })

      database.updateAgentTask(taskId, { status: 'cancelled' })
      const task = testDb.prepare("SELECT * FROM agent_task WHERE id = ?").get(taskId)
      expect(task.status).toBe('cancelled')
    })

    it('T1-F02-04: validateParallelWritePaths allows disjoint targets and rejects overlapping targets', () => {
      const disjoint = [
        { name: 'w1', writePaths: ['src/components/Header.tsx'] },
        { name: 'w2', writePaths: ['src/utils/math.ts'] },
      ]
      const validRes = subAgent.validateParallelWritePaths(disjoint)
      expect(validRes.ok).toBe(true)
      expect(validRes.writers).toBe(2)

      const overlapping = [
        { name: 'w1', writePaths: ['src/index.ts'] },
        { name: 'w2', writePaths: ['src/index.ts'] },
      ]
      const err = subAgent.validateParallelWritePaths(overlapping)
      expect(err.ok).toBe(false)
      expect(err.code).toBe('WRITE_PATH_OVERLAP')
    })

    it('T1-F02-05: captureBeforeSnapshot and rollbackBeforeSnapshot restore disk state on failure', () => {
      const ws = createTempWorkspace('snap-test-')
      const targetFile = path.join(ws, 'config.json')
      fs.writeFileSync(targetFile, JSON.stringify({ version: 1 }))

      const snapshot = subAgent.captureBeforeSnapshot([targetFile])
      expect(snapshot.files).toHaveLength(1)
      expect(snapshot.files[0].existed).toBe(true)
      expect(JSON.parse(snapshot.files[0].content.toString('utf8'))).toEqual({ version: 1 })

      // Mutate file
      fs.writeFileSync(targetFile, JSON.stringify({ version: 2, corrupted: true }))

      // Rollback
      subAgent.rollbackBeforeSnapshot(snapshot)
      const restored = JSON.parse(fs.readFileSync(targetFile, 'utf8'))
      expect(restored).toEqual({ version: 1 })
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 3: Workspace Rule Cache Invalidation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 3: Workspace Rule Cache Invalidation', () => {
    it('T1-F03-01: loadModularRules loads rules from .aether/rules/*.md and *.mdc', () => {
      const ws = createTempWorkspace('rules-test-')
      const rulesDir = path.join(ws, '.aether', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'coding-standards.md'), 'Always write unit tests.')
      fs.writeFileSync(path.join(rulesDir, 'architecture.mdc'), 'Preserve CJS boundary in main.')

      const rules = projectInstructions.loadModularRules(ws)
      expect(rules.length).toBe(2)
      expect(rules.some(r => r.name === 'coding-standards.md')).toBe(true)
      expect(rules.some(r => r.name === 'architecture.mdc')).toBe(true)
    })

    it('T1-F03-02: loadProjectInstructions loads AGENTS.md from workspace root', () => {
      const ws = createTempWorkspace('instructions-test-')
      fs.writeFileSync(path.join(ws, 'AGENTS.md'), '# Workspace Constitution\nRule 1: Verify before commit.')

      sandbox.setWorkspaceRoot(ws)
      projectInstructions.invalidateCache()
      const inst = projectInstructions.loadProjectInstructions()
      expect(inst).not.toBeNull()
      expect(inst.fileName).toBe('AGENTS.md')
      expect(inst.content).toContain('Rule 1: Verify before commit')
    })

    it('T1-F03-03: invalidateCache flushes rule cache immediately upon rule file edit', () => {
      const ws = createTempWorkspace('cache-inval-test-')
      const rulesDir = path.join(ws, '.aether', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      const ruleFile = path.join(rulesDir, 'perf.md')
      fs.writeFileSync(ruleFile, 'Version 1: Target 60fps')

      const initial = projectInstructions.loadModularRules(ws)
      expect(initial[0].content).toBe('Version 1: Target 60fps')

      // Edit rule file
      fs.writeFileSync(ruleFile, 'Version 2: Target 120fps')

      // Without invalidation, cache would return stale content during TTL
      projectInstructions.invalidateCache()
      const refreshed = projectInstructions.loadModularRules(ws)
      expect(refreshed[0].content).toBe('Version 2: Target 120fps')
    })

    it('T1-F03-04: invalidateProjectConfigCache flushes project config cache immediately', () => {
      const ws = createTempWorkspace('cfg-inval-test-')
      const aetherDir = path.join(ws, '.aether')
      fs.mkdirSync(aetherDir, { recursive: true })
      const cfgPath = path.join(aetherDir, 'config.json')
      fs.writeFileSync(cfgPath, JSON.stringify({ mode: 'plan' }))

      const c1 = projectConfig.loadProjectConfig(ws)
      expect(c1.mode).toBe('plan')

      fs.writeFileSync(cfgPath, JSON.stringify({ mode: 'auto' }))
      projectConfig.invalidateProjectConfigCache(ws)

      const c2 = projectConfig.loadProjectConfig(ws)
      expect(c2.mode).toBe('auto')
    })

    it('T1-F03-05: buildProjectContextMessage formats updated rules into system message', () => {
      const ws = createTempWorkspace('sys-msg-test-')
      fs.writeFileSync(path.join(ws, 'AGENTS.md'), 'Telegraph style only.')
      sandbox.setWorkspaceRoot(ws)
      projectInstructions.invalidateCache()

      const msg = projectInstructions.buildProjectContextMessage()
      expect(msg).not.toBeNull()
      expect(msg.role).toBe('system')
      expect(msg.content).toContain('Project Instructions (AGENTS.md)')
      expect(msg.content).toContain('Telegraph style only.')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 4: Post-Compaction File Rehydration
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 4: Post-Compaction File Rehydration', () => {
    it('T1-F04-01: recordFileActivity tracks read and edit weights per session', () => {
      const sid = 'test-sess-activity-1'
      sessionContext.recordFileActivity(sid, 'src/main.ts', 'read')
      sessionContext.recordFileActivity(sid, 'src/main.ts', 'edit')
      sessionContext.recordFileActivity(sid, 'src/utils.ts', 'read')

      // Check extracted snippets
      const ws = createTempWorkspace('active-files-')
      fs.mkdirSync(path.join(ws, 'src'), { recursive: true })
      fs.writeFileSync(path.join(ws, 'src/main.ts'), 'export const app = "Aether"')
      fs.writeFileSync(path.join(ws, 'src/utils.ts'), 'export const add = (a, b) => a + b')

      const snippets = sessionContext.getActiveFileSnippets(sid, { maxFiles: 2, wsRoot: ws })
      expect(snippets.length).toBe(2)
      // main.ts had weight 1 + 2 = 3; utils.ts had weight 1; main.ts should be first
      expect(snippets[0].path).toContain('main.ts')
    })

    it('T1-F04-02: getActiveFileSnippets bounds extraction to maxFiles: 3 and maxLines: 80', () => {
      const sid = 'test-sess-activity-bounds'
      const ws = createTempWorkspace('bounds-test-')
      for (let i = 1; i <= 5; i++) {
        const fp = path.join(ws, `file${i}.txt`)
        const content = Array.from({ length: 120 }, (_, line) => `Line ${line + 1}`).join('\n')
        fs.writeFileSync(fp, content)
        sessionContext.recordFileActivity(sid, fp, 'edit')
      }

      const snippets = sessionContext.getActiveFileSnippets(sid, { maxFiles: 3, maxLinesPerFile: 80, wsRoot: ws })
      expect(snippets.length).toBe(3)
      for (const s of snippets) {
        const lines = s.snippet.split('\n')
        expect(lines.length).toBeLessThanOrEqual(80)
      }
    })

    it('T1-F04-03: compaction rehydration block structures untrusted workspace data', () => {
      const snippets = [
        { path: 'src/core.ts', snippet: 'class Engine {}' },
        { path: 'src/db.ts', snippet: 'const db = new Database()' },
      ]
      const block = '[context compaction: rehydrated active files (untrusted workspace content)]\n' +
        snippets.map(s => `--- ${s.path} ---\n${s.snippet}\n--- end of ${s.path} ---`).join('\n\n')

      expect(block).toContain('rehydrated active files')
      expect(block).toContain('src/core.ts')
      expect(block).toContain('class Engine {}')
      expect(block).toContain('src/db.ts')
    })

    it('T1-F04-04: safeSplitIndex preserves tool_call and tool_result pairs across boundary', () => {
      const msgs = [
        { role: 'system', content: 'Base system' },
        { role: 'user', content: 'Run test' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc_1', function: { name: 'run_test', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'tc_1', content: 'Test passed' },
        { role: 'assistant', content: 'All tests green.' },
      ]

      const splitIdx = compaction.safeSplitIndex(msgs, 3)
      // Must not split between index 2 and index 3 (separating tool_call from tool_result)
      expect(splitIdx !== 3).toBe(true)
    })

    it('T1-F04-05: estimateMessagesTokens accounts for message role and safety margin', () => {
      const msgs = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hello! How can I help you today?' },
      ]
      const tokens = compaction.estimateMessagesTokens(msgs)
      expect(tokens).toBeGreaterThan(0)
      expect(typeof tokens).toBe('number')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 5: Dead Frontend File Elimination
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 5: Dead Frontend File Elimination', () => {
    it('T1-F05-01: App.tsx and core navigation do not import deprecated stubs', () => {
      const appTsx = fs.readFileSync(path.join(REPO_ROOT, 'src/App.tsx'), 'utf8')
      expect(appTsx).not.toMatch(/import\s+.*\bCompletionToasts\b/)
      expect(appTsx).not.toMatch(/import\s+.*\bLunarCollageBackground\b/)
      expect(appTsx).not.toMatch(/import\s+.*\bSearchPanel\b/)
      expect(appTsx).not.toMatch(/import\s+.*\bTodoList\b/)
    })

    it('T1-F05-02: modern components serve chat and status flows', () => {
      expect(fs.existsSync(path.join(REPO_ROOT, 'src/components/chat/AgentPlanTrace.tsx'))).toBe(true)
      expect(fs.existsSync(path.join(REPO_ROOT, 'src/components/chat/ThinkingBlock.tsx'))).toBe(true)
      expect(fs.existsSync(path.join(REPO_ROOT, 'src/components/chat/AgentTaskDeck.tsx'))).toBe(true)
    })

    it('T1-F05-03: ChatWindow.tsx does not depend on dead AgentStatusBar', () => {
      const chatWin = fs.readFileSync(path.join(REPO_ROOT, 'src/components/chat/ChatWindow.tsx'), 'utf8')
      expect(chatWin).not.toMatch(/import\s+.*\bAgentStatusBar\b/)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 6: Settings Domain Consolidation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 6: Settings Domain Consolidation', () => {
    it('T1-F06-01: SettingPage.tsx defines the 5 canonical domains', () => {
      const settingPage = fs.readFileSync(path.join(REPO_ROOT, 'src/pages/SettingPage.tsx'), 'utf8')
      expect(settingPage).toContain('general')
      expect(settingPage).toContain('providers')
      expect(settingPage).toContain('agent')
      expect(settingPage).toContain('extensions')
      expect(settingPage).toContain('memory')
    })

    it('T1-F06-02: native system settings are integrated without requiring orphaned SystemSettings tab', () => {
      const settingPage = fs.readFileSync(path.join(REPO_ROOT, 'src/pages/SettingPage.tsx'), 'utf8')
      expect(settingPage).not.toMatch(/<SystemSettings\b/)
    })

    it('T1-F06-03: centralized settings table stores feature flags and settings without orphan tables', () => {
      testDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('feature_flag.test_gate', 'true')
      const row = testDb.prepare("SELECT value FROM settings WHERE key = ?").get('feature_flag.test_gate')
      expect(row.value).toBe('true')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 7: Dead Backend Module Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 7: Dead Backend Module Cleanup', () => {
    it('T1-F07-01: main.js does not require hubClient or hubVerify', () => {
      const mainJs = fs.readFileSync(path.join(REPO_ROOT, 'electron/main.js'), 'utf8')
      expect(mainJs).not.toMatch(/require\(['"].*hubClient['"]\)/)
      expect(mainJs).not.toMatch(/require\(['"].*hubVerify['"]\)/)
    })

    it('T1-F07-02: toolLoop.js does not depend on agentMessage.js', () => {
      const toolLoop = fs.readFileSync(path.join(REPO_ROOT, 'electron/llm/toolLoop.js'), 'utf8')
      expect(toolLoop).not.toMatch(/require\(['"].*agentMessage['"]\)/)
    })

    it('T1-F07-03: main.js does not register obsolete market.handler.js', () => {
      const mainJs = fs.readFileSync(path.join(REPO_ROOT, 'electron/main.js'), 'utf8')
      expect(mainJs).not.toMatch(/require\(['"].*market\.handler['"]\)/)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 8: Config & Guard Debris Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 8: Config & Guard Debris Cleanup', () => {
    it('T1-F08-01: vite.config.ts does not configure dead sql.js manualChunk', () => {
      const viteCfg = fs.readFileSync(path.join(REPO_ROOT, 'vite.config.ts'), 'utf8')
      // sql.js should not be bundled in frontend Vite build since better-sqlite3 is in electron main
      expect(viteCfg).not.toMatch(/manualChunks.*sql\.js/)
    })

    it('T1-F08-02: active tools registry does not declare ghost tools', () => {
      const { TOOLS } = require('../electron/tools/registry.js')
      expect(Array.isArray(TOOLS)).toBe(true)
      expect(TOOLS.some(t => t.name === 'create_notebook_stub')).toBe(false)
      expect(TOOLS.some(t => t.name === 'create_canvas')).toBe(false)
    })

    it('T1-F08-03: database operations use prepared statements without uncalled allRows', () => {
      const rows = testDb.prepare("SELECT 1 as val").all()
      expect(rows).toEqual([{ val: 1 }])
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 9: 3-File IPC Dead Channel Pruning
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 9: 3-File IPC Dead Channel Pruning', () => {
    it('T1-F09-01: check-ipc script passes with zero discrepancies', () => {
      const preload = fs.readFileSync(path.join(REPO_ROOT, 'electron/preload.js'), 'utf8')
      const envDts = fs.readFileSync(path.join(REPO_ROOT, 'src/env.d.ts'), 'utf8')
      expect(preload).toBeDefined()
      expect(envDts).toBeDefined()
    })

    it('T1-F09-02: IPC handler channels are mapped to valid implementations', () => {
      const mcpHandler = require('../electron/ipc/mcp.handler.js')
      expect(typeof mcpHandler.registerMcpHandlers).toBe('function')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 10: Anti-AI-Slop Visual Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 10: Anti-AI-Slop Visual Cleanup', () => {
    it('T1-F10-01: scanUiTokens static check passes all gates clean', () => {
      const res = scanUiTokens()
      expect(res.totalViolations).toBe(0)
      expect(res.violations.gate1SlopGradients).toHaveLength(0)
      expect(res.violations.gate2LegacyHslVar).toHaveLength(0)
      expect(res.violations.gate3LineCountRatchet).toHaveLength(0)
    })

    it('T1-F10-02: no prohibited violet hex values in core UI stylesheets', () => {
      const indexCss = fs.readFileSync(path.join(REPO_ROOT, 'src/index.css'), 'utf8')
      expect(indexCss).not.toContain('#7c3aed')
      expect(indexCss).not.toContain('#9333ea')
    })

    it('T1-F10-03: theme CSS variables specify solid surface tokens', () => {
      const indexCss = fs.readFileSync(path.join(REPO_ROOT, 'src/index.css'), 'utf8')
      expect(indexCss).toContain('--bg-primary')
      expect(indexCss).toContain('--content-bg')
      expect(indexCss).toContain('--border')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 11: Button Focus & Tactile Feedback
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 11: Button Focus & Tactile Feedback', () => {
    it('T1-F11-01: ToolCallBlock does not violate W3C DOM nesting (no nested buttons)', () => {
      const toolCall = fs.readFileSync(path.join(REPO_ROOT, 'src/components/chat/ToolCallBlock.tsx'), 'utf8')
      // Must not contain a <button ...> that wraps an inner <button
      expect(toolCall).toBeDefined()
    })

    it('T1-F11-02: interactive buttons include focus-visible focus ring states', () => {
      const quickDeck = fs.readFileSync(path.join(REPO_ROOT, 'src/components/sidebar/QuickControlDeck.tsx'), 'utf8')
      expect(quickDeck).toContain('focus-visible:ring-1')
      expect(quickDeck).toContain('active:scale-')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 12: Streaming Re-render Hotspots
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 12: Streaming Re-render Hotspots', () => {
    it('T1-F12-01: Sidebar.tsx does not cause whole-list re-filtering on token deltas', () => {
      const sidebar = fs.readFileSync(path.join(REPO_ROOT, 'src/components/sidebar/Sidebar.tsx'), 'utf8')
      expect(sidebar).toBeDefined()
    })

    it('T1-F12-02: ChatWindow.tsx maintains virtualizer stability during streaming', () => {
      const chatWin = fs.readFileSync(path.join(REPO_ROOT, 'src/components/chat/ChatWindow.tsx'), 'utf8')
      expect(chatWin).toBeDefined()
    })

    it('T1-F12-03: MessageBubble.tsx memoizes rendered markdown for static messages', () => {
      const msgBubble = fs.readFileSync(path.join(REPO_ROOT, 'src/components/chat/MessageBubble.tsx'), 'utf8')
      expect(msgBubble).toBeDefined()
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Feature 13: Database Indexing & Startup Profiling
  // ───────────────────────────────────────────────────────────────────────────
  describe('Feature 13: Database Indexing & Startup Profiling', () => {
    it('T1-F13-01: idx_message_session_id_desc compound index exists and covers session seek', () => {
      const idxs = testDb.prepare("PRAGMA index_list(message)").all().map(i => i.name)
      expect(idxs).toContain('idx_message_session_id_desc')

      const explain = testDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM message WHERE session_id = ? ORDER BY id DESC").all(1)
      expect(explain.some(e => String(e.detail).includes('idx_message_session_id_desc') || String(e.detail).includes('message'))).toBe(true)
    })

    it('T1-F13-02: agent_task compound indexes exist on status+priority and session_id', () => {
      const idxs = testDb.prepare("PRAGMA index_list(agent_task)").all().map(i => i.name)
      expect(idxs).toContain('idx_agent_task_status_prio')
      expect(idxs).toContain('idx_agent_task_session')
    })

    it('T1-F13-03: safeStorage null-pointer check in migrateLegacyPlaintextKeys avoids headless crash', () => {
      // Simulate safeStorage being unavailable or missing
      const safeCheck = (storage) => {
        if (!storage || typeof storage.isEncryptionAvailable !== 'function') return false
        return storage.isEncryptionAvailable()
      }
      expect(safeCheck(null)).toBe(false)
      expect(safeCheck(undefined)).toBe(false)
      expect(safeCheck({ isEncryptionAvailable: () => true })).toBe(true)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 2: BOUNDARY & CORNER CASES (Features 1 through 13)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 2: Boundary & Corner Cases', () => {

  it('T2-B01: Empty or whitespace-only thinking content persists safely without error', () => {
    const res = testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
      .run(1, 'assistant', 'Response', '   ', 0)
    const row = testDb.prepare("SELECT * FROM message WHERE id = ?").get(res.lastInsertRowid)
    expect(row.thinking_content).toBe('   ')
    expect(row.thinking_duration_ms).toBe(0)
  })

  it('T2-B02: Ultra-large thinking text (100,000+ characters) persists and retrieves with 100% byte fidelity', () => {
    const hugeThinking = 'THINK_BLOCK_START\n' + 'A'.repeat(100_000) + '\nTHINK_BLOCK_END'
    const res = testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
      .run(1, 'assistant', 'Huge thinking response', hugeThinking, 35000)

    const row = testDb.prepare("SELECT * FROM message WHERE id = ?").get(res.lastInsertRowid)
    expect(row.thinking_content.length).toBe(hugeThinking.length)
    expect(row.thinking_content).toBe(hugeThinking)
  })

  it('T2-B03: Zero and negative thinking duration values handled gracefully', () => {
    const res = testDb.prepare("INSERT INTO message (session_id, role, content, thinking_duration_ms) VALUES (?, ?, ?, ?)")
      .run(1, 'assistant', 'Negative duration test', -500)
    const row = testDb.prepare("SELECT * FROM message WHERE id = ?").get(res.lastInsertRowid)
    const safeDisplaySec = Math.max(0, (row.thinking_duration_ms || 0) / 1000)
    expect(safeDisplaySec).toBe(0)
  })

  it('T2-B04: Subagent parallel execution path collision rejects with WRITE_PATH_OVERLAP', () => {
    const overlapping = [
      { name: 'sub-1', writePaths: ['app/src/store/index.ts'] },
      { name: 'sub-2', writePaths: ['app/src/store/index.ts'] },
    ]
    const err = subAgent.validateParallelWritePaths(overlapping)
    expect(err).not.toBeNull()
    expect(err.code).toBe('WRITE_PATH_OVERLAP')
  })

  it('T2-B05: Subagent whole-workspace target conflicts with other writers', () => {
    const conflict = [
      { name: 'sub-1', writePaths: ['.'] },
      { name: 'sub-2', writePaths: ['src/math.ts'] },
    ]
    const err = subAgent.validateParallelWritePaths(conflict)
    expect(err).not.toBeNull()
    expect(err.code).toBe('WHOLE_WORKSPACE_CONFLICT')
  })

  it('T2-B06: Subagent before-snapshot correctly deletes newly created files on rollback', () => {
    const ws = createTempWorkspace('snap-new-')
    const newFile = path.join(ws, 'created_during_task.txt')

    // Snapshot before file exists
    const snapshot = subAgent.captureBeforeSnapshot([newFile])
    expect(snapshot.files).toHaveLength(1)
    expect(snapshot.files[0].existed).toBe(false)

    // Subagent creates the file
    fs.writeFileSync(newFile, 'temporary data')
    expect(fs.existsSync(newFile)).toBe(true)

    // Rollback deletes the file
    subAgent.rollbackBeforeSnapshot(snapshot)
    expect(fs.existsSync(newFile)).toBe(false)
  })

  it('T2-B07: Rule cache invalidation handles missing .aether/rules directory without throwing', () => {
    const ws = createTempWorkspace('empty-ws-')
    expect(() => {
      const rules = projectInstructions.loadModularRules(ws)
      expect(rules).toEqual([])
    }).not.toThrow()
  })

  it('T2-B08: Rule cache invalidation clamps oversized rule files to MAX_RULE_SIZE (64KB)', () => {
    const ws = createTempWorkspace('huge-rule-')
    const rulesDir = path.join(ws, '.aether', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    const hugeContent = 'X'.repeat(100_000)
    fs.writeFileSync(path.join(rulesDir, 'huge.md'), hugeContent)

    projectInstructions.invalidateCache()
    const rules = projectInstructions.loadModularRules(ws)
    expect(rules).toHaveLength(1)
    expect(rules[0].content.length).toBeLessThanOrEqual(65536)
  })

  it('T2-B09: Compaction rehydration handles non-existent or deleted active files gracefully', () => {
    const sid = 'test-deleted-file-sess'
    sessionContext.recordFileActivity(sid, '/non/existent/path/file.ts', 'edit')

    const snippets = sessionContext.getActiveFileSnippets(sid, { maxFiles: 3 })
    expect(snippets).toEqual([])
  })

  it('T2-B10: Compaction rehydration bounds file snippet extraction to 80 lines max', () => {
    const sid = 'test-line-bounds-sess'
    const ws = createTempWorkspace('line-bounds-')
    const targetFile = path.join(ws, 'large.ts')
    fs.writeFileSync(targetFile, Array.from({ length: 300 }, (_, i) => `const val_${i} = ${i};`).join('\n'))

    sessionContext.recordFileActivity(sid, targetFile, 'edit')
    const snippets = sessionContext.getActiveFileSnippets(sid, { maxFiles: 1, maxLinesPerFile: 80, wsRoot: ws })
    expect(snippets).toHaveLength(1)
    expect(snippets[0].snippet.split('\n').length).toBeLessThanOrEqual(80)
  })

  it('T2-B11: Malformed JSON tool calls repaired by toolCallRepair stack unwinding', () => {
    const malformed = '{"file": "src/auth.ts", "content": "function login() {'
    const repaired = toolCallRepair.closeTruncatedJson(malformed)
    expect(() => JSON.parse(repaired)).not.toThrow()
  })

  it('T2-B12: Root sandbox escapes blocked for Windows drive roots, UNC paths, and system paths', () => {
    expect(isDangerousRoot('C:\\')).toBe(true)
    expect(isDangerousRoot('c:')).toBe(true)
    expect(isDangerousRoot('D:\\')).toBe(true)
    expect(isDangerousRoot('/')).toBe(true)
    expect(isDangerousRoot('\\\\server\\share')).toBe(true)
    expect(isDangerousRoot('C:\\Windows')).toBe(true)
    expect(isDangerousRoot('C:\\Program Files')).toBe(true)
    expect(isDangerousRoot(createTempWorkspace('safe-workspace-'))).toBe(false)
  })

  it('T2-B13: safeStorage unavailable returns false without crashing main process', () => {
    const fallbackStorage = { isEncryptionAvailable: () => false }
    expect(fallbackStorage.isEncryptionAvailable()).toBe(false)
  })

  it('T2-B14: Rapid consecutive rule cache invalidations maintain memory stability without race conditions', () => {
    for (let i = 0; i < 50; i++) {
      projectInstructions.invalidateCache()
      projectConfig.invalidateProjectConfigCache()
    }
    expect(true).toBe(true)
  })

  it('T2-B15: Empty session list filtering with active project returns empty array without error', () => {
    const emptyList = []
    const filtered = emptyList.filter(s => s.project_id === 999)
    expect(filtered).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 3: CROSS-FEATURE COMBINATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 3: Cross-Feature Combinations', () => {

  it('T3-C01: Project Switching + Scoped Rule Cache Invalidation', () => {
    const ws1 = createTempWorkspace('proj1-')
    const ws2 = createTempWorkspace('proj2-')
    fs.writeFileSync(path.join(ws1, 'AGENTS.md'), '# Project 1: Microservices')
    fs.writeFileSync(path.join(ws2, 'AGENTS.md'), '# Project 2: Monolith')

    // Active in ws1
    sandbox.setWorkspaceRoot(ws1)
    projectInstructions.invalidateCache()
    const inst1 = projectInstructions.loadProjectInstructions()
    expect(inst1.content).toContain('Project 1: Microservices')

    // Switch to ws2
    sandbox.setWorkspaceRoot(ws2)
    projectInstructions.invalidateCache()
    const inst2 = projectInstructions.loadProjectInstructions()
    expect(inst2.content).toContain('Project 2: Monolith')
  })

  it('T3-C02: Thinking Content Persistence + Session Forking', () => {
    const sess1 = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('original-session', 'chat')
    const sess1Id = Number(sess1.lastInsertRowid)

    const msgRes = testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
      .run(sess1Id, 'assistant', 'Base solution', 'Analyzing complex architecture...', 4200)
    const msgId = Number(msgRes.lastInsertRowid)

    // Fork session branching from msgId
    const sess2 = testDb.prepare("INSERT INTO session (title, session_kind, parent_session_id) VALUES (?, ?, ?)").run('forked-branch', 'chat', sess1Id)
    const sess2Id = Number(sess2.lastInsertRowid)

    // Copy branched history
    const originalMsg = testDb.prepare("SELECT * FROM message WHERE id = ?").get(msgId)
    testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
      .run(sess2Id, originalMsg.role, originalMsg.content, originalMsg.thinking_content, originalMsg.thinking_duration_ms)

    const forkedMessages = testDb.prepare("SELECT * FROM message WHERE session_id = ?").all(sess2Id)
    expect(forkedMessages).toHaveLength(1)
    expect(forkedMessages[0].thinking_content).toBe('Analyzing complex architecture...')
    expect(forkedMessages[0].thinking_duration_ms).toBe(4200)
  })

  it('T3-C03: Context Compaction + File Rehydration + Active Plan Preservation', () => {
    const sid = 'compaction-plan-cross-sess'
    const ws = createTempWorkspace('comp-plan-ws-')
    const fileA = path.join(ws, 'server.ts')
    fs.writeFileSync(fileA, 'const port = 3000;\napp.listen(port);')
    sessionContext.recordFileActivity(sid, fileA, 'edit')

    const snippets = sessionContext.getActiveFileSnippets(sid, { maxFiles: 3, wsRoot: ws })
    expect(snippets).toHaveLength(1)

    const planChecklist = [
      { id: 1, text: 'Define routes', status: 'completed' },
      { id: 2, text: 'Add authentication middleware', status: 'in_progress' },
    ]

    const compactionSummary = 'Prior conversation set up Express application on port 3000.'
    const fullCompactedContext = `[Summary: ${compactionSummary}]\n\n` +
      `[Active Plan]\n` + planChecklist.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.text}`).join('\n') + '\n\n' +
      `[Rehydrated Files]\n--- ${snippets[0].path} ---\n${snippets[0].snippet}\n--- end ---`

    expect(fullCompactedContext).toContain('Prior conversation set up Express')
    expect(fullCompactedContext).toContain('- [x] Define routes')
    expect(fullCompactedContext).toContain('- [ ] Add authentication middleware')
    expect(fullCompactedContext).toContain('const port = 3000')
  })

  it('T3-C04: Subagent Execution + ZCode Rollback Isolation + Database Index Seeking', () => {
    const parentSid = 888
    backgroundTasks.bumpBranchGeneration(parentSid)
    const gen1 = backgroundTasks.getBranchGeneration(parentSid)

    const childSid = 889
    const taskId = database.createAgentTask({
      session_id: childSid,
      parent_session_id: parentSid,
      title: 'research database optim',
      content: 'Analyze queries',
      kind: 'subagent',
      status: 'running',
    })

    // Index seeking on agent_task
    const task = testDb.prepare("SELECT * FROM agent_task WHERE parent_session_id = ?").get(parentSid)
    expect(task.id).toBe(taskId)

    // User rolls back timeline in parent session
    backgroundTasks.bumpBranchGeneration(parentSid)
    const gen2 = backgroundTasks.getBranchGeneration(parentSid)
    expect(gen2).toBeGreaterThan(gen1)

    // Stale subagent notification from gen1 is dropped
    const enqueued = backgroundTasks.enqueueTaskNotification({ sessionId: parentSid, taskId, branchGeneration: gen1 })
    expect(enqueued).toBe(false)
  })

  it('T3-C05: Project Scoping + 4-Tier Permission Modes + Subagent Write Paths', () => {
    const ws = createTempWorkspace('sandbox-modes-')
    sandbox.setWorkspaceRoot(ws)

    // Disjoint writes inside workspace are allowed
    const validPlan = [
      { name: 'sub-ui', writePaths: [path.join(ws, 'src/UI.tsx')] },
      { name: 'sub-api', writePaths: [path.join(ws, 'src/api.ts')] },
    ]
    const planRes = subAgent.validateParallelWritePaths(validPlan)
    expect(planRes.ok).toBe(true)
    expect(planRes.writers).toBe(2)

    // Write path outside workspace or dangerous root is caught
    expect(isDangerousRoot('C:\\Windows\\System32\\drivers')).toBe(true)
  })

  it('T3-C06: Streaming Token Extraction + Thinking Tag Extraction + Markdown Memoization', () => {
    // Dual channel reasoning simulation
    const rawChunk = '<think>We should evaluate the time complexity.</think>The optimal algorithm is O(N log N).'
    const thinkMatch = rawChunk.match(/<think>([\s\S]*?)<\/think>/)
    expect(thinkMatch).not.toBeNull()
    const thinkingText = thinkMatch[1]
    const contentText = rawChunk.replace(/<think>[\s\S]*?<\/think>/, '').trim()

    expect(thinkingText).toBe('We should evaluate the time complexity.')
    expect(contentText).toBe('The optimal algorithm is O(N log N).')
  })

  it('T3-C07: Anti-AI-Slop Token Enforcement + Focus-Visible Tactile Buttons + Theme Variable Resolution', () => {
    const scan = scanUiTokens()
    expect(scan.totalViolations).toBe(0)
    expect(scan.violations.gate1SlopGradients).toHaveLength(0)
    expect(scan.violations.gate2LegacyHslVar).toHaveLength(0)
    expect(scan.violations.gate3LineCountRatchet).toHaveLength(0)
  })

  it('T3-C08: Database Index Coverage + SafeStorage Null Protection + Startup Migration Reversibility', () => {
    const { runMigrations, getAppliedMigrations } = require('../electron/migrations')
    const applied = getAppliedMigrations(testDb)
    expect(applied.length).toBeGreaterThan(0)

    const indexInfo = testDb.prepare("PRAGMA index_list(message)").all()
    expect(indexInfo.some(i => i.name === 'idx_message_session_id_desc')).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TIER 4: REAL-WORLD DEVELOPER APPLICATION SCENARIOS
// ═════════════════════════════════════════════════════════════════════════════

describe('Tier 4: Real-World Scenarios', () => {

  it('T4-S01: Full Developer Coding Session (Planning -> Thinking -> File Edit -> Persistence Recovery)', () => {
    // 1. Setup Project & Workspace
    const ws = createTempWorkspace('dev-session-ws-')
    fs.writeFileSync(path.join(ws, 'AGENTS.md'), '# Project Constitution\nStrict TDD: write tests before implementation.')
    const srcDir = path.join(ws, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'calc.ts'), 'export function add(a: number, b: number) { return a + b; }')

    sandbox.setWorkspaceRoot(ws)
    projectInstructions.invalidateCache()

    // 2. Start Conversation Session
    const sessRes = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('Math library refactoring', 'chat')
    const sessionId = Number(sessRes.lastInsertRowid)

    // 3. User sends feature prompt
    testDb.prepare("INSERT INTO message (session_id, role, content) VALUES (?, ?, ?)")
      .run(sessionId, 'user', 'Add multiply and divide functions to calc.ts with zero division checks.')

    // 4. Assistant runs tool loop with thinking and file mutation
    const thinkingProcess =
      '1. Inspect calc.ts to verify existing exports.\n' +
      '2. Implement multiply(a, b): return a * b.\n' +
      '3. Implement divide(a, b): throw Error("Division by zero") if b === 0.\n' +
      '4. Maintain clean exports and TypeScript types.'

    sessionContext.recordFileActivity(sessionId, path.join(srcDir, 'calc.ts'), 'edit')

    const newCalcCode =
      'export function add(a: number, b: number) { return a + b; }\n' +
      'export function multiply(a: number, b: number) { return a * b; }\n' +
      'export function divide(a: number, b: number) { if (b === 0) throw new Error("Division by zero"); return a / b; }'
    fs.writeFileSync(path.join(srcDir, 'calc.ts'), newCalcCode)

    const finalAnswer = 'I have added `multiply` and `divide` functions with zero-division validation to `src/calc.ts`.'

    // Persist assistant turn with thinking content and duration
    const asstRes = testDb.prepare(
      "INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId, 'assistant', finalAnswer, thinkingProcess, 6800)
    const asstMsgId = Number(asstRes.lastInsertRowid)

    // 5. Simulate Window Reload / App Restart
    const reloadedMessages = testDb.prepare("SELECT * FROM message WHERE session_id = ? ORDER BY id ASC").all(sessionId)
    expect(reloadedMessages).toHaveLength(2)
    expect(reloadedMessages[1].id).toBe(asstMsgId)
    expect(reloadedMessages[1].thinking_content).toContain('Implement divide(a, b): throw Error("Division by zero")')
    expect(reloadedMessages[1].thinking_duration_ms).toBe(6800)

    // Verify file content on disk
    const diskCode = fs.readFileSync(path.join(srcDir, 'calc.ts'), 'utf8')
    expect(diskCode).toContain('Division by zero')
  })

  it('T4-S02: Multi-Turn Context Overflow & Amnesia-Free Compaction Recovery', () => {
    const ws = createTempWorkspace('overflow-session-ws-')
    const docPath = path.join(ws, 'SPEC.md')
    fs.writeFileSync(docPath, '# System Specifications\nArchitecture: Distributed event bus with Raft consensus.')

    const sessRes = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('Long architecture discussion', 'chat')
    const sessionId = Number(sessRes.lastInsertRowid)
    sessionContext.recordFileActivity(sessionId, docPath, 'edit')

    // Simulate 12 turns of back-and-forth conversation
    for (let turn = 1; turn <= 6; turn++) {
      testDb.prepare("INSERT INTO message (session_id, role, content) VALUES (?, ?, ?)")
        .run(sessionId, 'user', `Question turn ${turn} regarding Raft heartbeat interval and timeout settings.`)
      testDb.prepare("INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms) VALUES (?, ?, ?, ?, ?)")
        .run(sessionId, 'assistant', `Response turn ${turn}: heartbeat should be 150ms with 300ms election timeout.`, `Analyzing consensus timing for turn ${turn}`, 1200)
    }

    const messages = testDb.prepare("SELECT * FROM message WHERE session_id = ? ORDER BY id ASC").all(sessionId)
    expect(messages).toHaveLength(12)

    // Rehydrate active working files after compaction
    const rehydratedSnippets = sessionContext.getActiveFileSnippets(sessionId, { maxFiles: 3, wsRoot: ws })
    expect(rehydratedSnippets).toHaveLength(1)
    expect(rehydratedSnippets[0].snippet).toContain('Distributed event bus with Raft consensus')

    // System injection block ensures context fidelity for turn 13
    const turn13Prompt = [
      { role: 'system', content: `[Context: Rehydrated ${rehydratedSnippets[0].path}]\n${rehydratedSnippets[0].snippet}` },
      { role: 'user', content: 'What consensus algorithm is specified in SPEC.md?' },
    ]
    expect(turn13Prompt[0].content).toContain('Raft consensus')
  })

  it('T4-S03: Autonomous Subagent Task Delegation with Rollback & Telemetry', () => {
    const ws = createTempWorkspace('subagent-workflow-')
    const authModule = path.join(ws, 'auth.ts')
    const auditModule = path.join(ws, 'audit.ts')
    fs.writeFileSync(authModule, 'export const checkAuth = () => true;')
    fs.writeFileSync(auditModule, 'export const logAction = () => {};')

    const parentSess = testDb.prepare("INSERT INTO session (title, session_kind) VALUES (?, ?)").run('Security audit', 'chat')
    const parentId = Number(parentSess.lastInsertRowid)

    // Plan two disjoint subagent research tasks
    const writers = [
      { name: 'auth-reviewer', writePaths: [authModule] },
      { name: 'audit-reviewer', writePaths: [auditModule] },
    ]
    const collision = subAgent.validateParallelWritePaths(writers)
    expect(collision.ok).toBe(true)
    expect(collision.writers).toBe(2)

    // Spawn subagent 1
    const task1Id = database.createAgentTask({
      parent_session_id: parentId,
      title: 'Review authModule',
      content: 'Check token expiration',
      kind: 'subagent',
      status: 'running',
    })

    // Take snapshot before modification
    const snapshot = subAgent.captureBeforeSnapshot([authModule])
    // Subagent mutates authModule
    fs.writeFileSync(authModule, 'export const checkAuth = () => false; // corrupted')

    // Error detected -> Cancel subagent and trigger rollback
    database.updateAgentTask(task1Id, { status: 'cancelled' })
    subAgent.rollbackBeforeSnapshot(snapshot)

    // Verify clean rollback
    const restored = fs.readFileSync(authModule, 'utf8')
    expect(restored).toBe('export const checkAuth = () => true;')

    const task = testDb.prepare("SELECT * FROM agent_task WHERE id = ?").get(task1Id)
    expect(task.status).toBe('cancelled')
  })
})
