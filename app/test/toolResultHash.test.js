// toolResultHash 对抗性测试：键序无关、类型化语义哈希、易变键剥离。
import { describe, it, expect, beforeAll } from 'vitest'

let stableStringify, hashToolArgs, hashToolResult
beforeAll(async () => {
  const m = await import('../electron/llm/toolResultHash')
  stableStringify = m.stableStringify
  hashToolArgs = m.hashToolArgs
  hashToolResult = m.hashToolResult
})

describe('stableStringify', () => {
  it('键序无关', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })
  it('嵌套对象同样稳定', () => {
    expect(stableStringify({ x: { d: 1, c: 2 } })).toBe(stableStringify({ x: { c: 2, d: 1 } }))
  })
})

describe('hashToolArgs', () => {
  it('同参同哈希，参数键序无关', () => {
    const h1 = hashToolArgs('exec', { command: 'ls', cwd: '/tmp' })
    const h2 = hashToolArgs('exec', { cwd: '/tmp', command: 'ls' })
    expect(h1).toBe(h2)
    expect(h1.startsWith('exec:')).toBe(true)
  })
  it('异参异哈希', () => {
    expect(hashToolArgs('exec', { command: 'ls' })).not.toBe(hashToolArgs('exec', { command: 'pwd' }))
  })
})

describe('hashToolResult', () => {
  it('exec 类：只取 exitCode/timeout/输出尾，输出头部变化不影响', () => {
    // 差异区在前、共享尾(500字符)>OUTPUT_TAIL_CHARS(400)：尾部窗口完全落在相同区域
    const r1 = hashToolResult('run_command', { exitCode: 0, stdout: 'A'.repeat(600) + 'SAME'.repeat(125) })
    const r2 = hashToolResult('run_command', { exitCode: 0, stdout: 'B'.repeat(600) + 'SAME'.repeat(125) })
    expect(r1).toBe(r2)
    expect(r1.startsWith('exec:')).toBe(true)
    const r3 = hashToolResult('run_command', { exitCode: 1, stdout: 'END' })
    expect(r3).not.toBe(r1)
  })
  it('write 类：只看是否产生变更', () => {
    expect(hashToolResult('write_file', { changed: true, bytes: 10 }))
      .toBe(hashToolResult('write_file', { changed: true, bytes: 999 }))
  })
  it('generic 类：剥易变键后哈希', () => {
    const r1 = hashToolResult('delegate_task', { ok: true, messageId: 'aaa', ts: 1 })
    const r2 = hashToolResult('delegate_task', { ok: true, messageId: 'bbb', ts: 2 })
    expect(r1).toBe(r2)
  })
  it('exec 类：stdout 相同但 stderr 不同 → 哈希不同（回归：不得只看单回退链）', () => {
    const silentOk = { exitCode: 0, stdout: '', stderr: '' }
    const failA = { exitCode: 0, stdout: '', stderr: 'boom A' }
    const failB = { exitCode: 0, stdout: '', stderr: 'boom B' }
    expect(hashToolResult('run_command', failA)).not.toBe(hashToolResult('run_command', silentOk))
    expect(hashToolResult('run_command', failA)).not.toBe(hashToolResult('run_command', failB))
    // 同输入仍稳定
    expect(hashToolResult('run_command', failA)).toBe(hashToolResult('run_command', { exitCode: 0, stdout: '', stderr: 'boom A', noise: 'x'.repeat(900) }))
  })
})

  it('distinguishes empty-stdout results by their output field (no nullish-chain collision)', () => {
    const a = { exitCode: 0, stdout: '', output: 'result A' }
    const b = { exitCode: 0, stdout: '', output: 'result B' }
    expect(hashToolResult('run_command', a)).not.toBe(hashToolResult('run_command', b))
    // stdout 缺失时仍回落 output（旧行为保留）
    expect(hashToolResult('run_command', { exitCode: 0, output: 'result A' }))
      .toBe(hashToolResult('run_command', { exitCode: 0, stdout: '', output: 'result A' }))
  })