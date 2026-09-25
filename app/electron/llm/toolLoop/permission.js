// ───────────────────────────────────────────────────────────────────────────
// toolLoop/permission.js — Permission Policy & Gatekeeper.
//
// Bridges agent execution mode ('auto' | 'ask' | 'plan' | 'custom')
// with tool risk classification ('safe' | 'dangerous') and user confirmation.
// ───────────────────────────────────────────────────────────────────────────

const permissions = require('../permissions')
const { getMergedTool } = require('../../mcp/manager')
const { getTool: getBuiltinTool } = require('../../tools/registry')

const PERMISSION_TIMEOUT_MS = 120000

/** Resolve a tool name against the merged registry. */
function resolveTool(name) {
  try {
    return getMergedTool(name) || getBuiltinTool(name)
  } catch {
    return getBuiltinTool(name)
  }
}

/** Translate the agent UI mode into the permission policy mode. */
function agentModeToPermissionMode(agentMode) {
  switch (agentMode) {
    case 'auto':   return 'Auto'
    case 'ask':    return 'Prompt'
    case 'plan':   return 'ReadOnly'
    case 'review': return 'ReadOnly'
    case 'custom': return 'Prompt'
    default:       return 'Prompt'
  }
}

/**
 * Ask the user for permission to run a dangerous tool via IPC event and wait for response.
 * @param {object} params
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
function requestPermissionWithTimeout({
  requestId,
  sessionId,
  toolName,
  toolArgs,
  timeoutMs = PERMISSION_TIMEOUT_MS,
  onRequest,
  onExpired,
  signal,
}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ allowed: false, reason: 'aborted' })

    const { registerPermissionWaiter } = require('../permissions')

    const timer = setTimeout(() => {
      cleanup()
      try { onExpired?.({ requestId, sessionId, toolName }) } catch {}
      resolve({ allowed: false, reason: 'timeout' })
    }, timeoutMs)

    const onAbort = () => {
      cleanup()
      resolve({ allowed: false, reason: 'aborted' })
    }

    const cleanup = () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    try {
      registerPermissionWaiter(requestId, (reply) => {
        cleanup()
        resolve({
          allowed: reply?.decision === 'allow' || reply?.decision === 'always',
          remember: reply?.decision === 'always',
          reason: reply?.reason || reply?.decision,
        })
      })

      onRequest?.({
        requestId,
        sessionId,
        toolName,
        toolArgs,
        timeoutMs,
      })
    } catch (e) {
      cleanup()
      resolve({ allowed: false, reason: e.message })
    }
  })
}

/**
 * Check whether a tool call can proceed immediately or requires permission.
 * @param {string} toolName
 * @param {object} policy - PermissionPolicy instance
 * @returns {{ allowed: boolean, requiresPrompt: boolean, risk: 'safe'|'dangerous' }}
 */
function checkToolPermission(toolName, policy) {
  const tool = resolveTool(toolName)
  const risk = tool ? tool.risk : 'dangerous'

  if (!policy) {
    return { allowed: risk === 'safe', requiresPrompt: risk === 'dangerous', risk }
  }

  const check = policy.check(toolName)
  if (check.granted) {
    return { allowed: true, requiresPrompt: false, risk }
  }

  if (check.promptUser) {
    return { allowed: false, requiresPrompt: true, risk }
  }

  return { allowed: false, requiresPrompt: false, risk }
}

module.exports = {
  ...permissions,
  resolveTool,
  agentModeToPermissionMode,
  requestPermissionWithTimeout,
  checkToolPermission,
}
