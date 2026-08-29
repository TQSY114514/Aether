#!/usr/bin/env node
/**
 * verify-asar-deps.cjs — packaged-app dependency completeness check.
 *
 * Scans electron/ source for top-level require() calls and diffs them against
 * the packages physically present inside release/win-unpacked/resources/app.asar.
 * Any package required at runtime but missing from the asar means the packaged
 * app will crash with "Cannot find module 'X'" (Uncaught Exception dialog) —
 * exactly what happened when `glob` (a transitive dev-only dep) was required by
 * electron/tools/registry.js but never shipped.
 *
 * Usage: node scripts/verify-asar-deps.cjs   (run from app/ after electron-builder)
 * Exit code 1 + non-empty MISSING list => packaging is broken, do not ship.
 * Exit code 0 => every runtime require is satisfied from the asar.
 */
const fs = require('fs')
const path = require('path')
const asar = require('@electron/asar')

const root = path.resolve(__dirname, '..')
const asarPath = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')
if (!fs.existsSync(asarPath)) {
  console.error('[verify-asar-deps] app.asar not found at', asarPath)
  console.error('[verify-asar-deps] run electron-builder first (npm run build or --dir).')
  process.exit(1)
}

// 1. top-level packages physically inside the asar
const asarPkgs = new Set()
for (const raw of asar.listPackage(asarPath)) {
  const f = raw.replace(/\\/g, '/')
  const m = f.match(/^\/?node_modules\/(@[^/]+\/[^/]+|[^/]+)\//)
  if (m) asarPkgs.add(m[1])
}

// 2. top-level require() targets in electron/ source
const reqs = new Set()
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', 'dist'].includes(e.name)) walk(p)
    } else if (/\.(js|cjs|mjs)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8')
      const rx = /require\((['"])([@a-zA-Z0-9_./-]{1,96})\1\)/g
      let m
      while ((m = rx.exec(s))) {
        const n = m[2]
        if (!n.startsWith('.')) reqs.add(n)
      }
    }
  }
}
walk(path.join(root, 'electron'))

// 3. diff — electron is provided by the runtime; aetherai/sdk resolves via
// package.json exports (self-reference), not a node_modules entry.
const builtins = new Set(require('module').builtinModules)
const missing = [...reqs]
  .filter(r => !builtins.has(r) && !asarPkgs.has(r) && r !== 'aetherai/sdk' && r !== 'electron')

console.log(`[verify-asar-deps] asar packages: ${asarPkgs.size}, top-level requires: ${reqs.size}`)
if (missing.length) {
  console.error('[verify-asar-deps] MISSING from asar (packaged app will crash):')
  for (const r of missing.sort()) console.error('  ', r)
  console.error('[verify-asar-deps] fix: add the package to dependencies (npm install <pkg> --save) and rebuild.')
  process.exit(1)
}
console.log('[verify-asar-deps] OK — every runtime require resolves from the asar.')