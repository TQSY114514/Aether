// ── InputReference — @skill_name / #tool_name / !macro_name auto-complete ──
// Inspired by SonettoHere's input box reference system.
// Detects @ / # / ! prefixes in the input box and shows auto-complete suggestions.
import React, { useState, useEffect, useCallback, useRef } from 'react'

const PREFIXES = {
  '@': { label: 'Skills', color: 'text-blue-400', fetch: null },    // populated via IPC
  '#': { label: 'Tools', color: 'text-green-400', fetch: null },     // populated via IPC
  '!': { label: 'Commands', color: 'text-purple-400', fetch: null }, // populated via IPC
}

type Suggestion = { text: string; desc: string; type: 'skill' | 'tool' | 'command' }

type InputReferenceProps = {
  value: string
  cursorPos: number
  visible: boolean
  onSelect: (sel: { prefix: string; query: string; replacement: string }) => void
}

// Built-in tool list (同步可用，无需 IPC)
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
    const match = before.match(/([@#!])([\w\u4e00-\u9fff_-]*)$/)
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

    // Build suggestions based on prefix
    let items: Suggestion[] = []
    if (p === '@') {
      // Skills
      items = skills
        .filter(s => s.name.toLowerCase().includes(q))
        .map(s => ({ text: s.name, desc: s.description || 'Skill', type: 'skill' }))
    } else if (p === '#') {
      // Tools
      items = BUILTIN_TOOLS
        .filter(t => t.toLowerCase().includes(q))
        .map(t => ({ text: t, desc: 'Tool', type: 'tool' }))
    } else if (p === '!') {
      // Commands
      items = commands
        .filter(c => (c.name || c.id).toLowerCase().includes(q))
        .map(c => ({ text: c.name || c.id, desc: c.description || 'Command', type: 'command' }))
    }

    setSuggestions(items.slice(0, 8))
  }, [value, cursorPos, visible, skills, commands])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible || suggestions.length === 0) return
    // Stop the event from reaching the textarea so Enter/Tab/arrows select a
    // suggestion instead of submitting the message or moving the caret.
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
      className="absolute bottom-full left-0 mb-1 w-56 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a2e]/95 backdrop-blur-md shadow-xl z-50"
    >
      <div className="px-3 py-1.5 text-xs text-white/40 border-b border-white/5">
        {prefixInfo.label}
      </div>
      {suggestions.map((s, i) => (
        <div
          key={s.text}
          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
            i === selectedIdx ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'
          }`}
          onClick={() => onSelect({ prefix: prefix || '', query, replacement: s.text })}
          onMouseEnter={() => setSelectedIdx(i)}
        >
          <span className={`text-xs font-mono ${prefixInfo.color}`}>{prefix}</span>
          <span className="truncate">{s.text}</span>
          {s.desc && (
            <span className="text-xs text-white/30 truncate ml-auto">{s.desc}</span>
          )}
        </div>
      ))}
      <div className="px-2 py-1 text-[10px] text-white/20 border-t border-white/5 text-right">
        ↑↓ 导航 · Enter 选择 · Esc 关闭
      </div>
    </div>
  )
}
