import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { Plus, Trash2, Download, Upload, Search, Tag, AlertTriangle, Check, X } from 'lucide-react'
import { t } from '@/utils/i18n'

const TYPE_COLORS: Record<string, string> = {
  entity: '#2563EB', fact: '#16A34A', context: '#D97706', relation: '#9333EA',
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<{ id: number; content: string; type: string; created_at: string; access_count: number; last_accessed_at: string | null; source_session_id: number | null; confidence: number; conflicts_with: number | null }[]>([])
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('fact')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [conflicts, setConflicts] = useState<{ memoryId: number; content: string; conflictingId: number; conflictingContent: string }[]>([])
  const [showConflicts, setShowConflicts] = useState(false)
  const [resolving, setResolving] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useUI()

  const loadEntries = async () => {
    const memories = await window.electronAPI.memory.list()
    setEntries(memories || [])
    const conf = await window.electronAPI.memory.conflicts()
    setConflicts(conf)
    setLoading(false)
  }

  useEffect(() => { loadEntries() }, [])

  const handleAdd = async () => {
    if (!newContent.trim()) return
    const currentSessionId = useStore.getState().currentSessionId
    await window.electronAPI.memory.create({ content: newContent.trim(), type: newType, source_session_id: currentSessionId || null })
    setNewContent('')
    setNewType('fact')
    loadEntries()
  }

  const handleEdit = async (id: number) => {
    if (!editContent.trim()) return
    await window.electronAPI.memory.update(id, { content: editContent.trim() })
    setEditingId(null)
    loadEntries()
  }

  const handleDelete = async (id: number) => {
    await window.electronAPI.memory.delete(id)
    loadEntries()
  }

  const handleResolveConflict = async (keepId: number, removeId: number) => {
    setResolving(removeId)
    await window.electronAPI.memory.conflictResolve(keepId, removeId)
    setResolving(null)
    toast('冲突已解决')
    loadEntries()
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'aetherai-memory.json'
    a.click(); URL.revokeObjectURL(a.href)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text())
        const items = Array.isArray(data) ? data : data.memories || []
        for (const item of items) {
          if (item.content && item.content.trim()) {
            await window.electronAPI.memory.create({
              content: item.content.trim(),
              type: item.type || 'fact',
            })
          }
        }
        loadEntries()
      } catch { toast('Invalid JSON file', { type: 'error' }) }
    }
    input.click()
  }

  const filtered = searchQuery.trim()
    ? entries.filter(e => e.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries

  const counts = entries.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {loading ? (
        <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>🧠 {t('sidebar.nav.memory')}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>AI 会记住这些信息并在对话中参考 · 来源追踪 · 冲突检测</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border)' }}>
              <Upload size={12} />导入
            </button>
            <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border)' }}>
              <Download size={12} />导出
            </button>
          </div>
        </div>

        {/* Conflict banner */}
        {conflicts.length > 0 && (
          <button onClick={() => setShowConflicts(!showConflicts)}
            className="w-full mb-4 rounded-xl border-2 p-3 flex items-center gap-2 text-sm transition-colors"
            style={{ borderColor: 'var(--warning)', backgroundColor: 'rgba(234,179,8,0.05)' }}>
            <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
            <span style={{ color: 'var(--warning)' }}>{conflicts.length} 个记忆冲突需要解决</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{showConflicts ? '▲' : '▼'}</span>
          </button>
        )}

        {showConflicts && conflicts.length > 0 && (
          <div className="mb-4 space-y-2">
            {conflicts.map((c) => (
              <div key={c.memoryId} className="rounded-xl border p-3" style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--bg-secondary)' }}>
                <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--warning)' }}>冲突记忆</div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>较新: "{c.content}"</div>
                <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>旧: "{c.conflictingContent}"</div>
                <div className="flex gap-2">
                  <button onClick={() => handleResolveConflict(c.memoryId, c.conflictingId)}
                    disabled={resolving === c.conflictingId}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--bg-primary)]"
                    style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>
                    <Check size={10} /> 保留较新
                  </button>
                  <button onClick={() => handleResolveConflict(c.conflictingId, c.memoryId)}
                    disabled={resolving === c.conflictingId}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--bg-primary)]"
                    style={{ borderColor: 'var(--text-muted)', color: 'var(--text-secondary)' }}>
                    <X size={10} /> 保留较旧
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Type badges summary */}
        <div className="flex items-center gap-2 mb-4">
          {Object.entries(counts).map(([type, count]) => (
            <span key={type} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: TYPE_COLORS[type] || '#999', color: '#fff' }}>
              <Tag size={8} />{type} · {count}
            </span>
          ))}
          {entries.length > 0 && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entries.length} total</span>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--content-bg)] border text-sm mb-4" style={{ borderColor: 'var(--border)' }}>
          <Search size={14} className="text-gray-400 shrink-0" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索记忆..." className="w-full bg-transparent outline-none text-sm" />
          {searchQuery && (
            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} {filtered.length === 1 ? '条结果' : '条结果'}
            </span>
          )}
        </div>

        {/* Add new memory */}
        <div className="flex gap-2 mb-6">
          <select value={newType} onChange={e => setNewType(e.target.value)}
            className="text-xs border rounded-lg px-2 py-2 outline-none bg-[var(--content-bg)] shrink-0" style={{ borderColor: 'var(--border)' }}>
            <option value="entity">Entity</option>
            <option value="fact">Fact</option>
            <option value="context">Context</option>
            <option value="relation">Relation</option>
          </select>
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)}
            placeholder={t('memory.add_placeholder')}
            rows={2}
            className="flex-1 px-3 py-2 text-sm rounded-lg border outline-none resize-none bg-[var(--content-bg)]"
            style={{ borderColor: 'var(--border)' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }} />
          <button onClick={handleAdd} className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-80 shrink-0 self-end">添加</button>
        </div>

        {/* Memory list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
              {searchQuery ? '没有匹配的记忆' : '还没有记忆，添加一条试试'}
            </div>
          )}
          {filtered.map((entry) => (
            <div key={entry.id} className="rounded-xl p-3" style={{ border: entry.conflicts_with ? '2px solid var(--warning)' : '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              {editingId === entry.id ? (
                <div className="space-y-2">
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                    rows={2} className="w-full px-2 py-1 text-sm rounded border outline-none resize-none bg-[var(--content-bg)]"
                    style={{ borderColor: 'var(--accent)' }} />
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(entry.id)} className="px-3 py-1 bg-black text-white text-xs rounded-lg">保存</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs rounded-lg border" style={{ borderColor: 'var(--border)' }}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5" style={{ backgroundColor: TYPE_COLORS[entry.type] || '#999', color: '#fff' }}>
                    {entry.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{entry.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entry.created_at?.slice(0, 16) || ''}</p>
                      {entry.source_session_id && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                          会话 #{entry.source_session_id}
                        </span>
                      )}
                      {entry.access_count > 0 && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                          {entry.access_count} 次引用
                        </span>
                      )}
                      {entry.conflicts_with && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: 'var(--warning)' }}>
                          冲突
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditingId(entry.id); setEditContent(entry.content) }}
                      className="p-1 rounded hover:bg-[var(--border)] transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => handleDelete(entry.id)}
                      className="p-1 rounded hover:bg-[var(--border)] transition-colors">
                      <Trash2 size={12} className="text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}
