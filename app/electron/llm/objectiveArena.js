// ───────────────────────────────────────────────────────────────────────────
// Objective Arena — Automated Benchmark & Verification Engine.
//
// Unlike subjective human voting, Objective Arena runs candidate models against
// real codebases, applies their patches in isolated shadow worktrees/sandboxes,
// runs real verification commands (npm test, build, lint), and automatically
// updates personal Arena ELO ratings in SQLite based on objective pass/fail metrics.
//
// Flow:
//   Task Prompt + Verify Command
//     │
//     ├── Model A ──► Generate Patch ──► Apply in Sandbox A ──► Run Verify ──┐
//     └── Model B ──► Generate Patch ──► Apply in Sandbox B ──► Run Verify ──┤
//                                                                            ▼
//                                                               Objective Scorer
//                                                                            │
//                                                                            ▼
//                                                              Auto ELO Record in DB
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const { completeChatMessage, normalizeUsage } = require('./providerAdapter')
const { computeCost } = require('../utils/cost')
const { applyAnyPatch } = require('../tools/patchEngine')
const log = require('../logger')

/**
 * Terminate a spawned child process and its process tree cleanly.
 * @param {import('child_process').ChildProcess} child
 */
function killProcessTree(child) {
  if (!child || !child.pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } catch {}
  } else {
    try { child.kill('SIGTERM') } catch {}
    try { child.kill('SIGKILL') } catch {}
  }
}

/**
 * Execute a verification command with full stdout/stderr capture, timeout, and abort support.
 * @param {string} verifyCommand - Command to execute
 * @param {string} cwd - Directory to execute in
 * @param {AbortSignal} [signal] - Optional abort signal
 * @param {number} [expectedExitCode=0] - Expected process exit code
 * @param {number} [timeoutMs=30000] - Timeout limit in milliseconds
 * @returns {Promise<{ ok: boolean, exitCode: number, stdout: string, stderr: string, durationMs: number }>}
 */
function runVerifyCommandDetailed(verifyCommand, cwd, signal, expectedExitCode = 0, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now()
    if (signal?.aborted) {
      return resolve({ ok: false, exitCode: -1, stdout: '', stderr: 'Aborted', durationMs: 0 })
    }

    let child
    try {
      child = spawn(verifyCommand, {
        cwd,
        shell: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      return resolve({ ok: false, exitCode: -1, stdout: '', stderr: e.message, durationMs: Date.now() - start })
    }

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })

    let finished = false
    let timer = null
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (!finished) {
        finished = true
        cleanup()
        killProcessTree(child)
        resolve({ ok: false, exitCode: -1, stdout, stderr: stderr + '\nAborted', durationMs: Date.now() - start })
      }
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    timer = setTimeout(() => {
      if (!finished) {
        finished = true
        cleanup()
        killProcessTree(child)
        resolve({
          ok: false,
          exitCode: -1,
          stdout,
          stderr: stderr + `\nTimed out after ${timeoutMs}ms`,
          durationMs: Date.now() - start,
        })
      }
    }, timeoutMs)

    child.on('error', (err) => {
      if (!finished) {
        finished = true
        cleanup()
        resolve({ ok: false, exitCode: -1, stdout, stderr: stderr + '\n' + err.message, durationMs: Date.now() - start })
      }
    })

    child.on('close', (code) => {
      if (!finished) {
        finished = true
        cleanup()
        resolve({
          ok: code === expectedExitCode,
          exitCode: code ?? -1,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        })
      }
    })
  })
}

/**
 * Extract unified diffs or SEARCH/REPLACE blocks from LLM response text and apply to files.
 * @param {string} workspaceDir - Root of target workspace
 * @param {string} responseText - Raw response text from model
 * @returns {{ appliedCount: number, conflicts: string[], filesModified: string[], ok: boolean }}
 */
function isPathInside(parentDir, targetPath) {
  const rel = path.relative(parentDir, targetPath)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** Extract supported patch formats from a model response and apply them safely. */
function extractAndApplyPatches(workspaceDir, responseText) {
  const norm = String(responseText || '').replace(/\r\n/g, '\n')
  let appliedCount = 0
  const conflicts = []
  const filesModified = new Set()
  const baseDir = path.resolve(workspaceDir)

  // 1. Try unified diffs with file headers
  const diffFileRegex = /(?:^|\n)--- (?:a\/)?([^\r\n]+)\r?\n\+\+\+ (?:b\/)?([^\r\n]+)\r?\n(@@[\s\S]*?)(?=(?:\n--- (?:a\/)?|\n```|\s*$))/g
  let diffMatch
  while ((diffMatch = diffFileRegex.exec(norm)) !== null) {
    const rawFile = (diffMatch[2] || diffMatch[1]).trim()
    const patchBlock = diffMatch[0].trim()
    const abs = path.resolve(baseDir, rawFile)
    if (isPathInside(baseDir, abs) && fs.existsSync(abs)) {
      try {
        const orig = fs.readFileSync(abs, 'utf8')
        const res = applyAnyPatch(orig, patchBlock)
        if (res.applied > 0) {
          fs.writeFileSync(abs, res.content, 'utf8')
          appliedCount += res.applied
          filesModified.add(rawFile)
        }
        if (res.conflicts && res.conflicts.length) conflicts.push(...res.conflicts)
      } catch (e) {
        conflicts.push(`Error patching ${rawFile}: ${e.message}`)
      }
    }
  }

  // 2. Try SEARCH/REPLACE blocks preceded by file path
  if (norm.includes('<<<<<<< SEARCH')) {
    const lines = norm.split('\n')
    let currentFile = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const fileMatch = line.match(/^(?:#|\/\/|\/\*|\*|File:|Path:)?\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\s*(?:\*\/)?$/i)
      if (fileMatch && !line.includes('<<<<<<<') && !line.includes('>>>>>>>') && !line.includes('=======')) {
        const cand = fileMatch[1].trim()
        const candAbs = path.resolve(baseDir, cand)
        if (isPathInside(baseDir, candAbs) && fs.existsSync(candAbs)) {
          currentFile = cand
        }
      }

      if (line === '<<<<<<< SEARCH') {
        const searchLines = []
        const replaceLines = []
        let inSearch = true
        let j = i + 1
        while (j < lines.length && lines[j].trim() !== '>>>>>>> REPLACE') {
          if (lines[j].trim() === '=======') {
            inSearch = false
          } else if (inSearch) {
            searchLines.push(lines[j])
          } else {
            replaceLines.push(lines[j])
          }
          j++
        }
        if (j < lines.length && lines[j].trim() === '>>>>>>> REPLACE') {
          if (currentFile) {
            const abs = path.resolve(baseDir, currentFile)
            try {
              const orig = fs.readFileSync(abs, 'utf8')
              const patchStr = `<<<<<<< SEARCH\n${searchLines.join('\n')}\n=======\n${replaceLines.join('\n')}\n>>>>>>> REPLACE`
              const res = applyAnyPatch(orig, patchStr)
              if (res.applied > 0) {
                fs.writeFileSync(abs, res.content, 'utf8')
                appliedCount += res.applied
                filesModified.add(currentFile)
              }
              if (res.conflicts && res.conflicts.length) conflicts.push(...res.conflicts)
            } catch (e) {
              conflicts.push(`Error patching ${currentFile}: ${e.message}`)
            }
          }
          i = j
        }
      }
    }
  }

  return {
    appliedCount,
    conflicts,
    filesModified: Array.from(filesModified),
    ok: appliedCount > 0 && conflicts.length === 0,
  }
}

/**
 * Recursively copy a directory excluding heavy folders (.git, node_modules, dist)
 * for fast and isolated objective benchmarking.
 */
function copyDirectorySync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isSymbolicLink()) {
      continue
    }
    if (entry.name === '.git' || entry.name === 'dist') {
      continue
    }
    if (entry.name === 'node_modules') {
      try {
        const targetType = process.platform === 'win32' ? 'junction' : 'dir'
        fs.symlinkSync(srcPath, destPath, targetType)
      } catch {}
      continue
    }
    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath)
    } else {
      try { fs.copyFileSync(srcPath, destPath) } catch {}
    }
  }
}

/**
 * Execute an Objective Arena benchmark round across 2+ models.
 * Automatically verifies code against real tests, scores objectively,
 * and updates SQLite ELO ratings.
 *
 * @param {object} options
 * @param {object} options.db - Database instance (for reading models and recording ELO)
 * @param {Array<object>} options.models - Candidate model objects
 * @param {string} options.prompt - Task instruction / bug description
 * @param {string} options.verifyCommand - Shell verification command (e.g. 'npm test')
 * @param {string} [options.cwd] - Working directory (defaults to process.cwd)
 * @param {number} [options.expectedExitCode=0] - Expected exit code
 * @param {number} [options.timeoutMs=30000] - Test execution timeout
 * @param {boolean} [options.updateScores=true] - Whether to record arena vote in DB
 * @param {AbortSignal} [options.signal] - Abort signal
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<object>} Detailed benchmark result
 */
async function runObjectiveEvaluation({
  db,
  models,
  prompt,
  verifyCommand,
  cwd,
  expectedExitCode = 0,
  timeoutMs = 30000,
  updateScores = true,
  signal,
  onProgress,
  completeChatMessageFn,
}) {
  const baseCwd = path.resolve(cwd || process.cwd())
  const selectedModels = Array.isArray(models) ? models : []
  if (selectedModels.length === 0) {
    throw new Error('At least one model is required for objective evaluation')
  }

  const sessionHash = `arena-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const baseTempDir = path.join(os.tmpdir(), `aether-obj-arena-${sessionHash}`)
  fs.mkdirSync(baseTempDir, { recursive: true })

  try {
    const roundResults = await Promise.all(
      selectedModels.map(async (m) => {
        const modelTempDir = path.join(baseTempDir, `model-${m.id}`)
        fs.mkdirSync(modelTempDir, { recursive: true })
        // Clone project files for isolated sandbox execution
        copyDirectorySync(baseCwd, modelTempDir)

        const start = Date.now()
        onProgress?.({ modelId: m.id, status: 'generating' })

        // 1. Ask model for the solution / patch
        const systemPrompt = [
          'You are an expert software engineer resolving a codebase issue.',
          'Analyze the task prompt carefully. Output your modifications using SEARCH/REPLACE blocks or unified diffs.',
          'Format:',
          'File: <relative/path/to/file>',
          '<<<<<<< SEARCH',
          '<exact existing code to find>',
          '=======',
          '<replacement code>',
          '>>>>>>> REPLACE',
          'Only modify necessary files. Do not include extraneous conversational text.',
        ].join('\n')

        let answer = ''
        let usage = null
        try {
          const callFn = completeChatMessageFn || completeChatMessage
          const res = await callFn({
            provider: { id: m.provider_id, api_url: m.api_url, api_key: m.api_key, api_format: m.api_format || 'openai' },
            model: m,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            signal,
          })
          answer = res.content || ''
          usage = normalizeUsage(res.usage)
        } catch (e) {
          return {
            modelId: m.id,
            modelName: m.model_name,
            providerName: m.provider_name,
            passed: false,
            exitCode: -1,
            stdout: '',
            stderr: `Generation failed: ${e.message}`,
            durationMs: Date.now() - start,
            latencyMs: Date.now() - start,
            cost: 0,
            tokens: 0,
            patchApplied: false,
          }
        }

        const cost = usage ? computeCost(m, usage) : 0
        const tokens = usage?.total_tokens || 0
        const genLatency = Date.now() - start

        onProgress?.({ modelId: m.id, status: 'patching' })

        // 2. Apply patch to the isolated sandbox
        const patchRes = extractAndApplyPatches(modelTempDir, answer)

        onProgress?.({ modelId: m.id, status: 'verifying' })

        // 3. Run verification command inside sandbox
        const verifyRes = await runVerifyCommandDetailed(
          verifyCommand,
          modelTempDir,
          signal,
          expectedExitCode,
          timeoutMs,
        )

        return {
          modelId: m.id,
          modelName: m.model_name,
          providerName: m.provider_name,
          passed: Boolean(verifyRes.ok && patchRes.appliedCount > 0),
          exitCode: verifyRes.exitCode,
          stdout: verifyRes.stdout,
          stderr: verifyRes.stderr,
          durationMs: verifyRes.durationMs,
          latencyMs: genLatency + verifyRes.durationMs,
          cost,
          tokens,
          patchApplied: patchRes.ok,
          filesModified: patchRes.filesModified,
        }
      })
    )

    // 4. Objectively rank models
    // Sort criteria: passed > latency > cost
    const sorted = [...roundResults].sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? -1 : 1
      if (a.passed && b.passed) {
        if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs
        return a.cost - b.cost
      }
      return a.durationMs - b.durationMs
    })

    const top = sorted[0]
    let winner = null
    const losers = []
    let isTie = false

    if (sorted.length >= 2) {
      const runnerUp = sorted[1]
      if (top.passed && !runnerUp.passed) {
        winner = top
        losers.push(...sorted.slice(1))
      } else if (top.passed && runnerUp.passed) {
        // If both passed, margin of 20% latency difference determines clean win
        if (top.durationMs < runnerUp.durationMs * 0.8) {
          winner = top
          losers.push(...sorted.slice(1))
        } else {
          isTie = true
        }
      } else {
        isTie = true
      }
    } else if (sorted.length === 1 && top.passed) {
      winner = top
    }

    // 5. Automatically record Arena Vote in SQLite database if applicable
    let eloUpdated = false
    if (updateScores && db && winner && losers.length > 0) {
      try {
        await db.recordArenaVote({
          prompt,
          winnerModelId: winner.modelId,
          winnerModelName: winner.modelName,
          loserModelIds: losers.map((l) => l.modelId),
          loserModelNames: losers.map((l) => l.modelName),
          intent: 'coding',
        })
        eloUpdated = true
      } catch (e) {
        log.warn('Objective arena failed to record ELO vote:', e.message)
      }
    }

    return {
      prompt,
      verifyCommand,
      winnerId: winner?.modelId || null,
      winnerName: winner?.modelName || null,
      isTie,
      models: roundResults,
      eloUpdated,
      timestamp: new Date().toISOString(),
    }
  } finally {
    // Cleanup temporary sandboxes
    try {
      fs.rmSync(baseTempDir, { recursive: true, force: true })
    } catch {}
  }
}

module.exports = {
  runObjectiveEvaluation,
  runVerifyCommandDetailed,
  extractAndApplyPatches,
}
