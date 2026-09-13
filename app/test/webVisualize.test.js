// web_visualize.test.js — P3.4 Web 视觉验证工具测试
// 覆盖:headless 降级 / SSRF 阻断 / 参数校验 / networkPolicy 阻断 / 工具注册形状
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

// 注册表可被加载(纯 Node 环境,require('electron') 解析为路径字符串 → headless 降级)。
// 注意:registry.js 顶层不触发 BrowserWindow,仅在 run 内 require electron。
const require = createRequire(import.meta.url)
const registry = require('../electron/tools/registry')

function getTool(name) {
  const t = registry.getTool(name)
  expect(t, `tool ${name} should exist`).toBeTruthy()
  return t
}

describe('web_visualize tool registration', () => {
  it('is registered as a safe web tool with url parameter', () => {
    const t = getTool('web_visualize')
    expect(t.risk).toBe('safe')
    expect(t.parameters.properties.url.type).toBe('string')
    expect(t.parameters.required).toContain('url')
  })

  it('sits in the web tools family (next to web_fetch)', () => {
    const names = registry.TOOLS.map(t => t.name)
    const webIdx = names.findIndex((n) => n === 'web_visualize')
    expect(webIdx).toBeGreaterThan(names.findIndex((n) => n === 'web_fetch'))
  })
})

describe('web_visualize safety gates', () => {
  it('throws when url is missing', async () => {
    const t = getTool('web_visualize')
    await expect(t.run({}, {})).rejects.toThrow('url required')
  })

  it('blocks SSRF targets (private/reserved ranges) before opening a browser', async () => {
    const t = getTool('web_visualize')
    const out = await t.run({ url: 'http://127.0.0.1:8080/secret' }, {})
    expect(typeof out).toBe('string')
    expect(out.startsWith('[blocked]')).toBe(true)
  })

  it('blocks localhost hostnames', async () => {
    const t = getTool('web_visualize')
    const out = await t.run({ url: 'http://localhost:3000/' }, {})
    expect(typeof out).toBe('string')
    expect(out.startsWith('[blocked]')).toBe(true)
  })

  it('rejects malformed URLs', async () => {
    const t = getTool('web_visualize')
    const out = await t.run({ url: 'not a url' }, {})
    expect(typeof out).toBe('string')
    // checkSSRF 在 URL parse 之前先拦非 URL 输入(fail-closed),[blocked] 与 [invalid] 均为安全拒绝。
    expect(out).toMatch(/\[(blocked|invalid)\]/)
  })

  it('respects network policy when active (blocked domain)', async () => {
    const t = getTool('web_visualize')
    // policyActive=true 所需:feature_flag.network.policy=true(→ isEnabled true) + whitelist 非空
    const fakeDb = {
      getSetting: (k) => {
        if (k === 'feature_flag.network.policy') return 'true'
        if (k === 'network.policy') return 'whitelist'
        if (k === 'network.whitelist') return JSON.stringify(['allowed.example.com'])
        return null
      },
      getNetworkPolicyList: () => ({ blocked_domains: ['example.com'] }),
    }
    const out = await t.run({ url: 'https://example.com/' }, { db: fakeDb })
    expect(typeof out).toBe('string')
    expect(out.startsWith('[blocked]')).toBe(true)
  })
})

describe('web_visualize headless degradation', () => {
  it('degrades gracefully without an Electron main process', async () => {
    const t = getTool('web_visualize')
    // 在纯 Node/vitest 下 require('electron') 返回路径字符串(或抛错),BrowserWindow 非函数。
    const out = await t.run({ url: 'https://example.com/', width: 800, height: 600, waitMs: 0 }, {})
    expect(typeof out).toBe('string')
    expect(out).toBe('[web_visualize unavailable: requires Electron main process]')
    // SSRF 关起的 example.com 是公网域名,不应被 [blocked] 拦;断言是非"截图成功"形态即可。
    expect(Array.isArray(out)).toBe(false)
  })
})

// P3.4: 页面 console 捕获的格式化(纯函数,headless 下可直接测)。
describe('web_visualize formatConsoleLogs', () => {
  it('returns empty string when there is nothing to surface', () => {
    expect(registry.formatConsoleLogs([])).toBe('')
    expect(registry.formatConsoleLogs(null)).toBe('')
    expect(registry.formatConsoleLogs('not-an-array')).toBe('')
    expect(registry.formatConsoleLogs([{ level: 'info', message: 'merely noise' }])).toBe('')
    expect(registry.formatConsoleLogs([{ level: 'debug', message: 'trace' }])).toBe('')
  })

  it('surfaces warning and error entries with location', () => {
    const out = registry.formatConsoleLogs([
      { level: 'warning', message: 'React key prop missing', line: 42, url: 'https://example.com/app.js' },
      { level: 'error', message: 'TypeError: x is not a function', line: 7, url: 'https://example.com/vendor.js' },
    ])
    expect(out).toContain('Page console (warnings/errors):')
    expect(out).toContain('warning: React key prop missing (https://example.com/app.js:42)')
    expect(out).toContain('error: TypeError: x is not a function (https://example.com/vendor.js:7)')
  })

  it('omits location when line/url are missing', () => {
    const out = registry.formatConsoleLogs([{ level: 'error', message: 'bare error' }])
    expect(out).toContain('error: bare error')
    // 无 line/url 时不追加位置后缀(位置带左右括号,此处用具体形态断言)。
    expect(out).not.toMatch(/error: bare error \(/)
  })

  it('maps legacy numeric levels as a safety net', () => {
    const out = registry.formatConsoleLogs([
      { level: 2, message: 'numeric warning' },
      { level: 3, message: 'numeric error' },
    ])
    expect(out).toContain('warning: numeric warning')
    expect(out).toContain('error: numeric error')
  })

  it('caps the report at 20 lines', () => {
    const logs = Array.from({ length: 40 }, (_, i) => ({ level: 'error', message: `err ${i}` }))
    const out = registry.formatConsoleLogs(logs)
    // 输出 = 表头(Page console (warnings/errors):) + 至多 20 条内容行
    const contentLines = out.split('\n').filter(l => l && !l.includes('Page console'))
    expect(contentLines).toHaveLength(20)
    expect(out).toContain('err 0')
    expect(out).not.toContain('err 30')
  })
})

describe('web_visualize navigation and redirect guard', () => {
  it('allows safe public http/https URLs', () => {
    expect(registry.isWebNavigationAllowed('https://example.com/page', {})).toBe(true)
    expect(registry.isWebNavigationAllowed('http://example.org/', {})).toBe(true)
  })

  it('blocks private or SSRF destinations', () => {
    expect(registry.isWebNavigationAllowed('http://127.0.0.1:8080/admin', {})).toBe(false)
    expect(registry.isWebNavigationAllowed('http://localhost:3000', {})).toBe(false)
    expect(registry.isWebNavigationAllowed('http://169.254.169.254/latest/meta-data/', {})).toBe(false)
  })

  it('blocks non-http protocols like file: or javascript:', () => {
    expect(registry.isWebNavigationAllowed('file:///C:/Windows/system32', {})).toBe(false)
    expect(registry.isWebNavigationAllowed('javascript:alert(1)', {})).toBe(false)
  })

  it('validates against network policy when active', () => {
    const fakeDb = {
      getSetting: (k) => {
        if (k === 'feature_flag.network.policy') return 'true'
        if (k === 'network.policy') return 'whitelist'
        if (k === 'network.whitelist') return JSON.stringify(['allowed.example.com'])
        return null
      },
      getNetworkPolicyList: () => ({ blocked_domains: ['disallowed.com'] }),
    }
    expect(registry.isWebNavigationAllowed('https://allowed.example.com/ok', { db: fakeDb })).toBe(true)
    expect(registry.isWebNavigationAllowed('https://disallowed.com/bad', { db: fakeDb })).toBe(false)
  })
})