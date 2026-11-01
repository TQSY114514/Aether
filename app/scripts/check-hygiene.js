#!/usr/bin/env node
/**
 * Automated Code Hygiene & Orphan Detection Guard
 *
 * Verifies that:
 * 1. Zero orphaned components or pages exist in `app/src/` (every UI component must be imported).
 * 2. Zero Electron/Node native modules (`better-sqlite3`, `child_process`, `fs`) are imported in `app/src/` (contextBridge isolation).
 * 3. Zero hardcoded OpenAI/Anthropic/GitHub API keys leak into tracked source files.
 *
 * Usage: node scripts/check-hygiene.js
 * Exit code: 0 = passed, 1 = hygiene violation detected
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')

console.log('\n========== 代码卫生与孤立文件校验 (Code Hygiene & Orphan Guard) ==========')

let hasErrors = false

// 1. Collect all src files
function walk(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') results = results.concat(walk(p))
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js')) {
      results.push(p)
    }
  }
  return results
}

const allSrcFiles = walk(SRC_DIR)
const allSrcContent = allSrcFiles.map(f => ({
  file: f,
  rel: path.relative(SRC_DIR, f).replace(/\\/g, '/'),
  content: fs.readFileSync(f, 'utf8')
}))

// Combine all file contents for quick import searching
const fullContentPool = allSrcContent.map(f => f.content).join('\n')

// 2. Check for orphaned UI components and pages
const uiDirs = [
  path.join(SRC_DIR, 'components'),
  path.join(SRC_DIR, 'pages')
]

const EXCLUDED_ENTRIES = new Set([
  'App.tsx',
  'main.tsx',
  'vite-env.d.ts',
  'env.d.ts'
])

let orphanedFiles = []

for (const { file, rel } of allSrcContent) {
  const isUI = uiDirs.some(dir => file.startsWith(dir))
  if (!isUI) continue

  const basename = path.basename(file, path.extname(file))
  if (basename === 'index' || EXCLUDED_ENTRIES.has(path.basename(file))) continue
  // Unit tests co-located with components are executed by test runners, not imported by UI
  if (basename.endsWith('.test') || basename.endsWith('.spec')) continue

  // Regex to check if imported by name or path
  // e.g. import Foo from './Foo' or from '@/components/.../Foo'
  const importPattern = new RegExp(`from\\s+['"][^'"]*\\/${basename}['"]|import\\s+.*\\b${basename}\\b`, 'm')
  
  // Count occurrences across all files (excluding itself)
  let importCount = 0
  for (const target of allSrcContent) {
    if (target.file === file) continue
    if (importPattern.test(target.content)) {
      importCount++
      break
    }
  }

  // Also check if imported by tests
  if (importCount === 0) {
    const testDir = path.join(ROOT, 'test')
    if (fs.existsSync(testDir)) {
      const testFiles = walk(testDir)
      for (const tf of testFiles) {
        const tc = fs.readFileSync(tf, 'utf8')
        if (importPattern.test(tc)) {
          importCount++
          break
        }
      }
    }
  }

  if (importCount === 0) {
    orphanedFiles.push(rel)
  }
}

if (orphanedFiles.length > 0) {
  console.error(`❌ 发现 ${orphanedFiles.length} 个未被任何代码或测试引用的孤立组件/页面 (Orphaned Files):`)
  for (const f of orphanedFiles) {
    console.error(`   - src/${f}`)
  }
  hasErrors = true
} else {
  console.log('  ✅ Gate 1 (Zero Orphaned UI Components): CLEAN')
}

// 3. Check for illegal native module imports in renderer (app/src/)
const FORBIDDEN_RENDERER_MODULES = [
  'electron',
  'better-sqlite3',
  'child_process',
  'fs',
  'path',
  'os',
  'net',
  'http'
]

// Exclude offline CLI generator scripts from renderer runtime check
const EXCLUDED_FROM_RENDERER_CHECK = new Set([
  'utils/gen-i18n.js'
])

let forbiddenImportViolations = []

for (const { rel, content } of allSrcContent) {
  if (rel.endsWith('.d.ts') || EXCLUDED_FROM_RENDERER_CHECK.has(rel)) continue
  for (const mod of FORBIDDEN_RENDERER_MODULES) {
    // import ... from 'mod' or require('mod')
    const regex = new RegExp(`(?:import\\s+.*?from\\s+['"]${mod}['"]|require\\(['"]${mod}['"]\\))`, 'g')
    if (regex.test(content)) {
      forbiddenImportViolations.push({ file: `src/${rel}`, module: mod })
    }
  }
}

if (forbiddenImportViolations.length > 0) {
  console.error(`❌ 渲染进程发现非法 Node/Electron 原生依赖直接引用 (Forbidden Renderer Imports):`)
  for (const v of forbiddenImportViolations) {
    console.error(`   - ${v.file} imports '${v.module}' (use window.electronAPI contextBridge instead)`)
  }
  hasErrors = true
} else {
  console.log('  ✅ Gate 2 (Renderer ContextBridge Isolation): CLEAN')
}

// 4. Heuristic Secret / Token Leak Check
const SECRET_REGEXES = [
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/ },
  { name: 'GitHub Personal Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{32,}/ }
]

let secretViolations = []
for (const { rel, content } of allSrcContent) {
  for (const { name, regex } of SECRET_REGEXES) {
    if (regex.test(content)) {
      secretViolations.push({ file: `src/${rel}`, type: name })
    }
  }
}

if (secretViolations.length > 0) {
  console.error(`❌ 发现源代码硬编码密钥泄露风险 (Hardcoded Secret Leakage):`)
  for (const v of secretViolations) {
    console.error(`   - ${v.file}: ${v.type}`)
  }
  hasErrors = true
} else {
  console.log('  ✅ Gate 3 (Zero Hardcoded Secret Tokens): CLEAN')
}

if (hasErrors) {
  console.error('❌ 代码卫生与质量检查未通过，请处理上述问题。\n')
  process.exit(1)
} else {
  console.log('✅ 所有代码卫生与质量检查全部通过 (All code hygiene gates clean).\n')
}
