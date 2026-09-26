import { describe, it, expect } from 'vitest'
import { diagnoseSystem, formatBytes, probeCliTool, generateDoctorMarkdown } from '../electron/system/doctor'
import { getDiffForReview } from '../electron/llm/gitAutoCommit'
import path from 'path'

describe('Doctor & Review Engine (Claude Code / OpenHands / Aider alignment)', () => {
  it('formatBytes formats zero and various binary magnitudes correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 15)).toBe('15.0 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 8)).toBe('8.0 GB')
  })

  it('probeCliTool detects host development tools', () => {
    const git = probeCliTool('git')
    expect(git.found).toBe(true)
    expect(typeof git.version).toBe('string')
    expect(git.version.toLowerCase()).toContain('git')

    const node = probeCliTool('node')
    expect(node.found).toBe(true)
    expect(node.version).toMatch(/v\d+\./)
  })

  it('diagnoseSystem generates full structured report and markdown output', async () => {
    const workspaceRoot = path.resolve(__dirname, '..')
    const report = await diagnoseSystem(null, { cwd: workspaceRoot })

    expect(report).toBeDefined()
    expect(report.summary.total).toBeGreaterThan(5)
    expect(report.runtime.platform).toBeDefined()
    expect(report.workspace.exists).toBe(true)
    expect(report.workspace.writable).toBe(true)
    expect(report.workspace.isGit).toBe(true)
    expect(report.markdownReport).toContain('### 🩺 Aether 系统与工作区体检报告')
    expect(report.markdownReport).toContain('| 维度 | 检查项 | 状态 | 详情 |')
  })

  it('generateDoctorMarkdown correctly displays badges and summary tables', () => {
    const mockReport = {
      summary: { total: 3, passes: 3, warnings: 0, failures: 0 },
      overallStatus: 'healthy',
      runtime: {
        platform: 'win32',
        cpus: '8 Cores',
        node: '20.0.0',
        electron: '30.0.0',
        chrome: '124.0.0',
        memory: { used: '4.0 GB', total: '16.0 GB', percent: 25, free: '12.0 GB' },
      },
      database: {
        journalMode: 'wal',
        size: '2.5 MB',
        sessionsCount: 12,
        messagesCount: 150,
      },
      workspace: {
        path: 'D:/test',
        isGit: true,
        gitBranch: 'main',
        gitDirtyCount: 0,
      },
      providers: [
        { name: 'DeepSeek', apiFormat: 'openai', reachable: true, latencyMs: 85 },
      ],
      checks: [
        { category: 'runtime', name: 'Node.js', status: 'pass', message: 'v20.0.0' },
        { category: 'tools', name: 'Git', status: 'pass', message: 'v2.45.0' },
        { category: 'database', name: 'WAL', status: 'pass', message: 'Integrity OK' },
      ],
    }

    const md = generateDoctorMarkdown(mockReport)
    expect(md).toContain('🟢 状态健康 (Healthy)')
    expect(md).toContain('DeepSeek')
    expect(md).toContain('85ms')
  })

  it('getDiffForReview extracts git changes and generates structured senior reviewer prompt', () => {
    const workspaceRoot = path.resolve(__dirname, '..')
    const res = getDiffForReview(workspaceRoot, { focus: '重点排查并发竞态与内存泄露' })

    expect(res.success).toBe(true)
    expect(typeof res.branch).toBe('string')
    expect(typeof res.commitHash).toBe('string')
    expect(res.suggestedReviewPrompt).toBeDefined()
    expect(res.suggestedReviewPrompt).toContain('请作为资深代码评审专家 (Senior Staff Code Reviewer)')
    expect(res.suggestedReviewPrompt).toContain('重点排查并发竞态与内存泄露')
    expect(res.suggestedReviewPrompt).toContain('正确性与缺陷 (Bugs & Regressions)')
    expect(res.suggestedReviewPrompt).toContain('安全性 (Security)')
    expect(res.suggestedReviewPrompt).toContain('架构与工程规范 (Design & Architecture)')
  })
})
