// ───────────────────────────────────────────────────────────────────────────
// UltraWork (ULW) — multi-model multi-agent parallel orchestration mode.
//
// Unlike OMO's plugin-level ULW (which assumes a single model and uses
// prompt engineering for multi-role reasoning), Aether's ULW is a true
// multi-agent orchestrator: users explicitly configure each model's ULW
// role (analyzer / planner / implementer / verifier) in the model
// management page, and ULW spawns parallel sub-agents per role.
//
// Key design decisions:
//   1. No regex guessing: Users explicitly assign roles via ulw_role field.
//      No model name patterns, no capability tier inference.
//   2. Explicit roles: Each model can be assigned to one role or "none".
//      Multiple models can share the same role for load balancing.
//   3. Relay station friendly: OpenAI-compatible relay stations (new-api,
//      one-api, etc.) present each upstream model as a separate model row.
//      ULW discovers them naturally via getAllModels().
//   4. Graceful degradation: If no explicit roles are configured, falls
//      back to single-model mode (enhanced system prompt only).
//
// ULW roles:
//   - Analyzer     → codebase exploration, structure mapping
//   - Planner      → task decomposition, dependency graph
//   - Implementer  → actual code changes (main agent)
//   - Verifier     → post-execution verification
// ───────────────────────────────────────────────────────────────────────────

const { getWorkspaceRoot } = require('../tools/sandbox')
const fs = require('fs')
const path = require('path')
const log = require('../logger')

// ─── ULW Detection ─────────────────────────────────────────────────────────

const ULW_TRIGGERS = /\b(ulw|ultrawork|ultra[-_]?work)\b/i

function isUltraWorkRequest(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false
  return ULW_TRIGGERS.test(userMessage)
}

function stripUlwTrigger(text) {
  return String(text || '').replace(ULW_TRIGGERS, '').trim()
}

// ─── Model Discovery ───────────────────────────────────────────────────────
// Queries the database for all models and groups them by their explicitly
// configured ulw_role field. No regex-based tier guessing.
//
// Returns { analyzer, planner, implementer, verifier, all, _hasExplicitRoles }
// where each role group is an array of model rows with that role assigned.

function discoverModels(db) {
  if (!db || typeof db.getAllModels !== 'function') return null
  try {
    const all = db.getAllModels()
    if (!all || all.length === 0) return null

    // Group by ulw_role as configured by the user in the model management page
    const analyzer = all.filter(m => m.ulw_role === 'analyzer')
    const planner = all.filter(m => m.ulw_role === 'planner')
    const implementer = all.filter(m => m.ulw_role === 'implementer')
    const verifier = all.filter(m => m.ulw_role === 'verifier')

    const hasExplicitRoles = [analyzer, planner, implementer, verifier].some(a => a.length > 0)

    return {
      analyzer,
      planner,
      implementer,
      verifier,
      all,
      _hasExplicitRoles: hasExplicitRoles,
    }
  } catch (e) {
    log.warn('ULW model discovery failed:', e.message)
    return null
  }
}

// ─── Role Assignment ───────────────────────────────────────────────────────
// Given discovered models, assign the best model for each ULW role.
// When users have explicitly configured roles (via ulw_role dropdown), uses
// those assignments directly. Otherwise falls back to the primary model.

function assignRoleModels(models, primaryModel) {
  if (!models) {
    if (primaryModel) {
      return {
        analyzer: primaryModel,
        planner: primaryModel,
        implementer: primaryModel,
        verifier: primaryModel,
        _multiModel: false,
      }
    }
    return null
  }

  // ── User has explicitly configured roles → use them directly ──
  if (models._hasExplicitRoles) {
    const usedIds = new Set()
    const result = {}

    // Helper: pick from a pool, preferring unused models for distinctness
    const pick = (pool) => {
      if (!pool || pool.length === 0) return null
      const m = pool.find(m => !usedIds.has(m.id)) || pool[0]
      usedIds.add(m.id)
      return m
    }

    // Priority: implementer is the main agent, should always get a model
    result.implementer = pick(models.implementer) || pick(models.all) || primaryModel
    result.planner = pick(models.planner) || result.implementer
    result.analyzer = pick(models.analyzer) || result.implementer
    result.verifier = pick(models.verifier) || result.analyzer || result.implementer
    result._multiModel = usedIds.size >= 2

    return result
  }

  // ── No explicit roles → fallback to single-model mode ──
  // Use the primary model, or the first available model.
  const fallback = primaryModel || models.all?.[0]
  if (fallback) {
    return {
      analyzer: fallback,
      planner: fallback,
      implementer: fallback,
      verifier: fallback,
      _multiModel: false,
    }
  }

  return null
}

// ─── Deep Codebase Analysis ────────────────────────────────────────────────

function analyzeProjectStructure(maxDepth = 3) {
  const root = getWorkspaceRoot()
  if (!root || !fs.existsSync(root)) return null

  const lines = []
  const MAX_ENTRIES = 100
  let count = 0

  function walk(dir, depth) {
    if (depth > maxDepth || count >= MAX_ENTRIES) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const e of entries) {
      if (count >= MAX_ENTRIES) break
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.codegraph' ||
          e.name === '.omo' || e.name === 'dist' || e.name === 'release' ||
          e.name === '__pycache__' || e.name === '.gitkeep') continue
      const fullPath = path.join(dir, e.name)
      const relPath = path.relative(root, fullPath)
      const prefix = '  '.repeat(depth) + (e.isDirectory() ? '📁 ' : '📄 ')
      lines.push(prefix + relPath)
      count++
      if (e.isDirectory()) walk(fullPath, depth + 1)
    }
  }

  walk(root, 0)
  return lines.length > 0 ? lines.join('\n') : null
}

function detectProjectTechStack() {
  const root = getWorkspaceRoot()
  if (!root) return null

  const tech = []
  const markers = {
    'package.json': { name: 'Node.js', detail: null },
    'tsconfig.json': { name: 'TypeScript', detail: null },
    'vite.config.ts': { name: 'Vite', detail: null },
    'next.config.js': { name: 'Next.js', detail: null },
    'requirements.txt': { name: 'Python', detail: null },
    'Cargo.toml': { name: 'Rust', detail: null },
    'go.mod': { name: 'Go', detail: null },
    'Dockerfile': { name: 'Docker', detail: null },
    '.github/workflows': { name: 'GitHub Actions', detail: null },
  }

  for (const [marker, info] of Object.entries(markers)) {
    const p = path.join(root, marker)
    if (fs.existsSync(p)) {
      tech.push(info.name)
    }
  }

  const pkgPath = path.join(root, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.react) tech.push('React ' + (deps.react.replace(/[\^~]/g, '')))
      if (deps.electron) tech.push('Electron ' + (deps.electron.replace(/[\^~]/g, '')))
      if (deps.vue) tech.push('Vue.js')
      if (deps.tailwindcss) tech.push('Tailwind CSS')
      if (deps.prisma) tech.push('Prisma')
      if (deps['@tanstack/react-query']) tech.push('React Query')
      if (deps.zustand) tech.push('Zustand')
      if (deps.express) tech.push('Express')
      if (deps.next) tech.push('Next.js')
    } catch {}
  }

  return tech.length > 0 ? tech.join(', ') : null
}

// ─── Multi-Agent Orchestration ─────────────────────────────────────────────
// The core ULW value: spawn parallel sub-agents with different models.
//
// When multiple models are explicitly configured:
//   1. Analyzer: explores codebase, identifies patterns
//   2. Planner: decomposes task, creates dependency graph
//   3. Implementer: executes changes (the main runToolLoop)
//   4. Verifier: validates results post-execution
//
// When only one model is available: falls back to enhanced system prompt.

/**
 * Run ULW multi-agent prelude: analyzer + planner in parallel.
 * Returns { analysis, plan, roleModels } for the main loop to use.
 */
async function runUlwPrelude({ db, provider, signal, options }) {
  // Step 1: Discover models by their ulw_role configuration
  const models = discoverModels(db)
  const roleModels = assignRoleModels(models)

  if (!roleModels) {
    return { analysis: null, plan: null, roleModels: null, multiModel: false }
  }

  const multiModel = roleModels._multiModel
  const results = { analysis: null, plan: null, roleModels, multiModel }

  // Step 2: Run codebase analysis (always, cheap)
  try {
    const structure = analyzeProjectStructure(4)
    const techStack = detectProjectTechStack()
    results.analysis = { structure, techStack }
  } catch {}

  // Step 3: If multi-model, run parallel analyzer + planner sub-agents
  if (multiModel) {
    const { runSubagent } = require('./subAgent')

    const analyzerTask = (async () => {
      if (roleModels.analyzer && roleModels.analyzer.model_name !== roleModels.implementer.model_name) {
        try {
          const analysis = await runSubagent({
            db,
            parentSessionId: null,
            provider,
            model: roleModels.analyzer,
            prompt: `你是一个代码库分析专家。请分析当前项目:

1. 项目结构和模块组织方式
2. 核心架构模式和约定
3. 关键文件及其职责
4. 潜在的风险点或改进机会

${results.analysis?.structure ? `项目结构:\n${results.analysis.structure}` : ''}
${results.analysis?.techStack ? `技术栈: ${results.analysis.techStack}` : ''}

请输出一份简洁的分析报告(200字以内)。`,
            signal,
            agentMode: 'plan',
          })
          return { analyzerResult: analysis }
        } catch (e) {
          log.warn('ULW analyzer sub-agent failed:', e.message)
        }
      }
      return null
    })()

    const plannerTask = (async () => {
      if (roleModels.planner && roleModels.planner.model_name !== roleModels.implementer.model_name) {
        try {
          const plan = await runSubagent({
            db,
            parentSessionId: null,
            provider,
            model: roleModels.planner,
            prompt: `你是一个任务规划专家。请分析用户请求并将其分解为可执行的子任务。

请输出:
- 整体目标描述
- 子任务列表(按执行顺序,标注依赖关系)
- 每个子任务的预期输出

保持简洁,关注可执行性。`,
            signal,
            agentMode: 'plan',
          })
          return { plannerResult: plan }
        } catch (e) {
          log.warn('ULW planner sub-agent failed:', e.message)
        }
      }
      return null
    })()

    // Run both in parallel
    const [analyzerOut, plannerOut] = await Promise.all([analyzerTask, plannerTask])

    if (analyzerOut?.analyzerResult) {
      results.analysis.analyzerReport = analyzerOut.analyzerResult
    }
    if (plannerOut?.plannerResult) {
      results.plan = plannerOut.plannerResult
    }
  }

  return results
}

// ─── Enhanced System Prompt Builder ────────────────────────────────────────

function buildUlwSystemBlock(projectStructure, techStack, roleModels) {
  const parts = [
    '## ⚡ UltraWork 模式已激活',
    '',
    '你正在以增强的多代理模式运行。请遵循以下原则:',
    '',
    '### 1. 先分析,再行动',
    '在执行任何修改前,先全面了解项目结构、现有模式和约定。',
    '使用 glob_find, read_file, grep_search 等工具深入探索代码库。',
    '',
    '### 2. 规划先行',
    '使用 todo_write 创建任务清单,将复杂请求拆分为可执行的子任务。',
    '标注任务间的依赖关系,并行执行独立的子任务。',
    '',
    '### 3. 多角色思维',
    '在推理时考虑以下视角:',
    '- 架构师: 整体设计是否合理?有无潜在风险?',
    '- 代码库专家: 现有代码中是否有可复用的模式?',
    '- 实现者: 如何高效、安全地完成变更?',
    '',
    '### 4. 验证与迭代',
    '完成变更后,运行相关测试或构建命令验证。',
    '如果验证失败,分析原因并修复,而不是简单重试。',
  ]

  if (projectStructure) {
    parts.push('', '### 项目结构参考', '```', projectStructure, '```')
  }

  if (roleModels && roleModels._multiModel) {
    const modelLines = []
    if (roleModels.analyzer && roleModels.analyzer.model_name) {
      modelLines.push(`- 分析器: ${roleModels.analyzer.model_name}`)
    }
    if (roleModels.planner && roleModels.planner.model_name) {
      modelLines.push(`- 规划器: ${roleModels.planner.model_name}`)
    }
    if (roleModels.implementer && roleModels.implementer.model_name) {
      modelLines.push(`- 执行器: ${roleModels.implementer.model_name}`)
    }
    if (roleModels.verifier && roleModels.verifier.model_name) {
      modelLines.push(`- 验证器: ${roleModels.verifier.model_name}`)
    }
    if (modelLines.length > 0) {
      parts.push('', '### 多模型分配\n' + modelLines.join('\n'))
    }
  }

  if (techStack) {
    parts.push('', `### 检测到的技术栈\n${techStack}`)
  }

  parts.push('', '---')
  return parts.join('\n')
}

// ─── Post-Execution Verification Prompt ────────────────────────────────────

function buildUlwVerificationPrompt(planSummary, toolTrace, roleModels) {
  const multiModelNote = (roleModels && roleModels._multiModel)
    ? '\n注意:此任务使用了多模型并行编排。验证时要确保各子任务的结果一致。'
    : ''

  return `你刚刚以 UltraWork 模式完成了任务。请执行最终验证:

## 完成检查清单
1. 所有计划的子任务是否都已完成?
2. 代码变更是否遵循了项目现有约定?
3. 是否有未处理的错误或警告?
4. 是否需要更新相关文档或测试?
${multiModelNote}

## 执行记录
${toolTrace}

${planSummary ? `## 计划摘要\n${planSummary}\n` : ''}

请按以下格式输出:
- STATUS: COMPLETE 或 INCOMPLETE
- ISSUES: 列出发现的问题,或 "none"
- SUMMARY: 简要总结完成的工作
- NEXT_STEPS: 如果有,后续建议做什么`
}

// ─── Module Exports ────────────────────────────────────────────────────────

module.exports = {
  isUltraWorkRequest,
  stripUlwTrigger,
  discoverModels,
  assignRoleModels,
  analyzeProjectStructure,
  detectProjectTechStack,
  runUlwPrelude,
  buildUlwSystemBlock,
  buildUlwVerificationPrompt,
  ULW_TRIGGERS,
}