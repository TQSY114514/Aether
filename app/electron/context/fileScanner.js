// ───────────────────────────────────────────────────────────────────────────
// File Scanner — asynchronously walks a workspace tree and collects metadata.
// Async (fs.promises) so indexing a large repo never blocks the main process.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'coverage', '.venv', 'venv', 'vendor',
]
const MAX_FILES = 20000
const MAX_FILE_BYTES = 512 * 1024 // skip files > 512KB (binary/large assets)

/**
 * Scan a workspace directory.
 * @param {string} rootDir - Absolute path to the workspace root.
 * @param {{ ignore?: string[], maxFiles?: number }} [options]
 * @returns {Promise<{ relPath: string, absPath: string, size: number, ext: string, modified: number }[]>}
 */
async function scanWorkspace(rootDir, options = {}) {
  const ignore = new Set(options.ignore || DEFAULT_IGNORE)
  const maxFiles = options.maxFiles || MAX_FILES
  const results = []

  // Build a "should skip" function from dir names + file extensions.
  const shouldSkip = (name, isDir) => {
    const base = path.basename(name)
    if (ignore.has(base)) return true
    if (!isDir && name.startsWith('.')) return true
    return false
  }

  async function walk(dir) {
    if (results.length >= maxFiles) return
    let entries
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      if (results.length >= maxFiles) break
      if (shouldSkip(ent.name, ent.isDirectory())) continue
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else if (ent.isFile()) {
        let stat
        try { stat = await fs.promises.stat(full) } catch { continue }
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

  await walk(rootDir)
  return results
}

module.exports = { scanWorkspace, MAX_FILES, DEFAULT_IGNORE }