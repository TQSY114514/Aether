// ───────────────────────────────────────────────────────────────────────────
// AutoMemory — structured long-term memory with entity extraction.
//
// Inspired by Hermes' memory_manager.py, OpenClaw's persistent context, and
// Claude Code's knowledge graph.
//
// Two-pass architecture:
//   1. prefetch(db, userMessage) — retrieve relevant memories for context injection
//   2. sync(db, provider, model, userMessage, assistantReply, signal) — extract
//      entities + facts from the exchange and persist them
//
// Memory types stored in the `memory` table with a `type` column:
//   entity  — named entity (person, project, tool, preference)
//   fact    — simple fact or decision
//   context — conversation-level summary for future recall
//
// Entity tracking enables relationship inference: "Alice works on Project X"
// → we store both entities and can later answer "who works on Project X?"

const { completeChat } = require('./providerAdapter')

const PREFETCH_TOP_K = 5
const CHUNK_CHARS = 240
const MIN_HITS = 1
const SYNC_DEBOUNCE_MS = 5000 // batch rapid messages into one sync call

const STOP = new Set(['the','a','an','and','or','but','of','to','in','on','for','is','are','was','were','be','been','this','that','it','i','you','he','she','we','they','my','your','his','her','our','their','what','how','why','when','do','does','did','can','could','would','should'])

function keywords(text) {
  const t = String(text || '').toLowerCase()
  const set = new Set()
  for (const w of t.match(/[a-z][a-z0-9_-]{1,}/g) || []) {
    if (!STOP.has(w)) set.add(w)
  }
  // CJK bigrams: two consecutive CJK characters form a token instead of
  // single chars, which produces false-positive matches for any shared character.
  const chars = [...t]
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i], b = chars[i + 1]
    if ((a >= '一' && a <= '鿿') && (b >= '一' && b <= '鿿')) {
      set.add(a + b)
      i++ // skip next char (already consumed)
    } else if (a >= '一' && a <= '鿿') {
      set.add(a) // standalone CJK (adjacent to non-CJK)
    }
  }
  return set
}

function score(memoryText, qkw) {
  const mkw = keywords(memoryText)
  let hits = 0
  for (const k of qkw) if (mkw.has(k)) hits++
  return hits
}

// ─── Prefetch ──────────────────────────────────────────────────────────────
// Retrieve top-K relevant memories for a user message.
// In-memory cache avoids repeated full-table scans across consecutive turns.

let _memCache: { data: any[]; v: number } | null = null
let _memV = 0

function prefetch(db, userMessage) {
  const memories = _memCache && _memCache.v === _memV ? _memCache.data : (() => {
    let m
    try { m = db.getMemories(200) } catch { return [] }
    _memCache = { data: m, v: _memV }
    return m
  })()
  if (!memories || memories.length === 0) return ''
  const qkw = keywords(userMessage)
  if (qkw.size === 0) return ''
  const scored = memories
    .map(m => ({ m, s: score(m.content, qkw) }))
    .filter(x => x.s >= MIN_HITS)
    .sort((a, b) => b.s - a.s)
    .slice(0, PREFETCH_TOP_K)
  if (scored.length === 0) return ''
  const lines = scored.map(x =>
    `- ${String(x.m.content).slice(0, CHUNK_CHARS).replace(/\s+/g, ' ').trim()}`
  )
  return `Relevant memories from past conversations (use if helpful, ignore if not):\n${lines.join('\n')}`
}

// ─── Sync — entity extraction + fact persistence ───────────────────────────

const EXTRACTION_PROMPT = `Extract 0-5 structured memory entries from this conversation exchange.

Output one entry per line in this EXACT format:
  [ENTITY] name|description
  [FACT] concise statement
  [CONTEXT] brief summary of the conversation topic

Rules:
- ENTITY: names of people, projects, tools, preferences, skills mentioned
- FACT: specific decisions, preferences, corrections, or learned facts
- CONTEXT: only if the conversation covers a distinct topic worth recalling later
- Skip trivial greetings, chit-chat, and information already in the conversation
- Keep each entry ≤200 chars
- Output nothing if nothing is worth remembering`

// Parse a single extraction line into { type, content }.
function parseEntry(line) {
  const m = line.match(/^\[(ENTITY|FACT|CONTEXT)\]\s*(.+)/)
  if (!m) return null
  const type = m[1].toLowerCase()
  const content = m[2].trim()
  if (!content || content.length > 300) return null
  return { type, content }
}

// Debounce timer + in-flight promise — batches rapid messages into one sync call.
let _syncTimer = null
let _syncPromise = null

async function sync({ db, provider, model, userMessage, assistantReply, signal }) {
  // Debounce: if another sync is already queued, absorb this call into it.
  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => { _syncTimer = null }, SYNC_DEBOUNCE_MS)

  // If a sync is already in flight, chain onto it (dedup + debounce).
  if (_syncPromise) {
    _syncPromise = _syncPromise.catch(() => {}).then(() => _doSync({ db, provider, model, userMessage, assistantReply, signal }))
  } else {
    _syncPromise = _doSync({ db, provider, model, userMessage, assistantReply, signal })
  }
  return _syncPromise.catch(() => {})
}

async function _doSync({ db, provider, model, userMessage, assistantReply, signal }) {
  try {
    const transcript = `User: ${String(userMessage || '').slice(0, 2000)}\n\nAssistant: ${String(assistantReply || '').slice(0, 3000)}`
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: transcript },
      ],
      signal,
      options: { max_tokens: 300, temperature: 0.1 },
    })
    if (!text || !text.trim()) return
    const entries = text.trim().split('\n')
      .map(l => l.trim())
      .map(parseEntry)
      .filter(Boolean)

    // De-dup against recent memories (separate direct DB read — this runs once
    // per sync, not per turn, so the overhead is negligible).
    let recent
    try { recent = db.getMemories(50) } catch { recent = [] }
    const recentKeys = new Set(recent.map(m => `${m.type || 'fact'}:${String(m.content).slice(0, 50).toLowerCase()}`))

    for (const entry of entries.slice(0, 5)) {
      const key = `${entry.type}:${entry.content.toLowerCase()}`
      if (recentKeys.has(key)) continue
      try { db.addMemory({ content: entry.content, type: entry.type }) } catch {}
    }
    _memV++ // invalidate prefetch cache — new memories won't show stale results
  } catch (e) {
    console.warn('[autoMemory] sync failed:', e && e.message)
  }
}

// ─── Memory Search (for UI) ────────────────────────────────────────────────

function search(db, query, limit = 20) {
  let memories
  try { memories = db.getMemories() } catch { return [] }
  if (!query || !query.trim()) return memories.slice(0, limit)
  const qkw = keywords(query)
  if (qkw.size === 0) return memories.slice(0, limit)
  return memories
    .map(m => ({ ...m, _score: score(m.content, qkw) }))
    .filter(m => m._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
}

// ─── Memory Pruning ─────────────────────────────────────────────────────────
// Remove stale memories (old, low-relevance) to keep the store lean.
// Called occasionally; not on every sync (too expensive).

function prune(db, maxAgeDays = 90) {
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString()
    db.run('DELETE FROM memory WHERE created_at < ?', [cutoff])
  } catch {}
}

module.exports = { prefetch, sync, search, prune, keywords, EXTRACTION_PROMPT }
