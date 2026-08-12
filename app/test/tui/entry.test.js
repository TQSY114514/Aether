// ─────────────────────────────────────────────────────────────────────────────
// entry.test.js — TUI 入口纯函数回归（todo 1 修复：main→runInteractive argv 透传）
// 实测 bug：main() 曾漏传 argv 给 runInteractive → parseTuiOpts(undefined).length
// 崩溃（真实 TTY 才触发）。parseTuiOpts 已导出，此处锁定其行为。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createTuiStdin, parseTuiOpts } from '../../tui/index.mjs'

// fake 终端 stdin(EventEmitter 风格, 与 App 渲染探针同款)
class FakeRealStdin extends EventEmitter {
  constructor() { super(); this.isTTY = true; this._data = [] }
  resume() { return this }
  setRawMode() { return this }
  setEncoding() { return this }
  ref() { return this }
  unref() { return this }
  write(d) { this._data.push(d); return true }
  emitData(s) { this.emit('data', Buffer.from(s)) }
}

describe('createTuiStdin — 鼠标序列剥离层', () => {
  it('剥掉 SGR 鼠标序列并 emit mouse 事件, 键盘字节原样转发', async () => {
    const real = new FakeRealStdin()
    const pt = createTuiStdin(real)
    const received = []
    const mouseEvents = []
    pt.on('data', (c) => received.push(String(c)))
    pt.on('mouse', (b) => mouseEvents.push(b))

    real.emitData('\x1b[<64;10;20M')   // 滚轮上
    real.emitData('h')
    real.emitData('\x1b[<65;10;20M')   // 滚轮下
    real.emitData('i')
    await new Promise((r) => setImmediate(r))

    expect(mouseEvents).toEqual([64, 65])
    expect(received.join('')).toBe('hi')
  })

  it('无鼠标序列时原样透传', async () => {
    const real = new FakeRealStdin()
    const pt = createTuiStdin(real)
    const received = []
    pt.on('data', (c) => received.push(String(c)))
    real.emitData('hello')
    await new Promise((r) => setImmediate(r))
    expect(received.join('')).toBe('hello')
  })
})

describe('parseTuiOpts（todo 1）', () => {
  it('空参数 → 默认 undefined（不抛错）', () => {
    expect(parseTuiOpts([])).toEqual({ dbPath: undefined, modelName: undefined, apiKey: undefined, apiUrl: undefined, apiFormat: undefined, statusLineCmd: undefined })
    expect(parseTuiOpts(undefined)).toEqual({ dbPath: undefined, modelName: undefined, apiKey: undefined, apiUrl: undefined, apiFormat: undefined, statusLineCmd: undefined })
  })

  it('--db / --model 解析', () => {
    expect(parseTuiOpts(['--db', 'D:\\x\\aetherai.db', '--model', 'deepseek']))
      .toMatchObject({ dbPath: 'D:\\x\\aetherai.db', modelName: 'deepseek' })
  })

  it('--db= 等号形式解析', () => {
    expect(parseTuiOpts(['--db=C:\\d.db'])).toMatchObject({ dbPath: 'C:\\d.db' })
    expect(parseTuiOpts(['--model=m1'])).toMatchObject({ modelName: 'm1' })
  })

  it('--status-line 解析', () => {
    expect(parseTuiOpts(['--status-line', 'myscript.cmd'])).toMatchObject({ statusLineCmd: 'myscript.cmd' })
  })

  it('未知 flag 忽略', () => {
    expect(parseTuiOpts(['--foo', 'bar', '--db', 'x.db'])).toMatchObject({ dbPath: 'x.db' })
  })
})

describe('parseTuiOpts — W2-t15 启动 resume（--continue/--session/--fork）', () => {
  it('--continue → resumeContinue true（无值 flag）', () => {
    expect(parseTuiOpts(['--continue'])).toMatchObject({ resumeContinue: true })
  })

  it('--session <id> → resumeSessionId 数字', () => {
    expect(parseTuiOpts(['--session', '42'])).toMatchObject({ resumeSessionId: 42 })
  })

  it('--fork → resumeFork true', () => {
    expect(parseTuiOpts(['--fork'])).toMatchObject({ resumeFork: true })
  })

  it('--session=<id> 等号形式', () => {
    expect(parseTuiOpts(['--session=7'])).toMatchObject({ resumeSessionId: 7 })
  })

  it('三 flag 组合（--session 优先 + fork 派生）', () => {
    expect(parseTuiOpts(['--continue', '--session', '5', '--fork']))
      .toMatchObject({ resumeContinue: true, resumeSessionId: 5, resumeFork: true })
  })

  it('--session 非法值（--session abc）静默忽略，不崩溃', () => {
    expect(parseTuiOpts(['--session', 'abc']).resumeSessionId).toBeUndefined()
    expect(parseTuiOpts(['--session']).resumeSessionId).toBeUndefined() // 末尾缺值
    expect(parseTuiOpts(['--session=abc']).resumeSessionId).toBeUndefined()
    // 非法值后的其余 flag 仍正常解析
    expect(parseTuiOpts(['--session', 'abc', '--continue']).resumeContinue).toBe(true)
  })

  it('无 resume flag → 字段缺失（默认不 resume）', () => {
    const opts = parseTuiOpts(['--db', 'x.db'])
    expect(opts.resumeContinue).toBeUndefined()
    expect(opts.resumeSessionId).toBeUndefined()
    expect(opts.resumeFork).toBeUndefined()
  })
})
