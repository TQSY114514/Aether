// ───────────────────────────────────────────────────────────────────────────
// Knowledge Graph — entity-relationship layer on top of flat autoMemory.
//
// Inspired by Hermes' memory_manager.py. While autoMemory stores flat
// [ENTITY]/[FACT] lines with keyword search, this module builds a directed
// graph so queries can expand through 1-hop neighbours:
//   "Alice works on X" + "X uses Y" → search "Alice" finds Y too.
//
// Two tables:
//   kg_nodes — deduplicated entity entries
//   kg_edges — directed relationships with confidence scores
//
// Architecture: overlay, not replacement. Existing memory table stays.
// This module extracts entities+relations from autoMemory sync output
// and populates kg_nodes/kg_edges. prefetch() is rewritten to do a
// graph-expansion step before keyword search.
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

const MAX_GRAPH_RESULTS = 10
const MIN_CONFIDENCE = 0.3
const GRAPH_WINDOW = 50 // last N memories to scan for graph building

// ─── Build graph from raw memory rows ──────────────────────────────────────
// Called once after autoMemory sync completes. Extracts entities and relations
// from the memory rows and upserts into kg_nodes/kg_edges.

function buildGraph(db) {
  try {
    const memories = db.getMemories(GRAPH_WINDOW) || []
    const nodeSet = new Map() // entity_name -> { type, count }
    const edgeSet = new Map() // "from|to|relation" -> confidence

    for (const mem of memories) {
      const content = String(mem.content || '').trim()
      const type = String(mem.type || 'fact')

      // ENTITY lines: "name|description" — extract the entity name (first pipe segment).
      if (type === 'entity') {
        const name = content.split('|')[0].trim().toLowerCase()
        if (name && name.length > 1) {
          const entry = nodeSet.get(name)
          if (entry) entry.count++
          else nodeSet.set(name, { type: 'entity', count: 1 })
        }
      }

      // RELATION lines: "entity1|relation_type|entity2"
      if (type === 'relation') {
        const parts = content.split('|')
        if (parts.length >= 3) {
          const from = parts[0].trim().toLowerCase()
          const rel = parts[1].trim().toLowerCase()
          const to = parts.slice(2).join('|').trim().toLowerCase()
          if (from && rel && to && from.length > 0 && to.length > 0) {
            const key = `${from}|${to}|${rel}`
            const entry = edgeSet.get(key)
            if (entry) entry.confidence = Math.min(1.0, entry.confidence + 0.2)
            else edgeSet.set(key, { from, to, relation: rel, confidence: 0.8 })
          }
        }
      }

      // FACT lines: try to extract implicit entities (capitalised words that look like names).
      if (type === 'fact') {
        const matches = content.match(/\b([A-Z][a-zA-Z]{2,})\b/g)
        if (matches) {
          for (const name of matches) {
            const lower = name.toLowerCase()
            const entry = nodeSet.get(lower)
            if (entry) entry.count++
            else nodeSet.set(lower, { type: 'fact_entity', count: 1 })
          }
        }
      }
    }

    // Upsert nodes.
    for (const [name, info] of nodeSet) {
      try {
        const existing = db.exec(
          `SELECT id FROM kg_nodes WHERE entity = ? LIMIT 1`, [name]
        )[0]?.values?.[0]
        if (existing) {
          db.run(`UPDATE kg_nodes SET type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [info.type, existing[0]])
        } else {
          db.run(`INSERT INTO kg_nodes (entity, type) VALUES (?, ?)`, [name, info.type])
        }
      } catch (e) {
        log.debug('kg upsert node failed:', e && e.message)
      }
    }

    // Upsert edges.
    for (const [key, edge] of edgeSet) {
      try {
        const [from, to, rel] = key.split('|')
        db.run(`INSERT OR REPLACE INTO kg_edges ("from", "to", relation, confidence) VALUES (?, ?, ?, ?)`,
          [from, to, rel, edge.confidence])
      } catch (e) {
        log.debug('kg upsert edge failed:', e && e.message)
      }
    }
  } catch (e) {
    log.warn('buildGraph failed:', e && e.message)
  }
}

// ─── Graph search ──────────────────────────────────────────────────────────
// Expand query through 1-hop neighbours, then do keyword search on expanded set.

function searchGraph(db, query, limit = 5) {
  try {
    const qkws = _keywords(query)
    if (qkws.length === 0) return []

    // Find entities matching the query.
    const matchingNodes = db.exec(
      `SELECT entity, type FROM kg_nodes WHERE LOWER(entity) LIKE ? LIMIT 20`,
      [`%${qkws[0]}%`]
    )[0]?.values || []

    if (matchingNodes.length === 0) return []

    // Collect 1-hop neighbour entities.
    const neighbours = new Set()
    for (const [entity, type] of matchingNodes) {
      // Outgoing edges.
      const out = db.exec(
        `SELECT "to", relation, confidence FROM kg_edges WHERE "from" = ? AND confidence >= ?`,
        [entity, MIN_CONFIDENCE]
      )[0]?.values || []
      for (const [toEntity, relation] of out) {
        neighbours.add(toEntity)
      }
      // Incoming edges.
      const inEdges = db.exec(
        `SELECT "from", relation, confidence FROM kg_edges WHERE "to" = ? AND confidence >= ?`,
        [entity, MIN_CONFIDENCE]
      )[0]?.values || []
      for (const [fromEntity] of inEdges) {
        neighbours.add(fromEntity)
      }
    }

    // Expand query keywords with neighbour entities.
    const expandedKws = [...qkws, ...Array.from(neighbours)]

    // Search memories with expanded keywords.
    const allMemories = db.getMemories(200) || []
    const scored = allMemories
      .map(m => {
        const mkws = _keywords(m.content)
        let hits = 0
        for (const k of expandedKws) {
          if (mkws.includes(k.toLowerCase())) hits++
        }
        return { m, score: hits }
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return scored.map(x => ({ ...x.m, _graphScore: x.score }))
  } catch (e) {
    log.warn('searchGraph failed:', e && e.message)
    return []
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function _keywords(text) {
  const t = String(text || '').toLowerCase()
  const words = t.match(/[a-z][a-z0-9_-]{1,}/g) || []
  return [...new Set(words)]
}

// ─── Cleanup ───────────────────────────────────────────────────────────────
function prune(db, maxAgeDays = 90) {
  try {
    db.run(`DELETE FROM kg_nodes WHERE id NOT IN (
      SELECT DISTINCT id FROM (
        SELECT id FROM kg_edges WHERE "to" = kg_nodes.entity
        UNION
        SELECT id FROM kg_edges WHERE "from" = kg_nodes.entity
      )
    ) AND created_at < ?`,
      [new Date(Date.now() - maxAgeDays * 86400000).toISOString()])
  } catch {}
}

module.exports = { buildGraph, searchGraph, prune }
