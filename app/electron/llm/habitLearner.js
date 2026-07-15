// ───────────────────────────────────────────────────────────────────────────
// Habit Learner — turn recurring user preferences into auto-applied skills.
//
// Inspired by Hermes' long-term skill acquisition: instead of only recording
// facts (autoMemory), detect *behavioral patterns* the user expresses more than
// once ("I said I use Python", "keep it brief", "always cite sources") and,
// once a pattern repeats, materialize it as a SKILL.md the skills loader picks
// up — so the preference is applied automatically on every future turn without
// the user re-stating it.
//
// Flow (runs after each exchange, alongside autoMemory.sync):
//   1. ask the model: does this exchange express a reusable preference/habit?
//   2. if yes, normalize it to a short imperative ("Reply concisely",
//      "Prefer Python for code", "Cite sources") + a short key.
//   3. bump that habit's occurrence count in `user_habit` (create if new).
//   4. when occurrences ≥ PROMOTE_THRESHOLD, write a SKILL.md into
//      <userData>/skills/user-habits/ and rescan so it's live immediately.
//
// The skill is just the accumulated habits as a system-prompt block — one file,
// rewritten each time a new habit promotes, so it stays current.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { completeChat } = require('./providerAdapter')

const PROMOTE_THRESHOLD = 2   // seen twice → promote to a skill
const HABIT_DIRNAME = 'user-habits'

const DETECTION_PROMPT = `Does the user express a reusable preference, habit, or standing instruction in this exchange? A habit is something they'd want applied to ALL future conversations — not a one-off fact.

Examples of habits:
- "reply concisely" / "keep answers short"
- "I prefer Python for code"
- "always cite sources"
- "use simplified Chinese"
- "don't use emojis"

NOT habits (ignore these): one-off questions, facts about a specific project, temporary requests.

If there is a reusable habit, reply EXACTLY one line:
HABIT|<short imperative, ≤8 words>|<one-line reason>

Otherwise reply exactly:
NONE

Be strict — only flag clear standing preferences.`

// Detect + record. Safe to call every exchange; no-ops on NONE.
async function detectAndLearn({ db, provider, model, userMessage, assistantReply, signal }) {
  if (!db || !provider || !model) return
  try {
    const transcript = `User: ${String(userMessage || '').slice(0, 1500)}\n\nAssistant: ${String(assistantReply || '').slice(0, 2000)}`
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: DETECTION_PROMPT },
        { role: 'user', content: transcript },
      ],
      signal,
      options: { max_tokens: 60, temperature: 0.1 },
    })
    const line = (text || '').trim()
    const m = /^HABIT\|(.+?)\|(.*)$/.exec(line)
    if (!m) return
    const imperative = m[1].trim().slice(0, 80)
    const reason = m[2].trim().slice(0, 120)
    if (!imperative) return
    const key = normalizeKey(imperative)
    const occurrences = bumpOccurrence(db, key, imperative, reason)
    if (occurrences >= PROMOTE_THRESHOLD) {
      promoteToSkill(db)
    }
  } catch (e) {
    // never let habit-learning break a chat
    console.warn('[habitLearner] detect failed:', e && e.message)
  }
}

// Normalize an imperative into a stable storage key (lowercase, alnum).
function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
}

// Create/bump a habit row. Returns the new occurrence count.
function bumpOccurrence(db, key, imperative, reason) {
  try {
    // create table lazily (idempotent) so we don't depend on database.js init order
    db.run('CREATE TABLE IF NOT EXISTS user_habit (key TEXT PRIMARY KEY, imperative TEXT, reason TEXT, occurrences INTEGER NOT NULL DEFAULT 0, first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)')
    db.run('INSERT INTO user_habit (key, imperative, reason, occurrences) VALUES (?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET occurrences=occurrences+1, last_seen=CURRENT_TIMESTAMP, imperative=excluded.imperative, reason=excluded.reason',
      [key, imperative, reason])
    const r = db.exec('SELECT occurrences FROM user_habit WHERE key=?', [key])
    // db.exec with params isn't supported by sql.js; use prepare via the proxy.
  } catch {}
  let occ = 0
  try {
    const stmt = db.prepare('SELECT occurrences FROM user_habit WHERE key=?')
    stmt.bind([key])
    if (stmt.step()) occ = Number(stmt.getAsObject().occurrences) || 0
    stmt.free()
  } catch {}
  return occ
}

// Read all promoted (≥ threshold) habits and (re)write the SKILL.md.
function promoteToSkill(db) {
  try {
    const { app } = require('electron')
    const skillsDir = path.join(app.getPath('userData'), 'skills', HABIT_DIRNAME)
    fs.mkdirSync(skillsDir, { recursive: true })
    const habits = readHabits(db, PROMOTE_THRESHOLD)
    if (habits.length === 0) {
      // no habits → remove the skill file so it stops applying
      try { fs.unlinkSync(path.join(skillsDir, 'SKILL.md')) } catch {}
      return
    }
    const body = habits.map(h => `- ${h.imperative}${h.reason ? ` (${h.reason})` : ''}`).join('\n')
    const md = `---
name: user-habits
description: Preferences the user has expressed more than once — apply automatically.
---

# User habits

The user has expressed these standing preferences across conversations. Apply them to every reply unless the current request explicitly overrides:

${body}

(These were learned automatically. Edit or delete via Settings → Skills if any are wrong.)`
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), md, 'utf8')
    // Re-scan so the new/updated skill is live in the system prompt immediately.
    try { require('./skills').scanSkills() } catch {}
  } catch (e) {
    console.warn('[habitLearner] promote failed:', e && e.message)
  }
}

function readHabits(db, minOccurrences = 1) {
  try {
    const stmt = db.prepare('SELECT key, imperative, reason, occurrences FROM user_habit WHERE occurrences >= ? ORDER BY occurrences DESC, last_seen DESC')
    stmt.bind([minOccurrences])
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  } catch { return [] }
}

// List all habits (UI-facing, for a future habits viewer).
function listHabits(db) { return readHabits(db, 1) }

// Delete a habit by key (user dismissed it).
function deleteHabit(db, key) {
  try { db.run('DELETE FROM user_habit WHERE key=?', [key]); promoteToSkill(db) } catch {}
}

module.exports = { detectAndLearn, listHabits, deleteHabit, promoteToSkill, PROMOTE_THRESHOLD }
