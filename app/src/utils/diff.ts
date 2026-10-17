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

  const result: string[] = []
  let inHeader = true
  let foundFileHeaderMinus = false

  let remainingOld = 0
  let remainingNew = 0
  let inHunk = false

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]

    // Check if current hunk is actively consuming lines
    const hunkActive = inHunk && (remainingOld > 0 || remainingNew > 0)

    // A new file boundary inside hunks:
    // 1) diff --git is always a new file
    // 2) pair of --- and +++ ONLY when current hunk has ended
    const isNewFileBoundary =
      l.startsWith('diff --git') ||
      (!hunkActive &&
        isFileHeaderMinus(l) &&
        lines[i + 1] != null &&
        isFileHeaderPlus(lines[i + 1]))

    if (!inHeader && isNewFileBoundary) {
      inHeader = true
      foundFileHeaderMinus = false
      inHunk = false
      remainingOld = 0
      remainingNew = 0
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
        const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
        if (m) {
          inHunk = true
          remainingOld = m[2] !== undefined ? parseInt(m[2], 10) : 1
          remainingNew = m[4] !== undefined ? parseInt(m[4], 10) : 1
        }
        result.push(l)
        continue
      }
      // If we encounter a line that isn't a known header while inHeader,
      // it means there's no @@ header in this section, so treat as diff content
      inHeader = false
      result.push(l)
      continue
    }

    // Inside hunk content: track line counts
    if (l.startsWith('@@')) {
      const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (m) {
        inHunk = true
        remainingOld = m[2] !== undefined ? parseInt(m[2], 10) : 1
        remainingNew = m[4] !== undefined ? parseInt(m[4], 10) : 1
      }
    } else if (inHunk) {
      if (l.startsWith(' ')) {
        remainingOld = Math.max(0, remainingOld - 1)
        remainingNew = Math.max(0, remainingNew - 1)
      } else if (l.startsWith('-')) {
        remainingOld = Math.max(0, remainingOld - 1)
      } else if (l.startsWith('+')) {
        remainingNew = Math.max(0, remainingNew - 1)
      }
      if (remainingOld === 0 && remainingNew === 0) {
        inHunk = false
      }
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
