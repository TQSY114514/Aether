// ───────────────────────────────────────────────────────────────────────────
// app/electron/tools/trustEngine.js — Binary Plan / Act Trust & Safety Gate
//
// Converges the legacy 4-tier + 6-axis matrix into clean binary operating modes:
//   1. 'plan' (Read-Only Planning): Allows workspace reads, search, read-only Git
//      commands, read-only subagent exploration, and structured `session_plan`.
//      Blocks all file writes and state-mutating shell commands.
//   2. 'act' (Default Action Mode): Auto-executes workspace reads, searches,
//      code edits (with pre-write snapshot + inline Diff revert), and non-destructive
//      build/test commands without interrupting the stream.
//      ONLY triggers manual confirmation for the 3 high-risk scenarios:
//        (a) Paths outside Workspace Root
//        (b) Modifying sensitive credential files (.env*, *.pem, *.key)
//        (c) Destructive / high-risk shell commands (rm -rf, del /s,
//            git reset --hard, git push --force, or unknown remote script exec)
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { WRITE_TOOLS, normalizeAgentMode } = require('../llm/toolLoopUtils')

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

// Destructive or high-risk shell command patterns (Scenario 3)
const DESTRUCTIVE_COMMAND_REGEX = /(?:\brm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r|[a-z]*r)\b|\brm\s+.*--recursive\b|\bdel\s+.*\/s\b|\brd\s+.*\/s\b|\brmdir\s+.*\/s\b|\bremove-item\b.*-recurse\b|\bformat\s+[a-z]:|\bmkfs\b|\bdd\s+if=|\bdrop\s+(?:database|table)\b|\btruncate\s+table\b|\bgit\s+reset\s+--hard\b|\bgit\s+push\b[^\n]*(?:\s--force\b|\s-f\b|\s--force-with-lease\b))/i

const REMOTE_SCRIPT_EXEC_REGEX = /(?:\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh|ash|dash|node|python|python3|ruby|perl|php|pwsh|powershell)\b|\b(?:sh|bash|zsh|pwsh|powershell)\s+-c\s+["'`][^"'`]*\b(?:curl|wget|irm|iwr|invoke-webrequest|invoke-restmethod)\b|\b(?:irm|iwr|invoke-webrequest|invoke-restmethod)\b[^\n|]*\|\s*(?:iex|invoke-expression)\b)/i

const BENIGN_SHELL_REGEX = /^\s*(?:git\s+(?:status|diff|log|show|ls-files|rev-parse)(?:\s|$)|git\s+branch(?:\s+(?!--delete\b|-d\b|-D\b|-m\b|-M\b)\S*)*$|ls(?:\s|$)|dir(?:\s|$)|pwd(?:\s|$)|echo(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|findstr(?:\s|$)|which(?:\s|$)|where(?:\s|$)|type(?:\s|$)|node\s+-v\b|npm\s+-v\b|python\s+--version\b|npm\s+(?:test|run\s+\S+)|npx\s+(?:vitest|jest|tsc)\b|pnpm\s+(?:test|run\s+\S+)|yarn\s+(?:test|run\s+\S+)|pytest\b|cargo\s+(?:test|check|build)\b|go\s+(?:test|vet|build)\b)/i

const READONLY_PLAN_SHELL_REGEX = /^\s*(?:git\s+(?:status|diff|log|show|ls-files|rev-parse)(?:\s|$)|git\s+branch(?:\s+(?:-a\b|-r\b|-v\b|--list\b)\S*)*$|ls(?:\s|$)|dir(?:\s|$)|pwd(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|findstr(?:\s|$)|which(?:\s|$)|where(?:\s|$)|type(?:\s|$)|node\s+-v\b|npm\s+-v\b|python\s+--version\b)/i

const SHELL_CHAIN_REGEX = /[;&<>`\r\n]|\$\(|\|\|/

function isHighRiskShellCommand(cmd) {
  const s = String(cmd || '')
  return DESTRUCTIVE_COMMAND_REGEX.test(s) || REMOTE_SCRIPT_EXEC_REGEX.test(s)
}

function isDestructiveCommand(cmd) {
  return isHighRiskShellCommand(cmd)
}

function isBenignCommand(cmd) {
  const c = String(cmd || '').trim()
  if (!c || isHighRiskShellCommand(c)) return false
  return BENIGN_SHELL_REGEX.test(c) && !SHELL_CHAIN_REGEX.test(c)
}

function isReadOnlyPlanShellCommand(cmd) {
  const c = String(cmd || '').trim()
  if (!c || isHighRiskShellCommand(c)) return false
  if (/[;&<>`\r\n]|\$\(|\|\|/.test(c)) return false
  // Disallow piping in Plan mode unless piping strictly to harmless readers like head/tail/grep/sort/wc
  if (c.includes('|')) {
    const parts = c.split('|').map(s => s.trim())
    if (parts.length < 2 || !READONLY_PLAN_SHELL_REGEX.test(parts[0])) return false
    return parts.slice(1).every(seg => /^(?:head|tail|grep|rg|findstr|sort|uniq|wc|more)\b/i.test(seg))
  }
  return READONLY_PLAN_SHELL_REGEX.test(c)
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

function _realpathOrNearest(absPath) {
  try {
    return fs.realpathSync(absPath)
  } catch {
    try {
      const parent = path.dirname(absPath)
      if (parent && parent !== absPath) {
        const realParent = _realpathOrNearest(parent)
        return path.join(realParent, path.basename(absPath))
      }
    } catch {}
    return path.normalize(absPath)
  }
}

function isOutsideWorkspace(targetPath, workspaceRoot) {
  if (!targetPath || !workspaceRoot) return false
  const raw = String(targetPath).trim()
  if (!raw) return false
  // Windows raw/UNC prefixes escape normal root checks
  const winNorm = raw.replace(/\//g, '\\')
  if (/^\\{2,}\?[\\/]/.test(winNorm) || /^\\{2,}[^\\]+/.test(winNorm)) return true

  const rootResolved = _realpathOrNearest(path.resolve(String(workspaceRoot)))
  const absTarget = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(rootResolved, raw)
  const targetResolved = _realpathOrNearest(absTarget)

  const cmpRoot = process.platform === 'win32' ? rootResolved.toLowerCase() : rootResolved
  const cmpTarget = process.platform === 'win32' ? targetResolved.toLowerCase() : targetResolved
  const prefix = cmpRoot.endsWith(path.sep) ? cmpRoot : cmpRoot + path.sep
  return !(cmpTarget === cmpRoot || cmpTarget.startsWith(prefix))
}

function isSensitiveCredentialPath(targetPath) {
  if (!targetPath) return false
  const raw = String(targetPath).trim()
  if (!raw) return false
  const base = path.basename(raw).toLowerCase()
  if (base === '.env' || base.startsWith('.env.')) return true
  if (base.endsWith('.pem') || base.endsWith('.key')) return true
  return false
}

function _unwrapExtendedTool(toolName, toolArgs) {
  const args = (toolArgs && typeof toolArgs === 'object') ? toolArgs : {}
  if (toolName === 'call_extended_tool' && args.tool_name) {
    let innerArgs = args.arguments
    if (typeof innerArgs === 'string') {
      try { innerArgs = JSON.parse(innerArgs) } catch { innerArgs = {} }
    }
    return {
      effectiveName: String(args.tool_name),
      effectiveArgs: (innerArgs && typeof innerArgs === 'object') ? innerArgs : {},
    }
  }
  return { effectiveName: toolName, effectiveArgs: args }
}

function extractToolTargetPaths(toolName, toolArgs = {}) {
  const args = (toolArgs && typeof toolArgs === 'object') ? toolArgs : {}
  const paths = []
  for (const k of ['path', 'file_path', 'target_file', 'target', 'cwd', 'dir', 'outputDir', 'destination']) {
    if (args[k] && typeof args[k] === 'string') paths.push(args[k])
  }
  if (Array.isArray(args.paths)) {
    for (const p of args.paths) {
      if (typeof p === 'string' && p.trim()) paths.push(p)
    }
  }
  return [...new Set(paths)]
}

/**
 * Evaluates the 3 high-risk scenarios that require explicit user confirmation in Act mode:
 *   1. Reading or writing paths outside Workspace Root
 *   2. Modifying sensitive credential files (.env*, *.pem, *.key)
 *   3. Executing destructive or high-risk shell commands
 */
function evaluateHighRiskGate(toolName, toolArgs = {}, workspaceRoot = null) {
  const { effectiveName, effectiveArgs } = _unwrapExtendedTool(toolName, toolArgs)
  const paths = extractToolTargetPaths(effectiveName, effectiveArgs)

  // Scenario 1: Path outside Workspace Root (read, search, write, or shell cwd)
  if (workspaceRoot) {
    for (const p of paths) {
      if (isOutsideWorkspace(p, workspaceRoot)) {
        return {
          highRisk: true,
          scenario: 'outside_workspace',
          reason: `High-risk: path outside Workspace Root (${p})`,
          target: p,
        }
      }
    }
  }

  // Scenario 2: Modifying sensitive credential files (.env*, *.pem, *.key)
  const isMutating = WRITE_TOOLS.has(effectiveName) || effectiveName === 'delete_file' || effectiveName === 'create_or_update_file'
  if (isMutating) {
    for (const p of paths) {
      if (isSensitiveCredentialPath(p)) {
        return {
          highRisk: true,
          scenario: 'sensitive_credential',
          reason: `High-risk: modifying sensitive credential file (${path.basename(p)})`,
          target: p,
        }
      }
    }
  }

  // Scenario 3: Destructive or high-risk shell command (or shell modifying credential files)
  if (effectiveName === 'run_command' || effectiveName === 'exec' || effectiveName === 'run_shell') {
    const cmd = String(effectiveArgs.command || effectiveArgs.cmd || '')
    if (isHighRiskShellCommand(cmd)) {
      return {
        highRisk: true,
        scenario: 'high_risk_shell',
        isDestructive: true,
        reason: `High-risk shell command requires confirmation: ${cmd.slice(0, 100)}`,
        target: cmd,
      }
    }
    if (/(?:>|>>|\bcp\b|\bmv\b|\brm\b|\bdel\b|\bsed\s+-i)\s+[^\n]*(?:\.env\b|\.env\.|\S+\.pem\b|\S+\.key\b)/i.test(cmd)) {
      return {
        highRisk: true,
        scenario: 'sensitive_credential',
        reason: 'High-risk: shell command modifies sensitive credential file (.env* / *.pem / *.key)',
        target: cmd,
      }
    }
  }

  if (effectiveName === 'git_push' && /\s(--force|-f|--force-with-lease)\b/.test(String(effectiveArgs.flags || effectiveArgs.args || ''))) {
    return {
      highRisk: true,
      scenario: 'high_risk_shell',
      isDestructive: true,
      reason: 'High-risk: force push requires explicit confirmation',
    }
  }

  return { highRisk: false }
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
 * Resolves effective binary operating mode ('plan' | 'act' | 'off').
 */
function getEffectiveMode(agentMode) {
  return normalizeAgentMode(agentMode)
}

/**
 * Validates whether a tool is allowed under Binary Plan / Act mode.
 */
function checkToolAllowed(toolName, agentMode, toolArgs = {}, opts = {}) {
  const mode = normalizeAgentMode(agentMode)
  const { effectiveName, effectiveArgs } = _unwrapExtendedTool(toolName, toolArgs)

  if (mode === 'plan' || mode === 'off') {
    if (effectiveName === 'run_command' || effectiveName === 'exec' || effectiveName === 'run_shell') {
      const cmd = effectiveArgs.command || effectiveArgs.cmd || ''
      if (isReadOnlyPlanShellCommand(cmd)) {
        const risk = evaluateHighRiskGate(effectiveName, effectiveArgs, opts.workspaceRoot)
        if (risk.highRisk) {
          return {
            allowed: true,
            requiresPrompt: true,
            promptRequired: true,
            scenario: risk.scenario,
            reason: risk.reason,
          }
        }
        return { allowed: true, requiresPrompt: false, promptRequired: false }
      }
      return {
        allowed: false,
        requiresPrompt: false,
        promptRequired: false,
        reason: 'Mutating shell command execution is blocked in Plan mode',
      }
    }

    let tool = null
    try {
      const registry = require('./registry')
      tool = registry.getTool(effectiveName)
    } catch {}

    // Allow read-only subagent exploration, planning, and user Q&A in Plan mode
    if (effectiveName === 'dispatch_subagent') {
      const subRole = String(effectiveArgs?.role || 'explorer').trim().toLowerCase()
      const mutatingRoles = new Set(['implementer', 'writer', 'editor', 'coder', 'fixer', 'refactorer'])
      if (mutatingRoles.has(subRole)) {
        return {
          allowed: false,
          requiresPrompt: false,
          promptRequired: false,
          reason: `Mutating subagent role '${subRole}' is blocked in Plan mode`,
        }
      }
      return { allowed: true, requiresPrompt: false, promptRequired: false }
    }
    if (effectiveName === 'session_plan' || effectiveName === 'ask_user') {
      return { allowed: true, requiresPrompt: false, promptRequired: false }
    }

    const isMutatingOrDangerous = (
      WRITE_TOOLS.has(effectiveName) ||
      tool?.risk === 'dangerous' ||
      effectiveName === 'lsp_rename' ||
      effectiveName === 'sandbox_apply' ||
      effectiveName === 'extract_asar'
    )

    if (isMutatingOrDangerous) {
      return {
        allowed: false,
        requiresPrompt: false,
        promptRequired: false,
        reason: `Tool '${effectiveName}' is blocked in Plan mode`,
      }
    }

    const risk = evaluateHighRiskGate(effectiveName, effectiveArgs, opts.workspaceRoot)
    if (risk.highRisk) {
      return {
        allowed: true,
        requiresPrompt: true,
        promptRequired: true,
        scenario: risk.scenario,
        reason: risk.reason,
      }
    }
    return { allowed: true, requiresPrompt: false, promptRequired: false }
  }

  // 'act' mode: auto-execute normal workspace operations; prompt ONLY on the 3 high-risk scenarios
  if (effectiveName === 'run_command' || effectiveName === 'exec' || effectiveName === 'run_shell') {
    const cmd = effectiveArgs.command || effectiveArgs.cmd || ''
    if (isCriticalSystemWipe(cmd)) {
      return {
        allowed: false,
        requiresPrompt: false,
        promptRequired: false,
        isDestructive: true,
        reason: 'Critical system destructive command blocked',
      }
    }
  }

  const risk = evaluateHighRiskGate(toolName, toolArgs, opts.workspaceRoot)
  if (risk.highRisk) {
    return {
      allowed: true,
      requiresPrompt: true,
      promptRequired: true,
      isDestructive: !!risk.isDestructive,
      scenario: risk.scenario,
      warning: risk.isDestructive ? 'Destructive shell command detected' : undefined,
      reason: risk.reason,
    }
  }

  return { allowed: true, requiresPrompt: false, promptRequired: false }
}

/**
 * Evaluates shell command safety under Binary Plan / Act mode.
 */
function evaluateShellSafety(cmd, agentMode, opts = {}) {
  const mode = normalizeAgentMode(agentMode)
  const isDestruct = isHighRiskShellCommand(cmd)
  const isCritWipe = isCriticalSystemWipe(cmd)

  if (mode === 'plan' || mode === 'off') {
    if (isReadOnlyPlanShellCommand(cmd)) {
      return {
        allowed: true,
        proceed: true,
        requiresPrompt: false,
        promptRequired: false,
        isDestructive: false,
      }
    }
    return {
      allowed: false,
      proceed: false,
      requiresPrompt: false,
      promptRequired: false,
      isDestructive: isDestruct,
      reason: 'Mutating shell commands are blocked in Plan mode',
    }
  }

  if (isCritWipe) {
    return {
      allowed: false,
      proceed: false,
      requiresPrompt: false,
      promptRequired: false,
      isDestructive: true,
      reason: 'Critical system destructive command blocked',
    }
  }

  const risk = evaluateHighRiskGate('run_command', { command: cmd, cwd: opts.cwd }, opts.workspaceRoot)
  if (risk.highRisk) {
    return {
      allowed: true,
      proceed: false,
      requiresPrompt: true,
      promptRequired: true,
      isDestructive: !!risk.isDestructive,
      scenario: risk.scenario,
      warning: risk.isDestructive ? 'Destructive shell command detected' : undefined,
      reason: risk.reason,
    }
  }

  return {
    allowed: true,
    proceed: true,
    requiresPrompt: false,
    promptRequired: false,
    isDestructive: false,
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
  evaluateHighRiskGate,
  extractToolTargetPaths,
  isOutsideWorkspace,
  isSensitiveCredentialPath,
  isHighRiskShellCommand,
  isReadOnlyPlanShellCommand,
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
