// ─────────────────────────────────────────────────────────────────────────────
// sessionCommands.js — TUI 斜杠命令解析 + 补全命令表（todo 5/8/13/20 + 体验）
// /sessions /use <id> /fork [title] /memory <q> /persona <id> /skills
// /skill accept|dismiss <key> /model <name> /effort <low|medium|high> /help /quit
// W1（t10-t14）：/compact /compress-fast /context /clear /undo /recap
// ─────────────────────────────────────────────────────────────────────────────

// 命令补全候选（斜杠提示用, 按字母序）
export const SLASH_COMMANDS = [
  '/approval-mode', '/apikey', '/clear', '/compact', '/compress-fast', '/context', '/delete', '/diff', '/effort', '/export', '/fork', '/help', '/memory', '/mode', '/model', '/permissions', '/permissions add', '/persona', '/provider',
  '/provider add', '/provider list', '/quit', '/recap', '/rename', '/status',
  '/sessions', '/skill accept', '/skill dismiss', '/skills', '/undo', '/use',
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
    case '/apikey': {
      // /apikey <key> 存全局 | /apikey <provider> <key> 存指定 provider | /apikey 查看已存
      const parts = (arg || '').split(/\s+/)
      if (parts.length >= 2 && parts[1]) return { type: 'apikey', provider: parts[0], key: parts.slice(1).join(' ') }
      if (parts.length === 1 && parts[0]) return { type: 'apikey', provider: null, key: parts[0] }
      return { type: 'apikey', provider: null, key: null }
    }
    case '/permissions': {
      // W4-t25: /permissions 打开对话框; /permissions add <name> <ruleKey> <allow|deny|ask>
      // 行内解析（规则键取词边界; 带空格路径类 ruleKey 不支持, usage 提示兜底）
      const [sub, name, ruleKey, decision] = (arg || '').split(/\s+/)
      if (sub === 'add') {
        if (!name || !ruleKey || !decision) {
          return { type: 'permissions-add', usage: 'usage: /permissions add <name> <ruleKey> <allow|deny|ask>' }
        }
        if (!['allow', 'deny', 'ask'].includes(decision)) {
          return { type: 'permissions-add', usage: 'usage: decision must be allow|deny|ask' }
        }
        return { type: 'permissions-add', name, ruleKey, decision }
      }
      return { type: 'permissions' }
    }
    // W4-t26: /approval-mode [mode] — 无参查当前; 参数 ∈ manual|auto-edits|plan|dontask
    case '/approval-mode': {
      if (!arg) return { type: 'approval-mode' }
      if (!['manual', 'auto-edits', 'plan', 'dontask'].includes(arg)) {
        return { type: 'approval-mode', usage: 'usage: /approval-mode <manual|auto-edits|plan|dontask>' }
      }
      return { type: 'approval-mode', mode: arg }
    }
    case '/provider': {
      // /provider add <name> <base-url> [api-format] | /provider list
      // 缺参/非法 api-format → usage 消息（不崩溃、不落库）
      const [sub, ...rest] = arg.split(/\s+/)
      if (sub === 'list') return { type: 'provider-list' }
      if (sub === 'add') {
        const [name, url, apiFormat] = rest
        if (!name || !url) {
          return { type: 'provider-add', usage: 'usage: /provider add <name> <base-url> [api-format]' }
        }
        if (apiFormat && !['openai', 'anthropic'].includes(apiFormat)) {
          return { type: 'provider-add', usage: 'usage: api-format must be openai or anthropic (default: openai)' }
        }
        return { type: 'provider-add', name, url, apiFormat: apiFormat || null }
      }
      return { type: 'provider-usage', usage: 'usage: /provider add <name> <base-url> [api-format] | /provider list' }
    }
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
    // ── W1（t10-t14）会话上下文命令 ─────────────────────────────────────
    case '/compact':
      // 多余参数一律忽略（/compact foo 与 /compact 等价，防误输入崩溃）
      return { type: 'compact' }
    case '/compress-fast':
      return { type: 'compress-fast' }
    case '/context':
      return { type: 'context' }
    case '/clear':
      return { type: 'clear' }
    case '/undo':
      return { type: 'undo' }
    case '/recap':
      return { type: 'recap' }
    // ── W3（t23）未提交变更查看器 ────────────────────────────────────────
    case '/diff':
      return { type: 'diff' }
    // ── W2（t16）会话生命周期命令 ────────────────────────────────────────
    case '/rename':
      // /rename <title>; 空标题 → usage（不落库、不崩溃）
      return arg ? { type: 'rename', title: arg } : { type: 'rename', usage: 'usage: /rename <title>' }
    case '/delete':
      // /delete = 删除当前会话（id 取 reducer.dbSessionId）; 确认流程在 App 层
      return { type: 'delete' }
    default:
      return null
  }
}
