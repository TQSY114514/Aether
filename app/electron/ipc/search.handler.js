const log = require('../logger')

// ── CJK bigram tokenizer (JS port of src/utils/cjkBigram.ts) ──────────────
// FTS5's unicode61 tokenizer doesn't split CJK ideographs, so we transform
// queries into overlapping bigrams at the app layer. Each token is quoted for
// FTS5 MATCH safety; tokens are ANDed by default. Kept in sync with the TS
// version used by the renderer — this handler runs in the Node main process
// and cannot `require` a .ts module.
function isCJKCodePoint(code) {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (code >= 0xac00 && code <= 0xd7a3)    // Hangul Syllables
  )
}

function cjkBigram(text) {
  if (!text) return ''
  const chars = Array.from(text) // iterate by code point (handles surrogate pairs)
  const tokens = []
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
    if (isCJKCodePoint(ch.codePointAt(0))) {
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

function cjkBigramQuery(query) {
  const bigrammed = cjkBigram(query)
  if (!bigrammed.trim()) return ''
  return bigrammed
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => '"' + tok.replace(/"/g, '""') + '"')
    .join(' ')
}

function registerSearchHandlers(ipcMain, db) {
  // Cache session titles so repeated hits from the same session don't each
  // trigger a SELECT.
  const titleCache = new Map()
  const sessionTitle = (id) => {
    if (titleCache.has(id)) return titleCache.get(id)
    let title = ''
    try {
      const row = db.getSession(id)
      title = (row && row.title) || ''
    } catch { /* ignore — title is best-effort */ }
    titleCache.set(id, title)
    return title
  }

  // Full-text search over messages. Params: { query, sessionId? }.
  // The query is bigram-transformed for CJK, then AND-matched against the
  // messages_fts index. Each result is hydrated with the full message row, the
  // owning session's title, and the bigram terms used for client highlight.
  ipcMain.handle('search:messages', (_e, { query, sessionId } = {}) => {
    const ftsQuery = cjkBigramQuery(query || '')
    if (!ftsQuery) return []
    try {
      const rows = db.searchMessages(ftsQuery, sessionId || null) || []
      // Unquoted bigram tokens — the renderer uses them for highlighting.
      const terms = cjkBigram(query || '').split(/\s+/).filter(Boolean)
      return rows.map((m) => ({
        id: m.id,
        session_id: m.session_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        model_used: m.model_used,
        session_title: sessionTitle(m.session_id),
        terms,
      }))
    } catch (e) {
      log.warn('search:messages failed:', e.message || e)
      return []
    }
  })
}

module.exports = { registerSearchHandlers }
