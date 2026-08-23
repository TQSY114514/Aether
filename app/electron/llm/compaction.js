// ───────────────────────────────────────────────────────────────────────────
// Context compaction (inspired by OpenClaw's compaction-planning.ts).
//
// Long conversations eventually exceed the model's context window and the API
// returns a 400. Compaction prevents that by summarizing older history when the
// estimated token count grows past a budget, keeping a recent window intact so
// the model still has the live turn + any active tool-call/result pairing.
//
// Design:
//   1. estimateMessagesTokens(msgs) — uses js-tiktoken for OpenAI models
//      (exact cl100k_base count) and falls back to a char-based estimate for
//      Anthropic / unknown providers. We still apply a 1.2x safety margin.
//   2. maybeCompact() — if under budget, return msgs unchanged. If over, split
//      into [system][SUMMARY-PLACEHOLDER]...[older][recent]. Summarize `older`
//      via the model, prepend the summary as a system message, keep `recent`
//      verbatim. Keep tool_call ↔ tool_result pairs together (never split them)
//      — a dangling tool_call with no result, or vice versa, makes providers 400.
//   3. INCREMENTAL compaction: tracks the last compaction boundary per session.
//      On subsequent compactions, only summarizes NEW messages since the last
//      boundary, prepending the new summary to the existing one. This avoids
//      re-summarizing the same content repeatedly, saving API calls and latency.
//   4. SMART retention: messages flagged as important (file edits, user decisions,
//      tool results with high-impact content) are kept verbatim even if they fall
//      in the older block, preserving critical context.
//
// This is best-effort: if the summarization call fails, we fall back to a hard
// truncate of the oldest messages (still keeping pairs intact) so the request
// can still go out rather than 400-ing on context length.
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')
const hooks = require('./hooks')
const tokenizer = require('./tokenizer')
const { pruneOlderBlock, applyTieredTruncation } = require('./contextBudget')

const SAFETY_MARGIN = 1.2          // estimateTokens is rough; pad it
const COMPACT_AT_RATIO = 0.8      // compact when estimated tokens ≥ 80% of budget
// Keep-recent tail sizing. Sources: OpenClaw keeps 20000 tokens by default;
// OpenCode clamps usable*25% into 2000..15000. We take the conservative
// intersection shape: 25% of budget, floored at 4000, capped at 20000.
const KEEP_RECENT_TOKENS_DEFAULT = 20000
const MIN_KEEP_TOKENS = 4000
const KEEP_TAIL_BUDGET_SHARE = 0.25

// Token-budgeted keep-tail: accumulate from the tail until the target is
// reached, then let safeSplitIndex back off to the nearest legal cut point
// (never orphaning a tool-call/tool-result pair).
function findKeepPoint(messages, budget) {
  const b = budget || 0
  // Keep-tail must leave room for the summary itself: tail + overhead has to
  // fit inside the budget, otherwise small-budget compaction can never bring
  // the context under its limit. The 4000-token floor only applies while
  // there is room for it. SUMMARIZATION_OVERHEAD is declared below; this is
  // safe because findKeepPoint runs after module init.
  // Divide by 1.2: maybeCompact measures with estimateMessagesTokens, which
  // pads raw estimates with a 1.2x safety margin — align raw targets so the
  // margin'd accounting still fits.
  const headroom = Math.max(0, Math.floor((b - SUMMARIZATION_OVERHEAD) / 1.2))
  // Hard-cap the target at headroom BEFORE accumulating: with a post-add
  // break, one oversized tail message can overshoot and push
  // tail*1.2 + overhead above the budget (CodeRabbit r2).
  let target = Math.min(
    KEEP_RECENT_TOKENS_DEFAULT,
    Math.max(Math.min(MIN_KEEP_TOKENS, headroom), Math.floor(b * KEEP_TAIL_BUDGET_SHARE))
  )
  if (target > headroom) target = headroom
  let acc = 0
  let count = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateMessageTokens(messages[i])
    // Pre-check BEFORE adding: never let the newest message alone exceed the
    // target — count stays >= 1 so the tail is never empty.
    if (count > 0 && acc + t > target) break
    acc += t
    count++
    if (acc >= target) break
  }
  if (count > messages.length) count = messages.length
  return safeSplitIndex(messages, count)
}

const SUMMARIZATION_OVERHEAD = 2048 // reserve for the summary prompt + system + reply
const SUMMARIZATION_TIMEOUT_MS = 15000 // guard timeout for the summarization HTTP call
const FETCH_CONNECT_TIMEOUT_MS = 3000   // short guard: reject before the test framework times out

// ── Incremental compaction state ──────────────────────────────────────────
// Keyed by sessionId. Tracks the last compaction boundary so subsequent
// compactions only summarize new messages, reusing the existing summary.
// P0: persisted via compactionStore (memory L1 + sqlite L2, silent degrade) —
// survives app restarts so the first post-restart compaction stays incremental.
const { defaultStore: compactionState } = require('./compactionStore')

// ── Smart retention: which tool names indicate high-impact actions ────────
const HIGH_IMPACT_TOOLS = new Set([
  'write_file', 'edit_file', 'apply_patch', 'delete_file',
  'run_command', 'exec', 'delegate_task',
])

// Check if a message is "important" and should be kept verbatim.
function isImportantMessage(msg) {
  if (!msg) return false
  // User messages are always important (they contain decisions/feedback)
  if (msg.role === 'user') return true
  // Assistant messages with high-impact tool calls
  if (msg.role === 'assistant' && msg.tool_calls) {
    return msg.tool_calls.some(tc => {
      const name = (tc.function && tc.function.name) || ''
      return HIGH_IMPACT_TOOLS.has(name)
    })
  }
  // Tool results from high-impact calls (substantial content)
  if (msg.role === 'tool' && msg.tool_call_id) {
    const c = typeof msg.content === 'string' ? msg.content : ''
    return c.length > 200
  }
  return false
}

// Estimate token count for a single message. Content may be a string or a
// multimodal parts array (OpenAI shape). Image parts cost nothing here — we
// can't accurately price them and they're rare in long history.
function estimateMessageTokens(msg, provider, model) {
  const c = msg && msg.content
  if (typeof c === 'string') return tokenizer.countTokens(c, provider, model)
  if (Array.isArray(c)) {
    let t = 0
    for (const part of c) {
      if (part && typeof part.text === 'string') t += tokenizer.countTokens(part.text, provider, model)
    }
    return t
  }
  return 0
}

// Char-based estimate: CJK chars ≈ 1.5 tokens (BPE merges them less aggressively),
// other chars ≈ 0.25 (≈4 chars/token, the common English heuristic).
// Kept as a standalone fallback for callers that don't have a provider/model.
function estimateTextTokens(text) {
  if (!text) return 0
  let tokens = 0
  for (const c of text) {
    const code = c.codePointAt(0)
    // CJK Unified Ideographs (Basic + Ext A/B + Ext G) + Kana + Hangul
    if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)) tokens += 1.5
    else tokens += 0.25
  }
  return Math.max(1, Math.ceil(tokens))
}

function estimateMessagesTokens(messages, provider, model) {
  return Math.ceil(messages.reduce((s, m) => s + estimateMessageTokens(m, provider, model), 0) * SAFETY_MARGIN)
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
async function maybeCompact({ provider, model, messages, budget, signal, sessionId, force = false }) {
  if (!budget) return messages
  const threshold = Math.floor(budget * COMPACT_AT_RATIO)
  const est = estimateMessagesTokens(messages, provider, model)
  // force=true（溢出自愈重试）跳过比例门槛直接压。
  if (!force && est < threshold) return messages

  // Hooks: PreCompact — allow blocking or modification.
  let ctx = { provider, model, messages, budget, est, threshold, sessionId }
  try { await hooks.runHooks('PreCompact', ctx) } catch (e) {
    return messages // hook blocked compaction
  }

  const prev = sessionId ? compactionState.get(sessionId) : null
  const split = findKeepPoint(messages, budget)
  if (split <= 0) return force ? null : messages // force：无可压 → null（防死循环）
  // 配对回退复核（仅 force）：safeSplitIndex 为避免孤儿 tool 结果会向前扩窗，
  // 可能把超大 assistant(tool_calls)+tool 对拉回保留窗。自愈重试必须保证
  // 压缩产物真能降到预算下——装不下就返回 null 让上层放弃而非无限重试。
  // 非 force 不做此检查：常规压缩宁可略超预算也不能躺平不压。
  if (force) {
    const keptTokens = estimateMessagesTokens(messages.slice(split))
    if (keptTokens * SAFETY_MARGIN + SUMMARIZATION_OVERHEAD > budget) {
      return null
    }
  }

  // ── Smart retention: pull important messages from the older block ──────
  const older = messages.slice(0, split)
  const recent = messages.slice(split)
  const systemMsgs = older.filter(m => m.role === 'system')
  let nonSystemOlder = older.filter(m => m.role !== 'system')

  // Identify important messages in the older block and move them to recent
  const important = []
  const rest = []
  for (const m of nonSystemOlder) {
    if (isImportantMessage(m)) important.push(m)
    else rest.push(m)
  }
  // If we found important messages, keep them with the recent block
  if (important.length > 0) {
    nonSystemOlder = rest
    recent.unshift(...important)
  }

  // ── Context Budget: prune low-value tool results from older block ────────
  // Before summarization, replace verbose tool results (NOISE tier) with
  // one-line summaries to free up tokens for the actual conversation.
  nonSystemOlder = pruneOlderBlock(nonSystemOlder, provider, model)

  // ── Incremental compaction: only summarize new messages ─────────────────
  let summary
  if (prev && prev.summary && nonSystemOlder.length > 0) {
    // Only summarize messages added since the last compaction boundary
    const newSinceLast = nonSystemOlder.slice(prev.splitIndex)
    const alreadySummarized = nonSystemOlder.slice(0, prev.splitIndex)
    if (newSinceLast.length > 0 && alreadySummarized.length > 0) {
      try {
        // UPDATE 滚动合并：把上一版摘要交给模型，在它基础上并入增量段落，
        // 摘要永远只有一份最新六段结构版本（替代 [Later] 字符串拼接）。
        const newSummary = await summarizeHistory({ provider, model, history: newSinceLast, signal, prevSummary: prev.summary })
        if (newSummary) {
          summary = newSummary
        }
      } catch {
        // Fall through to full summarization
      }
    }
  }

  // Full summarization if incremental didn't produce a result
  if (!summary) {
    try {
      summary = await summarizeHistory({ provider, model, history: nonSystemOlder, signal })
    } catch {
      const fallbackSplit = findKeepPoint(nonSystemOlder, budget)
      const keep = nonSystemOlder.slice(fallbackSplit)
      const dropped = fallbackSplit
      const note = dropped > 0 ? ` (${dropped} orphaned messages dropped to preserve tool pairs)` : ''
      const truncated = `[Earlier conversation truncated — summarization failed. ${keep.length} of ${nonSystemOlder.length} older messages retained.${note}]`
      const fbResult = [...systemMsgs, { role: 'system', content: truncated }, ...keep, ...recent]
      // force 语义同样适用于 fallback 路径：压完反而更多 = 无可压，返回 null。
      if (force && fbResult.length >= messages.length) return null
      return fbResult
    }
  }

  if (!summary) return messages

  // Update compaction state for next incremental run
  if (sessionId) {
    compactionState.set(sessionId, nonSystemOlder.length, summary)
  }

  // Aider/opencode-style handoff framing: tell the model explicitly that
  // compaction happened, what was lost, and where to resume — otherwise the
  // summary reads as ordinary context and pruned tool outputs look "missing".
  const COMPACTION_HANDOFF_PREFIX =
    '[context compaction] Earlier messages were summarized to fit the context window. ' +
    'Their raw tool outputs were pruned and file contents mentioned in the summary may be stale — re-read files before editing. Resume from "Next Steps".'
  const summaryMsg = { role: 'system', content: `${COMPACTION_HANDOFF_PREFIX}\n\nSummary of earlier conversation:\n${summary}` }
  const result = [...systemMsgs, summaryMsg, ...recent]
  // force 语义：压完没变小 = 无可压，返回 null 让调用方放弃（防死循环）。
  if (force && result.length >= messages.length) return null

  // Hooks: PostCompact
  try { await hooks.runHooks('PostCompact', { ...ctx, summary, olderCount: older.length, recentCount: recent.length }) } catch {}

  return result
}

// Ask the model to summarize a block of older messages into a compact paragraph.
// Identifier-preservation instructions (from OpenClaw's compaction-instructions):
// UUIDs, hashes, IDs, paths, URLs, IPs, ports must survive verbatim so the
// agent can still act on them after compaction. Summarize in the conversation's
// primary language.
// Six-section structured summary (OpenClaw SUMMARIZATION_PROMPT shape).
// Fixed headings keep summaries diffable across rolls; UPDATE mode merges
// into the previous summary instead of concatenating "[Later]" blocks,
// which drifted structurally after several rounds.
const SUMMARY_SECTIONS = ['Goal', 'Constraints', 'Progress', 'Key Decisions', 'Next Steps', 'Critical Context']

const _SUMMARY_RULES =
  '规则：总长 ≤300 词；Progress 用 "- [x]"/"- [ ]" 复选框；UUID、哈希、文件路径、命令、报错关键字等标识符必须逐字保留，不得意译；不确定的内容不写。'

function buildSummarizePrompt(prevSummary, chunkText) {
  const header = `你是会话压缩器。将给定对话内容压缩为以下 ${SUMMARY_SECTIONS.length} 个 Markdown 段落，标题逐字使用：\n` +
    SUMMARY_SECTIONS.map(s => `## ${s}`).join('\n') + `\n${_SUMMARY_RULES}`
  if (!prevSummary) {
    return `${header}\n\n<conversation>\n${chunkText}\n</conversation>`
  }
  return `${header}

已有本会话更早前缀的上一版摘要。不要从零重写：在其基础上滚动更新——仍相关的条目保留、Progress 复选框按新进展更新、新信息并入对应段落、已不再相关的内容删除。输出合并后的完整新版本（仍是同样的六段结构）。

<previous_summary>
${prevSummary}
</previous_summary>

<new_conversation_segment>
${chunkText}
</new_conversation_segment>`
}

async function summarizeHistory({ provider, model, history, signal, prevSummary }) {
  // Drop non-conversational noise (empty tool results, silent assistant turns)
  // so the summary budget goes to real content.
  const realHistory = history.filter(m => {
    const c = typeof m.content === 'string' ? m.content : ''
    return c.trim().length > 0
  })
  if (realHistory.length === 0) return ''
  const transcript = realHistory.map(m => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    if (m.role === 'tool') return `[tool result] ${c}`
    if (m.tool_calls) return `[${m.role}] ${c || ''}\n[tool calls: ${JSON.stringify(m.tool_calls.map(t => t.function?.name))}]`
    return `[${m.role}] ${c}`
  }).join('\n')
  // Guard against hanging forever when the provider is unreachable (e.g. tests).
  const ctrl = new AbortController()
  const guard = setTimeout(() => ctrl.abort(), SUMMARIZATION_TIMEOUT_MS)
  const fetchPromise = completeChat({
    provider, model,
    messages: [
      { role: 'user', content: buildSummarizePrompt(prevSummary || null, transcript.slice(0, 24000)) },
    ],
    signal: ctrl.signal,
    options: { max_tokens: 900, temperature: 0.2 },
  })
  let text
  try {
    text = await Promise.race([
      fetchPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('summarize fetch timeout')), FETCH_CONNECT_TIMEOUT_MS)),
    ])
    clearTimeout(guard)
  } catch (e) {
    clearTimeout(guard)
    throw e
  }
  return (text || '').trim()
}

// Clear compaction state for a session (e.g., when session is deleted).
function clearCompactionState(sessionId) {
  if (sessionId) compactionState.clear(sessionId)
}

module.exports = { maybeCompact, estimateMessagesTokens, estimateMessageTokens, estimateTextTokens, safeSplitIndex, findKeepPoint, buildSummarizePrompt, clearCompactionState, applyTieredTruncation }