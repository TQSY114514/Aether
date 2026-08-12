// ─────────────────────────────────────────────────────────────────────────────
// permDialog.js — /permissions 交互对话框纯逻辑（W4-t25）
// mergeRules: 会话级 + 持久化规则合并为展示行（来源标注 session/persisted）;
// filterRules: 按 name/ruleKey/decision/source 过滤; splitRuleKey: 首个 ':' 切分。
// 纯函数、Electron-free、可单测（App.mjs 渲染与 keyHandlers.js 过滤共用）。
// ─────────────────────────────────────────────────────────────────────────────

// 'run_command:git' → { name: 'run_command', ruleKey: 'git' };
// 'write_file:C:\src' → { name: 'write_file', ruleKey: 'C:\src' }（首个 ':' 切分,
// Windows 盘符冒号保留在 ruleKey 侧）
export function splitRuleKey(key) {
  const s = String(key || '')
  const i = s.indexOf(':')
  return i === -1 ? { name: s, ruleKey: '' } : { name: s.slice(0, i), ruleKey: s.slice(i + 1) }
}

// 合并会话级 + 持久化规则为展示行（来源列标注）。入参形状
// [{ key, decision }]（allowRules.list/listPersisted 的产物）;
// 非数组防御为空。会话行在前, 持久化行在后。
export function mergeRules(sessionRules, persistedRules) {
  const rows = []
  for (const r of sessionRules || []) {
    const { name, ruleKey } = splitRuleKey(r.key)
    rows.push({ key: r.key, name, ruleKey, decision: r.decision, source: 'session' })
  }
  for (const r of persistedRules || []) {
    const { name, ruleKey } = splitRuleKey(r.key)
    rows.push({ key: r.key, name, ruleKey, decision: r.decision, source: 'persisted' })
  }
  return rows
}

// 过滤（palette 式小写包含匹配; 空 filter 原样返回）
export function filterRules(rules, filter) {
  const f = String(filter || '').toLowerCase()
  if (!f) return rules
  return rules.filter((r) => `${r.name} ${r.ruleKey} ${r.decision} ${r.source}`.toLowerCase().includes(f))
}
