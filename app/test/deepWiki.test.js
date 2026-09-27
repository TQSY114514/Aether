import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  addRelation,
  deleteRelation,
  getWikiArticle,
  renameNode,
  deleteNode
} from '../electron/llm/knowledgeGraph.js'

describe('DeepWiki Code Graph Visualization (P2-1)', () => {
  let db

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS kg_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL UNIQUE,
        type TEXT DEFAULT "entity",
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS kg_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        "from" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        relation TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'fact',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('adds relations and automatically registers entity nodes', () => {
    const res = addRelation(db, 'authService', 'userDb', 'queries', 0.95)
    expect(res.ok).toBe(true)
    expect(res.from).toBe('authservice')
    expect(res.to).toBe('userdb')

    // Verify nodes were created
    const authNode = db.prepare('SELECT entity FROM kg_nodes WHERE entity = ?').get('authservice')
    const dbNode = db.prepare('SELECT entity FROM kg_nodes WHERE entity = ?').get('userdb')
    expect(authNode).toBeDefined()
    expect(dbNode).toBeDefined()

    // Verify edge
    const edge = db.prepare('SELECT "from", "to", relation, confidence FROM kg_edges WHERE "from" = ?').get('authservice')
    expect(edge).toBeDefined()
    expect(edge.to).toBe('userdb')
    expect(edge.relation).toBe('queries')
    expect(edge.confidence).toBe(0.95)
  })

  it('generates DeepWiki Markdown article with outgoing links and backlinks', () => {
    addRelation(db, 'orderService', 'paymentGateway', 'calls', 0.9)
    addRelation(db, 'frontend', 'orderService', 'invokes', 0.85)

    // Add matching memory context
    db.prepare('INSERT INTO memory (content) VALUES (?)').run('orderService handles checkout and inventory verification.')

    // Get article for orderService
    const article = getWikiArticle(db, 'orderService')
    expect(article).toBeDefined()
    expect(article.entity).toBe('orderservice')

    // Check outgoing
    expect(article.outgoing.length).toBe(1)
    expect(article.outgoing[0].to).toBe('paymentgateway')
    expect(article.outgoing[0].relation).toBe('calls')

    // Check backlinks
    expect(article.backlinks.length).toBe(1)
    expect(article.backlinks[0].from).toBe('frontend')
    expect(article.backlinks[0].relation).toBe('invokes')

    // Check markdown format
    expect(article.markdown).toContain('# [[orderservice]]')
    expect(article.markdown).toContain('[[paymentgateway]]')
    expect(article.markdown).toContain('[[frontend]]')
    expect(article.markdown).toContain('orderService handles checkout')
  })

  it('supports human correction: deleting relation and renaming node', () => {
    addRelation(db, 'userService', 'redisCache', 'reads_from')

    // Delete relation
    const delRel = deleteRelation(db, 'userService', 'redisCache', 'reads_from')
    expect(delRel.ok).toBe(true)
    expect(delRel.removed).toBe(1)

    // Re-add relation and test rename
    addRelation(db, 'userService', 'redisCache', 'reads_from')
    const renameRes = renameNode(db, 'redisCache', 'sharedRedis')
    expect(renameRes.ok).toBe(true)

    // Verify edge was updated
    const updatedEdge = db.prepare('SELECT "to" FROM kg_edges WHERE "from" = ?').get('userservice')
    expect(updatedEdge.to).toBe('sharedredis')

    // Delete node
    const delNode = deleteNode(db, 'sharedredis')
    expect(delNode.ok).toBe(true)

    const remainingEdge = db.prepare('SELECT id FROM kg_edges WHERE "to" = ?').get('sharedredis')
    expect(remainingEdge).toBeUndefined()
  })
})
