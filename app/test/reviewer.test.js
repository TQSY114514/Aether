// ─── reviewer enhancement tests ─────────────────────────────────────────────
// Covers the Wave 3 review enrichment: review checklist, diff summary, and
// PR suggestion blocks built from validated issues. Pure helpers only — no
// LLM calls. reviewChanges/reviewFiles signatures stay unchanged; the summary
// string they return now carries the extra sections via composeSummary.

import { describe, it, expect } from 'vitest'

import {
  buildChecklist,
  diffSummary,
  buildPrSuggestion,
  composeSummary,
  validIssue,
  formatReviewSummary,
  REVIEW_DIMENSIONS,
} from '../electron/llm/reviewer'

const sampleIssues = [
  { severity: 'high', dimension: 'bug', file: 'a.js', line: 10, issue: 'null deref', suggestion: 'guard it' },
  { severity: 'low', dimension: 'style', file: 'b.js', issue: 'dead code' },
]

describe('buildChecklist', () => {
  it('marks every dimension as passed when there are no issues', () => {
    const out = buildChecklist([])
    expect(out).toContain('### 审阅清单')
    for (const dim of REVIEW_DIMENSIONS) {
      expect(out).toContain(`- [x]`)
    }
    expect(out).not.toContain('- [ ]')
  })

  it('leaves dimensions with issues unchecked and reports counts', () => {
    const out = buildChecklist(sampleIssues)
    expect(out).toContain('- [ ] 逻辑正确性: 1 处问题')
    expect(out).toContain('- [ ] 风格与可维护性: 1 处问题')
    expect(out).toContain('- [x] 安全: 通过')
    expect(out).toContain('- [x] 性能: 通过')
  })
})

describe('diffSummary', () => {
  it('counts added/removed lines and files from a unified diff', () => {
    const diff = [
      'diff --git a/a.js b/a.js',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1,3 +1,4 @@',
      ' const x = 1',
      '+const y = 2',
      '+const z = 3',
      '-const old = 0',
      '--- a/c.js',
      '+++ b/c.js',
      '+export default 1',
    ].join('\n')
    const out = diffSummary(diff)
    expect(out).toContain('### Diff 摘要')
    expect(out).toContain('- 文件数: 2')
    expect(out).toContain('- +3 / -1')
  })

  it('returns null for empty or whitespace-only diffs', () => {
    expect(diffSummary('')).toBe(null)
    expect(diffSummary('   \n\t ')).toBe(null)
    expect(diffSummary(null)).toBe(null)
  })

  it('flags truncation for oversized diffs', () => {
    const big = `+++ b/big.js\n+${'x'.repeat(20001)}`
    const out = diffSummary(big)
    expect(out).toContain('截断')
  })
})

describe('buildPrSuggestion', () => {
  it('suggests a fix title and severity counts for string[] files', () => {
    const out = buildPrSuggestion({ files: ['src/foo.js', 'src/bar.js'], issues: sampleIssues })
    expect(out).toContain('### PR 建议')
    expect(out).toContain('建议标题: fix: 修复审阅发现的问题 — foo.js')
    expect(out).toContain('2 个问题(critical 0 / high 1 / medium 0 / low 1)')
  })

  it('accepts reviewFiles-style { path, content } objects', () => {
    const out = buildPrSuggestion({ files: [{ path: 'src/a.ts', content: 'x' }], issues: [] })
    expect(out).toContain('建议标题: feat: a.ts')
  })

  it('produces a clean-change suggestion when there are no issues', () => {
    const out = buildPrSuggestion({ files: ['src/ok.js'], issues: [] })
    expect(out).toContain('审阅通过,未发现问题')
    expect(out).toContain('建议标题: feat: ok.js')
  })
})

describe('composeSummary', () => {
  it('appends checklist, diff summary, and PR suggestion after the review summary', () => {
    const summary = composeSummary({ issues: sampleIssues, files: ['src/foo.js'], diff: '+++ b/src/foo.js\n+const a = 1\n' })
    expect(summary.startsWith(formatReviewSummary(sampleIssues))).toBe(true)
    expect(summary.indexOf('### 审阅清单')).toBeGreaterThan(-1)
    expect(summary.indexOf('### Diff 摘要')).toBeGreaterThan(summary.indexOf('### 审阅清单'))
    expect(summary.indexOf('### PR 建议')).toBeGreaterThan(summary.indexOf('### Diff 摘要'))
  })

  it('omits the diff section when no diff is provided (reviewFiles path)', () => {
    const summary = composeSummary({ issues: [], files: [{ path: 'src/a.ts', content: 'x' }] })
    expect(summary).not.toContain('### Diff 摘要')
    expect(summary).toContain('### 审阅清单')
    expect(summary).toContain('### PR 建议')
  })

  it('reports severity counts in the PR block for reviewed changes', () => {
    const summary = composeSummary({ issues: sampleIssues, files: [], diff: '+++ b/x\n+x\n' })
    expect(summary).toContain('critical 0 / high 1')
  })
})

describe('validIssue (regression)', () => {
  it('keeps only well-formed issues and drops malformed entries', () => {
    const mixed = [
      ...sampleIssues,
      { severity: 'nope', dimension: 'bug', issue: 'bad severity' },
      { severity: 'high', dimension: 'bug' }, // missing issue text
      null,
    ]
    const kept = mixed.filter(validIssue)
    expect(kept).toHaveLength(2)
  })
})