// ─────────────────────────────────────────────────────────────────────────────
// authStore.js — TUI/CLI 本地 API key 持久化存储(对齐 opencode auth.json /
// Claude credentials.json / Codex auth.json 行业惯例: 明文文件 + 0600 权限)
// 文件: ~/.config/aether/auth.json (可用 $AETHER_AUTH_FILE 覆盖路径)
// 结构: { "*": "<全局key>", "<provider名>": "<该provider的key>" }
// 桌面版 safeStorage 加密的 DB key headless 无法解密 → 用本文件持久化。
// 安全: 与行业一致——明文 + 0600; 不写入任何日志/状态。
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function authFilePath() {
  return process.env.AETHER_AUTH_FILE || join(homedir(), '.config', 'aether', 'auth.json')
}

/** 读全部已保存 key: { '*': globalKey, '<provider>': key } 或 null(无文件/损坏) */
export function loadAuthKeys() {
  const p = authFilePath()
  try {
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
    return null
  } catch {
    return null
  }
}

/** 保存 key: name='*' 为全局, 否则按 provider 名; 文件权限 0600(POSIX) */
export function saveAuthKey(name, key) {
  const p = authFilePath()
  const keys = loadAuthKeys() || {}
  keys[String(name || '*')] = String(key || '').trim()
  writeFileSync(p, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 })
  try { chmodSync(p, 0o600) } catch { /* Windows 无 chmod 语义, 忽略 */ }
}

/** 取某 provider 的 key: provider 专属 > 全局兜底 */
export function authKeyFor(providerName) {
  const keys = loadAuthKeys()
  if (!keys) return null
  const name = String(providerName || '').trim()
  if (name && keys[name]) return keys[name]
  return keys['*'] || null
}
