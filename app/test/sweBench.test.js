import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Module from 'module'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const origLoad = Module._load
let handlers = {}
const fakeIpcMain = {
  handle: (ch, fn) => { handlers[ch] = fn },
  on: () => {},
}

let mockAnswer = 'const x = 42;'
let updatedBenchmarkResults = null

const db = {
  listArenaBenchmarks: () => [
    {
      id: 1,
      name: 'Personal SWE-bench',
      tasks: [
        {
          name: 'Task with passing test',
          prompt: 'Fix test A',
          verifyCommand: 'node -e "process.exit(0)"',
          expectedExitCode: 0,
        },
        {
          name: 'Task with failing test',
          prompt: 'Fix test B',
          verifyCommand: 'node -e "process.exit(1)"',
          expectedExitCode: 0,
        },
        {
          name: 'Task with custom exit code',
          prompt: 'Fix test C',
          verifyCommand: 'node -e "process.exit(42)"',
          expectedExitCode: 42,
        },
        {
          name: 'Task without verify command',
          prompt: 'Write an essay',
        },
      ],
      model_ids: [10],
    },
  ],
  getAllModels: () => [
    { id: 10, provider_id: 1, provider_name: 'MockProvider', model_name: 'test-model', api_url: 'http://mock', api_key: 'mock-key', api_format: 'openai' },
  ],
  updateArenaBenchmarkResults: (id, results, lastRun) => {
    updatedBenchmarkResults = { id, results, lastRun }
  },
}

let runVerifyCommand, sanitizeVerifyCommand, resolveTaskCwd

beforeAll(() => {
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename && parent.filename.includes('arena.handler.js')) {
      const stub = {
        '../llm/providerAdapter': {
          completeChatMessage: async ({ signal }) => {
            if (signal?.aborted) {
              const err = new Error('aborted')
              err.name = 'AbortError'
              throw err
            }
            return {
              content: mockAnswer,
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            }
          },
          normalizeUsage: (u) => u,
        },
        '../utils/cost': { computeCost: () => 0.001 },
        '../logger': { warn: () => {}, debug: () => {}, info: () => {} },
      }
      if (request in stub) return stub[request]
    }
    return origLoad.apply(this, arguments)
  }

  const arenaHandler = require(path.join(__dirname, '../electron/ipc/arena.handler'))
  arenaHandler.registerArenaHandlers(fakeIpcMain, db)
  runVerifyCommand = arenaHandler.runVerifyCommand
  sanitizeVerifyCommand = arenaHandler.sanitizeVerifyCommand
  resolveTaskCwd = arenaHandler.resolveTaskCwd
})

afterAll(() => {
  Module._load = origLoad
})

describe('Personal SWE-bench Benchmark Suite (P1-09)', () => {
  describe('runVerifyCommand & security helpers', () => {
    it('executes verify commands and checks expected exit codes', async () => {
      const pass = await runVerifyCommand('node -e "process.exit(0)"', process.cwd())
      expect(pass).toBe(true)

      const fail = await runVerifyCommand('node -e "process.exit(1)"', process.cwd())
      expect(fail).toBe(false)

      const customExpected = await runVerifyCommand('node -e "process.exit(42)"', process.cwd(), null, 42)
      expect(customExpected).toBe(true)
    })

    it('handles aborted signals cleanly', async () => {
      const controller = new AbortController()
      controller.abort()
      const abortedPass = await runVerifyCommand('node -e "process.exit(0)"', process.cwd(), controller.signal)
      expect(abortedPass).toBe(false)
    })

    it('sanitizes verify commands safely', () => {
      expect(sanitizeVerifyCommand('npx vitest run')).toBe('npx vitest run')
      expect(sanitizeVerifyCommand('  npm test  ')).toBe('npm test')
      expect(sanitizeVerifyCommand(null)).toBeNull()
      expect(sanitizeVerifyCommand('cmd\0evil')).toBeNull()
      expect(sanitizeVerifyCommand('a'.repeat(1001))).toBeNull()
    })

    it('constrains task cwd within sandbox root', () => {
      const root = path.resolve('/tmp/aether-sandbox')
      expect(resolveTaskCwd(null, root)).toBe(root)
      expect(resolveTaskCwd('../../outside', root)).toBe(root)
      expect(resolveTaskCwd('src/tests', root)).toBe(path.resolve(root, 'src/tests'))
    })
  })

  describe('arena:benchmark-run handler integration', () => {
    it('exercises benchmark-run handler and validates verified metrics', async () => {
      updatedBenchmarkResults = null
      const runRes = await handlers['arena:benchmark-run']({}, { id: 1, modelIds: [10] })

      expect(runRes).toBeDefined()
      expect(runRes.models[10]).toBeDefined()
      expect(runRes.models[10].model_name).toBe('test-model')

      const stats = runRes.results[10]
      expect(stats.runs).toBe(4)
      // Task 1: ok + verified pass
      // Task 2: fail + verified run
      // Task 3: ok (exit 42) + verified pass
      // Task 4: ok (no verifyCommand)
      expect(stats.wins).toBe(3)
      expect(stats.verified_runs).toBe(3)
      expect(stats.verified_passes).toBe(2)

      const passRate = (stats.verified_passes / stats.verified_runs) * 100
      expect(Math.round(passRate)).toBe(67)

      // Verify persistence was called
      expect(updatedBenchmarkResults).not.toBeNull()
      expect(updatedBenchmarkResults.id).toBe(1)
      expect(updatedBenchmarkResults.results[10]).toEqual(stats)
    })

    it('provides SWE-bench core templates via arena:benchmark-templates', async () => {
      const templates = await handlers['arena:benchmark-templates']()
      expect(Array.isArray(templates)).toBe(true)
      const sweTemplate = templates.find(t => t.id === 'swe-bench-core')
      expect(sweTemplate).toBeDefined()
      expect(sweTemplate.tasks.length).toBeGreaterThanOrEqual(1)
      expect(sweTemplate.tasks[0].verifyCommand).toBeDefined()
    })
  })
})
