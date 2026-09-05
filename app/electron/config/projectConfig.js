// ─────────────────────────────────────────────────────────────────────────────
// projectConfig.js — P1-10 仓库级配置加载器 (OpenCode / Cursor 规范)
//
// 支持在项目根目录放置 .aether/config.json（或 .aether.json / opencode.json），
// 支持按项目覆写：
//   - defaultModel: string (为当前代码库绑定特定模型)
//   - mode: 'ask' | 'auto' | 'plan' (默认智能体运行模式)
//   - shadowWorkspace: boolean (强制使用影子工作区保护)
//   - tools: { deny: string[], allow: string[] } (工具黑白名单)
//   - ignorePatterns: string[] (敏感/忽略文件屏蔽规则)
//   - rules: string[] (内联规则或指向 .md 规则文件的相对路径)
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const CONFIG_CANDIDATES = [
  path.join('.aether', 'config.json'),
  '.aether.json',
  'opencode.json',
]

const CACHE_TTL_MS = 10_000
const cache = new Map() // workspaceRoot -> { config, timestamp }

function invalidateProjectConfigCache(workspaceRoot) {
  if (workspaceRoot) {
    cache.delete(workspaceRoot)
  } else {
    cache.clear()
  }
}

function normalizeConfig(raw = {}) {
  const tools = raw.tools || {}
  return {
    defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel.trim() : null,
    mode: ['ask', 'auto', 'plan'].includes(raw.mode) ? raw.mode : null,
    shadowWorkspace: typeof raw.shadowWorkspace === 'boolean' ? raw.shadowWorkspace : null,
    tools: {
      deny: Array.isArray(tools.deny) ? tools.deny.map(String) : [],
      allow: Array.isArray(tools.allow) ? tools.allow.map(String) : [],
    },
    ignorePatterns: Array.isArray(raw.ignorePatterns) ? raw.ignorePatterns.map(String) : [],
    rules: Array.isArray(raw.rules) ? raw.rules.map(String) : [],
    customConfigPath: raw._filePath || null,
  }
}

function loadProjectConfig(workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    return normalizeConfig()
  }

  const now = Date.now()
  const cached = cache.get(workspaceRoot)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.config
  }

  for (const rel of CONFIG_CANDIDATES) {
    const full = path.join(workspaceRoot, rel)
    try {
      if (fs.existsSync(full)) {
        const rawText = fs.readFileSync(full, 'utf8')
        const parsed = JSON.parse(rawText)
        if (parsed && typeof parsed === 'object') {
          parsed._filePath = full
          const cfg = normalizeConfig(parsed)
          cache.set(workspaceRoot, { config: cfg, timestamp: now })
          return cfg
        }
      }
    } catch (e) {
      // JSON parse error or read error — ignore silently and fallback
    }
  }

  const empty = normalizeConfig()
  cache.set(workspaceRoot, { config: empty, timestamp: now })
  return empty
}

function isToolAllowed(toolName, workspaceRoot) {
  if (!toolName) return { allowed: true }
  const cfg = loadProjectConfig(workspaceRoot)

  // 1. Check deny list
  if (cfg.tools.deny.length > 0 && cfg.tools.deny.includes(toolName)) {
    return {
      allowed: false,
      reason: `工具 "${toolName}" 已被项目配置 (.aether/config.json) 禁用 (deny list)`,
    }
  }

  // 2. Check allow list (if configured, acts as a whitelist)
  if (cfg.tools.allow.length > 0 && !cfg.tools.allow.includes(toolName)) {
    return {
      allowed: false,
      reason: `工具 "${toolName}" 不在项目配置允许的工具白名单中 (allow list)`,
    }
  }

  return { allowed: true }
}

function simpleGlobMatch(pattern, str) {
  if (pattern === str) return true
  // Convert basic glob (*, **) to RegExp
  const escaped = pattern
    .replace(/[.+^$${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
  const re = new RegExp('^' + escaped + '$', 'i')
  return re.test(str)
}

function isPathIgnored(targetPath, workspaceRoot) {
  if (!targetPath || !workspaceRoot) return false
  const cfg = loadProjectConfig(workspaceRoot)
  if (!cfg.ignorePatterns || cfg.ignorePatterns.length === 0) return false

  // Normalize relative path
  let rel = path.isAbsolute(targetPath) ? path.relative(workspaceRoot, targetPath) : targetPath
  rel = rel.replace(/\\/g, '/')
  if (rel.startsWith('./')) rel = rel.slice(2)

  const basename = path.basename(rel)

  for (const pattern of cfg.ignorePatterns) {
    const normPattern = pattern.replace(/\\/g, '/')
    if (simpleGlobMatch(normPattern, rel) || simpleGlobMatch(normPattern, basename)) {
      return true
    }
  }
  return false
}

function getProjectRules(workspaceRoot) {
  if (!workspaceRoot) return []
  const cfg = loadProjectConfig(workspaceRoot)
  if (!cfg.rules || cfg.rules.length === 0) return []

  const resolved = []
  for (const r of cfg.rules) {
    if (r.endsWith('.md') || r.endsWith('.txt')) {
      const full = path.resolve(workspaceRoot, r)
      try {
        if (fs.existsSync(full)) {
          const content = fs.readFileSync(full, 'utf8')
          if (content.trim()) resolved.push(content.trim())
          continue
        }
      } catch {}
    }
    resolved.push(r)
  }
  return resolved
}

module.exports = {
  loadProjectConfig,
  invalidateProjectConfigCache,
  isToolAllowed,
  isPathIgnored,
  getProjectRules,
}
