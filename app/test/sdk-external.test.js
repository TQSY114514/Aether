// ─────────────────────────────────────────────────────────────────────────────
// sdk-external.test.js — SDK 导出验收（todo 12）
// 双路径验证 package.json "exports" 生效：包自引用 require('aetherai/sdk')
// （Node self-reference，走 exports 映射）+ 相对路径 require('../electron/sdk') 兜底。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

describe('aetherai SDK export (todo 12)', () => {
  it('package self-reference require("aetherai/sdk") resolves via exports', () => {
    const sdk = require('aetherai/sdk')
    const keys = Object.keys(sdk)
    expect(keys).toContain('runAgent')
    expect(keys).toContain('openDatabase')
    expect(keys).toContain('resolveProviderModel')
    expect(keys).toContain('taskDbAdapter')
    expect(keys).toContain('memory')
    expect(keys).toContain('classifyAgentMode')
    expect(typeof sdk.runAgent).toBe('function')
    expect(typeof sdk.taskDbAdapter).toBe('function')
    expect(typeof sdk.classifyAgentMode).toBe('function')
    expect(typeof sdk.memory.search).toBe('function')
  })

  it('relative require("../electron/sdk") also exposes the API (fallback path)', () => {
    const sdk = require('../electron/sdk')
    expect(Object.keys(sdk)).toEqual(expect.arrayContaining(['runAgent', 'openDatabase', 'memory', 'taskDbAdapter', 'classifyAgentMode']))
  })

  it('classifyAgentMode works through the SDK', () => {
    const sdk = require('aetherai/sdk')
    expect(sdk.classifyAgentMode({ prompt: '删除文件' }).mode).toBe('ask')
    expect(sdk.classifyAgentMode({ prompt: 'read the README' }).mode).toBe('plan')
    expect(sdk.classifyAgentMode({ prompt: 'hello' }).mode).toBe('auto')
  })

  it('rpc wired after todo 10; sessionContext still lazy (undefined until todo 13)', () => {
    const sdk = require('aetherai/sdk')
    // todo 10 落地：rpc 帧模块经懒挂载自动出现
    expect(sdk.rpc).toBeTruthy()
    expect(typeof sdk.rpc.pushFrame).toBe('function')
    expect(typeof sdk.rpc.consumeLine).toBe('function')
    // sessionContext 待 todo 13：访问缺失键即 undefined，不抛错
    expect(sdk.sessionContext).toBeUndefined()
  })
})
