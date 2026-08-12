// ─── Permission-decision logic tests: permissions.js + trustEngine.js ───────
// trustEngine is Electron-free (only requires ../logger and ../tools/registry).
// The db it touches is the sql.js-era wrapper shape (database.js's exec returns
// [{ values: [[...]] }] for SELECTs), so we fake exactly that contract.
import { describe, it, expect } from 'vitest'
import permissions from '../electron/llm/permissions'
import trustEngine from '../electron/llm/trustEngine'

// Fake db exposing the wrapper shapes trustEngine calls: exec() returning
// sql.js-style result sets, run() as a no-op.
function makeDb(trustRows = []) {
  return {
    exec: (sql) => {
      if (sql.startsWith('SELECT trust_score')) {
        return trustRows.length ? [{ values: trustRows }] : []
      }
      return []
    },
    run: () => {},
  }
}

describe('PermissionMode enum', () => {
  it('orders modes least → most permissive', () => {
    expect(permissions.PermissionMode).toEqual({
      ReadOnly: 0,
      WorkspaceWrite: 1,
      DangerFullAccess: 2,
      Prompt: 3,
      Allow: 4,
    })
  })

  it('permissionModeToString maps known values and unknowns', () => {
    expect(permissions.permissionModeToString(0)).toBe('read-only')
    expect(permissions.permissionModeToString(2)).toBe('danger-full-access')
    expect(permissions.permissionModeToString(4)).toBe('allow')
    expect(permissions.permissionModeToString(99)).toBe('unknown')
  })

  it('PermissionOverride exposes allow/deny/ask', () => {
    expect(permissions.PermissionOverride).toEqual({ Allow: 'allow', Deny: 'deny', Ask: 'ask' })
  })
})

describe('trustEngine.getPermissionMode', () => {
  it('non-dangerous tools always ask, regardless of trust', () => {
    expect(trustEngine.getPermissionMode(makeDb(), 1, 'read_file')).toBe('ask')
    expect(trustEngine.getPermissionMode(makeDb([[95, null]]), 1, 'read_file')).toBe('ask')
  })

  it('high-risk dangerous tool: trust 90 → auto, trust 96 → yolo', () => {
    expect(trustEngine.getPermissionMode(makeDb([[90, null]]), 1, 'run_command')).toBe('auto')
    expect(trustEngine.getPermissionMode(makeDb([[96, null]]), 1, 'run_command')).toBe('yolo')
  })

  it('dangerous non-high-risk tool (git_push) with trust ≥80 → auto', () => {
    expect(trustEngine.getPermissionMode(makeDb([[85, null]]), 1, 'git_push')).toBe('auto')
  })

  it('low trust + high-risk tool → forced ask', () => {
    expect(trustEngine.getPermissionMode(makeDb([[30, null]]), 1, 'write_file')).toBe('ask')
  })

  it('default / medium trust → ask', () => {
    expect(trustEngine.getPermissionMode(makeDb([[50, null]]), 1, 'git_push')).toBe('ask')
    // No session row → TRUST_INITIAL (50) applies.
    expect(trustEngine.getPermissionMode(makeDb(), 1, 'run_command')).toBe('ask')
  })
})

describe('trustEngine.getEffectiveMode', () => {
  it('yolo / plan / auto_confirm pass through', () => {
    expect(trustEngine.getEffectiveMode('yolo', 'run_command', makeDb(), 1)).toBe('yolo')
    expect(trustEngine.getEffectiveMode('plan', 'read_file', makeDb(), 1)).toBe('plan')
    expect(trustEngine.getEffectiveMode('auto_confirm', 'run_command', makeDb(), 1)).toBe('auto')
  })

  it('ask delegates to the trust engine when a session exists', () => {
    expect(trustEngine.getEffectiveMode('ask', 'read_file', makeDb(), 1)).toBe('ask')
    expect(trustEngine.getEffectiveMode('ask', 'run_command', makeDb([[90, null]]), 1)).toBe('auto')
  })

  it('ask without a session id stays ask', () => {
    expect(trustEngine.getEffectiveMode('ask', 'run_command', makeDb([[90, null]]), null)).toBe('ask')
  })

  it('unknown agent mode passes through unchanged', () => {
    expect(trustEngine.getEffectiveMode('banana', 'read_file', makeDb(), 1)).toBe('banana')
  })
})
