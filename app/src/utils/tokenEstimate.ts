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
  return Math.max(1, Math.ceil(tokens))
}
