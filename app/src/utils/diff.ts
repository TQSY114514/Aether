/**
 * Utilities for cleaning and parsing unified diffs across ToolCallBlock and FileSummaryDeck.
 */

export function cleanDiffLines(rawDiff: string): string[] {
  if (!rawDiff) return []
  const lines = rawDiff.replace(/\r/g, '').split('\n')
  const firstHunkIndex = lines.findIndex(l => l.startsWith('@@'))
  if (firstHunkIndex !== -1) {
    return lines.slice(firstHunkIndex)
  }

  // When no @@ hunk header exists:
  // Strip git metadata header lines and the leading --- / +++ file header pair.
  let startIndex = 0
  let foundMinusHeader = false

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (
      l.startsWith('diff --git') ||
      l.startsWith('index ') ||
      l.startsWith('new file mode') ||
      l.startsWith('deleted file mode') ||
      l.startsWith('old mode') ||
      l.startsWith('new mode') ||
      l.startsWith('similarity index') ||
      l.startsWith('rename from') ||
      l.startsWith('rename to') ||
      l.startsWith('Binary files')
    ) {
      startIndex = i + 1
      continue
    }

    if (!foundMinusHeader && (l.startsWith('--- a/') || l.startsWith('--- /dev/null') || l.startsWith('--- '))) {
      foundMinusHeader = true
      startIndex = i + 1
      continue
    }

    if (foundMinusHeader && (l.startsWith('+++ b/') || l.startsWith('+++ /dev/null') || l.startsWith('+++ '))) {
      startIndex = i + 1
      break // Done skipping the file header pair
    }

    break
  }

  return lines.slice(startIndex)
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
