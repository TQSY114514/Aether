const path = require('path')
const { spawn } = require('child_process')
const { completeChatMessage, normalizeUsage } = require('../llm/providerAdapter')
const { computeCost } = require('../utils/cost')
const { shouldWriteQuickTitle, quickTitleOf } = require('./chat-send.handler')
const featureFlags = require('../featureFlags')
const log = require('../logger')
const abortControllers = new Map()

/**
 * Sanitize and validate verifyCommand string for benchmark tasks.
 * Rejects non-strings, strings containing null bytes, and excessively long inputs.
 * @param {any} cmd - Candidate command string
 * @returns {string|null} Validated command or null
 */
function sanitizeVerifyCommand(cmd) {
  if (typeof cmd !== 'string') return null
  const trimmed = cmd.trim()
  if (!trimmed || trimmed.includes('\0') || trimmed.length > 1000) return null
  // Disallow shell chaining / redirection / injection metacharacters
  if (/[;&|`$<>]|\r|\n/.test(trimmed)) return null
  return trimmed
}

/**
 * Constrain task cwd within the fallback workspace sandbox root.
 * Prevents directory traversal attacks via relative paths like `../../`.
 * @param {string|null|undefined} taskCwd - Candidate cwd
 * @param {string} fallbackRoot - Workspace sandbox root
 * @returns {string} Safe absolute cwd
 */
function resolveTaskCwd(taskCwd, fallbackRoot) {
  const base = path.resolve(fallbackRoot || process.cwd())
  if (!taskCwd || typeof taskCwd !== 'string') return base
  const resolved = path.resolve(base, taskCwd)
  const rel = path.relative(base, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return base
  }
  return resolved
}

/**
 * Terminate a spawned child process and its entire process tree cleanly.
 * Uses taskkill /T /F on Windows and SIGTERM/SIGKILL on POSIX platforms.
 * @param {import('child_process').ChildProcess} child
 */
function killProcessTree(child) {
  if (!child || !child.pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } catch {}
  } else {
    try { child.kill('SIGTERM') } catch {}
    try { child.kill('SIGKILL') } catch {}
  }
}

/**
 * Asynchronously execute a benchmark verification command with timeout and abort support.
 * @param {string} verifyCommand - Shell command to execute
 * @param {string} taskCwd - Working directory constrained within workspace
 * @param {AbortSignal} [signal] - Optional abort signal
 * @param {number} [expectedExitCode=0] - Expected process exit code
 * @returns {Promise<boolean>} True if command exited with expectedExitCode
 */
function runVerifyCommand(verifyCommand, taskCwd, signal, expectedExitCode = 0) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    let child
    try {
      child = spawn(verifyCommand, {
        cwd: taskCwd,
        shell: true,
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch (e) {
      return resolve(false)
    }

    let finished = false
    let timer = null
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (!finished) {
        finished = true
        cleanup()
        killProcessTree(child)
        resolve(false)
      }
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    timer = setTimeout(() => {
      if (!finished) {
        finished = true
        cleanup()
        killProcessTree(child)
        resolve(false)
      }
    }, 30000)

    child.on('error', () => {
      if (!finished) {
        finished = true
        cleanup()
        resolve(false)
      }
    })

    child.on('close', (code) => {
      if (!finished) {
        finished = true
        cleanup()
        resolve(code === expectedExitCode)
      }
    })
  })
}

/**
 * Register all Arena IPC handlers (arena:send, arena:stop, arena:vote, arena:benchmark-*).
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} db - Database access layer
 * @param {() => import('electron').WebContents|null} [getWebContents]
 */
function registerArenaHandlers(ipcMain, db, getWebContents = () => null) {
  ipcMain.handle('arena:send', async (event, { sessionId, content, modelIds, personaId, temperatures }) => {
    const allModels = db.getAllModels()
    const selected = allModels.filter(m => modelIds.includes(m.id))
    if (!selected.length) return { results: [] }

    // Arena 2.0 (review P0-3): same-model multi-temperature comparison.
    // temperatures = [0.2, 0.8] → each selected model runs once per temperature,
    // results carry a `variant` label ("temp 0.2") so the UI can show them side by side.
    const temps = Array.isArray(temperatures) && temperatures.length > 0
      ? temperatures.map(t => Number(t)).filter(Number.isFinite)
      : null
    const runs = []
    for (const m of selected) {
      if (temps) {
        for (const t of temps) runs.push({ m, temperature: t, variant: `temp ${t}` })
      } else {
        runs.push({ m, temperature: null, variant: null })
      }
    }

    // Persist the user's arena prompt as a message so it survives a reload
    db.addMessage({ session_id: sessionId, role: 'user', content })

    // Auto-title: an arena round is a real conversation too. When the session is
    // still placeholder-titled and this is its first message, fall back to the
    // same quick title the chat path uses (chat-send.handler), so arena sessions
    // don't sit at "新会话" forever. AI-summary upgrade happens on the chat side
    // if the user continues the conversation there.
    try {
      const s0 = db.getSession(sessionId)
      const autoTitleOn = (db.getSetting('autoTitle') ?? '1') === '1'
      if (s0 && shouldWriteQuickTitle({ autoTitleOn, sessionTitle: s0.title, msgsLen: db.getMessages(sessionId).length })) {
        const quick = quickTitleOf(content)
        if (quick) db.renameSession(sessionId, quick)
      }
    } catch (e) { log.warn('arena quick title failed:', e.message) }

    // Run all model×temperature variants CONCURRENTLY (Promise.all) so a slow
    // model doesn't block the others — each gets its own 60s timeout + abort.
    const controller = new AbortController()
    abortControllers.set(sessionId, controller)
    const wc = getWebContents()

    const runOne = async ({ m, temperature, variant }) => {
      const start = Date.now()
      const perModel = new AbortController()
      const timeout = setTimeout(() => perModel.abort(), 60000)
      const onOuterAbort = () => perModel.abort()
      controller.signal.addEventListener('abort', onOuterAbort, { once: true })
      try {
        const messages = [{ role: 'user', content }]
        const patchGuideline = 'If your solution proposes file modifications, format them with explicit file paths and Aider-style SEARCH/REPLACE blocks (<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE) or unified diffs so the user can review and apply them directly.'
        if (personaId) {
          const p = db.getPersona(personaId)
          if (p) messages.unshift({ role: 'system', content: `${p.prompt}\n\n${patchGuideline}` })
        } else {
          messages.unshift({ role: 'system', content: patchGuideline })
        }
        const { content: answer, usage } = await completeChatMessage({
          provider: { id: m.provider_id, api_url: m.api_url, api_key: m.api_key, api_format: 'openai' },
          model: m,
          messages,
          signal: perModel.signal,
          options: temperature != null ? { temperature } : {},
        })
        const u = normalizeUsage(usage)
        const cost = u ? computeCost(m, u) : 0
        if (u) db.logUsage({
          session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens, cache_read_tokens: u.cache_read_tokens,
          cache_creation_tokens: u.cache_creation_tokens,
          cost, latency_ms: Date.now() - start, status: 200, source: 'arena',
        })
        const result = {
          model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          variant, temperature,
          content: answer, latency_ms: Date.now() - start,
          usage: u ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens, cost } : undefined,
        }
        try { wc?.send('arena:model-done', { sessionId, result }) } catch {}
        return result
      } catch (err) {
        const status = err.status || 0
        db.logUsage({ session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, latency_ms: Date.now() - start, status, source: 'arena' })
        const result = {
          model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          variant, temperature,
          content: `[Error: ${err.name === 'AbortError' ? 'aborted/timeout' : err.message}]`, latency_ms: Date.now() - start,
        }
        try { wc?.send('arena:model-done', { sessionId, result }) } catch {}
        return result
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort', onOuterAbort)
      }
    }

    const results = await Promise.all(runs.map(runOne))
    if (abortControllers.get(sessionId) === controller) abortControllers.delete(sessionId)
    for (const r of results) {
      db.addMessage({
        session_id: sessionId, role: 'assistant', content: r.content || '',
        model_used: r.model_name, provider_used: null, token_count: r.usage?.total_tokens || null,
        latency_ms: r.latency_ms || null, status: 'success',
        arena_model: r.model_name,
      })
    }
    db.touchSession(sessionId)
    return { results }
  })

  ipcMain.handle('arena:stop', (_e, sessionId) => {
    if (sessionId) {
      const c = abortControllers.get(sessionId)
      if (c) { c.abort(); abortControllers.delete(sessionId) }
    } else {
      for (const [, c] of abortControllers) c.abort()
      abortControllers.clear()
    }
  })

  ipcMain.handle('arena:vote', async (_e, data) => {
    const { prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent } = data
    const detectedIntent = intent || db.classifyIntent(prompt)
    db.recordArenaVote({ prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent: detectedIntent })
    return { success: true }
  })

  ipcMain.handle('arena:scores', () => {
    try { return db.getModelScores() } catch (e) { log.warn('arena:scores error:', e); return [] }
  })

  // Arena 2.0 leaderboard: real-traffic metrics per model (latency/cost/runs).
  ipcMain.handle('arena:metrics', () => {
    try { return db.getModelUsageMetrics() } catch (e) { log.warn('arena:metrics error:', e); return [] }
  })

  // Arena-driven dynamic workload auto-routing (review P0-4)
  ipcMain.handle('arena:auto-route', (_e, { prompt, intent } = {}) => {
    try {
      const targetIntent = intent || (prompt ? db.classifyIntent(prompt) : 'general')
      const route = db.autoRoute(targetIntent)
      return route || null
    } catch (e) {
      log.warn('arena:auto-route error:', e)
      return null
    }
  })

  // ── Arena 2.0: personal benchmark (review P0-3) ─────────────────────────
  // 用户自建任务集, 一键对选中模型重跑; 每任务每模型独立计分:
  //   - 结果非错误 → 记 1 胜(wins)
  //   - 聚合 总延迟/总成本/任务数
  // 汇总后写入 arena_benchmark.results, 前端渲染"你的工作负载的模型排行榜"。
  ipcMain.handle('arena:benchmark-list', () => {
    try { return db.listArenaBenchmarks() } catch (e) { log.warn('arena:benchmark-list error:', e); return [] }
  })

  ipcMain.handle('arena:benchmark-save', (_e, { id = null, name, tasks, modelIds }) => {
    try {
      if (!Array.isArray(tasks)) return { error: 'tasks must be an array' }
      const fallbackRoot = require('../tools/sandbox').getWorkspaceRoot() || process.cwd()
      const cleanTasks = tasks.map(t => {
        if (typeof t === 'string') return t.trim()
        if (typeof t === 'object' && t !== null) {
          const prompt = String(t.prompt || '').trim()
          const verifyCommand = sanitizeVerifyCommand(t.verifyCommand)
          const cwd = t.cwd ? resolveTaskCwd(t.cwd, fallbackRoot) : null
          const expectedExitCode = typeof t.expectedExitCode === 'number' ? t.expectedExitCode : 0
          return { prompt, verifyCommand, cwd, expectedExitCode }
        }
        return String(t || '').trim()
      }).filter(t => (typeof t === 'string' ? t.length > 0 : t.prompt.length > 0))

      return db.saveArenaBenchmark({
        id,
        name: String(name || 'benchmark').slice(0, 60),
        tasks: cleanTasks,
        modelIds: Array.isArray(modelIds) ? modelIds : [],
      })
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('arena:benchmark-delete', (_e, id) => {
    try { db.deleteArenaBenchmark(id); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('arena:benchmark-run', async (_e, { id, modelIds }) => {
    const bench = db.listArenaBenchmarks().find(b => b.id === id)
    if (!bench) return { error: 'benchmark not found' }
    const allModels = db.getAllModels()
    const selected = allModels.filter(m => modelIds.includes(m.id))
    if (!selected.length) return { error: 'no models selected' }

    const results = {}   // model_id -> { wins, runs, total_ms, total_cost }
    for (const m of selected) results[m.id] = { wins: 0, runs: 0, total_ms: 0, total_cost: 0 }

    const controller = new AbortController()
    abortControllers.set(`bench:${id}`, controller)

    try {
      const fallbackRoot = require('../tools/sandbox').getWorkspaceRoot() || process.cwd()
      for (const task of bench.tasks) {
        const isObj = typeof task === 'object' && task !== null
        const content = isObj ? String(task.prompt || '').trim() : String(task || '').trim()
        const verifyCommand = isObj ? sanitizeVerifyCommand(task.verifyCommand) : null
        const taskCwd = isObj && task.cwd ? resolveTaskCwd(task.cwd, fallbackRoot) : fallbackRoot
        const expectedExitCode = isObj && typeof task.expectedExitCode === 'number' ? task.expectedExitCode : 0
        if (!content) continue
        // 并行跑该任务下所有模型(复用 arena 并发语义), 等待全部完成
        const round = await Promise.all(selected.map(async (m) => {
          const start = Date.now()
          const perModel = new AbortController()
          const timeout = setTimeout(() => perModel.abort(), 60000)
          const onOuterAbort = () => perModel.abort()
          controller.signal.addEventListener('abort', onOuterAbort, { once: true })
          try {
            const { content: answer, usage } = await completeChatMessage({
              provider: { id: m.provider_id, api_url: m.api_url, api_key: m.api_key, api_format: 'openai' },
              model: m,
              messages: [{ role: 'user', content }],
              signal: perModel.signal,
            })
            const u = normalizeUsage(usage)
            const cost = u ? computeCost(m, u) : 0
            let ok = !!answer && !String(answer).startsWith('[Error')
            let verified = false

            // P1-09 SWE-bench: 真实测试命令校验 (Pass/Fail)
            if (ok && verifyCommand) {
              verified = true
              ok = await runVerifyCommand(verifyCommand, taskCwd, controller.signal, expectedExitCode)
            }

            return { modelId: m.id, ok, latency: Date.now() - start, cost, verified }
          } catch (err) {
            return { modelId: m.id, ok: false, latency: Date.now() - start, cost: 0, verified: false }
          } finally {
            clearTimeout(timeout)
            controller.signal.removeEventListener('abort', onOuterAbort)
          }
        }))
        for (const r of round) {
          const acc = results[r.modelId]
          if (!acc) continue
          acc.runs += 1
          acc.total_ms += r.latency
          acc.total_cost += r.cost
          if (r.ok) acc.wins += 1
          if (r.verified) {
            acc.verified_runs = (acc.verified_runs || 0) + 1
            if (r.ok) acc.verified_passes = (acc.verified_passes || 0) + 1
          }
        }
      }
    } finally {
      abortControllers.delete(`bench:${id}`)
    }

    const lastRun = new Date().toISOString()
    db.updateArenaBenchmarkResults(id, results, lastRun)
    // 附带模型名, 前端直接渲染
    const out = { lastRun, models: {}, results: {} }
    for (const m of selected) {
      out.models[m.id] = { model_name: m.model_name, provider_name: m.provider_name }
      out.results[m.id] = results[m.id]
    }
    return out
  })

  ipcMain.handle('arena:benchmark-stop', (_e, id) => {
    const c = abortControllers.get(`bench:${id}`)
    if (c) { c.abort(); abortControllers.delete(`bench:${id}`) }
  })

  // P1-09: SWE-bench & Starter Benchmark 预设套件
  ipcMain.handle('arena:benchmark-templates', () => {
    return [
      {
        id: 'starter-ts-repair',
        name: 'Starter: TypeScript 严格类型修复基准 (TS Strict Repair)',
        description: '评测模型对复杂泛型、联合类型收窄与严格 Null 检查的精确修复能力',
        tasks: [
          '修复泛型异步函数中的 PromiseSettledResult 类型收窄与 undefined 属性访问报错',
          '为未导出的嵌套 API 响应推断严格的只读深度不可变接口并消除 any 隐式逃逸',
          '修复复合组件中 ForwardRefRenderFunction 与自定义泛型 Props 的类型重载冲突',
        ],
      },
      {
        id: 'starter-pytest-healing',
        name: 'Starter: 单元测试自愈基准 (Unit Test Self-Healing)',
        description: '评测模型在面对失败断言与边界异常时，能否定位最小修复点并保证向后兼容',
        tasks: [
          '分析测试套件中的边界超时与跨时区时间格式断言失败，进行向后兼容修复',
          '处理并发写入时的临时竞态条件与空指针异常，保证幂等恢复',
          '修补参数校验逻辑中的零值与空字符串边界，使失败断言全部转绿',
        ],
      },
      {
        id: 'starter-refactor-perf',
        name: 'Starter: 架构重构与算法优化基准 (Refactor & Optimization)',
        description: '评测模型在大函数策略模式解耦与降低计算时间复杂度上的代码质量',
        tasks: [
          '将 300 行嵌套 if-else 分支重构为可扩展的策略模式字典映射，保持入参与返回值契约不变',
          '消除遍历过滤中的高频多次重复反序列化，引入惰性缓存将时间复杂度从 O(n^2) 降至 O(n)',
          '将紧耦合的全局单例事件监听重构为按会话作用域隔离的事件总线，杜绝内存泄漏隐患',
        ],
      },
      {
        id: 'swe-bench-core',
        name: 'SWE-bench 本地核心代码基准 (SWE-bench Local)',
        description: '真实代码修复与测试驱动评估，自动执行测试命令校验 Pass/Fail 率',
        verifyCommand: 'npx vitest run test/securityRegression.test.js',
        tasks: [
          '请分析当前项目中的单元测试，定位并修复问题',
          '检查项目安全边界防范与路径规范',
        ],
        objectiveTasks: [
          {
            name: '修测试与功能验证',
            prompt: '请分析当前项目中的单元测试，定位并修复问题',
            verifyCommand: 'npx vitest run test/recipes.test.js',
          },
          {
            name: '安全回归防线',
            prompt: '检查项目安全边界防范与路径规范',
            verifyCommand: 'npx vitest run test/securityRegression.test.js',
          },
        ],
      },
    ]
  })

  // Objective Arena: automated code execution + verify command benchmark with auto ELO recording
  ipcMain.handle('arena:objective-run', async (_e, data) => {
    try {
      if (!featureFlags.isEnabled(db, 'arena.objectiveArena')) {
        return { error: 'arena.objectiveArena feature flag is disabled' }
      }
      const { prompt, verifyCommand, cwd, modelIds, expectedExitCode, timeoutMs, updateScores } = data || {}
      if (!prompt || !verifyCommand) {
        return { error: 'prompt and verifyCommand are required' }
      }
      const allModels = db.getAllModels()
      const selected = Array.isArray(modelIds) ? allModels.filter(m => modelIds.includes(m.id)) : []
      if (!selected.length) return { error: 'No models selected' }

      const fallbackRoot = require('../tools/sandbox').getWorkspaceRoot() || process.cwd()
      const taskCwd = cwd ? resolveTaskCwd(cwd, fallbackRoot) : fallbackRoot
      const cleanVerifyCommand = sanitizeVerifyCommand(verifyCommand)
      if (!cleanVerifyCommand) return { error: 'Invalid verification command' }

      const rawRunId = typeof data?.runId === 'string' ? data.runId.trim() : ''
      if (!rawRunId) return { error: 'runId is required' }
      const runKey = `objective:${rawRunId}`
      if (abortControllers.has(runKey)) {
        return { error: `Duplicate runId: ${rawRunId}` }
      }
      const controller = new AbortController()
      abortControllers.set(runKey, controller)

      const safeTimeoutMs = (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs))
        ? Math.min(Math.max(Math.floor(timeoutMs), 1000), 300000)
        : 30000

      try {
        const objectiveArena = require('../llm/objectiveArena')
        const result = await objectiveArena.runObjectiveEvaluation({
          db,
          models: selected,
          prompt,
          verifyCommand: cleanVerifyCommand,
          cwd: taskCwd,
          expectedExitCode: typeof expectedExitCode === 'number' ? expectedExitCode : 0,
          timeoutMs: safeTimeoutMs,
          updateScores: updateScores !== false,
          signal: controller.signal,
        })
        return result
      } finally {
        abortControllers.delete(runKey)
      }
    } catch (err) {
      log.warn('arena:objective-run error:', err)
      return { error: err.message }
    }
  })

  ipcMain.handle('arena:objective-stop', (_e, data) => {
    const runId = data?.runId
    if (!runId) return { ok: false, error: 'runId required' }
    const runKey = `objective:${runId}`
    const controller = abortControllers.get(runKey)
    if (controller) {
      // Only signal abort — do NOT delete the key here.
      // The finally block in arena:objective-run owns the lifecycle and will
      // clean up once the underlying evaluation actually finishes, preventing a
      // race where a second run with the same runId could be started before the
      // first one has fully wound down.
      controller.abort()
      return { ok: true }
    }
    return { ok: false, error: 'Run not found or already completed' }
  })
  ipcMain.handle('arena:apply-patch', async (_e, data) => {
    const content = data?.content
    const sessionId = data?.sessionId
    const cwd = data?.cwd
    if (!content || typeof content !== 'string') {
      return { ok: false, error: 'empty_content' }
    }
    const { getWorkspaceRoot } = require('../tools/sandbox')
    let wsRoot = cwd
    if (!wsRoot && sessionId != null) {
      const cfg = db.getSessionConfig(sessionId)
      if (cfg && cfg.workspace) wsRoot = cfg.workspace
    }
    if (!wsRoot) {
      wsRoot = getWorkspaceRoot(sessionId) || getWorkspaceRoot()
    }
    if (!wsRoot || !require('fs').existsSync(wsRoot)) {
      return { ok: false, error: 'no_workspace_found' }
    }

    try {
      const { extractAndApplyPatches } = require('../llm/objectiveArena')
      const result = extractAndApplyPatches(wsRoot, content)
      return {
        ok: Boolean(result.ok && result.appliedCount > 0),
        appliedCount: result.appliedCount,
        filesModified: result.filesModified,
        conflicts: result.conflicts,
      }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

module.exports = {
  registerArenaHandlers,
  runVerifyCommand,
  sanitizeVerifyCommand,
  resolveTaskCwd,
}