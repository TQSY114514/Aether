// ─────────────────────────────────────────────────────────────────────────────
// electron/migrations/index.js — Reversible Database Schema Migration Engine
//
// Manages versioned database migrations with strictly reversible up() and down()
// steps. Stores applied migrations in `schema_migrations` table.
// ─────────────────────────────────────────────────────────────────────────────

const log = require('../logger')

const MIGRATIONS = [
  require('./001_initial_schema'),
  require('./002_agent_task_journal'),
  require('./003_session_plan_checklist'),
  require('./004_turn_checkpoint_index'),
  require('./005_deepwiki_kg_relations'),
].sort((a, b) => a.version - b.version)

/**
 * Ensure the `schema_migrations` tracking table exists.
 * @param {import('better-sqlite3').Database} db
 */
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

/**
 * Get all applied migrations from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ version: number, name: string, applied_at: string }>}
 */
function getAppliedMigrations(db) {
  ensureMigrationsTable(db)
  return db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC').all()
}

/**
 * Get current migration status.
 * @param {import('better-sqlite3').Database} db
 */
function getMigrationStatus(db) {
  ensureMigrationsTable(db)
  const applied = getAppliedMigrations(db)
  const appliedVersions = new Set(applied.map(m => m.version))
  const currentVersion = applied.length > 0 ? applied[applied.length - 1].version : 0
  const latestAvailableVersion = MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].version : 0
  const pending = MIGRATIONS.filter(m => !appliedVersions.has(m.version))
  return {
    currentVersion,
    latestAvailableVersion,
    applied,
    pending: pending.map(p => ({ version: p.version, name: p.name })),
  }
}

/**
 * Run pending migrations up to targetVersion (or all available migrations if omitted).
 * @param {import('better-sqlite3').Database} db
 * @param {number} [targetVersion]
 * @returns {{ appliedCount: number, currentVersion: number }}
 */
function migrateUp(db, targetVersion = null) {
  ensureMigrationsTable(db)
  const applied = new Set(getAppliedMigrations(db).map(m => m.version))
  const target = targetVersion != null ? targetVersion : Infinity

  let appliedCount = 0
  const toRun = MIGRATIONS.filter(m => !applied.has(m.version) && m.version <= target)

  for (const m of toRun) {
    log.info(`[migration] Applying migration v${m.version}: ${m.name}`)
    const runTx = db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run(m.version, m.name)
    })
    runTx()
    appliedCount++
  }

  const status = getMigrationStatus(db)
  return { appliedCount, currentVersion: status.currentVersion }
}

/**
 * Rollback migrations down to targetVersion.
 * Migrations with version > targetVersion will be rolled back in reverse (descending) order.
 * @param {import('better-sqlite3').Database} db
 * @param {number} targetVersion
 * @returns {{ rolledBackCount: number, currentVersion: number }}
 */
function migrateDown(db, targetVersion = 0) {
  ensureMigrationsTable(db)
  const appliedList = getAppliedMigrations(db)
  const appliedMap = new Map(MIGRATIONS.map(m => [m.version, m]))

  const toRollback = appliedList
    .filter(m => m.version > targetVersion)
    .reverse()

  let rolledBackCount = 0

  for (const m of toRollback) {
    const migration = appliedMap.get(m.version)
    if (!migration) {
      log.warn(`[migration] Warning: Migration v${m.version} not found in registered migrations code, skipping down()`)
      continue
    }
    log.info(`[migration] Reverting migration v${m.version}: ${m.name}`)
    const rollbackTx = db.transaction(() => {
      if (typeof migration.down === 'function') {
        migration.down(db)
      }
      db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(m.version)
    })
    rollbackTx()
    rolledBackCount++
  }

  const status = getMigrationStatus(db)
  return { rolledBackCount, currentVersion: status.currentVersion }
}

/**
 * Standard startup runner: apply all pending migrations.
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  return migrateUp(db)
}

module.exports = {
  MIGRATIONS,
  ensureMigrationsTable,
  getAppliedMigrations,
  getMigrationStatus,
  migrateUp,
  migrateDown,
  runMigrations,
}
