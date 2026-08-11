// ─────────────────────────────────────────────────────────────────────────────
// migrate-keys.cjs — 一次性迁移工具: 把桌面版 safeStorage 加密的 API key
// 解密并写入 TUI/CLI 的 auth.json(~/.config/aether/auth.json, 0600)。
//
// 为什么需要 Electron 跑: safeStorage(Windows DPAPI / macOS Keychain)解密
// 只能在 Electron 进程内完成, Electron-free 的 TUI 无法解密。
//
// 运行: npx electron scripts/migrate-keys.cjs [--db <path>]
//   --db 可选: 指定桌面版数据库(默认 %APPDATA%/aetherai/aetherai.db)
//
// 迁移后 TUI 直接可用(/apikey 不再需要; 与 /apikey 写入同一文件)。
// ─────────────────────────────────────────────────────────────────────────────
const { app, safeStorage } = require('electron')
const Database = require('better-sqlite3')
const os = require('os')
const path = require('path')
const fs = require('fs')

function defaultDbPath() {
  const base = process.env.APPDATA
    || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'))
  return path.join(base, 'aetherai', 'aetherai.db')
}

function authFilePath() {
  return process.env.AETHER_AUTH_FILE || path.join(os.homedir(), '.config', 'aether', 'auth.json')
}

function isBase64String(s) {
  if (!s || typeof s !== 'string') return false
  if (s.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]*={0,2}$/.test(s)
}

app.whenReady().then(() => {
  const dbArg = process.argv.indexOf('--db')
  const dbPath = dbArg !== -1 ? process.argv[dbArg + 1] : defaultDbPath()
  if (!fs.existsSync(dbPath)) {
    console.error(`[migrate-keys] 数据库不存在: ${dbPath}`)
    console.error('  桌面版还没运行过? 或改用 --db <path> 指定。')
    app.exit(1)
    return
  }

  const db = new Database(dbPath, { readonly: true })
  const rows = db.prepare('SELECT id, name, api_key FROM provider').all()
  const creds = []
  try {
    creds.push(...db.prepare('SELECT provider_id, api_key FROM provider_credential WHERE enabled = 1').all())
  } catch {}
  db.close()

  const encAvailable = safeStorage.isEncryptionAvailable()
  const keys = {}
  let migrated = 0
  let plaintext = 0
  let skipped = 0

  // 1) provider_credential 明文凭据直接拷(桌面版现行存储, 无需解密)
  const credByProvider = new Map()
  for (const c of creds) credByProvider.set(c.provider_id, c.api_key)

  for (const r of rows) {
    if (!r.api_key && !credByProvider.has(r.id)) { skipped++; continue }
    let plain = null
    const credKey = credByProvider.get(r.id)
    if (credKey) {
      plain = credKey
      plaintext++
    } else if (isBase64String(r.api_key)) {
      if (encAvailable) {
        try { plain = safeStorage.decryptString(Buffer.from(r.api_key, 'base64')); migrated++ }
        catch { plain = null; skipped++ }
      } else {
        skipped++
      }
    } else {
      plain = r.api_key // 桌面版明文遗留(未加密环境)
      plaintext++
    }
    if (plain) keys[r.name] = plain
  }

  if (!migrated && !plaintext) {
    console.log('[migrate-keys] 没有可迁移的 API key(provider 表为空或全部跳过)。')
    if (!encAvailable) console.log('  提示: 当前环境 safeStorage 不可用, 加密 key 无法解密(需在桌面版运行的机器上执行)。')
    app.exit(0)
    return
  }

  const out = authFilePath()
  // 与已存在的 /apikey 条目合并(不覆盖用户手工保存的)
  if (fs.existsSync(out)) {
    try { Object.assign(keys, JSON.parse(fs.readFileSync(out, 'utf8'))) } catch {}
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 })
  try { fs.chmodSync(out, 0o600) } catch {}

  console.log(`[migrate-keys] 完成: 解密迁移 ${migrated} 个 key, 明文直拷 ${plaintext} 个, 跳过 ${skipped} 个`)
  console.log(`[migrate-keys] 已写入: ${out} (0600)`)
  console.log('[migrate-keys] 现在启动 TUI 即可直接使用; /apikey 查看或 /model 切模型。')
  app.exit(0)
}).catch((err) => {
  console.error('[migrate-keys] 失败:', err && err.message ? err.message : err)
  app.exit(1)
})
