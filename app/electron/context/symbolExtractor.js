// ───────────────────────────────────────────────────────────────────────────
// Symbol Extractor — parses source files to extract imports, exports,
// classes, and function declarations.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')

const JS_TS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const PY_EXTS = new Set(['.py'])
const RUST_EXTS = new Set(['.rs'])
const GO_EXTS = new Set(['.go'])
const JAVA_EXTS = new Set(['.java', '.kt'])

/**
 * Extract symbols from a single file.
 * @param {string} filePath - Absolute path.
 * @param {string} content - File contents.
 * @returns {{ path: string, imports: string[], exports: string[], symbols: string[], language: string } | null}
 */
function extractFile(filePath, content) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const lang = detectLanguage(ext)

  if (JS_TS_EXTS.has(ext)) return extractJS(content, filePath, lang)
  if (PY_EXTS.has(ext)) return extractPY(content, filePath, lang)
  if (RUST_EXTS.has(ext)) return extractRust(content, filePath, lang)
  if (GO_EXTS.has(ext)) return extractGo(content, filePath, lang)
  if (JAVA_EXTS.has(ext)) return extractJava(content, filePath, lang)
  return null
}

function detectLanguage(ext) {
  if (JS_TS_EXTS.has(ext)) return 'javascript'
  if (PY_EXTS.has(ext)) return 'python'
  if (RUST_EXTS.has(ext)) return 'rust'
  if (GO_EXTS.has(ext)) return 'go'
  if (JAVA_EXTS.has(ext)) return ext === '.kt' ? 'kotlin' : 'java'
  return ext.slice(1)
}

function extractJS(content, filePath, lang) {
  const imports = []
  const exports = []
  const symbols = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // import X from '...'
    const importM = trimmed.match(/^import\s+(?:\{([^}]+)\}|\*\s+as\s+\w+|(\w+))?\s*(?:,\s*\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/)
    if (importM) {
      const source = importM[4]
      if (source && !source.startsWith('.') && !source.startsWith('/')) {
        imports.push(source.split('/')[0])
      } else if (source) {
        imports.push(source)
      }
    }
    // export { X, Y } / export default
    if (/^export\s+/.test(trimmed)) {
      const namedM = trimmed.match(/^export\s+\{([^}]+)\}/)
      if (namedM) {
        for (const n of namedM[1].split(',')) {
          const name = n.trim().split(/\s+as\s+/)[0].trim()
          if (name) exports.push(name)
        }
      }
      if (trimmed.includes('export default')) exports.push('__default__')
    }
    // class X
    const classM = trimmed.match(/^(?:export\s+)?(?:default\s+)?class\s+(\w+)/)
    if (classM) symbols.push(classM[1])
    // function X / const X = (async)? function
    const fnM = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/)
    if (fnM) symbols.push(fnM[1])
    const arrowM = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=].*(?:async\s+)?\(/)
    if (arrowM) symbols.push(arrowM[1])
  }

  return { path: filePath, imports, exports, symbols, language: lang }
}

function extractPY(content, filePath, lang) {
  const imports = []
  const exports = []
  const symbols = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    const importM = trimmed.match(/^(?:from\s+([\w.]+)\s+import|import\s+(?:[\w.]+\s+as\s+)?(\w+))/)
    if (importM) {
      const mod = importM[1] || importM[2]
      if (mod && !mod.startsWith('.')) imports.push(mod.split('.')[0])
      else if (mod) imports.push(mod)
    }
    const classM = trimmed.match(/^class\s+(\w+)/)
    if (classM) symbols.push(classM[1])
    const fnM = trimmed.match(/^def\s+(\w+)/)
    if (fnM) symbols.push(fnM[1])
    if (trimmed.includes('__all__')) {
      const allM = trimmed.match(/\[([^\]]+)\]/)
      if (allM) {
        for (const n of allM[1].split(',')) {
          const name = n.trim().replace(/['"]/g, '')
          if (name) exports.push(name)
        }
      }
    }
  }

  return { path: filePath, imports, exports, symbols, language: lang }
}

function extractRust(content, filePath, lang) {
  const imports = []
  const symbols = []
  for (const line of content.split('\n')) {
    const m = line.match(/^use\s+([\w:]+)/)
    if (m) imports.push(m[1].split(':')[0])
    const cm = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/)
    if (cm) symbols.push(cm[1])
    const sm = line.match(/^(?:pub\s+)?struct\s+(\w+)/)
    if (sm) symbols.push(sm[1])
    const tm = line.match(/^(?:pub\s+)?trait\s+(\w+)/)
    if (tm) symbols.push(tm[1])
  }
  return { path: filePath, imports, exports: [], symbols, language: lang }
}

function extractGo(content, filePath, lang) {
  const imports = []
  const symbols = []
  for (const line of content.split('\n')) {
    const m = line.match(/^import\s+"([^"]+)"/)
    if (m) imports.push(m[1])
    const fm = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/)
    if (fm) symbols.push(fm[1])
    const tm = line.match(/^type\s+(\w+)\s+(?:struct|interface|map|chan)/)
    if (tm) symbols.push(tm[1])
  }
  return { path: filePath, imports, exports: [], symbols, language: lang }
}

function extractJava(content, filePath, lang) {
  const imports = []
  const symbols = []
  for (const line of content.split('\n')) {
    const m = line.match(/^import\s+([\w.]+)/)
    if (m) imports.push(m[1].split('.').pop() || m[1])
    const cm = line.match(/^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/)
    if (cm) symbols.push(cm[1])
    const mm = line.match(/^(?:public\s+)?(?:static\s+)?(?:abstract\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/)
    if (mm) symbols.push(mm[1])
  }
  return { path: filePath, imports, exports: [], symbols, language: lang }
}

/**
 * Extract symbols from multiple files.
 * Reads each file's content from disk (fileScanner only returns metadata).
 */
async function extractBatch(files) {
  const results = []
  for (const f of files) {
    let content = ''
    try {
      content = fs.readFileSync(f.absPath, 'utf-8')
    } catch {
      continue // unreadable file — skip
    }
    const extracted = extractFile(f.absPath, content)
    if (extracted) results.push(extracted)
  }
  return results
}

module.exports = { extractFile, extractBatch }
