import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { runScript, buildSanitizedEnv } = require('../electron/tools/scriptRunner')
const { getTool, toolsPayload } = require('../electron/tools/registry')
const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-runner-test-'))
})

afterEach(() => {
  clearSessionWorkspaces('script-test-sess')
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('scriptRunner isolated batch execution', () => {
  it('batches safe tool calls in an isolated VM child process and returns value + trace', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'alpha-111', 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'beta-222', 'utf8')
    setWorkspaceRootForSession('script-test-sess', tmpDir)

    const permCalls = []
    const res = await runScript({
      code: `
        const results = [];
        for (const name of inputs.files) {
          const content = await tools.read_file({ path: inputs.dir + '/' + name });
          results.push(name + ':' + content);
        }
        console.log('batch done', results.length);
        return results;
      `,
      inputs: { dir: tmpDir, files: ['a.txt', 'b.txt'] },
      ctx: {
        sessionId: 'script-test-sess',
        agentMode: 'ask',
        workspaceRoot: tmpDir,
        requestPermission: async (req) => { permCalls.push(req); return true },
      },
    })

    expect(res.ok).toBe(true)
    expect(Array.isArray(res.value)).toBe(true)
    expect(res.value[0]).toContain('alpha-111')
    expect(res.value[1]).toContain('beta-222')
    expect(res.trace).toHaveLength(2)
    expect(res.logs).toContain('batch done 2')
    // Safe read_file calls inside `ask` mode must NOT prompt for permission
    expect(permCalls).toHaveLength(0)
  })

  it('blocks access to require, process, eval, and Function constructor inside sandbox', async () => {
    const r1 = await runScript({
      code: `return typeof require + ':' + typeof process;`,
      ctx: { agentMode: 'act' },
    })
    expect(r1.ok).toBe(true)
    expect(r1.value).toBe('undefined:undefined')

    const r2 = await runScript({
      code: `const fn = Function('return 1+1'); return fn();`,
      ctx: { agentMode: 'act' },
    })
    expect(r2.ok).toBe(false)
    expect(r2.error).toMatch(/Code generation from strings disallowed|EvalError/i)
  })

  it('strips secrets and env noise in buildSanitizedEnv()', () => {
    const prevKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-secret-must-not-leak'
    try {
      const env = buildSanitizedEnv()
      expect(env.OPENAI_API_KEY).toBeUndefined()
      expect(env.TEMP).toBeTruthy()
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prevKey
    }
  })

  it('blocks mutating tools in plan/review mode while permitting safe reads', async () => {
    const targetFile = path.join(tmpDir, 'note.txt')
    fs.writeFileSync(targetFile, 'initial', 'utf8')
    setWorkspaceRootForSession('script-test-sess', tmpDir)

    const res = await runScript({
      code: `
        const data = await tools.read_file({ path: inputs.target });
        try {
          await tools.write_file({ path: inputs.target, content: 'hacked' });
          return { unexpected: true };
        } catch (err) {
          return { readOk: data.includes('initial'), writeBlocked: String(err.message) };
        }
      `,
      inputs: { target: targetFile },
      ctx: { sessionId: 'script-test-sess', agentMode: 'plan', workspaceRoot: tmpDir },
    })

    expect(res.ok).toBe(true)
    expect(res.value.readOk).toBe(true)
    expect(res.value.writeBlocked).toMatch(/blocked in plan/i)
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('initial')
  })

  it('prompts requestPermission in ask mode only for dangerous nested tools', async () => {
    const targetFile = path.join(tmpDir, 'out.txt')
    setWorkspaceRootForSession('script-test-sess', tmpDir)

    const prompted = []
    const res = await runScript({
      code: `
        await tools.write_file({ path: inputs.target, content: 'hello-ask' });
        return await tools.read_file({ path: inputs.target });
      `,
      inputs: { target: targetFile },
      ctx: {
        sessionId: 'script-test-sess',
        agentMode: 'ask',
        workspaceRoot: tmpDir,
        requestPermission: async (req) => {
          prompted.push(req.name)
          return true
        },
      },
    })

    expect(res.ok).toBe(true)
    expect(prompted).toEqual(['write_file'])
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('hello-ask')
  })

  it('rejects nested run_script and enforces maxToolCalls cap + timeout kill', async () => {
    const nested = await runScript({
      code: `
        try {
          await tools.run_script({ code: 'return 1' });
          return 'unexpected';
        } catch (e) {
          return e.message;
        }
      `,
      ctx: { agentMode: 'act' },
    })
    expect(nested.ok).toBe(true)
    expect(nested.value).toMatch(/cannot be called/i)

    const capped = await runScript({
      code: `
        for (let i = 0; i < 5; i++) {
          await tools.list_dir({ path: inputs.dir });
        }
        return 'done';
      `,
      inputs: { dir: tmpDir },
      maxToolCalls: 2,
      ctx: { sessionId: 'script-test-sess', agentMode: 'act', workspaceRoot: tmpDir },
    })
    expect(capped.ok).toBe(false)
    expect(capped.error).toMatch(/max_tool_calls/i)

    const timedOut = await runScript({
      code: `while (true) {}`,
      timeoutMs: 1000,
      ctx: { agentMode: 'act' },
    })
    expect(timedOut.ok).toBe(false)
    expect(timedOut.error).toMatch(/timed out/i)
  })

  it('registers run_script as dangerous and gates visibility behind agent.script flag', () => {
    const tool = getTool('run_script')
    expect(tool).toBeTruthy()
    expect(tool.risk).toBe('dangerous')

    // Default flag (false): hidden from toolsPayload
    const defaultNames = toolsPayload('act').map(t => t.function.name)
    expect(defaultNames).not.toContain('run_script')

    // Explicit flag enabled: visible in act, filtered out in plan (since dangerous)
    const mockDbOn = {
      getSetting: (k) => (k === 'feature_flag.agent.script' ? '1' : null),
    }
    const actEnabled = toolsPayload('act', { db: mockDbOn }).map(t => t.function.name)
    expect(actEnabled).toContain('run_script')
    const planEnabled = toolsPayload('plan', { db: mockDbOn }).map(t => t.function.name)
    expect(planEnabled).not.toContain('run_script')
  })
})
