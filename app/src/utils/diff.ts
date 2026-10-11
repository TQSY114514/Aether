/**
 * Utilities for cleaning and parsing unified diffs across ToolCallBlock and FileSummaryDeck.
 */

export function cleanDiffLines(rawDiff: string): string[] {
  if (!rawDiff) return []
  const lines = rawDiff.replace(/\r/g, '').split('\n')

  const isGitMeta = (l: string) =>
    l.startsWith('diff --git') ||
    l.startsWith('index ') ||
    l.startsWith('new file mode') ||
    l.startsWith('deleted file mode') ||
    l.startsWith('old mode') ||
    l.startsWith('new mode') ||
    l.startsWith('similarity index') ||
    l.startsWith('rename from') ||
    l.startsWith('rename to') ||
    l.startsWith('copy from') ||
    l.startsWith('copy to') ||
    l.startsWith('Binary files')

  const isFileHeaderMinus = (l: string) =>
    l.startsWith('--- a/') ||
    l.startsWith('--- /dev/null') ||
    l.startsWith('--- b/') ||
    l.startsWith('--- i/') ||
    l.startsWith('--- w/') ||
    l.startsWith('--- ')

  const isFileHeaderPlus = (l: string) =>
    l.startsWith('+++ b/') ||
    l.startsWith('+++ /dev/null') ||
    l.startsWith('+++ a/') ||
    l.startsWith('+++ w/') ||
    l.startsWith('+++ ')

  const isFileBoundary = (linesArr: string[], i: number) => {
    const l = linesArr[i]
    if (l.startsWith('diff --git')) return true
    if (l.startsWith('--- a/') || l.startsWith('--- /dev/null') || l.startsWith('--- b/')) {
      const next = linesArr[i + 1]
      if (next && (next.startsWith('+++ b/') || next.startsWith('+++ /dev/null') || next.startsWith('+++ a/'))) {
        return true
      }
    }
    return false
  }

  const result: string[] = []
  let inHeader = true
  let foundFileHeaderMinus = false

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]

    // Detect new file boundary inside hunks
    if (!inHeader && isFileBoundary(lines, i)) {
      inHeader = true
      foundFileHeaderMinus = false
    }

    if (inHeader) {
      if (isGitMeta(l)) {
        continue
      }
      if (!foundFileHeaderMinus && isFileHeaderMinus(l)) {
        foundFileHeaderMinus = true
        continue
      }
      if (foundFileHeaderMinus && isFileHeaderPlus(l)) {
        foundFileHeaderMinus = false
        const next = lines[i + 1]
        if (!next || !next.startsWith('@@')) {
          inHeader = false
        }
        continue
      }
      if (l.startsWith('@@')) {
        inHeader = false
        result.push(l)
        continue
      }
      // If we encounter a line that isn't a known header while inHeader,
      // it means there's no @@ header in this section, so treat as diff content
      inHeader = false
      result.push(l)
      continue
    }

    result.push(l)
  }

  return result
}

export function countDiffLines(diffStr: string): { added: number; removed: number } {
  if (!diffStr) return { added: 0, removed: 0 }
  const clean = cleanDiffLines(diffStr)
  let added = 0
  let removed = 0
  for (const line of clean) {
    if (line.startsWith('@@')) continue
    if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }
  return { added, removed }
}
