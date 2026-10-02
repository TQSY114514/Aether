import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  isAvailable,
  commitCheckpoint,
  rollbackCheckpoint,
  getDiff,
  deleteShadowRepo,
} from '../electron/llm/shadowGit'

describe('shadowGit (Shadow Git Isolated Checkpoints)', () => {
  const testSessionId = 999901
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-shadowgit-test-'))

  afterAll(() => {
    deleteShadowRepo(testSessionId)
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('checks git availability', () => {
    expect(typeof isAvailable()).toBe('boolean')
  })

  it('creates fast shadow checkpoints, diffs, and rolls back cleanly without polluting workspace git', () => {
    if (!isAvailable()) return

    const filePath = path.join(tmpDir, 'sample.txt')
    fs.writeFileSync(filePath, 'version 1 content\n', 'utf-8')

    // 1. Commit baseline checkpoint
    const res1 = commitCheckpoint(testSessionId, tmpDir, {
      affectedPaths: [filePath],
      message: 'v1 snapshot',
    })
    expect(res1.ok).toBe(true)
    expect(res1.commitHash).toMatch(/^[0-9a-f]{40}$/)
    expect(typeof res1.durationMs).toBe('number')

    // Verify workspace has no .git created by shadow git
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(false)

    // 2. Modify file and commit second checkpoint
    fs.writeFileSync(filePath, 'version 2 modified content\n', 'utf-8')
    const res2 = commitCheckpoint(testSessionId, tmpDir, {
      affectedPaths: [filePath],
      message: 'v2 snapshot',
    })
    expect(res2.ok).toBe(true)
    expect(res2.commitHash).not.toBe(res1.commitHash)

    // 3. Inspect diff
    const diff = getDiff(testSessionId, tmpDir, res1.commitHash, res2.commitHash)
    expect(diff).toContain('version 1 content')
    expect(diff).toContain('version 2 modified content')

    // 4. Rollback to v1
    const rollRes = rollbackCheckpoint(testSessionId, tmpDir, res1.commitHash, [filePath])
    expect(rollRes.ok).toBe(true)

    // 5. Verify file content restored
    const restoredContent = fs.readFileSync(filePath, 'utf-8')
    expect(restoredContent).toBe('version 1 content\n')
  }, 20000)
})
