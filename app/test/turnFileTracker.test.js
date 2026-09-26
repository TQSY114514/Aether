import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
const { createTurnFileTracker } = require('../electron/llm/toolLoop')

describe('createTurnFileTracker', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-tracker-test-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('tracks newly created files with accurate added line counts', () => {
    const tracker = createTurnFileTracker(tmpDir)
    const filePath = path.join(tmpDir, 'newfile.txt')

    tracker.beforeTool('write_file', { path: filePath, content: 'line 1\nline 2\nline 3' })
    fs.writeFileSync(filePath, 'line 1\nline 2\nline 3', 'utf-8')
    tracker.afterTool('write_file', { path: filePath, content: 'line 1\nline 2\nline 3' })

    const summary = tracker.getSummary()
    expect(summary).not.toBeNull()
    expect(summary.fileCount).toBe(1)
    expect(summary.totalAdded).toBe(3)
    expect(summary.totalRemoved).toBe(0)
    expect(summary.files[0].status).toBe('created')
    expect(summary.files[0].added).toBe(3)
    expect(summary.files[0].removed).toBe(0)
  })

  it('tracks edited files with net added and removed line counts', () => {
    const tracker = createTurnFileTracker(tmpDir)
    const filePath = path.join(tmpDir, 'editme.txt')
    fs.writeFileSync(filePath, 'line 1\nline 2\nline 3\nline 4\n', 'utf-8')

    tracker.beforeTool('edit_file', { path: filePath })
    // Replace line 3 with two new lines
    fs.writeFileSync(filePath, 'line 1\nline 2\nline 3-modified\nline 3.5\nline 4\n', 'utf-8')
    tracker.afterTool('edit_file', { path: filePath })

    const summary = tracker.getSummary()
    expect(summary).not.toBeNull()
    expect(summary.fileCount).toBe(1)
    expect(summary.files[0].status).toBe('modified')
    expect(summary.files[0].added).toBe(2)
    expect(summary.files[0].removed).toBe(1)
    expect(summary.totalAdded).toBe(2)
    expect(summary.totalRemoved).toBe(1)
  })

  it('aggregates multiple file edits across the turn', () => {
    const tracker = createTurnFileTracker(tmpDir)
    const file1 = path.join(tmpDir, 'a.txt')
    const file2 = path.join(tmpDir, 'b.txt')

    // File 1 created
    tracker.beforeTool('write_file', { path: file1 })
    fs.writeFileSync(file1, 'hello\nworld', 'utf-8')
    tracker.afterTool('write_file', { path: file1 })

    // File 2 created
    tracker.beforeTool('write_file', { path: file2 })
    fs.writeFileSync(file2, 'foo\nbar\nbaz', 'utf-8')
    tracker.afterTool('write_file', { path: file2 })

    const summary = tracker.getSummary()
    expect(summary.fileCount).toBe(2)
    expect(summary.totalAdded).toBe(5)
    expect(summary.totalRemoved).toBe(0)
  })

  it('returns null if no files were touched in the turn', () => {
    const tracker = createTurnFileTracker(tmpDir)
    tracker.beforeTool('read_file', { path: 'any.txt' })
    tracker.afterTool('read_file', { path: 'any.txt' })
    expect(tracker.getSummary()).toBeNull()
  })
})
