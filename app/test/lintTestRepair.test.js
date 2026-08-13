// ─────────────────────────────────────────────────────────────────────────────
// lintTestRepair.test.js — 修复上下文窄化(desktop polish #3)
//
// 锁定: buildRepairContext 在有 changedFiles 时只注入命中相关文件的错误行;
// 无 changedFiles → 全量输出(向后兼容)。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildRepairContext, MAX_REPAIR_ROUNDS } from '../electron/llm/lintTestRepair'

const err = (kind = 'test', output = 'FAIL src/app.ts:12:34 error TS2322 type mismatch\nPASS src/other.ts\nsome unrelated line') => ({
  kind, command: 'npm test', output, exitCode: 1, timedOut: false,
})

describe('buildRepairContext', () => {
  it('returns null when there are no errors', () => {
    expect(buildRepairContext({ errors: [] })).toBeNull()
  })

  it('injects the full output without changedFiles (backward compat)', () => {
    const ctx = buildRepairContext({ errors: [err()], round: 1 })
    expect(ctx).toContain('FAIL src/app.ts')
    expect(ctx).toContain('some unrelated line')
  })

  it('narrows to lines mentioning changed files', () => {
    const ctx = buildRepairContext({ errors: [err()], round: 1, changedFiles: ['src/app.ts'] })
    expect(ctx).toContain('FAIL src/app.ts')
    expect(ctx).toContain('[仅显示与本次修改文件相关的错误: src/app.ts]')
    // 无关行被折叠
    expect(ctx).not.toContain('some unrelated line')
  })

  it('keeps the follow-up line after a hit (file:line:col + detail)', () => {
    const output = 'src/app.ts:12:34 - error TS2322\n  Type X is not assignable to Y\nnpm ERR! code 1'
    const ctx = buildRepairContext({ errors: [err('lint', output)], round: 1, changedFiles: ['src/app.ts'] })
    expect(ctx).toContain('Type X is not assignable to Y')
    expect(ctx).not.toContain('npm ERR')
  })

  it('handles multiple changed files and folds the rest', () => {
    const output = 'FAIL a.ts:1\nFAIL b.ts:2\nFAIL c.ts:3\nnoise line'
    const ctx = buildRepairContext({ errors: [err('test', output)], round: 2, changedFiles: ['a.ts', 'b.ts'] })
    expect(ctx).toContain('FAIL a.ts')
    expect(ctx).toContain('FAIL b.ts')
    expect(ctx).not.toContain('FAIL c.ts')
    expect(ctx).toContain('(省略')
  })

  it('reports when no error line hits the changed files', () => {
    const output = 'completely unrelated output\nmore noise'
    const ctx = buildRepairContext({ errors: [err('test', output)], round: 1, changedFiles: ['src/app.ts'] })
    expect(ctx).toContain('无命中修改文件的错误行')
  })

  it('caps changed-files list at 8 in the banner', () => {
    const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`)
    const ctx = buildRepairContext({ errors: [err()], round: 1, changedFiles: files })
    expect(ctx).toContain('f0.ts, f1.ts, f2.ts, f3.ts, f4.ts, f5.ts, f6.ts, f7.ts …')
  })

  it('includes round/maxRounds info', () => {
    const ctx = buildRepairContext({ errors: [err()], round: 2 })
    expect(ctx).toContain(`第 2/${MAX_REPAIR_ROUNDS} 轮修复`)
  })
})
