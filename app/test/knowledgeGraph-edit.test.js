// ─────────────────────────────────────────────────────────────────────────────
// knowledgeGraph-edit.test.js — Desktop polish #7: manual KG node editing
//
// 锁定: deleteNode 按 entity 删除节点+关联边; renameNode 重命名并更新边;
// 空/不存在/重复 entity 的安全错误处理。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { deleteNode, renameNode } from '../electron/llm/knowledgeGraph'

// 假 db: 记录 prepare 调用, 模拟查询结果
function mkDb(opts = {}) {
  const { existing = { id: 1, entity: 'Alice' }, dupEntity = null } = opts
  const runs = []
  const prepares = []
  return {
    prepare(sql) {
      prepares.push(sql)
      const lower = sql.toLowerCase()
      return {
        get: (...args) => {
          if (lower.includes('where entity = ?') && lower.includes('and id != ?')) {
            // duplicate-check query: entity = ? AND id != ?
            return dupEntity ? { id: 2 } : undefined
          }
          if (lower.includes('where entity = ?') && lower.includes('select id')) {
            return args[0] === existing.entity ? existing : undefined
          }
          return undefined
        },
        run: (...args) => { runs.push([sql, args]); return { changes: 1 } },
      }
    },
    _runs: runs,
    _prepares: prepares,
  }
}

describe('deleteNode', () => {
  it('deletes the node and its touching edges', () => {
    const db = mkDb({ existing: { id: 1, entity: 'Alice' } })
    const r = deleteNode(db, 'Alice')
    expect(r.ok).toBe(true)
    expect(r.removed).toBe(1)
    const dels = db._runs.filter(([sql]) => sql.startsWith('DELETE'))
    expect(dels.some(([sql]) => sql.includes('kg_edges'))).toBe(true)
    expect(dels.some(([sql]) => sql.includes('kg_nodes'))).toBe(true)
  })

  it('fails safely for empty or missing entity', () => {
    expect(deleteNode(mkDb(), '').ok).toBe(false)
    expect(deleteNode(mkDb(), '  ').ok).toBe(false)
    const r = deleteNode(mkDb({ existing: { id: 1, entity: 'Alice' } }), 'Nobody')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not found')
  })
})

describe('renameNode', () => {
  it('renames the entity and updates edges', () => {
    const db = mkDb({ existing: { id: 1, entity: 'Alice' } })
    const r = renameNode(db, 'Alice', 'Alice2')
    expect(r.ok).toBe(true)
    expect(r.entity).toBe('Alice2')
    const updates = db._runs.filter(([sql]) => sql.startsWith('UPDATE'))
    expect(updates.some(([sql]) => sql.includes('kg_nodes'))).toBe(true)
    expect(updates.some(([sql]) => sql.includes('kg_edges') && sql.includes('"from"'))).toBe(true)
    expect(updates.some(([sql]) => sql.includes('kg_edges') && sql.includes('"to"'))).toBe(true)
  })

  it('rejects duplicate target entity', () => {
    const db = mkDb({ existing: { id: 1, entity: 'Alice' }, dupEntity: 'Alice2' })
    const r = renameNode(db, 'Alice', 'Alice2')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already exists')
  })

  it('fails safely for empty names or missing node', () => {
    expect(renameNode(mkDb(), '', 'x').ok).toBe(false)
    expect(renameNode(mkDb(), 'x', '').ok).toBe(false)
    const r = renameNode(mkDb({ existing: { id: 1, entity: 'Alice' } }), 'Ghost', 'New')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not found')
  })
})
