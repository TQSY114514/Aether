#!/usr/bin/env node
// Router comparison harness — measures the impact of staged tool routing.
//
// Runs the coding suite twice per model, identical except for the
// `agent.toolRouter.staged` feature flag (off / on), and reports per-mode
// pass rate, token totals, wall time, and how many times the stage router
// re-injected tools mid-loop. This turns "the flag exists" into "here is
// what it buys" (docs/competitive-analysis.md suggestion 3: make
// reliability work measurable).
//
// Usage:
//   node evals/coding/router-compare.cjs \
//     --base-url https://api.example.com/v1 \
//     --api-key sk-...            # or env AETHER_EVAL_API_KEY \
//     --model deepseek-chat [--model ...] \
//     [--api-format openai] [--suite evals/coding/suite.js] \
//     [--out compare.json] [--timeout-ms 120000] [--max-iterations 12]
//
// Each mode gets its own throwaway SQLite DB so flag state never leaks
// between runs; task workspaces are fresh temp dirs exactly like run-eval.
//
// Exit codes: 0 comparison completed · 1 harness crashed · 2 bad invocation.

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const { runAgent } = require(path.join(ROOT, 'app', 'electron', 'llm', 'agentCore.js'))
const database = require(path.join(ROOT, 'app', 'electron', 'database.js'))

const STAGED_FLAG = 'feature_flag.agent.toolRouter.staged'

function parseArgs(argv) {
  const out = { models: [], 'timeout-ms': 120000, 'max-iterations': 12, 'api-format': 'openai' }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const next = () => {
      i++
      if (i >= argv.length) throw new Error(`missing value for ${k}`)
      return argv[i]
    }
    switch (k) {
      case '--base-url': out['base-url'] = next(); break
      case '--api-key': out['api-key'] = next(); break
      case '--api-format': out['api-format'] = next(); break
      case '--model': out.models.push(next()); break
      case '--suite': out.suite = next(); break
      case '--out': out.out = next(); break
      case '--timeout-ms': out['timeout-ms'] = Number(next()); break
      case '--max-iterations': out['max-iterations'] = Number(next()); break
      case '--help': case '-h': out.help = true; break
      default: throw new Error(`unknown argument: ${k}`)
    }
  }
  return out
}

// Minimal db adapter over a raw better-sqlite3 handle: toolLoop/featureFlags
// talk to db.getSetting/db.setSetting, which live on the database module
// (bound to its module-level handle), not on the raw Database instance.
function makeDbAdapter(dbPath) {
  const handle = database.createEmptyDatabase(dbPath)
  const getStmt = () => handle.prepare('SELECT value FROM settings WHERE key = ?')
  return {
    prepare: (...args) => handle.prepare(...args),
    getSetting(key) {
      try {
        const row = getStmt().get(String(key))
        return row ? row.value : null
      } catch {
        return null
      }
    },
    setSetting(key, value) {
      handle.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(String(key), String(value))
    },
    close() {
      try { handle.close() } catch { /* already closed */ }
    },
  }
}

function writeFixtures(dir, fixtures) {
  const base = path.resolve(dir)
  for (const f of fixtures || []) {
    // Guard against suite-declared paths escaping the temp workspace (path traversal).
    const target = path.resolve(base, f.path)
    const relative = path.relative(base, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`fixture path escapes workspace: ${f.path}`)
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, f.content, 'utf8')
  }
}

async function runOne(mode, adapter, modelName, task, cfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aether-rcmp-${mode}-${task.id}-`))
  writeFixtures(dir, task.fixtures)
  const started = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  let routerEvents = 0
  let lastRouterNote = ''
  let agentError = null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), cfg['timeout-ms'])
    try {
      await runAgent({
        prompt: task.prompt,
        provider: { name: 'eval', api_url: cfg['base-url'], api_key: cfg['api-key'], api_format: cfg['api-format'] },
        model: { model_name: modelName },
        agentMode: 'yolo',
        maxIterations: cfg['max-iterations'],
        workspace: dir,
        injectMemory: false,
        signal: ctrl.signal,
        db: adapter,
        onStatus: (s) => {
          if (s && s.kind === 'tool_router') {
            routerEvents++
            lastRouterNote = String(s.text || '')
          }
        },
        onUsage: (u) => {
          if (!u) return
          // toolLoop's accumulator uses {input,output}; accept token-style keys too.
          inputTokens = Number(u.input ?? u.input_tokens ?? inputTokens) || inputTokens
          outputTokens = Number(u.output ?? u.output_tokens ?? outputTokens) || outputTokens
        },
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    agentError = e ? `${e.message}` : 'agent crashed'
  }
  const durationMs = Date.now() - started

  const check = spawnSync(task.check.command, task.check.args, {
    cwd: dir,
    encoding: 'utf8',
    timeout: Math.min(cfg['timeout-ms'], 30000),
  })
  const stdout = `${check.stdout || ''}${check.stderr || ''}`.trim()
  const tail = stdout.length > 400 ? stdout.slice(-400) : stdout

  return {
    mode,
    model: modelName,
    taskId: task.id,
    ok: !agentError && check.status === 0,
    durationMs,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    routerEvents,
    lastRouterNote,
    checkExitCode: agentError ? null : check.status,
    checkOutputTail: tail,
    error: agentError,
    workspace: dir,
  }
}

function aggregate(results) {
  const summary = {}
  for (const r of results) {
    const key = `${r.mode}|${r.model}`
    const s = (summary[key] ||= {
      mode: r.mode, model: r.model, passed: 0, total: 0,
      totalDurationMs: 0, inputTokens: 0, outputTokens: 0, routerEvents: 0,
    })
    s.total++
    s.totalDurationMs += r.durationMs
    s.inputTokens += r.inputTokens
    s.outputTokens += r.outputTokens
    s.routerEvents += r.routerEvents
    if (r.ok) s.passed++
  }
  for (const s of Object.values(summary)) s.avgDurationMs = Math.round(s.totalDurationMs / Math.max(s.total, 1))
  for (const s of Object.values(summary)) s.totalTokens = s.inputTokens + s.outputTokens
  return summary
}

function printComparison(summary, models) {
  console.log('\n── staged tool-router comparison (off → on) ──')
  for (const m of models) {
    const off = summary[`off|${m}`]
    const on = summary[`on|${m}`]
    if (!off || !on) continue
    const fmt = (s) =>
      `${s.passed}/${s.total} pass · ${s.totalTokens} tok · ${s.avgDurationMs}ms · ${s.routerEvents} stage-injections`
    console.log(`\n${m}:`)
    console.log(`  off: ${fmt(off)}`)
    console.log(`  on : ${fmt(on)}`)
    const dTok = on.totalTokens - off.totalTokens
    const dMs = on.avgDurationMs - off.avgDurationMs
    console.log(`  Δ  : tokens ${dTok >= 0 ? '+' : ''}${dTok} · avg-time ${dMs >= 0 ? '+' : ''}${dMs}ms · passes ${on.passed - off.passed >= 0 ? '+' : ''}${on.passed - off.passed}`)
  }
}

async function main() {
  let cfg
  try {
    cfg = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  if (cfg.help || !cfg['base-url'] || cfg.models.length === 0) {
    console.error('required: --base-url URL --model NAME [--model ...] [--api-key KEY|env AETHER_EVAL_API_KEY]')
    process.exit(cfg.help ? 0 : 2)
  }
  if (!cfg['api-key']) cfg['api-key'] = process.env.AETHER_EVAL_API_KEY
  if (!cfg['api-key']) {
    console.error('no API key: pass --api-key or set AETHER_EVAL_API_KEY')
    process.exit(2)
  }

  const suitePath = cfg.suite ? path.resolve(ROOT, cfg.suite) : path.join(ROOT, 'evals', 'coding', 'suite.js')
  const tasks = require(suitePath)

  const results = []
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-rcmp-db-'))
  try {
    for (const mode of ['off', 'on']) {
      const adapter = makeDbAdapter(path.join(tmpRoot, `flag-${mode}.db`))
      adapter.setSetting(STAGED_FLAG, mode === 'on' ? '1' : '0')
      console.log(`\n########## staged tool routing: ${mode.toUpperCase()} ##########`)
      try {
        for (const modelName of cfg.models) {
          console.log(`\n=== [${mode}] ${modelName} ===`)
          for (const task of tasks) {
            process.stdout.write(`  ${task.id} ... `)
            let r
            try {
              r = await runOne(mode, adapter, modelName, task, cfg)
            } catch (e) {
              r = { mode, model: modelName, taskId: task.id, ok: false, error: e && e.message, durationMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, routerEvents: 0 }
            }
            console.log(r.ok ? 'PASS' : `FAIL${r.error ? ` (${r.error})` : ''}`)
            results.push(r)
          }
        }
      } finally {
        adapter.close()
      }
    }
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
  }

  const summary = aggregate(results)
  printComparison(summary, cfg.models)

  if (cfg.out) {
    const outPath = path.resolve(ROOT, cfg.out)
    const report = { generatedAt: new Date().toISOString(), suite: suitePath, flag: STAGED_FLAG, modes: ['off', 'on'], summary, results }
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\ncomparison written to ${outPath}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
})
