// ─── Plugin SDK unit tests ──────────────────────────────────────────────────
// Tests for electron/plugins/sdk.js: registerTool / registerSkill /
// registerAgent / registerProvider + directory loading from the fixture
// plugin.

import { describe, it, expect } from 'vitest'
import path from 'path'
import sdkModule from '../electron/plugins/sdk'

const { createPluginSDK } = sdkModule
const FIXTURES = path.join(__dirname, 'fixtures', 'plugins')

// ─── factory surface ────────────────────────────────────────────────────────

describe('createPluginSDK', () => {
  it('exposes the four registration APIs and listers', () => {
    const sdk = createPluginSDK()
    for (const fn of ['registerTool', 'registerSkill', 'registerAgent', 'registerProvider']) {
      expect(typeof sdk[fn]).toBe('function')
    }
    expect(Array.isArray(sdk.listTools())).toBe(true)
    expect(Array.isArray(sdk.listSkills())).toBe(true)
    expect(Array.isArray(sdk.listAgents())).toBe(true)
    expect(Array.isArray(sdk.listProviders())).toBe(true)
  })

  it('starts with empty registries', () => {
    const sdk = createPluginSDK()
    expect(sdk.listTools()).toEqual([])
    expect(sdk.listSkills()).toEqual([])
    expect(sdk.listAgents()).toEqual([])
    expect(sdk.listProviders()).toEqual([])
  })
})

// ─── registerTool ───────────────────────────────────────────────────────────

describe('registerTool', () => {
  it('registers a tool that can be invoked', () => {
    const sdk = createPluginSDK()
    const def = sdk.registerTool('sk_greet', {
      description: 'greet',
      run: ({ who } = {}) => `hi ${who}`,
    })
    expect(def.name).toBe('sk_greet')
    expect(def.plugin).toBe(true)
    expect(def.run({ who: 'a' })).toBe('hi a')
  })

  it('rejects tools without a run function', () => {
    const sdk = createPluginSDK()
    expect(() => sdk.registerTool('bad', {})).toThrow(/run/)
  })

  it('rejects missing names', () => {
    const sdk = createPluginSDK()
    expect(() => sdk.registerTool('', { run: () => {} })).toThrow(/name/)
  })
})

// ─── registerSkill / Agent / Provider ───────────────────────────────────────

describe('registerSkill / registerAgent / registerProvider', () => {
  it('registers a skill into its own registry', () => {
    const sdk = createPluginSDK()
    sdk.registerSkill('sk1', { description: 'd1', body: '# b' })
    const skills = sdk.listSkills()
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('sk1')
    expect(sdk.listAgents()).toHaveLength(0) // must not leak into agents
  })

  it('registers an agent preset', () => {
    const sdk = createPluginSDK()
    sdk.registerAgent('ag1', { description: 'agent', systemPrompt: 'sys' })
    expect(sdk.listAgents()[0].systemPrompt).toBe('sys')
  })

  it('registers a provider config', () => {
    const sdk = createPluginSDK()
    sdk.registerProvider('pv1', { apiFormat: 'anthropic', models: ['m1'] })
    const p = sdk.listProviders()[0]
    expect(p.apiFormat).toBe('anthropic')
    expect(p.models).toEqual(['m1'])
  })

  it('instances are isolated from each other', () => {
    const a = createPluginSDK()
    const b = createPluginSDK()
    a.registerTool('t1', { run: () => {} })
    expect(b.listTools()).toHaveLength(0)
  })
})

// ─── loadPluginDir ──────────────────────────────────────────────────────────

describe('loadPluginDir', () => {
  it('loads the fixture plugin and its registrations', () => {
    const sdk = createPluginSDK({ db: null })
    const count = sdk.loadPluginDir(FIXTURES)
    expect(count).toBe(1)
    expect(sdk.listTools().map(t => t.name)).toContain('sample_greet')
    expect(sdk.listSkills().map(s => s.name)).toContain('sample-skill')
    expect(sdk.listAgents().length).toBe(1)
    expect(sdk.listProviders().length).toBe(1)
  })

  it('tolerates a missing plugin directory', () => {
    const sdk = createPluginSDK()
    expect(sdk.loadPluginDir(path.join(__dirname, 'does-not-exist'))).toBe(0)
  })

  it('returns 0 when the plugin.sdk flag is disabled', () => {
    const sdk = createPluginSDK({ db: { getSetting: () => '0' } })
    expect(sdk.loadPluginDir(FIXTURES)).toBe(0)
  })
})