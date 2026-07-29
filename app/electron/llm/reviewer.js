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
      summary: formatReviewSummary(validIssues),
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
    return { issues: validIssues, summary: formatReviewSummary(validIssues) }
  } catch (e) {
    return { issues: [], summary: `review failed: ${e.message}` }
  }
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
  SEVERITY_LEVELS,
  REVIEW_DIMENSIONS,
}
