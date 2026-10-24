const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

/**
 * Compute SHA-256 content hash for string or Buffer
 * @param {string | Buffer} content
 * @returns {string}
 */
function computeContentHash(content) {
  if (content == null) return crypto.createHash('sha256').update('').digest('hex')
  const hash = crypto.createHash('sha256')
  if (Buffer.isBuffer(content)) {
    hash.update(content)
  } else {
    hash.update(String(content), 'utf8')
  }
  return hash.digest('hex')
}

/**
 * Check if targetPath is contained within wsRoot (rejecting path traversal outside)
 * @param {string} wsRoot
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathInsideWorkspace(wsRoot, targetPath) {
  if (!wsRoot || !targetPath) return false
  try {
    const resolvedWs = path.resolve(wsRoot)
    const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(resolvedWs, targetPath)
    const normWs = process.platform === 'win32' ? resolvedWs.toLowerCase() : resolvedWs
    const normTarget = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget

    if (normTarget === normWs) return true
    return normTarget.startsWith(normWs + path.sep)
  } catch {
    return false
  }
}

/**
 * Safely read a file only if it is contained within the workspace root
 * @param {string} targetPath
 * @param {string} wsRoot
 * @returns {string | null}
 */
function safeReadFile(targetPath, wsRoot) {
  if (!isPathInsideWorkspace(wsRoot, targetPath)) return null
  try {
    const resolved = path.isAbsolute(targetPath) ? targetPath : path.resolve(wsRoot, targetPath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null
    try {
      const realTarget = fs.realpathSync(resolved)
      const realWs = fs.realpathSync(wsRoot)
      if (!isPathInsideWorkspace(realWs, realTarget)) return null
    } catch {
      return null
    }
    return fs.readFileSync(resolved, 'utf8')
  } catch {
    return null
  }
}

/**
 * Track files modified during a turn for Git-like change summary (Claude Code / Cursor style)
 */
function createTurnFileTracker(wsRoot) {
  const files = new Map() // absPath -> { absPath, path: relPath, initialExisted: boolean, initialContent: string|null, finalContent: string|null }
  let commandRan = false
  const turnStartTime = Date.now() - 1000

  // Capture baseline git status & file content snapshot at tracker creation to filter pre-turn changes
  const baselineGit = new Map() // relPath -> code
  const baselineSnapshots = new Map() // absPath -> { existed: boolean, content: string|null }
  if (wsRoot) {
    try {
      const { runCommandSync } = require('../tools/exec')
      const st = runCommandSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd: wsRoot })
      if (st.exitCode === 0 && st.stdout) {
        const entries = st.stdout.split('\0').filter(Boolean)
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          if (entry.length < 3) continue
          const code = entry.slice(0, 2).trim()
          let relRaw = entry.slice(3)
          if (code.includes('R') || code.includes('C')) {
            i++
          }
          const normRel = relRaw.replace(/\\/g, '/')
          baselineGit.set(normRel, code)
          const absPath = path.resolve(wsRoot, relRaw)
          let existed = false
          let content = null
          try {
            if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
              existed = true
              content = fs.readFileSync(absPath, 'utf8')
            }
          } catch {}
          baselineSnapshots.set(absPath, { existed, content })
        }
      }
    } catch {}
  }

  const MUTATION_TOOLS = ['write_file', 'edit_file', 'apply_patch', 'replace_file_content', 'write_to_file', 'patch']

  function resolvePath(args) {
    const raw = args?.path || args?.targetPath || args?.filePath || args?.file || args?.TargetFile || args?.targetFile
    if (!raw || typeof raw !== 'string') return null
    return path.isAbsolute(raw) ? path.resolve(raw) : (wsRoot ? path.resolve(wsRoot, raw) : path.resolve(raw))
  }

  return {
    beforeTool(name, args) {
      if (name === 'run_command') {
        commandRan = true
        return
      }
      if (!MUTATION_TOOLS.includes(name)) return
      const absPath = resolvePath(args)
      if (!absPath) return
      if (wsRoot && !isPathInsideWorkspace(wsRoot, absPath)) return
      if (!files.has(absPath)) {
        let existed = false
        let content = null
        try {
          if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
            existed = true
            content = fs.readFileSync(absPath, 'utf-8')
          }
        } catch {}
        const rel = wsRoot ? path.relative(wsRoot, absPath).replace(/\\/g, '/') : path.basename(absPath)
        files.set(absPath, {
          absPath,
          path: rel,
          initialExisted: existed,
          initialContent: content,
          finalContent: content,
        })
      }
    },

    afterTool(name, args) {
      if (!MUTATION_TOOLS.includes(name)) return
      const absPath = resolvePath(args)
      if (!absPath || !files.has(absPath)) return
      if (wsRoot && !isPathInsideWorkspace(wsRoot, absPath)) return
      const record = files.get(absPath)
      try {
        if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
          record.finalContent = fs.readFileSync(absPath, 'utf-8')
        } else {
          record.finalContent = null
        }
      } catch {}
    },

    getSummary() {
      const summary = []
      const { buildUnifiedDiff } = require('../tools/toolImpact')

      for (const [absPath, record] of files.entries()) {
        try {
          if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
            record.finalContent = fs.readFileSync(absPath, 'utf-8')
          } else {
            record.finalContent = null
          }
        } catch {}
        const { path: relPath, initialExisted, initialContent, finalContent } = record
        if (!initialExisted && finalContent === null) continue
        if (initialExisted && finalContent !== null) {
          if (initialContent === finalContent || computeContentHash(initialContent) === computeContentHash(finalContent)) continue
        }

        let added = 0
        let removed = 0
        let status = 'modified'
        let diff = ''

        if (!initialExisted && finalContent !== null) {
          status = 'created'
          const lines = finalContent.length === 0 ? [] : finalContent.replace(/\r?\n$/, '').split('\n')
          added = lines.length
          diff = lines.map(l => '+' + l).join('\n')
          if (!/\r?\n$/.test(finalContent) && lines.length > 0) {
            diff += '\n\\ No newline at end of file'
          }
        } else if (initialExisted && finalContent === null) {
          status = 'deleted'
          const lines = (initialContent || '').length === 0 ? [] : (initialContent || '').replace(/\r?\n$/, '').split('\n')
          removed = lines.length
          diff = lines.map(l => '-' + l).join('\n')
          if (!/\r?\n$/.test(initialContent || '') && lines.length > 0) {
            diff += '\n\\ No newline at end of file'
          }
        } else if (initialContent !== null && finalContent !== null) {
          status = 'modified'
          const oldEndsNewline = /\r?\n$/.test(initialContent)
          const newEndsNewline = /\r?\n$/.test(finalContent)
          const oldLines = initialContent.length === 0 ? [] : initialContent.replace(/\r?\n$/, '').split('\n')
          const newLines = finalContent.length === 0 ? [] : finalContent.replace(/\r?\n$/, '').split('\n')
          diff = buildUnifiedDiff(oldLines, newLines)
          if (oldEndsNewline !== newEndsNewline) {
            const diffLines = diff ? diff.split('\n') : []
            const lastIdx = diffLines.length - 1
            if (lastIdx >= 0) {
              const last = diffLines[lastIdx]
              if (last.startsWith(' ')) {
                const content = last.slice(1)
                if (!oldEndsNewline && newEndsNewline) {
                  diffLines.splice(lastIdx, 1, '-' + content, '\\ No newline at end of file', '+' + content)
                } else if (oldEndsNewline && !newEndsNewline) {
                  diffLines.splice(lastIdx, 1, '-' + content, '+' + content, '\\ No newline at end of file')
                }
              } else if (last.startsWith('+')) {
                if (!newEndsNewline) diffLines.push('\\ No newline at end of file')
              } else if (last.startsWith('-')) {
                if (!oldEndsNewline) diffLines.push('\\ No newline at end of file')
              }
            } else {
              const lastLine = oldLines[oldLines.length - 1] || ''
              diffLines.push(`@@ -${oldLines.length || 1} +${newLines.length || 1} @@`)
              if (!oldEndsNewline && newEndsNewline) {
                diffLines.push('-' + lastLine, '\\ No newline at end of file', '+' + lastLine)
              } else {
                diffLines.push('-' + lastLine, '+' + lastLine, '\\ No newline at end of file')
              }
            }
            diff = diffLines.join('\n')
          }
          for (const line of diff.split('\n')) {
            if (line.startsWith('+')) added++
            else if (line.startsWith('-')) removed++
          }
        }

        if (status === 'modified' && added === 0 && removed === 0) continue

        summary.push({
          path: relPath,
          absPath,
          added,
          removed,
          status,
          diff,
        })
      }

      // If CLI commands ran during the turn, check git status to discover command-driven file changes
      if (commandRan && wsRoot) {
        try {
          const { runCommandSync } = require('../tools/exec')
          const st = runCommandSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd: wsRoot })
          if (st.exitCode === 0 && st.stdout) {
            const entries = st.stdout.split('\0').filter(Boolean)
            for (let i = 0; i < entries.length; i++) {
              const entry = entries[i]
              if (entry.length < 3) continue
              const code = entry.slice(0, 2).trim()
              let relRaw = entry.slice(3)
              // In git status -z format, entry.slice(3) is the new destination path;
              // the next token is the original path, which we skip so the loop continues properly.
              if (code.includes('R') || code.includes('C')) {
                i++
              }
              const normRel = relRaw.replace(/\\/g, '/')
              // If file had the exact same status prior to the turn, check if it was actually touched
              const prevCode = baselineGit.get(normRel)
              const absPath = path.resolve(wsRoot, relRaw)
              if (prevCode === code) {
                try {
                  const stat = fs.existsSync(absPath) ? fs.statSync(absPath) : null
                  if (stat && stat.mtimeMs < turnStartTime) {
                    continue // Untouched pre-existing modification
                  } else if (!stat) {
                    continue // Deleted prior to this turn
                  }
                } catch {
                  continue
                }
              }
              if (!files.has(absPath)) {
                let currentExisted = false
                let currentContent = null
                try {
                  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
                    currentExisted = true
                    currentContent = fs.readFileSync(absPath, 'utf8')
                  }
                } catch {}

                let initialExisted = false
                let initialContent = null
                if (baselineSnapshots.has(absPath)) {
                  const snap = baselineSnapshots.get(absPath)
                  initialExisted = snap.existed
                  initialContent = snap.content
                } else {
                  const showRes = runCommandSync('git', ['show', `HEAD:${normRel}`], { cwd: wsRoot })
                  if (showRes.exitCode === 0) {
                    initialExisted = true
                    initialContent = showRes.stdout
                  }
                }

                if (!initialExisted && !currentExisted) continue
                if (initialExisted && currentExisted) {
                  if (initialContent === currentContent || computeContentHash(initialContent) === computeContentHash(currentContent)) continue
                }

                let status = 'modified'
                let diff = ''
                let added = 0
                let removed = 0

                if (!initialExisted && currentExisted && currentContent !== null) {
                  status = 'created'
                  const lines = currentContent.length === 0 ? [] : currentContent.replace(/\r?\n$/, '').split('\n')
                  added = lines.length
                  diff = lines.map(l => '+' + l).join('\n')
                  if (!/\r?\n$/.test(currentContent) && lines.length > 0) {
                    diff += '\n\\ No newline at end of file'
                  }
                } else if (initialExisted && !currentExisted) {
                  status = 'deleted'
                  const lines = (initialContent || '').length === 0 ? [] : (initialContent || '').replace(/\r?\n$/, '').split('\n')
                  removed = lines.length
                  diff = lines.map(l => '-' + l).join('\n')
                  if (!/\r?\n$/.test(initialContent || '') && lines.length > 0) {
                    diff += '\n\\ No newline at end of file'
                  }
                } else if (initialContent !== null && currentContent !== null) {
                  status = 'modified'
                  let gitDiffOk = false
                  if (!baselineSnapshots.has(absPath)) {
                    const diffRes = runCommandSync('git', ['diff', 'HEAD', '--', normRel], { cwd: wsRoot })
                    if (diffRes.exitCode === 0 && diffRes.stdout) {
                      diff = diffRes.stdout
                      for (const line of diff.split('\n')) {
                        if (line.startsWith('+') && !line.startsWith('+++')) added++
                        else if (line.startsWith('-') && !line.startsWith('---')) removed++
                      }
                      gitDiffOk = true
                    }
                  }
                  if (!gitDiffOk) {
                    const oldEndsNewline = /\r?\n$/.test(initialContent)
                    const newEndsNewline = /\r?\n$/.test(currentContent)
                    const oldLines = initialContent.length === 0 ? [] : initialContent.replace(/\r?\n$/, '').split('\n')
                    const newLines = currentContent.length === 0 ? [] : currentContent.replace(/\r?\n$/, '').split('\n')
                    const MAX_DIFF_LINES = 5000
                    const oldBounded = oldLines.length > MAX_DIFF_LINES ? oldLines.slice(0, MAX_DIFF_LINES) : oldLines
                    const newBounded = newLines.length > MAX_DIFF_LINES ? newLines.slice(0, MAX_DIFF_LINES) : newLines
                    diff = buildUnifiedDiff(oldBounded, newBounded)
                    if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
                      diff += '\n[... diff truncated for large file ...]'
                    }
                    if (oldEndsNewline !== newEndsNewline) {
                      const diffLines = diff ? diff.split('\n') : []
                      const lastIdx = diffLines.length - 1
                      if (lastIdx >= 0) {
                        const last = diffLines[lastIdx]
                        if (last.startsWith(' ')) {
                          const content = last.slice(1)
                          if (!oldEndsNewline && newEndsNewline) {
                            diffLines.splice(lastIdx, 1, '-' + content, '\\ No newline at end of file', '+' + content)
                          } else if (oldEndsNewline && !newEndsNewline) {
                            diffLines.splice(lastIdx, 1, '-' + content, '+' + content, '\\ No newline at end of file')
                          }
                        } else if (last.startsWith('+')) {
                          if (!newEndsNewline) diffLines.push('\\ No newline at end of file')
                        } else if (last.startsWith('-')) {
                          if (!oldEndsNewline) diffLines.push('\\ No newline at end of file')
                        }
                      } else {
                        const lastLine = oldLines[oldLines.length - 1] || ''
                        diffLines.push(`@@ -${oldLines.length || 1} +${newLines.length || 1} @@`)
                        if (!oldEndsNewline && newEndsNewline) {
                          diffLines.push('-' + lastLine, '\\ No newline at end of file', '+' + lastLine)
                        } else {
                          diffLines.push('-' + lastLine, '+' + lastLine, '\\ No newline at end of file')
                        }
                      }
                      diff = diffLines.join('\n')
                    }
                    for (const line of diff.split('\n')) {
                      if (line.startsWith('+')) added++
                      else if (line.startsWith('-')) removed++
                    }
                  }
                }

                if (status === 'modified' && added === 0 && removed === 0) continue

                summary.push({
                  path: normRel,
                  absPath,
                  status,
                  added,
                  removed,
                  diff,
                })
              }
            }
          }
        } catch {}
      }

      if (summary.length === 0) return null

      let totalAdded = 0
      let totalRemoved = 0
      for (const item of summary) {
        totalAdded += item.added
        totalRemoved += item.removed
      }

      return {
        files: summary,
        fileCount: summary.length,
        totalAdded,
        totalRemoved,
      }
    }
  }
}

module.exports = {
  createTurnFileTracker,
  computeContentHash,
  isPathInsideWorkspace,
  safeReadFile,
}
