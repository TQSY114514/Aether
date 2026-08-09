// ─────────────────────────────────────────────────────────────────────────────
// toolCards.test.js — 工具调用卡（todo 3）
// 纯函数：summarizeTool / truncateLines / summarizeArgs / TOOL_STATUS 状态色映射。
// 渲染：ink render 探针（假 stdout）断言 3 张卡（running/done/error）的名称与
// 状态标签出现在输出帧中。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
// ink 仅安装在 app/tui/node_modules（TUI 局部依赖），测试从相对路径直引入口。
import { render, Box, Text } from '../../tui/node_modules/ink/build/index.js'
import { summarizeTool, truncateLines, summarizeArgs, TOOL_STATUS } from '../../tui/toolCards.js'

describe('summarizeTool（纯函数）', () => {
  it('running：startedAt 有值且 result/error 空 → running + 黄', () => {
    const t = summarizeTool({ name: 'read', args: { path: 'a.txt' }, startedAt: Date.now() })
    expect(t.status).toBe('running')
    expect(t.color).toBe(TOOL_STATUS.running.color)
    expect(t.summary).toContain('a.txt')
  })

  it('done：有 result → done + 绿', () => {
    const t = summarizeTool({ name: 'grep', result: 'found 3 matches', startedAt: Date.now() })
    expect(t.status).toBe('done')
    expect(t.color).toBe(TOOL_STATUS.done.color)
    expect(t.summary).toContain('found 3 matches')
  })

  it('error：有 error → error + 红', () => {
    const t = summarizeTool({ name: 'write', error: 'permission denied', startedAt: Date.now() })
    expect(t.status).toBe('error')
    expect(t.color).toBe(TOOL_STATUS.error.color)
    expect(t.summary).toContain('permission denied')
  })
})

describe('truncateLines', () => {
  it('≤80 行原样返回', () => {
    const s = 'line1\nline2'
    expect(truncateLines(s)).toBe(s)
  })

  it('>80 行截断并注明省略行数', () => {
    const s = Array.from({ length: 85 }, (_, i) => `line${i + 1}`).join('\n')
    const out = truncateLines(s)
    expect(out.split('\n').length).toBe(81) // 80 行 + 省略说明
    expect(out).toContain('… (5 more lines)')
    expect(out).toContain('line1')
    expect(out).not.toContain('line85')
  })

  it('null/undefined 安全', () => {
    expect(truncateLines(null)).toBe('')
    expect(truncateLines(undefined)).toBe('')
  })
})

describe('summarizeArgs', () => {
  it('JSON 摘要 + 超长截断', () => {
    expect(summarizeArgs({ path: 'x' })).toBe('{"path":"x"}')
    const big = { data: 'x'.repeat(300) }
    const out = summarizeArgs(big)
    // 117 字符 + 1 个省略号 = 118
    expect(out.length).toBe(118)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('工具卡渲染（ink render 探针）', () => {
  it('3 张卡（running/done/error）名称与状态标签出现在渲染输出', async () => {
    const entries = [
      { name: 'read_file', args: { path: 'src/a.js' }, startedAt: Date.now() },
      { name: 'run_tests', result: '42 passed', startedAt: Date.now() },
      { name: 'write_file', error: 'denied', startedAt: Date.now() },
    ]
    const frames = []
    const fakeStdout = {
      write: (c) => { frames.push(String(c)); return true },
      on: () => fakeStdout,
      off: () => fakeStdout,
      emit: () => fakeStdout,
      isTTY: true,
      columns: 100,
      rows: 40,
      cursorTo: () => Promise.resolve(),
      clearLine: () => Promise.resolve(),
      moveCursor: () => Promise.resolve(),
      clearScreenDown: () => Promise.resolve(),
    }
    const { unmount } = render(
      h(Box, null, entries.map((e, i) => h(ToolCardProxy, { key: i, entry: e }))),
      { stdout: fakeStdout, patchConsole: false },
    )
    await new Promise((r) => setTimeout(r, 200))
    unmount()
    const out = frames.join('')
    expect(out).toContain('read_file')
    expect(out).toContain('run_tests')
    expect(out).toContain('write_file')
    expect(out).toContain('[RUN]')
    expect(out).toContain('[OK]')
    expect(out).toContain('[ERR]')
  })
})

// 探针用：直接渲染 summarizeTool 的产物（App 里 ToolCard 用的同款字段）
function ToolCardProxy({ entry }) {
  const t = summarizeTool(entry)
  const meta = TOOL_STATUS[t.status] || TOOL_STATUS.done
  return h(Box, { borderStyle: 'single', borderColor: meta.color, paddingX: 1, flexDirection: 'column' },
    h(Text, { color: meta.color }, `[${meta.label}] ${t.name}`),
    h(Text, { color: 'gray' }, String(t.summary || '')),
  )
}
