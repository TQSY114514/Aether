// ───────────────────────────────────────────────────────────────────────────
// Workspace Detector — discover and load standard workspace files.
//
// P1-5: Workspace 概念 (inspired by OpenClaw's Workspace structure).
//
// Standard files (in scan order):
//   AGENTS.md      — Agent instructions (OpenClaw-style)
//   AETHER.md      — Aether-specific project conventions
//   SOUL.md        — Agent personality/identity
//   MEMORY.md      — Project-level persistent memory
//   CLAUDE.md      — Claude Code compat
//   GEMINI.md      — Gemini CLI compat
//
// Each file is loaded into a structured object for the agent system prompt.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')

const WORKSPACE_FILES = [
  { name: 'AGENTS.md', type: 'agent_instructions', description: 'Agent behavior instructions (OpenClaw-style)' },
  { name: 'AETHER.md', type: 'project_conventions', description: 'Aether-specific project conventions' },
  { name: 'SOUL.md', type: 'agent_personality', description: 'Agent personality and identity' },
  { name: 'MEMORY.md', type: 'project_memory', description: 'Project-level persistent memory' },
  { name: 'CLAUDE.md', type: 'project_conventions', description: 'Claude Code project conventions' },
  { name: 'GEMINI.md', type: 'project_conventions', description: 'Gemini CLI project conventions' },
]

// ── Cache ──────────────────────────────────────────────────────────────────

let _cached = null
let _cacheTime = 0
const CACHE_TTL_MS = 30_000

// ── Core functions ─────────────────────────────────────────────────────────

function detectWorkspaceFiles() {
  const ws = getWorkspaceRoot()
  if (!ws) return { workspace: root, files: [] }

  if (_cached && Date.now() - _cacheTime < CACHE_TTL_MS) return _cached

  const files = []
  for (const file of WORKSPACE_FILES) {
    const fp = path.join(ws, file.name)
    try {
      if (fs.statSync(fp).isFile()) {
        files.push({ ...file, path: fp })
      }
    } catch {}
  }

  _cached = { workspace: ws, files }
  _cacheTime = Date.now()
  return _cached
}

function loadWorkspaceFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return null
  }
}

function loadAllWorkspaceFiles() {
  const { workspace, files } = detectWorkspaceFiles()
  const result = {}

  for (const file of files) {
    const content = loadWorkspaceFile(file.path)
    if (content) {
      result[file.type] = {
        fileName: file.name,
        filePath: file.path,
        content,
      }
    }
  }

  return { workspace, files: result }
}

function hasWorkspaceFile(fileName) {
  const ws = getWorkspaceRoot()
  if (!ws) return false
  try { return fs.statSync(path.join(ws, fileName)).isFile() } catch { return false }
}

function getWorkspaceRoot_safe() {
  try { return getWorkspaceRoot() } catch { return null }
}

function buildWorkspaceContextMessage() {
  const { workspace, files } = loadAllWorkspaceFiles()
  const blocks = []

  if (files.agent_instructions) {
    blocks.push(`## Agent Instructions (${files.agent_instructions.fileName})\n\n${files.agent_instructions.content}`)
  }
  if (files.agent_personality) {
    blocks.push(`## Agent Personality (${files.agent_personality.fileName})\n\n${files.agent_personality.content}`)
  }
  if (files.project_conventions) {
    blocks.push(`## Project Conventions (${files.project_conventions.fileName})\n\n${files.project_conventions.content}`)
  }
  if (files.project_memory) {
    blocks.push(`## Project Memory (${files.project_memory.fileName})\n\n${files.project_memory.content}`)
  }

  if (blocks.length === 0) return null

  return {
    role: 'system',
    content: `The following workspace files were detected. Follow their instructions unless the user explicitly overrides:\n\n${blocks.join('\n\n---\n\n')}`,
  }
}

function invalidateCache() {
  _cached = null
  _cacheTime = 0
}

module.exports = {
  WORKSPACE_FILES,
  detectWorkspaceFiles,
  loadWorkspaceFile,
  loadAllWorkspaceFiles,
  hasWorkspaceFile,
  getWorkspaceRoot: getWorkspaceRoot_safe,
  buildWorkspaceContextMessage,
  invalidateCache,
}
