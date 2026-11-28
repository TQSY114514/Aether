// Token estimation shared by the renderer (ContextBar) and compaction.js.
// Uses 6-range CJK coverage so the context bar display matches actual compaction.
export function estimateTextTokens(text: string): number {
  if (!text) return 0
  let tokens = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.codePointAt(i) ?? 0
    if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff) ||
        (c >= 0xac00 && c <= 0xd7af)) tokens += 1.5
    else tokens += 0.25
  }
  return Math.ceil(tokens)
}

const _msgTokenCache = new WeakMap<object, { content: unknown; tokens: number }>()

/**
 * Memoized token count for a chat message object (including role overhead).
 * Preserves O(1) incremental updates when new messages are appended.
 */
export function estimateMessageTokens(
  msg: { role?: string; content?: unknown },
  overheads: { system?: number; tool?: number; default?: number } = {}
): number {
  const cached = _msgTokenCache.get(msg)
  let baseTokens: number
  if (cached && cached.content === msg.content) {
    baseTokens = cached.tokens
  } else {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
    baseTokens = estimateTextTokens(text)
    _msgTokenCache.set(msg, { content: msg.content, tokens: baseTokens })
  }
  const sysOv = overheads.system ?? 100
  const toolOv = overheads.tool ?? 30
  const defOv = overheads.default ?? 20
  const overhead = msg.role === 'system' ? sysOv : msg.role === 'tool' ? toolOv : defOv
  return baseTokens + overhead
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
