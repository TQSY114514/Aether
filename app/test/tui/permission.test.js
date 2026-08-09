// ─────────────────────────────────────────────────────────────────────────────
// permission.test.js — TUI 权限审批（todo 4）
// 验收：mock makeTool write → reducer 进入 awaitingPermission；y→true；n→false；
// a→会话 allowRules 命中下次免问；非 git 工作区回滚仍成功（走写前快照还原）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tuiReducer, initialTuiState } from '../../tui/reducer.js'
import { createAllowRulesStore } from '../../tui/allowRules.js'
import { createTuiPermissionHandler, decidePermission } from '../../tui/runSession.js'
import { captureFileSnapshot, restoreSnapshot, rollbackChange, isGitRepo, buildDiff } from '../../tui/rollback.js'

const tmpDirs = []
function makeTempDir(prefix = 'perm-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

function makeHarness() {
  const dispatched = []
  const allowRules = createAllowRulesStore()
  const resolveRef = { current: null }
  const dispatch = (a) => dispatched.push(a)
  const handler = createTuiPermissionHandler({ dispatch, allowRules, sessionId: 'tui', resolveRef })
  return { dispatched, allowRules, resolveRef, handler }
}

describe('权限审批流程（todo 4）', () => {
  it('mock write 请求 → reducer 进入 awaitingPermission', async () => {
    const h = makeHarness()
    const perm = handlerOf(h)
    const pending = perm({ name: 'write_file', args: { path: 'a.txt' }, risk: 'write' })
    const state = h.dispatched.reduce(tuiReducer, initialTuiState)
    expect(state.pendingPermission).not.toBeNull()
    expect(state.pendingPermission.name).toBe('write_file')
    expect(state.pendingPermission.args.path).toBe('a.txt')
    // 未决策前 promise 仍 pending
    let settled = false
    pending.then(() => { settled = true })
    await new Promise((r) => setTimeout(r, 10))
    expect(settled).toBe(false)
  })

  it('y → 允许(true)', async () => {
    const h = makeHarness()
    const pending = h.handler({ name: 'write_file', args: { path: 'y.txt' } })
    decidePermission({ decision: 'allow', allowRules: h.allowRules, sessionId: 'tui', resolveRef: h.resolveRef, dispatch: h.dispatched.push.bind(h.dispatched) })
    expect(await pending).toBe(true)
    // awaiting 态已清除
    const state = h.dispatched.reduce(tuiReducer, initialTuiState)
    expect(state.pendingPermission).toBeNull()
  })

  it('n → 拒绝(false)', async () => {
    const h = makeHarness()
    const pending = h.handler({ name: 'run_command', args: { command: 'rm -rf x' }, risk: 'dangerous' })
    decidePermission({ decision: 'deny', allowRules: h.allowRules, sessionId: 'tui', resolveRef: h.resolveRef, dispatch: h.dispatched.push.bind(h.dispatched) })
    expect(await pending).toBe(false)
  })

  it('a → always 记入会话 allowRules，下一次同规则免问', async () => {
    const h = makeHarness()
    const p1 = h.handler({ name: 'write_file', args: { path: 'src/app.js' } })
    decidePermission({ decision: 'allow', remember: true, allowRules: h.allowRules, sessionId: 'tui', resolveRef: h.resolveRef, dispatch: h.dispatched.push.bind(h.dispatched) })
    expect(await p1).toBe(true)
    const prompts1 = h.dispatched.filter((a) => a.type === 'PERMISSION_REQUEST').length

    // 同 name + 同目录规则 → allowRules 命中，直接 true 且不再弹面板
    const p2 = h.handler({ name: 'write_file', args: { path: 'src/other.js' } })
    expect(await p2).toBe(true)
    const prompts2 = h.dispatched.filter((a) => a.type === 'PERMISSION_REQUEST').length
    expect(prompts2).toBe(prompts1) // 没有新增 PERMISSION_REQUEST

    // 不同规则（不同目录）仍要询问
    const p3 = h.handler({ name: 'write_file', args: { path: 'other-dir/x.js' } })
    expect(h.dispatched.filter((a) => a.type === 'PERMISSION_REQUEST').length).toBe(prompts1 + 1)
    decidePermission({ decision: 'deny', allowRules: h.allowRules, sessionId: 'tui', resolveRef: h.resolveRef, dispatch: h.dispatched.push.bind(h.dispatched) })
    expect(await p3).toBe(false)
  })

  it('runAgent 透传的 requestPermission 收到回调（B2 接线 a 方案）', async () => {
    const h = makeHarness()
    let received = null
    let gate
    const gateP = new Promise((r) => { gate = r })
    const agentImpl = async ({ requestPermission }) => {
      received = requestPermission
      const ok = await requestPermission({ name: 'write_file', args: { path: 'w.txt' }, risk: 'write' })
      gate(ok)
      return { text: ok ? 'ran' : 'denied', toolCalls: [] }
    }
    const { runSession } = await import('../../tui/runSession.js')
    const runP = runSession({
      dbPath: null,
      prompt: 'x',
      requestPermission: h.handler,
      dispatch: h.dispatched.push.bind(h.dispatched),
      resolveImpl: () => ({ provider: { name: 'm' }, model: { model_name: 'm' } }),
      runAgentImpl: agentImpl,
    })
    // agent 侧已进入权限询问 → reducer 进入 awaitingPermission
    await new Promise((r) => setTimeout(r, 20))
    expect(h.dispatched.some((a) => a.type === 'PERMISSION_REQUEST')).toBe(true)
    // y 放行 → agent 收到 true 并继续
    decidePermission({ decision: 'allow', allowRules: h.allowRules, sessionId: 'tui', resolveRef: h.resolveRef, dispatch: h.dispatched.push.bind(h.dispatched) })
    expect(await gateP).toBe(true)
    expect(await runP).toMatchObject({ text: 'ran' })
    // agent 收到的正是 TUI 权限回调
    expect(typeof received).toBe('function')
  })
})

// 辅助：抽取 handler（避免上面用例过度耦合）
function handlerOf(h) {
  return h.handler
}

describe('回滚双路径（todo 4 / M2）', () => {
  it('非 git 工作区：写前快照还原成功（无需 git）', async () => {
    const dir = makeTempDir()
    const file = join(dir, 'notes.txt')
    writeFileSync(file, 'hello')
    expect(isGitRepo(dir)).toBe(false) // mkdtemp 无 .git

    const snap = captureFileSnapshot(file)
    writeFileSync(file, 'world') // 工具写入后
    expect(readFileSync(file, 'utf8')).toBe('world')

    const r = await rollbackChange({ snapshot: snap, filePath: file, cwd: dir })
    expect(r.ok).toBe(true)
    expect(r.via).toBe('snapshot')
    expect(readFileSync(file, 'utf8')).toBe('hello')
  })

  it('快照还原：原文件不存在时回滚删除', async () => {
    const dir = makeTempDir()
    const file = join(dir, 'new.txt')
    const snap = captureFileSnapshot(file) // existed: false
    writeFileSync(file, 'created by tool')
    const r = restoreSnapshot(snap)
    expect(r.ok).toBe(true)
    // 文件已被删除（回滚到"写前不存在"状态）
    const { existsSync } = await import('node:fs')
    expect(existsSync(file)).toBe(false)
  })

  it('无快照且非 git → 回滚失败给出明确错误', async () => {
    const dir = makeTempDir()
    const r = await rollbackChange({ snapshot: null, filePath: join(dir, 'x.txt'), cwd: dir })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no snapshot')
  })

  it('buildDiff 生成 +/-/ctx 行', () => {
    const diff = buildDiff('a\nb\nc', 'a\nX\nc')
    const types = diff.map((d) => d.type)
    expect(types).toContain('del')
    expect(types).toContain('add')
    expect(types).toContain('ctx')
    expect(diff.find((d) => d.type === 'add').line).toBe('X')
    expect(diff.find((d) => d.type === 'del').line).toBe('b')
  })
})

describe('reducer 权限动作', () => {
  it('PERMISSION_REQUEST/DECIDE 维护 awaitingPermission 态', () => {
    let s = tuiReducer(initialTuiState, { type: 'PERMISSION_REQUEST', payload: { name: 'run_command', args: { command: 'npm i' }, risk: 'network' } })
    expect(s.pendingPermission).toMatchObject({ name: 'run_command' })
    s = tuiReducer(s, { type: 'PERMISSION_DECIDE' })
    expect(s.pendingPermission).toBeNull()
  })

  it('TOOL_ROLLBACK 记录结果并关闭展开视图', () => {
    let s = tuiReducer(initialTuiState, { type: 'TOOL_START', entry: { name: 'write_file', args: { path: 'a' } } })
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'write_file', result: 'ok' } })
    s = tuiReducer(s, { type: 'TOOL_EXPAND', index: 0 })
    expect(s.expandedTool).toBe(0)
    s = tuiReducer(s, { type: 'TOOL_ROLLBACK', index: 0, result: { ok: true, via: 'snapshot' } })
    expect(s.expandedTool).toBeNull()
    expect(s.toolCalls[0].rollbackResult).toEqual({ ok: true, via: 'snapshot' })
  })
})
