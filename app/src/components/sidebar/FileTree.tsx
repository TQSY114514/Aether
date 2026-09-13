// Sidebar file tree: lazily lists the current session's workspace via a
// containment-checked fs:list-dir IPC. Clicking a file dispatches an
// 'aether:open-file' CustomEvent with the absolute path — ChatInput listens
// and inserts an @reference at the cursor.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Copy, File as FileIcon, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

interface FsEntry {
  name: string
  isDir: boolean
}

function baseName(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export default function FileTree() {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const [open, setOpen] = useState(false)
  const [root, setRoot] = useState<string | null>(null)
  const [cache, setCache] = useState<Map<string, FsEntry[]>>(new Map())
  const cacheRef = useRef<Map<string, FsEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null)

  const loadDir = async (dir: string, force = false) => {
    if (!force && cacheRef.current.has(dir)) return
    setLoading(true)
    setError(null)
    let entries: FsEntry[] = []
    let err: string | null = null
    try {
      const res = await window.electronAPI?.fs?.listDir(dir, currentSessionId)
      if (res?.ok) entries = res.entries || []
      else err = res?.error || 'read_failed'
    } catch {
      err = 'read_failed'
    }
    setCache((prev) => {
      const next = new Map(prev)
      next.set(dir, entries)
      cacheRef.current = next
      return next
    })
    setError(err)
    setLoading(false)
  }

  // Follow the workspace root of the current session (repo-root tracking).
  useEffect(() => {
    let cancelled = false
    setRoot(null)
    setCache(new Map())
    setExpanded({})
    setError(null)
    window.electronAPI?.agent
      ?.getWorkspace(currentSessionId ?? undefined)
      .then((r) => {
        if (!cancelled && r) {
          setRoot(r)
          loadDir(r)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId])

  // Close the context menu on any outside click.
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [ctxMenu])

  const toggleDir = (dir: string) => {
    setExpanded((prev) => ({ ...prev, [dir]: !prev[dir] }))
    loadDir(dir)
  }

  const onFile = (path: string) => {
    window.dispatchEvent(new CustomEvent('aether:open-file', { detail: path }))
  }

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
    } catch {}
  }

  const renderRows = (dir: string, depth: number): ReactNode[] => {
    if (depth > 8) return [] // guard against pathological nesting
    const entries = cache.get(dir) || []
    return entries.map((e) => {
      const full = `${dir}/${e.name}`
      if (!e.isDir) {
        return (
          <div
            key={full}
            className="flex items-center gap-1.5 pr-1 rounded-md cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ paddingLeft: depth * 12 + 6 }}
            onClick={() => onFile(full)}
            onContextMenu={(ev) => {
              ev.preventDefault()
              setCtxMenu({ x: ev.clientX, y: ev.clientY, path: full })
            }}
          >
            <span className="w-[12px] shrink-0" />
            <FileIcon size={13} className="shrink-0 text-[var(--text-muted)]" />
            <span className="truncate text-[12px]" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
          </div>
        )
      }
      const isOpen = !!expanded[full]
      return (
        <div key={full}>
          <div
            className="flex items-center gap-1 pr-1 rounded-md cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ paddingLeft: depth * 12 + 6 }}
            onClick={() => toggleDir(full)}
            onContextMenu={(ev) => {
              ev.preventDefault()
              setCtxMenu({ x: ev.clientX, y: ev.clientY, path: full })
            }}
          >
            {isOpen ? (
              <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />
            )}
            {isOpen ? (
              <FolderOpen size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
            ) : (
              <Folder size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
            )}
            <span className="truncate text-[12px]" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
          </div>
          {isOpen && renderRows(full, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="px-2 pt-1" style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer select-none hover:bg-[var(--bg-secondary)] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <FolderOpen size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="flex-1 text-left truncate text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {root ? baseName(root) : t('filetree.workspace')}
        </span>
        <button
          className="p-1 rounded hover:bg-[var(--border)] shrink-0"
          title={t('filetree.refresh')}
          onClick={(e) => {
            e.stopPropagation()
            cacheRef.current = new Map()
            setCache(new Map())
            if (root) loadDir(root, true)
          }}
        >
          <RefreshCw size={11} className="text-[var(--text-muted)]" />
        </button>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
      {open && (
        <div className="max-h-56 overflow-y-auto mb-1.5 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          {loading && !root && (
            <div className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>…</div>
          )}
          {!root && !loading && (
            <div className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('filetree.no_workspace')}</div>
          )}
          {error && (
            <div className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--error)' }}>
              {error === 'outside_workspace' ? t('filetree.outside_workspace') : t('filetree.read_failed')}
            </div>
          )}
          {root && renderRows(root, 0)}
        </div>
      )}
      {ctxMenu && (
        <div
          className="fixed z-[120] rounded-lg border shadow-lg py-1 min-w-[160px]"
          style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 180),
            top: Math.min(ctxMenu.y, window.innerHeight - 60),
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
          }}
        >
          <button
            onClick={() => {
              copyPath(ctxMenu.path)
              setCtxMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >
            <Copy size={11} /> {t('filetree.copy_path')}
          </button>
        </div>
      )}
    </div>
  )
}