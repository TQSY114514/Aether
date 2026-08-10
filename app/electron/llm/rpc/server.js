// ─────────────────────────────────────────────────────────────────────────────
// rpc/server.js — JSONL RPC server（todo 10，纯 Node 可测试）
// stdin 读 request 帧 → 逐行处理 → stdout 写 event/result/error 帧（\n 分隔）。
// stdout 只写 JSONL 帧，绝不混人类文本。
//
// 方法宿主显式标注（M3：禁止另起炉灶重复实现）：
//   listModels      → agentCore.listModels(db)
//   listProviders   → agentCore.listProviders(db)
//   models.default  → agentCore.resolveProviderModel(db, {providerName, modelName})
//   listSessions    → session 表薄查询（taskDbAdapter 无此方法，直查列面，非业务重写）
//   session.load    → message 表薄查询（同列面）
//   session.fork    → taskDbAdapter.createSession({title, parentSessionId})
//   task.derive     → backgroundTasks.initBackgroundTasks + startTask（与 cli.js runTaskMode 同路径）
//   task.status     → backgroundTasks.getTask
//   run             → agentCore.runAgent（STREAM 事件：text/tool/plan/status/done）
// ─────────────────────────────────────────────────────────────────────────────
const agentCore = require('../agentCore')
const { taskDbAdapter } = require('../taskDbAdapter')
const { isToolStart } = require('../../tools/toolEntry')
const frames = require('./frames')

let _engine = null
function taskEngine() {
  if (!_engine) _engine = require('../backgroundTasks')
  return _engine
}

function createRpcServer({ db, deps = {} }) {
  const runAgentImpl = deps.runAgentImpl || agentCore.runAgent

  // ── 方法路由（宿主标注见文件头）──────────────────────────────────────
  const routes = {
    async listModels(reqId, params, emit) {
      const rows = agentCore.listModels(db) || []
      emit(frames.resultFrame(reqId, { models: rows }))
    },

    async listProviders(reqId, params, emit) {
      const rows = agentCore.listProviders(db) || []
      emit(frames.resultFrame(reqId, { providers: rows }))
    },

    async 'models.default'(reqId, params, emit) {
      const resolved = agentCore.resolveProviderModel(db, { providerName: params.providerName, modelName: params.modelName })
      if (!resolved) {
        emit(frames.errorFrame(reqId, 'no enabled model found. Configure one in the app or run listModels.'))
        return
      }
      emit(frames.resultFrame(reqId, resolved))
    },

    async listSessions(reqId, params, emit) {
      let rows = []
      try {
        rows = db.prepare('SELECT id, title, parent_session_id AS parentId, created_at AS createdAt FROM session ORDER BY id DESC LIMIT ?')
          .all(Number(params.limit) || 50)
      } catch {}
      emit(frames.resultFrame(reqId, { sessions: rows }))
    },

    async 'session.load'(reqId, params, emit) {
      const id = Number(params.sessionId)
      let session = null
      let messages = []
      try {
        session = db.prepare('SELECT id, title, parent_session_id AS parentId FROM session WHERE id = ?').get(id) || null
        messages = db.prepare('SELECT id, role, content, created_at AS createdAt FROM message WHERE session_id = ? ORDER BY id').all(id)
      } catch {}
      emit(frames.resultFrame(reqId, { session, messages }))
    },

    async 'session.fork'(reqId, params, emit) {
      const r = taskDbAdapter(db).createSession({ title: params.title || 'fork', parentSessionId: params.parentSessionId != null ? Number(params.parentSessionId) : null })
      emit(frames.resultFrame(reqId, { sessionId: r.lastInsertRowid }))
    },

    async 'task.derive'(reqId, params, emit) {
      const content = String(params.content || '').trim()
      if (!content) {
        emit(frames.errorFrame(reqId, 'task.derive requires params.content'))
        return
      }
      const engine = taskEngine()
      engine.initBackgroundTasks({ getWebContents: () => null, db: taskDbAdapter(db), runToolLoop: undefined })
      let modelId = params.modelId
      if (!modelId) {
        const resolved = agentCore.resolveProviderModel(db, {})
        if (!resolved) {
          emit(frames.errorFrame(reqId, 'no enabled model found'))
          return
        }
        modelId = resolved.model.id
      }
      try {
        const r = await engine.startTask({
          db: taskDbAdapter(db),
          parentSessionId: null,
          content,
          modelId: Number(modelId),
          agentMode: ['auto', 'plan', 'ask'].includes(params.agentMode) ? params.agentMode : 'ask',
          emit: () => {},
        })
        emit(frames.resultFrame(reqId, { taskId: r.taskId, sessionId: r.sessionId }))
      } catch (e) {
        emit(frames.errorFrame(reqId, `failed to derive task: ${e && e.message ? e.message : String(e)}`))
      }
    },

    async 'task.status'(reqId, params, emit) {
      const id = Number(params.taskId)
      const engine = taskEngine()
      engine.initBackgroundTasks({ getWebContents: () => null, db: taskDbAdapter(db), runToolLoop: undefined })
      const task = engine.getTask(id)
      emit(frames.resultFrame(reqId, task ? { task } : null, !!task))
    },

    async run(reqId, params, emit) {
      const prompt = String(params.prompt || '').trim()
      if (!prompt) {
        emit(frames.errorFrame(reqId, 'run requires params.prompt'))
        return
      }
      let provider = params.provider
      let model = params.model
      if (!provider || !model) {
        const resolved = agentCore.resolveProviderModel(db, { providerName: params.providerName, modelName: params.modelName })
        if (!resolved) {
          emit(frames.errorFrame(reqId, 'no enabled model found. Configure one in the app or run listModels.'))
          return
        }
        provider = provider || resolved.provider
        model = model || resolved.model
      }
      const result = await runAgentImpl({
        prompt,
        provider,
        model,
        messages: params.messages,
        agentMode: ['auto', 'plan', 'ask', 'yolo'].includes(params.agentMode) ? params.agentMode : 'auto',
        maxIterations: params.maxIterations,
        workspace: params.workspace,
        onText: (chunk) => emit(frames.eventFrame(reqId, 'text', { delta: chunk.text, done: !!chunk.done })),
        onToolCall: (entry) => {
          const isStart = isToolStart(entry)
          emit(frames.eventFrame(reqId, isStart ? 'tool:start' : 'tool:end', { entry }))
        },
        onStatus: (s) => emit(frames.eventFrame(reqId, 'status', { kind: s.kind, text: s.text })),
        onPlanStep: (step) => emit(frames.eventFrame(reqId, 'plan', { step })),
      })
      emit(frames.resultFrame(reqId, { text: result.text, toolCalls: result.toolCalls, memoryTrace: result.memoryTrace }))
    },
  }

  async function handleFrame(frame, emit) {
    if (!frames.isRequest(frame)) return null
    const { reqId, method, params = {} } = frame
    const handler = routes[method]
    if (!handler) {
      emit(frames.errorFrame(reqId, `unknown method: ${method}`))
      return null
    }
    try {
      await handler(reqId, params, emit)
    } catch (e) {
      emit(frames.errorFrame(reqId, e && e.message ? e.message : String(e)))
    }
    return null
  }

  return { handleFrame, routes }
}

/**
 * CLI 入口（cli.js --mode rpc 调用）：读 stdin 逐行 request → stdout 写帧。
 * 退出码规范（todo 11）：0 = 正常 EOF 收尾；1 = 致命错误（无 db / 循环异常），
 * 致命错误仍先向 stdout 发 error 帧（只写帧，不混人类文本）。
 * @param {{ db?: string, deps?: object }} opts  db 为 aetherai.db 路径
 * @returns {Promise<number>} 退出码
 */
async function main({ db: dbPath, deps = {} } = {}) {
  const db = agentCore.openDatabase(dbPath)
  if (!db) {
    process.stdout.write(frames.pushFrame(frames.errorFrame('0', 'no database found (run the desktop app once, or pass --db <path>).')))
    return 1
  }
  const server = createRpcServer({ db, deps })
  const readline = require('node:readline')
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  const write = (frame) => process.stdout.write(frames.pushFrame(frame))
  try {
    for await (const line of rl) {
      const frame = frames.consumeLine(line)
      if (!frame) continue
      await server.handleFrame(frame, write)
    }
  } catch (e) {
    process.stdout.write(frames.pushFrame(frames.errorFrame('0', `rpc server error: ${e && e.message ? e.message : String(e)}`)))
    return 1
  }
  return 0
}

module.exports = { createRpcServer, main }
