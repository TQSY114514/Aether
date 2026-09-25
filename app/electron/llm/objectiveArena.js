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

const SAFE_VERIFY_ENV_KEYS = [
  'PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'ComSpec', 'WINDIR',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMDATA', 'PROGRAMFILES', 'SYSTEMDRIVE', 'LANG', 'LC_ALL', 'TERM',
]

const STATIC_RESOLVE_HOOK_SRC =
  "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){const p=process.env.AETHER_VERIFY_PARENT_URL;if(p&&e&&e.code==='ERR_MODULE_NOT_FOUND'&&!s.startsWith('.')&&!s.startsWith('/')&&!s.startsWith('file:')){return n(s,{...c,parentURL:p})}throw e}}"
const STATIC_REGISTER_HOOK_SRC =
  `import{register}from'node:module';register(${JSON.stringify('data:text/javascript,' + encodeURIComponent(STATIC_RESOLVE_HOOK_SRC))});`
const STATIC_IMPORT_FLAG = `--import=data:text/javascript,${encodeURIComponent(STATIC_REGISTER_HOOK_SRC)}`

function buildSanitizedVerifyEnv(hostWorkspaceDir) {
  const env = { CI: 'true', NODE_ENV: 'test' }
  for (const key of SAFE_VERIFY_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  if (hostWorkspaceDir) {
    const hostNodeModules = path.join(hostWorkspaceDir, 'node_modules')
    const hostBin = path.join(hostNodeModules, '.bin')
    env.NODE_PATH = env.NODE_PATH
      ? `${hostNodeModules}${path.delimiter}${env.NODE_PATH}`
      : hostNodeModules
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
    env[pathKey] = env[pathKey]
      ? `${hostBin}${path.delimiter}${env[pathKey]}`
      : hostBin
    try {
      env.AETHER_VERIFY_PARENT_URL = require('url').pathToFileURL(path.join(hostWorkspaceDir, 'package.json')).href
      env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${STATIC_IMPORT_FLAG}` : STATIC_IMPORT_FLAG
    } catch {}
  }
  return env
}

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
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
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
 * @returns {Promise<{ ok: boolean, exitCode: number, timedOut: boolean, stdout: string, stderr: string, durationMs: number }>}
 */
function runVerifyCommandDetailed(verifyCommand, cwd, signal, expectedExitCode = 0, timeoutMs = 30000, hostWorkspaceDir = null) {
  return new Promise((resolve) => {
    const start = Date.now()
    if (signal?.aborted) {
      return resolve({ ok: false, exitCode: -1, timedOut: false, stdout: '', stderr: 'Aborted', durationMs: 0 })
    }

    const env = buildSanitizedVerifyEnv(hostWorkspaceDir)

    let child
    try {
      child = spawn(verifyCommand, {
        cwd,
        env,
        shell: true,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      return resolve({ ok: false, exitCode: -1, timedOut: false, stdout: '', stderr: e.message, durationMs: Date.now() - start })
    }

    const MAX_CAPTURE = 256 * 1024
    let stdout = ''
    let stderr = ''
    const appendBounded = (buf, chunk) => {
      const next = buf + chunk
      return next.length > MAX_CAPTURE ? next.slice(next.length - MAX_CAPTURE) : next
    }
    child.stdout?.on('data', (d) => { stdout = appendBounded(stdout, d.toString()) })
    child.stderr?.on('data', (d) => { stderr = appendBounded(stderr, d.toString()) })

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
        resolve({ ok: false, exitCode: -1, timedOut: false, stdout, stderr: stderr + '\nAborted', durationMs: Date.now() - start })
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
          timedOut: true,
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
        resolve({ ok: false, exitCode: -1, timedOut: false, stdout, stderr: stderr + '\n' + err.message, durationMs: Date.now() - start })
      }
    })

    child.on('close', (code) => {
      if (!finished) {
        finished = true
        cleanup()
        resolve({
          ok: code === expectedExitCode,
          exitCode: code ?? -1,
          timedOut: false,
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
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

const PROTECTED_SANDBOX_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
])

function isSafeSandboxTarget(baseDir, targetPath, extraProtected = null) {
  if (!isPathInside(baseDir, targetPath)) return false
  const rel = path.relative(baseDir, targetPath)
  const segments = rel.split(/[\\/]/)
  if (segments.includes('node_modules') || segments.some((s) => s.startsWith('.'))) return false
  const baseName = path.basename(targetPath).toLowerCase()
  if (PROTECTED_SANDBOX_FILES.has(baseName)) return false
  if (/^(vite|vitest|jest)\.config\.[a-z]+$/i.test(baseName)) return false
  if (extraProtected && extraProtected.has(rel.replace(/\\/g, '/'))) return false
  if (!fs.existsSync(targetPath)) return false
  try {
    const stat = fs.lstatSync(targetPath)
    if (stat.isSymbolicLink()) return false
    const realBase = fs.realpathSync(baseDir)
    const realTarget = fs.realpathSync(targetPath)
    return isPathInside(realBase, realTarget)
  } catch {
    return false
  }
}

const UNTRUSTED_PATCH_PATTERNS = [
  /\bchild_process\b/,
  /\b(?:execSync|spawnSync|execFileSync|fork)\s*\(/,
  /\bprocess\.binding\b/,
  /\bprocess\.dlopen\b/,
]

function hasNewlyIntroducedUnsafeApi(origContent, newContent) {
  for (const pat of UNTRUSTED_PATCH_PATTERNS) {
    if (pat.test(newContent) && !pat.test(origContent)) {
      return true
    }
  }
  return false
}

/** Extract supported patch formats from a model response and apply them safely. */
function extractAndApplyPatches(workspaceDir, responseText, protectedRelFiles = null) {
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
    if (isSafeSandboxTarget(baseDir, abs, protectedRelFiles)) {
      try {
        const orig = fs.readFileSync(abs, 'utf8')
        const res = applyAnyPatch(orig, patchBlock)
        if (res.applied > 0 && res.content !== orig) {
          if (hasNewlyIntroducedUnsafeApi(orig, res.content)) {
            conflicts.push(`Rejected unsafe process/execution API in patch for: ${rawFile}`)
          } else {
            fs.writeFileSync(abs, res.content, 'utf8')
            appliedCount += res.applied
            filesModified.add(rawFile)
          }
        }
        if (res.conflicts && res.conflicts.length) conflicts.push(...res.conflicts)
      } catch (e) {
        conflicts.push(`Error patching ${rawFile}: ${e.message}`)
      }
    } else {
      conflicts.push(`Rejected invalid or unsafe file target: ${rawFile}`)
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
        currentFile = null
        if (isSafeSandboxTarget(baseDir, candAbs, protectedRelFiles)) {
          currentFile = cand
        } else {
          conflicts.push(`Rejected invalid or unsafe file target: ${cand}`)
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
            if (isSafeSandboxTarget(baseDir, abs, protectedRelFiles)) {
              try {
                const orig = fs.readFileSync(abs, 'utf8')
                const patchStr = `<<<<<<< SEARCH\n${searchLines.join('\n')}\n=======\n${replaceLines.join('\n')}\n>>>>>>> REPLACE`
                const res = applyAnyPatch(orig, patchStr)
                if (res.applied > 0 && res.content !== orig) {
                  if (hasNewlyIntroducedUnsafeApi(orig, res.content)) {
                    conflicts.push(`Rejected unsafe process/execution API in patch for: ${currentFile}`)
                  } else {
                    fs.writeFileSync(abs, res.content, 'utf8')
                    appliedCount += res.applied
                    filesModified.add(currentFile)
                  }
                }
                if (res.conflicts && res.conflicts.length) conflicts.push(...res.conflicts)
              } catch (e) {
                conflicts.push(`Error patching ${currentFile}: ${e.message}`)
              }
            } else {
              conflicts.push(`Rejected unsafe target path: ${currentFile}`)
            }
          } else {
            conflicts.push('SEARCH/REPLACE block missing valid target file')
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
    if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') {
      continue
    }
    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath)
    } else {
      try { fs.copyFileSync(srcPath, destPath) } catch {}
    }
  }
}

async function copyDirectoryAsync(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isSymbolicLink()) {
      continue
    }
    if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') {
      continue
    }
    if (entry.isDirectory()) {
      await copyDirectoryAsync(srcPath, destPath)
    } else {
      try { await fs.promises.copyFile(srcPath, destPath) } catch {}
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
  allowPassingBaseline = false,
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
  await fs.promises.mkdir(baseTempDir, { recursive: true })

  try {
    // 0. Run baseline verification on unmodified workspace clone so pre-passing
    // commands cannot grant false-positive wins to arbitrary/unrelated edits.
    const baselineTempDir = path.join(baseTempDir, 'baseline')
    await fs.promises.mkdir(baselineTempDir, { recursive: true })
    await copyDirectoryAsync(baseCwd, baselineTempDir)
    const baselineRes = await runVerifyCommandDetailed(
      verifyCommand,
      baselineTempDir,
      signal,
      expectedExitCode,
      timeoutMs,
      baseCwd,
    )
    const baselineAlreadyPassed = Boolean(baselineRes.ok)
    const protectedRelFiles = new Set()
    for (const token of String(verifyCommand || '').split(/\s+/)) {
      const cleaned = token.replace(/^['"]|['"]$/g, '').replace(/\\/g, '/')
      if (cleaned && /\.[a-z0-9]+$/i.test(cleaned) && !cleaned.startsWith('-')) {
        protectedRelFiles.add(cleaned.replace(/^\.\//, ''))
      }
    }

    // Build a bounded, deterministic snapshot of editable workspace source files so
    // every candidate model receives identical relative paths and source text for SEARCH blocks.
    let enrichedUserPrompt = prompt
    try {
      const { redactMiddleware } = require('./toolResultMiddleware')
      const IGNORED_DIRS = new Set(['.git', 'dist', 'build', 'out', 'node_modules', '.next', 'coverage', 'vendor'])
      const SENSITIVE_FILE_RE = /^(?:\.env(?:\..+)?|credentials\.json|secrets?\.(?:json|ya?ml|js|ts)|service[-_]?account.*\.json|id_rsa.*|.*\.(?:pem|key|p12|pfx))$/i
      const candidates = []
      const walk = async (dir) => {
        if (candidates.length >= 500) return
        const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const ent of entries) {
          if (candidates.length >= 500) break
          const full = path.join(dir, ent.name)
          if (ent.isDirectory()) {
            if (!IGNORED_DIRS.has(ent.name) && !ent.name.startsWith('.')) await walk(full)
          } else if (ent.isFile() && /\.(js|ts|jsx|tsx|mjs|cjs|py|json|css|html)$/i.test(ent.name)) {
            if (SENSITIVE_FILE_RE.test(ent.name)) continue
            const rel = path.relative(baseCwd, full).replace(/\\/g, '/')
            if (!isSafeSandboxTarget(baseCwd, full, protectedRelFiles)) continue
            candidates.push({ rel, full })
          }
        }
      }
      await walk(baseCwd)
      // Prioritize files mentioned in the prompt (by relative path or basename), then sort lexicographically
      candidates.sort((a, b) => {
        const aHit = (prompt.includes(a.rel) || prompt.includes(path.basename(a.rel))) ? 0 : 1
        const bHit = (prompt.includes(b.rel) || prompt.includes(path.basename(b.rel))) ? 0 : 1
        return aHit !== bHit ? aHit - bHit : a.rel.localeCompare(b.rel)
      })
      const contextParts = []
      let totalChars = 0
      for (const item of candidates.slice(0, 12)) {
        if (totalChars >= 24000) break
        const rawContent = await fs.promises.readFile(item.full, 'utf8').catch(() => '')
        if (!rawContent || rawContent.length > 16000) continue
        const safeContent = typeof redactMiddleware === 'function' ? redactMiddleware(rawContent) : rawContent
        contextParts.push(`File: ${item.rel}\n\`\`\`\n${safeContent}\n\`\`\``)
        totalChars += safeContent.length
      }
      if (contextParts.length > 0) {
        enrichedUserPrompt = `${prompt}\n\nWorkspace Source Context:\n${contextParts.join('\n\n')}`
      }
    } catch {}

    const roundResults = await Promise.all(
      selectedModels.map(async (m) => {
        if (signal && signal.aborted) {
          return {
            modelId: m.id,
            modelName: m.model_name,
            providerName: m.provider_name,
            passed: false,
            aborted: true,
            exitCode: -1,
            stdout: '',
            stderr: 'Aborted',
            durationMs: 0,
            latencyMs: 0,
            cost: 0,
            tokens: 0,
            patchApplied: false,
            filesModified: [],
          }
        }
        const modelTempDir = path.join(baseTempDir, `model-${m.id}`)
        await fs.promises.mkdir(modelTempDir, { recursive: true })
        // Clone project files asynchronously for isolated sandbox execution
        await copyDirectoryAsync(baseCwd, modelTempDir)

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
          const prov = (db && typeof db.getProvider === 'function' ? db.getProvider(m.provider_id) : null) || {}
          const res = await callFn({
            provider: {
              id: m.provider_id,
              api_url: m.api_url || prov.api_url,
              api_key: m.api_key || prov.api_key,
              api_format: m.api_format || prov.api_format || 'openai',
            },
            model: m,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: enrichedUserPrompt },
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
            aborted: Boolean(signal && signal.aborted),
            exitCode: -1,
            stdout: '',
            stderr: `Generation failed: ${e.message}`,
            durationMs: Date.now() - start,
            latencyMs: Date.now() - start,
            cost: 0,
            tokens: 0,
            patchApplied: false,
            filesModified: [],
          }
        }

        const cost = usage ? computeCost(m, usage) : 0
        const tokens = usage?.total_tokens || 0
        const genLatency = Date.now() - start

        onProgress?.({ modelId: m.id, status: 'patching' })

        // 2. Apply patch to the isolated sandbox (protecting verifier scripts and configs)
        const patchRes = extractAndApplyPatches(modelTempDir, answer, protectedRelFiles)

        onProgress?.({ modelId: m.id, status: 'verifying' })

        // 3. Run verification command inside sandbox with read-only NODE_PATH resolution
        const verifyRes = await runVerifyCommandDetailed(
          verifyCommand,
          modelTempDir,
          signal,
          expectedExitCode,
          timeoutMs,
          baseCwd,
        )

        const baselineValid = !baselineAlreadyPassed || allowPassingBaseline
        return {
          modelId: m.id,
          modelName: m.model_name,
          providerName: m.provider_name,
          passed: Boolean(
            !(signal && signal.aborted) &&
            baselineValid &&
            verifyRes.ok &&
            patchRes.ok &&
            patchRes.appliedCount > 0 &&
            patchRes.filesModified.length > 0
          ),
          aborted: Boolean(signal && signal.aborted),
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

    if (signal && signal.aborted) {
      return {
        prompt,
        verifyCommand,
        aborted: true,
        baselineAlreadyPassed,
        winnerId: null,
        winnerName: null,
        isTie: false,
        models: roundResults,
        eloUpdated: false,
        timestamp: new Date().toISOString(),
      }
    }

    // 4. Objectively rank models
    // Sort criteria: passed > end-to-end latencyMs > cost
    const sorted = [...roundResults].sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? -1 : 1
      if (a.passed && b.passed) {
        if (a.latencyMs !== b.latencyMs) return a.latencyMs - b.latencyMs
        return a.cost - b.cost
      }
      return a.latencyMs - b.latencyMs
    })

    const top = sorted[0]
    let winner = null
    const losers = []
    let isTie = false

    if (sorted.length >= 2) {
      const passedModels = sorted.filter((r) => r.passed)
      const failedModels = sorted.filter((r) => !r.passed)
      if (passedModels.length >= 1 && failedModels.length >= 1) {
        winner = passedModels[0]
        losers.push(...failedModels)
      } else if (passedModels.length >= 2) {
        const runnerUp = passedModels[1]
        // If all passed, margin of 20% end-to-end latency difference determines clean win
        if (top.latencyMs < runnerUp.latencyMs * 0.8) {
          winner = top
          losers.push(...passedModels.slice(1))
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
    if (updateScores && db && winner && losers.length > 0 && !(signal && signal.aborted)) {
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
      aborted: false,
      baselineAlreadyPassed,
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
