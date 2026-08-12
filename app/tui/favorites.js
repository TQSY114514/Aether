// ─────────────────────────────────────────────────────────────────────────────
// favorites.js — W3-t22: 模型收藏 + 最近使用循环纯助手（Electron-free）
//   favoriteKey(name)      settings 键: 'model.favorite.<name>'（文档写入 AGENTS）
//   toggleFavorite(existing)  '1' ⇄ '0'
//   recordRecent(recent, current)  最近使用列表维护（去重 + 前置 + 上限 5）
//   cycleRecent(recent, current)   F2 循环: 当前模型在列表 → 下一个（环绕）;
//                                不在 → 第一个; 空列表 → null
// 持久化: 调用方（App.mjs）用 taskDbAdapter(db).setSetting(key, val) 落 settings 表;
// 最近列表为内存态（不持久化, 计划写死"内存最近列表"）。
// ─────────────────────────────────────────────────────────────────────────────

export const RECENT_MODEL_MAX = 5

/**
 * 收藏的 settings 键（settings 表; 与 feature_flag.<key> 同级惯例）。
 * @param {string} modelName
 * @returns {string}
 */
export function favoriteKey(modelName) {
  return `model.favorite.${String(modelName || '')}`
}

/**
 * 收藏切换: '1' → '0'（取消）, 其余 → '1'（收藏）。
 * @param {string|null|undefined} existing  getSetting 返回值（null = 未收藏）
 * @returns {'1' | '0'}
 */
export function toggleFavorite(existing) {
  return existing === '1' ? '0' : '1'
}

/**
 * 记录一次模型使用: 去重后前置, 截断至上限。
 * @param {string[]} recent  最近列表（最前 = 最近）
 * @param {string} current
 * @returns {string[]}
 */
export function recordRecent(recent, current) {
  if (!current) return Array.isArray(recent) ? [...recent] : []
  const list = (Array.isArray(recent) ? recent : []).filter((n) => n !== current)
  return [current, ...list].slice(0, RECENT_MODEL_MAX)
}

/**
 * F2 循环取下一个模型名。
 * @param {string[]} recent  最近列表（最前 = 最近）
 * @param {string|null} current  当前模型名
 * @returns {string|null}  空列表 → null; current 在列表 → 下一个（末尾环绕到首）;
 *                         current 不在列表/为 null → 第一个。
 */
export function cycleRecent(recent, current) {
  const list = Array.isArray(recent) ? recent.filter(Boolean) : []
  if (!list.length) return null
  const i = list.indexOf(current)
  if (i === -1) return list[0]
  return list[(i + 1) % list.length]
}
