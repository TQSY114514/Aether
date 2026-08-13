// ─────────────────────────────────────────────────────────────────────────────
// arenaExport.test.js — Arena 2.0 对比报告导出(纯函数)
//
// 锁定: arenaRoundToMarkdown 生成含摘要表+详情的 Markdown; 变体标注;
// 管道符/换行转义; 空结果安全。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { arenaRoundToMarkdown } from '../src/utils/arenaExport'

const rows = [
  { model_name: 'model-a', provider_name: 'p1', variant: 'temp 0.2', latency_ms: 1200, content: 'answer A', usage: { total_tokens: 100, cost: 0.001 } },
  { model_name: 'model-a', provider_name: 'p1', variant: 'temp 0.8', latency_ms: 900, content: 'answer B', usage: { total_tokens: 80, cost: 0.0008 } },
  { model_name: 'model-b', provider_name: 'p2', variant: null, latency_ms: 1500, content: 'answer C' },
]

describe('arenaRoundToMarkdown', () => {
  it('includes prompt, count and a summary table sorted by latency', () => {
    const md = arenaRoundToMarkdown('fix this bug', rows)
    expect(md).toContain('**Prompt**: fix this bug')
    expect(md).toContain('**模型×变体数**: 3')
    expect(md).toContain('| 模型 | 变体 | 延迟 | Tokens | 成本 |')
    // 按延迟排序: model-a@0.8 (900) 应排在 model-a@0.2 (1200) 前
    const summary = md.slice(md.indexOf('## 摘要'), md.indexOf('## 详情'))
    expect(summary.indexOf('model-a') < summary.indexOf('model-a', summary.indexOf('model-a') + 1)).toBe(true)
    expect(summary).toContain('1200ms')
    expect(summary).toContain('$0.0010')
  })

  it('labels variants in details headers', () => {
    const md = arenaRoundToMarkdown('x', rows)
    expect(md).toContain('### model-a @ temp 0.2')
    expect(md).toContain('### model-a @ temp 0.8')
    expect(md).toContain('### model-b')
  })

  it('escapes pipes and newlines in fields', () => {
    const md = arenaRoundToMarkdown('a|b', [{ model_name: 'm|1', provider_name: 'p', content: 'line1\nline2' }])
    expect(md).toContain('a\\|b')
    expect(md).toContain('m\\|1')
    expect(md).not.toContain('| m|1 |')
  })

  it('handles empty results gracefully', () => {
    const md = arenaRoundToMarkdown('x', [])
    expect(md).toContain('**模型×变体数**: 0')
    expect(md).toContain('## 摘要')
  })
})
