// ───────────────────────────────────────────────────────────────────────────
// app/electron/tools/trustEngine.js — 4-Tier Trust & Permission Engine
//
// Enforces the 4 developer-centric agent operating modes:
//   1. 'explore' (仅查看): Read-only exploration and inspection; strictly blocks file edits and destructive shell commands.
//   2. 'workspace' (工作区内修改 - default): Controlled workspace mutations with inline Diff preview and explicit confirmation on external shell commands.
//   3. 'auto_review' (自动审查): Supervised TDD loop; automatically mutates code, runs tests/checks, and triggers debugAgent self-healing on failure.
//   4. 'unrestricted' (完全权限): Autonomous execution in sandbox with background safety boundaries and zero popups.
//
// Bridges dynamic session trust scoring (0-100) with 4-tier permission gating.
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')
const { WRITE_TOOLS, READ_TOOLS, normalizeAgentMode } = require('../llm/toolLoopUtils')

// Forward or fallback to llm/trustEngine base scoring if present
let baseTrustEngine = null
try {
  baseTrustEngine = require('../llm/trustEngine')
} catch {}

const TRUST_INITIAL = baseTrustEngine?.TRUST_INITIAL ?? 50
const TRUST_MAX = 100
const TRUST_MIN = 0
const TRUST_AUTO_APPROVE = 80
const TRUST_YOLO_THRESHOLD = 50
const HIGH_RISK_TOOLS = baseTrustEngine?.HIGH_RISK_TOOLS ?? new Set(['write_file', 'edit_file', 'run_command', 'git_commit', 'git_push', 'apply_patch'])

// Destructive command pattern (e.g. system wipes, recursive deletions, disk formats)
const DESTRUCTIVE_COMMAND_REGEX = /(?:\brm\s+-(?:r[f]?|f?r)\b|\brm\s+.*--recursive\b|\bdel\s+.*[\/\-]s\b|\bdel\s+\/[sfq]|\brd\s+.*[\/\-]s\b|\brd\s+\/[sq]|\brmdir\s+.*[\/\-]s\b|\brmdir\s+[\/\-]s\b|\bformat\s+[a-z]:|\bmkfs|\bdd\s+if=.*of=|\bdrop\s+(?:database|table)\b|\btruncate\s+table\b)/i
const BENIGN_SHELL_REGEX = /^\s*(git\s+(status|diff|log|branch|show)|ls|dir|pwd|echo|cat|head|tail|node\s+-v|npm\s+-v|python\s+--version)\b/i

function isDestructiveCommand(cmd) {
  return DESTRUCTIVE_COMMAND_REGEX.test(String(cmd || ''))
}

function isBenignCommand(cmd) {
  return BENIGN_SHELL_REGEX.test(String(cmd || '').trim())
}

function isCriticalSystemWipe(cmd) {
  const c = String(cmd || '').trim().toLowerCase()
  return /rm\s+-(?:rf|fr|r\s+-f|f\s+-r)\s+[/~](?:\s|$|\*)/i.test(c) ||
         /(?:del|erase)\s+.*[\/\-]s.*[c-z]:[\\\/]*(?:\s|$|\*)/i.test(c) ||
         /(?:del|erase)\s+(?:\/[sfq]\s*)+\s*[c-z]:[\\\/]*(?:\s|$|\*)/i.test(c) ||
         /(?:rd|rmdir)\s+.*[\/\-]s.*[c-z]:[\\\/]*(?:\s|$|\*)/i.test(c) ||
         /(?:rd|rmdir)\s+(?:\/[sq]\s*)+\s*[c-z]:[\\\/]*(?:\s|$|\*)/i.test(c) ||
         /\bformat\s+[a-z]:/i.test(c) ||
         /\bmkfs\b/i.test(c) ||
         /\bdd\s+if=.*of=\/dev\/(?:sd[a-z]|nvme|hd[a-z])/i.test(c)
}

function getTrustScore(db, sessionId) {
  if (baseTrustEngine && typeof baseTrustEngine.getTrustScore === 'function') {
    return baseTrustEngine.getTrustScore(db, sessionId)
  }
  try {
    const row = db.prepare('SELECT trust_score, updated_at FROM session WHERE id = ?').get(sessionId)
    if (!row) return TRUST_INITIAL
    let score = row.trust_score
    if (score === null || score === undefined) return TRUST_INITIAL
    score = Number(score)
    const lastUpdate = row.updated_at
    if (lastUpdate) {
      const daysAgo = (Date.now() - new Date(lastUpdate).getTime()) / 86400000
      const weeks = Math.floor(daysAgo / 7)
      if (weeks > 0) score = Math.max(TRUST_MIN, score - weeks)
    }
    return Math.max(TRUST_MIN, Math.min(TRUST_MAX, score))
  } catch {
    return TRUST_INITIAL
  }
}

function adjustTrust(db, sessionId, delta, toolName) {
  if (baseTrustEngine && typeof baseTrustEngine.adjustTrust === 'function') {
    return baseTrustEngine.adjustTrust(db, sessionId, delta, toolName)
  }
  if (!db || !sessionId) return
  const current = getTrustScore(db, sessionId)
  const newScore = Math.max(TRUST_MIN, Math.min(TRUST_MAX, current + delta))
  try {
    const cols = db.prepare('PRAGMA table_info(session)').all()
    const hasTrustCol = Array.isArray(cols) && cols.some(c => c && c.name === 'trust_score')
    if (!hasTrustCol) return
    db.prepare("UPDATE session SET trust_score = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(newScore, sessionId)
  } catch {}
  return newScore
}

/**
 * Returns permission mode recommendation for a dangerous tool given session trust score.
 */
function getPermissionMode(db, sessionId, toolName) {
  if (baseTrustEngine && typeof baseTrustEngine.getPermissionMode === 'function') {
    return baseTrustEngine.getPermissionMode(db, sessionId, toolName)
  }
  const trust = getTrustScore(db, sessionId)
  if (trust >= TRUST_AUTO_APPROVE) {
    if (HIGH_RISK_TOOLS.has(toolName)) {
      return trust >= 95 ? 'yolo' : 'auto'
    }
    return 'auto'
  }
  return 'ask'
}

/**
 * Evaluates effective operating mode for a tool invocation across the 4 tiers.
 */
function getEffectiveMode(agentMode, toolName, db, sessionId) {
  const norm = normalizeAgentMode(agentMode)

  // Explore tier is strictly read-only
  if (norm === 'explore') return 'explore'

  // Unrestricted tier runs autonomously
  if (norm === 'unrestricted') return 'unrestricted'

  // Auto-review tier runs supervised TDD
  if (norm === 'auto_review') return 'auto_review'

  // In workspace (default) or legacy ask mode, evaluate adaptive trust
  if (norm === 'workspace') {
    if (sessionId && db) {
      const perm = getPermissionMode(db, sessionId, toolName)
      if (perm === 'auto') return 'auto_review'
      if (perm === 'yolo') return 'unrestricted'
    }
    return 'workspace'
  }

  // Preserve legacy exact string returns if legacy mode was explicitly passed
  if (agentMode === 'plan') return 'plan'
  if (agentMode === 'yolo') return 'yolo'
  if (agentMode === 'auto_confirm') return 'auto'
  if (agentMode === 'ask' && sessionId && db) {
    return getPermissionMode(db, sessionId, toolName)
  }

  return agentMode
}

/**
 * Validates whether a tool is allowed to execute under the given agent mode.
 * In 'explore' mode, strictly blocks mutating tools (write_file, edit_file, apply_patch, run_command, etc.).
 */
function checkToolAllowed(toolName, agentMode, toolArgs = {}) {
  const mode = normalizeAgentMode(agentMode)

  if (mode === 'explore') {
    let tool = null
    try {
      const registry = require('./registry')
      tool = registry.getTool(toolName)
    } catch {}

    const isDangerousMutating = (
      WRITE_TOOLS.has(toolName) ||
      tool?.risk === 'dangerous' ||
      toolName === 'run_command' ||
      toolName === 'exec' ||
      toolName === 'lsp_rename' ||
      toolName === 'sandbox_apply' ||
      toolName === 'extract_asar'
    )

    if (isDangerousMutating) {
      const isShell = toolName === 'run_command' || toolName === 'exec'
      return {
        allowed: false,
        requiresPrompt: false,
        promptRequired: false,
        reason: isShell
          ? 'Shell command execution is forbidden in read-only explore mode'
          : `Tool '${toolName}' is forbidden in read-only explore mode`
      }
    }
    return { allowed: true, requiresPrompt: false, promptRequired: false }
  }

  if (mode === 'workspace') {
    if (toolName === 'run_command' || toolName === 'exec') {
      const cmd = toolArgs.command || toolArgs.cmd || ''
      if (isDestructiveCommand(cmd)) {
        return {
          allowed: true,
          requiresPrompt: true,
          promptRequired: true,
          isDestructive: true,
          warning: 'Destructive shell command detected',
          reason: 'Destructive shell command requires explicit confirmation in workspace mode'
        }
      }
      if (isBenignCommand(cmd)) {
        return {
          allowed: true,
          requiresPrompt: false,
          promptRequired: false
        }
      }
      return {
        allowed: true,
        requiresPrompt: true,
        promptRequired: true,
        reason: 'External shell commands require explicit confirmation in workspace mode'
      }
    }
    return { allowed: true, requiresPrompt: false, promptRequired: false }
  }

  if (mode === 'auto_review') {
    return { allowed: true, requiresPrompt: false, promptRequired: false }
  }

  if (mode === 'unrestricted') {
    return { allowed: true, requiresPrompt: false, promptRequired: false }
  }

  return { allowed: true, requiresPrompt: true, promptRequired: true, reason: 'Explicit confirmation required' }
}

/**
 * Evaluates shell command safety under the current agent mode.
 */
function evaluateShellSafety(cmd, agentMode) {
  const mode = normalizeAgentMode(agentMode)
  const isDestruct = isDestructiveCommand(cmd)
  const isCritWipe = isCriticalSystemWipe(cmd)

  if (mode === 'explore') {
    return {
      allowed: false,
      proceed: false,
      requiresPrompt: false,
      promptRequired: false,
      isDestructive: isDestruct,
      reason: 'Shell commands are forbidden in read-only explore mode'
    }
  }

  if (mode === 'unrestricted') {
    if (isCritWipe) {
      return {
        allowed: false,
        proceed: false,
        requiresPrompt: false,
        promptRequired: false,
        isDestructive: true,
        reason: 'Critical system destructive command blocked by background safety boundaries'
      }
    }
    return {
      allowed: true,
      proceed: true,
      requiresPrompt: false,
      promptRequired: false,
      isDestructive: isDestruct
    }
  }

  if (isDestruct) {
    return {
      allowed: true,
      proceed: false,
      requiresPrompt: true,
      promptRequired: true,
      isDestructive: true,
      warning: 'Destructive shell command detected',
      reason: 'Destructive shell command requires explicit confirmation'
    }
  }

  if (mode === 'workspace') {
    const benign = isBenignCommand(cmd)
    return {
      allowed: true,
      proceed: benign,
      requiresPrompt: !benign,
      promptRequired: !benign,
      isDestructive: false
    }
  }

  return {
    allowed: true,
    proceed: true,
    requiresPrompt: false,
    promptRequired: false,
    isDestructive: false
  }
}

function getTrustBadge(scoreOrDb, sessionId) {
  let trust = 50
  if (typeof scoreOrDb === 'number') {
    trust = scoreOrDb
  } else if (scoreOrDb && sessionId) {
    if (baseTrustEngine && typeof baseTrustEngine.getTrustBadge === 'function') {
      const b = baseTrustEngine.getTrustBadge(scoreOrDb, sessionId)
      if (b && typeof b === 'object') {
        const level = b.trust >= 80 ? 'high' : b.trust >= 50 ? 'normal' : 'low'
        return { ...b, level }
      }
    }
    trust = getTrustScore(scoreOrDb, sessionId)
  }
  let color, label, level
  if (trust >= 80) { color = 'green'; label = 'trusted'; level = 'high' }
  else if (trust >= 50) { color = 'yellow'; label = 'normal'; level = 'normal' }
  else { color = 'red'; label = 'cautious'; level = 'low' }
  return { trust, color, label, level }
}

module.exports = {
  getTrustScore,
  adjustTrust,
  getPermissionMode,
  getEffectiveMode,
  getTrustBadge,
  checkToolAllowed,
  evaluateShellSafety,
  isDestructiveCommand,
  isBenignCommand,
  isCriticalSystemWipe,
  TRUST_INITIAL,
  TRUST_MAX,
  TRUST_MIN,
  TRUST_AUTO_APPROVE,
  TRUST_YOLO_THRESHOLD,
  HIGH_RISK_TOOLS,
}
