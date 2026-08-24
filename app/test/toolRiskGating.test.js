// ─── Tool risk gating tests ─────────────────────────────────────────────────
// Plan-mode payloads are built from risk:'safe' tools only (toolsPayload
// filter). Anything with mutating side effects must therefore NOT be 'safe',
// or it leaks into the read-only plan payload via routeTools safeNames.
//
// Regression (CodeRabbit PR #44): the `gateway` tool exposes start/stop/send
// actions but was marked 'safe', so plan mode could start channels.
//
// registry.js requires electron transitively — mock it before importing.

import { describe, it, expect, beforeAll } from 'vitest'
import Module from 'module'

const origLoad = Module._load

beforeAll(() => {
  Module._load = function (request, ...args) {
    if (request === 'electron') return { app: { getPath: () => 'C:/Users/test/AppData/Aether' } }
    return origLoad.apply(this, [request, ...args])
  }
})

let registry
beforeAll(async () => {
  registry = await import('../electron/tools/registry')
})

describe('tool risk gating', () => {
  it('gateway is dangerous so plan-mode payloads exclude its start/stop/send actions', () => {
    const gw = registry.TOOLS.find(t => t.name === 'gateway')
    expect(gw).toBeTruthy()
    expect(gw.risk).toBe('dangerous')
  })

  it('no mutating-state tool rides as safe (spot-check the known mutators)', () => {
    const mustBeDangerous = ['gateway', 'run_command', 'write_file', 'edit_file', 'apply_patch']
    for (const name of mustBeDangerous) {
      const t = registry.TOOLS.find(x => x.name === name)
      expect(t, `${name} should exist`).toBeTruthy()
      expect(t.risk, `${name} must be dangerous`).toBe('dangerous')
    }
  })
})
