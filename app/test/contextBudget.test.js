// ─── contextBudget unit tests ──────────────────────────────────────────────
// T3 of the capabilities-import plan: applyTieredTruncation / pruneOlderBlock
// used msg.tool_call_id (a provider call ID like "call_xxx") as the TOOL NAME
// when looking up TOOL_TRUNCATION limits and classifying tiers — a guaranteed
// miss, making every per-tool limit dead code. The fix resolves names from
// the preceding assistant message's tool_calls entries.
import { describe, it, expect } from 'vitest'
const { applyTieredTruncation, pruneOlderBlock, buildCallIdToNameMap } = require('../electron/llm/contextBudget')

function convoWithToolResult(toolName, callId, content) {
  return [
    { role: 'user', content: 'do the thing' },
    { role: 'assistant', content: '', tool_calls: [{ id: callId, function: { name: toolName, arguments: '{}' } }] },
    { role: 'tool', tool_call_id: callId, content },
    // created_at omitted on purpose: age factor must degrade to 1, not NaN-skip
  ]
}

describe('buildCallIdToNameMap', () => {
  it('maps provider call ids back to tool names', () => {
    const map = buildCallIdToNameMap([
      { role: 'assistant', tool_calls: [{ id: 'a1', function: { name: 'read_file' } }, { id: 'a2', function: { name: 'grep_search' } }] },
      { role: 'assistant', tool_calls: [{ id: 'a3', name: 'flat_style' }] },
    ])
    expect(map.get('a1')).toBe('read_file')
    expect(map.get('a2')).toBe('grep_search')
    expect(map.get('a3')).toBe('flat_style')
  })
})

describe('applyTieredTruncation with resolved tool names', () => {
  it('applies the write_file per-tool limit (120000), spilling to disk when exceeded', () => {
    const out = applyTieredTruncation(convoWithToolResult('write_file', 'call_1', 'x'.repeat(130000)), null, null)
    const toolMsg = out.find((m) => m.role === 'tool')
    expect(toolMsg.content).toContain('[Output spilled to ')
    expect(toolMsg.content).toContain('x'.repeat(40000))
  })

  it('still truncates tool results whose assistant entry is missing (default limit 120000)', () => {
    const messages = [{ role: 'tool', tool_call_id: 'call_lost', content: 'y'.repeat(130000) }]
    const out = applyTieredTruncation(messages, null, null)
    expect(out[0].content).toContain('[Output spilled to ')
    expect(out[0].content).toContain('y'.repeat(40000))
  })

  it('leaves short results untouched', () => {
    const out = applyTieredTruncation(convoWithToolResult('write_file', 'call_1', 'ok'), null, null)
    expect(out.find((m) => m.role === 'tool').content).toBe('ok')
  })
})

describe('pruneOlderBlock shows the real tool name', () => {
  it('prunes a NOISE-tier list_dir result naming list_dir, not call_9', () => {
    const listing = Array.from({ length: 8000 }, (_, i) => `C:\\tmp\\file${i}.txt`).join('\n') // >120000 chars → NOISE
    expect(listing.length).toBeGreaterThan(120000)
    const older = convoWithToolResult('list_dir', 'call_9', listing)
    const pruned = pruneOlderBlock(older, null, null)
    const toolMsg = pruned.find((m) => m.role === 'tool')
    expect(toolMsg.content).toMatch(/^\[list_dir result pruned/)
  })

  it('never prunes short RELEVANT results', () => {
    const pruned = pruneOlderBlock(convoWithToolResult('list_dir', 'call_9', 'src/\nlib/'), null, null)
    expect(pruned.find((m) => m.role === 'tool').content).toBe('src/\nlib/')
  })
})
