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

// Tools that produce untrusted external content. H4: read_file joins the set —
// local file reads feed model-visible content the user did not type (a checked
//-out repo can carry prompt injection in a README just like a web page can).
const EXTERNAL_TOOLS = new Set(['web_fetch', 'web_search', 'read_file'])

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
  // ── 中文句式（H4）───────────────────────────────────────────────────────
  // CJK has no word boundaries, so these patterns are guarded by structure
  // (positional word + object noun) instead of \b. Benign discussion of e.g.
  // 「忽略」 alone does not match: the positional+noun frame is required.
  { label: 'zh-ignore-previous', re: /忽略(?:掉|去)?(?:之前|以前|以上|上面|上述|前面|先前)(?:的)?(?:所有|全部|一切)?(?:指令|指示|命令|规则|要求|设定|提示词?)/g },
  { label: 'zh-disregard-previous', re: /(?:无视|不理会|不必理会|不用理会)(?:之前|以前|以上|上述|前面|先前)(?:的)?(?:所有|全部)?(?:指令|指示|命令|规则|设定)/g },
  { label: 'zh-forget-previous', re: /忘(?:记|掉|了)(?:你)?(?:之前|以前|以上|上述|前面|先前)?(?:的)?(?:所有|全部)?(?:指令|指示|命令|角色|设定|身份)/g },
  { label: 'zh-execute-now', re: /(?:立即|马上|立刻|现在就|直接)(?:执行|运行|遵照)(?:以下|下列|如下|上述|上面)?(?:命令|指令|操作|步骤|代码|脚本)/g },
  { label: 'zh-no-confirm', re: /(?:不要|无须|无需|别)(?:再)?(?:询问|确认|请示|提问|征求(?:同意|许可|批准)|等待(?:确认|批准))/g },
  { label: 'zh-now-you-are', re: /(?:你|您)(?:现在|如今|已经)是|从现在(?:起|开始)(?:你|您)(?:是|将|要)|(?:你|您)(?:已|已经)成为/g },
  { label: 'zh-new-task', re: /(?:你|您)(?:的)?(?:新任务|新角色|新身份|新的(?:任务|角色|身份))(?:是|为|：|:)/g },
  { label: 'zh-exfiltrate', re: /(?:把|将)(?:以下|上述|这些|此|所有|全部)?[^。！？!?\n]{0,40}?(?:发送|上传|传送|提交|转发|泄露)到/g },
  { label: 'zh-send-to', re: /(?:发送|上传|传送|提交|转发)到(?:以下)?(?:地址|网址|链接|服务器|邮箱|端口|[Uu][Rr][Ll])/g },
  { label: 'zh-indirect-reference', re: /(?:执行|运行|遵循|按照|根据)(?:上述|上面|上文|以上|前文|先前|网页|页面|文档|文章|链接|搜索结果)(?:中|里|所|中所)?[^。！？!?\n]{0,16}?(?:的)?(?:步骤|指令|命令|操作|要求|指示|内容)/g },
  { label: 'zh-reveal-prompt', re: /(?:显示|输出|打印|泄露|透露|告诉我)(?:你|您)(?:的)?(?:系统提示词?|初始指令|预设指令|提示词|系统指令)/g },
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