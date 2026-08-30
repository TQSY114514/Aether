const fs = require('fs')
const path = require('path')

const MAX_FILES = 1000
const MAX_LINES = 10000

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.aether', 'dist', 'build', 'out', 'coverage'])

function extractSignatures(content, ext) {
  const lines = content.split('\n')
  const sigs = []
  
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    for (const line of lines) {
      if (line.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/)) {
        sigs.push(line.trim().replace(/\{.*$/, '').trim())
      } else if (line.match(/^(?:export\s+)?class\s+([a-zA-Z0-9_]+)/)) {
        sigs.push(line.trim().replace(/\{.*$/, '').trim())
      } else if (line.match(/^(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>/)) {
        sigs.push(line.trim().replace(/=>.*$/, '=> { ... }').trim())
      } else if (line.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/)) {
        sigs.push(line.trim().replace(/\{.*$/, '').trim())
      } else if (line.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_]+)/)) {
        sigs.push(line.trim())
      }
    }
  } else if (['.py'].includes(ext)) {
    for (const line of lines) {
      if (line.match(/^def\s+[a-zA-Z0-9_]+/)) sigs.push(line.trim().replace(/:.*$/, ''))
      else if (line.match(/^class\s+[a-zA-Z0-9_]+/)) sigs.push(line.trim().replace(/:.*$/, ''))
    }
  } else if (['.go'].includes(ext)) {
    for (const line of lines) {
      if (line.match(/^func\s+/)) sigs.push(line.trim().replace(/\{.*$/, '').trim())
      else if (line.match(/^type\s+[a-zA-Z0-9_]+\s+(?:struct|interface)/)) sigs.push(line.trim().replace(/\{.*$/, '').trim())
    }
  }
  
  return sigs.slice(0, 50) // limit signatures per file to avoid bloat
}

function buildRepoMap(dir, baseDir = dir, result = [], stats = { files: 0, lines: 0 }) {
  if (stats.files >= MAX_FILES || stats.lines >= MAX_LINES) return result
  
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return result
  }
  
  for (const entry of entries) {
    if (stats.files >= MAX_FILES || stats.lines >= MAX_LINES) break
    
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        buildRepoMap(path.join(dir, entry.name), baseDir, result, stats)
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name)
      const allowedExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp']
      if (allowedExts.includes(ext)) {
        const fullPath = path.join(dir, entry.name)
        const relPath = path.relative(baseDir, fullPath)
        stats.files++
        
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const sigs = extractSignatures(content, ext)
          if (sigs.length > 0) {
            result.push(`${relPath}:`)
            sigs.forEach(s => {
              result.push(`  ${s}`)
              stats.lines++
            })
          } else {
            result.push(`${relPath}: (no exported signatures)`)
            stats.lines++
          }
        } catch (e) {
          // ignore read errors
        }
      }
    }
  }
  return result
}

module.exports = { buildRepoMap }
