// ───────────────────────────────────────────────────────────────────────────
// Skills prompt-entry formatting — pure logic, no electron dependency.
//
// Split out of skills.js (which requires electron at module load) so the
// budget/degradation policy is unit-testable. capabilities-import T4.
//
// The <available_skills> block rides along with every request after
// compaction (chat-send.handler). With a large skill corpus it can crowd out
// real system context, so it is capped like openclaw's skill budget:
//   1. most-used skills keep full entries (name + description + path)
//   2. overflow degrades to name-only lines (use_skill stays possible)
//   3. anything left is counted in a footer notice
// ───────────────────────────────────────────────────────────────────────────

const SKILL_PROMPT_CHAR_BUDGET = 6000 // ≈1.5k tokens

/**
 * Format skill entries under a character budget.
 * @param {Array<{name, description, filePath}>} skills
 * @param {Record<string, {count: number}>} usage - from skills.getSkillUsage()
 * @param {number} [budget] - char cap for the whole block; values below the
 *        scaffolding overhead are clamped up to that floor
 * @param {string} [homePath] - compacted to ~ in path display
 * @returns {string} '' when there are no skills; otherwise a full XML block
 */
function formatSkillEntries(skills, usage, budget = SKILL_PROMPT_CHAR_BUDGET, homePath = '') {
  if (!skills || !skills.length) return ''
  const compact = (p) => { try { return homePath ? String(p).replace(homePath, '~') : p } catch { return p } }
  // Most-used first so budget cuts hit rarely-used skills, ties broken A-Z.
  const useCount = (s) => (usage && usage[s.name] && usage[s.name].count) || 0
  const sorted = skills.slice().sort((a, b) =>
    useCount(b) - useCount(a) || String(a.name).localeCompare(String(b.name)))
  const HEADER = `<available_skills>\nThe following skills are available. When the user's request matches a skill's description, call the use_skill tool with the skill name to load its full instructions, then follow them. Only load a skill when it is relevant to the task.\n`
  const CLOSE = '</available_skills>'
  const parts = []
  // Minimum viable budget: the XML scaffolding alone costs HEADER+CLOSE, and
  // the function returns that scaffolding regardless. A caller passing less
  // gets clamped up to this floor so the "≤ budget" contract stays honest
  // (CodeRabbit PR #43: sub-scaffolding budgets previously overflowed).
  const effectiveBudget = Math.max(Number(budget) > 0 ? Number(budget) : 0, HEADER.length + CLOSE.length)
  let used = HEADER.length + CLOSE.length
  let i = 0
  // Pass 1: full entries — capped at a 75% share so a large corpus still
  // leaves deterministic room for degraded names and the omission notice.
  const FULL_SHARE_CAP = Math.floor(effectiveBudget * 0.75)
  for (; i < sorted.length; i++) {
    const s = sorted[i]
    const line = `  - name: ${s.name}\n    description: ${s.description}\n    path: ${compact(s.filePath)}\n`
    if (used + line.length > Math.min(effectiveBudget, FULL_SHARE_CAP)) break
    parts.push(line)
    used += line.length
  }
  // Pass 2: degrade the rest to name-only lines. Admit a line only when room
  // remains for the omission notice any further overflow will require — the
  // notice must never be squeezed out by the last few names.
  let notListed = 0
  const NOTE_RESERVE = 64
  for (; i < sorted.length; i++) {
    const line = `  - ${sorted[i].name}\n`
    const remainingAfter = sorted.length - (i + 1)
    const reserve = remainingAfter > 0 ? NOTE_RESERVE : 0
    if (used + line.length + reserve > effectiveBudget) { notListed = sorted.length - i; break }
    parts.push(line)
    used += line.length
  }
  if (notListed > 0) {
    const note = `  (+${notListed} more installed but not listed; total ${sorted.length})\n`
    if (used + note.length <= effectiveBudget) parts.push(note)
  }
  return HEADER + parts.join('') + CLOSE
}

module.exports = { formatSkillEntries, SKILL_PROMPT_CHAR_BUDGET }
