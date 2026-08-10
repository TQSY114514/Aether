// ─── Worktree isolation unit tests ──────────────────────────────────────────
// Tests for electron/worktreeManager.js using a REAL throwaway git repo
// (created in a temp dir). Skipped automatically when git is not installed.
// Verifies: create / status / commit-and-merge / conflict detection / remove.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import worktree from '../electron/worktreeManager'

// These tests exercise real git operations (commit / merge / conflict) on a
// throwaway repo. Under the full test suite's parallel load a single git run
// can take several seconds, so use a generous file-wide timeout instead of
// the 5s default (which flakes intermittently in CI-like runs).
vi.setConfig({ testTimeout: 30000 })

const GIT_OK = (() => {
  try { return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0 } catch { return false }
})()

// ─── Fixture: throwaway repo ────────────────────────────────────────────────
let repoRoot = null
let taskId = 0

function git(args, cwd = repoRoot) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: os.tmpdir() } })
}

function writeFile(rel, content, base = repoRoot) {
  const p = path.join(base, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

beforeAll(() => {
  if (!GIT_OK) return
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-wt-'))
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.email', 'test@aether.local'])
  git(['config', 'user.name', 'Aether Test'])
  writeFile('readme.md', '# test repo\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'initial'])
})

afterAll(() => {
  if (repoRoot) fs.rmSync(repoRoot, { recursive: true, force: true })
})

const ok = GIT_OK ? describe : describe.skip

ok('worktree isolation', () => {

  it('refuses non-repo roots', () => {
    expect(worktree.assertRepo('')).toEqual({ ok: false, error: 'worktree: repo root required' })
    const r = worktree.assertRepo(os.tmpdir())
    expect(r).toMatchObject({ ok: false })
  })

  it('createWorktree → isolated dir + branch', () => {
    const r = worktree.createWorktree({ root: repoRoot, taskId: 41 })
    expect(r.ok).toBe(true)
    expect(r.dir.endsWith('task-41')).toBe(true)
    expect(r.branch).toBe('aether-task-41')
    // The worktree must exist on disk
    expect(fs.existsSync(r.dir)).toBe(true)
    // The main checkout must be untouched (still on main)
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
    expect(branch.stdout.trim()).toBe('main')
  })

  it('createWorktree is idempotent (reused on second call)', () => {
    const r1 = worktree.createWorktree({ root: repoRoot, taskId: 41 })
    const r2 = worktree.createWorktree({ root: repoRoot, taskId: 41 })
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    expect(r2.reused).toBe(true)
  })

  it('worktreeStatus reflects uncommitted changes inside the worktree', () => {
    const status = worktree.worktreeStatus(repoRoot, 41)
    if (status === null) {
      // CI 临时诊断 v2（定位 normPath 中间值，修复后移除）
      const list = git(['worktree', 'list', '--porcelain'])
      const expectDir = path.join(repoRoot, '.aether', 'worktrees', 'task-41')
      const norm = (p) => {
        let r = path.resolve(p).replace(/\//g, path.sep)
        try { r = fs.realpathSync(r) } catch (e) { return `REALPATH_ERR:${e.code}:${r}` }
        return process.platform === 'win32' ? r.toLowerCase() : r
      }
      console.log('DIAG2|porcelain:', JSON.stringify(list.stdout))
      console.log('DIAG2|dir:', JSON.stringify(expectDir))
      console.log('DIAG2|normDir:', JSON.stringify(norm(expectDir)))
      for (const block of list.stdout.replace(/\r/g, '').split('\n\n')) {
        const wt = (block.split('\n').find((l) => l.startsWith('worktree ')) || '').slice('worktree '.length).trim()
        console.log('DIAG2|wt:', JSON.stringify(wt), 'norm:', JSON.stringify(norm(wt)))
      }
    }
    expect(status).toMatchObject({ exists: true, branch: 'aether-task-41', dirty: false })

    // Make a change INSIDE the worktree
    writeFile('feature.txt', 'agent work', path.join(repoRoot, '.aether', 'worktrees', 'task-41'))
    const dirty = worktree.worktreeStatus(repoRoot, 41)
    expect(dirty.dirty).toBe(true)
    expect(dirty.changedFiles).toBeGreaterThan(0)
  })

  it('commitWorktreeChanges commits and returns sha', () => {
    const r = worktree.commitWorktreeChanges(repoRoot, 41, 'agent: feature work')
    expect(r.ok).toBe(true)
    expect(r.committed).toBe(true)
    expect(r.sha).toMatch(/^[0-9a-f]{7,40}$/)
    // Now clean
    expect(worktree.worktreeStatus(repoRoot, 41).dirty).toBe(false)
  })

  it('mergeWorktree merges the branch into main cleanly', () => {
    const r = worktree.mergeWorktree(repoRoot, 41, { mergeMessage: 'merge task 41' })
    expect(r.ok).toBe(true)
    expect(r.conflicts).toEqual([])
    // feature.txt visible in main checkout now
    expect(fs.existsSync(path.join(repoRoot, 'feature.txt'))).toBe(true)
  })

  it('conflict detection aborts the merge and reports the file', () => {
    // Branch A in main: create conflict.txt AFTER the worktree 42 already exists
    // so main and the worktree diverge (otherwise git fast-forwards — no conflict).
    const r2 = worktree.createWorktree({ root: repoRoot, taskId: 42 })
    expect(r2.ok).toBe(true)

    writeFile('conflict.txt', 'main version\n')
    git(['add', '.'])
    git(['commit', '-q', '-m', 'main adds conflict.txt'])

    // Now the worktree changes the same file differently → real conflict.
    writeFile('conflict.txt', 'worktree version\n', r2.dir)
    git(['add', '.'], r2.dir)
    git(['commit', '-q', '-m', 'wt adds conflict.txt'], r2.dir)

    const m = worktree.mergeWorktree(repoRoot, 42)
    expect(m.ok).toBe(false)
    expect(Array.isArray(m.conflicts)).toBe(true)
    expect(m.conflicts.join('\n')).toContain('conflict.txt')
    // Merge aborted → main working tree still clean of the merge
    const st = git(['status', '--porcelain'])
    expect(st.stdout).not.toContain('UU conflict.txt')
  })

  it('removeWorktree unlinks the worktree', () => {
    // task 42 worktree must be removed (its branch stays, merge aborted)
    const r = worktree.removeWorktree(repoRoot, 42, { pruneBranch: true })
    expect(r.ok).toBe(true)
    expect(worktree.worktreeStatus(repoRoot, 42)).toBeNull()
  })

  it('worktreeDiffStats tails the changed files', () => {
    const r = worktree.worktreeDiffStats(repoRoot, 41)
    // committed already → empty stats
    expect(Array.isArray(r.stats)).toBe(true)
  })
})