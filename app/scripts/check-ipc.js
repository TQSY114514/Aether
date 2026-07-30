#!/usr/bin/env node
/**
 * IPC 契约校验脚本
 *
 * 检查 IPC 三件套一致性：
 *   1. handler  : app/electron/ipc/*.handler.js 里的 ipcMain.handle('channel', ...)
 *   2. preload  : app/electron/preload.js        里的 ipcRenderer.invoke('channel', ...)
 *   3. types    : app/src/env.d.ts               里的方法声明
 *
 * 规则：
 *   - preload 里 invoke 的 channel 必须在 handler 里注册（否则运行时报错）
 *   - handler 注册的 invoke channel 应在 preload 里有调用（否则是 dead code）
 *   - preload 暴露的 namespace.method 必须在 env.d.ts 里有类型声明
 *   - env.d.ts 声明的 namespace.method 必须在 preload 里有实现
 *
 * 用法： node scripts/check-ipc.js
 * 退出码： 0=通过， 1=有不一致
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const IPC_DIR = path.join(ROOT, 'electron', 'ipc')
const PRELOAD = path.join(ROOT, 'electron', 'preload.js')
const ENV_DTS = path.join(ROOT, 'src', 'env.d.ts')

let errors = []
let warnings = []

function fail(msg) { errors.push(msg) }
function warn(msg) { warnings.push(msg) }

// ---------- 1. 解析 handler 文件 ----------
function parseHandlers() {
  const channels = new Set()
  // 扫描整个 electron 目录的 .js 文件（handler 在 ipc/ 以及 main.js/updater.js 等）
  const electronDir = path.join(ROOT, 'electron')
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8')
        const re = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g
        let m
        while ((m = re.exec(content)) !== null) {
          channels.add(m[1])
        }
      }
    }
  }
  walk(electronDir)
  return channels
}

// ---------- 2. 解析 preload.js ----------
function parsePreload() {
  const content = fs.readFileSync(PRELOAD, 'utf8')
  const invokeChannels = new Set()
  const onChannels = new Set()

  // ipcRenderer.invoke('channel', ...)
  const invokeRe = /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g
  let m
  while ((m = invokeRe.exec(content)) !== null) {
    invokeChannels.add(m[1])
  }

  // ipcRenderer.on('channel', ...) — 主进程主动推送的 channel
  const onRe = /ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g
  while ((m = onRe.exec(content)) !== null) {
    onChannels.add(m[1])
  }

  // 解析 namespace.method 结构
  // preload 用 2 空格缩进，namespace 顶格，method 缩进 2 空格
  // 直接用行首缩进判断层级，不依赖括号深度
  const methods = new Set() // "namespace.method"
  const lines = content.split('\n')
  let currentNs = null
  for (const line of lines) {
    // namespace: 行首（无缩进或 0 缩进）的 "word: {"
    // preload 里 namespace 缩进 2 空格（在 exposeInMainWorld 内）
    const nsMatch = line.match(/^\s{2}(\w+):\s*\{/)
    if (nsMatch) {
      currentNs = nsMatch[1]
      continue
    }
    // method: 缩进 4 空格的 "word: (args) =>" 或 "word: function" 或 "word: (args)"
    if (currentNs) {
      const methodMatch = line.match(/^\s{4}(\w+)\s*:/)
      if (methodMatch) {
        methods.add(`${currentNs}.${methodMatch[1]}`)
      }
      // 回到 namespace 层级（缩进 2 空格的 }）
      if (line.match(/^\s{2}\}/)) {
        currentNs = null
      }
    }
  }

  return { invokeChannels, onChannels, preloadMethods: methods }
}

// ---------- 3. 解析 env.d.ts ----------
function parseEnvDts() {
  const content = fs.readFileSync(ENV_DTS, 'utf8')
  const methods = new Set()

  // env.d.ts 用 2 空格缩进
  // electronAPI: {        <- 2 空格
  //   provider: {          <- 4 空格（namespace）
  //     list: (...) => ... <- 6 空格（method）
  //   }
  // }
  const lines = content.split('\n')
  let currentNs = null
  for (const line of lines) {
    // namespace: 缩进 4 空格的 "word: {"
    const nsMatch = line.match(/^\s{4}(\w+):\s*\{/)
    if (nsMatch) {
      currentNs = nsMatch[1]
      continue
    }
    // method: 缩进 6 空格的 "word: (args) =>"
    if (currentNs) {
      const methodMatch = line.match(/^\s{6}(\w+)\s*:\s*\(/)
      if (methodMatch) {
        methods.add(`${currentNs}.${methodMatch[1]}`)
      }
      // 结束 namespace（缩进 4 空格的 }）
      if (line.match(/^\s{4}\}/)) {
        currentNs = null
      }
    }
  }

  return methods
}

// ---------- 4. 对比 ----------
function check() {
  const handlerChannels = parseHandlers()
  const { invokeChannels, onChannels, preloadMethods } = parsePreload()
  const dtsMethods = parseEnvDts()

  // 4.1 preload invoke 但 handler 没注册（运行时会报错）—— 最严重的
  for (const ch of invokeChannels) {
    if (!handlerChannels.has(ch)) {
      fail(`preload invoke "${ch}" 但没有 handler 注册（运行时未处理）`)
    }
  }

  // 4.2 handler 注册但 preload 没调用也没监听（dead handler，可能是主进程推送或未使用）
  for (const ch of handlerChannels) {
    if (!invokeChannels.has(ch) && !onChannels.has(ch)) {
      // 检查是否在 onChannels 里（有些 channel 主进程用 send，preload 用 on 监听）
      warn(`handler 注册了 "${ch}" 但 preload 无 invoke/on（可能 dead code 或主进程推送）`)
    }
  }

  // 4.3 preload 方法 vs env.d.ts 方法对比
  for (const key of preloadMethods) {
    if (!dtsMethods.has(key)) {
      fail(`preload 暴露 "${key}" 但 env.d.ts 无类型声明`)
    }
  }
  for (const key of dtsMethods) {
    if (!preloadMethods.has(key)) {
      fail(`env.d.ts 声明 "${key}" 但 preload 无实现`)
    }
  }
}

// ---------- 5. 输出 ----------
check()

console.log('\n========== IPC 契约校验 ==========\n')

if (warnings.length > 0) {
  console.log(`⚠️  警告 (${warnings.length}):`)
  for (const w of warnings) console.log(`   ${w}`)
  console.log()
}

if (errors.length > 0) {
  console.log(`❌ 错误 (${errors.length}):`)
  for (const e of errors) console.log(`   ${e}`)
  console.log('\nIPC 契约不一致，请修复上述错误。')
  console.log('提示： handler 在 app/electron/ipc/, preload 在 app/electron/preload.js, 类型在 app/src/env.d.ts')
  process.exit(1)
} else {
  console.log('✅ IPC 契约一致：handler / preload / env.d.ts 三件套匹配。')
  process.exit(0)
}
