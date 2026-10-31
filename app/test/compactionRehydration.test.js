import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  recordFileActivity,
  getActiveFileSnippets,
  clearFileActivities,
} from '../electron/llm/sessionContext.js'

const tmpDirs = []
function makeTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'compaction-rehydration-test-'))
  tmpDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }) } catch {}
  }
})

describe('Feature 4: Post-Compaction File Rehydration', () => {
  it('records file read and write activities with weighted scores', () => {
    const sessionId = 'test-session-1'
    clearFileActivities(sessionId)

    const ws = makeTempWorkspace()
    const fileA = join(ws, 'fileA.ts')
    const fileB = join(ws, 'fileB.ts')

    // Read fileA once
    recordFileActivity(sessionId, fileA, 'read')
    // Edit fileB once (weight 2)
    recordFileActivity(sessionId, fileB, 'edit')

    writeFileSync(fileA, 'const a = 1\nconsole.log(a)\n', 'utf-8')
    writeFileSync(fileB, 'export const b = 2\nexport function getB() { return b }\n', 'utf-8')

    const snippets = getActiveFileSnippets(sessionId, { maxFiles: 2, maxLinesPerFile: 10, wsRoot: ws })
    expect(snippets.length).toBe(2)
    // fileB has higher score (2) than fileA (1), so it comes first
    expect(snippets[0].path).toBe(fileB)
    expect(snippets[0].snippet).toContain('export const b = 2')
    expect(snippets[1].path).toBe(fileA)
    expect(snippets[1].snippet).toContain('const a = 1')
  })

  it('caps maxLinesPerFile to requested limit and resolves relative paths', () => {
    const sessionId = 'test-session-2'
    clearFileActivities(sessionId)

    const ws = makeTempWorkspace()
    const longFilePath = join(ws, 'long.txt')
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`)
    writeFileSync(longFilePath, lines.join('\n'), 'utf-8')

    // Record relative path with wsRoot
    recordFileActivity(sessionId, 'long.txt', 'write')

    const snippets = getActiveFileSnippets(sessionId, { maxFiles: 1, maxLinesPerFile: 5, wsRoot: ws })
    expect(snippets.length).toBe(1)
    expect(snippets[0].path).toBe('long.txt')
    const snippetLines = snippets[0].snippet.split('\n')
    expect(snippetLines.length).toBe(5)
    expect(snippetLines[0]).toBe('line 1')
    expect(snippetLines[4]).toBe('line 5')
  })

  it('returns empty array when no activity was recorded', () => {
    const sessionId = 'empty-session'
    clearFileActivities(sessionId)
    const snippets = getActiveFileSnippets(sessionId)
    expect(snippets).toEqual([])
  })
})
