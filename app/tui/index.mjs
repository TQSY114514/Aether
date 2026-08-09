// ─────────────────────────────────────────────────────────────────────────────
// index.mjs — TUI 入口（todo 1）。cli.js `aether tui` 动态 import 本模块并调 main()。
// 职责：Node>=22 自检（ink v5 要求）、--smoke 无 TTY 冒烟、TTY 交互渲染、退出码。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h } from 'react'
import { render } from 'ink'
import { App } from './App.mjs'
import { tuiReducer, initialTuiState, summarizeState } from './reducer.js'
import { keyToAction } from './keymap.js'

const MIN_NODE_MAJOR = 22

export async function main(argv = []) {
  const major = Number(process.versions.node.split('.')[0])
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    console.error(`error: aether tui requires Node >= ${MIN_NODE_MAJOR} (current: ${process.versions.node})`)
    return 1
  }
  if (argv.includes('--smoke')) return runSmoke()
  if (!process.stdin.isTTY) {
    console.error('error: aether tui requires a TTY. Run it from a real terminal, or use `aether tui --smoke` for a headless smoke.')
    return 1
  }
  return runInteractive()
}

// TTY 交互模式：渲染 App，等用户退出（Ctrl+C → QUIT_INTENT → exit()）。
// 从 argv 提取 --db/--model 传给 App（与 CLI 其余模式同语义）。
function parseTuiOpts(argv) {
  const opts = { dbPath: undefined, modelName: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') { opts.dbPath = argv[i + 1]; i++; continue }
    if (a === '--model') { opts.modelName = argv[i + 1]; i++; continue }
    if (a.startsWith('--db=')) { opts.dbPath = a.slice(5); continue }
    if (a.startsWith('--model=')) { opts.modelName = a.slice(8); continue }
  }
  return opts
}

function runInteractive(argv) {
  const { dbPath, modelName } = parseTuiOpts(argv)
  return new Promise((resolve) => {
    const { unmount, waitUntilExit } = render(h(App, { dbPath, modelName }))
    waitUntilExit().then(() => { unmount(); resolve(0) })
  })
}

// --smoke：无 TTY 下驱动预设键序（与真实 UI 共用同一 reducer + keymap 路径），
// 逐步打印状态机 JSON 序列，退出码 0（F3 冒烟依赖此开关）。
function runSmoke() {
  const steps = [
    { chars: 'hi' },                        // INPUT
    { key: { name: 'return' } },            // SUBMIT → running + user/assistant 消息
    { key: { name: 'm' } },                 // MODE_CYCLE ask→plan
    { key: { name: 'm' } },                 // MODE_CYCLE plan→auto
    { key: { name: 'backspace' } },         // INPUT_BACKSPACE（空输入下无副作用）
    { key: { ctrl: true, name: 'c' } },     // QUIT_INTENT
  ]
  let state = initialTuiState
  const snapshots = []
  for (const step of steps) {
    if (step.chars) state = tuiReducer(state, { type: 'INPUT', value: state.input + step.chars })
    if (step.key) {
      const action = keyToAction(step.key)
      if (action) state = tuiReducer(state, action)
    }
    snapshots.push(summarizeState(state))
  }
  console.log(JSON.stringify(snapshots, null, 2))
  return 0
}
