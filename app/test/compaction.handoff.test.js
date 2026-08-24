// ─── Compaction handoff-prefix test (capabilities-import T2) ────────────────
// The summary system message must explicitly tell the model that compaction
// happened ([context compaction] prefix), that raw tool outputs were pruned,
// and where to resume — aider/opencode handoff framing. Separate file because
// compaction.js destructures completeChat from providerAdapter at module load;
// Module._load must be patched BEFORE the first require in this worker.
import { describe, it, expect, afterAll } from 'vitest'
import Module from 'module'

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === './providerAdapter' || request.endsWith('providerAdapter')) {
    return { completeChat: async () => 'Goal: probe the loop. Next Steps: rerun the failing suite.' }
  }
  return origLoad.apply(this, arguments)
}
afterAll(() => { Module._load = origLoad })

const { maybeCompact } = require('../electron/llm/compaction')

describe('maybeCompact handoff prefix on the summary message', () => {
  it('prefixes the summary system message with [context compaction]', async () => {
    // budget=8000 → keep-tail target 4000 raw tokens → last 4 msgs kept,
    // older block summarized by the intercepted completeChat above.
    const big = 'a'.repeat(4000) // ~1000 raw tokens
    const messages = [
      { role: 'system', content: 'sys prompt' },
      ...Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: big })),
    ]
    const out = await maybeCompact({ provider: null, model: null, messages, budget: 8000 })
    expect(out.length).toBeLessThan(messages.length)
    const summaryMsg = out.find((m) => m.role === 'system' && m !== messages[0])
    expect(summaryMsg).toBeTruthy()
    expect(summaryMsg.content.startsWith('[context compaction]')).toBe(true)
    expect(summaryMsg.content).toContain('Summary of earlier conversation:')
    expect(summaryMsg.content).toContain('Next Steps: rerun the failing suite.')
  })

  it('leaves small conversations untouched (below threshold)', async () => {
    const messages = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
    const out = await maybeCompact({ provider: null, model: null, messages, budget: 8000 })
    expect(out).toEqual(messages)
  })
})
