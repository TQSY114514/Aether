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

  const HEAD_CHARS = 4000
  const TAIL_CHARS = 6000
  const head = content.slice(0, HEAD_CHARS)
  const tail = content.slice(-TAIL_CHARS)
  const middle = content.slice(HEAD_CHARS, content.length - TAIL_CHARS)

  // Scan middle chunk for error / failure signals so critical stack traces are not lost
  const errorLines = []
  const lines = middle.split('\n')
  const ERROR_RE = /(?:error|fail|exception|fatal|panic|cannot|syntaxerror|typeerror|uncaught|reject|warn)/i
  let collectedChars = 0
  const MAX_EXTRACTED_ERROR_CHARS = 3000

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (ERROR_RE.test(line)) {
      const snippet = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join('\n')
      if (collectedChars + snippet.length <= MAX_EXTRACTED_ERROR_CHARS) {
        errorLines.push(snippet)
        collectedChars += snippet.length
        i += 1
      }
    }
    if (collectedChars >= MAX_EXTRACTED_ERROR_CHARS) break
  }

  const omittedChars = content.length - (head.length + tail.length + collectedChars)
  let middleSummary = `\n\n[… truncated ${omittedChars > 0 ? omittedChars : 0} chars from middle …]\n`
  if (errorLines.length > 0) {
    middleSummary += `[Extracted key error lines from middle]:\n${errorLines.join('\n---\n')}\n[… continuing to output tail …]\n\n`
  }

  return head + middleSummary + tail
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

// Whole-match secrets（P1-H1 扩充）——整段替换为 [REDACTED]，不做"保留标签"
// 拆分：PEM 块体内可能含 '='（base64 padding），若走标签保留逻辑会把
// '=' 之前的私钥材料原样留下。必须先于 SECRET_PATTERNS 运行，否则
// "token: eyJxxx.yyy.zzz" 会被标签匹配只吃掉 header 段而泄露签名。
const SECRET_WHOLE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, // PEM 私钥块
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}/g,                    // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/g,                                                      // AWS access key id
  /\bsk-ant-[A-Za-z0-9_\-]{16,}/g,                                              // Anthropic keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,         // 完整 JWT（三段）
  /\beyJ[A-Za-z0-9_-]{20,}\b/g,                                                 // 裸 JWT header / 长 eyJ 串
]
function redactMiddleware(content) {
  if (typeof content !== 'string') content = String(content ?? '')
  let redacted = content
  // Pass 1: whole-match secrets（先整段吃掉，防止后续标签匹配截出半截泄露）。
  for (const re of SECRET_WHOLE_PATTERNS) {
    redacted = redacted.replace(re, '[REDACTED]')
  }
  // Pass 2: label-preserving secrets（保留 "api_key=" 之类的标签前缀）。
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

// Prompt-injection defense for external (web) content. Added to the chain so
// untrusted web_fetch/web_search results are scrubbed before reaching the model.
const { externalInjectionMiddleware, EXTERNAL_TOOLS, EXTERNAL_MARKERS } = require('./promptInjection')

// ─── External 判定重构（spec H4）─────────────────────────────────────────────
// 与 web_fetch 相同的 <external> 包裹+注入剥离+8000 上限，扩展到：
//   1. EXTERNAL_TOOLS 列表内的工具（promptInjection.js 维护，含 web_fetch/
//      web_search，且正在扩充 read_file 等）——由 externalInjectionMiddleware
//      按工具名直接识别；
//   2. MCP 来源工具：`mcp_` 前缀，或 mcp/manager.js 实际的 `server__tool`
//      命名（内置工具名从不含 `__`），或结果携带 `__external:true` 标记。
// 对第 2 类，本中间件给内容预置一个规范 EXTERNAL marker，使既有的
// externalInjectionMiddleware 对其应用与 web 完全相同的消毒管线（marker
// 会在消毒时剥除），不重复实现任何剥离/截断逻辑。
const MCP_TOOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*__[A-Za-z0-9_-]+$/
const EXTERNAL_FLAG_RE = /"?__external"?\s*:\s*true\b/

function isExternalBySource(toolName, content) {
  if (typeof toolName === 'string' && toolName.startsWith('mcp_')) return true
  if (typeof toolName === 'string' && MCP_TOOL_NAME_RE.test(toolName)) return true
  if (typeof content === 'string' && EXTERNAL_FLAG_RE.test(content)) return true
  return false
}

function externalSourceTagMiddleware(content, ctx) {
  if (typeof content !== 'string') return content
  if (!EXTERNAL_MARKERS || !EXTERNAL_MARKERS.length) return content
  if (EXTERNAL_MARKERS.some((m) => content.includes(m))) return content // 已带标记
  if (isExternalBySource(ctx?.tool, content)) {
    return EXTERNAL_MARKERS[0] + '\n' + content
  }
  return content
}

const featureFlags = require('../featureFlags')

function compressionMiddleware(content, ctx) {
  if (typeof content !== 'string') content = String(content ?? '')
  const db = ctx && ctx.db
  if (db && !featureFlags.isEnabled(db, 'llm.tokenCompression')) {
    return content
  }
  
  let compressed = content
  const trimmed = compressed.trim()
  
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed)
      if (Array.isArray(obj) && obj.length > 50) {
        const structural = obj.map(item => {
          if (typeof item === 'object' && item !== null) {
            const small = {}
            for (const [k, v] of Object.entries(item)) {
              if (typeof v === 'string' && v.length > 100) small[k] = v.slice(0, 50) + '...[trunc]'
              else small[k] = v
            }
            return small
          }
          return item
        })
        return JSON.stringify(structural)
      } else {
        return JSON.stringify(obj)
      }
    } catch {}
  }
  
  // Condense contiguous whitespace
  compressed = compressed.replace(/[ \t]{2,}/g, ' ')
  compressed = compressed.replace(/\n{3,}/g, '\n\n')
  return compressed
}

// Ordered chain. Order matters: redact first (so truncated tails don't hide a
// secret split across the cut), then tag external-by-source content, then
// sanitize external content, compress, then truncate.
const CHAIN = [redactMiddleware, externalSourceTagMiddleware, externalInjectionMiddleware, compressionMiddleware, truncateMiddleware]

function applyMiddleware(content, ctx) {
  // Pass multimodal (image) content arrays through unmodified.
  // Converting them to strings breaks the structure expected by the API adapter.
  if (Array.isArray(content)) {
    const isMultimodal = content.some(c => c && typeof c === 'object' && (c.type === 'image_url' || c.type === 'image'))
    if (isMultimodal) return content
  }

  let out = content
  for (const mw of CHAIN) {
    try { out = mw(out, ctx) } catch { /* skip a failing middleware */ }
  }
  return out
}

// Structured result detection: if a tool result contains a clearly structured
// pattern (JSON, XML, key=value), surface it with a summary line for the model.
// Returns the enriched content.
function enrichWithSummary(content, toolName) {
  if (typeof content !== 'string') return content
  const trimmed = content.trim()
  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed)
      const summary = `[${toolName} returned JSON with ${Array.isArray(obj) ? obj.length + ' items' : Object.keys(obj).length + ' fields'}]`
      return summary + '\n' + content
    } catch {}
  }
  // key=value pattern
  const kvLines = trimmed.split('\n').filter(l => /^\w[\w\s]*[:=]/.test(l.trim()))
  if (kvLines.length > 0 && kvLines.length < 20) {
    return `[${toolName} returned ${kvLines.length} key-value lines]\n` + content
  }
  return content
}

module.exports = { applyMiddleware, truncateMiddleware, redactMiddleware, enrichWithSummary, externalSourceTagMiddleware, isExternalBySource, MAX_TOOL_RESULT_CHARS }
