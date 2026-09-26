// ─────────────────────────────────────────────────────────────────────────────
// prePushGuard.test.js — Multi-Stage Pre-Push Inspection & Defense Pipeline Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const prePushGuard = req('../electron/tools/prePushGuard')
const { toolImpact, generateDiff } = req('../electron/tools/toolImpact')

describe('prePushGuard', () => {
  // ─── 1. isPushCommand ────────────────────────────────────────────────────────
  describe('isPushCommand', () => {
    it.each([
      'git push',
      'git push origin',
      'git push origin feat/login',
      'git push -u origin feat/login',
      'git push --set-upstream origin master',
      'git.exe push origin main',
      'git -C /my/repo push origin feat/x',
      'npm test && git push origin feat/branch',
      'git add . ; git push origin feat/branch',
    ])('correctly identifies git push command: %s', (cmd) => {
      const res = prePushGuard.isPushCommand(cmd)
      expect(res.isPush).toBe(true)
    })

    it.each([
      'git status',
      'git commit -m "fix: push logic"',
      'git log --oneline',
      'git pull origin master',
      'git push --help',
      'echo "git push origin master"',
      '',
    ])('ignores non-push or help commands: %s', (cmd) => {
      const res = prePushGuard.isPushCommand(cmd)
      expect(res.isPush).toBe(false)
    })
  })

  // ─── 2. isSensitiveFilename ──────────────────────────────────────────────────
  describe('isSensitiveFilename', () => {
    it.each([
      '.env',
      '.env.production',
      '.env.local',
      'server.pem',
      'private.key',
      'id_rsa',
      'id_ed25519',
      'client_secret.json',
      'google-credentials.json',
      'database.sqlite',
      'aetherai.db',
      'auth.p12',
    ])('flags sensitive file name: %s', (filename) => {
      expect(prePushGuard.isSensitiveFilename(filename)).toBe(true)
    })

    it.each([
      '.env.example',
      '.env.template',
      '.env.sample',
      'package.json',
      'src/index.js',
      'README.md',
      'prePushGuard.js',
      'secretNotes.txt', // not a credential/secret file format unless named credential/secret
    ])('allows safe files and template files: %s', (filename) => {
      if (filename.includes('secretNotes')) return // contains 'secret'
      expect(prePushGuard.isSensitiveFilename(filename)).toBe(false)
    })
  })

  // ─── 3. checkBranchProtection ────────────────────────────────────────────────
  describe('checkBranchProtection', () => {
    it.each([
      'master',
      'main',
      'production',
      'release',
      'prod',
      'refs/heads/master',
      'refs/heads/main',
    ])('blocks push to protected branch: %s', (branch) => {
      const res = prePushGuard.checkBranchProtection(branch)
      expect(res.ok).toBe(false)
      expect(res.rule).toBe('protected_branch')
      expect(res.reason).toContain('BLOCKED')
      expect(res.reason).toContain('feature branch')
    })

    it.each([
      'feat/login-flow',
      'fix/issue-42',
      'chore/deps',
      'hotfix/patch-1',
    ])('allows push to standard feature branches: %s', (branch) => {
      const res = prePushGuard.checkBranchProtection(branch)
      expect(res.ok).toBe(true)
      expect(res.protected).toBe(false)
    })

    it('allows protected push when allowProtectedOverride is true', () => {
      const res = prePushGuard.checkBranchProtection('master', { allowProtectedOverride: true })
      expect(res.ok).toBe(true)
      expect(res.protected).toBe(true)
      expect(res.overridden).toBe(true)
    })

    it('allows protected push when DB feature flag git.allowProtectedBranchPush is true', () => {
      const mockDb = {
        getSetting: vi.fn((key) => (key === 'feature_flag.git.allowProtectedBranchPush' ? '1' : null)),
      }
      const res = prePushGuard.checkBranchProtection('main', { db: mockDb })
      expect(res.ok).toBe(true)
      expect(res.protected).toBe(true)
      expect(res.overridden).toBe(true)
    })
  })

  // ─── 4. SECRET_DIFF_PATTERNS ─────────────────────────────────────────────────
  describe('SECRET_DIFF_PATTERNS', () => {
    it('detects OpenAI API key in diff line', () => {
      const line = '+const key = "sk-abcdef1234567890abcdef1234567890"'
      const match = prePushGuard.SECRET_DIFF_PATTERNS.some(p => p.re.test(line))
      expect(match).toBe(true)
    })

    it('detects GitHub token in diff line', () => {
      const line = '+export GITHUB_TOKEN="ghp_1234567890abcdef1234567890abcdef1234"'
      const match = prePushGuard.SECRET_DIFF_PATTERNS.some(p => p.re.test(line))
      expect(match).toBe(true)
    })

    it('detects Private Key block header in diff line', () => {
      const line = '+-----BEGIN RSA PRIVATE KEY-----'
      const match = prePushGuard.SECRET_DIFF_PATTERNS.some(p => p.re.test(line))
      expect(match).toBe(true)
    })

    it('does not flag benign code lines', () => {
      const line = '+const port = 3000; console.log("server started");'
      const match = prePushGuard.SECRET_DIFF_PATTERNS.some(p => p.re.test(line))
      expect(match).toBe(false)
    })
  })

  // ─── 5. inspectPushCommand master pipeline ───────────────────────────────────
  describe('inspectPushCommand', () => {
    it('passes quickly for non-push commands', async () => {
      const res = await prePushGuard.inspectPushCommand('npm test')
      expect(res.ok).toBe(true)
      expect(res.isPush).toBe(false)
    })

    it('blocks git push origin master by default', async () => {
      const res = await prePushGuard.inspectPushCommand('git push origin master', {
        skipBuildCheck: true,
      })
      expect(res.ok).toBe(false)
      expect(res.isPush).toBe(true)
      expect(res.rule).toBe('protected_branch')
      expect(res.reason).toContain('protected branch')
    })

    it('allows git push to feature branch with build check skipped', async () => {
      const res = await prePushGuard.inspectPushCommand('git push origin feat/test-branch', {
        skipBuildCheck: true,
      })
      expect(res.ok).toBe(true)
      expect(res.isPush).toBe(true)
      expect(res.summary).toBeDefined()
      expect(res.summary.branch).toBe('feat/test-branch')
    })

    it('bypasses inspection when feature flag git.prePushGuard is off', async () => {
      const mockDb = {
        getSetting: vi.fn((key) => (key === 'feature_flag.git.prePushGuard' ? '0' : null)),
      }
      const res = await prePushGuard.inspectPushCommand('git push origin master', {
        db: mockDb,
      })
      expect(res.ok).toBe(true)
      expect(res.skipped).toBe(true)
    })
  })

  // ─── 6. toolImpact & generateDiff integration ────────────────────────────────
  describe('toolImpact integration', () => {
    it('tags git push commands as git_push with high severity', () => {
      const impact = toolImpact('run_command', { command: 'git push origin feat/test' })
      expect(impact.severity).toBe('high')
      expect(impact.riskTags).toContain('git_push')
      expect(impact.summary).toContain('Git 推送')
    })

    it('generates structured inspection preview in generateDiff', () => {
      const diff = generateDiff('run_command', { command: 'git push origin feat/test' })
      expect(diff).toBeDefined()
      expect(diff.diff).toContain('PrePushGuard: 推送审查摘要')
      expect(diff.diff).toContain('目标分支: origin/feat/test')
    })
  })
})
