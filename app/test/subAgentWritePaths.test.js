// ─────────────────────────────────────────────────────────────────────────────
// subAgentWritePaths.test.js — P0-2 Parallel Sub-Agent write_paths Preflight Tests
//
// 验收要求：
// 1. 两名整仓写者（省略 write_paths）→ 预检失败（fail-closed）且未启动任何子代理。
// 2. 两名 writer 路径重叠（同文件或父子目录包含）→ 预检失败且未启动任何子代理。
// 3. 超过 max_parallel_writers = 3 → 预检失败且未启动任何子代理。
// 4. 非重叠写路径（writers <= 3, writers <= total）或搭配只读子代理（write_paths: [] / read_only: true）→ 正常并行启动。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'

const require = createRequire(import.meta.url)

let runToolLoopCalls = 0
const origLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  if (request.endsWith('toolLoop') || request.endsWith('toolLoop.js')) {
    return {
      runToolLoop: async ({ messages, agentMode }) => {
        runToolLoopCalls++
        return `completed(${agentMode}): ${messages?.[0]?.content || ''}`
      },
      IterationBudget: class {
        constructor(max = 10) { this.max = max; this.used = 0 }
        start() {}
        on() {}
      },
    }
  }
  return origLoad.apply(this, arguments)
}

const {
  runParallel,
  validateParallelWritePaths,
  pathsOverlap,
  MAX_PARALLEL_WRITERS,
} = require('../electron/llm/subAgent')

afterAll(() => {
  Module._load = origLoad
})

function makeFakeDb() {
  let nextId = 100
  const createdSessions = []
  return {
    createdSessions,
    createSession: (opts) => {
      const id = ++nextId
      createdSessions.push({ id, opts })
      return { lastInsertRowid: id }
    },
    addMessage: () => ({ lastInsertRowid: 1 }),
    updateSession: () => {},
    updateSessionConfig: () => {},
    getSessionById: () => ({ id: 1, workspace: os.tmpdir() }),
    createMessage: () => ({ id: 1 }),
    deleteSession: () => {},
  }
}

describe('P0-2: Parallel Sub-Agent write_paths Preflight (fail-closed)', () => {
  it('fails closed and starts ZERO sub-agents when two tasks omit write_paths (two whole-workspace writers)', async () => {
    runToolLoopCalls = 0
    const db = makeFakeDb()
    const events = []

    await expect(
      runParallel(
        ['Refactor module A', 'Refactor module B'],
        { db, agentMode: 'auto', onSubagentEvent: (e) => events.push(e) }
      )
    ).rejects.toThrow(/WHOLE_WORKSPACE_CONFLICT|occupies entire workspace/i)

    // Zero sub-agents launched, zero sessions created, zero start events emitted
    expect(runToolLoopCalls).toBe(0)
    expect(db.createdSessions.length).toBe(0)
    expect(events.length).toBe(0)
  })

  it('fails closed and starts ZERO sub-agents when one writer omits write_paths and another declares a path', async () => {
    runToolLoopCalls = 0
    const db = makeFakeDb()

    await expect(
      runParallel(
        [
          { task: 'Update global config' }, // omitted -> whole workspace
          { task: 'Update auth', write_paths: ['src/auth/login.ts'] },
        ],
        { db, agentMode: 'auto' }
      )
    ).rejects.toThrow(/occupies entire workspace/i)

    expect(runToolLoopCalls).toBe(0)
    expect(db.createdSessions.length).toBe(0)
  })

  it('fails closed and starts ZERO sub-agents when two writers have overlapping write_paths (exact or directory containment)', async () => {
    runToolLoopCalls = 0
    const db = makeFakeDb()

    // Case 1: Parent directory vs child file overlap ('src/auth' vs 'src/auth/jwt.ts')
    await expect(
      runParallel(
        [
          { task: 'Refactor auth dir', write_paths: ['src/auth'] },
          { task: 'Patch jwt helper', write_paths: ['src/auth/jwt.ts'] },
        ],
        { db, agentMode: 'auto' }
      )
    ).rejects.toThrow(/overlapping write_paths/i)

    expect(runToolLoopCalls).toBe(0)
    expect(db.createdSessions.length).toBe(0)

    // Case 2: Normalized exact file overlap ('./src/index.ts' vs 'src\\index.ts')
    const check = validateParallelWritePaths(
      [
        { task: 'Edit index 1', write_paths: ['./src/index.ts'] },
        { task: 'Edit index 2', write_paths: ['src\\index.ts'] },
      ],
      { agentMode: 'auto' }
    )
    expect(check.ok).toBe(false)
    expect(check.code).toBe('WRITE_PATH_OVERLAP')
  })

  it('fails closed when parallel writers exceed max_parallel_writers = 3', async () => {
    runToolLoopCalls = 0
    const db = makeFakeDb()

    expect(MAX_PARALLEL_WRITERS).toBe(3)
    await expect(
      runParallel(
        [
          { task: 'W1', write_paths: ['src/a.ts'] },
          { task: 'W2', write_paths: ['src/b.ts'] },
          { task: 'W3', write_paths: ['src/c.ts'] },
          { task: 'W4', write_paths: ['src/d.ts'] },
        ],
        { db, agentMode: 'auto' }
      )
    ).rejects.toThrow(/exceeding max_parallel_writers=3/i)

    expect(runToolLoopCalls).toBe(0)
    expect(db.createdSessions.length).toBe(0)
  })

  it('allows up to 3 disjoint writers alongside read-only tasks (writers <= 3, writers <= total) and downgrades read-only tasks to plan mode', async () => {
    runToolLoopCalls = 0
    const db = makeFakeDb()

    const results = await runParallel(
      [
        { task: 'Write A', write_paths: ['src/a'] },
        { task: 'Write B', write_paths: ['src/a-extra/file.ts'] }, // prefix sibling, not child!
        { task: 'Write C', write_paths: ['src/c.ts'] },
        { task: 'Read-only audit 1', write_paths: [] },
        { task: 'Read-only audit 2', read_only: true },
      ],
      { db, provider: { id: 'mock' }, model: { model_name: 'gpt-4o-mini' }, agentMode: 'auto' }
    )

    expect(results.length).toBe(5)
    expect(results.every(r => r.success)).toBe(true)
    expect(runToolLoopCalls).toBe(5)
    // Verify writers ran in auto mode and read-only tasks ran in plan mode
    expect(results[0].output).toContain('completed(auto)')
    expect(results[3].output).toContain('completed(plan)')
    expect(results[4].output).toContain('completed(plan)')
  })

  it('pathsOverlap helper distinguishes sibling prefixes from parent-child containment', () => {
    expect(pathsOverlap('src/auth', 'src/auth/login.ts')).toBe(true)
    expect(pathsOverlap('src/auth', 'src/auth-v2/login.ts')).toBe(false)
    expect(pathsOverlap('.', 'src/a.ts')).toBe(true)
  })
})
