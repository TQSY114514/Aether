// ───────────────────────────────────────────────────────────────────────────
// arenaExport.ts — Arena leaderboard export/share helpers (pure functions).
//
// ScoresPage renders the ELO table; these helpers turn the same `scores`
// array into CSV (spreadsheet) and Markdown (shareable report) without any
// IPC — the renderer already has the data.
// ───────────────────────────────────────────────────────────────────────────

export type ArenaScoreRow = {
  id: number
  model_id: number
  model_name: string
  provider_name: string
  intent: string
  score: number
  win_count: number
  total_count: number
}

// CSV field escaping: wrap in quotes when the field contains a comma, quote,
// or newline; double any embedded quotes (RFC 4180).
function csvField(v: string | number): string {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Flat CSV: one row per score, `intent,model,provider,score,wins,total`. */
export function scoresToCsv(scores: ArenaScoreRow[]): string {
  const header = 'intent,model,provider,score,wins,total'
  const rows = scores.map((s) =>
    [s.intent, s.model_name, s.provider_name, s.score, s.win_count, s.total_count].map(csvField).join(',')
  )
  return [header, ...rows].join('\n')
}

// Markdown table escaping: pipe and backslash in cells.
function mdField(v: string | number): string {
  return String(v).replace(/([\\|])/g, '\\$1')
}

/**
 * Markdown report grouped by intent, each group sorted by score desc:
 *   ### coding
 *   | Model | Provider | Score | Wins | Total |
 *   |---|---|---|---|---|
 *   | deepseek-v4 | DeepSeek | 1042.5 | 5 | 8 |
 */
export function scoresToMarkdown(scores: ArenaScoreRow[]): string {
  if (!scores.length) return ''

  const byIntent: Record<string, ArenaScoreRow[]> = {}
  for (const s of scores) {
    if (!byIntent[s.intent]) byIntent[s.intent] = []
    byIntent[s.intent].push(s)
  }

  const sections: string[] = []
  for (const intent of Object.keys(byIntent).sort()) {
    const rows = byIntent[intent].sort((a, b) => b.score - a.score)
    const header = '| Model | Provider | Score | Wins | Total |'
    const sep = '|---|---|---|---|---|'
    const lines = rows.map((r) =>
      `| ${mdField(r.model_name)} | ${mdField(r.provider_name)} | ${r.score} | ${r.win_count} | ${r.total_count} |`
    )
    sections.push(`### ${intent}\n\n${header}\n${sep}\n${lines.join('\n')}`)
  }
  return sections.join('\n\n')
}

// JSON export is a plain JSON.stringify of the scores array — no helper needed.

// Trigger a browser download of `content` as a file with the given name/MIME.
// Pure DOM helper — no Electron IPC required (renderer-side only).
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
