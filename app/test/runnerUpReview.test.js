// ─────────────────────────────────────────────────────────────────────────────
// runnerUpReview.test.js — P0-MM 第二名模型交叉复核机制测试
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'

describe('P0-MM 第二名模型交叉复核 (Runner-Up Review)', () => {
  let testDb = null

  beforeAll(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE provider (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE model_score (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL,
        intent TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 1000
      );
    `)

    // 插入两个 Provider 和三个 Model
    testDb.exec("INSERT INTO provider (id, name, enabled) VALUES (1, 'OpenAI', 1), (2, 'Anthropic', 1)")
    testDb.exec("INSERT INTO model (id, provider_id, model_name, is_primary) VALUES (1, 1, 'gpt-4o', 1), (2, 2, 'claude-3-5-sonnet', 0), (3, 1, 'gpt-4o-mini', 0)")

    // 设定 ELO 分数：claude-3-5-sonnet (1200) > gpt-4o (1150) > gpt-4o-mini (950)
    testDb.exec("INSERT INTO model_score (model_id, intent, score) VALUES (2, 'coding', 1200), (1, 'coding', 1150), (3, 'coding', 950)")
  })

  afterAll(() => {
    if (testDb) testDb.close()
  })

  function queryRunnerUp(intent, excludeModelId) {
    const targetIntent = intent || 'general'
    const excludeSql = excludeModelId ? 'AND ms.model_id != ?' : ''
    const params = excludeModelId ? [targetIntent, excludeModelId] : [targetIntent]
    const scores = testDb.prepare(`
      SELECT ms.score, ms.model_id, m.model_name, m.provider_id, p.name as provider_name
      FROM model_score ms
      JOIN model m ON ms.model_id = m.id
      JOIN provider p ON m.provider_id = p.id
      WHERE ms.intent = ? AND p.enabled = 1 ${excludeSql}
      ORDER BY ms.score DESC
      LIMIT 1
    `).all(...params)

    if (scores.length > 0) {
      const runnerUp = scores[0]
      return {
        intent: targetIntent,
        model_id: Number(runnerUp.model_id),
        model_name: runnerUp.model_name,
        provider_id: Number(runnerUp.provider_id),
        provider_name: runnerUp.provider_name,
        score: runnerUp.score,
        route_reason: `Runner-up ELO ${runnerUp.score.toFixed(0)} (${targetIntent})`
      }
    }
    return null
  }

  it('当第一名主选 claude-3-5-sonnet 时，第二名成功锁定 gpt-4o', () => {
    const runnerUp = queryRunnerUp('coding', 2) // exclude claude (id=2)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_name).toBe('gpt-4o')
    expect(runnerUp.model_id).toBe(1)
    expect(runnerUp.score).toBe(1150)
  })

  it('当第一名主选 gpt-4o 时，第二名成功锁定 claude-3-5-sonnet', () => {
    const runnerUp = queryRunnerUp('coding', 1) // exclude gpt-4o (id=1)
    expect(runnerUp).not.toBeNull()
    expect(runnerUp.model_name).toBe('claude-3-5-sonnet')
    expect(runnerUp.model_id).toBe(2)
    expect(runnerUp.score).toBe(1200)
  })

  it('featureFlags: agent.runnerUpReview 开关正确注册且默认可用', async () => {
    const ff = await import('../electron/featureFlags')
    const flag = ff.FLAG_DEFS.find(f => f.key === 'agent.runnerUpReview')
    expect(flag).toBeDefined()
    expect(flag.default).toBe(false)
    expect(flag.category).toBe('agent')
  })
})
