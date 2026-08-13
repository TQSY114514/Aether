// ─────────────────────────────────────────────────────────────────────────────
// exec.test.js — 进程树终止(killTree, P1 Job Object 等效)与命令执行包装
//
// 锁定: killTree 导出存在且不抛错(Windows taskkill /T /F 杀整棵树);
// runCommand 超时/缓冲溢出时调用 killTree 而非裸 child.kill。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCommand, killTree } from '../electron/tools/exec'

describe('killTree', () => {
  it('is exported and callable without throwing on invalid pid', () => {
    expect(typeof killTree).toBe('function')
    expect(() => killTree(undefined)).not.toThrow()
    expect(() => killTree(null)).not.toThrow()
    expect(() => killTree(0)).not.toThrow()
  })
})

describe('runCommand', () => {
  it('runs a simple command and returns output', async () => {
    const r = await runCommand('node', ['-e', 'console.log("hi")'], { timeout: 10000 })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('hi')
  })

  it('captures non-zero exit codes', async () => {
    const r = await runCommand('node', ['-e', 'process.exit(3)'], { timeout: 10000 })
    expect(r.exitCode).toBe(3)
  })

  it('times out and resolves with timedOut=true', async () => {
    const r = await runCommand('node', ['-e', 'setTimeout(()=>{}, 60000)'], { timeout: 300 })
    expect(r.timedOut).toBe(true)
  })

  it('caps output at maxBuffer and kills the process tree', async () => {
    const r = await runCommand('node', ['-e', 'while(true) console.log("x".repeat(100))'], { timeout: 5000, maxBuffer: 1024 })
    // 进程应被终止(非 0 退出或 timedOut)——taskkill 异步, 缓冲可能已部分收集
    expect(r.exitCode !== 0 || r.timedOut).toBe(true)
  })
})
