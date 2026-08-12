#!/usr/bin/env node
// Idempotent postinstall patch: app-builder-lib (electron-builder) imports
// `{ expand }` from brace-expansion (a v1-era named export), but upstream
// 2.1.4 only sets the default export (module.exports = expandTop). Without
// the named export, packaging crashes with "(0, brace_expansion_1.expand) is
// not a function". We append the re-export to the installed copy.
//
// Runs on npm install / npm ci (when scripts are enabled). CI's ci.yml uses
// --ignore-scripts but never packages, so it is unaffected; release.yml runs
// plain `npm ci` and needs this patch.
//
// Never throws — packaging must not fail harder because the patch itself broke.
const fs = require('fs')
const path = require('path')

const MARKER = '// aetherai:brace-expansion-expand-patch'
const TARGET = path.join(__dirname, '..', 'node_modules', 'brace-expansion', 'index.js')

try {
  if (!fs.existsSync(TARGET)) {
    console.log('[patch-brace-expansion] node_modules/brace-expansion not found — skipped')
    process.exit(0)
  }
  let src = fs.readFileSync(TARGET, 'utf8')
  if (src.includes(MARKER)) {
    console.log('[patch-brace-expansion] already patched — skipped')
    process.exit(0)
  }
  src += `\n${MARKER}\nmodule.exports.expand = expand;\n`
  fs.writeFileSync(TARGET, src)
  console.log('[patch-brace-expansion] patched brace-expansion with named `expand` export')
} catch (e) {
  console.warn('[patch-brace-expansion] failed:', e && e.message ? e.message : e)
}
