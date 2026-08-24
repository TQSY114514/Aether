// ─── TUI permission scope isolation regression (CodeRabbit #48 follow-up) ───
// The approval panel used to hardcode sessionId 'tui', so session-layer rules
// leaked across every stored session. The scope id is now derived from the
// active DB session (`tui:<dbSessionId>`). These tests pin the contract the
// handlers rely on: session-layer rules are scoped per id; the persisted
// layer ('always') is global by design.
import { describe, it, expect } from 'vitest'
import { createAllowRulesStore } from '../../tui/allowRules.js'

const ARGS = { command: 'npm test' }

describe('permission scope isolation between sessions', () => {
  it('session-layer approval does not leak to another session scope', () => {
    const store = createAllowRulesStore({ db: null })
    store.add('tui:101', 'run_command', ARGS)
    expect(store.decision('tui:101', 'run_command', ARGS)).toBe('allow')
    expect(store.decision('tui:202', 'run_command', ARGS)).not.toBe('allow')
  })

  it('list()/remove() respect the scope boundary', () => {
    const store = createAllowRulesStore({ db: null })
    store.add('tui:101', 'run_command', ARGS)
    expect(store.list('tui:101').length).toBe(1)
    expect(store.list('tui:202').length).toBe(0)
    store.remove('tui:101', store.list('tui:101')[0].key) // key 形如 name:keyOf（list 原样）
    expect(store.list('tui:101').length).toBe(0)
  })

  it('persisted layer is visible from any scope (always = global)', () => {
    const fakeDb = { prepare: () => ({ run: () => {}, get: () => null, all: () => [] }) }
    const store = createAllowRulesStore({ db: fakeDb })
    store.persist(fakeDb, 'run_command', store.keyOf('run_command', ARGS), 'allow')
    expect(store.decision('tui:101', 'run_command', ARGS)).toBe('allow')
    expect(store.decision('tui:202', 'run_command', ARGS)).toBe('allow')
  })

  it('first-turn anon approvals migrate to the real session scope', () => {
    const store = createAllowRulesStore({ db: null })
    store.add('tui:anon', 'run_command', ARGS)
    // App.mjs 迁移 effect 的存储层契约: list → setSessionRule → clear
    const scope = 'tui:301'
    for (const r of store.list('tui:anon')) store.setSessionRule(scope, r.key, r.decision)
    store.clear('tui:anon')
    expect(store.decision(scope, 'run_command', ARGS)).toBe('allow')
    expect(store.list('tui:anon').length).toBe(0)
  })
})
