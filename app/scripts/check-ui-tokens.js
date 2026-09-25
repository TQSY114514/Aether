#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-ui-tokens.js — Paperclip + ZCode inspired UI design & architecture gate
// Enforces docs/ui-design.md rules across `app/src/components/**` and `app/src/pages/**`:
//   Gate 1 (Anti-AI-Slop Gradients): Zero `bg-clip-text` gradient headlines or
//     indigo/violet/purple Tailwind gradient stops (`from-indigo-*`, `to-purple-*`, etc.).
//   Gate 2 (Legacy Invalid hsl(var(--...)) Wrappers): Semantic CSS variables hold
//     complete color values; wrapping them in `hsl(var(--...))` produces invalid CSS.
//   Gate 3 (Architecture Line-Count Ratchet): New files in `src/components` or
//     `src/pages` must stay under MAX_NEW_COMPONENT_LINES (650 lines), while
//     existing legacy files are locked to their baseline ceiling (ratchet-only).
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const APP_ROOT = path.resolve(__dirname, '..')
const SRC_ROOT = path.resolve(APP_ROOT, 'src')
const SCAN_DIRS = ['components', 'pages']
const MAX_NEW_COMPONENT_LINES = 650

// Baseline ceiling for pre-existing large files (ZCode .architecture-baseline pattern:
// legacy files cannot grow beyond their baseline ceiling; any new file must be <= 650 lines).
const LINE_COUNT_RATCHET_BASELINE = {
  'src/components/chat/ChatWindow.tsx': 1450,
  'src/components/chat/ChatInput.tsx': 1020,
  'src/components/chat/MessageItem.tsx': 1050,
  'src/components/sidebar/Sidebar.tsx': 950,
  'src/pages/SettingPage.tsx': 810,
  'src/pages/settings/SettingsPage.tsx': 1600,
  'src/pages/model/ModelPage.tsx': 1100,
  'src/pages/skill/SkillPage.tsx': 900,
  'src/pages/arena/ArenaPage.tsx': 900,
  'src/pages/mcp/McpPage.tsx': 850,
  'src/pages/memory/MemoryPage.tsx': 850,
  'src/pages/persona/PersonaPage.tsx': 800,
  'src/pages/token/TokenPage.tsx': 800,
  'src/pages/security/SecurityPage.tsx': 800,
}

// Allowlist for specific files if needed
const GATE1_ALLOWLIST = new Set([])

const AI_SLOP_GRADIENT_RE =
  /\b(?:bg-clip-text|(?:from|via|to)-(?:indigo|violet|purple)-[0-9]{2,3})\b/g

const LEGACY_HSL_VAR_WRAPPER_RE = /\bhsla?\(\s*var\(--[^)]+\)[^)]*\)/g

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(p, out)
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(p)
    }
  }
  return out
}

function toPosixRel(filePath) {
  return path.relative(APP_ROOT, filePath).split(path.sep).join('/')
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length
}

function scanUiTokens({ srcRoot = SRC_ROOT, appRoot = APP_ROOT } = {}) {
  const files = []
  for (const d of SCAN_DIRS) {
    walk(path.resolve(srcRoot, d), files)
  }
  files.sort()

  const violations = {
    gate1SlopGradients: [],
    gate2LegacyHslVar: [],
    gate3LineCountRatchet: [],
  }

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8')
    const relPath = path.relative(appRoot, filePath).split(path.sep).join('/')
    const lines = content.split('\n').length

    if (!GATE1_ALLOWLIST.has(relPath)) {
      for (const m of content.matchAll(AI_SLOP_GRADIENT_RE)) {
        violations.gate1SlopGradients.push({
          file: relPath,
          line: lineNumberAt(content, m.index),
          snippet: m[0],
        })
      }
    }

    for (const m of content.matchAll(LEGACY_HSL_VAR_WRAPPER_RE)) {
      violations.gate2LegacyHslVar.push({
        file: relPath,
        line: lineNumberAt(content, m.index),
        snippet: m[0],
      })
    }

    const ceiling = LINE_COUNT_RATCHET_BASELINE[relPath] ?? MAX_NEW_COMPONENT_LINES
    if (lines > ceiling) {
      violations.gate3LineCountRatchet.push({
        file: relPath,
        line: lines,
        snippet: `${lines} lines > ceiling ${ceiling} lines`,
      })
    }
  }

  const totalViolations =
    violations.gate1SlopGradients.length +
    violations.gate2LegacyHslVar.length +
    violations.gate3LineCountRatchet.length

  return {
    filesScanned: files.length,
    violations,
    totalViolations,
  }
}

function main() {
  const res = scanUiTokens()
  console.log('[check-ui-tokens] scanned', res.filesScanned, 'UI files')
  console.log(
    `  Gate 1 (anti-AI-slop gradients): ${res.violations.gate1SlopGradients.length === 0 ? 'CLEAN' : `${res.violations.gate1SlopGradients.length} violation(s)`}`
  )
  console.log(
    `  Gate 2 (legacy hsl(var())):      ${res.violations.gate2LegacyHslVar.length === 0 ? 'CLEAN' : `${res.violations.gate2LegacyHslVar.length} violation(s)`}`
  )
  console.log(
    `  Gate 3 (line-count ratchet):     ${res.violations.gate3LineCountRatchet.length === 0 ? 'CLEAN' : `${res.violations.gate3LineCountRatchet.length} violation(s)`}`
  )

  if (res.totalViolations > 0) {
    for (const [gateName, list] of Object.entries(res.violations)) {
      if (list.length === 0) continue
      console.error(`\n── ${gateName} ──`)
      for (const v of list) {
        console.error(`  ${v.file}:${v.line}  ${v.snippet}`)
      }
    }
    process.exitCode = 1
    return
  }

  console.log('[check-ui-tokens] OK — all UI design & architecture gates clean')
}

if (require.main === module) {
  main()
}

module.exports = {
  scanUiTokens,
  AI_SLOP_GRADIENT_RE,
  LEGACY_HSL_VAR_WRAPPER_RE,
  MAX_NEW_COMPONENT_LINES,
}
