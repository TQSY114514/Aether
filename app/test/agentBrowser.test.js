// agentBrowser.test.js — Agent-Dedicated Browser Environment (Web ACI & Autonomous Validation)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const registry = require('../electron/tools/registry')
const toolRouter = require('../electron/llm/toolRouter')
const agentBrowser = require('../electron/browser/agentBrowser')
const capabilityPolicy = require('../electron/llm/capabilityPolicy')

function getTool(name) {
  const t = registry.getTool(name)
  expect(t, `tool ${name} should exist`).toBeTruthy()
  return t
}

describe('agent_browser tool registration', () => {
  it('is registered as safe tool with required action parameter', () => {
    const t = getTool('agent_browser')
    expect(t.risk).toBe('dangerous')
    expect(t.parameters.properties.action.type).toBe('string')
    expect(t.parameters.properties.action.enum).toEqual([
      'open', 'snapshot', 'click', 'type', 'scroll', 'console', 'close'
    ])
    expect(t.parameters.required).toContain('action')
  })

  it('declares interactive ACI parameters', () => {
    const t = getTool('agent_browser')
    const props = t.parameters.properties
    expect(props.url).toBeDefined()
    expect(props.ref).toBeDefined()
    expect(props.selector).toBeDefined()
    expect(props.text).toBeDefined()
    expect(props.direction).toBeDefined()
    expect(props.waitMs).toBeDefined()
    expect(props.captureScreenshot).toBeDefined()
  })

  it('is mapped to network capability axis', () => {
    expect(capabilityPolicy.axisFor('agent_browser')).toBe(capabilityPolicy.AXES.NETWORK)
  })
})

describe('agent_browser tool routing', () => {
  it('includes browser category in tool router', () => {
    expect(toolRouter._categories.browser).toContain('agent_browser')
    expect(toolRouter._categories.browser).toContain('web_visualize')
  })

  it('routes to browser category on web and UI keywords (English and Chinese)', () => {
    const r1 = toolRouter.routeTools({
      prompt: '打开 localhost:3000 查看前端页面有没有报错',
      allToolNames: ['read_file', 'agent_browser', 'git_status'],
      safeNames: new Set(['read_file', 'agent_browser', 'git_status']),
    })
    expect(r1.has('agent_browser')).toBe(true)

    const r2 = toolRouter.routeTools({
      prompt: 'Click the submit button and check dom snapshot',
      allToolNames: ['read_file', 'agent_browser', 'git_status'],
      safeNames: new Set(['read_file', 'agent_browser', 'git_status']),
    })
    expect(r2.has('agent_browser')).toBe(true)

    const r3 = toolRouter.routeTools({
      prompt: '请访问网站并点击按钮',
      allToolNames: ['read_file', 'agent_browser', 'git_status'],
      safeNames: new Set(['read_file', 'agent_browser', 'git_status']),
    })
    expect(r3.has('agent_browser')).toBe(true)
  })

  it('injects browser tools in staged verify stage', () => {
    expect(toolRouter._stageCategories.verify).toContain('browser')
  })
})

describe('agent_browser navigation safety gates', () => {
  it('allows localhost and 127.0.0.1 for local dev server testing', async () => {
    const res1 = await agentBrowser.isBrowserNavigationAllowed('http://localhost:3000/app', {})
    expect(res1.ok).toBe(true)

    const res2 = await agentBrowser.isBrowserNavigationAllowed('http://127.0.0.1:5173/', {})
    expect(res2.ok).toBe(true)

    const syncRes = agentBrowser.isBrowserNavigationAllowedSync('http://localhost:8080/', {})
    expect(syncRes.ok).toBe(true)
  })

  it('blocks 0.0.0.0 explicitly (not treated as loopback)', async () => {
    const res = await agentBrowser.isBrowserNavigationAllowed('http://0.0.0.0:8000/', {})
    expect(res.ok).toBe(false)

    const syncRes = agentBrowser.isBrowserNavigationAllowedSync('http://0.0.0.0:8000/', {})
    expect(syncRes.ok).toBe(false)
  })

  it('blocks cloud metadata endpoints strictly', async () => {
    const res1 = await agentBrowser.isBrowserNavigationAllowed('http://169.254.169.254/latest/meta-data/', {})
    expect(res1.ok).toBe(false)
    expect(res1.reason).toContain('metadata')

    const res2 = await agentBrowser.isBrowserNavigationAllowed('http://metadata.google.internal/computeMetadata/v1/', {})
    expect(res2.ok).toBe(false)
    expect(res2.reason).toContain('metadata')
  })

  it('blocks non-http protocols', async () => {
    const res1 = await agentBrowser.isBrowserNavigationAllowed('javascript:alert(1)', {})
    expect(res1.ok).toBe(false)

    const res2 = await agentBrowser.isBrowserNavigationAllowed('file:///C:/Windows/win.ini', {})
    expect(res2.ok).toBe(false)
  })

  it('blocks private intranet ranges for external domains', async () => {
    const res = await agentBrowser.isBrowserNavigationAllowed('http://10.0.0.1/admin', {})
    expect(res.ok).toBe(false)
  })

  it('blocks IPv6 private and unique local ranges (fc00::/7 and fe80::/10)', async () => {
    const res1 = await agentBrowser.isBrowserNavigationAllowed('http://[fc00::1]:8080/', {})
    expect(res1.ok).toBe(false)

    const res2 = await agentBrowser.isBrowserNavigationAllowed('http://[fe80::1]:8080/', {})
    expect(res2.ok).toBe(false)
  })

  it('fails closed when network policy evaluation fails or blocks', async () => {
    const fakeDbBlock = {
      getSetting: (k) => {
        if (k === 'feature_flag.network.policy') return 'true'
        if (k === 'network.policy') return 'block'
        return null
      },
    }
    const resBlock = await agentBrowser.isBrowserNavigationAllowed('https://malicious.example.com/', { db: fakeDbBlock })
    expect(resBlock.ok).toBe(false)

    const fakeDbErr = {
      getSetting: () => {
        throw new Error('corrupt db settings')
      },
    }
    const resErr = await agentBrowser.isBrowserNavigationAllowed('https://example.com/', { db: fakeDbErr })
    expect(resErr.ok).toBe(false)
    expect(resErr.reason).toMatch(/network policy evaluation failed/)
  })
})

describe('agent_browser parameter validation, plan mode and feature flags', () => {
  afterEach(() => {
    agentBrowser.closeAllSessions()
  })

  it('requires action parameter', async () => {
    await expect(agentBrowser.executeBrowserAction('test-sess', {})).rejects.toThrow('Action required')
  })

  it('requires url parameter for open action', async () => {
    await expect(agentBrowser.executeBrowserAction('test-sess', { action: 'open' })).rejects.toThrow('url parameter is required')
  })

  it('requires ref or selector for click action', async () => {
    await expect(agentBrowser.executeBrowserAction('test-sess', { action: 'click' })).rejects.toThrow('ref')
  })

  it('requires ref or selector for type action', async () => {
    await expect(agentBrowser.executeBrowserAction('test-sess', { action: 'type' })).rejects.toThrow('ref')
  })

  it('rejects unknown action', async () => {
    await expect(agentBrowser.executeBrowserAction('test-sess', { action: 'fly_to_moon' })).rejects.toThrow('Unknown action')
  })

  it('blocks mutating actions in plan mode', async () => {
    const resClick = await agentBrowser.executeBrowserAction('test-sess', { action: 'click', ref: '@1' }, { agentMode: 'plan' })
    expect(resClick).toContain('blocked in plan mode')

    const resType = await agentBrowser.executeBrowserAction('test-sess', { action: 'type', ref: '@1', text: 'hi' }, { agentMode: 'plan' })
    expect(resType).toContain('blocked in plan mode')
  })

  it('respects feature flag when agent.browser is disabled', async () => {
    const fakeDbDisabled = {
      getSetting: (k) => {
        if (k === 'feature_flag.agent.browser') return '0'
        return null
      },
    }
    const res = await agentBrowser.executeBrowserAction('test-sess', { action: 'open', url: 'http://localhost:3000' }, { db: fakeDbDisabled })
    expect(res).toContain('disabled by feature flag')

    const t = getTool('agent_browser')
    const toolRes = await t.run({ action: 'open', url: 'http://localhost:3000' }, { db: fakeDbDisabled })
    expect(toolRes).toContain('disabled by feature flag')
  })

  it('degrades gracefully in headless Node environment without Electron', async () => {
    const t = getTool('agent_browser')
    const res = await t.run({ action: 'open', url: 'http://localhost:3000' }, { sessionId: 'test-sess' })
    expect(typeof res).toBe('string')
    expect(res).toContain('agent_browser error')
    expect(res).toContain('requires Electron desktop environment')
  })

  it('supports close action without needlessly instantiating a session', async () => {
    const res = await agentBrowser.executeBrowserAction('non-existent-session-123', { action: 'close' })
    expect(res).toBe('No active browser session.')
  })

  it('excludes agent_browser from plan mode toolsPayload and when disabled', () => {
    const { toolsPayload } = require('../electron/tools/registry')
    const planPayload = toolsPayload('plan')
    const planNames = planPayload.map(p => p.function.name)
    expect(planNames).not.toContain('agent_browser')

    const fakeDbDisabled = {
      getSetting: (k) => {
        if (k === 'feature_flag.agent.browser') return '0'
        return null
      },
    }
    const disabledPayload = toolsPayload('auto', { db: fakeDbDisabled })
    const disabledNames = disabledPayload.map(p => p.function.name)
    expect(disabledNames).not.toContain('agent_browser')
  })
})

describe('agent_browser session status and lifecycle', () => {
  afterEach(() => {
    agentBrowser.closeAllSessions()
  })

  it('reports inactive when no browser session is open', () => {
    const status = agentBrowser.getBrowserStatus('non-existent-session')
    expect(status.active).toBe(false)
  })

  it('closes session and cleans up correctly', () => {
    expect(agentBrowser.closeBrowserSession('non-existent-session')).toBe(false)
    agentBrowser.closeAllSessions()
  })
})
