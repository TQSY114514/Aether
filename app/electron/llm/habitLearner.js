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
const log = require('../logger')

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
// `onPropose({ key, imperative, reason })` — when a habit crosses the threshold,
// we DON'T silently promote; we fire this callback so the UI can ask the user.
// Promotion happens in confirmHabit() only after consent.
async function detectAndLearn({ db, provider, model, userMessage, assistantReply, signal, onPropose }) {
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
    // Crossed the threshold AND we haven't asked yet → propose (don't auto-promote).
    if (occurrences >= PROMOTE_THRESHOLD && !isProposed(db, key)) {
      markProposed(db, key)
      if (onPropose) { try { onPropose({ key, imperative, reason }) } catch {} }
    }
  } catch (e) {
    // never let habit-learning break a chat
    log.warn('detect failed:', e && e.message)
  }
}

// Has this habit already been proposed to the user?
function isProposed(db, key) {
  try {
    const stmt = db.prepare('SELECT proposed FROM user_habit WHERE key=?')
    stmt.bind([key])
    let v = 0
    if (stmt.step()) v = Number(stmt.getAsObject().proposed) || 0
    stmt.free()
    return v === 1
  } catch { return false }
}

function markProposed(db, key) {
  try { db.run('UPDATE user_habit SET proposed=1 WHERE key=?', [key]) } catch {}
}

// User accepted → promote now (rewrites the user-habits skill).
function confirmHabit(db) { promoteToSkill(db) }

// User dismissed → delete the habit so it never re-proposes.
function dismissHabit(db, key) {
  try { db.run('DELETE FROM user_habit WHERE key=?', [key]) } catch {}
  try { promoteToSkill(db) } catch {}
}

// Normalize an imperative into a stable storage key (lowercase, alnum).
function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
}

// Create/bump a habit row. Returns the new occurrence count.
// The `proposed` column is migrated at database.js init time (run once per app start).
function bumpOccurrence(db, key, imperative, reason) {
  try {
    db.run('INSERT INTO user_habit (key, imperative, reason, occurrences) VALUES (?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET occurrences=occurrences+1, last_seen=CURRENT_TIMESTAMP, imperative=excluded.imperative, reason=excluded.reason',
      [key, imperative, reason])
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
    // Invalidate the in-memory skills index for the user-habits entry instead of
    // re-scanning all skill dirs from disk (which is O(skills) stat calls).
    try { require('./skills').upsertSkill('user-habits', { name: 'user-habits', description: 'Updated user habits', filePath: path.join(skillsDir, 'SKILL.md'), baseDir: skillsDir, body: md }) } catch {}
  } catch (e) {
    log.warn('promote failed:', e && e.message)
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

module.exports = { detectAndLearn, listHabits, deleteHabit, dismissHabit, confirmHabit, promoteToSkill, PROMOTE_THRESHOLD }
