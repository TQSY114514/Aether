// ─────────────────────────────────────────────────────────────────────────────
// protocolUrl.js — aetherai:// 协议 URL 解析（todo 17，纯函数，Electron-free，CJS）
// 动作集：
//   aetherai://new | aetherai://chat          → { action: 'new' | 'chat' }
//   aetherai://tui                            → { action: 'tui' }
//   aetherai://open/?path=C%3A%5Cmy%5Cproj    → { action: 'open', workspace: 'C:\\my\\proj' }
//   aetherai://open/C%3A%5Cmy%5Cproj          → 同上（pathname 形式）
// 未知/畸形 → { action: hostname } 或 null（调用方自行降级）。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} rawUrl
 * @returns {{ action: string, workspace?: string, raw: string } | null}
 */
function parseProtocolUrl(rawUrl) {
  const raw = String(rawUrl || '').trim()
  if (!raw) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'aetherai:') return null

  const action = url.hostname || ''
  const workspace = decodeWorkspace(url)

  if (action === 'open') {
    if (!workspace) return { action, raw }
    return { action, workspace, raw }
  }
  if (action === 'tui' || action === 'new' || action === 'chat') {
    return { action, raw }
  }
  return { action: action || 'unknown', raw }
}

function decodeWorkspace(url) {
  // 优先 query 参数 ?path=...
  const q = url.searchParams.get('path')
  if (q) return q
  // 其次 pathname：aetherai://open/C%3A%5Cmy%5Cproj → /C:\my\proj
  const p = decodeURIComponent(url.pathname || '').replace(/^[/\\]+/, '')
  return p || null
}

module.exports = { parseProtocolUrl }
