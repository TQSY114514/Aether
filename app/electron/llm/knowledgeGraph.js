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
// 关键词提取统一走共享模块：英文词 + CJK bigram。此前本文件自带的
// _keywords 只匹配 [a-z][a-z0-9_-]{1,}，中文查询零关键词 → 图谱对
// 中文用户完全失效（searchGraph/injectContext 恒空）。
const { keywords: sharedKeywords } = require('../memoryText')

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

      // FACT lines: extract implicit entities. Two patterns:
      //   - Capitalised English words that look like names ("Alice works on X").
      //   - CJK runs of 2-8 chars（中文实体此前完全进不了图——正则只认大写英文词）。
      if (type === 'fact') {
        const matches = [
          ...(content.match(/\b([A-Z][a-zA-Z]{2,})\b/g) || []),
          ...(content.match(/[\u4e00-\u9fff]{2,8}/g) || []),
        ]
        for (const name of matches) {
          const lower = name.toLowerCase()
          const entry = nodeSet.get(lower)
          if (entry) entry.count++
          else nodeSet.set(lower, { type: 'fact_entity', count: 1 })
        }
      }
    }

    // Upsert nodes.
    for (const [name, info] of nodeSet) {
      try {
        const existing = db.allRows(
          `SELECT id FROM kg_nodes WHERE entity = ? LIMIT 1`, [name]
        )[0]
        if (existing) {
          db.run(`UPDATE kg_nodes SET type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [info.type, existing.id])
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

    // Find entities matching ANY query keyword（此前只用 qkws[0]，多词查询漏配）。
    const matchingNodes = []
    const seenEntities = new Set()
    for (const kw of qkws) {
      const rows = db.allRows(
        `SELECT entity, type FROM kg_nodes WHERE LOWER(entity) LIKE ? LIMIT 20`,
        [`%${kw}%`]
      ) || []
      for (const r of rows) {
        if (r && r.entity && !seenEntities.has(r.entity)) {
          seenEntities.add(r.entity)
          matchingNodes.push(r)
        }
      }
      if (matchingNodes.length >= 20) break
    }

    if (matchingNodes.length === 0) return []

    // Collect 1-hop neighbour entities.
    const neighbours = new Set()
    for (const node of matchingNodes) {
      const entity = node.entity
      // Outgoing edges.
      const out = db.allRows(
        `SELECT "to", relation, confidence FROM kg_edges WHERE "from" = ? AND confidence >= ?`,
        [entity, MIN_CONFIDENCE]
      ) || []
      for (const row of out) {
        neighbours.add(row.to)
      }
      // Incoming edges.
      const inEdges = db.allRows(
        `SELECT "from", relation, confidence FROM kg_edges WHERE "to" = ? AND confidence >= ?`,
        [entity, MIN_CONFIDENCE]
      ) || []
      for (const row of inEdges) {
        neighbours.add(row.from)
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

// ─── Second-degree neighbours ──────────────────────────────────────────────
// Given entity A, return indirect entities C reachable through a middle node B
// (A→B→C). Traversal is undirected per hop (an edge may be traversed incoming or
// outgoing). Direct neighbours of A are excluded so only genuinely indirect
// (2-hop) entities are returned.
function getSecondDegreeNeighbors(db, entity, limit = 10) {
  try {
    const a = String(entity || '').trim().toLowerCase()
    if (!a) return []

    // 1-hop neighbours B (directly connected to A).
    const oneHop = new Set()
    const outRows = db.allRows(
      `SELECT "to" AS node FROM kg_edges WHERE "from" = ? AND confidence >= ?`,
      [a, MIN_CONFIDENCE]
    ) || []
    const inRows = db.allRows(
      `SELECT "from" AS node FROM kg_edges WHERE "to" = ? AND confidence >= ?`,
      [a, MIN_CONFIDENCE]
    ) || []
    for (const r of outRows) if (r && r.node) oneHop.add(r.node)
    for (const r of inRows) if (r && r.node) oneHop.add(r.node)
    if (oneHop.size === 0) return []

    // Exclude A and all direct neighbours from the result set.
    const excluded = new Set([a, ...oneHop])
    const results = []
    const seen = new Set()

    for (const b of oneHop) {
      const outB = db.allRows(
        `SELECT "to" AS node, relation FROM kg_edges WHERE "from" = ? AND confidence >= ?`,
        [b, MIN_CONFIDENCE]
      ) || []
      const inB = db.allRows(
        `SELECT "from" AS node, relation FROM kg_edges WHERE "to" = ? AND confidence >= ?`,
        [b, MIN_CONFIDENCE]
      ) || []
      for (const r of outB) {
        if (!r || !r.node || excluded.has(r.node) || seen.has(r.node)) continue
        seen.add(r.node)
        results.push({ entity: r.node, via: b, relation: r.relation, hop: 2 })
      }
      for (const r of inB) {
        if (!r || !r.node || excluded.has(r.node) || seen.has(r.node)) continue
        seen.add(r.node)
        results.push({ entity: r.node, via: b, relation: r.relation, hop: 2 })
      }
    }
    return results.slice(0, limit)
  } catch (e) {
    log.warn('getSecondDegreeNeighbors failed:', e && e.message)
    return []
  }
}

// ─── Graph visualization data ──────────────────────────────────────────────
// Return the full node + edge list for rendering the entity-relationship graph
// in Settings. Nodes carry { id, label, type }; edges carry { source, target,
// relation, confidence }.
function getGraphData(db, opts = {}) {
  try {
    const nodeLimit = opts.nodeLimit || 200
    const edgeLimit = opts.edgeLimit || nodeLimit * 4
    const nodes = (db.allRows(
      `SELECT entity, type FROM kg_nodes ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`,
      [nodeLimit]
    ) || []).map(r => ({ id: r.entity, label: r.entity, type: r.type || 'entity' }))
    const edges = (db.allRows(
      `SELECT "from", "to", relation, confidence FROM kg_edges ORDER BY created_at DESC LIMIT ?`,
      [edgeLimit]
    ) || []).map(r => ({ source: r.from, target: r.to, relation: r.relation, confidence: r.confidence }))
    return { nodes, edges }
  } catch (e) {
    log.warn('getGraphData failed:', e && e.message)
    return { nodes: [], edges: [] }
  }
}

// ─── Smart context injection ───────────────────────────────────────────────
// Given the current user query, find entities that match it in the graph and
// pull in their directly related entities. Returns a list of { entity, type,
// hop, relation, via } entries (hop 0 = matched seed, hop 1 = related). Callers
// can inject these as context alongside normal memory prefetch.
function injectContext(db, userMessage, limit = 5) {
  try {
    const q = String(userMessage || '').trim()
    if (!q) return []
    const qkws = _keywords(q)
    if (qkws.length === 0) return []

    // Find entities matching the query keywords.
    const matched = []
    for (const kw of qkws) {
      const rows = db.allRows(
        `SELECT entity, type FROM kg_nodes WHERE LOWER(entity) LIKE ? LIMIT 5`,
        [`%${kw}%`]
      ) || []
      for (const r of rows) {
        if (r && r.entity && !matched.some(m => m.entity === r.entity)) matched.push(r)
      }
      if (matched.length >= limit) break
    }
    if (matched.length === 0) return []

    // Expand to 1-hop related entities for context.
    const result = []
    const seen = new Set()
    for (const m of matched) {
      result.push({ entity: m.entity, type: m.type || 'entity', hop: 0, relation: null })
      seen.add(m.entity)
    }
    for (const m of matched) {
      const out = db.allRows(
        `SELECT "to" AS node, relation FROM kg_edges WHERE "from" = ? AND confidence >= ?`,
        [m.entity, MIN_CONFIDENCE]
      ) || []
      const inE = db.allRows(
        `SELECT "from" AS node, relation FROM kg_edges WHERE "to" = ? AND confidence >= ?`,
        [m.entity, MIN_CONFIDENCE]
      ) || []
      for (const r of out) {
        if (!r || !r.node || seen.has(r.node)) continue
        seen.add(r.node)
        result.push({ entity: r.node, type: null, hop: 1, relation: r.relation, via: m.entity })
      }
      for (const r of inE) {
        if (!r || !r.node || seen.has(r.node)) continue
        seen.add(r.node)
        result.push({ entity: r.node, type: null, hop: 1, relation: r.relation, via: m.entity })
      }
    }
    return result.slice(0, limit)
  } catch (e) {
    log.warn('injectContext failed:', e && e.message)
    return []
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
// 关键词：共享模块的英文词 + CJK bigram，转数组供 includes 比对。
function _keywords(text) {
  return [...sharedKeywords(String(text || ''))]
}

// ─── Cleanup ───────────────────────────────────────────────────────────────
// 删除超过 maxAgeDays 且没有任何边引用的孤立节点。
// 旧实现把 kg_nodes.id 和 kg_edges."from"/"to"（存的是实体名）拿来比较，
// 永远不相等 → 子查询恒空 → NOT IN 恒真，prune 实际上什么都没删过。
function prune(db, maxAgeDays = 90) {
  try {
    db.run(`DELETE FROM kg_nodes WHERE created_at < ? AND entity NOT IN (
      SELECT "from" FROM kg_edges
      UNION
      SELECT "to" FROM kg_edges
    )`,
      [new Date(Date.now() - maxAgeDays * 86400000).toISOString()])
  } catch {}
}

// ── Desktop polish #7: manual KG node editing ──────────────────────────────
// Delete a node by entity, along with all edges touching it.
function deleteNode(db, entity) {
  const name = String(entity || '').trim()
  if (!name) return { ok: false, error: 'empty entity' }
  try {
    let node = db.prepare('SELECT id, entity FROM kg_nodes WHERE entity = ?').get(name)
    if (!node) {
      node = db.prepare('SELECT id, entity FROM kg_nodes WHERE entity = ?').get(name.toLowerCase())
    }
    if (!node) return { ok: false, error: 'node not found' }
    const actualName = node.entity || name
    db.prepare('DELETE FROM kg_edges WHERE "from" = ? OR "to" = ?').run(actualName, actualName)
    if (actualName !== name) {
      db.prepare('DELETE FROM kg_edges WHERE "from" = ? OR "to" = ?').run(name, name)
    }
    const info = db.prepare('DELETE FROM kg_nodes WHERE entity = ?').run(actualName)
    return { ok: true, removed: Number(info.changes), entity: name }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

// Rename a node's entity, updating edges that reference the old name.
function renameNode(db, entity, newEntity) {
  const oldName = String(entity || '').trim()
  const name = String(newEntity || '').trim()
  if (!oldName || !name) return { ok: false, error: 'empty entity' }
  try {
    let node = db.prepare('SELECT id, entity FROM kg_nodes WHERE entity = ?').get(oldName)
    if (!node) {
      node = db.prepare('SELECT id, entity FROM kg_nodes WHERE entity = ?').get(oldName.toLowerCase())
    }
    if (!node) return { ok: false, error: 'node not found' }

    // Every other code path (addRelation/deleteRelation/getWikiArticle/deleteNode)
    // lowercases entity lookups, so renames must stay lowercase to remain reachable.
    const targetEntity = name.toLowerCase()

    const dup = db.prepare('SELECT id FROM kg_nodes WHERE entity = ? AND id != ?').get(targetEntity, node.id)
    if (dup) return { ok: false, error: `entity already exists: ${targetEntity}` }

    db.prepare('UPDATE kg_nodes SET entity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetEntity, node.id)
    db.prepare('UPDATE kg_edges SET "from" = ? WHERE "from" = ?').run(targetEntity, node.entity)
    db.prepare('UPDATE kg_edges SET "to" = ? WHERE "to" = ?').run(targetEntity, node.entity)
    if (oldName !== node.entity) {
      db.prepare('UPDATE kg_edges SET "from" = ? WHERE "from" = ?').run(targetEntity, oldName)
      db.prepare('UPDATE kg_edges SET "to" = ? WHERE "to" = ?').run(targetEntity, oldName)
    }
    return { ok: true, entity: targetEntity }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

// Add or update a relationship between two entities.
function addRelation(db, from, to, relation, confidence = 0.8) {
  const f = String(from || '').trim().toLowerCase()
  const t = String(to || '').trim().toLowerCase()
  const r = String(relation || 'relates_to').trim().toLowerCase()
  if (!f || !t || !r) return { ok: false, error: 'invalid from, to, or relation' }
  try {
    // Ensure nodes exist in kg_nodes
    const getFrom = db.prepare('SELECT id FROM kg_nodes WHERE entity = ?').get(f)
    if (!getFrom) db.prepare('INSERT INTO kg_nodes (entity, type) VALUES (?, ?)').run(f, 'entity')
    const getTo = db.prepare('SELECT id FROM kg_nodes WHERE entity = ?').get(t)
    if (!getTo) db.prepare('INSERT INTO kg_nodes (entity, type) VALUES (?, ?)').run(t, 'entity')

    // Upsert edge
    const existing = db.prepare('SELECT id FROM kg_edges WHERE "from" = ? AND "to" = ? AND relation = ?').get(f, t, r)
    if (existing) {
      db.prepare('UPDATE kg_edges SET confidence = ? WHERE id = ?').run(Number(confidence), existing.id)
    } else {
      db.prepare('INSERT INTO kg_edges ("from", "to", relation, confidence) VALUES (?, ?, ?, ?)').run(f, t, r, Number(confidence))
    }
    return { ok: true, from: f, to: t, relation: r, confidence: Number(confidence) }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

// Delete a relation between two entities.
function deleteRelation(db, from, to, relation) {
  const f = String(from || '').trim().toLowerCase()
  const t = String(to || '').trim().toLowerCase()
  const r = String(relation || '').trim().toLowerCase()
  if (!f || !t) return { ok: false, error: 'invalid from or to' }
  try {
    let info
    if (r) {
      info = db.prepare('DELETE FROM kg_edges WHERE "from" = ? AND "to" = ? AND relation = ?').run(f, t, r)
    } else {
      info = db.prepare('DELETE FROM kg_edges WHERE "from" = ? AND "to" = ?').run(f, t)
    }
    return { ok: true, removed: Number(info.changes) }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

// DeepWiki: Generate a bidirectional Markdown Wiki article for an entity.
function getWikiArticle(db, entity) {
  const name = String(entity || '').trim().toLowerCase()
  if (!name) return { entity: '', type: 'unknown', markdown: '', outgoing: [], backlinks: [], memories: [] }
  try {
    const node = db.prepare('SELECT id, entity, type, created_at, updated_at FROM kg_nodes WHERE entity = ?').get(name) || { entity: name, type: 'entity', created_at: null, updated_at: null }

    const outgoing = (db.prepare('SELECT "to", relation, confidence FROM kg_edges WHERE "from" = ? ORDER BY confidence DESC').all(name) || [])
      .map(r => ({ to: r.to, relation: r.relation, confidence: r.confidence }))

    const backlinks = (db.prepare('SELECT "from", relation, confidence FROM kg_edges WHERE "to" = ? ORDER BY confidence DESC').all(name) || [])
      .map(r => ({ from: r.from, relation: r.relation, confidence: r.confidence }))

    const memRows = db.prepare('SELECT content FROM memory WHERE LOWER(content) LIKE ? LIMIT 5').all(`%${name}%`) || []
    const memories = memRows.map(r => r.content)

    // Build Markdown DeepWiki content
    const lines = [
      `# [[${node.entity}]]`,
      '',
      `> **实体类型**: \`${node.type || 'entity'}\`  `,
      `> **关联密度**: 引用 ${outgoing.length} · 反链 ${backlinks.length}`,
      '',
      '## 🔗 关联实体 (Outgoing)',
      outgoing.length > 0
        ? outgoing.map(o => `- 依赖/指向 [[${o.to}]] *(关系: ${o.relation}, 置信度: ${Math.round((o.confidence || 0.8) * 100)}%)*`).join('\n')
        : '*暂无向外关联实体*',
      '',
      '## ↩️ 反向链接 (Backlinks / 被引用)',
      backlinks.length > 0
        ? backlinks.map(b => `- 来自 [[${b.from}]] *(关系: ${b.relation})*`).join('\n')
        : '*暂无反向引用*',
      '',
      '## 💡 相关记忆与上下文片段',
      memories.length > 0
        ? memories.map(m => `> ${m}`).join('\n\n')
        : '*暂无直接关联的记忆记录*',
    ]

    return {
      entity: node.entity,
      type: node.type || 'entity',
      markdown: lines.join('\n'),
      outgoing,
      backlinks,
      memories,
    }
  } catch (e) {
    log.warn('[knowledgeGraph] getWikiArticle error:', e && e.message)
    return {
      entity: name,
      type: 'entity',
      markdown: `# [[${name}]]\n\n*获取维基文章出错: ${e && e.message ? e.message : String(e)}*`,
      outgoing: [],
      backlinks: [],
      memories: [],
    }
  }
}

module.exports = {
  buildGraph,
  searchGraph,
  prune,
  getSecondDegreeNeighbors,
  getGraphData,
  injectContext,
  deleteNode,
  renameNode,
  addRelation,
  deleteRelation,
  getWikiArticle,
}

