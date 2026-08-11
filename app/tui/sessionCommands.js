// ─────────────────────────────────────────────────────────────────────────────
// sessionCommands.js — TUI 斜杠命令解析 + 补全命令表（todo 5/8/13/20 + 体验）
// /sessions /use <id> /fork [title] /memory <q> /persona <id> /skills
// /skill accept|dismiss <key> /model <name> /effort <low|medium|high> /help /quit
// ─────────────────────────────────────────────────────────────────────────────

// 命令补全候选（斜杠提示用, 按字母序）
export const SLASH_COMMANDS = [
  '/effort', '/export', '/fork', '/help', '/memory', '/mode', '/model', '/permissions', '/persona', '/quit', '/status',
  '/sessions', '/skill accept', '/skill dismiss', '/skills', '/use',
]

/**
 * @param {string} input
 * @returns {{...}|null}
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
      const [sub, ...rest] = arg.split(/\s+/)
      const key = rest.join(' ').trim()
      if (sub === 'accept' && key) return { type: 'skill-accept', key }
      if (sub === 'dismiss' && key) return { type: 'skill-dismiss', key }
      return null
    }
    case '/model':
      return { type: 'model', name: arg || null }
    case '/mode':
      return { type: 'mode', mode: arg || null }
    case '/effort':
      return { type: 'effort', level: arg || null }
    case '/status':
      return { type: 'status' }
    case '/permissions':
      return { type: 'permissions' }
    case '/export':
      return { type: 'export', path: arg || null }
    case '/help':
      return { type: 'help' }
    case '/quit':
      return { type: 'quit' }
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
