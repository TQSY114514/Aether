// ─────────────────────────────────────────────────────────────────────────────
// interaction.test.js — TUI 全交互验收（todo 15）
// 6 场景键盘 E2E：进 TUI → 输入 → 审批 → 审 diff → 接受 → 退出。
// 断言状态机 JSON 序列（summarizeState 快照链）。全部 mock 模型响应，
// 无真实网络 LLM、无人工交互。ink v5 已移除 test-renderer（ink-testing-library
// 不兼容），故走计划允许的 PTY/状态机驱动路径（与 `tui --smoke` 同一机制）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tuiReducer, initialTuiState, summarizeState } from '../../tui/reducer.js'
import { keyToAction } from '../../tui/keymap.js'
import { runSession, createTuiPermissionHandler, decidePermission } from '../../tui/runSession.js'
import { createAllowRulesStore } from '../../tui/allowRules.js'
import { buildDiff, rollbackChange } from '../../tui/rollback.js'

const tmpDirs = []
function makeTempDir(prefix = 'inter-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

const stubResolve = () => ({
  provider: { id: 1, name: 'mock', api_url: 'http://127.0.0.1', api_key: 'k', api_format: 'openai' },
  model: { id: 1, model_name: 'mock-model' },
})

// 状态机驱动器：每次 dispatch 后记录 summarizeState 快照。
function makeMachine() {
  const trail = []
  let state = initialTuiState
  const dispatch = (a) => {
    state = tuiReducer(state, a)
    trail.push(summarizeState(state))
    return state
  }
  return { trail, dispatch, get state() { return state } }
}

// 可序列化的状态机 JSON 序列（供断言）
function stateJson(trail) {
  return JSON.parse(JSON.stringify(trail))
}

describe('TUI 交互验收（todo 15，6 场景）', () => {
  it('场景1 进 TUI：初始欢迎状态机快照', () => {
    const m = makeMachine()
    const s = summarizeState(initialTuiState)
    expect(s).toMatchObject({ mode: 'ask', running: false, messageCount: 0, toolCalls: [], pendingPermission: null, expandedTool: null, steeringQueue: 0, quitRequested: false })
    // 可 JSON 序列化
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    expect(m.trail).toEqual([])
  })

  it('场景2 输入+提交：INPUT→SUBMIT→流式 TEXT_DELTA→AGENT_END 状态机序列', async () => {
    const m = makeMachine()
    const scripted = async ({ onText }) => {
      onText({ text: 'hi', done: false })
      onText({ text: '!', done: true })
      return { text: 'hi!', toolCalls: [] }
    }
    // 键盘：键入 'hello'（逐字符 INPUT 追加）→ Enter（SUBMIT）
    for (const ch of 'hello') m.dispatch({ type: 'INPUT', value: m.state.input + ch })
    const before = m.state
    m.dispatch({ type: 'SUBMIT' })
    expect(m.state.running).toBe(true)
    await runSession({ dbPath: null, prompt: 'hello', dispatch: m.dispatch, resolveImpl: stubResolve, runAgentImpl: scripted })

    const seq = stateJson(m.trail)
    // 序列含 running 过渡与最终消息
    expect(seq.some((s) => s.running === true)).toBe(true)
    const last = seq[seq.length - 1]
    expect(last.running).toBe(false)
    expect(last.lastMessageText).toBe('hi!')
    expect(last.messageCount).toBe(2)
    void before
  })

  it('场景3 审批：写工具请求 → awaitingPermission 快照 → 按 y → 工具执行卡片 done', async () => {
    const dir = makeTempDir()
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'orig')
    const m = makeMachine()
    const allowRules = createAllowRulesStore()
    const resolveRef = { current: null }
    const permissionHandler = createTuiPermissionHandler({ dispatch: m.dispatch, allowRules, sessionId: 'tui', resolveRef })
    const agentImpl = async ({ requestPermission, onToolCall, onText }) => {
      const ok = await requestPermission({ name: 'write_file', args: { path: file }, risk: 'write' })
      if (!ok) return { text: 'denied', toolCalls: [] }
      onToolCall({ name: 'write_file', args: { path: file }, startedAt: Date.now() })
      writeFileSync(file, 'modified')
      onToolCall({ name: 'write_file', result: 'ok', startedAt: Date.now() })
      onText({ text: 'done', done: true })
      return { text: 'done', toolCalls: [] }
    }
    m.dispatch({ type: 'INPUT', value: 'edit a.txt' })
    m.dispatch({ type: 'SUBMIT' })
    const sessionP = runSession({ dbPath: null, prompt: 'edit a.txt', dispatch: m.dispatch, resolveImpl: stubResolve, runAgentImpl: agentImpl, requestPermission: permissionHandler })

    // agent 进入权限询问 → 状态机含 awaitingPermission 快照
    await new Promise((r) => setTimeout(r, 30))
    const seqBefore = stateJson(m.trail)
    expect(seqBefore.some((s) => s.pendingPermission === 'write_file')).toBe(true)

    // 按 y 放行
    decidePermission({ decision: 'allow', allowRules, sessionId: 'tui', resolveRef, dispatch: m.dispatch })
    await sessionP

    const seq = stateJson(m.trail)
    const awaiting = seq.findIndex((s) => s.pendingPermission === 'write_file')
    expect(awaiting).toBeGreaterThanOrEqual(0)
    const afterAwaiting = seq.slice(awaiting + 1)
    expect(afterAwaiting[0].pendingPermission).toBeNull() // 审批清除
    // 审批放行后：write_file 卡先 running 后 done
    expect(afterAwaiting.some((s) => s.toolCalls.some((t) => t.name === 'write_file' && t.status === 'running'))).toBe(true)
    expect(seq[seq.length - 1].toolCalls.some((t) => t.name === 'write_file' && t.status === 'done')).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('modified')
  })

  it('场景4 审 diff + 接受：展开快照 diff → Enter 关闭接受', async () => {
    const dir = makeTempDir()
    const file = join(dir, 'b.txt')
    writeFileSync(file, 'line1\nline2\nline3')
    const m = makeMachine()
    // 直接构造带快照的 done 工具卡（等价于权限批准后的状态）
    const snapshot = { path: file, existed: true, content: 'line1\nline2\nline3' }
    m.dispatch({ type: 'TOOL_START', entry: { name: 'edit_file', args: { path: file }, snapshot, startedAt: Date.now() } })
    writeFileSync(file, 'line1\nCHANGED\nline3')
    m.dispatch({ type: 'TOOL_END', entry: { name: 'edit_file', result: 'ok', startedAt: Date.now() } })

    // v 展开 → 计算 diff（App 逻辑：buildDiff(snapshot.content, 当前文件)）
    m.dispatch({ type: 'TOOL_EXPAND', index: 0 })
    const diff = buildDiff(snapshot.content, readFileSync(file, 'utf8'))
    m.dispatch({ type: 'TOOL_DIFF_SET', index: 0, diff })

    const seq = stateJson(m.trail)
    const expanded = seq.filter((s) => s.expandedTool === 0)
    expect(expanded.length).toBeGreaterThan(0)
    expect(m.state.toolCalls[0].diff.some((d) => d.type === 'add' && d.line === 'CHANGED')).toBe(true)
    expect(m.state.toolCalls[0].diff.some((d) => d.type === 'del' && d.line === 'line2')).toBe(true)

    // Enter 接受 → 关闭 diff 视图
    m.dispatch({ type: 'TOOL_EXPAND', index: 0 })
    expect(m.state.expandedTool).toBeNull()
    expect(stateJson(m.trail)[stateJson(m.trail).length - 1].expandedTool).toBeNull()
  })

  it('场景5 回滚 r：非 git 工作区快照还原成功', async () => {
    const dir = makeTempDir()
    const file = join(dir, 'c.txt')
    writeFileSync(file, 'original-content')
    const m = makeMachine()
    const snapshot = { path: file, existed: true, content: 'original-content' }
    m.dispatch({ type: 'TOOL_START', entry: { name: 'write_file', args: { path: file }, snapshot, startedAt: Date.now() } })
    writeFileSync(file, 'clobbered-by-tool')
    m.dispatch({ type: 'TOOL_END', entry: { name: 'write_file', result: 'ok', startedAt: Date.now() } })

    // v 展开 → r 回滚（App 逻辑：rollbackChange 双路径）
    m.dispatch({ type: 'TOOL_EXPAND', index: 0 })
    const result = await rollbackChange({ snapshot: m.state.toolCalls[0].snapshot, filePath: file, cwd: dir })
    m.dispatch({ type: 'TOOL_ROLLBACK', index: 0, result })

    expect(result.ok).toBe(true)
    expect(result.via).toBe('snapshot')
    expect(readFileSync(file, 'utf8')).toBe('original-content')
    const last = stateJson(m.trail)[stateJson(m.trail).length - 1]
    expect(last.expandedTool).toBeNull()
    expect(m.state.toolCalls[0].rollbackResult).toMatchObject({ ok: true, via: 'snapshot' })
  })

  it('场景6 退出：空闲态 Ctrl+C → quitRequested 状态机快照', () => {
    const m = makeMachine()
    const action = keyToAction({ ctrl: true, name: 'c' })
    expect(action).toEqual({ type: 'QUIT_INTENT' })
    m.dispatch(action)
    expect(m.state.quitRequested).toBe(true)
    expect(stateJson(m.trail)[stateJson(m.trail).length - 1].quitRequested).toBe(true)
  })
})
