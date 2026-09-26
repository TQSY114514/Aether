// ─────────────────────────────────────────────────────────────────────────────
// prePushGuard.js — Pre-push secret-leak gate
//
// One job: stop a push that would carry credentials to a remote. A remote push
// is irreversible — once a key is on the far side it must be treated as burned —
// so this gate fails closed.
//
// Deliberately NOT here (both were attempted and removed; see
// docs/superpowers/specs/2026-09-26-prepush-guard-redesign-design.md):
//   • Branch policy — that is what GitHub branch protection is for. Doing it
//     in-process produced a rule that neither blocked nor was ever read.
//   • Build verification — that is what CI is for, and it cannot be done
//     synchronously at push time without freezing the app for minutes.
//
// Scan base: what a push is judged against is what the remote does not already
// have, so content that is already public is not re-flagged — re-flagging it
// blocks every push of a new branch while protecting nothing. With no remote
// ref at all (a brand-new repository) the whole tree is scanned. See
// resolveScanTargets for why both halves of that rule matter.
//
// Scope is what the push actually sends, not what HEAD happens to point at: a
// push can name another local branch, send every branch (`--all`), or carry
// tags (`--tags`). Each of those refs is judged on its own range.
//
// Known limit: this inspects a command string and a diff. `bash push.sh`,
// `sh -c`, or `npm run deploy` all slip past it. It is a guardrail against a
// naive push, not a sandbox, and should not be described as one.
//
// Electron-free module: safe for Main process, SDK, CLI, and TUI.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// Git's well-known empty tree. Diffing against it yields "every file in HEAD",
// which is exactly what a first push sends.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// Escape hatch for the fail-closed paths. Named in every scan-error message so
// a stuck push is always recoverable.
const SKIP_ENV_VAR = 'AETHER_SKIP_PREPUSH_GUARD'

const GIT_TIMEOUT_MS = 5000
const DIFF_TIMEOUT_MS = 15000
const MAX_BUFFER = 64 * 1024 * 1024

// ─── git helpers ─────────────────────────────────────────────────────────────

function git(gitRoot, args, opts = {}) {
  try {
    return spawnSync('git', args, {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: opts.timeout || GIT_TIMEOUT_MS,
      maxBuffer: opts.maxBuffer || MAX_BUFFER,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    return { status: null, error: e, stdout: '', stderr: '' }
  }
}

/** Run git and return stdout, or null if the command did not complete. */
function gitText(gitRoot, args, opts) {
  const res = git(gitRoot, args, opts)
  if (res.status !== 0 || res.error || res.signal) return null
  return res.stdout || ''
}

/** True when the ref resolves to a commit. Silent on failure. */
function refExists(gitRoot, ref) {
  const res = git(gitRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  return res.status === 0 && !res.error && !res.signal
}

/** Resolve nearest git repository root. */
function nearestGitRoot(startPath) {
  if (!startPath) return null
  try {
    const cwd = fs.existsSync(startPath) && fs.statSync(startPath).isDirectory()
      ? startPath
      : path.dirname(startPath)
    const res = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    if (res.status === 0 && res.stdout && res.stdout.trim()) {
      return path.resolve(res.stdout.trim())
    }
  } catch {}
  return null
}

// ─── filename heuristics ─────────────────────────────────────────────────────

// A secret by definition. Pushing one of these is blocked.
const BLOCKING_FILENAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  // Private keys only. `id_rsa.pub` is a public key — it is not a credential,
  // and blocking it would be a false positive on a file that is safe to share.
  /^id_(rsa|ed25519|ecdsa|dsa)$/i,
  /\.(sqlite|sqlite3|db)$/i,
]

// A name that merely *announces* a secret. Reported, never blocking: this repo
// legitimately contains electron/llm/credentialPool.js and
// skills/security-audit/references/10-secrets-and-credentials.md, so blocking
// on the substring would block ordinary work on them.
const REVIEW_FILENAME_PATTERNS = [/credential/i, /secret/i]

const PLACEHOLDER_SUFFIXES = ['.example', '.template', '.sample', '.dist']

function baseName(filePath) {
  return path.basename(String(filePath || '')).toLowerCase()
}

function isPlaceholderName(base) {
  return PLACEHOLDER_SUFFIXES.some(s => base.endsWith(s))
}

/**
 * True for filenames that are a secret by definition.
 * @param {string} filePath
 * @returns {boolean}
 */
function isSensitiveFilename(filePath) {
  const base = baseName(filePath)
  if (!base || isPlaceholderName(base)) return false
  return BLOCKING_FILENAME_PATTERNS.some(re => re.test(base))
}

/**
 * True for names worth a human look but not worth blocking on.
 * @param {string} filePath
 * @returns {boolean}
 */
function looksSecretNamed(filePath) {
  const base = baseName(filePath)
  if (!base || isPlaceholderName(base)) return false
  if (isSensitiveFilename(base)) return false
  return REVIEW_FILENAME_PATTERNS.some(re => re.test(base))
}

// ─── content patterns ────────────────────────────────────────────────────────

// Anthropic's key is matched before OpenAI's, and OpenAI's excludes the
// `sk-ant-` prefix, so the reported provider name is accurate. (The previous
// ordering made the Anthropic entry unreachable and mislabelled its keys.)
const SECRET_DIFF_PATTERNS = [
  { name: 'Anthropic API Key', re: /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/ },
  { name: 'OpenAI API Key', re: /\bsk-(?!ant-)[a-zA-Z0-9_\-]{20,}\b/ },
  { name: 'GitHub Token', re: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})\b/ },
  { name: 'Google API Key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'Slack Token', re: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/ },
  { name: 'AWS Access Key ID', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private Key Block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
]

// ─── command parsing ─────────────────────────────────────────────────────────

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
 * Split a segment into tokens, respecting quotes (which are stripped), so
 * `-C "/path with space"` survives as one token.
 * @param {string} segment
 * @returns {string[]}
 */
function tokenizeCommand(segment) {
  const tokens = []
  let current = '', quote = ''
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]
    if (quote) {
      if (ch === quote) quote = ''
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

// git global options that consume the following token.
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'])

// `git push` options that consume the following token. Everything else that
// starts with `-` is boolean — notably `-u`/`--set-upstream`, which the previous
// implementation treated as value-taking and so swallowed the remote name.
const PUSH_OPTIONS_WITH_VALUE = new Set(['-o', '--push-option', '--receive-pack', '--exec'])

function executableName(token) {
  return path.basename(String(token || '')).toLowerCase().replace(/\.(exe|cmd|bat)$/i, '')
}

/**
 * Detect if a shell command string contains an invocation of `git push`.
 * @param {string} command
 * @returns {{ isPush: boolean, segment?: string }}
 */
function isPushCommand(command) {
  const c = String(command || '').trim()
  if (!c) return { isPush: false }

  for (const seg of splitCommandSegments(c)) {
    let tokens = tokenizeCommand(seg)
    // Drop leading `NAME=value` env assignments: `GIT_SSH_COMMAND=x git push`
    // is still a push.
    while (tokens.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1)
    if (tokens.length === 0) continue
    if (executableName(tokens[0]) !== 'git') continue

    let i = 1
    while (i < tokens.length && tokens[i].startsWith('-')) {
      const t = tokens[i]
      if (GIT_GLOBAL_WITH_VALUE.has(t) && !t.includes('=') && i + 1 < tokens.length) i += 2
      else i++
    }
    if (i < tokens.length && tokens[i].toLowerCase() === 'push') {
      const rest = tokens.slice(i + 1)
      if (rest.includes('--help') || rest.includes('-h')) continue
      return { isPush: true, segment: seg }
    }
  }
  return { isPush: false }
}

function looksLikeRemoteUrl(token) {
  const t = String(token || '')
  return /^(?:https?|git|ssh|file):\/\//i.test(t)
    || /^[^/@\s]+@[^/\s]+:/.test(t)          // scp-style host:path
    || /^[A-Za-z]:[\\/]/.test(t)             // Windows path
    || /^[.~/\\]/.test(t)                    // relative / home / UNC-ish
    || t.endsWith('.git')
}

/**
 * Parse git push arguments to identify target remote and branches.
 *
 * The remote is resolved by asking git which names are real remotes, rather
 * than by hand-maintaining an option table — the previous table listed `-u` as
 * value-taking, so `git push -u origin feat/x` parsed the remote as `feat/x`.
 *
 * @param {string} segment - The command segment containing `git push ...`
 * @param {string} gitRoot - Absolute path to git root
 * @returns {{ remote: string, branch: string, branches: string[], sources: string[], isDryRun: boolean, isTags: boolean, isAll: boolean, isDelete: boolean }}
 */
function parsePushDetails(segment, gitRoot) {
  const tokens = tokenizeCommand(segment)
  const args = []
  let isDryRun = false, isTags = false, isAll = false, isDelete = false
  let explicitRemote = ''
  let pushSeen = false

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!pushSeen) {
      if (t === 'push') { pushSeen = true; continue }
      if (GIT_GLOBAL_WITH_VALUE.has(t) && !t.includes('=')) i++
      continue
    }
    if (t === '--dry-run' || t === '-n') { isDryRun = true; continue }
    if (t === '--tags') { isTags = true; continue }
    if (t === '--all' || t === '--mirror') { isAll = true; continue }
    if (t === '-d' || t === '--delete') { isDelete = true; continue }
    if (t === '--repo') { if (tokens[i + 1]) { explicitRemote = tokens[i + 1]; i++ } continue }
    if (PUSH_OPTIONS_WITH_VALUE.has(t)) { i++; continue }
    if (t.startsWith('-')) continue          // every other push option is boolean
    args.push(t)
  }

  const remoteNames = new Set(
    (gitText(gitRoot, ['remote']) || '').split('\n').map(s => s.trim()).filter(Boolean)
  )

  let remoteIndex = -1
  for (let i = 0; i < args.length; i++) {
    if (remoteNames.has(args[i]) || looksLikeRemoteUrl(args[i])) { remoteIndex = i; break }
  }

  // Without `--repo`, tokens before the remote are not refspecs we can trust;
  // with it, everything positional is a refspec.
  const remote = explicitRemote || (remoteIndex >= 0 ? args[remoteIndex] : 'origin')
  const refspecSource = remoteIndex >= 0 ? args.slice(remoteIndex + 1) : (explicitRemote ? args : [])

  // Each refspec is split into source and destination. The source is what
  // actually travels, so it — not HEAD — decides what a push of some *other*
  // branch has to be scanned against.
  const refspecs = refspecSource
    .map(raw => String(raw).replace(/^\+/, ''))
    .filter(s => s && s !== ':')
    .map(s => {
      const bare = s.replace(/^refs\/heads\//, '')
      const colon = bare.indexOf(':')
      const src = colon >= 0 ? bare.slice(0, colon) : bare
      const dst = colon >= 0 ? bare.slice(colon + 1) : bare
      return { src, dst: dst.replace(/^refs\/heads\//, '') }
    })

  const branches = refspecs.map(r => r.dst).filter(Boolean)
  const sources = refspecs.map(r => r.src).filter(Boolean)
  // `git push origin :feat/x` sends no content — every refspec is a deletion.
  const deletesOnly = refspecs.length > 0 && sources.length === 0

  let branch = branches[0] || ''
  if (!branch) {
    const head = currentBranchOf(gitRoot)
    branch = head && head !== 'HEAD' ? head : 'HEAD'
  }

  return {
    remote,
    branch,
    branches,
    sources,
    isDryRun,
    isTags,
    isAll,
    isDelete: isDelete || deletesOnly,
  }
}

/**
 * Resolve the directory to inspect, honouring a `-C <dir>` in the command.
 * @param {string} segment
 * @param {string} [fallbackCwd]
 * @returns {string}
 */
function resolveInspectionCwd(segment, fallbackCwd) {
  const base = fallbackCwd || process.cwd()
  const tokens = tokenizeCommand(segment)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '-C' && tokens[i + 1]) return path.resolve(base, tokens[i + 1])
  }
  return base
}

// ─── scan range ──────────────────────────────────────────────────────────────

/**
 * Remote-tracking refs for a remote, best base first.
 *
 * The remote's default branch is the natural base for a branch it does not have
 * yet, so `origin/HEAD` leads; `master`/`main` follow as a fallback for clones
 * that never set it. The order is made deterministic so a scan base is
 * reproducible rather than dependent on ref iteration order.
 *
 * @param {string} gitRoot
 * @param {string} remote
 * @returns {string[]}
 */
function remoteRefCandidates(gitRoot, remote) {
  const out = gitText(gitRoot, ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remote}/`])
  if (out === null) return []
  const rank = (ref) => {
    const short = ref.slice(remote.length + 1)
    if (short === 'master' || short === 'main') return 0
    return 1
  }
  return out.split('\n')
    .map(s => s.trim())
    .filter(ref => ref && !ref.endsWith('/HEAD'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** The branch currently checked out, or '' when HEAD is detached. */
function currentBranchOf(gitRoot) {
  const head = (gitText(gitRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim()
  return head === 'HEAD' ? '' : head
}

/** Short names of the refs under a prefix — every local branch, or every tag. */
function localRefs(gitRoot, prefix) {
  const out = gitText(gitRoot, ['for-each-ref', '--format=%(refname:short)', prefix])
  if (out === null) return []
  return out.split('\n').map(s => s.trim()).filter(Boolean)
}

/**
 * Base and range for one ref that is about to be pushed.
 *
 * Two mistakes are possible here and they are not symmetric. A range that scans
 * nothing lets a key through silently; a range that scans too much blocks work
 * that leaks nothing. The first is the one that shipped, so the rule is: scan
 * what this push newly introduces, and when that cannot be determined, scan
 * everything it would send.
 *
 * "Newly introduces" is measured against refs the remote already has, not the
 * empty tree: content already reachable from a remote-tracking ref is already
 * public, and re-flagging it blocks every push of a new branch — which is how a
 * gate gets switched off. A brand-new repository, with no remote-tracking ref
 * at all, has nothing known to be public, so its whole tree is scanned.
 *
 * `@{u}` describes whatever branch is checked out, so it is a valid base only
 * when that is the ref being pushed. Applied to any other ref it points at a
 * commit unrelated to the push — which is how pushing `feat/dirty` from a clean
 * `master` scanned `master`'s empty increment and let the key through. The tip
 * is the pushed ref rather than HEAD for the same reason.
 *
 * @param {string} gitRoot
 * @param {string} remote
 * @param {string} src - ref being pushed; 'HEAD' or '' means the current branch
 * @param {string} currentBranch
 * @returns {{ ref: string, tip: string, base: string, range: string, wholeTree: boolean }}
 */
function scanTargetFor(gitRoot, remote, src, currentBranch) {
  const named = src && src !== 'HEAD' ? src : currentBranch
  // Only a ref that resolves can be pushed. A name git cannot resolve is git's
  // own error to report, so fall back to HEAD rather than failing the scan on
  // a ref that is not there.
  const pushed = named && named !== currentBranch && refExists(gitRoot, named) ? named : ''
  const tip = pushed || 'HEAD'
  const candidates = []

  if (named) candidates.push(`${remote}/${named}`)
  if (tip === 'HEAD') candidates.push('@{u}')
  candidates.push(...remoteRefCandidates(gitRoot, remote))

  for (const ref of candidates) {
    if (refExists(gitRoot, ref)) {
      return { ref: named || 'HEAD', tip, base: ref, range: `${ref}..${tip}`, wholeTree: false }
    }
  }
  return { ref: named || 'HEAD', tip, base: EMPTY_TREE, range: `${EMPTY_TREE}..${tip}`, wholeTree: true }
}

/**
 * Every ref this push will send, each with the range covering what it adds.
 *
 * A push is not always "the current branch to the remote". It can name another
 * local branch (`git push origin feat/x` from a clean `master`), send every
 * branch (`--all`, `--mirror`), or carry tags (`--tags`) pointing at commits no
 * branch range covers. Judging all of those against a single HEAD range answers
 * a question nobody asked, and answering it wrongly lets the key through.
 *
 * @param {string} gitRoot
 * @param {object} details - result of parsePushDetails
 * @returns {Array<{ ref: string, tip: string, base: string, range: string, wholeTree: boolean }>}
 */
function resolveScanTargets(gitRoot, details) {
  const remote = details && details.remote ? details.remote : 'origin'
  const currentBranch = currentBranchOf(gitRoot)
  let srcs

  if (details && details.isAll) {
    srcs = localRefs(gitRoot, 'refs/heads/')
  } else if (details && details.sources && details.sources.length) {
    srcs = details.sources.slice()
  } else {
    srcs = [currentBranch || 'HEAD']
  }
  if (details && details.isTags) srcs.push(...localRefs(gitRoot, 'refs/tags/'))

  const seen = new Set()
  const targets = []
  for (const src of srcs) {
    if (!src || seen.has(src)) continue
    seen.add(src)
    targets.push(scanTargetFor(gitRoot, remote, src, currentBranch))
  }
  // `--all` in a repository with no branch yet: still judge what HEAD would send.
  if (targets.length === 0) {
    targets.push(scanTargetFor(gitRoot, remote, currentBranch || 'HEAD', currentBranch))
  }
  return targets
}

/**
 * The primary range for a push, for callers that want exactly one. See
 * resolveScanTargets — a single push can cover several refs.
 *
 * @returns {{ range: string, base: string, wholeTree: boolean }}
 */
function resolveScanRange(gitRoot, details) {
  return resolveScanTargets(gitRoot, details)[0]
}

// ─── scanning ────────────────────────────────────────────────────────────────

/**
 * Strip the quoting git puts around a path holding spaces or non-ASCII bytes,
 * so a reported filename is the filename.
 * @param {string} raw
 * @returns {string}
 */
function unquotePath(raw) {
  const s = String(raw || '')
  if (s.length > 1 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  return s
}

/** What the scan actually covered, for the block message. */
function describeScope(targets) {
  if (targets.length === 1) {
    const t = targets[0]
    return t.wholeTree
      ? `No remote-tracking branch exists for '${t.ref}', so the entire tree it would send was scanned.`
      : `Unpushed commits in ${t.range}.`
  }
  return `Scanned what this push sends on ${targets.length} refs: ${targets.map(t => t.range).join('; ')}.`
}

function scanError(what, detail) {
  return {
    ok: false,
    rule: 'secret_scan_error',
    findings: [],
    blocking: [],
    reason: `[PrePushGuard] Push BLOCKED: unable to complete ${what}.\n`
      + `${detail ? `${detail}\n` : ''}`
      + `The gate fails closed because an unscanned push cannot be verified.\n`
      + `If you have confirmed the content is safe, re-run with ${SKIP_ENV_VAR}=1.`,
  }
}

/**
 * Scan the changeset for sensitive filenames and exposed credentials.
 *
 * Covers every ref the push sends, so a push that names another branch, or
 * carries `--all`/`--tags`, is judged on what it actually sends.
 *
 * @param {string} gitRoot
 * @param {{ remote: string, branch: string }} details
 * @returns {{ ok: boolean, rule?: string, findings: Array, blocking: Array, reason?: string, range?: string, ranges?: string[], targets?: Array, wholeTree?: boolean }}
 */
function scanForSecrets(gitRoot, details) {
  if (process.env[SKIP_ENV_VAR] === '1') {
    return { ok: true, skipped: true, findings: [], blocking: [], targets: [], ranges: [] }
  }

  const targets = resolveScanTargets(gitRoot, details)
  const findings = []
  const seen = new Set()
  // The same file can appear in several ranges; report each finding once.
  const add = (finding) => {
    const key = `${finding.file}\u0000${finding.type}\u0000${finding.detail}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push(finding)
  }

  for (const { range } of targets) {
    // 1. Filenames in the changeset. `-z` keeps paths containing spaces intact;
    //    `--no-renames` keeps the record stride at two NUL-separated fields, so a
    //    rename cannot be mistaken for a delimited path.
    const namesRaw = gitText(
      gitRoot,
      ['diff', '--name-status', '-z', '--no-renames', '--diff-filter=d', range],
      { timeout: DIFF_TIMEOUT_MS }
    )
    if (namesRaw === null) return scanError('sensitive-file scan', `git diff ${range} did not complete.`)

    const fields = namesRaw.split('\0')
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const status = fields[i]
      const file = fields[i + 1]
      if (!status || !file || status.startsWith('D')) continue
      if (isSensitiveFilename(file)) {
        add({
          file,
          type: 'sensitive_filename',
          severity: 'block',
          detail: `File is a credential container by name (${path.basename(file)})`,
        })
      } else if (looksSecretNamed(file)) {
        add({
          file,
          type: 'secret_named_file',
          severity: 'review',
          detail: `Filename mentions credentials or secrets — worth a look (${path.basename(file)})`,
        })
      }
    }

    // 2. Added lines for high-confidence token shapes. Only additions matter: a
    //    key being removed is a fix, not a leak. `core.quotePath=false` keeps a
    //    non-ASCII path from arriving escaped inside the `+++` header.
    const patch = gitText(
      gitRoot,
      ['-c', 'core.quotePath=false', 'diff', '-U0', '--diff-filter=d', range],
      { timeout: DIFF_TIMEOUT_MS }
    )
    if (patch === null) return scanError('secret scan', `git diff -U0 ${range} did not complete.`)

    let currentFile = ''
    for (const line of patch.split('\n')) {
      if (line.startsWith('+++ b/')) {
        currentFile = unquotePath(line.slice(6).trim())
        continue
      }
      if (!line.startsWith('+') || line.startsWith('+++')) continue
      const addedText = line.slice(1)
      for (const pat of SECRET_DIFF_PATTERNS) {
        if (pat.re.test(addedText)) {
          add({
            file: currentFile || '(unknown file)',
            type: 'secret_pattern',
            severity: 'block',
            detail: `Detected pattern for ${pat.name}`,
          })
          break
        }
      }
    }
  }

  const ranges = targets.map(t => t.range)
  const wholeTree = targets.some(t => t.wholeTree)
  const blocking = findings.filter(f => f.severity === 'block')

  if (blocking.length > 0) {
    const list = blocking.map(f => `  • ${f.file}: ${f.detail} [${f.type}]`).join('\n')
    return {
      ok: false,
      rule: 'secret_leak',
      findings,
      blocking,
      targets,
      ranges,
      range: ranges.join(', '),
      wholeTree,
      reason: `[PrePushGuard] Push BLOCKED: potential secret or credential in what is about to be pushed.\n${describeScope(targets)}\n${list}\n\n`
        + `Pushing credentials to a remote is irreversible — treat any key listed above as burned.\n`
        + `Remove or redact it from the commits (e.g. git reset HEAD~1), rotate the key, then push again.\n`
        + `To push anyway, re-run with ${SKIP_ENV_VAR}=1.`,
    }
  }

  return { ok: true, findings, blocking: [], targets, ranges, range: ranges.join(', '), wholeTree }
}

// ─── summary ─────────────────────────────────────────────────────────────────

/**
 * Gather the commits and changed files a push sends, for the permission dialog.
 * @param {string} gitRoot
 * @param {{ remote: string, branch: string }} details
 * @param {object} [scan] - result of scanForSecrets, reused so the ranges match
 * @returns {{ commits: string[], files: string[], range: string, ranges: string[], wholeTree: boolean }}
 */
function getPushSummary(gitRoot, details, scan) {
  const targets = scan && scan.targets && scan.targets.length
    ? scan.targets
    : resolveScanTargets(gitRoot, details)
  const commits = []
  const files = []
  const seenCommits = new Set()
  const seenFiles = new Set()

  for (const { range } of targets) {
    const logRaw = gitText(gitRoot, ['log', range, '--oneline', '-n', '15'])
    if (logRaw) {
      for (const line of logRaw.split('\n').map(s => s.trim()).filter(Boolean)) {
        if (seenCommits.has(line)) continue
        seenCommits.add(line)
        commits.push(line)
      }
    }

    const filesRaw = gitText(
      gitRoot,
      ['diff', '--name-only', '-z', '--no-renames', '--diff-filter=d', range],
      { timeout: DIFF_TIMEOUT_MS }
    )
    if (filesRaw) {
      // No trim here: a path may legitimately begin or end with a space.
      for (const file of filesRaw.split('\0').filter(Boolean)) {
        if (seenFiles.has(file)) continue
        seenFiles.add(file)
        files.push(file)
      }
    }
  }

  const ranges = targets.map(t => t.range)
  return {
    commits,
    files,
    range: ranges.join(', '),
    ranges,
    wholeTree: targets.some(t => t.wholeTree),
  }
}

// ─── pipeline ────────────────────────────────────────────────────────────────

/**
 * Inspect a shell command before execution.
 *
 * @param {string} command
 * @param {object} [context]
 * @param {string} [context.cwd]
 * @param {object} [context.db]
 * @returns {Promise<{ ok: boolean, isPush: boolean, reason?: string, summary?: object }>}
 */
async function inspectPushCommand(command, context = {}) {
  if (context.db) {
    try {
      const ff = require('../featureFlags')
      if (!ff.isEnabled(context.db, 'git.prePushGuard')) {
        return { ok: true, skipped: true, isPush: false }
      }
    } catch {}
  }

  const pushCheck = isPushCommand(command)
  if (!pushCheck.isPush) return { ok: true, isPush: false }

  const inspectionCwd = resolveInspectionCwd(pushCheck.segment, context.cwd)
  const gitRoot = nearestGitRoot(inspectionCwd)
  if (!gitRoot) return { ok: true, isPush: true, notGitRepo: true }

  const details = parsePushDetails(pushCheck.segment, gitRoot)
  // A dry run sends nothing, and a deletion sends no content.
  if (details.isDryRun) return { ok: true, isPush: true, dryRun: true }
  if (details.isDelete) return { ok: true, isPush: true, deletion: true }

  const scan = scanForSecrets(gitRoot, details)
  if (!scan.ok) return { ok: false, isPush: true, ...scan }

  const summary = getPushSummary(gitRoot, details, scan)
  return {
    ok: true,
    isPush: true,
    summary: {
      remote: details.remote,
      branch: details.branch,
      isTags: details.isTags,
      isAll: details.isAll,
      range: summary.range,
      ranges: summary.ranges,
      wholeTree: summary.wholeTree,
      commitsCount: summary.commits.length,
      commits: summary.commits,
      filesCount: summary.files.length,
      files: summary.files,
      // Non-blocking observations, e.g. a file named `…credential…`.
      notes: scan.findings.filter(f => f.severity === 'review').map(f => `${f.file}: ${f.detail}`),
    },
  }
}

module.exports = {
  isPushCommand,
  nearestGitRoot,
  parsePushDetails,
  resolveScanRange,
  resolveScanTargets,
  scanForSecrets,
  getPushSummary,
  inspectPushCommand,
  isSensitiveFilename,
  looksSecretNamed,
  SECRET_DIFF_PATTERNS,
  EMPTY_TREE,
  SKIP_ENV_VAR,
}
