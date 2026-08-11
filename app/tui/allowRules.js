// ─────────────────────────────────────────────────────────────────────────────
// allowRules.js — 会话级 allow-rules 存储（todo 4）
// 纯逻辑、Electron-free：ruleKey 语义与 toolLoopCallbacks.js:19-31 完全一致
// （run_command → 首 token；write/edit → 目录；其余 → '*'），仅内存会话级。
// ─────────────────────────────────────────────────────────────────────────────

export function createAllowRulesStore() {
  const allowRules = new Map() // sessionId -> Set<string>

  function ruleKey(name, args) {
    if (name === 'run_command') {
      const cmd = String(args?.command || '').trim()
      const firstTok = cmd.split(/\s+/)[0] || cmd
      return firstTok
    }
    if (name === 'write_file' || name === 'edit_file') {
      const p = String(args?.path || '')
      const dir = p.includes('/') || p.includes('\\') ? p.replace(/[\\/][^\\/]*$/, '') : p
      return dir || p
    }
    return '*'
  }

  return {
    match(sessionId, name, args) {
      const set = allowRules.get(sessionId)
      if (!set) return false
      return set.has(`${name}:${ruleKey(name, args)}`) || set.has(`${name}:*`)
    },
    add(sessionId, name, args) {
      if (!allowRules.has(sessionId)) allowRules.set(sessionId, new Set())
      allowRules.get(sessionId).add(`${name}:${ruleKey(name, args)}`)
    },
    clear(sessionId) {
      allowRules.delete(sessionId)
    },
    // /permissions 展示: 返回当前会话规则数组 ['name:ruleKey', ...]
    list(sessionId) {
      const set = allowRules.get(sessionId)
      return set ? [...set] : []
    },
  }
}
