// ───────────────────────────────────────────────────────────────────────────
// Agent Hooks — extensibility points in the agent loop.
//
// Inspired by Claude Code's hook system: users can define custom scripts
// that run at specific points in the agent lifecycle. Each hook is a JS file
// that exports a function receiving the hook context and returning void.
//
// Hook types:
//   PreToolUse    — before a tool executes (can block by throwing)
//   PostToolUse   — after a tool succeeds
//   ToolError     — after a tool fails
//   PreCompact    — before context compaction
//   PostCompact   — after context compaction
//   PreSend       — before the user message is sent to the model
//   PostResponse  — after the final response is generated
//   SessionStart  — when a new chat session begins (OpenClaw pattern)
//   SessionEnd    — when a chat session ends
//   SubagentStop  — before a sub-agent completes (Claude Code pattern)
//
// Hook location: <workspace>/.aetherai/hooks/<hook-name>.js
// Each file exports: module.exports = async function(ctx) { ... }
//   ctx = { toolName, args, result, error, sessionId, messageId, timestamp }
//   SessionStart ctx: { sessionId, timestamp }
//   SessionEnd ctx:   { sessionId, timestamp }
//   SubagentStop ctx: { taskId, output, iterations, sessionId }
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')
const log = require('../logger')

const HOOK_TYPES = new Set([
  'PreToolUse', 'PostToolUse', 'ToolError',
  'PreCompact', 'PostCompact', 'PreSend', 'PostResponse',
  'SessionStart', 'SessionEnd', 'SubagentStop',
])

// In-memory cache of loaded hook modules: hookType -> Map(name -> fn)
let _hooks = new Map()

function scanHooks() {
  _hooks.clear()
  const ws = getWorkspaceRoot()
  const hooksDir = path.join(ws, '.aetherai', 'hooks')
  if (!fs.existsSync(hooksDir)) return 0
  let count = 0
  try {
    const entries = fs.readdirSync(hooksDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.js')) continue
      const hookType = ent.name.replace(/\.js$/, '')
      if (!HOOK_TYPES.has(hookType)) continue
      const fullPath = path.join(hooksDir, ent.name)
      let fn
      try {
        fn = require(fullPath)
        if (typeof fn !== 'function') continue
      } catch (e) {
        log.warn(`hook load failed: ${fullPath}: ${e.message}`)
        continue
      }
      if (!_hooks.has(hookType)) _hooks.set(hookType, new Map())
      _hooks.get(hookType).set(ent.name, fn)
      count++
    }
  } catch {}
  return count
}

// Run all hooks of a given type. If any throws, the error propagates (used by
// PreToolUse to block execution). Non-PreToolUse hooks never block.
async function runHooks(type, ctx) {
  if (!_hooks.has(type)) return
  for (const [name, fn] of _hooks.get(type)) {
    try {
      await fn(ctx)
    } catch (e) {
      log.warn(`hook ${type}.${name} threw: ${e.message}`)
      if (type === 'PreToolUse') throw e // block on PreToolUse failure
    }
  }
}

// Rescan hooks from disk.
function rescan() { return scanHooks() }

// List all loaded hooks.
function listHooks() {
  const result = []
  for (const [type, map] of _hooks) {
    for (const [name] of map) {
      result.push({ type, name })
    }
  }
  return result
}

module.exports = { scanHooks, runHooks, rescan, listHooks, HOOK_TYPES }
