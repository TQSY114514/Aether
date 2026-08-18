// ─── Experience Replay unit tests ───────────────────────────────────────────
// Tests for electron/llm/replay.js: skill_patterns pattern pool — record,
// find, inject. Uses a fake db whose skill_patterns surface is an in-memory
// map. Flag enabled by persisting feature_flag.memory.experienceReplay.

import { describe, it, expect } from 'vitest'
import replay from '../electron/llm/replay'

const {
  isReplayEnabled, normalizeSignature, wordSimilarity, recordPattern,
  findPatterns, buildReplayContext,
} = replay

// ─── Fake db (skill_patterns as in-memory map) ──────────────────────────────
function mkDb({ enabled = true, patterns = [] } = {}) {
  const db = {
    _settings: { 'feature_flag.memory.experienceReplay': enabled ? '1' : '0' },
    _patterns: patterns.map(p => ({ ...p })),
    getSetting: (key) => db._settings[key] ?? null,
    run(sql, params = []) {
      if (sql.includes('INSERT INTO skill_patterns')) {
        db._patterns.push({ signature: params[0], tools: params[1], params_json: params[2], count: 1 })
      } else if (sql.includes('UPDATE skill_patterns')) {
        const row = db._patterns.find(p => p.signature === params[2])
        if (row) { row.count += 1; row.tools = params[0]; row.params_json = params[1] }
      }
    },
    allRows(sql, params = []) {
      if (sql.includes('SELECT signature FROM skill_patterns')) {
        return db._patterns.filter(p => p.signature === params[0]).map(p => ({ signature: p.signature }))
      }
      if (sql.includes('SELECT signature, tools, params_json, count')) {
        return db._patterns.map(p => ({ signature: p.signature, tools: p.tools, params_json: p.params_json, count: p.count }))
      }
      return []
    },
  }
  return db
}

// ─── Flag gating ────────────────────────────────────────────────────────────

describe('isReplayEnabled', () => {
  it('honors the feature flag', () => {
    expect(isReplayEnabled(mkDb({ enabled: true }))).toBe(true)
    expect(isReplayEnabled(mkDb({ enabled: false }))).toBe(false)
    expect(isReplayEnabled(null)).toBe(true) // 无 db/未存储 → 回落到 featureFlags 默认值(true)
  })
})

// ─── Normalization / similarity ─────────────────────────────────────────────

describe('normalizeSignature', () => {
  it('lowercases and collapses punctuation', () => {
    expect(normalizeSignature('  Fix the BUG!! in loader.ts ')).toBe('fix the bug in loader ts')
  })
})

describe('wordSimilarity', () => {
  it('returns 1 for identical text and 0 for disjoint', () => {
    expect(wordSimilarity('fix the bug', 'fix the bug')).toBe(1)
    expect(wordSimilarity('fix the bug', 'zzz qqq www')).toBe(0)
  })
  it('is partial for overlapping word sets', () => {
    const s = wordSimilarity('fix the bug in loader', 'fix the bug in parser')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

// ─── recordPattern ──────────────────────────────────────────────────────────

describe('recordPattern', () => {
  it('inserts a new pattern when the flag is on', () => {
    const db = mkDb()
    const row = recordPattern({ db, signature: 'fix the bug in loader', tools: ['read_file', 'edit_file'] })
    expect(row).not.toBeNull()
    expect(db._patterns.length).toBe(1)
    expect(db._patterns[0].count).toBe(1)
  })

  it('bumps count on repeated signature', () => {
    const db = mkDb()
    recordPattern({ db, signature: 'fix the bug', tools: ['read_file'] })
    recordPattern({ db, signature: 'fix the bug', tools: ['read_file'] })
    expect(db._patterns.length).toBe(1)
    expect(db._patterns[0].count).toBe(2)
  })

  it('is a no-op when the flag is off', () => {
    const db = mkDb({ enabled: false })
    const row = recordPattern({ db, signature: 'x', tools: [] })
    expect(row).toBeNull()
    expect(db._patterns.length).toBe(0)
  })

  it('is a no-op without a meaningful signature/toolset', () => {
    const db = mkDb()
    expect(recordPattern({ db, signature: '', tools: [] })).toBeNull()
  })

  it('serializes tools and params into the row', () => {
    const db = mkDb()
    recordPattern({ db, signature: 'refactor module', tools: ['edit_file', 'run_command'], params: { model: 'x' }, sessionId: 's1' })
    const stored = JSON.parse(db._patterns[0].params_json)
    expect(stored.sessionId).toBe('s1')
    expect(db._patterns[0].tools).toContain('edit_file')
  })
})

// ─── findPatterns ───────────────────────────────────────────────────────────

describe('findPatterns', () => {
  it('returns [] when disabled', () => {
    const db = mkDb({ enabled: false, patterns: [{ signature: 'x', tools: '[]', count: 1 }] })
    expect(findPatterns(db, 'x')).toEqual([])
  })

  it('ranks similar patterns above unrelated ones', () => {
    const db = mkDb({
      patterns: [
        { signature: 'fix the bug in loader', tools: '["read_file"]', count: 1 },
        { signature: 'write a haiku about cats', tools: '[]', count: 5 },
      ],
    })
    const result = findPatterns(db, 'fix the bug in loader again')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].signature).toBe('fix the bug in loader')
  })

  it('respects limit and minScore', () => {
    const db = mkDb({
      patterns: [
        { signature: 'same thing here', tools: '[]', count: 1 },
        { signature: 'same thing there', tools: '[]', count: 1 },
        { signature: 'totally unrelated words', tools: '[]', count: 1 },
      ],
    })
    const limited = findPatterns(db, 'same thing', { limit: 1 })
    expect(limited.length).toBe(1)
    const filtered = findPatterns(db, 'same thing', { minScore: 0.9 })
    expect(filtered.length).toBe(0)
  })
})

// ─── buildReplayContext ─────────────────────────────────────────────────────

describe('buildReplayContext', () => {
  it('renders a context block when patterns match', () => {
    const db = mkDb({ patterns: [{ signature: 'fix the bug in loader', tools: '["read_file","edit_file"]', count: 2 }] })
    const ctx = buildReplayContext(db, 'fix the bug in loader')
    expect(ctx).toContain('Experience replay')
    expect(ctx).toContain('fix the bug in loader')
    expect(ctx).toContain('read_file')
    expect(ctx).toContain('2 times')
  })

  it('returns empty string when nothing matches', () => {
    const db = mkDb({ patterns: [{ signature: 'unrelated', tools: '[]', count: 1 }] })
    expect(buildReplayContext(db, 'zxcvbnm qqq')).toBe('')
  })
})