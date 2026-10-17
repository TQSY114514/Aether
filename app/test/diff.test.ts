import { describe, it, expect } from 'vitest'
import { cleanDiffLines, countDiffLines } from '../src/utils/diff'

describe('diff utilities', () => {
  it('cleans git headers and extracts hunks', () => {
    const raw = `diff --git a/foo.txt b/foo.txt
index 1234567..89abcdef 100644
--- a/foo.txt
+++ b/foo.txt
@@ -1,3 +1,4 @@
 line 1
-line 2
+line 2 modified
+line 2.5
 line 3`

    const cleaned = cleanDiffLines(raw)
    expect(cleaned).toEqual([
      '@@ -1,3 +1,4 @@',
      ' line 1',
      '-line 2',
      '+line 2 modified',
      '+line 2.5',
      ' line 3'
    ])

    const counts = countDiffLines(raw)
    expect(counts).toEqual({ added: 2, removed: 1 })
  })

  it('preserves patch lines inside hunks that look like file headers', () => {
    // When editing a patch file itself, changing '-- a/old' to '++ b/new' produces '--- a/old' and '+++ b/new'
    const patchEdit = `diff --git a/fix.patch b/fix.patch
--- a/fix.patch
+++ b/fix.patch
@@ -1,3 +1,3 @@
 context 1
--- a/old
+++ b/new
 context 2`

    const cleaned = cleanDiffLines(patchEdit)
    expect(cleaned[0]).toBe('@@ -1,3 +1,3 @@')
    expect(cleaned).toContain('--- a/old')
    expect(cleaned).toContain('+++ b/new')

    const counts = countDiffLines(patchEdit)
    expect(counts.added).toBe(1)
    expect(counts.removed).toBe(1)
  })

  it('handles multiple files correctly', () => {
    const multi = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1 +1 @@
-foo
+bar`

    const counts = countDiffLines(multi)
    expect(counts).toEqual({ added: 2, removed: 2 })
  })
})
