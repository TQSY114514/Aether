// ─────────────────────────────────────────────────────────────────────────────
// protocolUrl.test.js — aetherai:// 协议解析（todo 17）
// 验收：代码片段单测协议解析参数（open 路径参数 → workspace / tui / new / chat）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { parseProtocolUrl } = require('../electron/llm/protocolUrl.js')

describe('aetherai:// 协议解析（todo 17）', () => {
  it('open 动作 + query path 参数（Windows 路径编码）→ workspace 解码', () => {
    const r = parseProtocolUrl('aetherai://open/?path=C%3A%5Cmy%5Cproj')
    expect(r).toMatchObject({ action: 'open', workspace: 'C:\\my\\proj' })
  })

  it('open 动作 + pathname 形式 → workspace 解码', () => {
    const r = parseProtocolUrl('aetherai://open/C%3A%5Cusers%5Czhrls%5Capp')
    expect(r).toMatchObject({ action: 'open', workspace: 'C:\\users\\zhrls\\app' })
  })

  it('open 无路径参数 → 仍返回 open 动作（无 workspace）', () => {
    const r = parseProtocolUrl('aetherai://open')
    expect(r).toMatchObject({ action: 'open' })
    expect(r.workspace).toBeUndefined()
  })

  it('tui / new / chat 动作', () => {
    expect(parseProtocolUrl('aetherai://tui')).toMatchObject({ action: 'tui' })
    expect(parseProtocolUrl('aetherai://new')).toMatchObject({ action: 'new' })
    expect(parseProtocolUrl('aetherai://chat')).toMatchObject({ action: 'chat' })
  })

  it('畸形/非 aetherai 协议 → null 或降级不抛错', () => {
    expect(parseProtocolUrl('')).toBeNull()
    expect(parseProtocolUrl('https://example.com')).toBeNull()
    expect(parseProtocolUrl('not a url')).toBeNull()
    expect(parseProtocolUrl('aetherai://')).toEqual({ action: 'unknown', raw: 'aetherai://' })
  })

  it('未知动作 → 返回 hostname 降级', () => {
    const r = parseProtocolUrl('aetherai://foobar')
    expect(r).toMatchObject({ action: 'foobar' })
  })

  it('相对路径（posix 风格）也可解析', () => {
    const r = parseProtocolUrl('aetherai://open/?path=src%2Fcomponents')
    expect(r).toMatchObject({ action: 'open', workspace: 'src/components' })
  })
})
