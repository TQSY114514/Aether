// ───────────────────────────────────────────────────────────────────────────
// arenaExport.ts — Arena leaderboard export/share helpers (pure functions).
//
// ScoresPage renders the ELO table; these helpers turn the same `scores`
// array into CSV (spreadsheet) and Markdown (shareable report) without any
// IPC — the renderer already has the data.
// ───────────────────────────────────────────────────────────────────────────

import { t } from './i18n'

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

// ── Arena 2.0 (review P0-3): single-round comparison report ────────────────
// Turn one arena round's results (with optional temperature variants) into a
// shareable Markdown report: per-model variant rows with latency + cost, and a
// summary table sorted by latency. Pure function, no IPC.
// ── Arena 2.0 (review P0-3): single-round comparison report ────────────────
// Turn one arena round's results (with optional temperature variants) into a
// shareable Markdown report: per-model variant rows with latency + cost, and a
// summary table sorted by latency. Pure function, no IPC.
export type ArenaRoundRow = {
  model_name: string
  provider_name: string
  variant?: string | null
  latency_ms?: number
  content: string
  usage?: { total_tokens: number; cost: number }
}

export function arenaRoundToMarkdown(prompt: string, results: ArenaRoundRow[]): string {
  const lines: string[] = []
  lines.push('# Aether Arena — 对比报告')
  lines.push('')
  lines.push(`**Prompt**: ${mdField(prompt)}`)
  lines.push(`**时间**: ${new Date().toLocaleString()}`)
  lines.push(`**模型×变体数**: ${results.length}`)
  lines.push('')
  lines.push('## 摘要')
  lines.push('')
  lines.push('| 模型 | 变体 | 延迟 | Tokens | 成本 |')
  lines.push('|---|---|---|---|---|')
  const sorted = [...results].sort((a, b) => (a.latency_ms ?? 0) - (b.latency_ms ?? 0))
  for (const r of sorted) {
    lines.push(`| ${mdField(r.model_name)} | ${mdField(r.variant || '—')} | ${r.latency_ms != null ? `${r.latency_ms}ms` : '—'} | ${r.usage?.total_tokens ?? '—'} | ${r.usage?.cost != null && r.usage.cost > 0 ? `$${r.usage.cost.toFixed(4)}` : '—'} |`)
  }
  lines.push('')
  lines.push('## 详情')
  lines.push('')
  for (const r of results) {
    lines.push(`### ${mdField(r.model_name)}${r.variant ? ` @ ${mdField(r.variant)}` : ''}`)
    lines.push('')
    lines.push(mdField(r.content.slice(0, 2000)))
    lines.push('')
  }
  return lines.join('\n')
}

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
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export interface ArenaSlotState {
  content: string
  error?: string
  latency_ms?: number
  tokens?: number
  cost?: number
  done: boolean
}

export interface RawArenaResultLike {
  model_id?: number
  slot_index?: number
  content?: string
  error?: string
  latency_ms?: number
  usage?: { total_tokens?: number; cost?: number }
}

export function extractArenaResultsArray(res: unknown): RawArenaResultLike[] {
  if (Array.isArray(res)) return res as RawArenaResultLike[]
  if (res && typeof res === 'object' && Array.isArray((res as { results?: unknown }).results)) {
    return (res as { results: RawArenaResultLike[] }).results
  }
  return []
}

export function toArenaSlotState(r: RawArenaResultLike | undefined, fallbackLatencyMs?: number): ArenaSlotState {
  if (!r) {
    return {
      content: '',
      error: t('arena.no_result_error', '模型未返回结果（请检查模型与服务商配置）'),
      latency_ms: fallbackLatencyMs,
      done: true,
    }
  }
  const rawContent = typeof r.content === 'string' ? r.content : ''
  const errText = r.error
    ? String(r.error)
    : (/^\[Error:\s*(.+)\]$/.exec(rawContent.trim())?.[1] ?? undefined)
  return {
    content: errText && !r.error ? rawContent : rawContent,
    error: errText,
    latency_ms: r.latency_ms ?? fallbackLatencyMs,
    tokens: r.usage?.total_tokens,
    cost: r.usage?.cost,
    done: true,
  }
}

export function normalizeArenaCompareResponse(
  res: unknown,
  modelAId: number,
  modelBId: number,
  fallbackStartA: number,
  fallbackStartB: number,
  now = Date.now()
): { a: ArenaSlotState; b: ArenaSlotState } {
  const list = extractArenaResultsArray(res)
  const used = new Set<number>()

  const pickForSlot = (slotIdx: number, targetModelId: number): RawArenaResultLike | undefined => {
    const bySlot = list.findIndex((r, idx) => !used.has(idx) && r.slot_index === slotIdx)
    if (bySlot >= 0) {
      used.add(bySlot)
      return list[bySlot]
    }
    const byModel = list.findIndex((r, idx) => !used.has(idx) && r.model_id === targetModelId)
    if (byModel >= 0) {
      used.add(byModel)
      return list[byModel]
    }
    const byOrder = list.findIndex((_, idx) => !used.has(idx))
    if (byOrder >= 0) {
      used.add(byOrder)
      return list[byOrder]
    }
    return undefined
  }

  const rA = pickForSlot(0, modelAId)
  const rB = pickForSlot(1, modelBId)
  return {
    a: toArenaSlotState(rA, Math.max(0, now - fallbackStartA)),
    b: toArenaSlotState(rB, Math.max(0, now - fallbackStartB)),
  }
}

