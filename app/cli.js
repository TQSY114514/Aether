#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// AetherAI — headless CLI.
//
// Task 3.1: thin CLI layer over the Electron-free agent core. Lets the agent
// run in CI/CD, SSH sessions, and scripts without an Electron window.
//
// Usage:
//   node cli.js "list files" --model deepseek
//   node cli.js "fix the failing test" --model deepseek --json
//   node cli.js --list-models
//   node cli.js --help
//   node cli.js "read README.md" --api-key sk-... --api-url https://api.example.com
// ───────────────────────────────────────────────────────────────────────────

const path = require('path')
const agent = require('./electron/llm/agentCore')
// CLI 的 task 派发桥：直接加载 TaskEngine（Electron-free —— 引擎全部依赖
// 已 DI：db 由 openDatabase + taskDbAdapter 提供，getWebContents 为 null 时
// 权限弹窗走 CLI 兜底）。加载失败时降级为"不支持任务派生"。
let taskEngine = null
try { taskEngine = require('./electron/llm/backgroundTasks') } catch { taskEngine = null }
// bare better-sqlite3 连接 → database.js 同款业务 API（TaskEngine 需要的
// createSession/addMessage/createAgentTask/... 十个方法）。
const { taskDbAdapter } = require('./electron/llm/taskDbAdapter')

const HELP = `AetherAI headless agent

Usage:
  aether <prompt> [options]

Options:
  --model <name>          Model name (or "provider/model"). Defaults to primary.
  --provider <name>       Restrict lookup to a provider by name.
  --api-key <key>         Override the provider API key (else read from DB).
  --api-url <url>         Override the provider base URL (else read from DB).
  --api-format <fmt>      Provider format: openai | anthropic (default openai).
  --mode <mode>           Agent permission mode: auto | plan | ask (default auto).
  --workspace <dir>       Working directory for tools (default: process.cwd()).
  --max-iterations <n>    Cap the number of tool-loop iterations.
  --json                  Emit machine-readable JSON on stdout.
  --json-lines            Stream NDJSON events line-by-line (status/plan/tool/text/done).
  --task                  Derive a task into the desktop TaskEngine instead of
                          running inline: returns { taskId, sessionId } and exits.
                          The task shows up in the app's task panel and survives
                          restarts (agent_task persistence).
  --list-models           List available models and exit.
  --list-providers        List configured providers and exit.
  --db <path>             Path to aetherai.db (default: userData/aetherai.db).
  --help, -h              Show this help.

Examples:
  aether "list files" --model deepseek
  aether "list files" --model deepseek --json
  aether "create a build script" --model deepseek-v4-pro --mode auto
  aether "refactor the loader" --task --model deepseek --priority 5
`

// Minimal argv parser: handles --flag value and --flag=value forms.
function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { opts.help = true; continue }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq !== -1) {
        opts[arg.slice(2, eq)] = arg.slice(eq + 1)
        continue
      }
      const key = arg.slice(2)
      // Flags that take no value.
      if (['json', 'json-lines', 'list-models', 'list-providers', 'task'].includes(key)) { opts[key] = true; continue }
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++ }
      else { opts[key] = true }
      continue
    }
    opts._.push(arg)
  }
  return opts
}

// ─── Task 派生模式（--task）───────────────────────────────────────────────
// 让 CLI 派生的任务进入桌面的 TaskEngine（agent_task 表持久化）：
//   aether "重构工具注册表" --task --model deepseek
// 输出 { taskId, sessionId }，任务在桌面 TaskPanel 可见、可暂停/恢复、重启可恢复。
// 进度不在此模式输出（任务异步执行）；用 --json-lines 的普通模式拿实时流。
async function runTaskMode(opts) {
  if (!taskEngine) {
    console.error('error: task engine unavailable in this build')
    return 1
  }
  const content = opts._.join(' ')
  if (!content) {
    console.error('error: --task requires a prompt. Usage: aether "<prompt>" --task --model <name>')
    return 1
  }

  const db = agent.openDatabase(opts.db)
  if (!db) {
    console.error('error: no database found (run the desktop app once, or pass --db <path>).')
    return 1
  }

  // 解析模型（与普通模式同一套 resolver）
  const resolved = agent.resolveProviderModel(db, { providerName: opts.provider, modelName: opts.model })
  if (!resolved) {
    console.error(`error: no enabled model found. Configure one in the app or run --list-models / --list-providers.`)
    return 1
  }

  // 引擎需要 db 提供 getModel/getProvider/getSetting 等（database.js 的 API）。
  // CLI 没有 Electron 的 WebContents：权限弹窗兜底为空（工具将自动拒绝高危操作）。
  taskEngine.initBackgroundTasks({ getWebContents: () => null, db: taskDbAdapter(db), runToolLoop: undefined })

  try {
    const r = await taskEngine.startTask({
      db: taskDbAdapter(db),
      parentSessionId: null,
      content,
      modelId: resolved.model.id,
      agentMode: opts.mode || 'ask',
      emit: () => {},
    })
    if (opts.json || opts['json-lines']) {
      console.log(JSON.stringify({ type: 'task:derived', taskId: r.taskId, sessionId: r.sessionId }))
    } else {
      console.log(`task derived: #${r.taskId} (session ${r.sessionId})`)
    }
    return 0
  } catch (e) {
    console.error(`error: failed to derive task: ${e.message || String(e)}`)
    return 1
  }
}

// ─── TUI 子命令（aether tui）───────────────────────────────────────────────
// 动态 import TUI 入口（ESM），不阻塞既有 -p/--json/--json-lines/--task 路径。
// 非 TTY 且无 --smoke 时提前报错退出 1；--smoke 冒烟开关由 tui/index.mjs 处理。
async function runTuiMode(argv) {
  if (!process.stdin.isTTY && !argv.includes('--smoke')) {
    console.error('error: aether tui requires a TTY. Use `aether tui --smoke` for a headless smoke.')
    return 1
  }
  try {
    const tui = await import('./tui/index.mjs')
    const code = await tui.main(argv)
    return typeof code === 'number' ? code : 0
  } catch (err) {
    console.error(`error: failed to start TUI: ${err && err.message ? err.message : String(err)}`)
    return 1
  }
}

function main() {
  const argv = process.argv.slice(2)
  // `aether tui` 子命令早退分支（放在 argv 分发最前；其余路径字节不动）。
  if (argv[0] === 'tui') return runTuiMode(argv)
  const opts = parseArgs(argv)

  if (opts.help) { console.log(HELP); return 0 }

  const db = agent.openDatabase(opts.db)

  if (opts['list-providers']) {
    const rows = agent.listProviders(db)
    if (opts.json) { console.log(JSON.stringify(rows, null, 2)); return 0 }
    for (const r of rows) console.log(`${r.id}\t${r.name}\t${r.api_format}\t${r.api_url}`)
    return 0
  }

  if (opts['list-models']) {
    const rows = agent.listModels(db)
    if (opts.json) { console.log(JSON.stringify(rows, null, 2)); return 0 }
    for (const r of rows) console.log(`${r.id}\t${r.model_name}\t(${r.provider_name})${r.is_primary ? '\t*' : ''}`)
    return 0
  }

  if (opts.task) return runTaskMode(opts)

  const prompt = opts._.join(' ')
  if (!prompt) {
    console.error('error: no prompt given. Use --help for usage.')
    return 1
  }

  // Resolve provider + model from the DB, unless overridden on the command line.
  let resolved = agent.resolveProviderModel(db, { providerName: opts.provider, modelName: opts.model })
  if (!resolved) {
    console.error(`error: no enabled model found. Configure one in the app or run --list-models / --list-providers.`)
    return 1
  }

  const provider = {
    ...resolved.provider,
    api_key: opts['api-key'] || resolved.provider.api_key,
    api_url: opts['api-url'] || resolved.provider.api_url,
    api_format: opts['api-format'] || resolved.provider.api_format || 'openai',
  }
  const model = resolved.model

  // The stored key may be safeStorage-encrypted (pure base64, not decryptable
  // in headless Node). Fail fast with a clear hint instead of sending the
  // ciphertext as the API key and getting a confusing 401.
  if (!opts['api-key'] && provider.api_key && agent.isEncryptedKey(provider.api_key)) {
    console.error(
      'error: the stored API key for provider "' + provider.name + '" is encrypted with the desktop app (safeStorage).\n' +
      'Headless mode cannot decrypt it. Pass --api-key <plaintext> to use this provider.'
    )
    return 1
  }

  const maxIterations = opts['max-iterations'] ? parseInt(opts['max-iterations'], 10) : undefined
  const workspace = opts.workspace ? path.resolve(opts.workspace) : process.cwd()

  const toolEntries = []
  const statuses = []
  const jsonLines = !!opts['json-lines']
  const emit = (obj) => { if (jsonLines) console.log(JSON.stringify(obj)) }

  const run = async () => {
    const result = await agent.runAgent({
      prompt,
      provider,
      model,
      workspace,
      agentMode: opts.mode || 'auto',
      maxIterations,
      onToolCall: (entry) => {
        toolEntries.push(entry)
        const isStart = entry.result == null && entry.error == null && entry.startedAt != null
        emit({
          type: isStart ? 'tool:start' : 'tool:end',
          entry: { name: entry.name, args: entry.args, result: entry.result, error: entry.error, risk: entry.risk, latencyMs: entry.latencyMs, startedAt: entry.startedAt || null },
        })
      },
      onStatus: (s) => { statuses.push(s); emit({ type: 'status', kind: s.kind || 'step', text: s.text }) },
      onPlanStep: (step) => emit({ type: 'plan', step }),
      onText: (chunk) => emit({ type: 'text', delta: chunk.text, done: !!chunk.done }),
    })

    if (jsonLines) {
      emit({ type: 'done', text: result.text, toolCalls: toolEntries })
      return 0
    }

    if (opts.json) {
      const out = {
        model: model.model_name,
        provider: provider.name,
        text: result.text,
        toolCalls: toolEntries,
        statuses,
      }
      console.log(JSON.stringify(out, null, 2))
    } else {
      console.log(result.text)
    }
    return 0
  }

  // Execute and propagate errors; use a non-zero exit for failure.
  run().then((code) => {
    process.exitCode = code
  }).catch((err) => {
    const msg = err && err.message ? err.message : String(err)
    if (opts['json-lines']) console.log(JSON.stringify({ type: 'error', message: msg }))
    else if (opts.json) console.log(JSON.stringify({ error: msg }, null, 2))
    else     console.error(`error: ${msg}`)
    process.exitCode = 1
  })
}

// main() returns a numeric exit code for synchronous error paths (bad args,
// missing model, encrypted key); the async run()/runTaskMode() paths set
// process.exitCode themselves when they settle.
const mainCode = main()
if (mainCode && typeof mainCode.then === 'function') {
  mainCode.then((code) => { process.exitCode = typeof code === 'number' ? code : 0 })
    .catch((err) => { console.error(`error: ${err && err.message ? err.message : String(err)}`); process.exitCode = 1 })
} else if (typeof mainCode === 'number') {
  process.exitCode = mainCode
}