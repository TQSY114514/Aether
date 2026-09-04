#!/usr/bin/env node
/**
 * Main-process Dependency Verification
 *
 * Verifies that every external third-party module required in `app/electron/`
 * is explicitly declared in `package.json`'s `dependencies` (production dependencies).
 *
 * Prevents packaging failures where modules available in devDependencies during local dev
 * are pruned by electron-builder, crashing the installed app at runtime (e.g. Cannot find module 'glob').
 *
 * Usage: node scripts/check-deps.js
 * Exit code: 0 = passed, 1 = missing production dependencies
 */

const fs = require('fs')
const path = require('path')
const { isBuiltin } = require('module')

const ROOT = path.resolve(__dirname, '..')
const PKG_PATH = path.join(ROOT, 'package.json')
const ELECTRON_DIR = path.join(ROOT, 'electron')

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
const prodDeps = new Set(Object.keys(pkg.dependencies || {}))

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function walk(dir) {
  let results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') results = results.concat(walk(p))
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.cjs')) {
      results.push(p)
    }
  }
  return results
}

const files = walk(ELECTRON_DIR)
const externalRequires = new Map()

for (const file of files) {
  const rawContent = fs.readFileSync(file, 'utf8')
  const content = stripComments(rawContent)
  const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  let m
  while ((m = re.exec(content)) !== null) {
    const mod = m[1]
    if (mod.startsWith('.') || mod.startsWith('/')) continue
    if (isBuiltin(mod) || mod === 'electron') continue
    const rootMod = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0]
    if (isBuiltin(rootMod) || rootMod === 'electron') continue
    if (!externalRequires.has(rootMod)) externalRequires.set(rootMod, new Set())
    externalRequires.get(rootMod).add(path.relative(ROOT, file))
  }
}

let hasMissing = false
const errors = []

for (const [mod, callers] of externalRequires.entries()) {
  if (!prodDeps.has(mod)) {
    hasMissing = true
    errors.push(`Module "${mod}" is required in main process but missing from package.json "dependencies":\n` +
      Array.from(callers).map(c => `    at ${c}`).join('\n'))
  }
}

if (hasMissing) {
  console.error('\n❌ Production Dependency Verification FAILED:\n')
  for (const err of errors) console.error(err)
  console.error('\nError: The main process cannot rely on devDependencies. Add the missing module to "dependencies" or use a built-in.')
  process.exit(1)
} else {
  console.log('✅ Main-process dependency check passed: all required external modules are declared in "dependencies".')
  process.exit(0)
}
