// learning.handler.js — 「Agent 学习状态」overview IPC.
//
// 聚合 agent 闭环各层的沉淀量，让渲染层一个调用拿到「agent 学到了什么」的
// 完整快照：记忆来源分布 / 自动技能草稿 / 进化胶囊 / 习惯 / 回放轨迹。
// 全部只读、best-effort（单表缺失不抛错），无 LLM 调用。

const habitLearner = require('../llm/habitLearner')

function registerLearningHandlers(ipcMain, db) {
  ipcMain.handle('learning:overview', () => {
    const num = (v) => Number(v || 0)

    // 1. 记忆(按来源):assistant=agent 自动提取 / user=手动 / external=外部内容
    const memory = { total: 0, assistant: 0, user: 0, external: 0 }
    try {
      const rows = db.prepare('SELECT origin, COUNT(*) AS c FROM memory GROUP BY origin').all()
      for (const r of rows) {
        const key = ['assistant', 'user', 'external'].includes(r.origin) ? r.origin : 'user'
        memory[key] += num(r.c)
        memory.total += num(r.c)
      }
    } catch {}

    // 2. 自动技能(agent 通过 skillSelfCreate 自动 draft 的 SKILL.md)
    let autoSkills = 0
    try {
      autoSkills = num(db.prepare('SELECT COUNT(*) AS c FROM skill_drafts').get()?.c)
    } catch {}

    // 3. 进化胶囊(GEP 自进化引擎产出的 capsule)
    let evolution = 0
    try {
      evolution = num(db.prepare('SELECT COUNT(*) AS c FROM evolution_events').get()?.c)
    } catch {}

    // 4. 习惯(agent 学到的用户偏好 / standing instructions)
    const habits = { total: 0, recent: [] }
    try {
      const h = habitLearner.listHabits(db) || []
      habits.total = h.length
      habits.recent = h.slice(0, 5).map((x) => ({ key: x.key, imperative: x.imperative, occurrences: x.occurrences }))
    } catch {}

    // 5. 回放轨迹(experience replay 的成功轨迹池 skill_patterns)
    const replay = { total: 0, top: [] }
    try {
      replay.total = num(db.prepare('SELECT COUNT(*) AS c FROM skill_patterns').get()?.c)
      const top = db.prepare('SELECT signature, tools, count FROM skill_patterns ORDER BY count DESC LIMIT 5').all()
      replay.top = top.map((r) => ({ signature: r.signature, tools: r.tools, count: num(r.count) }))
    } catch {}

    return { memory, autoSkills, evolution, habits, replay }
  })

  // 跨 session 的最近 agent 审计轨迹(安全面板用)：工具调用 trace.
  ipcMain.handle('audit:recent', (_e, { limit = 30 } = {}) => {
    try {
      const rows = db.prepare('SELECT id, session_id, turn_id, payload, created_at FROM agent_execution_log ORDER BY id DESC LIMIT ?').all(limit)
      return rows.map((r) => {
        try { r.payload = JSON.parse(r.payload || '{}') } catch { r.payload = {} }
        return r
      })
    } catch {
      return []
    }
  })
}

module.exports = { registerLearningHandlers }