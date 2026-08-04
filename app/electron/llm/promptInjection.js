// ───────────────────────────────────────────────────────────────────────────
// Prompt-injection defense for external (web) content.
//
// web_fetch / web_search return untrusted content from the public web. A
// malicious page or result can embed instructions that try to hijack the
// model ("ignore previous instructions", "now you are the admin", …). This
// module is a defense-in-depth layer that runs AFTER a tool returns and
// BEFORE the result reaches the model — it is wired into the tool-result
// middleware chain (toolResultMiddleware.js) and is never bypassed.
//
// Responsibilities:
//   - Detect external content (either by the producing tool, or by the
//     EXTERNAL marker the tool prepends to its output).
//   - Strip known prompt-injection instruction patterns.
//   - Truncate external content to a small cap (smaller attack surface).
//   - Re-wrap external content in an <external>…</external> marker so the
//     model can tell untrusted data from instructions.
//
// The original external marker is preserved in the tool-result cache (the
// cache stores the raw tool output), so every injection re-detects and
// re-sanitizes — a cached result is never trusted blindly.
// ───────────────────────────────────────────────────────────────────────────

// Tools that produce untrusted external content.
const EXTERNAL_TOOLS = new Set(['web_fetch', 'web_search'])

// Markers the external tools prepend to their output (kept in the cache). These
// are stripped and replaced by the canonical <external> wrapper on injection.
const EXTERNAL_MARKERS = ['<!-- EXTERNAL_WEB_FETCH -->', '<!-- EXTERNAL_WEB_SEARCH -->']

// Cap on external content length after sanitization — smaller than the general
// tool-result cap (16000) to shrink the injection surface.
const MAX_EXTERNAL_CHARS = 8000

// Known prompt-injection instruction patterns. Each has a case-insensitive,
// word-boundary-guarded regex and a short label used only for debugging. Matches
// are stripped from external content. The label is not user-visible.
const INJECTION_PATTERNS = [
  { label: 'ignore-previous', re: /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+instructions?\b/gi },
  { label: 'disregard-previous', re: /\bdisregard\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+instructions?\b/gi },
  { label: 'forget-previous', re: /\bforget\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+instructions?\b/gi },
  { label: 'system-prompt', re: /\b(?:your|the|my)\s+system\s+prompt\b/gi },
  { label: 'my-instructions', re: /\b(?:your|the)\s+instructions?\s+(?:are|should|must)\b/gi },
  { label: 'now-you-are', re: /\bnow\s+you\s+are\b/gi },
  { label: 'you-are-now', re: /\byou\s+are\s+now\b/gi },
  { label: 'new-role', re: /\b(?:from\s+now\s+on|henceforth)\s+you\s+are\b/gi },
  { label: 'reveal-prompt', re: /\b(?:reveal|show|tell|print|output|display)\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?prompt\b/gi },
  { label: 'override', re: /\boverride\s+(?:your\s+)?(?:instructions?|system\s+prompt)\b/gi },
  { label: 'do-not-follow', re: /\bdo\s+not\s+follow\s+(?:the\s+)?(?:instructions?|commands?|rules?)\s+above\b/gi },
]

// Strip the known instruction patterns out of a string. Returns the cleaned text.
function stripInjectionPatterns(content) {
  if (typeof content !== 'string') return String(content ?? '')
  let out = content
  for (const { re } of INJECTION_PATTERNS) {
    out = out.replace(re, ' ')
  }
  // Collapse runs of whitespace left behind by removals.
  return out.replace(/\s{3,}/g, '  ').trim()
}

// Truncate a string to maxChars, keeping a short tail-notice.
function truncateExternal(content, maxChars = MAX_EXTERNAL_CHARS) {
  if (typeof content !== 'string') content = String(content ?? '')
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + `\n\n[… external content truncated: ${content.length - maxChars} chars omitted …]`
}

// Detect whether content is external (untrusted web) — either by the producing
// tool being in EXTERNAL_TOOLS, or by the content carrying an EXTERNAL marker.
function isExternal(content, toolName) {
  if (EXTERNAL_TOOLS.has(toolName)) return true
  if (typeof content === 'string' && EXTERNAL_MARKERS.some(m => content.includes(m))) return true
  return false
}

// Full pipeline for external content: strip markers → strip injection patterns →
// truncate → re-wrap in <external>…</external>. Non-external content is returned
// untouched.
function sanitizeExternal(content, opts = {}) {
  const toolName = opts.tool
  if (!isExternal(content, toolName)) return content
  let body = String(content ?? '')
  // Drop the raw external markers (we re-apply our own canonical wrapper below).
  for (const m of EXTERNAL_MARKERS) body = body.split(m).join('')
  body = stripInjectionPatterns(body)
  body = truncateExternal(body, opts.maxChars || MAX_EXTERNAL_CHARS)
  return `<external>\n${body}\n</external>`
}

// Middleware for the tool-result chain. Chain-safe: never throws, and non-external
// content passes through unchanged.
function externalInjectionMiddleware(content, ctx) {
  try {
    return sanitizeExternal(content, { tool: ctx?.tool, maxChars: ctx?.maxExternalChars })
  } catch {
    return content
  }
}

module.exports = {
  EXTERNAL_TOOLS, EXTERNAL_MARKERS, MAX_EXTERNAL_CHARS, INJECTION_PATTERNS,
  stripInjectionPatterns, truncateExternal, isExternal, sanitizeExternal, externalInjectionMiddleware,
}