// Memory import/export helpers — pure functions, no DOM/IPC.
// Kept separate from MemoryPage so the contract edges (corrupt JSON,
// empty arrays, shape variants) are unit-testable.

export interface MemoryImportItem {
  content: string
  type: string
  /** Optional workspace scope — exports carry it, and re-import must not
   * silently downgrade project memories to global. */
  workspace?: string | null
}

/**
 * Parse a memory-export JSON file into normalized import items.
 * Accepts either a bare array of memories or an object with a
 * `memories` key. Throws on corrupt JSON so the caller can surface
 * a file error; non-object / blank-content entries are dropped.
 */
export function parseMemoryImport(jsonText: string): MemoryImportItem[] {
  const data = JSON.parse(jsonText) // throws on corrupt input
  const raw: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { memories?: unknown[] }).memories)
      ? (data as { memories: unknown[] }).memories
      : []
  const out: MemoryImportItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const content = typeof o.content === 'string' ? o.content.trim() : ''
    if (!content) continue
    // Only attach `workspace` when the source actually carried one — keeping
    // the key absent for global memories preserves the historical item shape
    // (exact-shape equality tests) instead of injecting `workspace: null`.
    const parsed: MemoryImportItem = {
      content,
      type: typeof o.type === 'string' && o.type ? o.type : 'fact',
    }
    if (typeof o.workspace === 'string' && o.workspace) parsed.workspace = o.workspace
    out.push(parsed)
  }
  return out
}
