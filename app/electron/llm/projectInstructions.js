// ───────────────────────────────────────────────────────────────────────────
// Project Instruction Loader — Claude Code-style .aetherai.md / CLAUDE.md.
//
// Loads project-level instructions from the workspace root so the agent
// understands project conventions, coding standards, and constraints.
//
// Scan order (first match wins):
//   1. <workspace>/.aetherai.md        ← AetherAI-native
//   2. <workspace>/CLAUDE.md           ← Claude Code compat
//   3. <workspace>/AGENT.md            ← OpenClaw compat
//   4. <workspace>/GEMINI.md           ← Gemini CLI compat
//
// The loaded content is injected as a system message at the top of the
// conversation context. This mirrors how Claude Code loads CLAUDE.md
// and how OpenClaw loads AGENT.md.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')

const INSTRUCTION_FILES = ['.aetherai.md', 'CLAUDE.md', 'AGENT.md', 'GEMINI.md']
const CACHE_TTL_MS = 30_000 // re-read from disk every 30s to pick up edits
let _cached = null
let _cacheTime = 0

/**
 * Find and load the first matching instruction file from the workspace.
 * @returns {{ path: string, content: string, fileName: string } | null}
 */
function loadProjectInstructions() {
  const ws = getWorkspaceRoot()
  if (!ws) return null

  // Return cached copy if still fresh (avoids disk I/O on every turn).
  if (_cached && Date.now() - _cacheTime < CACHE_TTL_MS) return _cached

  for (const fname of INSTRUCTION_FILES) {
    const fp = path.join(ws, fname)
    try {
      const content = fs.readFileSync(fp, 'utf-8')
      if (content.trim().length > 0) {
        _cached = { path: fp, content: content.trim(), fileName: fname }
        _cacheTime = Date.now()
        return _cached
      }
    } catch {}
  }
  if (_cached) { _cached = null; _cacheTime = 0 } // no file found, invalidate cache
  return null
}

/**
 * Invalidate the cache. Call after writing/editing an instruction file.
 */
function invalidateCache() { _cached = null; _cacheTime = 0 }

/**
 * Build a system-message block from the loaded instructions.
 * Returns an object suitable for pushing into the conversation array, or null.
 */
function buildProjectContextMessage() {
  const inst = loadProjectInstructions()
  if (!inst) return null
  return {
    role: 'system',
    content: `## Project Instructions (${inst.fileName})\n\nThe following instructions are from the project root. Follow them unless the user explicitly overrides:\n\n${inst.content}`,
  }
}

/**
 * Check if a project instruction file exists (without reading it).
 */
function hasProjectInstructions() {
  const ws = getWorkspaceRoot()
  if (!ws) return false
  for (const fname of INSTRUCTION_FILES) {
    try { return fs.statSync(path.join(ws, fname)).isFile() } catch {}
  }
  return false
}

module.exports = {
  loadProjectInstructions,
  buildProjectContextMessage,
  invalidateCache,
  hasProjectInstructions,
}
