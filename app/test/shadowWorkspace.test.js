// ─────────────────────────────────────────────────────────────────────────────
// shadowWorkspace.test.js — P0-02 影子工作区隔离沙盒测试套件
//
// 验证以下核心链路：
//   1. 影子工作区生命周期：创建、状态检查、变更提交、合流主分支与清理销毁
//   2. 影子工作区隔离性：主分支在未合流前保持干净，影子异常中止时整批丢弃无污染
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

describe('P0-02 影子工作区隔离机制 (Cursor / OpenHands 战术)', async () => {
  const worktreeMgr = await import('../electron/worktreeManager')
  let testRepoRoot = null

  beforeAll(() => {
    testRepoRoot = mkdtempSync(join(tmpdir(), 'aether-shadow-repo-'))
    // 初始化临时 git 仓库
    execSync('git init', { cwd: testRepoRoot, stdio: 'pipe' })
    execSync('git config user.name "Aether Test"', { cwd: testRepoRoot, stdio: 'pipe' })
    execSync('git config user.email "test@aether.ai"', { cwd: testRepoRoot, stdio: 'pipe' })
    writeFileSync(join(testRepoRoot, 'main.txt'), 'initial commit content\n', 'utf8')
    execSync('git add main.txt', { cwd: testRepoRoot, stdio: 'pipe' })
    execSync('git commit -m "initial commit"', { cwd: testRepoRoot, stdio: 'pipe' })
  })

  afterAll(() => {
    if (testRepoRoot) {
      try { rmSync(testRepoRoot, { recursive: true, force: true }) } catch {}
    }
  })

  it('assertRepo: 正确识别 Git 仓库', () => {
    expect(worktreeMgr.assertRepo(testRepoRoot).ok).toBe(true)
    const fakeDir = mkdtempSync(join(tmpdir(), 'non-git-'))
    expect(worktreeMgr.assertRepo(fakeDir).ok).toBe(false)
    try { rmSync(fakeDir, { recursive: true, force: true }) } catch {}
  })

  it('createShadowWorkspace: 为会话创建独立的影子分支与 worktree', () => {
    const res = worktreeMgr.createShadowWorkspace({ root: testRepoRoot, sessionId: 'session-alpha-123' })
    expect(res.ok).toBe(true)
    expect(res.branch).toMatch(/^aether-shadow-session-alpha-123-[a-f0-9]{8}$/)
    expect(existsSync(res.dir)).toBe(true)

    // 幂等重用
    const res2 = worktreeMgr.createShadowWorkspace({ root: testRepoRoot, sessionId: 'session-alpha-123' })
    expect(res2.ok).toBe(true)
    expect(res2.reused).toBe(true)
  })

  it('shadowWorkspaceStatus: 检测影子内部未提交变更与提交状态', () => {
    const dir = worktreeMgr.shadowDirFor(testRepoRoot, 'session-alpha-123')
    // 在影子工作区写入新文件
    writeFileSync(join(dir, 'shadow-file.txt'), 'created inside shadow workspace\n', 'utf8')

    // 主仓库根目录应该完全没有该文件（物理隔离）
    expect(existsSync(join(testRepoRoot, 'shadow-file.txt'))).toBe(false)

    const status = worktreeMgr.shadowWorkspaceStatus({ root: testRepoRoot, sessionId: 'session-alpha-123' })
    expect(status).not.toBeNull()
    expect(status.dirty).toBe(true)
    expect(status.hasChanges).toBe(true)
    expect(status.changedFiles).toBeGreaterThanOrEqual(1)
  })

  it('applyShadowWorkspace: 测试通过后一键合流至主工作区', () => {
    const applyRes = worktreeMgr.applyShadowWorkspace({
      root: testRepoRoot,
      sessionId: 'session-alpha-123',
      message: 'test: apply shadow workspace changes',
    })
    expect(applyRes.ok).toBe(true)

    // 合流后，主工作区现在拥有了该文件
    expect(existsSync(join(testRepoRoot, 'shadow-file.txt'))).toBe(true)
    expect(readFileSync(join(testRepoRoot, 'shadow-file.txt'), 'utf8')).toContain('created inside shadow workspace')

    // 影子 worktree 已经被清理
    const dir = worktreeMgr.shadowDirFor(testRepoRoot, 'session-alpha-123')
    expect(existsSync(dir)).toBe(false)
  })

  it('removeShadowWorkspace: 异常时回滚销毁影子，绝不污染主工作区', () => {
    // 创建另一个影子会话
    const res = worktreeMgr.createShadowWorkspace({ root: testRepoRoot, sessionId: 'session-fail-456' })
    expect(res.ok).toBe(true)
    const dir = res.dir

    // 写入失败或有毒的脏变更
    writeFileSync(join(dir, 'toxic-change.txt'), 'bad code\n', 'utf8')

    // 执行丢弃
    const discardRes = worktreeMgr.removeShadowWorkspace({
      root: testRepoRoot,
      sessionId: 'session-fail-456',
      pruneBranch: true,
    })
    expect(discardRes.ok).toBe(true)

    // 主工作区绝不残留
    expect(existsSync(join(testRepoRoot, 'toxic-change.txt'))).toBe(false)
    expect(existsSync(dir)).toBe(false)
  })

  it('抗碰撞性: 特殊字符 sessionId 生成独立影子分支与路径', () => {
    const resA = worktreeMgr.createShadowWorkspace({ root: testRepoRoot, sessionId: 'user/session?1' })
    const resB = worktreeMgr.createShadowWorkspace({ root: testRepoRoot, sessionId: 'user?session/1' })
    expect(resA.ok).toBe(true)
    expect(resB.ok).toBe(true)
    expect(resA.branch).not.toBe(resB.branch)
    expect(resA.dir).not.toBe(resB.dir)
    worktreeMgr.removeShadowWorkspace({ root: testRepoRoot, sessionId: 'user/session?1', pruneBranch: true })
    worktreeMgr.removeShadowWorkspace({ root: testRepoRoot, sessionId: 'user?session/1', pruneBranch: true })
  })

  it('目标分支漂移保护: 主仓库切换分支后阻止合流并报错', () => {
    const res = worktreeMgr.createShadowWorkspace({ root: testRepoRoot, sessionId: 'session-drift-789' })
    expect(res.ok).toBe(true)
    writeFileSync(join(res.dir, 'drift-change.txt'), 'drift\n', 'utf8')

    // 主仓库创建并切换到新分支
    execSync('git checkout -b another-branch', { cwd: testRepoRoot, stdio: 'pipe' })

    const applyRes = worktreeMgr.applyShadowWorkspace({ root: testRepoRoot, sessionId: 'session-drift-789' })
    expect(applyRes.ok).toBe(false)
    expect(applyRes.targetBranchDrift).toBe(true)

    // 切回原分支并清理
    execSync('git checkout -', { cwd: testRepoRoot, stdio: 'pipe' })
    worktreeMgr.removeShadowWorkspace({ root: testRepoRoot, sessionId: 'session-drift-789', pruneBranch: true })
  })
})
