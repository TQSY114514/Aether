// ─── toolLoop unit tests ────────────────────────────────────────────────────
// Tests for the pure functions / classes exported from electron/llm/toolLoop.js:
// IterationBudget, SemanticLoopDetector, classifyToolError, getMaxConcurrent,
// and agentModeToPermissionMode.
//
// toolLoop.js requires electron transitively (via ../tools/sandbox and
// ../logger), so we mock the 'electron' module before importing it.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import Module from 'module'

// ─── Mock electron before importing toolLoop ─────────────────────────────────
const origLoad = Module._load

const fakeApp = {
  getPath: () => 'C:/Users/test/AppData/Aether',
}

beforeAll(() => {
  Module._load = function (request, ...args) {
    if (request === 'electron') {
      return { app: fakeApp }
    }
    return origLoad.apply(this, [request, ...args])
  }
})

let toolLoop
beforeEach(async () => {
  delete require.cache[require.resolve('../electron/llm/toolLoop')]
  toolLoop = await import('../electron/llm/toolLoop')
})

// ─── IterationBudget ─────────────────────────────────────────────────────────
describe('IterationBudget', () => {
  it('consume returns false after the budget is exhausted and remaining is 0', () => {
    const b = new toolLoop.IterationBudget(5)
    for (let i = 0; i < 5; i++) expect(b.consume()).toBe(true)
    expect(b.consume()).toBe(false)
    expect(b.used).toBe(5)
    expect(b.remaining).toBe(0)
  })

  it('refund decrements used and increments remaining', () => {
    const b = new toolLoop.IterationBudget(5)
    expect(b.consume()).toBe(true)
    expect(b.consume()).toBe(true)
    expect(b.used).toBe(2)
    expect(b.remaining).toBe(3)
    b.refund()
    expect(b.used).toBe(1)
    expect(b.remaining).toBe(4)
  })

  it('uses DEFAULT_MAX_ITERATIONS (25) when maxTotal is 0', () => {
    const b = new toolLoop.IterationBudget()
    expect(b.maxTotal).toBe(25)
    expect(b.remaining).toBe(25)
  })
})

// ─── SemanticLoopDetector ────────────────────────────────────────────────────
describe('SemanticLoopDetector', () => {
  it('returns a high score on the second identical round', () => {
    const d = new toolLoop.SemanticLoopDetector()
    const first = d.processRound('let me check the config file', ['read_file'])
    expect(first.action).toBe('normal')
    const second = d.processRound('let me check the config file', ['read_file'])
    expect(second.action).toBe('normal')
    expect(second.score).toBeGreaterThan(0.99)
  })

  it('breaks the loop when the same tool call repeats many times', () => {
    const d = new toolLoop.SemanticLoopDetector(6, 0.85, 2, 4)
    const actions = []
    for (let i = 0; i < 5; i++) {
      const r = d.processRound('same reasoning text', ['read_file'])
      actions.push(r.action)
    }
    // Consecutive above-threshold rounds climb 1→2→3→4, so the final action is 'break'.
    expect(actions[actions.length - 1]).toBe('break')
  })

  it('returns normal for different content', () => {
    const d = new toolLoop.SemanticLoopDetector()
    d.processRound('first idea', ['read_file'])
    const r = d.processRound('completely different second idea', ['write_file'])
    expect(r.action).toBe('normal')
  })

  it('reset clears history', () => {
    const d = new toolLoop.SemanticLoopDetector()
    d.processRound('same', ['read_file'])
    d.processRound('same', ['read_file'])
    d.reset()
    const r = d.processRound('same', ['read_file'])
    expect(r.action).toBe('normal')
    expect(r.score).toBe(0)
  })
})

// ─── classifyToolError ───────────────────────────────────────────────────────
describe('classifyToolError', () => {
  it.each([
    ['request timed out', 'timeout'],
    ['permission denied', 'permission_denied'],
    ['ENOENT: no such file', 'env_missing_dependency'],
    ['MODULE_NOT_FOUND', 'env_missing_dependency'],
    ['test fail: expected 1 to be 2', 'test_failure'],
  ])('classifies %s as %s', (msg, kind) => {
    expect(toolLoop.classifyToolError(msg).kind).toBe(kind)
  })

  it('returns unknown for unrecognized errors', () => {
    expect(toolLoop.classifyToolError('some random error').kind).toBe('unknown')
  })
})

// ─── getMaxConcurrent ────────────────────────────────────────────────────────
describe('getMaxConcurrent', () => {
  it('returns MAX_READ_CONCURRENT (8) for read-only tools', () => {
    const calls = [
      { function: { name: 'read_file' } },
      { function: { name: 'list_dir' } },
    ]
    expect(toolLoop.getMaxConcurrent(calls)).toBe(8)
  })

  it('returns 1 when a write tool is present', () => {
    const calls = [
      { function: { name: 'read_file' } },
      { function: { name: 'write_file' } },
    ]
    expect(toolLoop.getMaxConcurrent(calls)).toBe(1)
  })

  it('returns MAX_DEFAULT_CONCURRENT (5) for mixed/unknown tools', () => {
    const calls = [{ function: { name: 'some_custom_tool' } }]
    expect(toolLoop.getMaxConcurrent(calls)).toBe(5)
  })
})

// ─── agentModeToPermissionMode ───────────────────────────────────────────────
describe('agentModeToPermissionMode', () => {
  it.each([
    ['plan', 'ReadOnly'],
    ['ask', 'Prompt'],
    ['auto', 'WorkspaceWrite'],
    ['yolo', 'Allow'],
  ])('maps %s to %s', (mode, expected) => {
    expect(toolLoop.agentModeToPermissionMode(mode)).toBe(expected)
  })

  it('defaults unknown modes to Prompt', () => {
    expect(toolLoop.agentModeToPermissionMode('non-existent-mode')).toBe('Prompt')
  })
})

// ─── LoopGuard wiring ────────────────────────────────────────────────────────
// Smoke test: runToolLoop is too heavy to unit test, so we only verify the
// typed-hash guard module is exported and the existing API surface survived.
describe('LoopGuard wiring', () => {
  it('exports LoopGuard and keeps the legacy loop-detection surface intact', () => {
    expect(typeof toolLoop.LoopGuard).toBe('function')
    expect(typeof toolLoop.SemanticLoopDetector).toBe('function')
    expect(typeof toolLoop.classifyToolError).toBe('function')
  })
})

// ─── accountToolLoopUsage (/tokens usage accounting) ────────────────────────
// Agent-loop LLM calls (arena/workflow/sub-agent/agent-mode chat) must land in
// usage_log with source='agent' so the TokenPage shows orchestration cost —
// previously only chat streaming ('chat') and arena:send ('arena') were logged.
describe('accountToolLoopUsage', () => {
  const provider = { provider_id: 'p1', provider_name: 'P1' }
  const model = { model_name: 'gpt-test', input_price_per_1k: 0.01, output_price_per_1k: 0.03 }

  it('writes a usage_log row with source=agent and computed cost', () => {
    const db = { logUsage: vi.fn() }
    toolLoop.accountToolLoopUsage({
      db, sessionId: 'sess-1', provider, model,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, prompt_tokens_details: { cached_tokens: 30 } },
      latencyMs: 1234,
    })
    expect(db.logUsage).toHaveBeenCalledTimes(1)
    const row = db.logUsage.mock.calls[0][0]
    expect(row.source).toBe('agent')
    expect(row.session_id).toBe('sess-1')
    expect(row.provider_id).toBe('p1')
    expect(row.provider_name).toBe('P1')
    expect(row.model_name).toBe('gpt-test')
    expect(row.prompt_tokens).toBe(100)
    expect(row.completion_tokens).toBe(50)
    expect(row.total_tokens).toBe(150)
    expect(row.cache_read_tokens).toBe(30)
    expect(row.latency_ms).toBe(1234)
    expect(row.status).toBe(200)
    // 70 billable input tokens × $0.01/1k + 50 × $0.03/1k = $0.0022
    expect(row.cost).toBeCloseTo(0.0022, 6)
  })

  it('falls back to provider.id / model.name when *_id / *_name are absent', () => {
    const db = { logUsage: vi.fn() }
    toolLoop.accountToolLoopUsage({
      db, sessionId: null,
      provider: { id: 'p9', name: 'P9' },
      model: { name: 'mini', input_price_per_1k: 1, output_price_per_1k: 1 },
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
    const row = db.logUsage.mock.calls[0][0]
    expect(row.provider_id).toBe('p9')
    expect(row.provider_name).toBe('P9')
    expect(row.model_name).toBe('mini')
  })

  it('no-ops without usage and never throws on db.logUsage failure', () => {
    const db = { logUsage: vi.fn(() => { throw new Error('boom') }) }
    expect(() => toolLoop.accountToolLoopUsage({ db, provider, model, usage: null })).not.toThrow()
    expect(db.logUsage).not.toHaveBeenCalled()
    const dbOk = { logUsage: vi.fn(() => { throw new Error('boom') }) }
    expect(() => toolLoop.accountToolLoopUsage({ db: dbOk, provider, model, usage: { prompt_tokens: 1 } })).not.toThrow()
  })

  it('ignores Anthropic-style usage fields too (normalizeUsage handles both)', () => {
    const db = { logUsage: vi.fn() }
    toolLoop.accountToolLoopUsage({
      db, sessionId: 'sess-2', provider, model,
      usage: { input_tokens: 200, output_tokens: 40, cache_read_input_tokens: 100 },
    })
    const row = db.logUsage.mock.calls[0][0]
    expect(row.prompt_tokens).toBe(200)
    expect(row.completion_tokens).toBe(40)
    expect(row.cache_read_tokens).toBe(100)
  })
})