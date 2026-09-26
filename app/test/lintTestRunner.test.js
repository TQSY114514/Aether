import { describe, it, expect } from 'vitest'
import path from 'path'
import {
  detectProjectType,
  resolveTestCommand,
  resolveLintCommand,
  runProjectTest,
  runProjectLint,
  splitCmd,
} from '../electron/llm/lintTestRepair'

describe('Lint & Test Auto-Repair Runner (Claude Code / Aider alignment)', () => {
  const workspaceRoot = path.resolve(__dirname, '..')

  it('detects node project type from package.json in workspace', () => {
    const type = detectProjectType(workspaceRoot)
    expect(type).toBe('node')
  })

  it('splitCmd properly segments shell commands with quoted arguments', () => {
    const [prog, args] = splitCmd('node -e "console.log(123)"')
    expect(prog).toBe('node')
    expect(args).toEqual(['-e', 'console.log(123)'])
  })

  it('resolves default test command for node project', () => {
    const cmd = resolveTestCommand(null, workspaceRoot, 'node')
    expect(cmd).toBeDefined()
    expect(cmd).toMatch(/npm (test|run test)/)
  })

  it('resolves default lint command for node project', () => {
    const cmd = resolveLintCommand(null, workspaceRoot, 'node')
    expect(cmd).toBeDefined()
    expect(cmd).toMatch(/npm run lint/)
  })

  it('generates structured repair prompt when test command fails', async () => {
    const mockDb = {
      getSetting: (key) => (key === 'test_command' ? 'node -e "throw new Error(\'mock test fail\')"' : null),
    }
    const res = await runProjectTest(mockDb, { cwd: workspaceRoot })
    expect(res).toBeDefined()
    expect(res.ok).toBe(false)
    expect(res.passed).toBe(false)
    expect(typeof res.durationMs).toBe('number')
    expect(res.durationMs).toBeGreaterThanOrEqual(0)
    expect(res.projectType).toBe('node')
    expect(res.suggestedRepairPrompt).toContain('请修复以下测试中失败的用例')
  })

  it('runs on-demand lint check and returns durationMs and status', async () => {
    // Test with mock db that configures a quick passing command
    const mockDb = {
      getSetting: (key) => {
        if (key === 'lint_command') return 'node -e "console.log(\'lint passed\')"'
        return null
      },
    }

    const res = await runProjectLint(mockDb, { cwd: workspaceRoot })
    expect(res.ok).toBe(true)
    expect(res.clean).toBe(true)
    expect(res.exitCode).toBe(0)
    expect(res.output).toContain('lint passed')
    expect(res.durationMs).toBeGreaterThanOrEqual(0)
    expect(res.suggestedRepairPrompt).toBeNull()
  })

  it('formats intelligent repair prompt with logs on failure', async () => {
    const mockDb = {
      getSetting: (key) => {
        if (key === 'test_command') return 'node -e "throw new Error(\'AssertionError: expected true to be false\')"'
        return null
      },
    }

    const res = await runProjectTest(mockDb, { cwd: workspaceRoot })
    expect(res.ok).toBe(false)
    expect(res.passed).toBe(false)
    expect(res.exitCode).toBe(1)
    expect(res.output).toContain('AssertionError')
    expect(res.suggestedRepairPrompt).toBeDefined()
    expect(res.suggestedRepairPrompt).toContain('请修复以下测试中失败的用例')
    expect(res.suggestedRepairPrompt).toContain('AssertionError')
    expect(res.suggestedRepairPrompt).toContain('edit_file')
  })

  it('returns graceful error when workspace root has no test command configured', async () => {
    const res = await runProjectTest(null, { cwd: 'C:\\Windows\\Temp' })
    expect(res.ok).toBe(false)
    expect(res.error).toBeDefined()
  })
})
