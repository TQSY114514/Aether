import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import type { Session } from '@/types'
import { Brain, Link, Search, Trash2, Edit2, Plus, Copy, Check, BookOpen, ExternalLink, ArrowRight, CornerDownRight } from 'lucide-react'
import { t } from '@/utils/i18n'

// ──────────────────────────── Learning Graph & DeepWiki ──────────────────────
// An interactive knowledge graph & bidirectional DeepWiki showing how entities,
// memories, skills, and sessions connect.
// ────────────────────────────────────────────────────────────────────────────

type Node = { id: string; label: string; type: 'memory' | 'skill' | 'session' | 'tool'; created_at?: string; extra?: string }
type Edge = { from: string; to: string; label: string }
type GraphData = { nodes: Node[]; edges: Edge[] }

const COLORS: Record<Node['type'] | 'default', string> = {
  memory: '#2563EB', skill: '#16A34A', session: '#6B7280', tool: '#D97706', default: '#9CA3AF',
}

export function buildGraph(memories: { id: number; content: string; created_at: string }[], skills: { name: string; description: string }[], sessions: Session[]): GraphData {
  const nodes: Node[] = []
  const edges: Edge[] = []
  memories.forEach(m => nodes.push({ id: `mem-${m.id}`, label: m.content.slice(0, 60), type: 'memory', created_at: m.created_at, extra: m.content }))
  skills.forEach(s => nodes.push({ id: `skill-${s.name}`, label: s.name, type: 'skill', extra: s.description }))
  sessions.forEach(s => nodes.push({ id: `sess-${s.id}`, label: s.title || `#${s.id}`, type: 'session', created_at: s.updated_at }))
  for (const skill of skills) {
    for (const sess of sessions) {
      const combined = (sess.title || '') + ' ' + (sess.last_message || '')
      if (combined.toLowerCase().includes(skill.name.toLowerCase())) {
        edges.push({ from: `skill-${skill.name}`, to: `sess-${sess.id}`, label: 'used in' })
      }
    }
  }
  for (const mem of memories) {
    const words = new Set(mem.content.toLowerCase().split(/\W+/).filter(w => w.length > 3))
    for (const sess of sessions) {
      const combined = (sess.title || '') + ' ' + (sess.last_message || '')
      const hits = [...words].filter(w => combined.toLowerCase().includes(w))
      if (hits.length >= 1) {
        edges.push({ from: `mem-${mem.id}`, to: `sess-${sess.id}`, label: hits.slice(0, 2).join(', ') })
      }
    }
  }
  return { nodes, edges }
}

export function adaptKgData(data: { nodes: { id: string; label: string; type: string }[]; edges: { source: string; target: string; relation: string }[] } | { nodes: never[]; edges: never[] } | null | undefined): GraphData {
  if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }
  const nodes: Node[] = data.nodes.map(n => ({
    id: String(n.id),
    label: String(n.label || n.id),
    type: 'memory',
    extra: String(n.type || 'entity'),
  }))
  const edges: Edge[] = (Array.isArray(data.edges) ? data.edges : [])
    .filter(e => e && e.source && e.target)
    .map(e => ({ from: String(e.source), to: String(e.target), label: String(e.relation || 'related') }))
  return { nodes, edges }
}

function WikiRenderer({ markdown, onJump }: { markdown: string; onJump: (entity: string) => void }) {
  const parts = markdown.split(/(\[\[[^\]]+\]\])/g)
  return (
    <div className="text-xs leading-relaxed space-y-1 font-mono whitespace-pre-wrap select-text" style={{ color: 'var(--text-secondary)' }}>
      {parts.map((part, i) => {
        const match = part.match(/^\[\[([^\]]+)\]\]$/)
        if (match) {
          const entity = match[1]
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(entity)}
              className="inline-flex items-center px-1 py-0.2 mx-0.5 rounded font-mono font-medium border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              title={`Jump to [[${entity}]]`}
            >
              [[{entity}]]
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}

/** Render the learned-knowledge graph & DeepWiki workspace. */
export default function LearningGraphPage() {
  const memories = useStore(s => s.memories)
  const loadMemories = useStore(s => s.loadMemories)
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  const sessions = useStore(s => s.sessions)
  const loadSessions = useStore(s => s.loadSessions)
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const [selected, setSelected] = useState<Node | null>(null)
  const [filter, setFilter] = useState('')
  const [kgLoaded, setKgLoaded] = useState(false)

  // DeepWiki state
  const [activeTab, setActiveTab] = useState<'graph' | 'wiki'>('graph')
  const [wikiArticle, setWikiArticle] = useState<{
    entity: string
    type: string
    markdown: string
    outgoing: { to: string; relation: string; confidence: number }[]
    backlinks: { from: string; relation: string; confidence: number }[]
    memories: string[]
  } | null>(null)
  const [copiedWiki, setCopiedWiki] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showAddRel, setShowAddRel] = useState(false)
  const [newTarget, setNewTarget] = useState('')
  const [newRel, setNewRel] = useState('calls')

  const reloadGraph = async () => {
    try {
      const data = await window.electronAPI?.kg?.graph?.({ nodeLimit: 200 })
      const adapted = adaptKgData(data)
      setGraph(adapted)
    } catch {}
  }

  useEffect(() => { loadMemories(); loadSessions(); try { window.electronAPI?.skills?.list?.().then(setSkills).catch(() => {}) } catch {} }, [loadMemories, loadSessions])

  useEffect(() => {
    let cancelled = false
    try {
      window.electronAPI?.kg?.graph?.({ nodeLimit: 200 })
        .then(data => {
          if (cancelled) return
          const adapted = adaptKgData(data)
          setKgLoaded(true)
          if (adapted.nodes.length > 0) setGraph(adapted)
        })
        .catch(() => { if (!cancelled) setKgLoaded(true) })
    } catch { if (!cancelled) setKgLoaded(true) }
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (kgLoaded) return
    setGraph(buildGraph(memories, skills, sessions))
  }, [memories, skills, sessions, kgLoaded])

  useEffect(() => {
    if (!selected) {
      setWikiArticle(null)
      setIsRenaming(false)
      setShowAddRel(false)
      return
    }
    setRenameValue(selected.label)
    window.electronAPI?.kg?.wikiArticle?.(selected.label || selected.id)
      .then(res => setWikiArticle(res || null))
      .catch(() => setWikiArticle(null))
  }, [selected])

  const jumpToEntity = (entityName: string) => {
    const target = entityName.trim()
    const found = graph.nodes.find(n => n.label.toLowerCase() === target.toLowerCase() || n.id.toLowerCase() === target.toLowerCase())
    if (found) {
      setSelected(found)
    } else {
      setSelected({ id: target, label: target, type: 'memory', extra: 'entity' })
    }
  }

  const handleRenameNode = async () => {
    if (!selected || !renameValue.trim() || renameValue.trim() === selected.label) {
      setIsRenaming(false)
      return
    }
    const res = await window.electronAPI?.kg?.renameNode?.(selected.label, renameValue.trim())
    if (res?.ok) {
      setIsRenaming(false)
      await reloadGraph()
      jumpToEntity(renameValue.trim())
    }
  }

  const handleDeleteNode = async () => {
    if (!selected) return
    const res = await window.electronAPI?.kg?.deleteNode?.(selected.label)
    if (res?.ok) {
      setSelected(null)
      await reloadGraph()
    }
  }

  const handleAddRelation = async () => {
    if (!selected || !newTarget.trim()) return
    const res = await window.electronAPI?.kg?.addRelation?.(selected.label, newTarget.trim(), newRel.trim() || 'relates_to')
    if (res?.ok) {
      setNewTarget('')
      setShowAddRel(false)
      await reloadGraph()
      const art = await window.electronAPI?.kg?.wikiArticle?.(selected.label)
      setWikiArticle(art)
    }
  }

  const handleDeleteRelation = async (target: string, rel: string) => {
    if (!selected) return
    const res = await window.electronAPI?.kg?.deleteRelation?.(selected.label, target, rel)
    if (res?.ok) {
      await reloadGraph()
      const art = await window.electronAPI?.kg?.wikiArticle?.(selected.label)
      setWikiArticle(art)
    }
  }

  const handleCopyWiki = () => {
    if (!wikiArticle?.markdown) return
    navigator.clipboard.writeText(wikiArticle.markdown)
    setCopiedWiki(true)
    setTimeout(() => setCopiedWiki(false), 2000)
  }

  const { nodes, edges } = graph
  const filtered = filter ? nodes.filter(n => n.label.toLowerCase().includes(filter.toLowerCase())) : nodes

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Brain size={18} style={{ color: 'var(--accent)' }} />
              <span>{t('sidebar.nav.learning')} & DeepWiki</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('learning_graph.desc')}</p>
          </div>
          <div className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {nodes.length} nodes · {edges.length} connections
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(['memory', 'skill', 'session', 'tool'] as Node['type'][]).map(type => (
            <span key={type} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[type] }} />
              {t(`learning_graph.${type}`)}
            </span>
          ))}
        </div>

        {/* Search filter */}
        <div className="mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--content-bg)] border text-sm" style={{ borderColor: 'var(--border)' }}>
            <Search size={14} className="text-gray-400 shrink-0" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('learning_graph.filter')} className="w-full bg-transparent outline-none text-sm" />
          </div>
        </div>

        {/* Node grid + DeepWiki detail panel */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2 max-h-[65vh] overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>{t('learning_graph.empty')}</div>
            )}
            {filtered.map(node => {
              const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id)
              return (
                <button key={node.id}
                  onClick={() => setSelected(node)}
                  className="w-full text-left flex items-start gap-3 p-2.5 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ borderColor: selected?.id === node.id ? 'var(--accent)' : 'var(--border)', backgroundColor: selected?.id === node.id ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}>
                  <span className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: COLORS[node.type] || COLORS.default }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block font-mono" style={{ color: 'var(--text-primary)' }}>{node.label}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t(`learning_graph.${node.type}`)} · {nodeEdges.length} links</span>
                    {node.created_at && <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>· {node.created_at.slice(0, 10)}</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* DeepWiki Detail panel */}
          <div className="col-span-1">
            {selected ? (
              <div className="rounded-lg border p-3 sticky top-4 space-y-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                {/* Header & Type */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[selected.type] || COLORS.default }} />
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono" style={{ backgroundColor: 'var(--border)', color: 'var(--text-secondary)' }}>{selected.extra || selected.type}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setIsRenaming(!isRenaming)} title="重命名实体" className="p-1 rounded hover:bg-[var(--border)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <Edit2 size={11} />
                    </button>
                    <button onClick={handleDeleteNode} title="删除实体" className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Entity Name / Rename Input */}
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="w-full text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)]"
                      style={{ borderColor: 'var(--accent)' }}
                      onKeyDown={e => e.key === 'Enter' && handleRenameNode()}
                    />
                    <button onClick={handleRenameNode} className="px-2 py-1 bg-[var(--accent)] text-white text-[10px] rounded shrink-0">保存</button>
                  </div>
                ) : (
                  <h3 className="text-sm font-semibold font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                    [[{selected.label}]]
                  </h3>
                )}

                {/* Tabs: Graph Links vs Wiki Article */}
                <div className="flex items-center gap-1 border-b border-[var(--border)] pb-1.5">
                  <button
                    onClick={() => setActiveTab('graph')}
                    className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${activeTab === 'graph' ? 'bg-[var(--border)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  >
                    <Link size={10} />
                    <span>{t('learning_graph.graph_tab')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('wiki')}
                    className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${activeTab === 'wiki' ? 'bg-[var(--border)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  >
                    <BookOpen size={10} />
                    <span>{t('learning_graph.wiki_tab')}</span>
                  </button>
                </div>

                {/* Tab: Graph Links */}
                {activeTab === 'graph' && (
                  <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                    {/* Outgoing Relations */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] uppercase font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                        <span>{t('learning_graph.outgoing')} ({wikiArticle?.outgoing?.length || 0})</span>
                        <button onClick={() => setShowAddRel(!showAddRel)} className="text-[10px] text-[var(--accent)] flex items-center gap-0.5 hover:underline">
                          <Plus size={10} />
                          <span>{t('learning_graph.add_relation')}</span>
                        </button>
                      </div>

                      {showAddRel && (
                        <div className="p-2 mb-2 rounded border bg-[var(--content-bg)] space-y-1.5 text-xs" style={{ borderColor: 'var(--border)' }}>
                          <input
                            placeholder={t('learning_graph.target_placeholder')}
                            value={newTarget}
                            onChange={e => setNewTarget(e.target.value)}
                            className="w-full px-1.5 py-0.5 border rounded text-xs bg-transparent"
                            style={{ borderColor: 'var(--border)' }}
                          />
                          <input
                            placeholder={t('learning_graph.relation_placeholder')}
                            value={newRel}
                            onChange={e => setNewRel(e.target.value)}
                            className="w-full px-1.5 py-0.5 border rounded text-xs bg-transparent"
                            style={{ borderColor: 'var(--border)' }}
                          />
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setShowAddRel(false)} className="px-2 py-0.5 text-[10px] rounded border" style={{ borderColor: 'var(--border)' }}>取消</button>
                            <button onClick={handleAddRelation} className="px-2 py-0.5 text-[10px] bg-[var(--accent)] text-white rounded">添加</button>
                          </div>
                        </div>
                      )}

                      {wikiArticle?.outgoing && wikiArticle.outgoing.length > 0 ? (
                        <div className="space-y-1">
                          {wikiArticle.outgoing.map((out, idx) => (
                            <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[var(--content-bg)] border text-xs" style={{ borderColor: 'var(--border)' }}>
                              <button onClick={() => jumpToEntity(out.to)} className="flex items-center gap-1 font-mono text-[var(--accent)] hover:underline truncate">
                                <ArrowRight size={10} className="shrink-0" />
                                <span className="truncate">[[{out.to}]]</span>
                              </button>
                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                <span className="text-[9px] px-1 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{out.relation}</span>
                                <button onClick={() => handleDeleteRelation(out.to, out.relation)} className="text-gray-400 hover:text-red-500 p-0.5">
                                  <Trash2 size={9} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] italic py-1" style={{ color: 'var(--text-muted)' }}>暂无向外关联</div>
                      )}
                    </div>

                    {/* Backlinks */}
                    <div>
                      <div className="text-[10px] uppercase font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                        {t('learning_graph.backlinks')} ({wikiArticle?.backlinks?.length || 0})
                      </div>
                      {wikiArticle?.backlinks && wikiArticle.backlinks.length > 0 ? (
                        <div className="space-y-1">
                          {wikiArticle.backlinks.map((b, idx) => (
                            <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[var(--content-bg)] border text-xs" style={{ borderColor: 'var(--border)' }}>
                              <button onClick={() => jumpToEntity(b.from)} className="flex items-center gap-1 font-mono text-[var(--accent)] hover:underline truncate">
                                <CornerDownRight size={10} className="shrink-0" />
                                <span className="truncate">[[{b.from}]]</span>
                              </button>
                              <span className="text-[9px] px-1 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] shrink-0">{b.relation}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] italic py-1" style={{ color: 'var(--text-muted)' }}>暂无反向引用</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab: DeepWiki Article */}
                {activeTab === 'wiki' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={handleCopyWiki}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--border)] transition-colors"
                      >
                        {copiedWiki ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                        <span>{copiedWiki ? t('learning_graph.copied_wiki') : t('learning_graph.export_wiki')}</span>
                      </button>
                    </div>
                    <div className="p-2.5 rounded border max-h-[46vh] overflow-y-auto bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }}>
                      {wikiArticle?.markdown ? (
                        <WikiRenderer markdown={wikiArticle.markdown} onJump={jumpToEntity} />
                      ) : (
                        <div className="text-xs text-[var(--text-muted)] py-4 text-center">正在加载维基文章...</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>{t('learning_graph.click_hint')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

