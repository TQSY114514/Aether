#!/usr/bin/env node
// Idempotent postinstall patch: app-builder-lib (electron-builder) and @electron/asar
// import `{ expand }` from brace-expansion (a v1-era named export), but upstream
// 2.1.x/BlueOak only sets the default export (module.exports = expandTop). Without
// the named export, packaging crashes and Node ESM imports throw:
// "SyntaxError: Named export 'expand' not found". We append the re-export to the installed copy.
//
// Runs on npm install / npm ci (when scripts are enabled), and explicitly in CI workflow
// steps after npm ci --ignore-scripts.
const fs = require('fs')
const path = require('path')

const MARKER = '// aetherai:brace-expansion-expand-patch'
const EXPORT_LINE = 'module.exports.expand = expand;'

function patchFile(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return false
    const src = fs.readFileSync(targetPath, 'utf8')
    // Both marker AND export line must be present to count as patched
    if (src.includes(MARKER) && src.includes(EXPORT_LINE)) {
      return false
    }
    // Clean any partial marker if previous write was interrupted
    const cleaned = src.replace(new RegExp(`\\n?${MARKER}\\n?.*`, 'g'), '')
    const patched = `${cleaned}\n${MARKER}\n${EXPORT_LINE}\n`

    // Atomic write via temporary file
    const tmpPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    fs.writeFileSync(tmpPath, patched, 'utf8')
    fs.renameSync(tmpPath, targetPath)
    return true
  } catch (e) {
    console.warn('[patch-brace-expansion] failed on', targetPath, e && e.message ? e.message : e)
    return false
  }
}

// Recursively find and patch all brace-expansion/index.js under any node_modules
function findAndPatchAll(dir, maxDepth = 6) {
  let count = 0
  if (maxDepth < 0 || !fs.existsSync(dir)) return 0

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(dir, entry.name)

      if (entry.name === 'brace-expansion') {
        const target = path.join(fullPath, 'index.js')
        if (patchFile(target)) count++
      }

      // Recurse into node_modules or scoped @org directories
      if (entry.name === 'node_modules' || entry.name.startsWith('@') || entry.name === 'app') {
        count += findAndPatchAll(fullPath, maxDepth - 1)
      } else {
        // If a package has its own nested node_modules, check inside
        const nestedNm = path.join(fullPath, 'node_modules')
        if (fs.existsSync(nestedNm)) {
          count += findAndPatchAll(nestedNm, maxDepth - 1)
        }
      }
    }
  } catch (e) {
    // ignore access/read errors
  }
  return count
}

const rootDir = path.join(__dirname, '..')
const count = findAndPatchAll(rootDir)

if (count > 0) {
  console.log(`[patch-brace-expansion] patched ${count} brace-expansion copies with named \`expand\` export`)
} else {
  console.log('[patch-brace-expansion] already patched or no unpatched copies found')
}
