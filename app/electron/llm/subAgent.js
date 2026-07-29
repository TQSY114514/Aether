// ───────────────────────────────────────────────────────────────────────────
// Subagent — spawn an isolated child session for complex multi-step tasks.
//
// 借鉴自 OpenCode 的 @general subagent + Hermes 的 delegation。
// 父 agent 调 task 工具 → 开新子 session(隔离上下文 + 受限权限) →
// 子 agent 自主多步执行 → 取最后一条 assistant 文本返回。
//
// 权限派生:继承父 agentMode 的限制 + 默认禁 task 工具(防递归)。
// ───────────────────────────────────────────────────────────────────────────

const { completeChatMessage } = require('./providerAdapter')
const { runToolLoop } = require('./toolLoop')
const { buildReasoningParams } = require('./reasoning')
const log = require('../logger')

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent spawned by the parent agent to handle a delegated task.
You have your own isolated context — previous conversation history is not available.
Focus solely on the task described. Use available tools as needed.
When done, provide a clear, concise summary of your findings or actions as your final response.
Do NOT call the task tool — nested sub-agents are not allowed.`

// 运行 subagent。返回最后一条 assistant 文本。
// 参数:
//   db, parentSessionId, provider, model, prompt, signal, agentMode
async function runSubagent({ db, parentSessionId, provider, model, prompt, signal, agentMode = 'plan' }) {
  if (!db || !provider || !model) {
    throw new Error('runSubagent: missing required params')
  }

  // 创建子 session(独立上下文)
  let childSessionId
  try {
    const result = db.createSession({ title: `subagent-${Date.now()}`, persona_id: null })
    childSessionId = result?.lastInsertRowid || result
  } catch (e) {
    throw new Error(`runSubagent: failed to create child session: ${e.message}`)
  }

  // 添加 user message(子 agent 的任务)
  db.addMessage({ session_id: childSessionId, role: 'user', content: prompt })

  // 构建 messages
  const messages = [
    { role: 'system', content: SUBAGENT_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  // 权限派生:子 agent 用 plan 模式(只读),除非父是 yolo(才用 auto)
  // 这样子 agent 安全,不会破坏文件
  const childAgentMode = agentMode === 'yolo' ? 'auto' : 'plan'

  const reasoningOpts = buildReasoningParams(model.model_name, 'medium')
  const opts = { ...reasoningOpts, max_tokens: 4096 }

  let finalContent = ''
  try {
    finalContent = await runToolLoop({
      provider,
      model,
      messages,
      tools: true,
      signal,
      options: opts,
      agentMode: childAgentMode,
      maxIterations: 15, // 子 agent 迭代上限更低
      sessionId: childSessionId,
      messageId: 0,
      db,
      autoCommit: false,
    })
  } catch (e) {
    log.warn('Subagent execution failed:', e?.message)
    finalContent = `Sub-agent encountered an error: ${e?.message || 'unknown'}`
  }

  // 清理:子 session 是临时的,删除它(消息也级联删除)
  try { db.deleteSession(childSessionId) } catch {}

  return finalContent || '(sub-agent returned no content)'
}

module.exports = { runSubagent, SUBAGENT_SYSTEM_PROMPT }
