// ───────────────────────────────────────────────────────────────────────────
// Tool-result middleware (inspired by OpenClaw's agent-tool-result-middleware).
//
// Each tool's raw result is passed through a chain of middlewares BEFORE it is
// appended to the conversation and sent back to the model. Middlewares can:
//   - truncate over-long output (so one verbose tool doesn't blow the context)
//   - redact secrets (API keys, bearer tokens) so they never reach the model
//   - log tool activity for debugging
//
// A middleware is (content, ctx) -> content (string in, string out). They run
// in order; the final string is what the model sees as the tool result.
//
// Middlewares are pure transformations — they must NOT mutate args or have
// side effects beyond logging. A middleware that throws is skipped (its input
// passes through unchanged) so one bad middleware can't break the tool loop.
// ───────────────────────────────────────────────────────────────────────────

const MAX_TOOL_RESULT_CHARS = 16000 // cap a single tool result ~16k chars

// Truncate a single tool result so one verbose tool (e.g. reading a huge file,
// or a web_search that dumped a page) can't dominate the context window.
function truncateMiddleware(content) {
  if (typeof content !== 'string') content = String(content ?? '')
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content
  const head = content.slice(0, MAX_TOOL_RESULT_CHARS)
  return head + `\n\n[… truncated ${content.length - MAX_TOOL_RESULT_CHARS} chars …]`
}

// Redact things that look like secrets before the model ever sees them. Catches
// the common shapes: sk-... (OpenAI), Bearer xxx, long hex/base64 token runs
// labeled as keys/tokens. Best-effort, not a security boundary — dangerous tools
// are still gated by the permission model; this is defense-in-depth.
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_\-]{20,}/g,                         // OpenAI-style keys
  /Bearer\s+[A-Za-z0-9_\-\.]{20,}/gi,                  // bearer tokens
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}["']?/gi,
]
function redactMiddleware(content) {
  if (typeof content !== 'string') content = String(content ?? '')
  let redacted = content
  for (const re of SECRET_PATTERNS) {
    redacted = redacted.replace(re, (m) => {
      // keep the label (e.g. "api_key=") visible, mask the value
      const eq = m.indexOf('=')
      const colon = m.indexOf(':')
      const cut = Math.max(eq, colon)
      if (cut >= 0) return m.slice(0, cut + 1) + '[REDACTED]'
      return '[REDACTED]'
    })
  }
  return redacted
}

// Ordered chain. Order matters: redact first (so truncated tails don't hide a
// secret split across the cut), then truncate, then log.
const CHAIN = [redactMiddleware, truncateMiddleware]

function applyMiddleware(content, ctx) {
  let out = content
  for (const mw of CHAIN) {
    try { out = mw(out, ctx) } catch { /* skip a failing middleware */ }
  }
  return out
}

module.exports = { applyMiddleware, truncateMiddleware, redactMiddleware, MAX_TOOL_RESULT_CHARS }
