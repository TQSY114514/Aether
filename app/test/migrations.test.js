import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  ensureMigrationsTable,
  getAppliedMigrations,
  getMigrationStatus,
  migrateUp,
  migrateDown,
  runMigrations,
  MIGRATIONS
} from '../electron/migrations/index.js'

describe('Reversible Database Schema Migrations (P2-4)', () => {
  let db
  const TOTAL_MIGRATIONS = MIGRATIONS.length
  const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('creates schema_migrations table and starts with empty status', () => {
    ensureMigrationsTable(db)
    const applied = getAppliedMigrations(db)
    expect(applied).toEqual([])

    const status = getMigrationStatus(db)
    expect(status.currentVersion).toBe(0)
    expect(status.latestAvailableVersion).toBe(LATEST_VERSION)
    expect(status.pending.length).toBe(TOTAL_MIGRATIONS)
  })

  it('runs all migrations forward and creates tables', () => {
    const res = runMigrations(db)
    expect(res.appliedCount).toBe(TOTAL_MIGRATIONS)
    expect(res.currentVersion).toBe(LATEST_VERSION)

    const status = getMigrationStatus(db)
    expect(status.currentVersion).toBe(LATEST_VERSION)
    expect(status.pending).toEqual([])
    expect(status.applied.length).toBe(TOTAL_MIGRATIONS)

    // Verify session_plan, agent_turn_checkpoint, kg_nodes, and project exist
    const planTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_plan'").get()
    expect(planTable).toBeDefined()
    expect(planTable.name).toBe('session_plan')

    const checkpointTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_turn_checkpoint'").get()
    expect(checkpointTable).toBeDefined()

    const kgTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kg_nodes'").get()
    expect(kgTable).toBeDefined()

    const projectTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project'").get()
    expect(projectTable).toBeDefined()
  })

  it('rolls back migrations reversibly (down to targetVersion)', () => {
    runMigrations(db)

    // Rollback to version 3 (reverts v6, v5, and v4)
    const downRes = migrateDown(db, 3)
    expect(downRes.rolledBackCount).toBe(TOTAL_MIGRATIONS - 3)
    expect(downRes.currentVersion).toBe(3)

    const status = getMigrationStatus(db)
    expect(status.currentVersion).toBe(3)
    expect(status.pending.map(p => p.version)).toEqual([4, 5, 6])

    // v6 (project), v5 (kg_nodes) and v4 (agent_turn_checkpoint) should be dropped
    const projectTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project'").get()
    expect(projectTable).toBeUndefined()

    const checkpointTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_turn_checkpoint'").get()
    expect(checkpointTable).toBeUndefined()

    const kgTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kg_nodes'").get()
    expect(kgTable).toBeUndefined()

    // v3 (session_plan) should still be there
    const planTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_plan'").get()
    expect(planTable).toBeDefined()

    // Re-apply forward to latest version
    const upRes = migrateUp(db)
    expect(upRes.appliedCount).toBe(TOTAL_MIGRATIONS - 3)
    expect(upRes.currentVersion).toBe(LATEST_VERSION)

    const reloadedTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_turn_checkpoint'").get()
    expect(reloadedTable).toBeDefined()
  })

  it('can roll all the way down to 0 and re-apply from scratch', () => {
    runMigrations(db)
    const downRes = migrateDown(db, 0)
    expect(downRes.rolledBackCount).toBe(TOTAL_MIGRATIONS)
    expect(downRes.currentVersion).toBe(0)

    const status = getMigrationStatus(db)
    expect(status.currentVersion).toBe(0)
    expect(status.pending.length).toBe(TOTAL_MIGRATIONS)

    // Re-apply
    const upRes = runMigrations(db)
    expect(upRes.appliedCount).toBe(TOTAL_MIGRATIONS)
    expect(upRes.currentVersion).toBe(LATEST_VERSION)
  })
})
