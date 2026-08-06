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
 * @returns {{ path: string, imports: string[], exports: string[], symbols: string[], symbolLocs: Array<{ name: string, locStart: number, locEnd: number }>, language: string } | null}
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
  const symbolLocs = []
  const lines = content.split('\n')

  // Find the 1-based line of the closing brace that balances the block opened at
  // or after (openLineIdx, startCol). Falls back to the opening line when no
  // brace is found (e.g. a brace-less declaration).
  const findEndLine = (openLineIdx, startCol) => {
    let depth = 0
    let opened = false
    for (let i = openLineIdx; i < lines.length; i++) {
      const line = lines[i]
      for (let c = i === openLineIdx ? startCol : 0; c < line.length; c++) {
        const ch = line[c]
        if (ch === '{') { depth++; opened = true }
        else if (ch === '}') { depth--; if (opened && depth === 0) return i + 1 }
      }
    }
    return openLineIdx + 1
  }

  // Record a symbol with its declaration line and (brace-balanced) end line,
  // keeping symbols and symbolLocs in lockstep order.
  const addSymbol = (name, openLineIdx, openCol) => {
    symbols.push(name)
    symbolLocs.push({ name, locStart: openLineIdx + 1, locEnd: findEndLine(openLineIdx, openCol) })
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
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
    // class X { ... } — may span multiple lines
    const classM = trimmed.match(/^(?:export\s+)?(?:default\s+)?class\s+(\w+)/)
    if (classM) {
      const openCol = line.lastIndexOf('{')
      addSymbol(classM[1], idx, openCol === -1 ? 0 : openCol)
      continue
    }
    // function X(...) { ... } — may span multiple lines
    const fnM = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/)
    if (fnM) {
      const openCol = line.lastIndexOf('{')
      addSymbol(fnM[1], idx, openCol === -1 ? 0 : openCol)
      continue
    }
    // const X = (...) => { ... } — arrow-function assignment
    const arrowM = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=].*=>/)
    if (arrowM) {
      const openCol = line.lastIndexOf('{')
      addSymbol(arrowM[1], idx, openCol === -1 ? 0 : openCol)
      continue
    }
  }

  return { path: filePath, imports, exports, symbols, symbolLocs, language: lang }
}

function extractPY(content, filePath, lang) {
  const imports = []
  const exports = []
  const symbols = []
  const symbolLocs = []
  const lines = content.split('\n')

  for (let idx = 0; idx < lines.length; idx++) {
    const trimmed = lines[idx].trim()
    const importM = trimmed.match(/^(?:from\s+([\w.]+)\s+import|import\s+(?:[\w.]+\s+as\s+)?(\w+))/)
    if (importM) {
      const mod = importM[1] || importM[2]
      if (mod && !mod.startsWith('.')) imports.push(mod.split('.')[0])
      else if (mod) imports.push(mod)
    }
    const classM = trimmed.match(/^class\s+(\w+)/)
    if (classM) { symbols.push(classM[1]); symbolLocs.push({ name: classM[1], locStart: idx + 1, locEnd: idx + 1 }) }
    const fnM = trimmed.match(/^def\s+(\w+)/)
    if (fnM) { symbols.push(fnM[1]); symbolLocs.push({ name: fnM[1], locStart: idx + 1, locEnd: idx + 1 }) }
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

  return { path: filePath, imports, exports, symbols, symbolLocs, language: lang }
}

function extractRust(content, filePath, lang) {
  const imports = []
  const symbols = []
  const symbolLocs = []
  const lines = content.split('\n')
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const m = line.match(/^use\s+([\w:]+)/)
    if (m) imports.push(m[1].split(':')[0])
    const cm = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/)
    if (cm) { symbols.push(cm[1]); symbolLocs.push({ name: cm[1], locStart: idx + 1, locEnd: idx + 1 }) }
    const sm = line.match(/^(?:pub\s+)?struct\s+(\w+)/)
    if (sm) { symbols.push(sm[1]); symbolLocs.push({ name: sm[1], locStart: idx + 1, locEnd: idx + 1 }) }
    const tm = line.match(/^(?:pub\s+)?trait\s+(\w+)/)
    if (tm) { symbols.push(tm[1]); symbolLocs.push({ name: tm[1], locStart: idx + 1, locEnd: idx + 1 }) }
  }
  return { path: filePath, imports, exports: [], symbols, symbolLocs, language: lang }
}

function extractGo(content, filePath, lang) {
  const imports = []
  const symbols = []
  const symbolLocs = []
  const lines = content.split('\n')
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const m = line.match(/^import\s+"([^"]+)"/)
    if (m) imports.push(m[1])
    const fm = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/)
    if (fm) { symbols.push(fm[1]); symbolLocs.push({ name: fm[1], locStart: idx + 1, locEnd: idx + 1 }) }
    const tm = line.match(/^type\s+(\w+)\s+(?:struct|interface|map|chan)/)
    if (tm) { symbols.push(tm[1]); symbolLocs.push({ name: tm[1], locStart: idx + 1, locEnd: idx + 1 }) }
  }
  return { path: filePath, imports, exports: [], symbols, symbolLocs, language: lang }
}

function extractJava(content, filePath, lang) {
  const imports = []
  const symbols = []
  const symbolLocs = []
  const lines = content.split('\n')
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const m = line.match(/^import\s+([\w.]+)/)
    if (m) imports.push(m[1].split('.').pop() || m[1])
    const cm = line.match(/^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/)
    if (cm) { symbols.push(cm[1]); symbolLocs.push({ name: cm[1], locStart: idx + 1, locEnd: idx + 1 }) }
    const mm = line.match(/^(?:public\s+)?(?:static\s+)?(?:abstract\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/)
    if (mm) { symbols.push(mm[1]); symbolLocs.push({ name: mm[1], locStart: idx + 1, locEnd: idx + 1 }) }
  }
  return { path: filePath, imports, exports: [], symbols, symbolLocs, language: lang }
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
