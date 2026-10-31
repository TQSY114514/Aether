#!/usr/bin/env node
/**
 * Architecture Invariant Verification
 *
 * Inspired by Open Math Harness (architecture.rs) and AGENTS.md Constitution.
 * Enforces strict structural boundaries across the Aether codebase:
 *
 * Gate 1: SDK & TUI Electron-Free Boundary
 *   - Verifies that `app/electron/sdk/` and `app/tui/` never import 'electron'.
 *   - Verifies that `require('./electron/sdk')` loads cleanly in pure Node.js runtime.
 *
 * Gate 2: Tool Permission & Mutating Classification Invariant
 *   - Verifies that all built-in tools in `app/electron/tools/registry.js` are strictly categorized
 *     with risk: 'safe' | 'dangerous', and mutating tools cannot be classified as 'safe'.
 *
 * Gate 3: Tool Result Middleware Invariant
 *   - Verifies that tool loops invoke `toolResultMiddleware` to redact and truncate outputs
 *     before returning them to the model context.
 *
 * Gate 4: SQLite Runtime Storage Invariant
 *   - Verifies that graph memory and agent runtime state use SQLite, without reviving sidecar JSONL stores.
 *
 * Gate 5: CommonJS Purity Invariant in Main Process
 *   - Verifies that all `.js` files in `app/electron/` are plain CommonJS without ESM syntax.
 *
 * Usage: node scripts/check-architecture.js
 * Exit code: 0 = clean, 1 = architecture violation
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ELECTRON_DIR = path.join(ROOT, 'electron')
const SDK_DIR = path.join(ELECTRON_DIR, 'sdk')
const TUI_DIR = path.join(ROOT, 'tui')
const TOOLS_REGISTRY = path.join(ELECTRON_DIR, 'tools', 'registry.js')

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function walkJs(dir) {
  if (!fs.existsSync(dir)) return []
  let files = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name !== 'node_modules' && ent.name !== 'dist') files = files.concat(walkJs(p))
    } else if (ent.name.endsWith('.js') || ent.name.endsWith('.mjs') || ent.name.endsWith('.cjs')) {
      files.push(p)
    }
  }
  return files
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 1: SDK & TUI Electron-Free Boundary
// ─────────────────────────────────────────────────────────────────────────────
function checkSdkAndTuiElectronFree() {
  const violations = []

  // 1. Check SDK directory directly: zero occurrences of electron
  const sdkFiles = walkJs(SDK_DIR)
  for (const file of sdkFiles) {
    const raw = fs.readFileSync(file, 'utf8')
    const content = stripComments(raw)
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (/(?:require\s*\(\s*['"]electron['"]|import\s+.*?from\s+['"]electron['"])/.test(content)) {
      violations.push(`SDK module "${rel}" imports 'electron'. SDK must remain strictly Electron-free.`)
    }
  }

  // 2. Check TUI directory directly: zero occurrences of electron
  const tuiFiles = walkJs(TUI_DIR)
  for (const file of tuiFiles) {
    const raw = fs.readFileSync(file, 'utf8')
    const content = stripComments(raw)
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (/(?:require\s*\(\s*['"]electron['"]|import\s+.*?from\s+['"]electron['"])/.test(content)) {
      violations.push(`TUI module "${rel}" imports 'electron'. TUI must remain strictly Electron-free.`)
    }
  }

  // 3. Runtime verification: pure Node.js loading of SDK
  try {
    const sdk = require(path.join(SDK_DIR, 'index.js'))
    if (!sdk || typeof sdk.runAgent !== 'function' || typeof sdk.openDatabase !== 'function') {
      violations.push('SDK failed to export required core functions (runAgent, openDatabase).')
    }
  } catch (err) {
    violations.push(`SDK failed to load in Node.js runtime: ${err.message}`)
  }

  return {
    name: 'Gate 1 (SDK & TUI Electron-Free Boundary)',
    clean: violations.length === 0,
    modulesScanned: sdkFiles.length + tuiFiles.length,
    violations,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2: Tool Permission & Mutating Classification Invariant
// ─────────────────────────────────────────────────────────────────────────────
function checkToolPermissions() {
  const violations = []
  let toolsCount = 0

  try {
    const { TOOLS } = require(TOOLS_REGISTRY)
    toolsCount = Array.isArray(TOOLS) ? TOOLS.length : 0

    const MUTATING_RE = /\b(write|edit|patch|delete|remove|create|run_command|kill|exec|apply|drop)\b/i

    for (const tool of TOOLS) {
      if (tool.risk !== 'safe' && tool.risk !== 'dangerous') {
        violations.push(`Tool "${tool.name}" has invalid risk: "${tool.risk}". Must be "safe" or "dangerous".`)
      }

      // Check if a tool with mutating name is incorrectly marked as safe
      if (tool.risk === 'safe') {
        if (MUTATING_RE.test(tool.name)) {
          violations.push(`Mutating tool "${tool.name}" is declared as risk: "safe", violating permission gate.`)
        }
      }
    }
  } catch (err) {
    violations.push(`Failed to load tools registry: ${err.message}`)
  }

  return {
    name: 'Gate 2 (Tool Risk Classification)',
    clean: violations.length === 0,
    toolsCount,
    violations,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 3: Tool Result Middleware Invariant
// ─────────────────────────────────────────────────────────────────────────────
function checkToolResultMiddleware() {
  const violations = []
  const toolLoopPath = path.join(ELECTRON_DIR, 'llm', 'toolLoop.js')

  if (!fs.existsSync(toolLoopPath)) {
    violations.push('llm/toolLoop.js not found.')
  } else {
    const raw = fs.readFileSync(toolLoopPath, 'utf8')
    if (!raw.includes('toolResultMiddleware') && !raw.includes('processToolResult')) {
      violations.push('llm/toolLoop.js does not apply toolResultMiddleware.')
    }
  }

  return {
    name: 'Gate 3 (Tool Result Middleware)',
    clean: violations.length === 0,
    violations,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 4: SQLite Runtime Storage Invariant
// ─────────────────────────────────────────────────────────────────────────────
function checkStorageInvariant() {
  const violations = []
  const deadJsonlMemory = path.join(ELECTRON_DIR, 'context', 'memoryGraph.js')

  if (fs.existsSync(deadJsonlMemory)) {
    violations.push('Deprecated sidecar memoryGraph.js revived in electron/context. Runtime state must remain in SQLite.')
  }

  return {
    name: 'Gate 4 (SQLite Storage Invariant)',
    clean: violations.length === 0,
    violations,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate 5: CommonJS Purity Invariant in Main Process
// ─────────────────────────────────────────────────────────────────────────────
function checkCommonJSPurity() {
  const violations = []
  const jsFiles = walkJs(ELECTRON_DIR).filter(f => f.endsWith('.js') && !f.endsWith('.mjs'))

  for (const file of jsFiles) {
    const raw = fs.readFileSync(file, 'utf8')
    const content = stripComments(raw)
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')

    // Check for top-level import statement
    if (/^\s*import\s+(?:\{[\s\S]*?\}|[\w*]+)\s+from\s+['"][^'"]+['"]/m.test(content)) {
      violations.push(`File "${rel}" contains ESM import statement in CommonJS main process.`)
    }
    // Check for top-level export default or export const
    if (/^\s*export\s+(?:default|const|let|var|function|class)\s+/m.test(content)) {
      violations.push(`File "${rel}" contains ESM export statement in CommonJS main process.`)
    }
  }

  return {
    name: 'Gate 5 (CommonJS Purity in Main)',
    clean: violations.length === 0,
    filesScanned: jsFiles.length,
    violations,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Runner
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  console.log('\n========== 架构守卫校验 (Architecture Invariants) ==========')

  const results = [
    checkSdkAndTuiElectronFree(),
    checkToolPermissions(),
    checkToolResultMiddleware(),
    checkStorageInvariant(),
    checkCommonJSPurity(),
  ]

  let allClean = true

  for (const res of results) {
    if (res.clean) {
      const extra = res.modulesScanned ? ` (${res.modulesScanned} modules verified)`
        : res.toolsCount ? ` (${res.toolsCount} tools verified)`
        : res.filesScanned ? ` (${res.filesScanned} files scanned)`
        : ''
      console.log(`  ✅ ${res.name}: CLEAN${extra}`)
    } else {
      allClean = false
      console.error(`  ❌ ${res.name}: FAILED`)
      for (const v of res.violations) {
        console.error(`     - ${v}`)
      }
    }
  }

  if (allClean) {
    console.log('✅ 所有架构守卫全部通过 (All architecture invariant gates clean).\n')
    process.exit(0)
  } else {
    console.error('\n❌ 架构守卫校验失败 (Architecture invariant check failed).\n')
    process.exit(1)
  }
}

main()
