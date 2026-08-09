// ─────────────────────────────────────────────────────────────────────────────
// sessionCommands.js — TUI 斜杠命令解析（todo 5，纯函数）
// /sessions（列表） /use <id>（切换） /fork [title]（创建子会话）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} input
 * @returns {{ type: 'sessions' } | { type: 'use', sessionId: number|null } | { type: 'fork', title?: string } | null}
 */
export function parseSessionCommand(input) {
  const text = String(input || '').trim()
  if (!text.startsWith('/')) return null
  const parts = text.split(/\s+/)
  const cmd = parts[0]
  const arg = parts.slice(1).join(' ').trim()
  switch (cmd) {
    case '/sessions':
      return { type: 'sessions' }
    case '/memory':
      return { type: 'memory', ...(arg ? { query: arg } : {}) }
    case '/persona': {
      const id = Number(arg)
      return { type: 'persona', personaId: Number.isFinite(id) && arg !== '' ? id : null }
    }
    case '/skills':
      return { type: 'skills' }
    case '/skill': {
      // /skill accept <key>  |  /skill dismiss <key>
      const [sub, ...rest] = arg.split(/\s+/)
      const key = rest.join(' ').trim()
      if (sub === 'accept' && key) return { type: 'skill-accept', key }
      if (sub === 'dismiss' && key) return { type: 'skill-dismiss', key }
      return null
    }
    case '/use': {
      const id = Number(arg)
      return { type: 'use', sessionId: Number.isFinite(id) && arg !== '' ? id : null }
    }
    case '/fork':
      return { type: 'fork', ...(arg ? { title: arg } : {}) }
    default:
      return null
  }
}
