// ───────────────────────────────────────────────────────────────────────────
// Project Instruction Loader — Cascading Multi-Layer Instruction Discovery
//
// Hierarchical cascade order:
//   1. Global user defaults:      ~/.aether/AGENTS.md
//   2. Repository root conventions: <gitRoot>/AGENTS.md | CLAUDE.md | AETHER.md
//   3. Subfolder specific rules:   <cwd>/AGENTS.md (and intermediate directories)
//   4. Modular rules:              <gitRoot>/.aether/rules/*.md & <cwd>/.aether/rules/*.md
//
// Scans upward from session.cwd to Git root (or stops at cwd if not a Git repo).
// Instructions are concatenated with clear source provenance comments.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const os = require('os')
const { getWorkspaceRoot } = require('../tools/sandbox')

// Candidate instruction file names in priority order
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'AETHER.md', '.aetherai.md', 'AGENT.md', 'GEMINI.md']
const CACHE_TTL_MS = 30_000 // 30s cache TTL
const MAX_INSTRUCTION_SIZE = 65536 // 64KB per file
const MAX_RULE_SIZE = 65536        // 64KB per modular rule
const MAX_RULES_COUNT = 30         // Cap max modular rules loaded

// Cache map keyed by resolved start directory: Map<dir, { data, time, rules, rulesTime }>
const _cacheMap = new Map()

/**
 * Upward directory traversal from startDir to locate the Git repository root.
 * Returns the directory containing `.git` (directory or worktree file), or null if not found.
 * @param {string} startDir
 * @returns {string|null}
 */
function findGitRoot(startDir) {
  if (!startDir || typeof startDir !== 'string') return null
  try {
    let cur = path.resolve(startDir)
    while (true) {
      const gitPath = path.join(cur, '.git')
      try {
        if (fs.existsSync(gitPath)) {
          return cur
        }
      } catch {}
      const parent = path.dirname(cur)
      if (parent === cur) break // Reached filesystem root
      cur = parent
    }
  } catch {}
  return null
}

/**
 * Resolve the working directory for a given session or path.
 * Fallback chain:
 *   1. Explicit absolute/valid directory string
 *   2. db.getSession(sessionId).cwd
 *   3. session.config.cwd / workspace
 *   4. sandbox.getWorkspaceRoot(sessionId)
 *   5. process.cwd()
 * @param {string|number} [startDirOrSessionId]
 * @returns {string}
 */
function resolveStartDir(startDirOrSessionId) {
  if (typeof startDirOrSessionId === 'string' && (path.isAbsolute(startDirOrSessionId) || fs.existsSync(startDirOrSessionId))) {
    try {
      const st = fs.statSync(startDirOrSessionId)
      if (st.isDirectory()) return path.resolve(startDirOrSessionId)
      return path.dirname(path.resolve(startDirOrSessionId))
    } catch {}
  }
  if (startDirOrSessionId != null) {
    try {
      const db = require('../database')
      if (db && typeof db.getSession === 'function') {
        const sess = db.getSession(startDirOrSessionId)
        if (sess) {
          if (sess.cwd && typeof sess.cwd === 'string' && sess.cwd.trim()) {
            return path.resolve(sess.cwd.trim())
          }
          if (sess.config) {
            try {
              const cfg = typeof sess.config === 'string' ? JSON.parse(sess.config) : sess.config
              if (cfg?.cwd) return path.resolve(cfg.cwd)
              if (cfg?.workspace) return path.resolve(cfg.workspace)
            } catch {}
          }
        }
      }
    } catch {}
    try {
      const ws = getWorkspaceRoot(startDirOrSessionId)
      if (ws && typeof ws === 'string') return path.resolve(ws)
    } catch {}
  }
  try {
    const ws = getWorkspaceRoot()
    if (ws && typeof ws === 'string') return path.resolve(ws)
  } catch {}
  return process.cwd()
}

/**
 * Safely read and clamp instruction file content.
 * @param {string} filePath
 * @returns {string|null}
 */
function readInstructionFile(filePath) {
  try {
    const lstat = fs.lstatSync(filePath)
    if (lstat.isSymbolicLink() || !lstat.isFile()) return null
    const fd = fs.openSync(filePath, 'r')
    let raw
    try {
      const buf = Buffer.alloc(Math.min(lstat.size, MAX_INSTRUCTION_SIZE * 4))
      const n = fs.readSync(fd, buf, 0, buf.length, 0)
      raw = buf.subarray(0, n).toString('utf-8')
    } finally {
      fs.closeSync(fd)
    }
    const content = raw.slice(0, MAX_INSTRUCTION_SIZE).trim()
    return content.length > 0 ? content : null
  } catch {
    return null
  }
}

/**
 * Find the primary instruction file in a single directory according to INSTRUCTION_FILES priority.
 * @param {string} dir
 * @returns {{ path: string, fileName: string, content: string } | null}
 */
function findInstructionInDir(dir) {
  for (const fname of INSTRUCTION_FILES) {
    const fp = path.join(dir, fname)
    try {
      if (fs.existsSync(fp)) {
        const content = readInstructionFile(fp)
        if (content) {
          return { path: fp, fileName: fname, content }
        }
      }
    } catch {}
  }
  return null
}

/**
 * Scan modular rule files (*.md and *.mdc) in a directory.
 * @param {string} dir
 * @returns {Array<{ name: string, path: string, content: string }>}
 */
function scanRulesDir(dir) {
  const rulesDir = path.basename(dir) === '.aether'
    ? path.join(dir, 'rules')
    : path.join(dir, '.aether', 'rules')
  try {
    if (!fs.existsSync(rulesDir)) return []
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md') || f.endsWith('.mdc')).sort()
    const rules = []
    for (const f of files) {
      if (rules.length >= MAX_RULES_COUNT) break
      const fp = path.join(rulesDir, f)
      const content = readInstructionFile(fp)
      if (content) {
        rules.push({ name: f, path: fp, content })
      }
    }
    return rules
  } catch {
    return []
  }
}

/**
 * Scan modular rules across the cascade:
 *   1. Global rules (~/.aether/rules)
 *   2. Repo root rules (<gitRoot>/.aether/rules)
 *   3. Subdirectory rules (<cwd>/.aether/rules)
 * Child rules override parent rules with the same file name.
 *
 * @param {string} [startDirOrSessionId]
 * @returns {Array<{ name: string, path: string, content: string }>}
 */
function loadModularRules(startDirOrSessionId) {
  const startDir = resolveStartDir(startDirOrSessionId)
  const cached = _cacheMap.get(startDir)
  if (cached?.rules && Date.now() - cached.rulesTime < CACHE_TTL_MS) {
    return cached.rules
  }

  const gitRoot = findGitRoot(startDir)
  const scannedDirs = []

  // 1. Global rules
  const globalDir = path.join(os.homedir(), '.aether')
  if (fs.existsSync(path.join(globalDir, 'rules'))) {
    scannedDirs.push(globalDir)
  }

  // 2. Git root rules
  if (gitRoot && gitRoot !== globalDir) {
    scannedDirs.push(gitRoot)
  }

  // 3. Current cwd rules (if different from gitRoot)
  if (startDir && startDir !== gitRoot && startDir !== globalDir) {
    scannedDirs.push(startDir)
  }

  const ruleMap = new Map()
  for (const d of scannedDirs) {
    const list = scanRulesDir(d)
    for (const r of list) {
      // Child rule with same name replaces parent rule
      ruleMap.set(r.name, r)
    }
  }

  const rules = Array.from(ruleMap.values()).slice(0, MAX_RULES_COUNT)
  const entry = _cacheMap.get(startDir) || {}
  entry.rules = rules
  entry.rulesTime = Date.now()
  _cacheMap.set(startDir, entry)

  return rules
}

/**
 * Load cascading instructions from Global -> Repo Root -> CWD subfolder.
 *
 * @param {string|number} [startDirOrSessionId]
 * @returns {{
 *   path: string,
 *   fileName: string,
 *   content: string,
 *   layers: Array<{ level: string, path: string, fileName: string, content: string }>,
 *   gitRoot: string|null,
 *   cwd: string
 * } | null}
 */
function loadProjectInstructions(startDirOrSessionId) {
  const startDir = resolveStartDir(startDirOrSessionId)
  const cached = _cacheMap.get(startDir)
  if (cached?.data && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.data
  }

  const gitRoot = findGitRoot(startDir)
  const layers = []

  // 1. Global user instructions (~/.aether/AGENTS.md)
  try {
    const globalPath = path.join(os.homedir(), '.aether', 'AGENTS.md')
    if (fs.existsSync(globalPath)) {
      const content = readInstructionFile(globalPath)
      if (content) {
        layers.push({
          level: 'global',
          title: 'Global User Instructions (~/.aether/AGENTS.md)',
          sourceDescription: 'Global user instructions',
          path: globalPath,
          fileName: 'AGENTS.md',
          content,
        })
      }
    }
  } catch {}

  // 2. Repository root instructions (or cwd instructions if not in a Git repo)
  const rootDir = gitRoot || startDir
  const rootInstruction = findInstructionInDir(rootDir)
  if (rootInstruction) {
    layers.push({
      level: gitRoot ? 'repo' : 'root',
      title: gitRoot
        ? `Repository Instructions (${rootInstruction.fileName})`
        : `Directory Instructions (${rootInstruction.fileName})`,
      sourceDescription: gitRoot ? 'Repository instructions' : 'Directory instructions',
      path: rootInstruction.path,
      fileName: rootInstruction.fileName,
      content: rootInstruction.content,
    })
  }

  // 3. Subdirectory instructions (if startDir is different from gitRoot)
  if (gitRoot && path.resolve(startDir) !== path.resolve(gitRoot)) {
    // Collect intermediate directories between gitRoot and startDir
    const intermediateDirs = []
    let cur = path.resolve(startDir)
    const resolvedGitRoot = path.resolve(gitRoot)

    while (cur && cur !== resolvedGitRoot) {
      intermediateDirs.unshift(cur) // Parent before child
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }

    for (const d of intermediateDirs) {
      const subInstruction = findInstructionInDir(d)
      if (subInstruction && subInstruction.path !== rootInstruction?.path) {
        const rel = path.relative(gitRoot, d).replace(/\\/g, '/')
        layers.push({
          level: 'subfolder',
          title: `Subdirectory Instructions (${rel}/${subInstruction.fileName})`,
          sourceDescription: `Subdirectory instructions for ${rel}`,
          path: subInstruction.path,
          fileName: subInstruction.fileName,
          content: subInstruction.content,
        })
      }
    }
  }

  if (layers.length === 0) {
    const entry = _cacheMap.get(startDir) || {}
    entry.data = null
    entry.time = Date.now()
    _cacheMap.set(startDir, entry)
    return null
  }

  // Format concatenated content with clear source provenance comments
  const formattedSections = layers.map(layer => {
    return [
      `<!-- Source: ${layer.sourceDescription} (${layer.path}) -->`,
      `### ${layer.title}`,
      `*Provenance: \`${layer.path}\`*`,
      '',
      layer.content,
    ].join('\n')
  })

  const concatenatedContent = formattedSections.join('\n\n---\n\n')
  const primaryLayer = layers.find(l => l.level === 'repo' || l.level === 'root') || layers[0]

  const result = {
    path: primaryLayer.path,
    fileName: primaryLayer.fileName,
    content: concatenatedContent,
    layers,
    gitRoot: gitRoot || null,
    cwd: startDir,
  }

  const entry = _cacheMap.get(startDir) || {}
  entry.data = result
  entry.time = Date.now()
  _cacheMap.set(startDir, entry)

  return result
}

/**
 * Invalidate instruction and modular rule caches.
 * Call after modifying instruction files or when switching session cwd.
 */
function invalidateCache() {
  _cacheMap.clear()
}

/**
 * Build a system-message block from the loaded instructions.
 * Returns an object suitable for insertion into convo, or null if none.
 * @param {string|number} [sessionId]
 * @returns {{ role: 'system', content: string } | null}
 */
function buildProjectContextMessage(sessionId) {
  const cascade = loadProjectInstructions(sessionId)
  const startDir = resolveStartDir(sessionId)
  const modularRules = loadModularRules(startDir)

  if (!cascade && modularRules.length === 0) return null

  const parts = []
  if (cascade && cascade.content) {
    parts.push(
      `## Project Instructions (Cascading Hierarchy)\n\nThe following instructions cascade from global user defaults to repository conventions and subdirectory overrides. Follow more specific (child/subdirectory) instructions when they conflict with general (parent/repository) rules:\n\n${cascade.content}`
    )
  }
  if (modularRules.length > 0) {
    const rulesFormatted = modularRules.map(r => `### Rule: ${r.name}\n${r.content}`).join('\n\n')
    parts.push(`## Workspace Rules (.aether/rules)\n\n${rulesFormatted}`)
  }

  return {
    role: 'system',
    content: parts.join('\n\n'),
  }
}

/**
 * Check if any instruction or rule file exists for the session without loading full contents.
 * @param {string|number} [sessionId]
 * @returns {boolean}
 */
function hasProjectInstructions(sessionId) {
  const startDir = resolveStartDir(sessionId)
  const gitRoot = findGitRoot(startDir)

  // Check global
  try {
    if (fs.existsSync(path.join(os.homedir(), '.aether', 'AGENTS.md'))) return true
  } catch {}

  // Check git root
  if (gitRoot) {
    for (const f of INSTRUCTION_FILES) {
      try {
        if (fs.existsSync(path.join(gitRoot, f))) return true
      } catch {}
    }
  }

  // Check cwd
  for (const f of INSTRUCTION_FILES) {
    try {
      if (fs.existsSync(path.join(startDir, f))) return true
    } catch {}
  }

  // Check modular rules
  const rules = loadModularRules(startDir)
  return rules.length > 0
}

module.exports = {
  findGitRoot,
  resolveStartDir,
  loadProjectInstructions,
  loadModularRules,
  buildProjectContextMessage,
  invalidateCache,
  hasProjectInstructions,
}
