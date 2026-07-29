// ───────────────────────────────────────────────────────────────────────────
// File Scanner — walks a workspace tree and collects file metadata.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'coverage', '.venv', 'venv', 'vendor',
]
const MAX_FILES = 5000
const MAX_FILE_BYTES = 512 * 1024 // skip files > 512KB (binary/large assets)

/**
 * Scan a workspace directory.
 * @param {string} rootDir - Absolute path to the workspace root.
 * @param {{ ignore?: string[], maxFiles?: number }} [options]
 * @returns {{ relPath: string, absPath: string, size: number, ext: string, modified: number }[]}
 */
function scanWorkspace(rootDir, options = {}) {
  const ignore = new Set(options.ignore || DEFAULT_IGNORE)
  const maxFiles = options.maxFiles || MAX_FILES
  const results = []
  let count = 0

  // Build a "should skip" function from dir names + file extensions.
  const shouldSkip = (name, isDir) => {
    const base = path.basename(name)
    if (ignore.has(base)) return true
    if (!isDir && name.startsWith('.')) return true
    return false
  }

  function walk(dir) {
    if (results.length >= maxFiles) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      if (results.length >= maxFiles) break
      if (shouldSkip(ent.name, ent.isDirectory())) continue
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full)
      } else if (ent.isFile()) {
        let stat
        try { stat = fs.statSync(full) } catch { continue }
        if (stat.size > MAX_FILE_BYTES) continue
        const ext = path.extname(ent.name).toLowerCase()
        results.push({
          relPath: path.relative(rootDir, full),
          absPath: full,
          size: stat.size,
          ext,
          modified: stat.mtimeMs,
        })
      }
    }
  }

  walk(rootDir)
  return results
}

module.exports = { scanWorkspace, DEFAULT_IGNORE }
