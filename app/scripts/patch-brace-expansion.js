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

function patchFile(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return false
    let src = fs.readFileSync(targetPath, 'utf8')
    if (src.includes(MARKER)) return false
    src += `\n${MARKER}\nmodule.exports.expand = expand;\n`
    fs.writeFileSync(targetPath, src)
    return true
  } catch (e) {
    console.warn('[patch-brace-expansion] failed on', targetPath, e && e.message ? e.message : e)
    return false
  }
}

const rootNodeModules = path.join(__dirname, '..', 'node_modules')
const mainTarget = path.join(rootNodeModules, 'brace-expansion', 'index.js')
let count = 0
if (patchFile(mainTarget)) count++

// Also check any nested brace-expansion directories
try {
  if (fs.existsSync(rootNodeModules)) {
    const entries = fs.readdirSync(rootNodeModules, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        const scopeDir = path.join(rootNodeModules, entry.name)
        const subEntries = fs.readdirSync(scopeDir, { withFileTypes: true })
        for (const sub of subEntries) {
          if (sub.isDirectory()) {
            const nested = path.join(scopeDir, sub.name, 'node_modules', 'brace-expansion', 'index.js')
            if (patchFile(nested)) count++
          }
        }
      } else if (entry.isDirectory()) {
        const nested = path.join(rootNodeModules, entry.name, 'node_modules', 'brace-expansion', 'index.js')
        if (patchFile(nested)) count++
      }
    }
  }
} catch (e) {
  // ignore scan errors
}

if (count > 0) {
  console.log(`[patch-brace-expansion] patched ${count} brace-expansion copies with named \`expand\` export`)
} else {
  console.log('[patch-brace-expansion] already patched or no unpatched copies found')
}
