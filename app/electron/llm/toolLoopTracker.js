const path = require('path')
const fs = require('fs')

/**
 * Track files modified during a turn for Git-like change summary (Claude Code / Cursor style)
 */
function createTurnFileTracker(wsRoot) {
  const files = new Map() // absPath -> { absPath, path: relPath, initialExisted: boolean, initialContent: string|null, finalContent: string|null }
  let commandRan = false

  function resolvePath(args) {
    const raw = args?.path || args?.targetPath || args?.filePath || args?.file
    if (!raw || typeof raw !== 'string') return null
    return path.isAbsolute(raw) ? path.resolve(raw) : (wsRoot ? path.resolve(wsRoot, raw) : path.resolve(raw))
  }

  return {
    beforeTool(name, args) {
      if (name === 'run_command') {
        commandRan = true
        return
      }
      if (!['write_file', 'edit_file', 'apply_patch'].includes(name)) return
      const absPath = resolvePath(args)
      if (!absPath) return
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
      if (!['write_file', 'edit_file', 'apply_patch'].includes(name)) return
      const absPath = resolvePath(args)
      if (!absPath || !files.has(absPath)) return
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
        if (initialContent === finalContent) continue

        let added = 0
        let removed = 0
        let status = 'modified'
        let diff = ''

        if (!initialExisted && finalContent !== null) {
          status = 'created'
          const lines = finalContent.split('\n')
          added = lines.length
          diff = lines.map(l => '+' + l).join('\n')
        } else if (initialExisted && finalContent === null) {
          status = 'deleted'
          const lines = (initialContent || '').split('\n')
          removed = lines.length
          diff = lines.map(l => '-' + l).join('\n')
        } else if (initialContent !== null && finalContent !== null) {
          status = 'modified'
          diff = buildUnifiedDiff(initialContent.split('\n'), finalContent.split('\n'))
          for (const line of diff.split('\n')) {
            if (line.startsWith('+') && !line.startsWith('+++')) added++
            else if (line.startsWith('-') && !line.startsWith('---')) removed++
          }
        }

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
          const st = runCommandSync('git', ['status', '--porcelain', '-uall'], { cwd: wsRoot })
          if (st.exitCode === 0 && st.stdout) {
            const lines = st.stdout.split('\n').filter(Boolean)
            for (const line of lines) {
              const m = line.match(/^.{2}\s+(.+)$/)
              if (!m) continue
              const relRaw = m[1].includes('->') ? m[1].split('->')[1].trim() : m[1].trim()
              const absPath = path.resolve(wsRoot, relRaw)
              if (!files.has(absPath)) {
                const code = line.slice(0, 2).trim()
                let status = 'modified'
                if (code === '??' || code === 'A') status = 'created'
                else if (code === 'D') status = 'deleted'

                let diff = ''
                let added = 0
                let removed = 0
                const diffRes = runCommandSync('git', ['diff', 'HEAD', '--', relRaw], { cwd: wsRoot })
                if (diffRes.exitCode === 0 && diffRes.stdout) {
                  diff = diffRes.stdout
                  for (const dl of diff.split('\n')) {
                    if (dl.startsWith('+') && !dl.startsWith('+++')) added++
                    else if (dl.startsWith('-') && !dl.startsWith('---')) removed++
                  }
                } else if (status === 'created') {
                  try {
                    if (fs.existsSync(absPath)) {
                      const c = fs.readFileSync(absPath, 'utf8')
                      const clines = c.split('\n')
                      added = clines.length
                      diff = clines.map(l => '+' + l).join('\n')
                    }
                  } catch {}
                }
                summary.push({
                  path: relRaw.replace(/\\/g, '/'),
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
}
