import { useState, useRef, useEffect } from 'react'
import { User, ChevronDown, Check, Sparkles } from 'lucide-react'
import { t } from '@/utils/i18n'

interface PersonaSelectorProps {
  currentPersonaId: number | null | undefined
  workspaceSoul: { name: string } | null
  personas: { id: number; name: string }[]
  onSelect: (personaId: number) => void
}

/** Sleek, unified persona and workspace soul selector for the chat header. */
export default function PersonaSelector({
  currentPersonaId,
  workspaceSoul,
  personas,
  onSelect,
}: PersonaSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Determine current label
  const isSoulActive = currentPersonaId === -1 || (currentPersonaId === null && workspaceSoul !== null)
  let currentLabel = t('chat.no_persona', '通用助手')
  if (isSoulActive && workspaceSoul) {
    currentLabel = `SOUL: ${workspaceSoul.name}`
  } else if (currentPersonaId && currentPersonaId > 0) {
    const found = personas.find((p) => p.id === currentPersonaId)
    if (found) currentLabel = found.name
  }

  return (
    <div className="relative inline-block app-no-drag" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-7.5 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] transition-all focus-visible:ring-1 focus-visible:ring-[var(--accent)] shrink-0 max-w-[190px]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        title={t('tooltip.persona', '选择人格预设 / 角色')}
        aria-label={t('tooltip.persona', '选择人格预设 / 角色')}
      >
        {isSoulActive ? (
          <Sparkles size={12} className="text-amber-500 shrink-0" />
        ) : (
          <User size={12} className="text-[var(--accent)] shrink-0" />
        )}
        <span className="truncate flex-1 text-left">{currentLabel}</span>
        <ChevronDown size={11} className="text-[var(--text-muted)] shrink-0 opacity-70" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-52 rounded-lg border shadow-lg p-1 z-50 text-xs animate-spring-up space-y-0.5"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <span className="text-[10px] font-semibold px-2 py-1 text-[var(--text-muted)] block uppercase tracking-wider">
            {t('sidebar.nav.personas', '角色预设')}
          </span>

          {workspaceSoul && (
            <button
              type="button"
              onClick={() => {
                onSelect(-1)
                setOpen(false)
              }}
              className="w-full text-left px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)] flex items-center justify-between"
              style={isSoulActive ? { backgroundColor: 'var(--content-bg)' } : {}}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles size={12} className="text-amber-500 shrink-0" />
                <span className="truncate font-medium" style={{ color: isSoulActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                  SOUL.md: {workspaceSoul.name}
                </span>
              </div>
              {isSoulActive && <Check size={11} className="text-emerald-500 shrink-0 ml-1" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onSelect(0)
              setOpen(false)
            }}
            className="w-full text-left px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)] flex items-center justify-between"
            style={!isSoulActive && (!currentPersonaId || currentPersonaId === 0) ? { backgroundColor: 'var(--content-bg)' } : {}}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <User size={12} className="text-[var(--text-muted)] shrink-0" />
              <span className="truncate" style={{ color: !isSoulActive && (!currentPersonaId || currentPersonaId === 0) ? 'var(--accent)' : 'var(--text-primary)' }}>
                {t('chat.no_persona', '无预设 (通用助手)')}
              </span>
            </div>
            {!isSoulActive && (!currentPersonaId || currentPersonaId === 0) && (
              <Check size={11} className="text-emerald-500 shrink-0 ml-1" />
            )}
          </button>

          {personas.map((p) => {
            const isSelected = !isSoulActive && currentPersonaId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelect(p.id)
                  setOpen(false)
                }}
                className="w-full text-left px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)] flex items-center justify-between"
                style={isSelected ? { backgroundColor: 'var(--content-bg)' } : {}}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <User size={12} className="text-[var(--text-muted)] shrink-0" />
                  <span className="truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {p.name}
                  </span>
                </div>
                {isSelected && <Check size={11} className="text-emerald-500 shrink-0 ml-1" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
