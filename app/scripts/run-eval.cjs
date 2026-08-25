#!/usr/bin/env node
// Public coding eval runner — headless, Electron-free, dependency-free.
//
// Runs every task in a suite through the real agent loop (tools included,
// yolo mode inside an isolated temp workspace) against one or more models,
// then verifies the outcome by executing the task's check command.
//
// Usage:
//   node app/scripts/run-eval.cjs \
//     --base-url https://api.example.com/v1 \
//     --api-key sk-...            # or env AETHER_EVAL_API_KEY \
//     --model gpt-4o --model deepseek-chat \
//     [--api-format openai] [--suite evals/coding/suite.js] \
//     [--out results.json] [--timeout-ms 120000] [--max-iterations 12]
//
// Exit codes: 0 all checks passed · 1 some failed/errored · 2 bad invocation.

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const { runAgent } = require(path.join(ROOT, 'app', 'electron', 'llm', 'agentCore.js'))

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

function writeFixtures(dir, fixtures) {
  for (const f of fixtures || []) {
    const target = path.join(dir, f.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, f.content, 'utf8')
  }
}

async function runOne(modelName, task, cfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aether-eval-${task.id}-`))
  writeFixtures(dir, task.fixtures)
  const started = Date.now()
  let agentError = null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), cfg['timeout-ms'])
    try {
      await runAgent({
        prompt: task.prompt,
        provider: { name: 'eval', api_url: cfg['base-url'], api_key: cfg['api-key'], api_format: cfg['api-format'] },
        model: { model_name: modelName },
        agentMode: 'yolo', // isolated temp workspace; prompts would stall a headless run
        maxIterations: cfg['max-iterations'],
        workspace: dir,
        injectMemory: false,
        signal: ctrl.signal,
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

  const ok = !agentError && check.status === 0
  return {
    model: modelName,
    taskId: task.id,
    ok,
    durationMs,
    checkExitCode: agentError ? null : check.status,
    checkOutputTail: tail,
    error: agentError,
    workspace: dir,
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

  const suitePath = cfg.suite
    ? path.resolve(ROOT, cfg.suite)
    : path.join(ROOT, 'evals', 'coding', 'suite.js')
  const tasks = require(suitePath)

  const results = []
  for (const modelName of cfg.models) {
    console.log(`\n=== ${modelName} ===`)
    for (const task of tasks) {
      process.stdout.write(`  ${task.id} ... `)
      let r
      try {
        r = await runOne(modelName, task, cfg)
      } catch (e) {
        r = { model: modelName, taskId: task.id, ok: false, error: e && e.message, durationMs: 0 }
      }
      console.log(r.ok ? 'PASS' : `FAIL${r.error ? ` (${r.error})` : ''}`)
      results.push(r)
    }
  }

  const summary = {}
  for (const r of results) {
    const s = (summary[r.model] ||= { passed: 0, total: 0, totalDurationMs: 0 })
    s.total++
    s.totalDurationMs += r.durationMs
    if (r.ok) s.passed++
  }
  for (const s of Object.values(summary)) s.avgDurationMs = Math.round(s.totalDurationMs / s.total)

  console.log('\n── summary ──')
  for (const [m, s] of Object.entries(summary)) {
    console.log(`${m}: ${s.passed}/${s.total} passed, avg ${s.avgDurationMs}ms`)
  }

  if (cfg.out) {
    const outPath = path.resolve(ROOT, cfg.out)
    const report = { generatedAt: new Date().toISOString(), suite: suitePath, summary, results }
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`results written to ${outPath}`)
  }

  process.exit(results.every((r) => r.ok) ? 0 : 1)
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
})
