// ─── Wish Learnings Unit Tests ──────────────────────────────────────────────
// Tests for features adapted from Wish:
// 1. ask_user tool registration and execution with callbacks
// 2. history_search tool with session SQLite queries and role filters
// 3. findSkills progressive discovery (CJK 2-gram, prefix, exact) & use_skill integration
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getTool } = require('../electron/tools/registry')
const skillsMod = require('../electron/llm/skills')

describe('Wish Learnings: ask_user tool', () => {
  const askUserTool = getTool('ask_user')

  it('registers ask_user as a safe tool with schema', () => {
    expect(askUserTool).toBeDefined()
    expect(askUserTool.name).toBe('ask_user')
    expect(askUserTool.risk).toBe('safe')
    expect(askUserTool.parameters.required).toContain('questions')
  })

  it('throws if questions array is missing or empty', async () => {
    await expect(askUserTool.run({}, {})).rejects.toThrow('At least one question is required')
    await expect(askUserTool.run({ questions: [] }, {})).rejects.toThrow('At least one question is required')
  })

  it('throws friendly error when onAskUser is not present in context', async () => {
    const questions = [{ question: 'Which library?', options: [{ label: 'React' }] }]
    await expect(askUserTool.run({ questions }, {})).rejects.toThrow('ask_user is not supported in the current execution context')
  })

  it('delegates to ctx.onAskUser when provided', async () => {
    const questions = [
      { question: 'Choose target env', options: [{ label: 'staging' }, { label: 'production' }] },
    ]
    const mockOnAskUser = vi.fn().mockResolvedValue({ 'Choose target env': 'staging' })
    const res = await askUserTool.run({ questions }, { onAskUser: mockOnAskUser })
    expect(mockOnAskUser).toHaveBeenCalledWith(questions)
    expect(res).toEqual({ 'Choose target env': 'staging' })
  })

  it('delegates to ctx.callbacks.onAskUser fallback', async () => {
    const questions = [{ question: 'Confirm deploy?', options: [{ label: 'yes' }, { label: 'no' }] }]
    const mockCallback = vi.fn().mockResolvedValue('user said yes')
    const res = await askUserTool.run({ questions }, { callbacks: { onAskUser: mockCallback } })
    expect(mockCallback).toHaveBeenCalledWith(questions)
    expect(res).toBe('user said yes')
  })
})

describe('Wish Learnings: history_search tool', () => {
  const historyTool = getTool('history_search')

  it('registers history_search as safe tool with required query', () => {
    expect(historyTool).toBeDefined()
    expect(historyTool.name).toBe('history_search')
    expect(historyTool.risk).toBe('safe')
    expect(historyTool.parameters.required).toContain('query')
  })

  it('throws if query is empty or blank', async () => {
    await expect(historyTool.run({ query: '   ' }, {})).rejects.toThrow('query is required')
  })

  it('returns friendly notice when sessionId is missing', async () => {
    const res = await historyTool.run({ query: 'auth' }, {})
    expect(res).toContain('No active session id')
  })

  it('returns friendly notice when database is not accessible', async () => {
    const res = await historyTool.run({ query: 'auth' }, { sessionId: 'test-session-1' })
    // If global db is uninitialized in test runner, it reports db not accessible
    expect(res).toMatch(/Database is not accessible|No historical messages/)
  })

  it('searches messages using db.prepare with limit and role filtering', async () => {
    const mockRows = [
      { id: 101, role: 'user', content: 'We need to migrate authentication to JWT tokens', created_at: '2026-10-17 10:00:00' },
      { id: 105, role: 'assistant', content: 'JWT authentication implementation has been deployed', created_at: '2026-10-17 10:05:00' },
    ]

    let executedSql = ''
    let executedParams = []

    const mockDb = {
      prepare: vi.fn((sql) => {
        executedSql = sql
        return {
          all: vi.fn((...params) => {
            executedParams = params
            return mockRows
          }),
        }
      }),
    }

    const res = await historyTool.run(
      { query: 'JWT', limit: 5, role: 'assistant' },
      { sessionId: 'sess-abc', db: mockDb }
    )

    expect(executedSql).toContain('SELECT id, role, content, created_at FROM message WHERE session_id = ? AND content LIKE ?')
    expect(executedSql).toContain('AND role = ?')
    expect(executedParams).toEqual(['sess-abc', '%JWT%', 'assistant', 5])
    expect(res).toContain('[Message #101 | user | 2026-10-17 10:00:00]')
    expect(res).toContain('[Message #105 | assistant | 2026-10-17 10:05:00]')
  })

  it('truncates message previews longer than 500 characters', async () => {
    const longContent = 'A'.repeat(800)
    const mockDb = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => [{ id: 1, role: 'assistant', content: longContent, created_at: '2026-10-17' }]),
      })),
    }

    const res = await historyTool.run({ query: 'A' }, { sessionId: 'sess-1', db: mockDb })
    expect(res).toContain('... [truncated]')
    expect(res).toContain('A'.repeat(500))
  })
})

describe('Wish Learnings: Progressive skill discovery (findSkills & use_skill)', () => {
  const useSkillTool = getTool('use_skill')

  beforeEach(() => {
    // Seed temporary in-memory skills
    skillsMod.upsertSkill('git-commit-craft', {
      name: 'git-commit-craft',
      description: 'Generate high-quality git commit messages and diffs following semantic guidelines',
      body: '# Git Commit Craft Skill Body',
      permissions: ['filesystem'],
    })
    skillsMod.upsertSkill('docker-sandbox', {
      name: 'docker-sandbox',
      description: 'Run commands and builds inside isolated docker containers',
      body: '# Docker Sandbox Body',
      permissions: ['docker'],
    })
    skillsMod.upsertSkill('cjk-code-review', {
      name: 'cjk-code-review',
      description: '审查代码逻辑与国际化字符处理，确保中文多语言兼容性',
      body: '# 中文代码审查指南',
    })
  })

  it('findSkills returns empty array on empty query', () => {
    expect(skillsMod.findSkills('')).toEqual([])
    expect(skillsMod.findSkills('   ')).toEqual([])
  })

  it('scores exact skill name match highest', () => {
    const res = skillsMod.findSkills('git-commit-craft', 5)
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].name).toBe('git-commit-craft')
    expect(res[0].score).toBeGreaterThanOrEqual(100)
  })

  it('matches prefix and substring queries', () => {
    const res = skillsMod.findSkills('docker', 5)
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].name).toBe('docker-sandbox')
  })

  it('supports CJK 2-gram matching for Chinese queries', () => {
    // "审查" is a 2-gram inside description "审查代码逻辑..."
    const res = skillsMod.findSkills('审查', 5)
    expect(res.length).toBeGreaterThan(0)
    expect(res.some(s => s.name === 'cjk-code-review')).toBe(true)
  })

  it('use_skill with query parameter discovers skills progressively', () => {
    const res = useSkillTool.run({ query: 'docker' }, {})
    expect(res).toContain('Matching skills for "docker"')
    expect(res).toContain('docker-sandbox')
  })

  it('use_skill with query returns polite notice when nothing matches', () => {
    const res = useSkillTool.run({ query: 'completely-nonexistent-skill-xyz123' }, {})
    expect(res).toContain('No skills matching query')
  })

  it('use_skill provides fuzzy suggestions on unknown skill_name', () => {
    expect(() => {
      useSkillTool.run({ skill_name: 'git-commit' }, {})
    }).toThrow(/unknown skill: "git-commit"[\s\S]*Did you mean one of these\?[\s\S]*git-commit-craft/)
  })

  it('use_skill loads valid skill body and appends permissions', () => {
    const res = useSkillTool.run({ skill_name: 'docker-sandbox' }, {})
    expect(res).toContain('# Docker Sandbox Body')
    expect(res).toContain('[skill declares permissions: docker]')
  })
})
