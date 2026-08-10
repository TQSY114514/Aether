// ─────────────────────────────────────────────────────────────────────────────
// models.js — TUI 侧模型列表读取（轻量，不引入 electron/llm 重链路）
// 与 electron/llm/agentCore.js listModels 同 SQL，供 /model 选择器使用。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 列出已启用的模型（provider 名 + 模型名），供 ↑↓ 选择器。
 * @param {object} db better-sqlite3 连接（openSessionDb 打开）
 * @returns {Array<{id:number, model_name:string, provider_id:number, is_primary:number, provider_name:string, api_format:string}>}
 */
export function listModels(db) {
  if (!db) return []
  try {
    return db.prepare(
      'SELECT m.id, m.model_name, m.provider_id, m.is_primary, p.name AS provider_name, p.api_format ' +
      'FROM model m JOIN provider p ON m.provider_id = p.id ' +
      'WHERE p.enabled = 1 ORDER BY m.provider_id, m.id'
    ).all()
  } catch {
    return []
  }
}

/**
 * 按名称查模型（支持 provider/model 或裸名），无匹配返回 null。
 * @param {object} db
 * @param {string} name
 */
export function findModel(db, name) {
  if (!db || !name) return null
  const models = listModels(db)
  const needle = String(name).trim()
  return models.find(
    (m) => m.model_name === needle || `${m.provider_name}/${m.model_name}` === needle
  ) || null
}
