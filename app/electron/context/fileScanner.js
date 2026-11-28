// ───────────────────────────────────────────────────────────────────────────
// File Scanner — asynchronously walks a workspace tree and collects metadata.
// Uses bounded concurrency for stat/readdir, early maxFiles stop, and a short
// TTL cache so repeated scans in a turn (repoMap, indexer, scheduler) stay fast.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'coverage', '.venv', 'venv', 'vendor',
]
const MAX_FILES = 20000
const MAX_FILE_BYTES = 512 * 1024 // skip files > 512KB (binary/large assets)
const DEFAULT_CACHE_TTL_MS = 8000
const STAT_BATCH_SIZE = 32
const DIR_CONCURRENCY = 6
const MAX_CACHE_ENTRIES = 24
const MAX_DIR_MTIME_CHECKS = 128

const _scanCache = new Map()
const _inFlightScans = new Map()

function _makeCacheKey(rootDir, maxFiles, ignoreList) {
  const resolved = path.resolve(String(rootDir || ''))
  const normRoot = process.platform === 'win32' ? resolved.toLowerCase() : resolved
  return `${normRoot}::${maxFiles}::${ignoreList.slice().sort().join(',')}`
}

function clearScanCache() {
  _scanCache.clear()
}

function invalidateScanCache(rootDir) {
  if (!rootDir) return
  const resolved = path.resolve(String(rootDir))
  const prefix = (process.platform === 'win32' ? resolved.toLowerCase() : resolved) + '::'
  for (const key of _scanCache.keys()) {
    if (key.startsWith(prefix)) _scanCache.delete(key)
  }
}

async function _areDirMtimesUnchanged(dirMtimes) {
  if (!Array.isArray(dirMtimes) || dirMtimes.length === 0) return false
  for (let i = 0; i < dirMtimes.length; i += STAT_BATCH_SIZE) {
    const batch = dirMtimes.slice(i, i + STAT_BATCH_SIZE)
    const checks = await Promise.all(batch.map(async ([dirPath, prevMtime]) => {
      try {
        const st = await fs.promises.stat(dirPath)
        return st.mtimeMs === prevMtime
      } catch {
        return false
      }
    }))
    if (checks.some(ok => !ok)) return false
  }
  return true
}

/**
 * Scan a workspace directory.
 * @param {string} rootDir - Absolute path to the workspace root.
 * @param {{ ignore?: string[], maxFiles?: number, cacheTtlMs?: number, noCache?: boolean }} [options]
 * @returns {Promise<{ relPath: string, absPath: string, size: number, ext: string, modified: number }[]>}
 */
async function scanWorkspace(rootDir, options = {}) {
  const ignoreList = options.ignore || DEFAULT_IGNORE
  const ignore = new Set(ignoreList)
  const maxFiles = options.maxFiles || MAX_FILES
  const ttlMs = options.noCache ? 0 : (Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : DEFAULT_CACHE_TTL_MS)
  const cacheKey = _makeCacheKey(rootDir, maxFiles, ignoreList)

  if (ttlMs > 0) {
    const hit = _scanCache.get(cacheKey)
    if (hit && Date.now() < hit.expiresAt) {
      if (await _areDirMtimesUnchanged(hit.dirMtimes)) {
        return hit.results.slice()
      }
      _scanCache.delete(cacheKey)
    }
    const inflight = _inFlightScans.get(cacheKey)
    if (inflight) {
      const shared = await inflight
      return shared.slice()
    }
  }

  const shouldSkip = (name, isDir) => {
    const base = path.basename(name)
    if (ignore.has(base)) return true
    if (!isDir && name.startsWith('.')) return true
    return false
  }

  const runScan = async () => {
    const results = []
    const dirMtimes = []

    async function walk(dir) {
      if (results.length >= maxFiles) return
      let entries
      try {
        if (dirMtimes.length < MAX_DIR_MTIME_CHECKS) {
          const dirStat = await fs.promises.stat(dir)
          dirMtimes.push([dir, dirStat.mtimeMs])
        }
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch { return }

      const fileEntries = []
      const subDirs = []
      for (const ent of entries) {
        if (shouldSkip(ent.name, ent.isDirectory())) continue
        if (ent.isDirectory()) subDirs.push(path.join(dir, ent.name))
        else if (ent.isFile()) fileEntries.push(ent)
      }

      // Bounded parallel stat batches with early LIMIT exit.
      for (let i = 0; i < fileEntries.length && results.length < maxFiles; i += STAT_BATCH_SIZE) {
        const batch = fileEntries.slice(i, i + STAT_BATCH_SIZE)
        const stats = await Promise.all(batch.map(async (ent) => {
          const full = path.join(dir, ent.name)
          try {
            const st = await fs.promises.stat(full)
            return { ent, full, st }
          } catch {
            return null
          }
        }))
        for (const item of stats) {
          if (!item) continue
          if (results.length >= maxFiles) break
          if (item.st.size > MAX_FILE_BYTES) continue
          results.push({
            relPath: path.relative(rootDir, item.full),
            absPath: item.full,
            size: item.st.size,
            ext: path.extname(item.ent.name).toLowerCase(),
            modified: item.st.mtimeMs,
          })
        }
      }

      // Bounded parallel subdir traversal, stopping early once maxFiles is met.
      for (let i = 0; i < subDirs.length && results.length < maxFiles; i += DIR_CONCURRENCY) {
        await Promise.all(subDirs.slice(i, i + DIR_CONCURRENCY).map((d) => walk(d)))
      }
    }

    await walk(rootDir)
    if (ttlMs > 0) {
      if (_scanCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = _scanCache.keys().next().value
        if (oldest !== undefined) _scanCache.delete(oldest)
      }
      _scanCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, results, dirMtimes })
    }
    return results
  }

  const p = runScan()
  if (ttlMs > 0) _inFlightScans.set(cacheKey, p)
  try {
    const res = await p
    return res.slice()
  } finally {
    if (ttlMs > 0) _inFlightScans.delete(cacheKey)
  }
}

module.exports = {
  scanWorkspace,
  clearScanCache,
  invalidateScanCache,
  MAX_FILES,
  DEFAULT_IGNORE,
  DEFAULT_CACHE_TTL_MS,
}