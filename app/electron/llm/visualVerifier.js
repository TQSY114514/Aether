// ───────────────────────────────────────────────────────────────────────────
// Visual Verifier — Closed-loop Frontend & UI Self-Healing Engine.
//
// Automatically captures offscreen screenshots and browser console logs
// using `web_visualize` after frontend code modifications. When UI errors,
// runtime exceptions, or broken layouts occur, it feeds visual and error feedback
// back into the tool loop for automated self-healing.
// ───────────────────────────────────────────────────────────────────────────

const { getTool } = require('../tools/registry')
const featureFlags = require('../featureFlags')
const log = require('../logger')

const FRONTEND_EXTS = /\.(tsx|jsx|vue|html|css|svelte|sass|less)$/i

/**
 * Check if the audit trail contains modifications to frontend UI files.
 * @param {Array<object>} auditTrail
 * @returns {boolean}
 */
function hasFrontendChanges(auditTrail) {
  if (!Array.isArray(auditTrail) || auditTrail.length === 0) return false

  for (const entry of auditTrail) {
    // Check tool name
    const name = entry.name || ''
    if (['write_file', 'edit_file', 'write_to_file', 'replace_file_content', 'file_write', 'file_patch', 'apply_patch'].includes(name)) {
      const args = entry.args || {}
      const targetPath = args.path || args.file || args.filePath || args.TargetFile || ''
      if (FRONTEND_EXTS.test(targetPath)) return true
    }
    // Also check diff or result if available
    if (entry.diff && FRONTEND_EXTS.test(entry.diff)) return true
  }
  return false
}

/**
 * Extract error lines from web_visualize tool results.
 * @param {string|Array<object>} result
 * @returns {Array<string>}
 */
function extractConsoleErrors(result) {
  let text = ''
  if (typeof result === 'string') {
    text = result
  } else if (Array.isArray(result)) {
    const textPart = result.find(p => p.type === 'text')
    text = textPart ? textPart.text : ''
  }

  const errors = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (/^(error:|uncaught|syntaxerror|typeerror|referenceerror)/i.test(trimmed)) {
      errors.push(trimmed)
    }
  }
  return errors
}

/**
 * Execute visual verification against a local preview / dev server.
 * @param {object} options
 * @param {object} [options.db]
 * @param {string|number} [options.sessionId]
 * @param {Array<object>} [options.auditTrail]
 * @param {string} [options.previewUrl]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ performed: boolean, ok: boolean, hasErrors: boolean, errors: string[], result: any }>}
 */
async function runVisualVerification({
  db,
  sessionId,
  auditTrail = [],
  previewUrl,
  signal,
  webViz: injectedWebViz,
} = {}) {
  // Check feature gate or explicit setting
  const isEnabled = db ? featureFlags.isEnabled(db, 'agent.visualVerification') : false
  if (!isEnabled && !previewUrl) {
    return { performed: false, ok: true, hasErrors: false, errors: [], result: null }
  }

  // Only run if frontend files were touched
  if (!previewUrl && !hasFrontendChanges(auditTrail)) {
    return { performed: false, ok: true, hasErrors: false, errors: [], result: null }
  }

  const webViz = injectedWebViz || getTool('web_visualize')
  if (!webViz) {
    return { performed: false, ok: true, hasErrors: false, errors: [], result: null }
  }

  const url = previewUrl || (db && typeof db.getSetting === 'function' ? db.getSetting('agent.previewUrl') : null) || 'http://localhost:5173'

  try {
    const res = await webViz.run({ url, waitMs: 1500 }, { db, sessionId, signal })
    const errors = extractConsoleErrors(res)
    const hasErrors = errors.length > 0 || (typeof res === 'string' && res.startsWith('[error:'))

    return {
      performed: true,
      ok: !hasErrors,
      hasErrors,
      errors,
      result: res,
      url,
    }
  } catch (err) {
    log.warn('Visual verification failed to execute:', err.message)
    return {
      performed: true,
      ok: false,
      hasErrors: true,
      errors: [err.message],
      result: null,
      url,
    }
  }
}

/**
 * Build a structured feedback prompt to inject into convo when visual verification detects issues.
 * @param {{ url: string, errors: string[], result: any }} verification
 * @returns {object} Message object ready to append to conversation
 */
function buildVisualFixPrompt(verification) {
  const errorText = verification.errors.length > 0
    ? verification.errors.join('\n')
    : 'Page render failure or empty capture detected.'

  const messageText = [
    `[Visual Verification Alert] The offscreen preview for ${verification.url} encountered errors after your code changes:`,
    '```',
    errorText,
    '```',
    'Please analyze the errors above, locate the cause in your modified files, and fix it before completing.',
  ].join('\n')

  // If web_visualize returned multimodal parts, forward the screenshot part so vision models see it
  if (Array.isArray(verification.result)) {
    const imagePart = verification.result.find(p => p.type === 'image' || p.type === 'image_url')
    if (imagePart) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: messageText },
          imagePart,
        ],
      }
    }
  }

  return { role: 'user', content: messageText }
}

module.exports = {
  hasFrontendChanges,
  extractConsoleErrors,
  runVisualVerification,
  buildVisualFixPrompt,
}
