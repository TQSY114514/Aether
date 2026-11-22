// ── InputReference — @file / @dir / @skill / #tool / !command auto-complete ──
// Detects @ / # / ! prefixes in the input box and shows auto-complete suggestions.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { FileCode, Folder, Sparkles, Wrench, Terminal } from 'lucide-react'
import { useStore } from '@/store'

const PREFIXES = {
  '@': { label: '文件、目录与技能 (Files, Paths & Skills)', color: 'text-blue-400' },
  '#': { label: '内置工具 (Tools)', color: 'text-emerald-400' },
  '!': { label: '快捷指令 (Commands)', color: 'text-purple-400' },
}

type Suggestion = { text: string; desc: string; type: 'file' | 'dir' | 'skill' | 'tool' | 'command' }

type InputReferenceProps = {
  value: string
  cursorPos: number
  visible: boolean
  onSelect: (sel: { prefix: string; query: string; replacement: string }) => void
}

// Built-in tool list
const BUILTIN_TOOLS = [
  'read_file', 'list_dir', 'glob_find', 'grep_search', 'web_search', 'web_fetch',
  'write_file', 'edit_file', 'run_command', 'git_status', 'git_diff',
  'memory_save', 'memory_list', 'use_skill', 'ask_user', 'todo_write',
  'change_directory',
]

function parseAtPathQuery(rawQuery: string): { isPathMode: boolean; dirPart: string; namePrefix: string; displayBase: string; sep: string } {
  const sep = rawQuery.includes('\\') && !rawQuery.includes('/') ? '\\' : '/'
  if (rawQuery === '~' || rawQuery === '.' || rawQuery === '..') {
    return { isPathMode: true, dirPart: rawQuery, namePrefix: '', displayBase: rawQuery + sep, sep }
  }
  if (/^[a-zA-Z]:$/.test(rawQuery)) {
    return { isPathMode: true, dirPart: rawQuery + '\\', namePrefix: '', displayBase: rawQuery + sep, sep }
  }
  const lastFwd = rawQuery.lastIndexOf('/')
  const lastBack = rawQuery.lastIndexOf('\\')
  const lastSep = Math.max(lastFwd, lastBack)
  if (lastSep >= 0) {
    const rawDir = rawQuery.slice(0, lastSep + 1)
    const dirPart = rawDir === '/' ? '/' : /^[a-zA-Z]:[\\/]$/.test(rawDir) ? rawDir : rawDir.slice(0, -1) || '.'
    return {
      isPathMode: true,
      dirPart,
      namePrefix: rawQuery.slice(lastSep + 1).toLowerCase(),
      displayBase: rawDir,
      sep,
    }
  }
  return { isPathMode: false, dirPart: '', namePrefix: rawQuery.toLowerCase(), displayBase: '', sep }
}

export default function InputReference({ value, cursorPos, onSelect, visible }: InputReferenceProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [prefix, setPrefix] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  const [commands, setCommands] = useState<{ id: string; name: string; description: string }[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessions = useStore((s) => s.sessions)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const activeCwd = React.useMemo(() => {
    const sess = sessions.find((s) => s.id === currentSessionId)
    return sess?.cwd || (currentSessionId ? sessionConfigs[currentSessionId]?.workspace : undefined) || undefined
  }, [sessions, sessionConfigs, currentSessionId])

  // Load skills and commands on mount
  useEffect(() => {
    const api = window.electronAPI
    if (api?.skills?.list) {
      api.skills.list().then(s => setSkills(Array.isArray(s) ? s : []))
    }
    if (api?.commands?.list) {
      api.commands.list().then(c => setCommands(Array.isArray(c) ? c : []))
    }
  }, [])

  // Detect prefix and query from cursor position
  useEffect(() => {
    if (!visible || !value || cursorPos === undefined) {
      setSuggestions([])
      setPrefix(null)
      return
    }

    // Find the last @ / # / ! before cursor (allows spaces/C: paths only up to whitespace)
    const before = value.slice(0, cursorPos)
    const match = before.match(/([@#!])([^\s]*)$/)
    if (!match) {
      setSuggestions([])
      setPrefix(null)
      return
    }

    const p = match[1]
    const rawQuery = match[2]
    const q = rawQuery.toLowerCase()
    setPrefix(p)
    setQuery(rawQuery)
    setSelectedIdx(0)

    let cancelled = false

    const buildSuggestions = async () => {
      let items: Suggestion[] = []
      if (p === '@') {
        const parsed = parseAtPathQuery(rawQuery)
        if (parsed.isPathMode && window.electronAPI?.fs?.listDir) {
          try {
            const res = await window.electronAPI.fs.listDir(parsed.dirPart, currentSessionId)
            if (res?.ok && Array.isArray(res.entries)) {
              const filtered = res.entries
                .filter((e) => !parsed.namePrefix || e.name.toLowerCase().includes(parsed.namePrefix))
                .slice(0, 10)
              items = filtered.map((e) => ({
                text: `${parsed.displayBase}${e.name}${e.isDir ? parsed.sep : ''}`,
                desc: e.isDir ? 'Dir' : 'File',
                type: e.isDir ? ('dir' as const) : ('file' as const),
              }))
            }
          } catch {}
        } else {
          // 1. Files from active session CWD search
          let fileItems: Suggestion[] = []
          try {
            const api = window.electronAPI
            if (api?.search?.files) {
              const files = await api.search.files(q, activeCwd)
              if (Array.isArray(files)) {
                fileItems = files.slice(0, 6).map((f: any) => ({
                  text: (f.relPath || f.name || '').replace(/\\/g, '/'),
                  desc: f.size ? `${Math.ceil(f.size / 1024)}KB` : 'File',
                  type: 'file' as const,
                }))
              }
            }
          } catch {}

          // 2. Skills
          const skillItems = skills
            .filter(s => s.name.toLowerCase().includes(q))
            .slice(0, 4)
            .map(s => ({ text: s.name, desc: s.description || 'Skill', type: 'skill' as const }))

          items = [...fileItems, ...skillItems]
        }
      } else if (p === '#') {
        // Tools
        items = BUILTIN_TOOLS
          .filter(t => t.toLowerCase().includes(q))
          .map(t => ({ text: t, desc: 'Tool', type: 'tool' as const }))
      } else if (p === '!') {
        // Commands
        items = commands
          .filter(c => (c.name || c.id).toLowerCase().includes(q))
          .map(c => ({ text: c.name || c.id, desc: c.description || 'Command', type: 'command' as const }))
      }

      if (!cancelled) {
        setSuggestions(items.slice(0, 10))
      }
    }

    buildSuggestions()

    return () => {
      cancelled = true
    }
  }, [value, cursorPos, visible, skills, commands, activeCwd, currentSessionId])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible || suggestions.length === 0) return
    e.stopPropagation()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const sel = suggestions[selectedIdx]
      if (sel) {
        onSelect({ prefix: prefix || '', query, replacement: sel.text })
      }
    } else if (e.key === 'Escape') {
      setSuggestions([])
    }
  }, [visible, suggestions, selectedIdx, onSelect, prefix, query])

  // Attach keyboard listener
  useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown, true)
      return () => document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [visible, handleKeyDown])

  if (!visible || suggestions.length === 0) return null

  const prefixInfo = (prefix && PREFIXES[prefix as keyof typeof PREFIXES]) || { label: '', color: 'text-gray-400' }

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-80 max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-xl z-50 p-1 font-sans"
    >
      <div className="px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] border-b border-[var(--border)] flex items-center justify-between">
        <span>{prefixInfo.label}</span>
        <span className="text-[10px] opacity-60">↑↓ 切换 · Enter/Tab 补全</span>
      </div>
      <div className="py-1">
        {suggestions.map((s, i) => (
          <div
            key={s.text + s.type}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
              i === selectedIdx ? 'bg-[var(--accent)]/15 text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
            }`}
            onClick={() => onSelect({ prefix: prefix || '', query, replacement: s.text })}
            onMouseEnter={() => setSelectedIdx(i)}
          >
            {s.type === 'dir' && <Folder size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />}
            {s.type === 'file' && <FileCode size={13} className="text-blue-400 shrink-0" />}
            {s.type === 'skill' && <Sparkles size={13} className="text-amber-400 shrink-0" />}
            {s.type === 'tool' && <Wrench size={13} className="text-emerald-400 shrink-0" />}
            {s.type === 'command' && <Terminal size={13} className="text-purple-400 shrink-0" />}
            <span className="truncate font-mono">{s.text}</span>
            {s.desc && (
              <span className="text-[10px] text-[var(--text-muted)] truncate ml-auto shrink-0">{s.desc}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
