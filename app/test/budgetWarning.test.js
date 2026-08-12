// ─── Budget-warning wiring integration test (F5 evidence) ───────────────────
// Drives the REAL runToolLoop with a scripted fake LLM (providerAdapter
// intercepted via Module._load — the repo's established mock pattern, see
// toolLoop.test.js) for 14 tool rounds against maxIterations=15. Asserts the
// 80% budget_warning status event fires before budget_exhausted — the wiring
// added by plan task T9 (toolLoop.js: budget.on('budget:warning') → onStatus).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Module from 'module'

const origLoad = Module._load
const toolRoundCounts = []

// Scripted LLM: first 14 assistant turns return tool calls with DISTINCT
// signatures (cycle read_file / grep_search / list_dir with unique args and
// content — the semantic loop detector breaks on near-identical rounds), then
// a final text answer.
const TOOL_SCRIPTS = [
  (n) => ({ name: 'read_file', args: { path: `C:\\tmp\\file${n}.txt` } }),
  (n) => ({ name: 'grep_search', args: { pattern: `needle${n}`, path: 'C:\\tmp' } }),
  (n) => ({ name: 'list_dir', args: { path: `C:\\tmp\\dir${n}` } }),
]
function fakeCompleteChatMessage({ messages }) {
  const toolRounds = messages.filter((m) => m.tool_calls && m.tool_calls.length).length
  toolRoundCounts.push(toolRounds)
  if (toolRounds < 14) {
    const t = TOOL_SCRIPTS[toolRounds % 3](toolRounds)
    return Promise.resolve({
      content: `step ${toolRounds} of the budget test`,
      tool_calls: [{ function: { name: t.name, arguments: JSON.stringify(t.args) } }],
    })
  }
  return Promise.resolve({ content: 'done after 14 tool rounds', tool_calls: undefined })
}

beforeAll(() => {
  Module._load = function (request, ...args) {
    if (request.endsWith('providerAdapter')) {
      return { completeChatMessage: fakeCompleteChatMessage }
    }
    return origLoad.apply(this, [request, ...args])
  }
})

let toolLoop
beforeEach(async () => {
  toolRoundCounts.length = 0
  delete require.cache[require.resolve('../electron/llm/toolLoop')]
  toolLoop = await import('../electron/llm/toolLoop')
})

describe('runToolLoop budget warning wiring (F5)', () => {
  it('emits budget_warning at 80% of maxIterations, then budget_exhausted', { timeout: 30000 }, async () => {
    const statuses = []
    const controller = new AbortController()
    const result = await toolLoop.runToolLoop({
      provider: { name: 'fake-provider', api_format: 'openai', base_url: 'http://fake' },
      model: { model_name: 'fake-model' },
      messages: [{ role: 'user', content: 'do the thing' }],
      signal: controller.signal,
      agentMode: 'yolo',
      maxIterations: 15,
      sessionId: 1,
      messageId: 1,
      db: {},
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

    const warning = statuses.find((s) => s.kind === 'budget_warning')
    const exhausted = statuses.find((s) => s.kind === 'budget_exhausted')

    // The wiring under test: an 80% warning must arrive before exhaustion.
    expect(warning, JSON.stringify(statuses)).toBeTruthy()
    expect(warning.kind).toBe('budget_warning')
    expect(warning.text).toContain('80%')
    expect(warning.text).toContain('iterations')
    expect(exhausted, JSON.stringify(statuses)).toBeTruthy()
    expect(exhausted.kind).toBe('budget_exhausted')
    expect(statuses.indexOf(warning)).toBeLessThan(statuses.indexOf(exhausted))

    // The loop really ran ~14 tool rounds before exhausting.
    expect(toolRoundCounts.length).toBeGreaterThanOrEqual(13)
    expect(typeof result).toBe('string')
  })
})
