// ─── Provider key masking / secret hygiene tests (H2, M8, M10) ──────────────
// Covers the 2026-08 security audit data-layer fixes:
//   1. provider:list / provider:get return MASKED api keys (never plaintext)
//   2. provider:update with an empty or masked api_key keeps the stored key
//   3. updateProvider column names go through the safeKeys whitelist
//   4. config:export defaults to includeSecrets=false and strips sensitive
//      settings; config:import never applies gateway_* / agent_workspace_root
//   5. settings:get / settings:getAll refuse gateway_token
//   6. getAllModels stays DECRYPTED (arena/request path must keep working)
//
// Runs against the REAL database.js + handlers with a temp SQLite file, using
// the same Electron stub trick as session-lifecycle.test.js (seed Node's
// require.cache with app.getPath → temp dir + pass-through safeStorage).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import { randomBytes } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const nodeRequire = createRequire(import.meta.url)

let database
let providerHandlers = {}
let configHandlers = {}
let settingsHandlers = {}
let tmpDir = null
let restoredEntry = null

function fakeIpcMain(sink) {
  return {
    handle(channel, fn) { sink[channel] = fn },
    emit() {},
  }
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-provider-mask-'))
  const electronPath = nodeRequire.resolve('electron')
  restoredEntry = nodeRequire.cache[electronPath]
  nodeRequire.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      app: { getPath: () => tmpDir },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from(String(s)),
        decryptString: (b) => b.toString(),
      },
    },
  }

  database = await import('../electron/database')
  database.initDatabase()

  const { registerProviderHandlers } = await import('../electron/ipc/provider.handler')
  const { registerConfigHandlers } = await import('../electron/ipc/config.handler')
  const { registerSettingsHandlers } = await import('../electron/ipc/settings.handler')
  registerProviderHandlers(fakeIpcMain(providerHandlers), database)
  registerConfigHandlers(fakeIpcMain(configHandlers), database)
  registerSettingsHandlers(fakeIpcMain(settingsHandlers), database)
})

afterAll(() => {
  if (database && typeof database.closeDatabase === 'function') database.closeDatabase()
  if (restoredEntry === undefined) {
    const electronPath = nodeRequire.resolve('electron')
    delete nodeRequire.cache[electronPath]
  }
  try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

const configuredProviderKey = process.env.AETHER_TEST_PROVIDER_API_KEY
const PLAIN_KEY = configuredProviderKey?.length >= 12
  ? configuredProviderKey
  : randomBytes(16).toString('hex')
const MASKED_KEY = `${PLAIN_KEY.slice(0, 4)}***${PLAIN_KEY.slice(-4)}`

describe('maskKey', () => {
  it('masks a long key as first4 + *** + last4', () => {
    expect(database.maskKey(PLAIN_KEY)).toBe(MASKED_KEY)
  })
  it('fully masks keys shorter than 12 chars', () => {
    expect(database.maskKey('short')).toBe('****')
    expect(database.maskKey('a'.repeat(11))).toBe('****')
  })
  it('returns empty string for nullish/empty input', () => {
    expect(database.maskKey('')).toBe('')
    expect(database.maskKey(null)).toBe('')
    expect(database.maskKey(undefined)).toBe('')
  })
})

describe('provider:list / provider:get return masked keys (H2)', () => {
  it('list returns a masked api_key, never the plaintext', () => {
    database.addProvider({ name: 'MaskTest', api_url: 'https://api.example.com', api_key: PLAIN_KEY, api_format: 'openai', enabled: 1 })
    const list = providerHandlers['provider:list']()
    const p = list.find(x => x.name === 'MaskTest')
    expect(p).toBeTruthy()
    expect(p.api_key).toBe(MASKED_KEY)
    expect(JSON.stringify(list)).not.toContain(PLAIN_KEY)
  })
  it('get returns a masked api_key', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    const got = providerHandlers['provider:get'](null, p.id)
    expect(got.api_key).toBe(MASKED_KEY)
    expect(JSON.stringify(got)).not.toContain(PLAIN_KEY)
  })
  it('the decrypted channel still exposes the real key for the LLM request path', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    const dec = database.getProviderDecrypted(p.id)
    expect(dec.api_key).toBe(PLAIN_KEY)
    const all = database.getProvidersDecrypted()
    expect(all.find(x => x.name === 'MaskTest').api_key).toBe(PLAIN_KEY)
  })
  it('getAllModels stays decrypted (arena/request headers depend on it)', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    database.addModel({ provider_id: p.id, model_name: 'mask-test-model' })
    const m = database.getAllModels().find(x => x.model_name === 'mask-test-model')
    expect(m.api_key).toBe(PLAIN_KEY)
  })
})

describe('provider:update key semantics (H2 edit = keep unless changed)', () => {
  it('an empty api_key does not overwrite the stored key', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    providerHandlers['provider:update'](null, p.id, { name: 'MaskTest', api_url: 'https://api.example.com', api_key: '' })
    expect(database.getProviderDecrypted(p.id).api_key).toBe(PLAIN_KEY)
  })
  it('a masked api_key (form round-trip) does not overwrite the stored key', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    providerHandlers['provider:update'](null, p.id, { api_key: MASKED_KEY })
    expect(database.getProviderDecrypted(p.id).api_key).toBe(PLAIN_KEY)
  })
  it('a genuinely new api_key is stored (re-encrypted)', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    providerHandlers['provider:update'](null, p.id, { api_key: 'sk-rotated-9999-xy' })
    expect(database.getProviderDecrypted(p.id).api_key).toBe('sk-rotated-9999-xy')
    providerHandlers['provider:update'](null, p.id, { api_key: PLAIN_KEY })
    expect(database.getProviderDecrypted(p.id).api_key).toBe(PLAIN_KEY)
  })
  it('non-whitelisted (injected) column names are dropped by safeKeys (M8)', () => {
    const p = providerHandlers['provider:list']().find(x => x.name === 'MaskTest')
    expect(() =>
      providerHandlers['provider:update'](null, p.id, { 'name = ?, api_format': 'evil' })
    ).not.toThrow()
    const after = database.getProviderDecrypted(p.id)
    expect(after.name).toBe('MaskTest')
    expect(after.api_format).toBe('openai')
  })
})

describe('config:export / config:import secret hygiene (H2, M10)', () => {
  it('export defaults to includeSecrets=false and strips sensitive settings', async () => {
    await database.setSetting('gateway_token', 'gt-secret-1')
    await database.setSetting('gateway_port', '19999')
    await database.setSetting('agent_workspace_root', 'D:\\somewhere')
    await database.setSetting('mask_test_flag', '1')

    const res = await configHandlers['config:export'](null, {})
    expect(res.success).toBe(true)
    const provider = res.bundle.providers.find(x => x.name === 'MaskTest')
    expect(provider.api_key).toBe('')
    expect(JSON.stringify(res.bundle)).not.toContain(PLAIN_KEY)
    expect(JSON.stringify(res.bundle)).not.toContain('gt-secret-1')
    expect(res.bundle.settings.mask_test_flag).toBe('1')
    expect(res.bundle.settings.gateway_token).toBeUndefined()
    expect(res.bundle.settings.gateway_port).toBeUndefined()
    expect(res.bundle.settings.agent_workspace_root).toBeUndefined()
  })

  it('export with explicit includeSecrets=true carries the real key', async () => {
    const res = await configHandlers['config:export'](null, { includeSecrets: true })
    const provider = res.bundle.providers.find(x => x.name === 'MaskTest')
    expect(provider.api_key).toBe(PLAIN_KEY)
  })

  it('import never applies gateway_* / agent_workspace_root settings', async () => {
    const bundle = {
      providers: [],
      models: [],
      personas: [],
      sessions: [],
      messages: [],
      memories: [],
      settings: {
        gateway_token: 'evil-token',
        gateway_port: '6666',
        agent_workspace_root: 'D:\\evil',
        mask_import_flag: '1',
      },
      arenaVotes: [],
      modelScores: [],
    }
    const res = await configHandlers['config:import'](null, bundle, { mode: 'merge' })
    expect(res.success).toBe(true)
    expect(database.getSetting('gateway_token')).toBe('gt-secret-1')
    expect(database.getSetting('gateway_port')).toBe('19999')
    expect(database.getSetting('agent_workspace_root')).toBe('D:\\somewhere')
    expect(database.getSetting('mask_import_flag')).toBe('1')
  })

  it('import re-encrypts provider keys through the local safeStorage', async () => {
    const bundle = {
      providers: [{ name: 'Imported', api_url: 'https://import.example.com', api_key: 'sk-imported-key-99', api_format: 'openai', enabled: 1 }],
      models: [], personas: [], sessions: [], messages: [], memories: [], settings: {},
      arenaVotes: [], modelScores: [],
    }
    const res = await configHandlers['config:import'](null, bundle, { mode: 'merge' })
    expect(res.success).toBe(true)
    expect(res.created.providers).toBe(1)
    const imported = database.getProvidersDecrypted().find(x => x.name === 'Imported')
    expect(imported.api_key).toBe('sk-imported-key-99')
    // the renderer-facing list still masks it
    const masked = database.getProviders().find(x => x.name === 'Imported')
    expect(masked.api_key).toBe('sk-i***y-99')
  })
})

describe('settings:get denylist (H2)', () => {
  it('refuses gateway_token and gateway_* keys', async () => {
    expect(settingsHandlers['settings:get'](null, 'gateway_token')).toBeNull()
    expect(settingsHandlers['settings:get'](null, 'gateway_port')).toBeNull()
    expect(settingsHandlers['settings:get'](null, 'agent_workspace_root')).toBeNull()
  })
  it('still serves non-sensitive keys', () => {
    expect(settingsHandlers['settings:get'](null, 'mask_test_flag')).toBe('1')
  })
  it('settings:getAll omits sensitive keys', () => {
    const all = settingsHandlers['settings:getAll']()
    expect(all.gateway_token).toBeUndefined()
    expect(all.gateway_port).toBeUndefined()
    expect(all.agent_workspace_root).toBeUndefined()
    expect(all.mask_test_flag).toBe('1')
  })
})
