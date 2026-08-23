// ─── toolLoop grace wrap-up test (capabilities-import T1) ───────────────────
// When the iteration budget exhausts mid-task, the loop used to return a
// dead-end static string. Hermes-style grace call: ONE final tools-free LLM
// call asks for a wrap-up (progress / results / what's left); any failure
// falls back to the original static string.
//
// Drives the REAL runToolLoop with a scripted fake LLM (providerAdapter
// intercepted via Module._load — the repo's established mock pattern).
// Every main-loop round returns tool calls with UNIQUE args so neither the
// exact-match round detector nor the semantic detector fires; the loop must
// exit through the budget-exhaustion fall-through, where the grace call is
// recognizable by its '[budget exhausted]' system marker and the ABSENCE of
// opts.tools.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import Module from 'module'

const origLoad = Module._load

let graceCalls = [] // { hadTools, sawMarker }
let graceShouldThrow = false

function fakeCompleteChatMessage({ messages, options }) {
  const last = messages[messages.length - 1]
  const sawMarker = !!(last && last.role === 'system' && String(last.content).startsWith('[budget exhausted]'))
  if (!options || !options.tools) {
    if (sawMarker) {
      graceCalls.push({ hadTools: false, sawMarker })
      if (graceShouldThrow) return Promise.reject(new Error('provider down'))
      return Promise.resolve({ content: 'GRACE-WRAPUP-MARKER: finished X; Y remains' })
    }
    // Plan-phase style call without tools — harmless text answer.
    return Promise.resolve({ content: 'plan text', tool_calls: undefined })
  }
  const round = messages.filter((m) => m.tool_calls && m.tool_calls.length).length
  return Promise.resolve({
    content: `working, round ${round}`,
    tool_calls: [{ function: { name: 'read_file', arguments: JSON.stringify({ path: `C:\\tmp\\f${round}-${Date.now()}.txt` }) } }],
  })
}

beforeAll(() => {
  Module._load = function (request, ...args) {
    if (request.endsWith('providerAdapter')) {
      return { completeChatMessage: fakeCompleteChatMessage }
    }
    return origLoad.apply(this, [request, ...args])
  }
})
afterAll(() => { Module._load = origLoad })

let toolLoop
beforeEach(async () => {
  graceCalls = []
  graceShouldThrow = false
  delete require.cache[require.resolve('../electron/llm/toolLoop')]
  toolLoop = await import('../electron/llm/toolLoop')
})

async function runToExhaustion(extra = {}) {
  return toolLoop.runToolLoop({
    provider: { name: 'fake-provider', api_format: 'openai', base_url: 'http://fake' },
    model: { model_name: 'fake-model' },
    messages: [{ role: 'user', content: 'do a long task' }],
    signal: new AbortController().signal,
    agentMode: 'yolo',
    maxIterations: 3,
    sessionId: 1,
    messageId: 1,
    db: {},
    onStatus: () => {},
    onToolCall: () => {},
    onPlanStep: () => {},
    onTodoUpdate: () => {},
    onThinkingStart: () => {},
    onThinkingEnd: () => {},
    onThinkingDelta: () => {},
    requestPermission: async () => true,
    onAskUser: async () => '[]',
    onAudit: () => {},
    onStream: () => {},
    ...extra,
  })
}

describe('runToolLoop grace wrap-up on budget exhaustion', () => {
  it('appends the wrap-up answer from a tools-free final call', { timeout: 30000 }, async () => {
    const result = await runToExhaustion()
    expect(result).toContain('已达到最大迭代次数')
    expect(result).toContain('GRACE-WRAPUP-MARKER')
    expect(graceCalls).toHaveLength(1)
    expect(graceCalls[0].sawMarker).toBe(true)
  })

  it('grace call carries no tools so the model cannot call any', { timeout: 30000 }, async () => {
    await runToExhaustion()
    // The fake only records a grace call when options.tools is absent —
    // reaching here with exactly one grace call proves the contract.
    expect(graceCalls).toHaveLength(1)
    expect(graceCalls[0].hadTools).toBe(false)
  })

  it('strips caller tools/tool_choice from the grace call', { timeout: 30000 }, async () => {
    // Regression (CodeRabbit #43 follow-up): real callers pass their tool
    // payload via options — forwarding it would let the provider answer the
    // "tools-free" wrap-up with yet another tool call. With tools still
    // forwarded, the fake misreads the grace call as a main-loop round and
    // GRACE-WRAPUP-MARKER never appears.
    const result = await runToExhaustion({
      options: {
        tools: [{ type: 'function', function: { name: 'read_file', arguments: '{}' } }],
        tool_choice: 'auto',
      },
    })
    expect(result).toContain('已达到最大迭代次数')
    expect(result).toContain('GRACE-WRAPUP-MARKER')
    expect(graceCalls).toHaveLength(1)
    expect(graceCalls[0].sawMarker).toBe(true)
  })

  it('falls back to the static string when the grace call fails', { timeout: 30000 }, async () => {
    graceShouldThrow = true
    const result = await runToExhaustion()
    expect(result).toContain('已达到最大迭代次数')
    expect(result).not.toContain('GRACE-WRAPUP-MARKER')
  })
})
