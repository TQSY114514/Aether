// ───────────────────────────────────────────────────────────────────────────
// Automatic long-term memory (inspired by Hermes' memory_manager.py).
//
// Hermes' MemoryManager does two things per turn:
//   1. prefetch(userMessage) — before the turn, retrieve memory chunks
//      relevant to the user's message and inject them into the system prompt,
//      so the agent has context from past sessions.
//   2. sync(userMsg, assistantReply) — after the turn, extract anything worth
//      remembering (facts, decisions, preferences) and persist it, so future
//      turns can recall it.
//
// We port that idea at a practical scale: keyword overlap retrieval (no
// embeddings dependency), and a model-driven extraction prompt for sync.
// Memory rows live in the existing `memory` table (shared with the manual
// memory_save tool) — auto-saved entries are tagged `auto=1` so the UI can
// distinguish them later if desired.
//
// Both calls are best-effort and never throw: a memory failure must not break
// the chat. sync is fire-and-forget (async, not awaited by the caller) so it
// never adds latency to the reply.
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')

// How many memory chunks to inject per turn. Too many dilutes the prompt;
// too few misses relevant context. 5 is a reasonable middle.
const PREFETCH_TOP_K = 5
// Cap each chunk's contribution so old verbose memories don't dominate.
const CHUNK_CHARS = 240
// Min overlap to consider a memory relevant.
const MIN_HITS = 1

// Tokenize a message into a normalized keyword set: lowercase, split on
// non-word, drop stop-words and 1-char tokens. CJK is split per-char so
// Chinese queries match Chinese memories character-by-character.
const STOP = new Set(['the','a','an','and','or','but','of','to','in','on','for','is','are','was','were','be','been','this','that','it','i','you','he','she','we','they','my','your','his','her','our','their','what','how','why','when','do','does','did','can','could','would','should'])
function keywords(text) {
  const t = String(text || '').toLowerCase()
  const set = new Set()
  // ASCII words
  for (const w of t.match(/[a-z][a-z0-9_-]{1,}/g) || []) {
    if (!STOP.has(w)) set.add(w)
  }
  // CJK chars (add individually — Chinese has no spaces)
  for (const ch of t) {
    if (ch >= '一' && ch <= '鿿') set.add(ch)
  }
  return set
}

// Score a memory against the query keyword set by overlap count.
function score(memoryText, qkw) {
  const mkw = keywords(memoryText)
  let hits = 0
  for (const k of qkw) if (mkw.has(k)) hits++
  return hits
}

// Retrieve the top-K most relevant memory chunks for a user message.
// Returns a formatted string ready to splice into a system prompt, or ''.
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
  const lines = scored.map(x => `- ${String(x.m.content).slice(0, CHUNK_CHARS).replace(/\s+/g, ' ').trim()}`)
  return `Relevant memories from past conversations (use if helpful, ignore if not):\n${lines.join('\n')}`
}

// After a turn, ask the model to extract 0-3 concise facts worth remembering.
// Fire-and-forget: the caller does not await this. Failures are logged, never
// thrown. Returns nothing.
async function sync({ db, provider, model, userMessage, assistantReply, signal }) {
  try {
    const transcript = `User: ${String(userMessage || '').slice(0, 2000)}\n\nAssistant: ${String(assistantReply || '').slice(0, 3000)}`
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: 'Extract 0-3 concise facts worth remembering long-term from this exchange (user preferences, decisions, facts about them or their projects, corrections). Output ONE fact per line, each ≤120 chars, no numbering, no bullets. Output nothing if nothing is worth remembering. Do not include trivial/greeting content.' },
        { role: 'user', content: transcript },
      ],
      signal,
      options: { max_tokens: 200, temperature: 0.1 },
    })
    if (!text || !text.trim()) return
    const facts = text.trim().split('\n').map(s => s.replace(/^[-•*\d.\s]+/, '').trim()).filter(s => s.length > 2 && s.length <= 240)
    // De-dup against the most recent memories (cheap exact-ish match on a prefix).
    let recent
    try { recent = db.getMemories().slice(0, 30).map(m => String(m.content).slice(0, 40).toLowerCase()) } catch { recent = [] }
    for (const f of facts.slice(0, 3)) {
      const prefix = f.slice(0, 40).toLowerCase()
      if (recent.some(r => r.startsWith(prefix))) continue
      try { db.addMemory({ content: f }) } catch {}
    }
  } catch (e) {
    console.warn('[autoMemory] sync failed:', e && e.message)
  }
}

module.exports = { prefetch, sync, keywords }
