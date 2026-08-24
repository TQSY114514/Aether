// ─── toolLoop shrink-retry integration test (CodeRabbit #48 follow-up) ──────
// When the iteration budget exhausts, tryShrinkRetry (flag: agent.shrinkRetry)
// must grant ONE extension (+4 rounds) and let the loop continue instead of
// exiting. Drives the REAL runToolLoop with a scripted fake LLM — every round
// returns tool calls with UNIQUE args so neither the exact-match repeat
// detector, the semantic detector nor the guard can fire; the loop can only
// end through a budget path.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Module from 'module'

const origLoad = Module._load

let mainRounds = 0

function fakeCompleteChatMessage({ messages, options }) {
  const last = messages[messages.length - 1]
  const sawMarker = !!(last && last.role === 'system' && String(last.content).startsWith('[budget exhausted]'))
  if (!options || !options.tools) {
    // Grace wrap-up call (post-exhaustion) or plan-phase text call.
    if (sawMarker) return Promise.resolve({ content: 'SHRINK-WRAPUP-MARKER: partial done; rest remains' })
    return Promise.resolve({ content: 'plan text', tool_calls: undefined })
  }
  mainRounds += 1
  const round = messages.filter((m) => m.tool_calls && m.tool_calls.length).length
  return Promise.resolve({
    content: `working, round ${round}`,
    tool_calls: [{ function: { name: 'read_file', arguments: JSON.stringify({ path: `C:\\tmp\\sr${round}-${Date.now()}-${Math.random()}.txt` }) } }],
  })
}

function makeDb({ shrink } ) {
  return {
    getSetting: (key) => {
      if (key === 'feature_flag.agent.shrinkRetry') return shrink ? '1' : null
      return null
    },
  }
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

async function runLoop({ shrink }) {
  // Fresh module per scenario so internal single-shot state cannot leak.
  delete require.cache[require.resolve('../electron/llm/toolLoop')]
  const toolLoop = await import('../electron/llm/toolLoop')
  const statuses = []
  const res = await toolLoop.runToolLoop({
    provider: { name: 'fake-provider', api_format: 'openai', base_url: 'http://fake' },
    model: { model_name: 'fake-model' },
    messages: [{ role: 'user', content: 'do a long task' }],
    signal: new AbortController().signal,
    agentMode: 'yolo',
    maxIterations: 2,
    sessionId: 1,
    messageId: 1,
    db: makeDb({ shrink }),
    onStatus: (s) => statuses.push(s),
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
  })
  return { res, statuses }
}

describe('shrink-retry extends an exhausted iteration budget exactly once', () => {
  it('grants +4 rounds past maxIterations and emits one shrink_retry status', { timeout: 30000 }, async () => {
    mainRounds = 0
    const { res, statuses } = await runLoop({ shrink: true })
    const shrinks = statuses.filter((s) => s && s.kind === 'shrink_retry')
    expect(shrinks.length).toBe(1)
    // Retry falls through to the current pass instead of re-entering the loop
    // (re-entry would burn one of the granted iterations on consume()).
    // Baseline flag-off yields 1 executed round; +4 granted rounds land as
    // 4 additional bodies → 5 total.
    expect(mainRounds).toBe(5)
    // Budget path exits into the grace wrap-up (#43), which must survive.
    expect(String(res)).toContain('SHRINK-WRAPUP-MARKER')
  })

  it('does nothing when the agent.shrinkRetry flag is off', { timeout: 30000 }, async () => {
    mainRounds = 0
    const { statuses } = await runLoop({ shrink: false })
    expect(statuses.filter((s) => s && s.kind === 'shrink_retry').length).toBe(0)
    expect(mainRounds).toBe(1)
  })
})
