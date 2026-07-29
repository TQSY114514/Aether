// CJK bigram tokenizer for FTS5 full-text search.
//
// SQLite's FTS5 `unicode61` tokenizer does not split CJK ideographs on word
// boundaries (there are no inter-word spaces in CJK), so a multi-char CJK run
// becomes a single token that rarely matches a query. To get substring search
// we transform text into overlapping 2-character grams at the app layer:
//   "人工智能" → "人工 工智 智能"
//
// Non-CJK runs are emitted verbatim — unicode61 already splits them on
// whitespace/punctuation, so they match normally.

/** Unicode code point ranges we treat as CJK (need bigram splitting). */
function isCJKCodePoint(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (code >= 0xac00 && code <= 0xd7a3) // Hangul Syllables
  )
}

/**
 * Tokenize `text` into space-separated tokens.
 * - Consecutive CJK characters are split into overlapping bigrams
 *   ("人工智能" → "人工 工智 智能"). A lone CJK char is emitted as-is.
 * - Non-CJK runs are emitted verbatim (unicode61 handles their tokenization).
 */
export function cjkBigram(text: string): string {
  if (!text) return ''
  const chars = Array.from(text) // iterate by code point (handles surrogate pairs)
  const tokens: string[] = []
  let cjkBuf = ''
  let otherBuf = ''

  const flushCjk = () => {
    if (!cjkBuf) return
    if (cjkBuf.length >= 2) {
      for (let i = 0; i < cjkBuf.length - 1; i++) tokens.push(cjkBuf.slice(i, i + 2))
    } else {
      tokens.push(cjkBuf)
    }
    cjkBuf = ''
  }
  const flushOther = () => {
    if (!otherBuf) return
    tokens.push(otherBuf)
    otherBuf = ''
  }

  for (const ch of chars) {
    if (isCJKCodePoint(ch.codePointAt(0)!)) {
      flushOther()
      cjkBuf += ch
    } else {
      flushCjk()
      otherBuf += ch
    }
  }
  flushCjk()
  flushOther()
  return tokens.join(' ')
}

/**
 * Build an FTS5 MATCH expression from `query`.
 *
 * Each token (CJK bigram or non-CJK piece) is wrapped in double quotes so the
 * expression is safe against FTS5 special characters (`*`, `(`, `)`, `:`, …).
 * Tokens are joined by spaces — FTS5 applies implicit AND between them, so a
 * document must contain every token to match.
 */
export function cjkBigramQuery(query: string): string {
  const bigrammed = cjkBigram(query)
  if (!bigrammed.trim()) return ''
  return bigrammed
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => '"' + tok.replace(/"/g, '""') + '"')
    .join(' ')
}
