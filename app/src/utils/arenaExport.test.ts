// ───────────────────────────────────────────────────────────────────────────
// arenaExport.test.ts — Arena leaderboard export/share helpers.
// RED first: assert the intended behavior before the implementation exists.
// ───────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { scoresToCsv, scoresToMarkdown } from './arenaExport'

type ScoreRow = {
  id: number
  model_id: number
  model_name: string
  provider_name: string
  intent: string
  score: number
  win_count: number
  total_count: number
}

const sample: ScoreRow[] = [
  { id: 1, model_id: 10, model_name: 'deepseek-v4', provider_name: 'DeepSeek', intent: 'coding', score: 1042.5, win_count: 5, total_count: 8 },
  { id: 2, model_id: 11, model_name: 'gpt-5', provider_name: 'OpenAI', intent: 'coding', score: 998, win_count: 3, total_count: 8 },
  { id: 3, model_id: 12, model_name: 'claude-4', provider_name: 'Anthropic', intent: 'math', score: 1010, win_count: 2, total_count: 4 },
]

describe('scoresToCsv', () => {
  it('emits a header row followed by one row per score', () => {
    const lines = scoresToCsv(sample).trim().split('\n')
    expect(lines[0]).toBe('intent,model,provider,score,wins,total')
    expect(lines).toHaveLength(sample.length + 1)
  })

  it('keeps numeric score/wins/total as plain numbers', () => {
    const lines = scoresToCsv(sample).trim().split('\n')
    expect(lines[1]).toBe('coding,deepseek-v4,DeepSeek,1042.5,5,8')
  })

  it('quotes fields containing commas or quotes (CSV escaping)', () => {
    const tricky: ScoreRow[] = [{ id: 9, model_id: 99, model_name: 'model,"x"', provider_name: 'Prov,ider', intent: 'general', score: 1000, win_count: 0, total_count: 1 }]
    const lines = scoresToCsv(tricky).trim().split('\n')
    // Second line: intent, then quoted model, then quoted provider.
    expect(lines[1]).toBe('general,"model,""x""","Prov,ider",1000,0,1')
  })

  it('returns just the header for an empty list', () => {
    expect(scoresToCsv([]).trim()).toBe('intent,model,provider,score,wins,total')
  })
})

describe('scoresToMarkdown', () => {
  it('groups rows by intent with a table per intent, sorted by score desc', () => {
    const md = scoresToMarkdown(sample)
    expect(md).toContain('## coding')
    expect(md).toContain('## math')
    // Within coding, deepseek (1042.5) must appear before gpt-5 (998).
    const codingSection = md.split('## coding')[1].split('##')[0]
    expect(codingSection.indexOf('deepseek-v4')).toBeLessThan(codingSection.indexOf('gpt-5'))
    // Table header present.
    expect(md).toContain('| Model | Provider | Score | Wins | Total |')
  })

  it('includes intent in the section header', () => {
    expect(scoresToMarkdown(sample)).toContain('### coding')
  })

  it('returns an empty string for no scores', () => {
    expect(scoresToMarkdown([])).toBe('')
  })

  it('escapes pipe characters in model/provider names', () => {
    const tricky: ScoreRow[] = [{ id: 9, model_id: 99, model_name: 'a|b', provider_name: 'c|d', intent: 'general', score: 1000, win_count: 0, total_count: 1 }]
    const md = scoresToMarkdown(tricky)
    expect(md).toContain('a\\|b')
    expect(md).toContain('c\\|d')
  })
})
