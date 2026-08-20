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
const agentRoles = require('../llm/agentRoles')
const memorySkillBridge = require('../llm/memorySkillBridge')
const customMode = require('../llm/customMode')
const codebaseAnalyzer = require('../context/codebaseAnalyzer')
const contextBudget = require('../llm/contextBudget')

const sdk = {
  runAgent: agentCore.runAgent,
  openDatabase: agentCore.openDatabase,
  resolveProviderModel: agentCore.resolveProviderModel,
  taskDbAdapter,

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

  // Agent roles (OpenCode/Hermes-style specialized sub-agents)
  agentRoles: {
    listRoles: agentRoles.listRoles,
    getRole: agentRoles.getRole,
    buildRolePrompt: agentRoles.buildRolePrompt,
    buildToolFilter: agentRoles.buildToolFilter,
    getRoleDefaultMode: agentRoles.getRoleDefaultMode,
    ROLE_NAMES: agentRoles.ROLE_NAMES,
  },

  // Memory → Skill bridge (auto-draft skills from accumulated memories)
  memorySkillBridge: {
    clusterMemories: memorySkillBridge.clusterMemories,
    generateDraftSkill: memorySkillBridge.generateDraftSkill,
    saveDraftSkill: memorySkillBridge.saveDraftSkill,
    runMemoryAudit: memorySkillBridge.runMemoryAudit,
    listDraftSkills: memorySkillBridge.listDraftSkills,
    promoteDraftSkill: memorySkillBridge.promoteDraftSkill,
  },

  // Custom mode policy (build PermissionPolicy from user settings)
  customMode: {
    buildCustomPolicy: customMode.buildCustomPolicy,
    getCustomPolicySummary: customMode.getCustomPolicySummary,
    saveCustomPolicy: customMode.saveCustomPolicy,
  },

  // Codebase analysis (Repository Understanding Layer)
  codebase: {
    detectFrameworks: codebaseAnalyzer.detectFrameworks,
    detectEntryPoints: codebaseAnalyzer.detectEntryPoints,
    detectApiRoutes: codebaseAnalyzer.detectApiRoutes,
    detectDataModels: codebaseAnalyzer.detectDataModels,
    detectConfigFiles: codebaseAnalyzer.detectConfigFiles,
    analyzeImpact: codebaseAnalyzer.analyzeImpact,
    scoreRelevance: codebaseAnalyzer.scoreRelevance,
    analyzeCodebase: codebaseAnalyzer.analyzeCodebase,
  },

  // Gateway (P2-2)
  gateway: {
    Gateway: require('../gateway/index').Gateway,
    gateway: require('../gateway/index').gateway,
  },

  // Context Budget Manager (P1-1)
  contextBudget: {
    calculateBudget: contextBudget.calculateBudget,
    classifyToolResult: contextBudget.classifyToolResult,
    getTruncationLimit: contextBudget.getTruncationLimit,
    applyTieredTruncation: contextBudget.applyTieredTruncation,
    pruneOlderBlock: contextBudget.pruneOlderBlock,
    TIER_CONFIG: contextBudget.TIER_CONFIG,
    TOOL_TRUNCATION: contextBudget.TOOL_TRUNCATION,
  },

  classifyAgentMode,
}

// todo 10/13 延后挂载（存在才暴露，缺省时 undefined）
try { sdk.rpc = require('../llm/rpc/frames.js') } catch { /* rpc frames land in todo 10 */ }
try { sdk.sessionContext = require('../llm/sessionContext.js') } catch { /* sessionContext lands in todo 13 */ }

module.exports = sdk
