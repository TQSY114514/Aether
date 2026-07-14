// ───────────────────────────────────────────────────────────────────────────
// Centralized error classification for LLM/agent failures.
//
// Every error the LLM layer can throw (provider HTTP errors, network errors,
// aborts, content-filter rejections, context-length overruns) is mapped here to
// a { kind, retryable, recover } verdict. Callers consult this to decide:
//   - retry on next fallback model?        (retryable)
//   - emit a status hint to the UI?        (recover.hint)
//   - suggest "continue" vs full resend?   (recover.action)
//
// Concentrating this here means the fallback/retry/compress decisions live in
// ONE place instead of scattered string-matching across handlers.
// ───────────────────────────────────────────────────────────────────────────

// An error wrapped with a `status` number (from openaiAdapter) or a raw Error.
// kind categories:
//   auth            — 401/403, bad key.        Not retryable on same provider.
//   rate_limit      — 429.                     Retryable (ideally after a pause).
//   server          — 5xx.                     Retryable on fallback.
//   network         — ECONN*/ETIMEDOUT/DNS.    Retryable on fallback.
//   context_length  — 400 with "context length"/"too many tokens". Compress & retry.
//   content_filter  — provider refused content. Give a recovery suggestion.
//   abort           — user stop / timeout.     Not retryable.
//   unknown         — anything else.           Retryable once on fallback.
function classifyError(err) {
  const msg = String((err && err.message) || err || '')
  const status = Number(err && err.status) || 0

  if (err && err.name === 'AbortError') {
    return { kind: 'abort', retryable: false, recover: { action: 'none', hint: '已中止' } }
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth', retryable: false, recover: { action: 'none', hint: 'API Key 无效或无权限，请在模型管理检查配置' } }
  }
  if (status === 429) {
    return { kind: 'rate_limit', retryable: true, recover: { action: 'retry', hint: '触发限流，已尝试回退模型' } }
  }
  if (status >= 500 && status < 600) {
    return { kind: 'server', retryable: true, recover: { action: 'retry', hint: '服务端错误，已尝试回退模型' } }
  }
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(msg)) {
    return { kind: 'network', retryable: true, recover: { action: 'retry', hint: '网络错误，已尝试回退模型' } }
  }
  // Context-length overruns usually come back as 400 with a token mention.
  if (status === 400 && /context length|too many tokens|max_tokens|maximum context/i.test(msg)) {
    return { kind: 'context_length', retryable: true, recover: { action: 'compress', hint: '上下文超长，已自动压缩历史后重试' } }
  }
  // Content-policy refusals (OpenAI: content_filter; some proxies 400 "content").
  if (/content_filter|content policy|content management policy|safety/i.test(msg)) {
    return { kind: 'content_filter', retryable: false, recover: { action: 'rephrase', hint: '内容被安全策略拦截，可尝试换一种措辞或拆分请求' } }
  }
  return { kind: 'unknown', retryable: true, recover: { action: 'retry', hint: '请求失败，已尝试回退模型' } }
}

module.exports = { classifyError }
