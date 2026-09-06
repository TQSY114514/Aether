// ─────────────────────────────────────────────────────────────────────────────
// runnerUpReview.test.js — P0-MM 第二名模型交叉复核机制测试
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const nodeRequire = createRequire(import.meta.url)

describe('P0-MM 第二名模型交叉复核 (Runner-Up Review)', () => {
  let database = null
  let tmpDir = null
  let restoredEntry = null
  let p1, p2, pDisabled
  let mGpt4o, mClaude, mMini, mDisabled

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-runner-up-test-'))
    const electronPath = nodeRequire.resolve('electron')
    restoredEntry = nodeRequire.cache[electronPath]
    nodeRequire.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        app: { getPath: () => tmpDir },
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (s) => Buffer.from(String(s)),
          decryptString: (b) => b.toString(),
        },
      },
    }

    database = await import('../electron/database')
    database.initDatabase()

    // 插入两个可用 Provider 和一个禁用 Provider
    p1 = database.addProvider({ name: 'OpenAI', api_url: 'https://api.openai.com/v1', enabled: 1 }).lastInsertRowid
    p2 = database.addProvider({ name: 'Anthropic', api_url: 'https://api.anthropic.com', enabled: 1 }).lastInsertRowid
    pDisabled = database.addProvider({ name: 'DisabledCo', api_url: 'https://api.disabled.com', enabled: 0 }).lastInsertRowid

    // 插入四个 Model
    mGpt4o = database.addModel({ provider_id: p1, model_name: 'gpt-4o', is_primary: 1 }).lastInsertRowid
    mClaude = database.addModel({ provider_id: p2, model_name: 'claude-3-5-sonnet', is_primary: 0 }).lastInsertRowid
    mMini = database.addModel({ provider_id: p1, model_name: 'gpt-4o-mini', is_primary: 0 }).lastInsertRowid
    mDisabled = database.addModel({ provider_id: pDisabled, model_name: 'disabled-supermodel', is_primary: 0 }).lastInsertRowid

    // 设定 ELO 分数：disabled-supermodel (1500) > claude-3-5-sonnet (1200) > gpt-4o (1150) > gpt-4o-mini (950)
    database.run("INSERT INTO model_score (model_id, intent, score) VALUES (?, 'coding', 1200)", mClaude)
    database.run("INSERT INTO model_score (model_id, intent, score) VALUES (?, 'coding', 1150)", mGpt4o)
    database.run("INSERT INTO model_score (model_id, intent, score) VALUES (?, 'coding', 950)", mMini)
    database.run("INSERT INTO model_score (model_id, intent, score) VALUES (?, 'coding', 1500)", mDisabled)
  })

  afterAll(() => {
    if (database && typeof database.closeDatabase === 'function') database.closeDatabase()
    if (restoredEntry === undefined) {
      const electronPath = nodeRequire.resolve('electron')
      delete nodeRequire.cache[electronPath]
    }
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it('当第一名主选 claude-3-5-sonnet 时，第二名成功锁定 gpt-4o', () => {
    const runnerUp = database.getRunnerUpModel('coding', mClaude)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_name).toBe('gpt-4o')
    expect(runnerUp.model_id).toBe(mGpt4o)
    expect(runnerUp.score).toBe(1150)
  })

  it('当第一名主选 gpt-4o 时，第二名成功锁定 claude-3-5-sonnet', () => {
    const runnerUp = database.getRunnerUpModel('coding', mGpt4o)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_name).toBe('claude-3-5-sonnet')
    expect(runnerUp.model_id).toBe(mClaude)
    expect(runnerUp.score).toBe(1200)
  })

  it('正确过滤禁用 Provider (disabled provider filtering)', () => {
    // disabled-supermodel 分数最高 (1500)，但所在 provider.enabled=0，绝不能被推荐
    const runnerUp = database.getRunnerUpModel('coding', null)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_id).toBe(mClaude)
    expect(runnerUp.model_name).not.toBe('disabled-supermodel')
  })

  it('当主选 Provider 被禁用时，平滑选择其他可用 Provider 的次优模型', () => {
    database.run('UPDATE provider SET enabled = 0 WHERE id = ?', p2)
    // 排除 gpt-4o，且 Claude 的 provider 被禁用，应顺延到 gpt-4o-mini
    const runnerUp = database.getRunnerUpModel('coding', mGpt4o)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_id).toBe(mMini)
    expect(runnerUp.model_name).toBe('gpt-4o-mini')
    // 恢复 provider 2
    database.run('UPDATE provider SET enabled = 1 WHERE id = ?', p2)
  })

  it('当无匹配 ELO 分数时，回退到主模型或可用模型 (fallback behavior)', () => {
    // 没有 math 分数
    const runnerUp = database.getRunnerUpModel('math', mClaude)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_id).toBe(mGpt4o)
    expect(runnerUp.route_reason).toBe('Secondary fallback')

    // 当主模型本身被排除时，回退到下一个可用模型
    const fallbackNext = database.getRunnerUpModel('math', mGpt4o)
    expect(fallbackNext).not.toBeNull()
    expect(fallbackNext.model_id).not.toBe(mGpt4o)
  })

  it('featureFlags: agent.runnerUpReview 开关正确注册且默认可用', async () => {
    const ff = await import('../electron/featureFlags')
    const flag = ff.FLAG_DEFS.find(f => f.key === 'agent.runnerUpReview')
    expect(flag).toBeDefined()
    expect(flag.default).toBe(false)
    expect(flag.category).toBe('agent')
  })
})
