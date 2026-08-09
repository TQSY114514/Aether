// ─────────────────────────────────────────────────────────────────────────────
// modeClassifier — 共享 agentMode 分类器单元测试（计划 todo 7：15 例矩阵全绿，含中文）
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { classifyAgentMode } from '../electron/llm/modeClassifier'

describe('classifyAgentMode', () => {
  // ── ask：中文风险词 ─────────────────────────────────────────────────
  it('zh risk: 删除文件/目录 → ask', () => {
    const r = classifyAgentMode({ prompt: '请删除文件 C:\\temp\\a.txt 并清理目录' })
    expect(r.mode).toBe('ask')
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('zh risk: 写入配置 → ask', () => {
    expect(classifyAgentMode({ prompt: '把项目的配置写入 settings.json' }).mode).toBe('ask')
  })

  it('zh risk: 运行脚本并重启 → ask', () => {
    expect(classifyAgentMode({ prompt: '运行一下构建脚本然后重启服务' }).mode).toBe('ask')
  })

  // ── ask：英文风险词（词边界） ──────────────────────────────────────
  it('en risk: delete + run → ask', () => {
    expect(classifyAgentMode({ prompt: 'delete the file and run the tests' }).mode).toBe('ask')
  })

  it('en risk: modify config → ask', () => {
    expect(classifyAgentMode({ prompt: 'modify the config and restart the service' }).mode).toBe('ask')
  })

  // ── plan：只读意图（中英） ──────────────────────────────────────────
  it('zh readonly: 阅读并总结 → plan', () => {
    expect(classifyAgentMode({ prompt: '帮我阅读一下这个文件并总结内容' }).mode).toBe('plan')
  })

  it('zh readonly: 搜索待办 → plan', () => {
    expect(classifyAgentMode({ prompt: '搜索项目里所有待办 TODO' }).mode).toBe('plan')
  })

  it('en readonly: read + explain → plan', () => {
    expect(classifyAgentMode({ prompt: 'read the README and explain the architecture' }).mode).toBe('plan')
  })

  // ── auto：无信号 ───────────────────────────────────────────────────
  it('neutral zh → auto', () => {
    expect(classifyAgentMode({ prompt: '你好，今天天气怎么样' }).mode).toBe('auto')
  })

  it('neutral en → auto', () => {
    expect(classifyAgentMode({ prompt: 'Hello there' }).mode).toBe('auto')
  })

  // ── 边界：空 / 纯标点 / 误判防护 ──────────────────────────────────
  it('empty prompt → auto (no throw)', () => {
    const r = classifyAgentMode({ prompt: '' })
    expect(r.mode).toBe('auto')
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('punctuation-only → auto', () => {
    expect(classifyAgentMode({ prompt: '???' }).mode).toBe('auto')
  })

  it('zh false-positive guard: 删除了我的担忧 → auto (not ask)', () => {
    expect(classifyAgentMode({ prompt: '删除了我的担忧，现在我很开心' }).mode).toBe('auto')
  })

  // ── toolNames 信号 ─────────────────────────────────────────────────
  it('write tool in scope → ask (even with neutral prompt)', () => {
    const r = classifyAgentMode({ prompt: 'please help me with this', toolNames: ['edit', 'write_file'] })
    expect(r.mode).toBe('ask')
  })

  it('read-only tools in scope → plan', () => {
    const r = classifyAgentMode({ prompt: 'what files exist here', toolNames: ['read', 'grep'] })
    expect(r.mode).toBe('plan')
  })

  // ── 参数健壮性 ─────────────────────────────────────────────────────
  it('history param accepted, no throw → auto', () => {
    const r = classifyAgentMode({
      prompt: 'hi',
      history: [{ role: 'user', content: 'x' }],
      toolNames: [],
    })
    expect(r.mode).toBe('auto')
  })

  it('missing args entirely → auto (no throw)', () => {
    expect(classifyAgentMode().mode).toBe('auto')
    expect(classifyAgentMode(undefined).mode).toBe('auto')
  })
})
