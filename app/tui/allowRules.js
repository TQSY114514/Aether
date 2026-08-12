// ─────────────────────────────────────────────────────────────────────────────
// allowRules.js — 三态权限规则存储（W4-t24）
// 纯逻辑、Electron-free：ruleKey 语义与 toolLoopCallbacks.js:19-31 完全一致
// （run_command → 首 token；write/edit → 目录；其余 → '*'）。
// 规则分两层，匹配优先级 会话级 > 持久化；同层内 精确键 > 通配 `name:*`：
//   - 会话级 sessionRules: Map<sessionId, Map<ruleKey, decision>>（'a' 键添加, 内存）
//   - 持久化 persistedRules: Map<ruleKey, decision>，settings 表
//     （键 `permission_rule.<name>.<ruleKey>`，如 permission_rule.run_command.git_status;
//     仓库无 permissions 表——唯一路径）
// decision ∈ allow|deny|ask；decision() 返回 null = 无规则（走默认询问流程）。
// 向后兼容：match() 仍是布尔（仅 allow 命中），runSession.js 的
// createTuiPermissionHandler/decidePermission 无需改动。
// ─────────────────────────────────────────────────────────────────────────────
import { READ_ONLY_TOOLS } from './reducer.js'

export const RULE_DECISIONS = ['allow', 'deny', 'ask']

const PREFIX = 'permission_rule.'

// settings 键: permission_rule.<name>.<ruleKey>（W4-t24; 无 permissions 表）
export function permissionRuleKey(name, ruleKey) {
  return `${PREFIX}${name}.${ruleKey}`
}

// 从 settings 表载入全部持久化规则 → Map<`${name}:${ruleKey}`, decision>。
// db 为 better-sqlite3 连接（或实现 prepare().all() 的等价物）;
// 非法 decision 行防御性跳过（不抛错）。db 缺失 → 空 Map。
export function loadPersistedRules(db) {
  const out = new Map()
  if (!db || typeof db.prepare !== 'function') return out
  let rows = []
  try {
    rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'permission_rule.%'").all()
  } catch {
    return out
  }
  for (const row of rows) {
    const rest = String(row.key).slice(PREFIX.length)
    // 首个 '.' 切出工具名; 剩余段为 ruleKey（ruleKey 可含 '.'——首切分保真）
    const i = rest.indexOf('.')
    if (i <= 0) continue
    const name = rest.slice(0, i)
    const ruleKey = rest.slice(i + 1)
    if (!ruleKey || !RULE_DECISIONS.includes(row.value)) continue
    out.set(`${name}:${ruleKey}`, row.value)
  }
  return out
}

// 写入一条持久化规则（INSERT OR REPLACE; settings.key 为 PRIMARY KEY）。
export function savePersistedRule(db, name, ruleKey, decision) {
  if (!RULE_DECISIONS.includes(decision)) throw new Error(`invalid decision: ${decision}`)
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(permissionRuleKey(name, ruleKey), decision)
}

// 删除一条持久化规则。
export function removePersistedRule(db, name, ruleKey) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(permissionRuleKey(name, ruleKey))
}

// ── 工具名判定（W4-t26）──────────────────────────────────────────────────────
// 已知不匹配：READ_ONLY_TOOLS 是桌面短名（read/list/grep/glob/search/view），
// TUI 权限流的真实工具名是 read_file/list_dir/grep_search/glob_find 等
// （app/electron/tools/registry.js）——直接 includes 永远不命中。本 helper
// 兼容两种形态（精确名 或 `${entry}_` 前缀），不改动 READ_ONLY_TOOLS 数组。
export function isReadOnlyTool(name, readOnlyTools = READ_ONLY_TOOLS) {
  if (!name) return false
  if (readOnlyTools.includes(name)) return true
  return readOnlyTools.some((t) => name.startsWith(`${t}_`))
}

// 写类工具判定：兼容桌面短名（edit/write）与真实工具名（edit_file/write_file）。
export function isWriteTool(name) {
  return name === 'edit' || name === 'write' || name === 'edit_file' || name === 'write_file'
}

// ── 审批包装决策核心（W4-t26; App.mjs tuiPermission 使用, 纯函数可单测）───────
// 返回 'true' | 'false'（直接定案）| null（询问流程——交 basePermission）。
// 决策顺序（写死语义, 与 toolLoopCallbacks 一致）:
//   deny 规则 > 只读自动放行 > 审批模式( auto-edits 写放行 / plan 写拒绝 ) >
//   dontask( 仅 allow 规则 ) > allow 规则 > 询问。
// dontask 下 ask_user/无规则写工具一律静默拒绝（安全红线: 不弹窗）。
export function decideTuiPermission({ decision, name, approvalMode }) {
  if (decision === 'deny') return false
  if (isReadOnlyTool(name)) return true
  if (approvalMode === 'auto-edits' && isWriteTool(name)) return true
  if (approvalMode === 'plan' && !isReadOnlyTool(name)) return false
  if (approvalMode === 'dontask') return decision === 'allow'
  if (decision === 'allow') return true
  return null // ask / 无规则 → 询问面板
}

// ── 规则存储 ────────────────────────────────────────────────────────────────
/**
 * @param {object} [opts]
 * @param {object} [opts.db]         better-sqlite3 连接; 创建时载入持久化规则（一次,
 *                                   载入后连接即可关闭——规则已复制进内存 Map）
 */
export function createAllowRulesStore({ db = null } = {}) {
  const sessionRules = new Map()   // sessionId -> Map<ruleKey, decision>
  const persistedRules = new Map() // ruleKey -> decision
  for (const [k, d] of loadPersistedRules(db)) persistedRules.set(k, d)

  function keyOf(name, args) {
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

  // 同层查找: 精确键优先, 通配 `name:*` 兜底（W4-t24 具体性规则）
  function layerLookup(layer, name, key) {
    if (!layer) return null
    if (layer.has(`${name}:${key}`)) return layer.get(`${name}:${key}`)
    return layer.get(`${name}:*`) || null
  }

  function decision(sessionId, name, args) {
    const key = keyOf(name, args)
    // 会话级 > 持久化（W4-t24 文档语义; 会话规则目前仅 'a' 键产生, 均为 allow）
    const s = layerLookup(sessionRules.get(sessionId), name, key)
    if (s != null) return s
    return layerLookup(persistedRules, name, key)
  }

  return {
    keyOf,
    // 三态决策: 'allow' | 'deny' | 'ask' | null（null = 无规则, 走默认询问）
    decision,
    // 向后兼容布尔语义（runSession.js / decidePermission）: 仅 allow 命中
    match(sessionId, name, args) {
      return decision(sessionId, name, args) === 'allow'
    },
    // 'a' 键: 会话级 allow（既有语义; W4-t24 #4 起同步落持久化层, 见 App.mjs persistPendingAllow）
    add(sessionId, name, args) {
      const key = `${name}:${keyOf(name, args)}`
      if (!sessionRules.has(sessionId)) sessionRules.set(sessionId, new Map())
      sessionRules.get(sessionId).set(key, 'allow')
    },
    // 会话级任意 decision（测试/扩展用; 面板 'd' 删除走 remove）
    setSessionRule(sessionId, key, decision) {
      if (!RULE_DECISIONS.includes(decision)) throw new Error(`invalid decision: ${decision}`)
      if (!sessionRules.has(sessionId)) sessionRules.set(sessionId, new Map())
      sessionRules.get(sessionId).set(key, decision)
    },
    remove(sessionId, key) {
      const s = sessionRules.get(sessionId)
      if (s) s.delete(key)
    },
    clear(sessionId) {
      sessionRules.delete(sessionId)
    },
    // 会话规则 [{ key, decision }]（/permissions 对话框与持久化层合并展示）
    list(sessionId) {
      const s = sessionRules.get(sessionId)
      return s ? [...s.entries()].map(([key, decision]) => ({ key, decision })) : []
    },
    listPersisted() {
      return [...persistedRules.entries()].map(([key, decision]) => ({ key, decision }))
    },
    // 持久化写入（settings 行 + 内存 Map 同步; db 为一次性连接, App 层开关）;
    // db 为 null 时仅内存生效（无库环境降级, 不抛错）
    persist(db, name, ruleKey, decision) {
      if (!RULE_DECISIONS.includes(decision)) throw new Error(`invalid decision: ${decision}`)
      if (db) savePersistedRule(db, name, ruleKey, decision)
      persistedRules.set(`${name}:${ruleKey}`, decision)
    },
    removePersisted(db, name, ruleKey) {
      if (db) removePersistedRule(db, name, ruleKey)
      persistedRules.delete(`${name}:${ruleKey}`)
    },
  }
}
