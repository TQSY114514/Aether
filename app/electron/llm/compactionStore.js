// ───────────────────────────────────────────────────────────────────────────
// Session compaction state: memory cache (L1) over the sqlite
// compaction_state table (L2). All db failures degrade silently to
// memory-only — persistence is best-effort, correctness never depends on it.
// ───────────────────────────────────────────────────────────────────────────

class CompactionStore {
  constructor(resolveDb) {
    this._resolveDb = resolveDb
    this._db = undefined // lazily probed once
    this._mem = new Map()
  }

  _safeDb() {
    if (this._db === undefined) {
      try { this._db = this._resolveDb() } catch { this._db = null }
      if (this._db && typeof this._db.getCompactionState !== 'function') this._db = null
    }
    return this._db
  }

  get(sessionId) {
    if (this._mem.has(sessionId)) return this._mem.get(sessionId)
    const db = this._safeDb()
    if (!db) return null
    try {
      const row = db.getCompactionState(sessionId)
      if (!row) return null
      const st = { splitIndex: Number(row.split_index) || 0, summary: String(row.summary || '') }
      this._mem.set(sessionId, st)
      return st
    } catch { return null }
  }

  set(sessionId, splitIndex, summary) {
    this._mem.set(sessionId, { splitIndex, summary })
    const db = this._safeDb()
    if (db) { try { db.saveCompactionState(sessionId, splitIndex, summary) } catch {} }
  }

  clear(sessionId) {
    this._mem.delete(sessionId)
    const db = this._safeDb()
    if (db) { try { db.deleteCompactionState(sessionId) } catch {} }
  }
}

function _defaultResolveDb() {
  try { return require('../database') } catch { return null }
}

const defaultStore = new CompactionStore(_defaultResolveDb)

module.exports = { CompactionStore, defaultStore }
