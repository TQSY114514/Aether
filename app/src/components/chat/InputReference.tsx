// ── InputReference — @file / @skill / #tool / !command auto-complete ──
// Detects @ / # / ! prefixes in the input box and shows auto-complete suggestions.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { FileCode, Sparkles, Wrench, Terminal } from 'lucide-react'

const PREFIXES = {
  '@': { label: '文件与技能 (Files & Skills)', color: 'text-blue-400' },
  '#': { label: '内置工具 (Tools)', color: 'text-emerald-400' },
  '!': { label: '快捷指令 (Commands)', color: 'text-purple-400' },
}

type Suggestion = { text: string; desc: string; type: 'file' | 'skill' | 'tool' | 'command' }

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
]

export default function InputReference({ value, cursorPos, onSelect, visible }: InputReferenceProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [prefix, setPrefix] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  const [commands, setCommands] = useState<{ id: string; name: string; description: string }[]>([])
  const ref = useRef<HTMLDivElement>(null)

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

    // Find the last @ / # / ! before cursor
    const before = value.slice(0, cursorPos)
    const match = before.match(/([@#!])([\w\u4e00-\u9fff_\/.\-]*)$/)
    if (!match) {
      setSuggestions([])
      setPrefix(null)
      return
    }

    const p = match[1]
    const q = match[2].toLowerCase()
    setPrefix(p)
    setQuery(q)
    setSelectedIdx(0)

    let cancelled = false

    const buildSuggestions = async () => {
      let items: Suggestion[] = []
      if (p === '@') {
        // 1. Files from workspace search
        let fileItems: Suggestion[] = []
        try {
          const api = window.electronAPI
          if (api?.search?.files) {
            const files = await api.search.files(q)
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
  }, [value, cursorPos, visible, skills, commands])

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
      className="absolute bottom-full left-0 mb-2 w-80 max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] backdrop-blur-xl shadow-2xl z-50 p-1 font-sans"
    >
      <div className="px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] border-b border-[var(--border)] flex items-center justify-between">
        <span>{prefixInfo.label}</span>
        <span className="text-[10px] opacity-60">↑↓ 切换 · Enter 补全</span>
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
