// ─────────────────────────────────────────────────────────────────────────────
// prePushGuard.js — Multi-Stage Pre-Push Inspection & Defense Pipeline
//
// Stage 1: Branch Protection (blocks direct push to master/main/release)
// Stage 2: Sensitive & Secret Leak Defense (scans unpushed commits for keys,
//          tokens, .env, DBs, and certificates)
// Stage 3: Pre-Flight Verification Gate (auto-detects and runs npm run build
//          or project pre-push checks before code is sent to remote)
// Stage 4: Blast Radius & Diff Summary (structured inspection report for
//          human-in-the-loop permission dialog and LLM self-reflection)
//
// Electron-free module: safe for Main process, SDK, CLI, and TUI.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { sanitizeProcessEnv } = require('./envSanitizer')

const PROTECTED_BRANCHES = new Set(['master', 'main', 'production', 'release', 'prod'])

// Sensitive file patterns
const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /\.(sqlite|sqlite3|db)$/i,
]

// Sensitive file basename heuristics (excluding safe template files)
function isSensitiveFilename(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase()
  if (!base) return false
  if (base.endsWith('.example') || base.endsWith('.template') || base.endsWith('.sample')) {
    return false
  }
  for (const re of SENSITIVE_FILENAME_PATTERNS) {
    if (re.test(base)) return true
  }
  if (base.includes('credential') || base.includes('secret')) {
    return true
  }
  return false
}

// Regex patterns for high-entropy tokens and private keys
const SECRET_DIFF_PATTERNS = [
  { name: 'OpenAI API Key', re: /\bsk-[a-zA-Z0-9_\-]{20,}\b/ },
  { name: 'Anthropic API Key', re: /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/ },
  { name: 'GitHub Token', re: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})\b/ },
  { name: 'Google API Key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'Slack Token', re: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/ },
  { name: 'AWS Access Key ID', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private Key Block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
]

/**
 * Split command line into segments respecting quotes and separators (&, &&, |, ||, ;).
 * @param {string} cmd
 * @returns {string[]}
 */
function splitCommandSegments(cmd) {
  const segments = []
  let current = '', inQuote = false, quoteChar = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (inQuote) {
      current += ch
      if (ch === quoteChar && cmd[i - 1] !== '\\') inQuote = false
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch; current += ch
    } else if ('&|;'.includes(ch)) {
      if (current.trim()) segments.push(current.trim()); current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) segments.push(current.trim())
  return segments
}

/**
 * Detect if a shell command string contains an invocation of `git push`.
 * @param {string} command
 * @returns {{ isPush: boolean, segment?: string }}
 */
function isPushCommand(command) {
  const c = String(command || '').trim()
  if (!c) return { isPush: false }

  const segments = splitCommandSegments(c)
  for (const seg of segments) {
    const tokens = seg.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue

    const first = path.basename(tokens[0]).toLowerCase().replace(/\.(exe|cmd|bat)$/i, '')
    if (first === 'git') {
      let subIdx = 1
      while (subIdx < tokens.length && tokens[subIdx].startsWith('-')) {
        if (tokens[subIdx] === '-C' && subIdx + 1 < tokens.length) {
          subIdx += 2
        } else {
          subIdx++
        }
      }
      if (subIdx < tokens.length && tokens[subIdx].toLowerCase() === 'push') {
        const rest = tokens.slice(subIdx + 1)
        if (rest.includes('--help') || rest.includes('-h')) {
          continue
        }
        return { isPush: true, segment: seg }
      }
    }
  }
  return { isPush: false }
}

/**
 * Resolve nearest git repository root.
 * @param {string} startPath
 * @returns {string|null}
 */
function nearestGitRoot(startPath) {
  if (!startPath) return null
  try {
    const cwd = fs.existsSync(startPath) && fs.statSync(startPath).isDirectory()
      ? startPath
      : path.dirname(startPath)
    const res = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    if (res.status === 0 && res.stdout && res.stdout.trim()) {
      return path.resolve(res.stdout.trim())
    }
  } catch {}
  return null
}

/**
 * Parse git push arguments to identify target remote and branch.
 * @param {string} segment - The command segment containing `git push ...`
 * @param {string} gitRoot - Absolute path to git root
 * @returns {{ remote: string, branch: string, isDryRun: boolean, isTags: boolean }}
 */
function parsePushDetails(segment, gitRoot) {
  const tokens = String(segment || '').split(/\s+/).filter(Boolean)
  const args = []
  let isDryRun = false
  let isTags = false
  let skipNext = false
  let pushSeen = false
  for (let i = 0; i < tokens.length; i++) {
    if (skipNext) { skipNext = false; continue }
    const t = tokens[i]
    if (!pushSeen && path.basename(t).toLowerCase().replace(/\.(exe|cmd|bat)$/i, '') === 'git') continue
    if (!pushSeen && t === '-C') { i++; continue }
    if (!pushSeen && t.startsWith('-')) { if (!t.includes('=') && ['--git-dir','--work-tree'].includes(t)) skipNext = true; continue }
    if (t === 'push') { pushSeen = true; continue }
    if (!pushSeen) continue
    if (t === '--dry-run' || t === '-n') { isDryRun = true; continue }
    if (t === '--tags') { isTags = true; continue }
    if (t === '-u' || t === '--set-upstream' || t === '--repo' || t === '--receive-pack') {
      if (!t.includes('=')) skipNext = true
      continue
    }
    if (t.startsWith('-')) continue
    args.push(t)
  }

  let remote = args[0] || 'origin'
  const refspecs = args.slice(1)
  let refspec = refspecs[0] || ''

  // If no refspec was specified on the command line, determine the current branch
  let targetBranch = ''
  if (refspec) {
    if (refspec.includes(':')) {
      const parts = refspec.split(':')
      targetBranch = parts[1] || parts[0]
    } else {
      targetBranch = refspec
    }
  } else {
    try {
      const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: gitRoot,
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      })
      if (res.status === 0 && res.stdout.trim()) {
        targetBranch = res.stdout.trim()
      }
    } catch {}
  }

  return {
    remote,
    branch: targetBranch || 'HEAD',
    branches: refspecs.map(r => {
      const value = r.replace(/^\+/, '')
      if (value === ':') return ''
      return (value.includes(':') ? value.split(':')[1] || value.split(':')[0] : value).replace(/^refs\/heads\//, '')
    }).filter(Boolean),
    all: refspecs.length === 0 && !refspec && (isTags || tokens.includes('--all') || tokens.includes('--mirror')),
    isDryRun,
    isTags,
  }
}

/**
 * Stage 1: Check branch protection rules.
 * @param {string} branch
 * @param {object} [opts]
 * @param {boolean} [opts.allowProtectedOverride]
 * @param {object} [opts.db]
 * @returns {{ ok: boolean, rule?: string, branch?: string, reason?: string }}
 */
function checkBranchProtection(branch, opts = {}) {
  const norm = String(branch || '').trim().toLowerCase().replace(/^refs\/heads\//, '')
  if (PROTECTED_BRANCHES.has(norm)) {
    // Check overrides
    if (opts.allowProtectedOverride === true || process.env.AETHER_ALLOW_PROTECTED_PUSH === '1') {
      return { ok: true, protected: true, overridden: true, branch: norm }
    }
    if (opts.db) {
      try {
        const ff = require('../featureFlags')
        if (ff.isEnabled(opts.db, 'git.allowProtectedBranchPush')) {
          return { ok: true, protected: true, overridden: true, branch: norm }
        }
      } catch {}
    }
    return {
      ok: false,
      rule: 'protected_branch',
      branch: norm,
      reason: `[PrePushGuard] Push to protected branch '${norm}' is BLOCKED.\nDirect push to production/mainline branches risks bypassing CI, code review, and destabilizing the mainline codebase.\n\nRecommended recovery steps for Agent:\n1. Create a feature branch: git checkout -b feat/<topic-name>\n2. Push the feature branch: git push -u origin feat/<topic-name>\n3. Open a Pull Request on GitHub to merge changes safely.`,
    }
  }
  return { ok: true, protected: false, branch: norm }
}

/**
 * Determine the unpushed commit range (e.g. `@{u}..HEAD`).
 * @param {string} gitRoot
 * @param {string} remote
 * @param {string} branch
 * @returns {string|null}
 */
function getUnpushedRange(gitRoot, remote, branch) {
  // 1. Try tracking branch @{u}
  try {
    const res = spawnSync('git', ['rev-parse', '--verify', '@{u}'], {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    if (res.status === 0 && res.stdout.trim()) {
      return '@{u}..HEAD'
    }
  } catch {}

  // 2. Try remote/branch
  if (remote && branch && branch !== 'HEAD') {
    try {
      const res = spawnSync('git', ['rev-parse', '--verify', `${remote}/${branch}`], {
        cwd: gitRoot,
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      })
      if (res.status === 0 && res.stdout.trim()) {
        return `${remote}/${branch}..HEAD`
      }
    } catch {}
  }

  // 3. Fallback: check against origin/master or origin/main
  for (const fallback of ['origin/master', 'origin/main', 'master', 'main']) {
    try {
      const res = spawnSync('git', ['rev-parse', '--verify', fallback], {
        cwd: gitRoot,
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      })
      if (res.status === 0 && res.stdout.trim()) {
        return `${fallback}..HEAD`
      }
    } catch {}
  }

  // A new branch may contain the entire history; avoid silently dropping its
  // root commit (the scanner handles this as a root diff).
  return '--root HEAD'
}

/**
 * Stage 2: Scan unpushed commits for sensitive files and exposed credentials.
 * @param {string} gitRoot
 * @param {{ remote: string, branch: string }} details
 * @returns {{ ok: boolean, rule?: string, findings?: Array<{file: string, type: string, detail: string}>, reason?: string }}
 */
function scanSensitiveAssets(gitRoot, details) {
  const range = getUnpushedRange(gitRoot, details?.remote, details?.branch)
  const findings = []

  // Check modified files in unpushed commits
  try {
    const filesRes = spawnSync('git', ['diff', '--name-status', range], {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
    })
    if (filesRes.status !== 0 || filesRes.error || filesRes.signal) {
      return { ok: false, rule: 'secret_scan_error', reason: '[PrePushGuard] Push BLOCKED: unable to complete sensitive-file scan.' }
    }
    if (filesRes.stdout) {
      const files = filesRes.stdout.split('\n').map(s => s.trim()).filter(Boolean)
      for (const entry of files) {
        const parts = entry.split(/\s+/)
        if (parts[0] === 'D') continue
        const f = parts[parts.length - 1]
        if (isSensitiveFilename(f)) {
          findings.push({
            file: f,
            type: 'sensitive_filename',
            detail: `File matches sensitive asset pattern (${path.basename(f)})`,
          })
        }
      }
    }
  } catch {}

  // Check diff contents for high-entropy secrets and keys
  try {
    const diffRes = spawnSync('git', ['diff', '-U0', range], {
      cwd: gitRoot,
      encoding: 'utf-8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15000,
      windowsHide: true,
    })
    if (diffRes.status !== 0 || diffRes.error || diffRes.signal) {
      return { ok: false, rule: 'secret_scan_error', reason: '[PrePushGuard] Push BLOCKED: unable to complete secret scan.' }
    }
    if (diffRes.stdout) {
      let currentFile = ''
      for (const line of diffRes.stdout.split('\n')) {
        if (line.startsWith('+++ b/')) {
          currentFile = line.slice(6).trim()
          continue
        }
        // Skip scanning test suites and fixture mock files for synthetic pattern strings
        if (/(?:^|[\\/])(?:test|tests|__tests__|fixtures)[\\/]|\.(?:test|spec)\.[a-z0-9]+$/i.test(currentFile)) {
          continue
        }
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const addedText = line.slice(1)
          for (const pat of SECRET_DIFF_PATTERNS) {
            if (pat.re.test(addedText)) {
              findings.push({
                file: currentFile || '(unknown file)',
                type: 'secret_pattern',
                detail: `Detected pattern for ${pat.name}`,
              })
              break
            }
          }
        }
      }
    }
  } catch {}

  if (findings.length > 0) {
    const list = findings.map(f => `  • ${f.file}: ${f.detail} [${f.type}]`).join('\n')
    return {
      ok: false,
      rule: 'secret_leak',
      findings,
      reason: `[PrePushGuard] Push BLOCKED: Detected potential secret or sensitive asset in unpushed commits:\n${list}\n\nPushing credentials to remote is irreversible and leaks keys to remote hosts.\nPlease remove or redact these files/keys from Git history (e.g. via git reset HEAD~1) before pushing.`,
    }
  }

  return { ok: true, findings: [] }
}

/**
 * Stage 3: Run local pre-flight build check.
 * @param {string} gitRoot
 * @param {object} [opts]
 * @returns {{ ok: boolean, rule?: string, exitCode?: number, output?: string, reason?: string, skipped?: boolean }}
 */
function runPreFlightCheck(gitRoot, opts = {}) {
  // Skip if disabled via setting or env
  if (opts.skipBuildCheck === true || process.env.AETHER_SKIP_PREPUSH_BUILD === '1') {
    return { ok: true, skipped: true }
  }
  if (opts.db) {
    try {
      const ff = require('../featureFlags')
      if (!ff.isEnabled(opts.db, 'git.prePushBuildCheck')) {
        return { ok: true, skipped: true }
      }
    } catch {}
  }

  const pkgPath = path.join(gitRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const hasPrePush = pkg.scripts && pkg.scripts['pre-push']
      const hasBuild = pkg.scripts && pkg.scripts.build

      const scriptToRun = hasPrePush ? 'pre-push' : (hasBuild ? 'build' : null)
      if (scriptToRun) {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        const res = spawnSync(npmCmd, ['run', scriptToRun], {
          cwd: gitRoot,
          encoding: 'utf-8',
          timeout: 90000,
          windowsHide: true,
          env: sanitizeProcessEnv(process.env, { CI: 'true' }),
        })
        if (res.status !== 0) {
          const errOutput = (res.stderr || res.stdout || '').trim().slice(-1000)
          return {
            ok: false,
            rule: 'pre_flight_failed',
            exitCode: res.status,
            output: errOutput,
            reason: `[PrePushGuard] Push BLOCKED: Local pre-flight check ('npm run ${scriptToRun}') failed with exit code ${res.status}.\n\nError snippet:\n${errOutput}\n\nDo NOT push broken code to remote repository. Please fix the build error locally and verify before pushing.`,
          }
        }
        return { ok: true, command: `npm run ${scriptToRun}`, exitCode: 0 }
      }
    } catch (e) {
      if (e.message && e.message.includes('BLOCKED')) throw e
    }
  }

  return { ok: true, skipped: true }
}

/**
 * Gather unpushed commits and file changes summary for UI / review.
 * @param {string} gitRoot
 * @param {{ remote: string, branch: string }} details
 * @returns {{ commits: string[], files: string[], range: string }}
 */
function getPushSummary(gitRoot, details) {
  const range = getUnpushedRange(gitRoot, details?.remote, details?.branch)
  const commits = []
  const files = []

  try {
    const logRes = spawnSync('git', ['log', range, '--oneline', '-n', '15'], {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    if (logRes.status === 0 && logRes.stdout) {
      commits.push(...logRes.stdout.split('\n').map(s => s.trim()).filter(Boolean))
    }
  } catch {}

  try {
    const diffRes = spawnSync('git', ['diff', '--name-only', range], {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    if (diffRes.status === 0 && diffRes.stdout) {
      files.push(...diffRes.stdout.split('\n').map(s => s.trim()).filter(Boolean))
    }
  } catch {}

  return { commits, files, range }
}

/**
 * Master inspection pipeline for any shell command before execution.
 * @param {string} command - Shell command to inspect
 * @param {object} [context]
 * @param {string} [context.cwd]
 * @param {object} [context.db]
 * @param {boolean} [context.skipBuildCheck]
 * @param {boolean} [context.allowProtectedOverride]
 * @returns {Promise<{ ok: boolean, reason?: string, summary?: object, isPush: boolean }>}
 */
async function inspectPushCommand(command, context = {}) {
  // Check feature flag first
  if (context.db) {
    try {
      const ff = require('../featureFlags')
      if (!ff.isEnabled(context.db, 'git.prePushGuard')) {
        return { ok: true, skipped: true, isPush: false }
      }
    } catch {}
  }

  const pushCheck = isPushCommand(command)
  if (!pushCheck.isPush) {
    return { ok: true, isPush: false }
  }

  const commandTokens = String(pushCheck.segment || '').split(/\s+/)
  let inspectionCwd = context.cwd || process.cwd()
  const cIndex = commandTokens.indexOf('-C')
  if (cIndex >= 0 && commandTokens[cIndex + 1]) inspectionCwd = path.resolve(inspectionCwd, commandTokens[cIndex + 1])
  const gitRoot = nearestGitRoot(inspectionCwd)
  if (!gitRoot) {
    // If not inside a git repository, allow command so git outputs its own error
    return { ok: true, isPush: true, notGitRepo: true }
  }

  const details = parsePushDetails(pushCheck.segment, gitRoot)

  // Stage 1: Branch Protection
  const branches = details.branches && details.branches.length ? details.branches : [details.branch]
  for (const branch of branches) {
    const branchCheck = checkBranchProtection(branch, {
      db: context.db,
      allowProtectedOverride: context.allowProtectedOverride,
    })
    if (!branchCheck.ok) return { ok: false, isPush: true, ...branchCheck }
  }

  // Stage 2: Secret & Sensitive Asset Scan
  const secretCheck = scanSensitiveAssets(gitRoot, details)
  if (!secretCheck.ok) {
    return { ok: false, isPush: true, ...secretCheck }
  }

  // Stage 3: Local Pre-flight Verification Gate
  const preFlightCheck = runPreFlightCheck(gitRoot, {
    db: context.db,
    skipBuildCheck: context.skipBuildCheck,
  })
  if (!preFlightCheck.ok) {
    return { ok: false, isPush: true, ...preFlightCheck }
  }

  // Stage 4: Build review summary
  const summary = getPushSummary(gitRoot, details)

  return {
    ok: true,
    isPush: true,
    summary: {
      remote: details.remote,
      branch: details.branch,
      commitsCount: summary.commits.length,
      commits: summary.commits,
      filesCount: summary.files.length,
      files: summary.files,
      range: summary.range,
      preFlight: preFlightCheck,
    },
  }
}

module.exports = {
  isPushCommand,
  nearestGitRoot,
  parsePushDetails,
  checkBranchProtection,
  scanSensitiveAssets,
  runPreFlightCheck,
  getPushSummary,
  inspectPushCommand,
  isSensitiveFilename,
  PROTECTED_BRANCHES,
  SECRET_DIFF_PATTERNS,
}
