#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Aether — headless CLI.
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
const fs = require('fs')
const agent = require('./electron/llm/agentCore')
const toolEntry = require('./electron/tools/toolEntry')
// W5-t28/29/30/32: headless CLI 纯逻辑助手（Electron-free、可单测）。
const resumeHelpers = require('./electron/cli/resume')
const completions = require('./electron/cli/completions')
const { loadConfigFile, resolveDefaults, configPath } = require('./electron/cli/config')
const { writeLastMessage } = require('./electron/cli/io')
// CLI 的 task 派发桥：直接加载 TaskEngine（Electron-free —— 引擎全部依赖
// 已 DI：db 由 openDatabase + taskDbAdapter 提供，getWebContents 为 null 时
// 权限弹窗走 CLI 兜底）。加载失败时降级为"不支持任务派生"。
let taskEngine = null
try { taskEngine = require('./electron/llm/backgroundTasks') } catch { taskEngine = null }
// bare better-sqlite3 连接 → database.js 同款业务 API（TaskEngine 需要的
// createSession/addMessage/createAgentTask/... 十个方法）。
const { taskDbAdapter } = require('./electron/llm/taskDbAdapter')

const HELP = `Aether headless agent

Usage:
  aether <prompt> [options]      Single-shot prompt (positional or -p).
  aether recipe list             List available recipes (official + project).
  aether recipe run <id>         Run a curated recipe (e.g. fix-failing-tests).
  aether tui [--smoke]           Interactive terminal UI.
  aether completion <shell>      Print a shell completion script (bash|zsh|powershell).
  aether --mode json "prompt"    NDJSON event stream (like --json-lines).
  aether --mode rpc              JSONL request/result loop over stdin/stdout.
  echo "prompt" | aether         Piped stdin becomes the prompt.

Options:
  --model <name>          Model name (or "provider/model"). Defaults to primary.
  --provider <name>       Restrict lookup to a provider by name.
  --api-key <key>         Override the provider API key (else read from DB).
  --api-url <url>         Override the provider base URL (else read from DB).
  --api-format <fmt>      Provider format: openai | anthropic (default openai).
  --mode <mode>           Agent permission mode: auto | plan | ask | yolo (default auto);
                          or transport mode: json (NDJSON stream) | rpc (JSONL loop).
  -p <prompt>             Explicit single-shot prompt (alternative to positional).
  --stdin                 Read the prompt from stdin (explicit). Also auto-detected
                          when stdin is piped and no prompt is given.
  --workspace <dir>       Working directory for tools (default: process.cwd()).
  --max-iterations <n>    Cap the number of tool-loop iterations.
  --resume                Continue the most recent session (context-only:
                          this run's turns are NOT written back to the DB).
  --session <id>          Continue a specific session by id (context-only).
                          Takes precedence over --resume.
  --fork [<id>]           Fork a session: creates a new session row with
                          parent_session_id = <source> and continues from its
                          context. <id> (when given) is the source directly;
                          otherwise --session or --resume picks the source.
  -o, --output-last-message <file>
                          Write the final answer to <file> (utf8) in addition
                          to stdout. Works with --json / --json-lines too.
  --json                  Emit machine-readable JSON on stdout.
  --json-lines            Stream NDJSON events line-by-line (status/plan/tool/text/done).
  --task                  Derive a task into the desktop TaskEngine instead of
                          running inline: returns { taskId, sessionId } and exits.
                          The task shows up in the app's task panel and survives
                          restarts (agent_task persistence).
  --setup-term            Write the Aether profile into Windows Terminal settings
                          (--term-settings <path> overrides the default location).
  --memory-trace          Report how many memory entries were injected this run.
  --skills                List habit-derived skill proposals as JSON.
  --persona <id>          Load a saved persona (system prompt + memory prefix).
  --list-models           List available models and exit.
  --list-providers        List configured providers and exit.
  --list-recipes          List available recipes and exit.
  --db <path>             Path to aetherai.db (default: userData/aetherai.db).
  --term-settings <path>  Override the Windows Terminal settings path for --setup-term.
  --version               Print the version (aether <semver>) and exit.
  --help, -h              Show this help.

Environment (fallback when the flag is absent; config file below is the next
fallback, then the DB default):
  AETHER_MODEL            Default --model.
  AETHER_MODE             Default --mode (auto|plan|ask|yolo).
  AETHER_WORKSPACE        Default --workspace (relative paths resolve against cwd).
  AETHER_MAX_ITERATIONS   Default --max-iterations.
  AETHER_CONFIG           Override the config file path.

Config file (~/.config/aether/config.json, same convention as the TUI
keybindings.json; unknown keys ignored, malformed JSON warns and falls back):
  { "model": "...", "mode": "auto|plan|ask|yolo", "workspace": "path",
    "maxIterations": number }
Precedence: CLI flag > env > config file > DB default.

Examples:
  aether "list files" --model deepseek
  aether "list files" --model deepseek --json
  aether "create a build script" --model deepseek-v4-pro --mode auto
  aether "refactor the loader" --task --model deepseek --priority 5
  aether "continue this" --resume --model deepseek
  aether "one more turn" --session 42 --json
  aether tui
  echo "summarize README.md" | aether
`

// Minimal argv parser: handles --flag value and --flag=value forms, plus -p.
function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { opts.help = true; continue }
    if (arg === '-p') { opts.p = argv[i + 1]; i++; continue }
    if (arg === '-o') { opts.o = argv[i + 1]; i++; continue }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq !== -1) {
        const eqKey = arg.slice(2, eq)
        opts[eqKey] = arg.slice(eq + 1)
        // W5-t32: `--output-last-message=<file>` eq 形式归一为 opts.o（与 -o 等价）。
        if (eqKey === 'output-last-message') opts.o = opts[eqKey]
        continue
      }
      const key = arg.slice(2)
      // Flags that take no value.
      if (['json', 'json-lines', 'list-models', 'list-providers', 'list-recipes', 'task', 'stdin', 'setup-term', 'memory-trace', 'skills', 'version', 'resume'].includes(key)) { opts[key] = true; continue }
      // --fork takes an OPTIONAL value: `--fork <id>` treats <id> as the source
      // session directly; bare `--fork` takes its source from --session/--resume.
      // Only a pure integer is consumed as a value (session ids are INTEGER PKs),
      // so `--fork <prompt-word>` keeps the word as a positional prompt.
      if (key === 'fork') {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--') && /^\d+$/.test(next)) { opts.fork = next; i++ }
        else { opts.fork = true }
        continue
      }
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++ }
      else { opts[key] = true }
      // W5-t32: `--output-last-message <file>` 长形式归一为 opts.o（-o 行为不变）。
      if (key === 'output-last-message') opts.o = opts[key]
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
  const content = (opts.p !== undefined ? String(opts.p) : opts._.join(' ')).trim()
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
      agentMode: ['auto', 'plan', 'ask', 'yolo'].includes(opts.mode) ? opts.mode : 'ask',
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
    // 启动失败附完整堆栈——真实终端环境差异(ConPTY/编码)只能靠堆栈定位。
    if (err && err.stack) console.error(err.stack)
    return 1
  }
}

function main() {
  const argv = process.argv.slice(2)
  // `aether tui` 子命令早退分支（放在 argv 分发最前；其余路径字节不动）。
  if (argv[0] === 'tui') return runTuiMode(argv)
  // W5-t29：`aether completion <shell>` → 打印补全脚本（默认 bash；未知 shell 报错）。
  if (argv[0] === 'completion') {
    const shell = argv[1] || 'bash'
    const r = completions.scriptFor(shell)
    if (!r.ok) {
      console.error(`error: ${r.error}`)
      return 1
    }
    console.log(r.script)
    return 0
  }

  // P1-07 / P1-08: aether recipe list / aether recipe run <id>
  if (argv[0] === 'recipe') {
    const recipesModule = require('./electron/recipes/registry')
    const sub = argv[1] || 'list'
    if (sub === 'list') {
      const list = recipesModule.listRecipes(process.cwd())
      console.log(`\nAether Recipes (${list.length} available):\n`)
      for (const r of list) {
        const tag = r.custom ? '[custom]' : '[official]'
        console.log(`  ${r.id.padEnd(28)} ${tag.padEnd(10)} ${r.title}`)
      }
      console.log(`\nRun a recipe: aether recipe run <id>\n`)
      return 0
    }
    if (sub === 'run') {
      const id = argv[2]
      if (!id) {
        console.error('error: recipe id required. e.g. `aether recipe run fix-failing-tests`')
        return 1
      }
      const r = recipesModule.getRecipe(id, process.cwd())
      if (!r) {
        console.error(`error: recipe "${id}" not found. Run \`aether recipe list\` to see available recipes.`)
        return 1
      }
      argv.splice(0, 3, r.prompt)
      if (r.suggestedMode && !argv.includes('--mode')) {
        argv.push('--mode', r.suggestedMode)
      }
    }
  }

  const opts = parseArgs(argv)

  // W5-t27：--version → aether <semver>，早于 --help。
  if (opts.version) { console.log('aether ' + require('./package.json').version); return 0 }

  if (opts['list-recipes']) {
    const list = require('./electron/recipes/registry').listRecipes(process.cwd())
    if (opts.json) {
      console.log(JSON.stringify(list, null, 2))
    } else {
      console.log(`\nAether Recipes (${list.length} available):\n`)
      for (const r of list) {
        const tag = r.custom ? '[custom]' : '[official]'
        console.log(`  ${r.id.padEnd(28)} ${tag.padEnd(10)} ${r.title}`)
      }
      console.log(`\nRun: aether recipe run <id>\n`)
    }
    return 0
  }

  if (opts.help) { console.log(HELP); return 0 }

  // W5-t30：config 文件 + 环境变量默认值（flag > env > config > DB 默认）。
  // 坏 JSON → 仅警告 stderr 并回退默认（不崩）。
  const cfgPath = process.env.AETHER_CONFIG || configPath()
  const loadedCfg = loadConfigFile(cfgPath)
  if (loadedCfg && loadedCfg.error) console.error(`warning: ${loadedCfg.error} (${cfgPath})`)
  const defaults = resolveDefaults({
    opts,
    env: process.env,
    config: loadedCfg && !loadedCfg.error ? loadedCfg : {},
  })
  const mode = opts.mode || defaults.mode

  // todo 18：--setup-term → 写 Windows Terminal profile（--term-settings 覆盖路径）。
  if (opts['setup-term']) {
    const termProfile = require('./electron/llm/termProfile')
    const settingsPath = opts['term-settings'] || termProfile.defaultWindowsTerminalSettingsPath()
    const fragment = termProfile.buildTermProfile()
    const r = termProfile.updateSettingsJson(settingsPath, fragment)
    if (!r.ok) {
      console.error(`error: ${r.error}`)
      return 1
    }
    console.log(JSON.stringify({ ok: true, path: r.path, profiles: r.profiles }, null, 2))
    return 0
  }

  // 传输/权限模式归一：--mode json|rpc 是传输模式；auto|plan|ask|yolo 是权限模式。
  const transportJson = !!(opts['json-lines'] || opts.mode === 'json')
  const agentMode = ['auto', 'plan', 'ask', 'yolo'].includes(mode) ? mode : 'auto'

  // 传输感知的错误发射：--mode json（新传输）把早期错误也打成 NDJSON 错误帧；
  // 其余路径保持既有 console.error 行为（--json-lines 存量字节兼容不动）。
  const fail = (msg) => {
    if (opts.mode === 'json') console.log(JSON.stringify({ type: 'error', message: msg }))
    else console.error(`error: ${msg}`)
    return 1
  }

  // --mode rpc：JSONL 请求/结果循环（RPC server 由 todo 10/11 落地，此处动态接线）。
  if (opts.mode === 'rpc') {
    return (async () => {
      try {
        const rpc = await import('./electron/llm/rpc/server.js')
        const code = await rpc.main({ db: opts.db })
        return typeof code === 'number' ? code : 0
      } catch (err) {
        if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
          console.error('error: --mode rpc server is not built yet.')
          return 1
        }
        console.error(`error: ${err && err.message ? err.message : String(err)}`)
        return 1
      }
    })()
  }

  const db = agent.openDatabase(opts.db)

  // W5-t28：--resume / --session <id> / --fork <id> 目标解析。
  // 组合优先级：--session > --resume（--fork 在源之上再建新会话行）。
  // --fork 可直接携带源：`--fork 42` ≡ `--session 42 --fork`。
  // 守卫：无源 --fork / 缺 id 的 --session / 不存在会话 / 空库 --resume / 无 db
  // 都报错退出 1。
  const sessionArg = opts['session']
  const forkSource = typeof opts.fork === 'string' ? opts.fork : null
  let resumeTarget = null
  if (opts.resume || sessionArg != null || opts.fork) {
    if (!db) {
      return fail('--resume/--session/--fork require a database (run the desktop app once, or pass --db <path>).')
    }
    if (sessionArg === true) {
      return fail('--session requires a session id')
    }
    if (opts.fork && sessionArg == null && !opts.resume && !forkSource) {
      return fail('--fork requires --session <id> or --resume')
    }
    resumeTarget = resumeHelpers.resolveResumeTarget(db, {
      session: sessionArg != null ? sessionArg : forkSource,
      resume: opts.resume,
      fork: !!opts.fork,
    })
    if (!resumeTarget) {
      const missing = sessionArg != null ? sessionArg : forkSource
      if (missing != null) return fail(`session not found: ${missing}`)
      return fail('no sessions to resume')
    }
  }

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

  // todo 20：--skills → 技能提案 JSON（habitLearner 习惯→技能闭环）。
  if (opts.skills) {
    const habitLearner = require('./electron/llm/habitLearner')
    const rows = db ? habitLearner.listHabits(db) : []
    const skills = rows.map((h) => ({
      key: h.key, imperative: h.imperative, reason: h.reason || '',
      occurrences: Number(h.occurrences) || 0, proposed: Number(h.proposed) || 0,
    }))
    console.log(JSON.stringify({ skills }, null, 2))
    return 0
  }

  if (opts.task) return runTaskMode(opts)

  // Prompt 来源优先级：-p > 位置参数 > --stdin > 管道 stdin（非 TTY 自动回退）。
  let prompt = null
  if (opts.p !== undefined) prompt = String(opts.p)
  else if (opts._.length) prompt = opts._.join(' ')
  if (prompt === null && (opts.stdin || !process.stdin.isTTY)) {
    try { prompt = fs.readFileSync(0, 'utf8').trim() } catch { prompt = '' }
  }
  prompt = (prompt || '').trim()
  if (!prompt) {
    return fail('no prompt given. Use --help for usage.')
  }

  // Resolve provider + model from the DB, unless overridden on the command line.
  let resolved = agent.resolveProviderModel(db, { providerName: opts.provider, modelName: opts.model || defaults.model })
  if (!resolved) {
    return fail('no enabled model found. Configure one in the app or run --list-models / --list-providers.')
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
    return fail(
      'the stored API key for provider "' + provider.name + '" is encrypted with the desktop app (safeStorage).\n' +
      'Headless mode cannot decrypt it. Pass --api-key <plaintext> to use this provider.'
    )
  }

  const maxIterations = opts['max-iterations'] ? parseInt(opts['max-iterations'], 10) : defaults.maxIterations
  const workspace = opts.workspace ? path.resolve(opts.workspace) : (defaults.workspace || process.cwd())
  // todo 13：--persona <id> → runAgent 注入 persona + 记忆前缀（需 db）
  const personaId = opts.persona !== undefined ? Number(opts.persona) : undefined

  const toolEntries = []
  const statuses = []
  const jsonLines = transportJson
  const emit = (obj) => { if (jsonLines) console.log(JSON.stringify(obj)) }
  // W5-t31：累计 usage（runToolLoop 的 onUsage 已发累计快照，直接取末帧）。
  let usage = null

  const run = async () => {
    // todo 14：MCP 连接 + SessionStart/SessionEnd hooks（best-effort）。
    // hooks 目录 = <workspace>/.aetherai/hooks → 先显式落 workspace。
    const headlessMcp = require('./electron/llm/headlessMcp')
    try { require('./electron/tools/sandbox').setWorkspaceRoot(workspace) } catch {}
    try { await headlessMcp.connectMcpServers({ db }) } catch {}
    try { await headlessMcp.runSessionHooks('SessionStart', { sessionId: resumeTarget ? resumeTarget.sessionId : null, timestamp: new Date().toISOString() }) } catch {}
    let result
    try {
      result = await agent.runAgent({
        prompt,
        // W5-t28：resume/fork → 载入历史（runAgent 在有 messages 时不追加新
        // prompt，故由 CLI 拼接最后一轮 user 消息）。headless 不回写本轮
        // 消息到 DB —— resume 是上下文延续（文档化）。
        messages: resumeTarget ? resumeTarget.messages.concat([{ role: 'user', content: prompt }]) : undefined,
        provider,
        model,
        workspace,
        agentMode,
        maxIterations,
        db,
        personaId,
        onUsage: (u) => { usage = u },
        onToolCall: (entry) => {
          toolEntries.push(entry)
          const isStart = toolEntry.isToolStart(entry)
          emit({
            type: isStart ? 'tool:start' : 'tool:end',
            entry: { name: entry.name, args: entry.args, result: entry.result, error: entry.error, risk: entry.risk, latencyMs: entry.latencyMs, startedAt: entry.startedAt || null },
          })
        },
        onStatus: (s) => { statuses.push(s); emit({ type: 'status', kind: s.kind || 'step', text: s.text }) },
        onPlanStep: (step) => emit({ type: 'plan', step }),
        onText: (chunk) => emit({ type: 'text', delta: chunk.text, done: !!chunk.done }),
      })
    } finally {
      try { await headlessMcp.runSessionHooks('SessionEnd', { sessionId: null, timestamp: new Date().toISOString() }) } catch {}
      try { await headlessMcp.disconnectMcpServers() } catch {}
    }

    // todo 20：--memory-trace → 展示注入记忆条目数（json-lines 帧 / 文本 stderr）。
    if (opts['memory-trace']) {
      const count = result.memoryTrace ? result.memoryTrace.memoryCount : 0
      if (jsonLines) emit({ type: 'memory-trace', count })
      else console.error(`memory: ${count} entry/ies injected`)
    }

    // W5-t31：定价可得时估算成本（model 行 input/output_price_per_1k，$/1k tokens）。
    // 无 db / 无价格列 / 价格为 0 → estimatedCost 整字段省略（文档化）。
    let estimatedCost = null
    if (usage && db) {
      try {
        const priceRow = db.prepare('SELECT input_price_per_1k, output_price_per_1k FROM model WHERE id = ?').get(model.id)
        const pIn = Number(priceRow && priceRow.input_price_per_1k)
        const pOut = Number(priceRow && priceRow.output_price_per_1k)
        if (Number.isFinite(pIn) && Number.isFinite(pOut) && pIn > 0 && pOut > 0) {
          estimatedCost = (usage.input / 1000) * pIn + (usage.output / 1000) * pOut
          // W5-t31: 4 位小数
          estimatedCost = Math.round(estimatedCost * 10000) / 10000
        }
      } catch {}
    }

    // W5-t32：-o/--output-last-message → 最终答案写文件（任何模式都写；失败 exit 1）。
    if (opts.o != null) {
      const w = writeLastMessage(opts.o, result.text)
      if (!w.ok) {
        const msg = `cannot write output file: ${w.error}`
        if (jsonLines) emit({ type: 'error', message: msg })
        else if (opts.json) console.log(JSON.stringify({ error: msg }, null, 2))
        else console.error(`error: ${msg}`)
        return 1
      }
    }

    const sessionId = resumeTarget ? resumeTarget.sessionId : null

    if (jsonLines) {
      emit({ type: 'done', text: result.text, toolCalls: toolEntries, sessionId, estimatedCost: estimatedCost === null ? undefined : estimatedCost })
      return 0
    }

    if (opts.json) {
      const out = {
        model: model.model_name,
        provider: provider.name,
        text: result.text,
        toolCalls: toolEntries,
        statuses,
        sessionId,
      }
      if (estimatedCost !== null) out.estimatedCost = estimatedCost
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
    if (transportJson) console.log(JSON.stringify({ type: 'error', message: msg }))
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