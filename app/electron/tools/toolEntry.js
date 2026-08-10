// ─────────────────────────────────────────────────────────────────────────────
// toolEntry.js — 工具 entry 语义（todo 3 重构：isStart 判定单一来源）
// cli.js / rpc/server.js / tui(ESM import) / toolCards 四方共用，杜绝重复字面量。
// Electron-free、纯函数。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 判定原始 tool entry 是否为「开始」事件（cli.js:209-216 形状
 * { name, args, result, error, risk, latencyMs, startedAt }）：
 * startedAt 有值且 result/error 均空 = running（start）；否则为 end。
 * @param {object} [entry]
 * @returns {boolean}
 */
function isToolStart(entry) {
  return !!(entry && entry.result == null && entry.error == null && entry.startedAt != null)
}

module.exports = { isToolStart }
