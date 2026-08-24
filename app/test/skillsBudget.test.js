// ─── Skills prompt-budget tests (capabilities-import T4) ────────────────────
// formatSkillsForPrompt() used to concatenate EVERY skill entry with no cap —
// a large corpus crowds out real system context. New behavior: char budget,
// usage-ranked, full entries first, overflow degrades to name-only lines,
// remainder counted in a footer notice. Pure-function tests (no electron).
import { describe, it, expect } from 'vitest'
const { formatSkillEntries, SKILL_PROMPT_CHAR_BUDGET } = require('../electron/llm/skillsEntries')

const mk = (n) => ({ name: `skill-${String(n).padStart(3, '0')}`, description: `desc for ${n}`, filePath: `C:/u/skills/skill-${n}/SKILL.md` })

describe('formatSkillEntries budget', () => {
  it('exports a positive budget', () => {
    expect(SKILL_PROMPT_CHAR_BUDGET).toBeGreaterThan(500)
  })

  it('returns empty string for no skills', () => {
    expect(formatSkillEntries([], {})).toBe('')
    expect(formatSkillEntries(null, {})).toBe('')
  })

  it('keeps everything when the corpus fits the budget', () => {
    const skills = [mk(1), mk(2)]
    const out = formatSkillEntries(skills, {}, 100000)
    expect(out).toContain('<available_skills>')
    expect(out).toContain('</available_skills>')
    expect(out).toContain('description: desc for 2')
    expect(out).not.toContain('not listed')
  })

  it('caps output at the budget and degrades overflow to name-only + notice', () => {
    const skills = Array.from({ length: 200 }, (_, i) => mk(i))
    const out = formatSkillEntries(skills, {}, SKILL_PROMPT_CHAR_BUDGET)
    expect(out.length).toBeLessThanOrEqual(SKILL_PROMPT_CHAR_BUDGET)
    // Full entries carry descriptions; degraded entries do not.
    const fullCount = (out.match(/description: /g) || []).length
    expect(fullCount).toBeGreaterThan(0)
    expect(fullCount).toBeLessThan(skills.length)
    expect(out).toMatch(/\(\+\d+ more installed but not listed; total 200\)/)
    // Degraded name-only lines still appear so use_skill remains possible.
    expect(out).toMatch(/\n  - skill-\d{3}\n/)
  })

  it('ranks by usage count before alphabetical order', () => {
    const skills = [mk(1), mk(2), mk(3)]
    const usage = { 'skill-003': { count: 9 } }
    const out = formatSkillEntries(skills, usage, 100000)
    expect(out.indexOf('skill-003')).toBeLessThan(out.indexOf('skill-001'))
  })

  it('sorts stably by name when usage is empty', () => {
    const skills = [mk(3), mk(1), mk(2)]
    const out = formatSkillEntries(skills, {}, 100000)
    expect(out.indexOf('skill-001')).toBeLessThan(out.indexOf('skill-002'))
    expect(out.indexOf('skill-002')).toBeLessThan(out.indexOf('skill-003'))
  })
})

describe('formatSkillEntries minimum budget', () => {
  it('clamps sub-scaffolding budgets to a well-formed block (regression)', () => {
    // CodeRabbit PR #43: a budget smaller than the HEADER+CLOSE overhead used
    // to overflow it. The clamp keeps output well-formed XML scaffolding.
    const out = formatSkillEntries([mk(1)], {}, 10)
    expect(out.startsWith('<available_skills>')).toBe(true)
    expect(out.endsWith('</available_skills>')).toBe(true)
  })

  it('default-budget output still fits SKILL_PROMPT_CHAR_BUDGET', () => {
    const skills = Array.from({ length: 200 }, (_, i) => mk(i + 1))
    const out = formatSkillEntries(skills, {}, SKILL_PROMPT_CHAR_BUDGET)
    expect(out.length).toBeLessThanOrEqual(SKILL_PROMPT_CHAR_BUDGET)
  })
})