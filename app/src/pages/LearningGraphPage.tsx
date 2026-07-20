import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { Brain, Wrench, Link, Search, Cpu } from 'lucide-react'
import { t } from '@/utils/i18n'

// ──────────────────────────── Learning Graph ────────────────────────────────
// A simple interactive knowledge graph showing how memories, skills, sessions,
// and tools connect. Nodes are coloured by type; edges show cross-references.
// Uses pure CSS+SVG — no heavy dependency.
// ────────────────────────────────────────────────────────────────────────────

type Node = { id: string; label: string; type: 'memory' | 'skill' | 'session' | 'tool'; created_at?: string; extra?: string }
type Edge = { from: string; to: string; label: string }
type GraphData = { nodes: Node[]; edges: Edge[] }

const COLORS: Record<Node['type'] | 'default', string> = {
  memory: '#2563EB', skill: '#16A34A', session: '#6B7280', tool: '#D97706', default: '#9CA3AF',
}

// Build the graph from DB data. Simple keyword overlap (not NLP) so it stays
// fast and zero-dependency.
function buildGraph(memories: { id: number; content: string; created_at: string }[], skills: { name: string; description: string }[], sessions: { id: number; title: string; updated_at: string; last_message?: string }[]): GraphData {
  const nodes: Node[] = []
  const edges: Edge[] = []
  // Nodes
  memories.forEach(m => nodes.push({ id: `mem-${m.id}`, label: m.content.slice(0, 60), type: 'memory', created_at: m.created_at, extra: m.content }))
  skills.forEach(s => nodes.push({ id: `skill-${s.name}`, label: s.name, type: 'skill', extra: s.description }))
  sessions.forEach(s => nodes.push({ id: `sess-${s.id}`, label: s.title || `#${s.id}`, type: 'session', created_at: s.updated_at }))
  // Edges: skill↔session when session last_message mentions the skill name
  for (const skill of skills) {
    for (const sess of sessions) {
      const combined = (sess.title || '') + ' ' + (sess.last_message || '')
      if (combined.toLowerCase().includes(skill.name.toLowerCase())) {
        edges.push({ from: `skill-${skill.name}`, to: `sess-${sess.id}`, label: 'used in' })
      }
    }
  }
  // Edges: memory↔session when memory content overlaps with session title/last_message keywords
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

export default function LearningGraphPage() {
  const memories = useStore(s => s.memories)
  const loadMemories = useStore(s => s.loadMemories)
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  const sessions = useStore(s => s.sessions)
  const loadSessions = useStore(s => s.loadSessions)
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const [selected, setSelected] = useState<Node | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { loadMemories(); loadSessions(); try { window.electronAPI?.skills?.list?.().then(setSkills).catch(() => {}) } catch {} }, [loadMemories, loadSessions])
  useEffect(() => { setGraph(buildGraph(memories, skills, sessions)) }, [memories, skills, sessions])

  const { nodes, edges } = graph
  const filtered = filter ? nodes.filter(n => n.label.toLowerCase().includes(filter.toLowerCase())) : nodes

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>🧠 {t('sidebar.nav.learning')}</h1>
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border text-sm" style={{ borderColor: 'var(--border)' }}>
            <Search size={14} className="text-gray-400 shrink-0" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('learning_graph.filter')} className="w-full bg-transparent outline-none text-sm" />
          </div>
        </div>

        {/* Node grid + detail panel */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>{t('learning_graph.empty')}</div>
            )}
            {filtered.map(node => {
              const nodeEdges = edges.filter(e => e.from === node.id || e.to === node.id)
              return (
                <button key={node.id}
                  onClick={() => setSelected(node)}
                  className="w-full text-left flex items-start gap-3 p-2.5 rounded-xl border hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ borderColor: selected?.id === node.id ? 'var(--accent)' : 'var(--border)', backgroundColor: selected?.id === node.id ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}>
                  <span className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: COLORS[node.type] || COLORS.default }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block" style={{ color: 'var(--text-primary)' }}>{node.label}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t(`learning_graph.${node.type}`)} · {nodeEdges.length} links</span>
                    {node.created_at && <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>· {node.created_at.slice(0, 10)}</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail panel */}
          <div className="col-span-1">
            {selected ? (
              <div className="rounded-xl border p-3 sticky top-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[selected.type] || COLORS.default }} />
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--border)', color: 'var(--text-secondary)' }}>{t(`learning_graph.${selected.type}`)}</span>
                </div>
                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{selected.label}</h3>
                {selected.extra && (
                  <p className="text-xs leading-relaxed mb-3 max-h-32 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>{selected.extra}</p>
                )}
                <div className="text-[10px] uppercase font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{t('learning_graph.connections')}</div>
                {edges.filter(e => e.from === selected.id || e.to === selected.id).map((e, i) => {
                  const otherId = e.from === selected.id ? e.to : e.from
                  const other = nodes.find(n => n.id === otherId)
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-xs py-0.5">
                      <Link size={10} className="text-gray-400 shrink-0" />
                      <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{other?.label || otherId}</span>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{e.label}</span>
                    </div>
                  )
                })}
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
