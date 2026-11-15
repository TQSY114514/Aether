import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const {
  runScript,
  authorizeAndExecuteTool,
  buildSanitizedEnv,
  spillLargeOutput,
  INLINE_OUTPUT_CAP,
  MAX_SPILLED_LOG_FILES,
} = require('../electron/tools/scriptRunner')
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
  }, 15000)

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
  }, 15000)

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
  }, 15000)

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
  }, 15000)

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

  it('blocks VM sandbox escape vectors and leaks no host constructors or globals', async () => {
    const res = await runScript({
      code: `
        const outcomes = {};
        const tryEval = (label, fn) => {
          try {
            outcomes[label] = 'ESCAPED:' + String(fn());
          } catch (e) {
            outcomes[label] = 'BLOCKED:' + (e && e.name ? e.name : String(e));
          }
        };

        tryEval('toolsCtor', () => tools.read_file.constructor('return process')());
        tryEval('asyncCtor', () => (async () => {}).constructor('return process')());
        tryEval('globalCtor', () => globalThis.constructor.constructor('return process')());
        tryEval('objCtor', () => ({}).constructor.constructor('return process')());
        tryEval('prepareStack', () => {
          let leaked = null;
          Error.prepareStackTrace = (_err, stack) => {
            leaked = stack.map((s) => typeof s.getFunction === 'function' ? s.getFunction() : null).filter(Boolean);
            return 'ok';
          };
          const err = new Error('probe');
          void err.stack;
          return leaked && leaked.some((f) => String(f).includes('dispatchTool') || String(f).includes('finishRun')) ? 'leaked' : 'safe';
        });

        outcomes.runEnvType = typeof __runEnv;
        outcomes.bridgeType = typeof __bridge;
        outcomes.setTimeoutType = typeof setTimeout;
        outcomes.urlType = typeof URL;
        outcomes.frozenNested = Object.isFrozen(inputs.nested);
        return outcomes;
      `,
      inputs: { nested: { secret: 'unchanged' } },
      ctx: { agentMode: 'act' },
    })

    expect(res.ok).toBe(true)
    expect(res.value.toolsCtor).toMatch(/^BLOCKED:/)
    expect(res.value.asyncCtor).toMatch(/^BLOCKED:/)
    expect(res.value.globalCtor).toMatch(/^BLOCKED:/)
    expect(res.value.objCtor).toMatch(/^BLOCKED:/)
    expect(res.value.prepareStack).toBe('ESCAPED:safe')
    expect(res.value.runEnvType).toBe('undefined')
    expect(res.value.bridgeType).toBe('undefined')
    expect(res.value.setTimeoutType).toBe('undefined')
    expect(res.value.urlType).toBe('undefined')
    expect(res.value.frozenNested).toBe(true)
  })

  it('cancels pending permission prompt and aborts in-flight nested tool on timeout/abort', async () => {
    let executedAfterAbort = false
    let permissionSignal = null
    let resolvePermission = null
    const permAbortCtrl = new AbortController()

    const abortRun = await runScript({
      code: `await tools.fake_dangerous({ target: 'x' }); return 'done';`,
      timeoutMs: 15000,
      getTool: () => ({
        name: 'fake_dangerous',
        risk: 'dangerous',
        run: async () => {
          executedAfterAbort = true
          return 'should-never-run'
        },
      }),
      checkToolAllowed: () => ({ allowed: true, requiresPrompt: true, reason: 'confirm' }),
      ctx: {
        agentMode: 'ask',
        signal: permAbortCtrl.signal,
        requestPermission: (req) => new Promise((resolve) => {
          permissionSignal = req.signal
          resolvePermission = resolve
          setTimeout(() => permAbortCtrl.abort(), 50)
        }),
      },
    })

    expect(abortRun.ok).toBe(false)
    expect(abortRun.error).toMatch(/aborted/i)
    expect(permissionSignal?.aborted).toBe(true)
    // Even if UI resolves late after abort, tool.run must never execute
    resolvePermission?.(true)
    await new Promise((r) => setTimeout(r, 30))
    expect(executedAfterAbort).toBe(false)

    // Also verify external AbortController aborts an in-flight signal-aware tool
    const ctrl = new AbortController()
    let nestedAborted = false
    const aborted = await runScript({
      code: `await tools.slow_tool({}); return 'done';`,
      timeoutMs: 15000,
      getTool: () => ({
        name: 'slow_tool',
        risk: 'safe',
        run: (_args, toolCtx) => new Promise((_res, rej) => {
          toolCtx.signal.addEventListener('abort', () => {
            nestedAborted = true
            rej(new Error('aborted'))
          }, { once: true })
          setTimeout(() => ctrl.abort(), 50)
        }),
      }),
      ctx: { agentMode: 'act', signal: ctrl.signal },
    })
    expect(aborted.ok).toBe(false)
    expect(aborted.error).toMatch(/aborted/i)
    expect(nestedAborted).toBe(true)
  }, 20000)

  it('fails fast on maxToolCalls even when script catches tool errors in a loop', async () => {
    const t0 = Date.now()
    const res = await runScript({
      code: `
        for (let i = 0; i < 1000; i++) {
          try {
            await tools.echo_tool({ i });
          } catch {}
        }
        return 'finished-loop';
      `,
      timeoutMs: 25000,
      maxToolCalls: 2,
      getTool: () => ({ name: 'echo_tool', risk: 'safe', run: async (a) => String(a.i) }),
      ctx: { agentMode: 'act' },
    })
    const elapsed = Date.now() - t0
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/max_tool_calls/i)
    expect(elapsed).toBeLessThan(15000)
  }, 20000)

  it('enforces feature flags, subagent blocks, disabledTools, boundaryAllowlist, and projectConfig', async () => {
    const mockDbOff = { getSetting: (k) => (k === 'feature_flag.agent.browser' ? 'false' : null) }
    const browserTool = { name: 'agent_browser', risk: 'safe', run: async () => 'ok' }
    const deps = {
      getTool: (name) => (name === 'agent_browser' ? browserTool : { name, risk: 'safe', run: async () => 'ok' }),
      checkToolAllowed: () => ({ allowed: true }),
      applyMiddleware: (t) => t,
    }

    await expect(
      authorizeAndExecuteTool('agent_browser', { action: 'navigate' }, { db: mockDbOff, agentMode: 'act' }, deps)
    ).rejects.toThrow(/feature flag/i)
    await expect(
      authorizeAndExecuteTool('agent_browser', { action: 'close' }, { db: mockDbOff, agentMode: 'act' }, deps)
    ).resolves.toBe('ok')

    await expect(
      authorizeAndExecuteTool('dispatch_subagent', {}, { agentMode: 'act' }, deps)
    ).rejects.toThrow(/cannot be called/i)
    await expect(
      authorizeAndExecuteTool('spawn_subagent', {}, { agentMode: 'act' }, deps)
    ).rejects.toThrow(/cannot be called/i)

    await expect(
      authorizeAndExecuteTool('read_file', {}, { agentMode: 'act', disabledTools: ['read_file'] }, deps)
    ).rejects.toThrow(/disabled/i)

    await expect(
      authorizeAndExecuteTool('grep_search', {}, { agentMode: 'act', allowedTools: new Set(['read_file']) }, deps)
    ).rejects.toThrow(/not permitted/i)

    fs.mkdirSync(path.join(tmpDir, '.aether'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, '.aether', 'config.json'),
      JSON.stringify({ tools: { deny: ['read_file'] } }),
      'utf8'
    )
    await expect(
      authorizeAndExecuteTool('read_file', {}, { agentMode: 'act', workspaceRoot: tmpDir }, deps)
    ).rejects.toThrow(/deny list|\.aether\/config\.json/i)
  })

  it('spills outputs over 8000 chars and bounds spilled log files in tmpdir', () => {
    expect(INLINE_OUTPUT_CAP).toBe(8000)
    const created = []
    try {
      for (let i = 0; i < MAX_SPILLED_LOG_FILES + 5; i++) {
        const out = spillLargeOutput('x'.repeat(INLINE_OUTPUT_CAP + 50))
        expect(out.spilledPath).toBeTruthy()
        created.push(out.spilledPath)
      }
      const remaining = fs
        .readdirSync(os.tmpdir())
        .filter((f) => /^aether-script-\d+-[0-9a-f]+\.log$/.test(f))
      expect(remaining.length).toBeLessThanOrEqual(MAX_SPILLED_LOG_FILES)
    } finally {
      for (const p of created) {
        try { fs.unlinkSync(p) } catch {}
      }
    }
  })

  it('captures checkpoints for mutating nested tools before execution', async () => {
    const recorded = []
    const deps = {
      getTool: () => ({ name: 'write_file', risk: 'safe', run: async () => 'written' }),
      checkToolAllowed: () => ({ allowed: true }),
      applyMiddleware: (t) => t,
      createCheckpoint: (payload) => {
        recorded.push(payload)
        return 1
      },
    }

    const res = await authorizeAndExecuteTool(
      'write_file',
      { path: 'note.txt', content: 'hi' },
      { agentMode: 'act', sessionId: 's1', messageId: 'm1', turnId: 't1', workspaceRoot: tmpDir },
      deps
    )
    expect(res).toBe('written')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      sessionId: 's1',
      messageId: 'm1',
      turnId: 't1',
      workspaceRoot: tmpDir,
      toolName: 'write_file',
    })
  })
})
