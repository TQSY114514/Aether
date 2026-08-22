// loopGuard 滑动窗无进展检测器测试（计划 Task2）
import { describe, it, expect, beforeAll } from 'vitest'
let LoopGuard

beforeAll(async () => {
  ;({ LoopGuard } = await import('../electron/llm/loopGuard'))
})

describe('LoopGuard', () => {
  it('无记录 → ok', () => {
    expect(new LoopGuard().evaluate().action).toBe('ok')
  })
  it('相同 (tool,args,result) 连续 <10 次 → ok', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 9; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x' })
    expect(g.evaluate().action).toBe('ok')
  })
  it('达到 10 次 → warn；20 次 → block', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 10; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x' })
    expect(g.evaluate()).toEqual({ action: 'warn', streak: 10 })
    for (let i = 0; i < 10; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x' })
    expect(g.evaluate().action).toBe('block')
  })
  it('结果变化打断 streak（有进展不算循环）', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 12; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x' })
    g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'y' }) // 结果变了
    expect(g.evaluate().action).toBe('ok')
  })
  it('不同工具/参数打断 streak', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 11; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x' })
    g.record({ toolName: 'read', argsHash: 'b', resultHash: 'z' })
    expect(g.evaluate().action).toBe('ok')
  })
  it('veto 记录维持 streak 不被误判为进展，且不与正常记录冲突', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 9; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x' })
    g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x', veto: true })
    expect(g.evaluate().streak).toBe(10)
  })
  it('veto 记录永不触发 block（模型响应警告的重试本身像重复）', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 25; i++) g.record({ toolName: 'exec', argsHash: 'a', resultHash: 'x', veto: true })
    expect(g.evaluate().action).not.toBe('block')
  })
  it('滑窗超过 30 条丢弃最旧', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 25; i++) g.record({ toolName: 't' + i, argsHash: 'a' + i, resultHash: 'r' + i })
    for (let i = 0; i < 9; i++) g.record({ toolName: 'end', argsHash: 'e', resultHash: 'f' })
    expect(g.evaluate().streak).toBe(9) // 只有尾部 9 条同类
  })
})
