import type { Message } from '@/types'
import type { TurnFileSummary } from '@/store/types'

export interface AggregatedFileChange {
  path: string
  added: number
  removed: number
  status: 'created' | 'modified' | 'deleted'
  diffs: string[]
  turnsCount: number
}

export interface SessionReviewSummary {
  files: AggregatedFileChange[]
  totalAdded: number
  totalRemoved: number
  fileCount: number
}

const isCaseInsensitiveFS =
  typeof navigator !== 'undefined' && /win|mac/i.test(navigator.platform || navigator.userAgent)

export function normalizePathKey(p: string): string {
  const norm = String(p || '').replace(/\\/g, '/')
  return isCaseInsensitiveFS ? norm.toLowerCase() : norm
}

export function splitPath(fullPath: string) {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  const fileName = parts.pop() || fullPath
  const dir = parts.length > 0 ? parts.join('/') + '/' : ''
  return { dir, fileName }
}

/** Merge per-turn file summaries across all messages in a session. */
export function aggregateSessionFileChanges(
  messages: Message[],
  fileSummariesByMessage: Record<number, TurnFileSummary>
): SessionReviewSummary {
  const map = new Map<string, AggregatedFileChange>()

  for (const msg of messages) {
    const summary = fileSummariesByMessage[msg.id]
    if (!summary?.files || summary.files.length === 0) continue

    for (const f of summary.files) {
      if (!f?.path) continue
      const key = normalizePathKey(f.path)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          path: f.path,
          added: Number(f.added) || 0,
          removed: Number(f.removed) || 0,
          status: f.status || 'modified',
          diffs: f.diff ? [f.diff] : [],
          turnsCount: 1,
        })
      } else {
        existing.added += Number(f.added) || 0
        existing.removed += Number(f.removed) || 0
        if (f.status === 'deleted') {
          existing.status = 'deleted'
        } else if (existing.status !== 'created' && f.status) {
          existing.status = f.status
        }
        if (f.diff) existing.diffs.push(f.diff)
        existing.turnsCount += 1
      }
    }
  }

  const files = Array.from(map.values())
  let totalAdded = 0
  let totalRemoved = 0
  for (const f of files) {
    totalAdded += f.added
    totalRemoved += f.removed
  }
  return { files, totalAdded, totalRemoved, fileCount: files.length }
}
