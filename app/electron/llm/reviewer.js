// ───────────────────────────────────────────────────────────────────────────
// Code Review Agent — automated code review after agent modifications.
//
// Inspirations: Claude Code's inline review, GitHub Copilot's security scan,
// and Aider's /review command.
//
// Dimensions:
//   - bug:      logic errors, null refs, off-by-one, race conditions
//   - security: injection, XSS, hardcoded secrets, unsafe deserialization
//   - performance: N+1 queries, unnecessary re-renders, memory leaks
//   - style:    naming, dead code, duplication, error handling gaps
//
// Output format:
//   Structured review with severity levels and actionable suggestions.
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')

const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low']
const REVIEW_DIMENSIONS = ['bug', 'security', 'performance', 'style']

const REVIEW_PROMPT = `Review the following code changes. For each issue found, rate its severity and provide a specific fix suggestion.

Review dimensions:
- bug: logic errors, null/undefined refs, off-by-one, race conditions, wrong conditionals
- security: injection vulnerabilities, hardcoded secrets, unsafe deserialization, path traversal
- performance: unnecessary loops, N+1 patterns, memory leaks, blocking calls in hot paths
- style: naming conventions, dead code, duplication, missing error handling

Output EXACTLY this JSON array (empty array [] if clean):
[
  {
    "severity": "critical|high|medium|low",
    "dimension": "bug|security|performance|style",
    "file": "path/to/file.ext",
    "line": 42,
    "issue": "brief description of the problem",
    "suggestion": "specific fix to apply"
  }
]

Rules:
- Only flag real issues, not style preferences
- Include line numbers when identifiable
- Maximum 8 issues per review
- Severity guide: critical=exploitable/crash, high=data loss/wrong behavior, medium=suboptimal, low=nits`

// ─── public API ────────────────────────────────────────────────────────────────

// Review the given diff/changed files.
// Args: { provider, model, diff, files, signal }
// Returns: { issues: ReviewIssue[], summary: string }
async function reviewChanges({ provider, model, diff, files = [], signal }) {
  if (!diff || !diff.trim()) return { issues: [], summary: 'no changes to review' }

  const userContent = files.length > 0
    ? `Files changed:\n${files.join('\n')}\n\nDiff:\n\`\`\`diff\n${diff.slice(0, 20000)}\n\`\`\``
    : `Diff:\n\`\`\`diff\n${diff.slice(0, 20000)}\n\`\`\``

  try {
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: REVIEW_PROMPT },
        { role: 'user', content: userContent },
      ],
      signal,
      options: { max_tokens: 2048, temperature: 0.1 },
    })

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { issues: [], summary: text.slice(0, 200) }

    const issues = JSON.parse(jsonMatch[0])
    const validIssues = Array.isArray(issues) ? issues.filter(validIssue) : []

    return {
      issues: validIssues,
      summary: composeSummary({ issues: validIssues, files, diff }),
    }
  } catch (e) {
    return { issues: [], summary: `review failed: ${e.message}` }
  }
}

// Quick review from file contents (no diff needed).
// Args: { provider, model, files: [{ path, content }], signal }
// Returns: { issues, summary }
async function reviewFiles({ provider, model, files = [], signal }) {
  if (!files.length) return { issues: [], summary: 'no files to review' }

  const prompt = files.slice(0, 5).map(f =>
    `### ${f.path}\n\`\`\`\n${(f.content || '').slice(0, 8000)}\n\`\`\``
  ).join('\n\n')

  try {
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: REVIEW_PROMPT },
        { role: 'user', content: `Review these files:\n\n${prompt}` },
      ],
      signal,
      options: { max_tokens: 2048, temperature: 0.1 },
    })

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { issues: [], summary: text.slice(0, 200) }

    const issues = JSON.parse(jsonMatch[0])
    const validIssues = Array.isArray(issues) ? issues.filter(validIssue) : []
    return { issues: validIssues, summary: composeSummary({ issues: validIssues, files }) }
  } catch (e) {
    return { issues: [], summary: `review failed: ${e.message}` }
  }
}

// ─── review enrichment helpers (pure) ─────────────────────────────────────────

// Per-dimension pass/fail checklist built from the validated issues. A clean
// dimension reads "- [x] 通过"; a dimension with findings is left unchecked
// with its count so the model/user can see what remains.
function buildChecklist(issues) {
  const counts = { bug: 0, security: 0, performance: 0, style: 0 }
  for (const i of issues) {
    if (i && counts[i.dimension] !== undefined) counts[i.dimension]++
  }
  const labels = { bug: '逻辑正确性', security: '安全', performance: '性能', style: '风格与可维护性' }
  const lines = ['### 审阅清单']
  for (const dim of REVIEW_DIMENSIONS) {
    const n = counts[dim]
    lines.push(`- [${n === 0 ? 'x' : ' '}] ${labels[dim]}: ${n === 0 ? '通过' : `${n} 处问题`}`)
  }
  return lines.join('\n')
}

// Compact stats for a unified diff. Returns null when there is nothing to
// summarize (empty review path).
function diffSummary(diff) {
  if (!diff || !diff.trim()) return null
  const lines = diff.split('\n')
  let added = 0
  let removed = 0
  const files = new Set()
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++
    else if (line.startsWith('-') && !line.startsWith('---')) removed++
    else if (line.startsWith('+++ b/')) files.add(line.slice(6))
  }
  const parts = ['### Diff 摘要', `- 文件数: ${files.size}`, `- +${added} / -${removed}`]
  if (diff.length > 20000) parts.push('- 注意: diff 过大已截断(前 20000 字符)')
  return parts.join('\n')
}

// PR suggestion block: suggested title from the first changed file plus a
// ready-to-paste description with severity counts. Accepts both string[] file
// paths (reviewChanges) and { path, content }[] objects (reviewFiles).
function buildPrSuggestion({ files = [], issues = [] }) {
  const names = files.map(f => (typeof f === 'string' ? f : f && f.path)).filter(Boolean)
  const head = names[0] ? names[0].split('/').pop() : '改动'
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const i of issues) {
    if (i && counts[i.severity] !== undefined) counts[i.severity]++
  }
  const sevLine = issues.length
    ? `审阅发现 ${issues.length} 个问题(critical ${counts.critical} / high ${counts.high} / medium ${counts.medium} / low ${counts.low})`
    : '审阅通过,未发现问题'
  const title = issues.length ? `fix: 修复审阅发现的问题 — ${head}` : `feat: ${head}`
  return [
    '### PR 建议',
    `建议标题: ${title}`,
    `描述: 本次改动涉及 ${names.length} 个文件; ${sevLine}`,
    '提交前: 修复全部 critical/high 问题 → 运行测试 → 更新变更日志',
  ].join('\n')
}

// Assemble the final summary string: the existing review summary first (keeps
// the first line byte-identical for existing consumers), then checklist, diff
// summary (when a diff exists), and the PR suggestion block.
function composeSummary({ issues = [], files = [], diff = null }) {
  const sections = [formatReviewSummary(issues)]
  sections.push(buildChecklist(issues))
  const ds = diffSummary(diff)
  if (ds) sections.push(ds)
  sections.push(buildPrSuggestion({ files, issues }))
  return sections.filter(s => s && s.trim()).join('\n\n')
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function validIssue(item) {
  return (
    item &&
    typeof item === 'object' &&
    SEVERITY_LEVELS.includes(item.severity) &&
    REVIEW_DIMENSIONS.includes(item.dimension) &&
    typeof item.issue === 'string' &&
    item.issue.trim().length > 0
  )
}

function formatReviewSummary(issues) {
  if (!issues.length) return '审查通过，未发现问题'

  const bySeverity = { critical: [], high: [], medium: [], low: [] }
  for (const i of issues) {
    const sev = i.severity || 'medium'
    if (!bySeverity[sev]) bySeverity[sev] = []
    bySeverity[sev].push(i)
  }

  const lines = []
  const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }
  for (const sev of SEVERITY_LEVELS) {
    const items = bySeverity[sev]
    if (!items.length) continue
    lines.push(`${icons[sev]} ${sev.toUpperCase()} (${items.length}):`)
    for (const i of items) {
      lines.push(`  [${i.dimension}] ${i.file}${i.line ? ':' + i.line : ''} — ${i.issue}`)
      if (i.suggestion) lines.push(`    修复: ${i.suggestion}`)
    }
  }
  return lines.join('\n')
}

module.exports = {
  reviewChanges,
  reviewFiles,
  formatReviewSummary,
  validIssue,
  buildChecklist,
  diffSummary,
  buildPrSuggestion,
  composeSummary,
  SEVERITY_LEVELS,
  REVIEW_DIMENSIONS,
}
