// ───────────────────────────────────────────────────────────────────────────
// Git Auto-Commit module — independent of verification flow.
// Automatically commit after each file change (write_file/edit_file/apply_patch).
// Supports configurable auto-commit. /undo lives in ipc/git.handler.js and is
// checkpoint-driven (see llm/checkpoints.js) — no `git reset --hard` anymore.
//
// SECURITY (audit P1-H8): files that are gitignored or whose names look like
// secrets/credentials are never staged by auto-commit. Committing a key file
// is a one-way leak (history rewrite required to fix), so we skip and warn.
// ───────────────────────────────────────────────────────────────────────────

const { runCommandSync } = require('../tools/exec')
const { nearestGitRoot } = require('./checkpoints')
const log = require('../logger')
const path = require('path')

// Configuration setting key stored in DB
const SETTING_KEY = 'agent_auto_commit_after_file_change'
const DEFAULT_ENABLED = true

/**
 * Check if a path is inside a git repository.
 * @param {string} filePath - Absolute path to file
 * @returns {string|null} Git root directory or null if not a repo
 */
function isGitRepo(filePath) {
  if (!filePath) return null
  return nearestGitRoot(filePath)
}

/**
 * Secret-like filename check (case-insensitive). Matches .env*, *.pem, *.key,
 * id_rsa*, id_ed25519*, *credential*, *secret*.
 * @param {string} filePath - Any path; only the basename is inspected
 * @returns {boolean}
 */
function isSecretLike(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase()
  if (!base) return false
  if (base.startsWith('.env')) return true
  if (base.endsWith('.pem') || base.endsWith('.key')) return true
  if (base.startsWith('id_rsa') || base.startsWith('id_ed25519')) return true
  if (base.includes('credential') || base.includes('secret')) return true
  return false
}

/**
 * Check whether a file is ignored by the repo's .gitignore rules via
 * `git check-ignore` (exit 0 = ignored). Errors are treated as "not ignored"
 * so a transient git failure can't silently disable auto-commit entirely —
 * the secret-pattern gate above still applies.
 * @param {string} filePath - Absolute path to file
 * @param {string} gitRoot - Repo root (cwd for the git call)
 * @returns {boolean}
 */
function isGitIgnored(filePath, gitRoot) {
  try {
    const r = runCommandSync('git', ['check-ignore', '--quiet', '--', String(filePath)], { cwd: gitRoot || path.dirname(String(filePath)) })
    return r.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Why this file must not be auto-committed, or null if it may be staged.
 * @param {string} filePath
 * @param {string} gitRoot
 * @returns {string|null} skip reason
 */
function skipReason(filePath, gitRoot) {
  if (isSecretLike(filePath)) return 'secret-like filename'
  if (isGitIgnored(filePath, gitRoot)) return 'ignored by .gitignore'
  return null
}

function warnSkipped(filePath, gitRoot, reason) {
  const rel = gitRoot ? path.relative(gitRoot, String(filePath)) : String(filePath)
  log.warn(`[gitAutoCommit] skip ${rel || filePath}: ${reason} — file NOT staged/committed`)
}

/**
 * Generate commit message based on operation type and file path.
 * @param {'write'|'edit'|'apply'} operation - Operation type
 * @param {string} filePath - File path relative to git root
 * @returns {string} Conventional commit message
 */
function generateCommitMessage(operation, filePath) {
  const relPath = filePath
  const type = operation === 'write' ? 'feat' : operation === 'edit' ? 'fix' : 'chore'
  return `${type}: update ${relPath}`
}

/**
 * Stage and commit a single file.
 * @param {string} filePath - Absolute path to file
 * @param {'write'|'edit'|'apply'} operation - Operation type
 * @returns {{success: boolean, message: string, commitMessage: string|null}} Result
 */
function gitCommit(filePath, operation = 'edit') {
  const gitRoot = isGitRepo(filePath)
  if (!gitRoot) {
    return { success: false, message: 'not a git repository', commitMessage: null }
  }

  // SECURITY (P1-H8): never stage secret-like or gitignored files.
  const reason = skipReason(filePath, gitRoot)
  if (reason) {
    warnSkipped(filePath, gitRoot, reason)
    return { success: false, message: `skipped: ${reason}`, commitMessage: null, skipped: true, skipReason: reason }
  }

  const relPath = path.relative(gitRoot, filePath)
  const commitMessage = generateCommitMessage(operation, relPath)

  // Stage the file
  const addResult = runCommandSync('git', ['add', filePath], { cwd: gitRoot })
  if (addResult.exitCode !== 0) {
    return {
      success: false,
      message: `git add failed: ${addResult.stderr || `exit ${addResult.exitCode}`}`,
      commitMessage: null,
    }
  }

  // Check if there's anything to commit
  const statusResult = runCommandSync('git', ['status', '--porcelain'], { cwd: gitRoot })
  if (statusResult.exitCode === 0 && !statusResult.stdout.trim()) {
    return { success: false, message: 'nothing to commit', commitMessage: null }
  }

  // Commit
  const commitResult = runCommandSync('git', ['commit', '-m', commitMessage], { cwd: gitRoot })
  if (commitResult.exitCode !== 0) {
    return {
      success: false,
      message: `git commit failed: ${commitResult.stderr || `exit ${commitResult.exitCode}`}`,
      commitMessage: null,
    }
  }

  return { success: true, message: 'committed', commitMessage }
}

/**
 * Stage and commit multiple files at once (for checkpoint).
 * @param {string[]} filePaths - Array of absolute file paths
 * @param {string} cwd - Working directory (usually git root)
 * @param {string} message - Custom commit message (optional)
 * @returns {{success: boolean, message: string}} Result
 */
function gitCommitMultiple(filePaths, cwd, message = 'checkpoint: agent changes') {
  // Find git root from first file if cwd not a repo
  let gitRoot = cwd && isGitRepo(cwd) ? cwd : null
  if (!gitRoot && filePaths.length > 0) {
    gitRoot = isGitRepo(filePaths[0])
  }
  if (!gitRoot) {
    return { success: false, message: 'not a git repository' }
  }

  // SECURITY (P1-H8): filter out gitignored / secret-like files before staging.
  // If every candidate is skipped there is nothing to commit — return without
  // creating an empty commit.
  const toAdd = []
  const skipped = []
  for (const filePath of filePaths || []) {
    const reason = skipReason(filePath, gitRoot)
    if (reason) {
      skipped.push({ file: filePath, reason })
      warnSkipped(filePath, gitRoot, reason)
    } else {
      toAdd.push(filePath)
    }
  }
  if ((filePaths || []).length > 0 && toAdd.length === 0) {
    return {
      success: false,
      message: `nothing to commit (${skipped.length} file(s) skipped: secret-like or gitignored)`,
      nothingToCommit: true,
      skipped,
    }
  }

  // Add remaining files
  for (const filePath of toAdd) {
    const addResult = runCommandSync('git', ['add', filePath], { cwd: gitRoot })
    if (addResult.exitCode !== 0) {
      // Continue anyway - best effort
    }
  }

  // Check if anything staged
  const statusResult = runCommandSync('git', ['diff', '--cached', '--name-only'], { cwd: gitRoot })
  if (statusResult.exitCode === 0 && !statusResult.stdout.trim()) {
    return { success: false, message: 'nothing to commit', nothingToCommit: true, skipped }
  }

  // Commit
  const commitResult = runCommandSync('git', ['commit', '-m', message], { cwd: gitRoot })
  if (commitResult.exitCode !== 0) {
    return {
      success: false,
      message: `git commit failed: ${commitResult.stderr || `exit ${commitResult.exitCode}`}`,
      skipped,
    }
  }

  return { success: true, message: `committed: ${message}`, skipped }
}

/**
 * Get the auto-commit enabled setting from database.
 * @param {any} db - Database handle
 * @returns {boolean} Whether auto-commit is enabled
 */
function getAutoCommitEnabled(db) {
  if (!db || typeof db.getSetting !== 'function') {
    return DEFAULT_ENABLED
  }
  const value = db.getSetting(SETTING_KEY)
  // null/undefined → default true, '0' → false, anything else → true
  if (value == null) return DEFAULT_ENABLED
  return String(value) !== '0'
}

/**
 * Set auto-commit enabled setting.
 * @param {any} db - Database handle
 * @param {boolean} enabled - Whether to enable
 */
function setAutoCommitEnabled(db, enabled) {
  if (!db || typeof db.setSetting !== 'function') return
  db.setSetting(SETTING_KEY, enabled ? '1' : '0')
}

/**
 * Craft a conventional commit message based on uncommitted changes in gitRoot.
 * Inspired by Aider's smart commit message crafting.
 * @param {string} gitRoot
 * @returns {{ success: boolean, suggestedMessage?: string, files?: string[], error?: string }}
 */
function craftCommitMessage(gitRoot) {
  if (!gitRoot || !isGitRepo(gitRoot)) {
    return { success: false, error: 'not a git repository' }
  }
  const statusRes = runCommandSync('git', ['status', '--porcelain'], { cwd: gitRoot })
  if (statusRes.exitCode !== 0) {
    return { success: false, error: statusRes.stderr || 'git status failed' }
  }
  const rawStatus = (statusRes.stdout || '').trim()
  if (!rawStatus) {
    return { success: false, error: 'nothing to commit (working tree clean)' }
  }

  const lines = rawStatus.split('\n').filter(Boolean)
  const files = []
  for (const line of lines) {
    const m = line.match(/^.{2}\s+(.+)$/)
    if (m) {
      const p = m[1].includes('->') ? m[1].split('->')[1].trim() : m[1].trim()
      files.push(p)
    }
  }

  let type = 'feat'
  let scope = ''

  const allTest = files.length > 0 && files.every(f => /test|\.spec\./i.test(f))
  const allDocs = files.length > 0 && files.every(f => /\.md$/i.test(f) || f.startsWith('docs/'))
  const allConfig = files.length > 0 && files.every(f => /(package\.json|tsconfig|\.config\.|pnpm|yarn)/i.test(f))

  if (allTest) {
    type = 'test'
  } else if (allDocs) {
    type = 'docs'
  } else if (allConfig) {
    type = 'chore'
  } else {
    const diffRes = runCommandSync('git', ['diff', 'HEAD', '--unified=1'], { cwd: gitRoot })
    const diffText = (diffRes.stdout || '').slice(0, 3000).toLowerCase()
    if (diffText.includes('fix') || diffText.includes('bug') || diffText.includes('error')) {
      type = 'fix'
    } else {
      type = 'feat'
    }
  }

  if (files.length > 0) {
    const f0 = files[0].replace(/\\/g, '/')
    if (f0.includes('components/chat') || f0.includes('chat.')) scope = 'chat'
    else if (f0.includes('ipc/')) scope = 'ipc'
    else if (f0.includes('llm/')) scope = 'llm'
    else if (f0.includes('tools/')) scope = 'tools'
    else if (f0.includes('store/')) scope = 'store'
    else if (f0.includes('utils/')) scope = 'utils'
    else if (f0.includes('tui/')) scope = 'tui'
  }

  let summary = ''
  if (files.length === 1) {
    const base = path.basename(files[0], path.extname(files[0]))
    summary = `update ${base}`
  } else if (files.length <= 3) {
    const bases = files.map(f => path.basename(f, path.extname(f))).join(', ')
    summary = `update ${bases}`
  } else {
    summary = `update ${files.length} files`
  }

  const prefix = scope ? `${type}(${scope}): ` : `${type}: `
  const suggestedMessage = `${prefix}${summary}`

  return {
    success: true,
    suggestedMessage,
    files,
  }
}

/**
 * Commit changes to git working tree.
 * @param {string} gitRoot
 * @param {{ message: string, files?: string[] }} options
 */
function commitWorkingTree(gitRoot, { message, files }) {
  if (!gitRoot || !isGitRepo(gitRoot)) {
    return { success: false, error: 'not a git repository' }
  }
  const msg = String(message || '').trim()
  if (!msg) {
    return { success: false, error: 'commit message is required' }
  }

  if (files && files.length > 0) {
    const res = gitCommitMultiple(files, gitRoot, msg)
    if (!res.success) {
      return { success: false, error: res.message || 'git commit failed' }
    }
  } else {
    const addRes = runCommandSync('git', ['add', '-A'], { cwd: gitRoot })
    if (addRes.exitCode !== 0) {
      return { success: false, error: addRes.stderr || 'git add failed' }
    }
    const commitRes = runCommandSync('git', ['commit', '-m', msg], { cwd: gitRoot })
    if (commitRes.exitCode !== 0) {
      return { success: false, error: commitRes.stderr || 'git commit failed' }
    }
  }

  const hashRes = runCommandSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: gitRoot })
  const commitHash = (hashRes.stdout || '').trim() || null

  return {
    success: true,
    commitHash,
    message: msg,
  }
}

/**
 * Extract diff and structured prompt for workspace code review (Aider / Claude Code / Codex).
 * @param {string} gitRoot
 * @param {object} [options]
 * @param {string} [options.targetRef] Optional commit/branch or 'HEAD'
 * @param {number} [options.maxDiffLines=500] Maximum diff lines before truncation
 * @param {string} [options.focus] Optional user focus (e.g. 'security', 'performance')
 * @returns {object}
 */
function getDiffForReview(gitRoot, { targetRef, maxDiffLines = 500, focus } = {}) {
  if (!gitRoot || !isGitRepo(gitRoot)) {
    return { success: false, error: 'not a git repository' }
  }

  // Branch and commit info
  let branch = 'unknown'
  let commitHash = 'unknown'
  try {
    const b = runCommandSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: gitRoot })
    branch = (b.stdout || '').trim() || 'HEAD'
    const h = runCommandSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: gitRoot })
    commitHash = (h.stdout || '').trim() || 'HEAD'
  } catch {}

  // Check working tree status
  const statusRes = runCommandSync('git', ['status', '--porcelain'], { cwd: gitRoot })
  const rawStatus = (statusRes.stdout || '').trim()
  const isClean = !rawStatus

  let statSummary = ''
  let diffRaw = ''
  let scopeDesc = ''

  if (targetRef && String(targetRef).trim()) {
    // Review specific target reference or branch (e.g. HEAD~1, main)
    const ref = String(targetRef).trim()
    scopeDesc = `对比引用: ${ref}`
    const statRes = runCommandSync('git', ['diff', ref, '--stat'], { cwd: gitRoot })
    statSummary = (statRes.stdout || '').trim()
    const diffRes = runCommandSync('git', ['diff', ref, '--unified=3'], { cwd: gitRoot })
    diffRaw = diffRes.stdout || ''
  } else if (!isClean) {
    // Review uncommitted working tree changes
    scopeDesc = '工作区待提交改动 (Working Tree Changes)'
    const statRes = runCommandSync('git', ['diff', 'HEAD', '--stat'], { cwd: gitRoot })
    statSummary = (statRes.stdout || '').trim()
    const diffRes = runCommandSync('git', ['diff', 'HEAD', '--unified=3'], { cwd: gitRoot })
    diffRaw = diffRes.stdout || ''

    // If diffRaw is empty, might only have untracked files
    if (!diffRaw.trim()) {
      const untracked = rawStatus.split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3).trim())
      if (untracked.length > 0) {
        statSummary = `Untracked new files (${untracked.length}):\n${untracked.slice(0, 15).join('\n')}`
      }
    }
  } else {
    // Working tree is completely clean: review latest commit
    scopeDesc = `最新提交 (${commitHash})`
    const statRes = runCommandSync('git', ['show', '--stat', '--oneline', 'HEAD'], { cwd: gitRoot })
    statSummary = (statRes.stdout || '').trim()
    const diffRes = runCommandSync('git', ['show', '--unified=3', 'HEAD'], { cwd: gitRoot })
    diffRaw = diffRes.stdout || ''
  }

  // Truncate diff if excessive
  const lines = diffRaw.split('\n')
  let isTruncated = false
  let truncatedDiff = diffRaw
  if (lines.length > maxDiffLines) {
    isTruncated = true
    truncatedDiff = lines.slice(0, maxDiffLines).join('\n') + `\n\n... [Diff 截断：已展示前 ${maxDiffLines} 行，总行数: ${lines.length}]`
  }

  const focusNotice = focus ? `\n> 🎯 **用户特别关注维度**：${focus}\n` : ''

  const suggestedReviewPrompt = `请作为资深代码评审专家 (Senior Staff Code Reviewer) 对以下代码改动进行多维度深度审查：

${focusNotice}
### 审查重点与标准
1. **正确性与缺陷 (Bugs & Regressions)**：逻辑漏洞、边界条件遗漏、空指针/未定义引用、并发/竞态、资源泄露。
2. **安全性 (Security)**：密钥/敏感凭证泄露风险、未清洗的输入、SQL注入/命令注入隐患。
3. **架构与工程规范 (Design & Architecture)**：职责分离、异常处理与优雅降级、是否违反现有约定 (如 CommonJS/ESM 规范、IPC 三件套契约)。
4. **性能与健壮性 (Performance & Reliability)**：无谓的高频重渲染、阻塞操作、缺少重试或超时机制。
5. **具体修改建议 (Actionable Suggestions)**：提供精准的行号定位与精简的 drop-in 修复代码补丁。

---

### 改动概览
- **分支/基准**: \`${branch}\` (\`${commitHash}\`)
- **审查范围**: ${scopeDesc}
- **统计摘要**:
\`\`\`
${statSummary || '无统计差异'}
\`\`\`

### 详细 Diff
\`\`\`diff
${truncatedDiff || '(未检测到代码 Diff 内容)'}
\`\`\`
`

  return {
    success: true,
    branch,
    commitHash,
    isClean,
    scopeDesc,
    statSummary,
    diffText: truncatedDiff,
    isTruncated,
    totalDiffLines: lines.length,
    suggestedReviewPrompt,
  }
}

module.exports = {
  isGitRepo,
  isSecretLike,
  isGitIgnored,
  skipReason,
  generateCommitMessage,
  gitCommit,
  gitCommitMultiple,
  getAutoCommitEnabled,
  setAutoCommitEnabled,
  craftCommitMessage,
  commitWorkingTree,
  getDiffForReview,
  SETTING_KEY,
  DEFAULT_ENABLED,
}
