// ─────────────────────────────────────────────────────────────────────────────
// electron/sdk/index.js — Electron-free SDK 聚合导出（todo 12）
//
// 外部 npm 项目可 `require('aetherai/sdk')` 复用 Aether 核心：agent 执行、
// DB 访问、任务引擎适配、记忆、共享模式分类器。全部子模块必须 Electron-free
// （本文件本身不 require('electron')）。
//
// 延后接线契约：
//   - rpc 帧类型   → todo 10 落地 `electron/llm/rpc/frames.js` 后自动挂载到 sdk.rpc
//   - sessionContext（persona+记忆注入）→ todo 13 落地后自动挂载到 sdk.sessionContext
// ─────────────────────────────────────────────────────────────────────────────
const agentCore = require('../llm/agentCore')
const { taskDbAdapter } = require('../llm/taskDbAdapter')
const autoMemory = require('../llm/autoMemory')
const { classifyAgentMode } = require('../llm/modeClassifier')

const sdk = {
  // agent 执行核心（原签名透出；后续新增参数一律可选追加，不破坏既有调用方）
  runAgent: agentCore.runAgent,
  openDatabase: agentCore.openDatabase,
  resolveProviderModel: agentCore.resolveProviderModel,

  // 任务引擎 DB 适配器工厂（bare better-sqlite3 → database.js 同款业务 API）
  taskDbAdapter,

  // 记忆（autoMemory，全部 Electron-free，db 由调用方注入）
  memory: {
    prefetch: autoMemory.prefetch,
    recall: autoMemory.recall,
    sync: autoMemory.sync,
    search: autoMemory.search,
    prune: autoMemory.prune,
    keywords: autoMemory.keywords,
    parseEntry: autoMemory.parseEntry,
    detectConflict: autoMemory.detectConflict,
  },

  // 共享 agentMode 分类器（ask/plan/auto）
  classifyAgentMode,
}

// todo 10/13 延后挂载（存在才暴露，缺省时 undefined）
try { sdk.rpc = require('../llm/rpc/frames.js') } catch { /* rpc frames land in todo 10 */ }
try { sdk.sessionContext = require('../llm/sessionContext.js') } catch { /* sessionContext lands in todo 13 */ }

module.exports = sdk
