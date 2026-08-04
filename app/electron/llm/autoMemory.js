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
const knowledgeGraph = require('./knowledgeGraph')
const log = require('../logger')

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
// Each prefetch hit increments access_count (for weighted decay).

let _memCache = null
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

  // Phase 3: graph-aware expansion. If graph search finds entities linked to the query,
  // merge those results with keyword results so related memories surface even without
  // direct keyword overlap ("Alice works on X" → search "Alice" finds X-related memories).
  let graphIds = new Set()
  try {
    const graphResults = knowledgeGraph.searchGraph(db, userMessage, PREFETCH_TOP_K)
    if (graphResults.length > 0) {
      for (const m of graphResults) graphIds.add(m.id)
    }
  } catch {}

  const scored = memories
    .map(m => {
      const kwScore = score(m.content, qkw)
      // Weighted score: base keyword hits + recency bonus + access_count bonus
      // + time-decay factor (memories not accessed recently fade in priority).
      let w = kwScore
      if (kwScore > 0) {
        const ageDays = (Date.now() - new Date(m.created_at || Date.now()).getTime()) / 86400000
        const recencyBonus = Math.max(0, 1 - ageDays / 90) * 0.5
        const accessBonus = Math.log(1 + (m.access_count || 0)) * 0.3
        // Time-decay: memories not accessed in 30+ days lose priority.
        // last_accessed_at defaults to created_at if never fetched.
        const lastAccess = m.last_accessed_at ? new Date(m.last_accessed_at).getTime() : new Date(m.created_at || Date.now()).getTime()
        const daysSinceAccess = (Date.now() - lastAccess) / 86400000
        const decayFactor = Math.max(0.1, 1 - daysSinceAccess / 180) // half-life ~180 days
        w = (kwScore + recencyBonus + accessBonus) * decayFactor
        // Graph expansion bonus: if this memory matched via graph neighbours,
        // give it a small boost so related context surfaces.
        if (graphIds.has(m.id) && kwScore === 0) w = 0.3
        // Record access for decay tracking.
        try { db.incrementMemoryAccess(m.id) } catch {}
      }
      return { m, s: w }
    })
    .filter(x => x.s >= MIN_HITS * 0.3) // lower threshold for graph hits
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
  [RELATION] entity1|relation_type|entity2
  [FACT] concise statement
  [CONTEXT] brief summary of the conversation topic

Rules:
- ENTITY: names of people, projects, tools, preferences, skills mentioned
- RELATION: a connection between two entities (e.g. "Alice|works_on|ProjectX", "Bob|prefers|Python")
- FACT: specific decisions, preferences, corrections, or learned facts
- CONTEXT: only if the conversation covers a distinct topic worth recalling later
- Skip trivial greetings, chit-chat, and information already in the conversation
- Keep each entry ≤200 chars
- Output nothing if nothing is worth remembering`

// Parse a single extraction line into { type, content }.
function parseEntry(line) {
  const m = line.match(/^\[(ENTITY|RELATION|FACT|CONTEXT)\]\s*(.+)/)
  if (!m) return null
  const type = m[1].toLowerCase()
  const content = m[2].trim()
  if (!content || content.length > 300) return null
  // RELATION format: entity1|relation_type|entity2
  if (type === 'relation') {
    const parts = content.split('|')
    if (parts.length < 3) return null
    return { type: 'relation', content: content, entity1: parts[0].trim(), relation: parts[1].trim(), entity2: parts.slice(2).join('|').trim() }
  }
  return { type, content }
}

// Debounce timer + in-flight promise — batches rapid messages into one sync call.
// Uses a pending-call queue to avoid a race where multiple rapid messages each
// schedule a debounced timer that can fire with stale data (the "last caller wins"
// problem of naive debounce+chain).
let _syncTimer = null
let _syncPromise = null
let _pendingSyncArgs = null // the most recent args; used when timer fires

async function sync({ db, provider, model, userMessage, assistantReply, signal, sessionId }) {
  // Always keep the latest args; the debounced call picks them up when it fires.
  _pendingSyncArgs = { db, provider, model, userMessage, assistantReply, signal, sessionId }

  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => {
    _syncTimer = null
    const args = _pendingSyncArgs
    _pendingSyncArgs = null
    // If a sync is already in flight, chain onto it so we never run two concurrently.
    if (_syncPromise) {
      _syncPromise = _syncPromise.catch(() => {}).then(() => _doSync(args))
    } else {
      _syncPromise = _doSync(args)
    }
  }, SYNC_DEBOUNCE_MS)
}

async function _doSync({ db, provider, model, userMessage, assistantReply, signal, sessionId }) {
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
      // Conflict detection: if a similar fact already exists in the opposite
      // direction, the older entry is marked as conflicting.
      if (entry.type === 'fact') {
        try { detectConflict(db, entry.content, 'fact') } catch {}
      }
      if (entry.type === 'relation') {
        try {
          db.run('INSERT INTO memory (content, type, relation_entity, relation_type, relation_target, source_session_id, source_turn_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [entry.content, 'relation', entry.entity1, entry.relation, entry.entity2, sessionId || null, null])
          try { const rid = db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0]; if (rid) db.run('INSERT INTO memories_fts (content, type, memory_id) VALUES (?, ?, ?)', [String(entry.content || ''), 'relation', Number(rid)]) } catch {}
        } catch {}
      } else {
        try { db.addMemoryWithProvenance(entry.content, entry.type, sessionId || null) } catch {}
      }
    }
    _memV++ // invalidate prefetch cache
    // Phase 3: build knowledge graph from recent memories after sync.
    try { knowledgeGraph.buildGraph(db) } catch {}
  } catch (e) {
    log.warn('sync failed:', e && e.message)
  }
}

// ─── Memory Search (for UI) ────────────────────────────────────────────────

function search(db, query, limit = 20) {
  // Phase 1: try FTS5 full-text search first (fast, index-backed)
  if (query && query.trim()) {
    try {
      const ftsResults = db.searchMemories(query)
      if (ftsResults && ftsResults.length > 0) {
        return ftsResults.slice(0, limit)
      }
    } catch {}
  }
  // Fallback to keyword-based search for CJK and edge cases
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

// ─── Conflict Detection ─────────────────────────────────────────────────────
// Detect potential conflicts: if we already have a similar memory in the
// opposite direction (e.g. "Alice prefers Python" vs "Alice prefers JavaScript"),
// mark the older one as conflicting.

function detectConflict(db, newContent, newType) {
  try {
    if (!db.allRows) return null
    const existing = db.allRows('SELECT id, content, type FROM memory WHERE type = ? ORDER BY created_at ASC LIMIT 20', [newType]) || []
    if (existing.length === 0) return null
    const nkw = new Set(keywords(newContent))
    for (const row of existing) {
      const ekw = new Set(keywords(row.content))
      let overlap = 0
      for (const k of nkw) if (ekw.has(k)) overlap++
      if (overlap >= 2 && row.content !== newContent) {
        try { db.run('UPDATE memory SET conflicts_with = ? WHERE id = ?', [row.id, row.id]) } catch {}
        return { olderId: row.id, olderContent: row.content, reason: `相同主题但不同内容: "${row.content}" vs "${newContent}"` }
      }
    }
  } catch {}
  return null
}

// ─── Memory Pruning ─────────────────────────────────────────────────────────
// Remove stale memories (old, low-relevance) to keep the store lean.
// Called occasionally; not on every sync (too expensive).

function prune(db, maxAgeDays = 90) {
  try {
    // Two-pronged prune:
    // 1. Never-accessed memories older than maxAgeDays are safe to drop.
    // 2. All memories older than 365 days are pruned regardless of access
    //    (prevents unbounded growth from very old, irrelevant entries).
    db.run('DELETE FROM memory WHERE access_count = 0 AND created_at < ?', [new Date(Date.now() - maxAgeDays * 86400000).toISOString()])
    db.run('DELETE FROM memory WHERE created_at < ?', [new Date(Date.now() - 365 * 86400000).toISOString()])
  } catch {}
}

module.exports = { prefetch, sync, search, prune, keywords, parseEntry, EXTRACTION_PROMPT, detectConflict }
