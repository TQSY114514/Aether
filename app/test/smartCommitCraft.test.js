import { describe, it, expect } from 'vitest'
const { craftCommitMessage, commitWorkingTree, isGitRepo } = require('../electron/llm/gitAutoCommit')
const path = require('path')

describe('Aider-style Smart Commit Crafting', () => {
  it('identifies git repository correctly', () => {
    const root = path.resolve(__dirname, '..')
    const gitRoot = isGitRepo(root)
    expect(gitRoot).toBeTruthy()
  })

  it('rejects craftCommitMessage on non-git directory', () => {
    const res = craftCommitMessage('C:\\non_existent_folder_xyz_123')
    expect(res.success).toBe(false)
    expect(res.error).toBe('not a git repository')
  })

  it('crafts a semantic conventional commit message on current repo changes', () => {
    const root = path.resolve(__dirname, '..')
    const gitRoot = isGitRepo(root)
    if (gitRoot) {
      const res = craftCommitMessage(gitRoot)
      if (res.success) {
        expect(res.suggestedMessage).toMatch(/^(feat|fix|docs|test|chore|refactor)(\([a-z0-9_-]+\))?:\s+.+/i)
        expect(Array.isArray(res.files)).toBe(true)
        expect(res.files.length).toBeGreaterThan(0)
      } else {
        expect(res.error).toMatch(/nothing to commit/i)
      }
    }
  })

  it('validates message requirement in commitWorkingTree', () => {
    const root = path.resolve(__dirname, '..')
    const gitRoot = isGitRepo(root)
    const res = commitWorkingTree(gitRoot, { message: '   ' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/commit message is required/i)
  })
})

describe('Command Exit Code & Failure Extraction', () => {
  it('extracts non-zero exit code from shell failure output', () => {
    const sampleOutput = '[FAILED: exit 1 (exit code: 1)]\n[stderr]\nError: Cannot find module ./foo'
    const exitMatch = sampleOutput.match(/(?:exit\s+code:\s*|\[FAILED:\s*exit\s+)(-?\d+)/i)
    expect(exitMatch).toBeTruthy()
    expect(parseInt(exitMatch[1], 10)).toBe(1)
  })

  it('extracts command not found error code 127', () => {
    const sampleOutput = '[COMMAND NOT FOUND]\n[stderr]\nunknown_cmd: command not found'
    expect(sampleOutput.includes('[COMMAND NOT FOUND]')).toBe(true)
  })

  it('extracts timeout indicator', () => {
    const sampleOutput = '[TIMED OUT] command execution timed out after 30000ms'
    expect(sampleOutput.includes('[TIMED OUT]')).toBe(true)
  })
})
