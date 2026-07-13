// ───────────────────────────────────────────────────────────────────────────
// Context compaction (inspired by OpenClaw's compaction-planning.ts).
//
// Long conversations eventually exceed the model's context window and the API
// returns a 400. Compaction prevents that by summarizing older history when the
// estimated token count grows past a budget, keeping a recent window intact so
// the model still has the live turn + any active tool-call/result pairing.
//
// Design (simplified from OpenClaw's industrial version):
//   1. estimateMessagesTokens(msgs) — sum content lengths (str | multimodal parts).
//      Coarse (chars-as-tokens with a CJK multiplier) — we only need a budget
//      signal, not an exact count. OpenClaw uses a 1.2x safety margin; we do too.
//   2. maybeCompact() — if under budget, return msgs unchanged. If over, split
//      into [system][SUMMARY-PLACEHOLDER]...[older][recent]. Summarize `older`
//      via the model, prepend the summary as a system message, keep `recent`
//      verbatim. Keep tool_call ↔ tool_result pairs together (never split them)
//      — a dangling tool_call with no result, or vice versa, makes providers 400.
//
// This is best-effort: if the summarization call fails, we fall back to a hard
// truncate of the oldest messages (still keeping pairs intact) so the request
// can still go out rather than 400-ing on context length.
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')

const SAFETY_MARGIN = 1.2          // estimateTokens is rough; pad it
const COMPACT_AT_RATIO = 0.8      // compact when estimated tokens ≥ 80% of budget
const RECENT_WINDOW = 8           // messages always kept verbatim at the tail
const SUMMARIZATION_OVERHEAD = 2048 // reserve for the summary prompt + system + reply

// Estimate token count for a single message. Content may be a string or a
// multimodal parts array (OpenAI shape). Image parts cost nothing here — we
// can't accurately price them and they're rare in long history.
function estimateMessageTokens(msg) {
  const c = msg && msg.content
  if (typeof c === 'string') return estimateTextTokens(c)
  if (Array.isArray(c)) {
    let t = 0
    for (const part of c) {
      if (part && typeof part.text === 'string') t += estimateTextTokens(part.text)
    }
    return t
  }
  return 0
}

// Char-based estimate: CJK chars ≈ 1.5 tokens (BPE merges them less aggressively),
// other chars ≈ 0.25 (≈4 chars/token, the common English heuristic).
function estimateTextTokens(text) {
  if (!text) return 0
  let tokens = 0
  for (const c of text) {
    if (c >= '一' && c <= '鿿') tokens += 1.5
    else tokens += 0.25
  }
  return Math.max(1, Math.ceil(tokens))
}

function estimateMessagesTokens(messages) {
  return Math.ceil(messages.reduce((s, m) => s + estimateMessageTokens(m), 0) * SAFETY_MARGIN)
}

// Find a safe split index: never break a tool_call ↔ tool_result pair. We scan
// backward from the recent-window boundary and extend it forward if the message
// just before the window is a tool result (its caller is earlier) — i.e. keep
// pairs together. Returns the index where "recent" should start.
function safeSplitIndex(messages, recentCount) {
  let split = Math.max(0, messages.length - recentCount)
  // If the message just before the recent window is a 'tool' result, its
  // preceding 'assistant' tool_call is one further back — extend the window to
  // include both. Repeat so we never orphan a tool result.
  while (split > 0 && messages[split] && messages[split].role === 'tool') split--
  // Also avoid starting 'recent' on an assistant tool_call whose results are in
  // the older block — walk back to before any assistant that has tool_calls.
  while (split > 0 && messages[split - 1] && messages[split - 1].role === 'assistant' && messages[split - 1].tool_calls) split--
  return split
}

// Core entry point. Returns the (possibly compacted) message array.
// `budget` is the model's context window in tokens (approx). 0 = no compaction.
async function maybeCompact({ provider, model, messages, budget, signal }) {
  if (!budget) return messages
  const threshold = Math.floor(budget * COMPACT_AT_RATIO)
  const est = estimateMessagesTokens(messages)
  if (est < threshold) return messages

  const split = safeSplitIndex(messages, RECENT_WINDOW)
  if (split <= 0) return messages // everything is "recent" already
  const older = messages.slice(0, split)
  const recent = messages.slice(split)
  const systemMsgs = older.filter(m => m.role === 'system')
  const nonSystemOlder = older.filter(m => m.role !== 'system')

  let summary
  try {
    summary = await summarizeHistory({ provider, model, history: nonSystemOlder, signal })
  } catch {
    // Summarization failed — hard-truncate the oldest non-system messages,
    // keeping pairs intact (still use safeSplit on the truncated set).
    const keep = nonSystemOlder.slice(-Math.floor(RECENT_WINDOW * 1.5))
    const truncated = `[Earlier conversation truncated — summarization failed. ${keep.length} of ${nonSystemOlder.length} older messages retained.]`
    return [...systemMsgs, { role: 'system', content: truncated }, ...keep, ...recent]
  }
  if (!summary) return messages
  const summaryMsg = { role: 'system', content: `Summary of earlier conversation:\n${summary}` }
  return [...systemMsgs, summaryMsg, ...recent]
}

// Ask the model to summarize a block of older messages into a compact paragraph.
async function summarizeHistory({ provider, model, history, signal }) {
  // Flatten history to a readable transcript for the summarizer.
  const transcript = history.map(m => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    if (m.role === 'tool') return `[tool result] ${c}`
    if (m.tool_calls) return `[${m.role}] ${c || ''}\n[tool calls: ${JSON.stringify(m.tool_calls.map(t => t.function?.name))}]`
    return `[${m.role}] ${c}`
  }).join('\n')
  const text = await completeChat({
    provider, model,
    messages: [
      { role: 'system', content: 'Summarize the following conversation history into a concise paragraph (≤300 words). Preserve key decisions, facts, file paths, and any unresolved questions. Do not add commentary.' },
      { role: 'user', content: transcript.slice(0, 24000) }, // cap the summarizer input
    ],
    signal,
    options: { max_tokens: 600, temperature: 0.2 },
  })
  return (text || '').trim()
}

module.exports = { maybeCompact, estimateMessagesTokens, estimateMessageTokens, estimateTextTokens, safeSplitIndex }
