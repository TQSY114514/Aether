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

const STOP = new Set(['the','a','an','and','or','but','of','to','in','on','for','is','are','was','were','be','been','this','that','it','i','you','he','she','we','they','my','your','his','her','our','their','what','how','why','when','do','does','did','can','could','would','should'])

function keywords(text) {
  const t = String(text || '').toLowerCase()
  const set = new Set()
  for (const w of t.match(/[a-z][a-z0-9_-]{1,}/g) || []) {
    if (!STOP.has(w)) set.add(w)
  }
  for (const ch of t) {
    if (ch >= '一' && ch <= '鿿') set.add(ch)
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

function prefetch(db, userMessage) {
  let memories
  try { memories = db.getMemories() } catch { return '' }
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

async function sync({ db, provider, model, userMessage, assistantReply, signal }) {
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
      .filter(l => l.length > 2 && l.length <= 300)

    // De-dup against recent memories
    let recent
    try { recent = db.getMemories().slice(0, 50).map(m => String(m.content).slice(0, 40).toLowerCase()) } catch { recent = [] }

    for (const entry of entries.slice(0, 5)) {
      const prefix = entry.slice(0, 40).toLowerCase()
      if (recent.some(r => r.startsWith(prefix))) continue
      try { db.addMemory({ content: entry }) } catch {}
    }
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
