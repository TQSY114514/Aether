// ─── Permission-decision logic tests: permissions.js + trustEngine.js ───────
// trustEngine is Electron-free (only requires ../logger and ../tools/registry).
// The db it touches follows the better-sqlite3 contract: prepare(sql) returns
// { get, all, run } taking positional ? bindings (db.exec is DDL-only and never
// takes parameters — the old sql.js-shaped usage silently starved the trust
// engine at score 50, see audit Low items).
//
// Beyond the pure decision-matrix tests, the trailing describe drives the REAL
// runToolLoop (electron + providerAdapter intercepted via Module._load — the
// repo's established mock pattern, see toolLoop.test.js / budgetWarning.test.js)
// to prove the ask-mode dangerous-tool confirmation gate is actually wired
// (audit P0-C1): approve → executes, deny/timeout/no-callback → permission_denied.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import Module from 'module'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import permissions from '../electron/llm/permissions'
import trustEngine from '../electron/llm/trustEngine'

// Fake db exposing the better-sqlite3 shapes trustEngine calls:
// prepare('SELECT trust_score ...').get(id), prepare('PRAGMA table_info(session)').all(),
// prepare('UPDATE session ...').run(score, id). trustRows = [[score, updatedAt]].
function makeDb(trustRows = [], { hasTrustCol = true, updates = [] } = {}) {
  return {
    prepare: (sql) => ({
      get: () => {
        if (/SELECT trust_score/i.test(sql) && trustRows.length) {
          const [score, updatedAt] = trustRows[0]
          return { trust_score: score, updated_at: updatedAt }
        }
        return undefined
      },
      all: () => {
        if (/PRAGMA table_info/i.test(sql)) {
          return hasTrustCol
            ? [{ name: 'id' }, { name: 'trust_score' }, { name: 'updated_at' }]
            : [{ name: 'id' }]
        }
        return []
      },
      run: (...params) => { updates.push(params) },
    }),
  }
}

// 'YYYY-MM-DD HH:MM:SS' in local time (matches database.js localNow() format).
function localStamp(msAgo) {
  const d = new Date(Date.now() - msAgo)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

describe('PermissionMode enum', () => {
  it('orders modes least → most permissive', () => {
    expect(permissions.PermissionMode).toEqual({
      ReadOnly: 0,
      WorkspaceWrite: 1,
      DangerFullAccess: 2,
      Prompt: 3,
      Allow: 4,
    })
  })

  it('permissionModeToString maps known values and unknowns', () => {
    expect(permissions.permissionModeToString(0)).toBe('read-only')
    expect(permissions.permissionModeToString(2)).toBe('danger-full-access')
    expect(permissions.permissionModeToString(4)).toBe('allow')
    expect(permissions.permissionModeToString(99)).toBe('unknown')
  })

  it('PermissionOverride exposes allow/deny/ask', () => {
    expect(permissions.PermissionOverride).toEqual({ Allow: 'allow', Deny: 'deny', Ask: 'ask' })
  })
})

// ─── C1: authorization matrix after the Prompt-in->= chain fix ─────────────
describe('PermissionPolicy authorization matrix (C1 fix)', () => {
  const { ReadOnly, WorkspaceWrite, DangerFullAccess, Prompt, Allow } = permissions.PermissionMode
  const prompterAllow = { decide: () => permissions.PermissionPromptDecision.Allow }
  const prompterDeny = { decide: () => permissions.PermissionPromptDecision.Deny }
  const dangerousInput = JSON.stringify({ command: 'rm -rf /tmp/x' })
  const safeInput = JSON.stringify({ path: 'C:/tmp/a.txt' })

  function policy(mode) {
    return new permissions.PermissionPolicy(mode)
      .withToolRequirement('run_command', DangerFullAccess)
      .withToolRequirement('write_file', DangerFullAccess)
      .withToolRequirement('read_file', ReadOnly)
  }

  it('Prompt (ask) + dangerous: no prompter → default deny (Prompt no longer satisfies >= DangerFullAccess)', () => {
    const out = policy(Prompt).authorize('run_command', dangerousInput)
    expect(out.allowed).toBe(false)
    expect(out.reason).toContain('requires approval')
  })

  it('Prompt (ask) + dangerous: prompter approves → allowed', () => {
    expect(policy(Prompt).authorize('run_command', dangerousInput, prompterAllow).allowed).toBe(true)
  })

  it('Prompt (ask) + dangerous: prompter denies → denied as "denied by user"', () => {
    const out = policy(Prompt).authorize('run_command', dangerousInput, prompterDeny)
    expect(out.allowed).toBe(false)
    expect(out.reason).toBe('denied by user')
  })

  it('Prompt (ask) + safe (ReadOnly requirement) → allowed without any prompter', () => {
    expect(policy(Prompt).authorize('read_file', safeInput).allowed).toBe(true)
  })

  it('ReadOnly (plan): safe allowed, dangerous denied — not the old deny-everything', () => {
    const p = policy(ReadOnly)
    expect(p.authorize('read_file', safeInput).allowed).toBe(true)
    const out = p.authorize('write_file', JSON.stringify({ path: 'x', content: 'y' }))
    expect(out.allowed).toBe(false)
    expect(out.reason).toContain('read-only')
  })

  it('WorkspaceWrite (auto): safe allowed, dangerous escalates to prompt/deny', () => {
    const p = policy(WorkspaceWrite)
    expect(p.authorize('read_file', safeInput).allowed).toBe(true)
    expect(p.authorize('run_command', dangerousInput).allowed).toBe(false)
    expect(p.authorize('run_command', dangerousInput, prompterAllow).allowed).toBe(true)
  })

  it('Allow (yolo): everything allowed, no prompter needed', () => {
    const p = policy(Allow)
    expect(p.authorize('read_file', safeInput).allowed).toBe(true)
    expect(p.authorize('run_command', dangerousInput).allowed).toBe(true)
    expect(p.authorize('write_file', JSON.stringify({ path: 'x', content: 'y' })).allowed).toBe(true)
  })

  it('allowRule hit → dangerous tool allowed even in Prompt mode (no prompter)', () => {
    const p = new permissions.PermissionPolicy(Prompt)
      .withToolRequirement('run_command', DangerFullAccess)
      .withPermissionRules({ allow: ['run_command'] })
    expect(p.authorize('run_command', dangerousInput).allowed).toBe(true)
  })

  it('unregistered tools default to DangerFullAccess requirement (conservative)', () => {
    const p = new permissions.PermissionPolicy(Prompt)
    const out = p.authorize('mcp__strange_tool', '{}')
    expect(out.allowed).toBe(false)
  })
})

describe('trustEngine.getPermissionMode', () => {
  it('non-dangerous tools always ask, regardless of trust', () => {
    expect(trustEngine.getPermissionMode(makeDb(), 1, 'read_file')).toBe('ask')
    expect(trustEngine.getPermissionMode(makeDb([[95, null]]), 1, 'read_file')).toBe('ask')
  })

  it('high-risk dangerous tool: trust 90 → auto, trust 96 → yolo', () => {
    expect(trustEngine.getPermissionMode(makeDb([[90, null]]), 1, 'run_command')).toBe('auto')
    expect(trustEngine.getPermissionMode(makeDb([[96, null]]), 1, 'run_command')).toBe('yolo')
  })

  it('dangerous non-high-risk tool (delegate_task) with trust >=80 -> auto', () => {
    expect(trustEngine.getPermissionMode(makeDb([[85, null]]), 1, 'delegate_task')).toBe('auto')
  })

  it('low trust + high-risk tool → forced ask', () => {
    expect(trustEngine.getPermissionMode(makeDb([[30, null]]), 1, 'write_file')).toBe('ask')
  })

  it('default / medium trust → ask', () => {
    expect(trustEngine.getPermissionMode(makeDb([[50, null]]), 1, 'git_push')).toBe('ask')
    // No session row → TRUST_INITIAL (50) applies.
    expect(trustEngine.getPermissionMode(makeDb(), 1, 'run_command')).toBe('ask')
  })
})

describe('trustEngine.getEffectiveMode', () => {
  it('yolo / plan / auto_confirm pass through', () => {
    expect(trustEngine.getEffectiveMode('yolo', 'run_command', makeDb(), 1)).toBe('yolo')
    expect(trustEngine.getEffectiveMode('plan', 'read_file', makeDb(), 1)).toBe('plan')
    expect(trustEngine.getEffectiveMode('auto_confirm', 'run_command', makeDb(), 1)).toBe('auto')
  })

  it('ask delegates to the trust engine when a session exists', () => {
    expect(trustEngine.getEffectiveMode('ask', 'read_file', makeDb(), 1)).toBe('ask')
    expect(trustEngine.getEffectiveMode('ask', 'run_command', makeDb([[90, null]]), 1)).toBe('auto')
  })

  it('ask without a session id stays ask', () => {
    expect(trustEngine.getEffectiveMode('ask', 'run_command', makeDb([[90, null]]), null)).toBe('ask')
  })

  it('unknown agent mode passes through unchanged', () => {
    expect(trustEngine.getEffectiveMode('banana', 'read_file', makeDb(), 1)).toBe('banana')
  })
})

// ─── trustEngine real read/write over the better-sqlite3 contract ──────────
describe('trustEngine score read/write (prepare().get/all/run)', () => {
  it('getTrustScore reads the persisted score via prepare().get() (db.exec era always returned 50)', () => {
    expect(trustEngine.getTrustScore(makeDb([[72, null]]), 1)).toBe(72)
    expect(trustEngine.getTrustScore(makeDb([[0, null]]), 1)).toBe(0)
    expect(trustEngine.getTrustScore(makeDb(), 1)).toBe(trustEngine.TRUST_INITIAL)
  })

  it('getTrustScore applies weekly decay from updated_at, clamped to [0,100]', () => {
    // 365 days idle → 52 weeks → 80 - 52 = 28.
    expect(trustEngine.getTrustScore(makeDb([[80, localStamp(365 * 86400000)]]), 1)).toBe(28)
    // Clamped at the floor: 10 - 52 → 0.
    expect(trustEngine.getTrustScore(makeDb([[10, localStamp(365 * 86400000)]]), 1)).toBe(0)
    // Fresh timestamp → no decay.
    expect(trustEngine.getTrustScore(makeDb([[80, localStamp(0)]]), 1)).toBe(80)
  })

  it('adjustTrust writes the clamped new score via prepare().run()', () => {
    const updates = []
    const db = makeDb([[50, null]], { updates })
    const out = trustEngine.adjustTrust(db, 1, 5, 'run_command')
    expect(out).toBe(55)
    expect(updates.length).toBe(1)
    expect(updates[0][0]).toBe(55)
    expect(updates[0][1]).toBe(1)
    // Clamp at TRUST_MAX.
    const updates2 = []
    expect(trustEngine.adjustTrust(makeDb([[99, null]], { updates: updates2 }), 1, 5, 'run_command')).toBe(100)
    expect(updates2[0][0]).toBe(100)
  })

  it('older databases without the trust_score column skip the write without throwing', () => {
    const updates = []
    const db = makeDb([[50, null]], { hasTrustCol: false, updates })
    expect(trustEngine.adjustTrust(db, 1, 5, 'run_command')).toBeUndefined()
    expect(updates.length).toBe(0)
  })
})

// ─── P0-C1 integration: the ask-mode dangerous-tool gate is actually wired ──
// Drives the real runToolLoop with a scripted fake LLM against a temp
// workspace. write_file (dangerous) / read_file (safe) come from the real
// registry, so the risk wiring and policy requirements are exercised end to end.
describe('runToolLoop permission gate wiring (P0-C1)', () => {
  const origLoad = Module._load
  let fakeLlm = null
  let toolLoop = null
  let wsRoot = null
  let sandbox = null

  beforeAll(() => {
    Module._load = function (request, ...args) {
      if (request === 'electron') {
        return { app: { getPath: () => join(tmpdir(), 'aether-perm-test-userdata') } }
      }
      if (request.endsWith('providerAdapter')) {
        return { completeChatMessage: (opts) => fakeLlm(opts) }
      }
      return origLoad.apply(this, [request, ...args])
    }
  })

  afterAll(() => {
    Module._load = origLoad
  })

  beforeEach(async () => {
    delete require.cache[require.resolve('../electron/llm/toolLoop')]
    toolLoop = await import('../electron/llm/toolLoop')
    sandbox = require('../electron/tools/sandbox')
    wsRoot = mkdtempSync(join(tmpdir(), 'aether-perm-'))
    sandbox.setWorkspaceRoot(wsRoot)
  })

  afterEach(() => {
    try { rmSync(wsRoot, { recursive: true, force: true }) } catch {}
    sandbox.setWorkspaceRoot(null)
  })

  // Scripted LLM: first round emits one tool call, next round answers.
  function scriptToolCall(toolName, toolArgs) {
    fakeLlm = ({ messages }) => {
      const hasToolResult = messages.some((m) => m.role === 'tool')
      if (!hasToolResult) {
        return Promise.resolve({
          content: 'acting',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: toolName, arguments: JSON.stringify(toolArgs) } }],
        })
      }
      return Promise.resolve({ content: 'done', tool_calls: undefined })
    }
  }

  async function runLoop({ agentMode, requestPermission }) {
    const entries = []
    const result = await toolLoop.runToolLoop({
      provider: { name: 'fake-provider', api_format: 'openai', base_url: 'http://fake' },
      model: { model_name: 'fake-model' },
      messages: [{ role: 'user', content: 'do the thing' }],
      agentMode,
      maxIterations: 3,
      sessionId: 7777,
      messageId: 1,
      db: {},
      onToolCall: (e) => entries.push(e),
      onStatus: () => {},
      onPlanStep: () => {},
      onTodoUpdate: () => {},
      requestPermission,
    })
    // Final entries are the ones without the startedAt placeholder.
    const final = entries.filter((e) => !e.startedAt)
    return { entries, final, result }
  }

  it('ask + dangerous: user approves → confirmation requested once and the tool executes', { timeout: 30000 }, async () => {
    const target = join(wsRoot, 'approved.txt')
    scriptToolCall('write_file', { path: target, content: 'hi' })
    const permCalls = []
    const { final } = await runLoop({
      agentMode: 'ask',
      requestPermission: async (p) => { permCalls.push(p); return true },
    })
    expect(permCalls.length).toBe(1)
    expect(permCalls[0]).toMatchObject({ name: 'write_file', risk: 'dangerous' })
    expect(permCalls[0].args).toMatchObject({ path: target })
    const entry = final.find((e) => e.name === 'write_file')
    expect(entry.error).toBeFalsy()
    expect(String(entry.result)).toContain('wrote')
    expect(existsSync(target)).toBe(true)
  })

  it('ask + dangerous: user denies → permission_denied, tool never runs', { timeout: 30000 }, async () => {
    const target = join(wsRoot, 'denied.txt')
    scriptToolCall('write_file', { path: target, content: 'x' })
    const { final } = await runLoop({ agentMode: 'ask', requestPermission: async () => false })
    const entry = final.find((e) => e.name === 'write_file')
    expect(entry.failure_kind).toBe('permission_denied')
    expect(entry.error).toContain('denied by user')
    expect(existsSync(target)).toBe(false)
  })

  it('ask + dangerous: no permission callback → default deny (headless safety)', { timeout: 30000 }, async () => {
    const target = join(wsRoot, 'no-callback.txt')
    scriptToolCall('write_file', { path: target, content: 'x' })
    const { final } = await runLoop({ agentMode: 'ask', requestPermission: undefined })
    const entry = final.find((e) => e.name === 'write_file')
    expect(entry.failure_kind).toBe('permission_denied')
    expect(entry.error).toContain('requires user confirmation')
    expect(existsSync(target)).toBe(false)
  })

  it('requestPermissionWithTimeout: approve → true, deny → false, no callback → false, hang → timeout false', async () => {
    expect(await toolLoop.requestPermissionWithTimeout(async () => true, {}, 100)).toBe(true)
    expect(await toolLoop.requestPermissionWithTimeout(async () => false, {}, 100)).toBe(false)
    expect(await toolLoop.requestPermissionWithTimeout(null, {}, 100)).toBe(false)
    expect(await toolLoop.requestPermissionWithTimeout(() => new Promise(() => {}), {}, 50)).toBe(false)
  })

  it('ask + safe: runs directly, no confirmation dialog', { timeout: 30000 }, async () => {
    const target = join(wsRoot, 'readable.txt')
    writeFileSync(target, 'hello-perm')
    scriptToolCall('read_file', { path: target })
    let prompted = 0
    const { final } = await runLoop({
      agentMode: 'ask',
      requestPermission: async () => { prompted++; return false },
    })
    expect(prompted).toBe(0)
    const entry = final.find((e) => e.name === 'read_file')
    expect(entry.error).toBeFalsy()
    expect(String(entry.result)).toContain('hello-perm')
  })

  it('plan: safe tools run, dangerous tools denied without prompting', { timeout: 30000 }, async () => {
    const readTarget = join(wsRoot, 'plan-read.txt')
    writeFileSync(readTarget, 'plan-ok')
    let prompted = 0
    const denySpy = async () => { prompted++; return true }

    const bad = join(wsRoot, 'plan-out.txt')
    scriptToolCall('write_file', { path: bad, content: 'x' })
    const r1 = await runLoop({ agentMode: 'plan', requestPermission: denySpy })
    const denied = r1.final.find((e) => e.name === 'write_file')
    expect(denied.failure_kind).toBe('permission_denied')
    expect(existsSync(bad)).toBe(false)

    scriptToolCall('read_file', { path: readTarget })
    const r2 = await runLoop({ agentMode: 'plan', requestPermission: denySpy })
    const readEntry = r2.final.find((e) => e.name === 'read_file')
    expect(readEntry.error).toBeFalsy()
    expect(String(readEntry.result)).toContain('plan-ok')

    expect(prompted).toBe(0) // plan never prompts — it denies dangerous outright
  })

  it('auto (WorkspaceWrite): safe tools run, dangerous denied', { timeout: 30000 }, async () => {
    const readTarget = join(wsRoot, 'auto-read.txt')
    writeFileSync(readTarget, 'auto-ok')
    scriptToolCall('read_file', { path: readTarget })
    const r1 = await runLoop({ agentMode: 'auto', requestPermission: async () => true })
    const readEntry = r1.final.find((e) => e.name === 'read_file')
    expect(readEntry.error).toBeFalsy()

    const bad = join(wsRoot, 'auto-out.txt')
    scriptToolCall('write_file', { path: bad, content: 'x' })
    const r2 = await runLoop({ agentMode: 'auto', requestPermission: async () => true })
    const denied = r2.final.find((e) => e.name === 'write_file')
    expect(denied.failure_kind).toBe('permission_denied')
    expect(existsSync(bad)).toBe(false)
  })

  it('yolo: dangerous tools execute without any confirmation', { timeout: 30000 }, async () => {
    const target = join(wsRoot, 'yolo-out.txt')
    scriptToolCall('write_file', { path: target, content: 'y' })
    let prompted = 0
    const { final } = await runLoop({
      agentMode: 'yolo',
      requestPermission: async () => { prompted++; return true },
    })
    expect(prompted).toBe(0)
    const entry = final.find((e) => e.name === 'write_file')
    expect(entry.error).toBeFalsy()
    expect(existsSync(target)).toBe(true)
  })
})


// ─── Session-scoped always-allow (P0) ────────────────────────────────────────
describe('approveAlways / sessionApproved', () => {
  const { PermissionMode, PermissionPromptDecision } = permissions

  function countingPrompter() {
    let asks = 0
    return {
      get asks() { return asks },
      decide() {
        asks++
        return PermissionPromptDecision.AllowAlways
      },
    }
  }

  it('approving once stops asking for the same subject (asks === 1)', () => {
    const policy = new permissions.PermissionPolicy(PermissionMode.Prompt)
    policy.withToolRequirement('exec', PermissionMode.DangerFullAccess)
    const p = countingPrompter()
    const input = JSON.stringify({ command: 'npm test' })

    const r1 = policy.authorize('exec', input, p)
    expect(r1.allowed).toBe(true)
    expect(p.asks).toBe(1)

    const r2 = policy.authorize('exec', input, p)
    expect(r2.allowed).toBe(true)
    expect(r2.via).toBe('session_approved')
    expect(p.asks).toBe(1) // 不再询问
  })

  it('session-approved rules can never override deny rules', () => {
    const policy = new permissions.PermissionPolicy(PermissionMode.Prompt)
    policy.approveAlways('exec(npm test)')
    policy.withPermissionRules({ deny: ['exec'] })
    const r = policy.authorize('exec', JSON.stringify({ command: 'npm test' }), null)
    expect(r.allowed).toBe(false)
  })

  it('a different subject is asked again (asks >= 2)', () => {
    const policy = new permissions.PermissionPolicy(PermissionMode.Prompt)
    policy.withToolRequirement('exec', PermissionMode.DangerFullAccess)
    const p = countingPrompter()
    policy.authorize('exec', JSON.stringify({ command: 'npm test' }), p)
    policy.authorize('exec', JSON.stringify({ command: 'rm -rf /tmp/x' }), p)
    expect(p.asks).toBeGreaterThanOrEqual(2)
  })

  it('hook Deny beats session-approved rules (approval cannot bypass overrides)', () => {
    const { PermissionOverride } = permissions
    const policy = new permissions.PermissionPolicy(PermissionMode.Prompt)
    policy.approveAlways('exec(npm test)')
    const r = policy.authorizeWithContext(
      'exec',
      JSON.stringify({ command: 'npm test' }),
      { permissionOverride: PermissionOverride.Deny, overrideReason: 'hook says no' },
      null,
    )
    expect(r.allowed).toBe(false)
  })

  it('a literal "*" subject stays exact and does not become a match-all rule', () => {
    const policy = new permissions.PermissionPolicy(PermissionMode.Prompt)
    policy.withToolRequirement('exec', PermissionMode.DangerFullAccess)
    const p = countingPrompter()
    // 批准 subject 恰为字面 "*" 的命令
    policy.authorize('exec', JSON.stringify({ command: '*' }), p)
    expect(p.asks).toBe(1)
    // 其他命令不得被波及——若 "(\*)" 被解析成 Any，这里就不会再问
    policy.authorize('exec', JSON.stringify({ command: 'rm -rf /' }), p)
    expect(p.asks).toBe(2)
  })
})