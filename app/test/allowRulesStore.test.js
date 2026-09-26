import { describe, it, expect, beforeEach } from 'vitest'
const { createAllowRulesStore } = require('../electron/ipc/toolLoopCallbacks')

describe('createAllowRulesStore (Cline & Claude Code style granular auto-approval)', () => {
  let mockDb
  let settingsTable

  beforeEach(() => {
    settingsTable = new Map()
    mockDb = {
      prepare(sql) {
        return {
          all() {
            if (sql.includes('SELECT key, value FROM settings')) {
              const rows = []
              for (const [k, v] of settingsTable.entries()) {
                if (k.startsWith('permission_rule.')) rows.push({ key: k, value: v })
              }
              return rows
            }
            return []
          },
          run(...args) {
            if (sql.includes('INSERT OR REPLACE INTO settings')) {
              settingsTable.set(args[0], args[1])
            } else if (sql.includes('DELETE FROM settings')) {
              settingsTable.delete(args[0])
            }
            return { changes: 1 }
          }
        }
      }
    }
  })

  it('matches multi-token command prefixes (e.g. git status, npm test)', () => {
    const store = createAllowRulesStore()
    // Add git status to session 101
    store.add(101, 'run_command', { command: 'git status -s' })

    // Exact and sub-args match
    expect(store.match(101, 'run_command', { command: 'git status' })).toBe(true)
    expect(store.match(101, 'run_command', { command: 'git status --porcelain' })).toBe(true)

    // Different sub-verb does NOT match (safety boundary)
    expect(store.match(101, 'run_command', { command: 'git push --force' })).toBe(false)
    expect(store.match(101, 'run_command', { command: 'git reset --hard' })).toBe(false)

    // Other session does not inherit session-scoped rule
    expect(store.match(102, 'run_command', { command: 'git status' })).toBe(false)
  })

  it('supports persisting rules to database and cross-session inheritance', () => {
    const store = createAllowRulesStore(mockDb)

    // Persist npm test rule
    store.persist(mockDb, 'run_command', 'npm test', 'allow')

    // Stored in settings
    expect(settingsTable.get('permission_rule.run_command.npm test')).toBe('allow')

    // Any session matches persisted rule
    expect(store.match(1, 'run_command', { command: 'npm test' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'npm test -- --coverage' })).toBe(true)
    expect(store.match(2, 'run_command', { command: 'npm test' })).toBe(true)

    // npm run build or npm install is blocked
    expect(store.match(1, 'run_command', { command: 'npm run build' })).toBe(false)
    expect(store.match(1, 'run_command', { command: 'npm install evil' })).toBe(false)
  })

  it('allows session rules to override persisted rules', () => {
    const store = createAllowRulesStore(mockDb)
    store.persist(mockDb, 'run_command', 'git diff', 'allow')

    // Normal session matches
    expect(store.match(1, 'run_command', { command: 'git diff' })).toBe(true)

    // Session 2 specifically denies git diff
    store.add(2, 'run_command', { command: 'git diff' }, 'deny')
    expect(store.match(2, 'run_command', { command: 'git diff' })).toBe(false)
  })

  it('supports wildcard tool and binary-level rules', () => {
    const store = createAllowRulesStore(mockDb)
    store.persist(mockDb, 'run_command', 'cargo:*', 'allow')

    // cargo check, cargo test, cargo build all match cargo:*
    expect(store.match(1, 'run_command', { command: 'cargo check' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'cargo test --lib' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'cargo build' })).toBe(true)

    // Other tool is not affected
    expect(store.match(1, 'run_command', { command: 'rm -rf /' })).toBe(false)
  })

  it('applies built-in safe presets (safe_git, test_runners, read_tools)', () => {
    const store = createAllowRulesStore(mockDb)

    const resGit = store.applyPreset(mockDb, 'safe_git')
    expect(resGit.ok).toBe(true)
    expect(resGit.added).toBeGreaterThan(3)

    expect(store.match(1, 'run_command', { command: 'git status' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'git log -n 5' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'git diff HEAD~1' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'git branch -a' })).toBe(true)

    // Non-safe git commands are not in safe_git preset
    expect(store.match(1, 'run_command', { command: 'git push' })).toBe(false)

    // Test runner preset
    const resTest = store.applyPreset(mockDb, 'test_runners')
    expect(resTest.ok).toBe(true)
    expect(store.match(1, 'run_command', { command: 'pytest -v' })).toBe(true)
    expect(store.match(1, 'run_command', { command: 'vitest run' })).toBe(true)
  })

  it('supports listAll and removePersisted', () => {
    const store = createAllowRulesStore(mockDb)
    store.persist(mockDb, 'run_command', 'pytest', 'allow')
    store.add(10, 'write_file', { path: 'src/temp.txt' }, 'allow')

    const list = store.listAll(10)
    expect(list.persisted.some(p => p.ruleKey === 'pytest')).toBe(true)
    expect(list.session.length).toBe(1)

    // Remove persisted
    store.removePersisted(mockDb, 'run_command', 'pytest')
    const listAfter = store.listAll(10)
    expect(listAfter.persisted.some(p => p.ruleKey === 'pytest')).toBe(false)
    expect(store.match(10, 'run_command', { command: 'pytest' })).toBe(false)
  })
})
