// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/input/PersonaSelector.tsx
//
// Compact, quiet precision persona & workspace SOUL.md selector for the composer toolbar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from 'react'
import { User, ChevronDown, Check, Sparkles, SlidersHorizontal } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { t } from '@/utils/i18n'
import { useStore } from '@/store'
import type { Persona } from '@/types'

export interface PersonaSelectorProps {
  currentPersonaId: number | null | undefined
  personas: Persona[]
  workspaceSoul: { name: string; prompt?: string; isWorkspace?: boolean } | null
  onSelect: (personaId: number | null) => void
  disabled?: boolean
}

export default function PersonaSelector({
  currentPersonaId,
  personas,
  workspaceSoul,
  onSelect,
  disabled = false,
}: PersonaSelectorProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Determine current active label and icon (matches backend persona injection rules)
  const isSoulActive =
    workspaceSoul !== null &&
    (currentPersonaId === -1 || (currentPersonaId == null && Boolean(workspaceSoul.isWorkspace)))
  const currentLabel = useMemo(() => {
    if (isSoulActive && workspaceSoul) {
      return `SOUL: ${workspaceSoul.name}`
    }
    if (currentPersonaId && currentPersonaId > 0) {
      const found = personas.find((p) => p.id === currentPersonaId)
      if (found) return found.name
    }
    return t('chat.no_persona')
  }, [isSoulActive, workspaceSoul, currentPersonaId, personas])

  const optionIds = useMemo(() => {
    const ids: { id: number; domId: string }[] = []
    if (workspaceSoul) ids.push({ id: -1, domId: 'persona-opt-soul' })
    ids.push({ id: 0, domId: 'persona-opt-none' })
    for (const p of personas) ids.push({ id: p.id, domId: `persona-opt-${p.id}` })
    return ids
  }, [workspaceSoul, personas])

  useEffect(() => {
    if (!open) return
    const curVal = isSoulActive ? -1 : currentPersonaId && currentPersonaId > 0 ? currentPersonaId : 0
    const idx = optionIds.findIndex((o) => o.id === curVal)
    setActiveIndex(idx >= 0 ? idx : 0)
  }, [open, optionIds, isSoulActive, currentPersonaId])

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (optionIds.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % optionIds.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + optionIds.length) % optionIds.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(optionIds.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      const target = optionIds[activeIndex]
      if (target && !disabled) {
        e.preventDefault()
        onSelect(target.id)
        setOpen(false)
      }
    }
  }

  const tooltipText = t('tooltip.persona')

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 shrink-0" onKeyDown={open ? handleListKeyDown : undefined}>
      <Tooltip text={tooltipText}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={tooltipText}
          className="h-6.5 flex items-center gap-1 text-[11px] font-medium rounded-[6px] border border-transparent hover:border-[var(--border)] px-1.5 outline-none max-w-[125px] sm:max-w-[160px] bg-transparent hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
          style={{
            color: open || isSoulActive || (currentPersonaId && currentPersonaId > 0)
              ? 'var(--text-primary)'
              : 'var(--text-muted)',
            backgroundColor: open ? 'var(--bg-secondary)' : undefined,
            borderColor: open ? 'var(--border)' : undefined,
          }}
        >
          {isSoulActive ? (
            <Sparkles size={11} className="text-[var(--accent)] shrink-0" aria-hidden="true" />
          ) : (
            <User size={11} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{currentLabel}</span>
          <ChevronDown
            size={10}
            className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
          />
        </button>
      </Tooltip>

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          aria-label={t('sidebar.nav.personas')}
          aria-activedescendant={optionIds[activeIndex]?.domId}
          className="absolute bottom-full mb-1.5 left-0 w-56 max-h-[300px] overflow-y-auto rounded-[8px] border shadow-lg p-1 z-40 text-xs popover-scale-up space-y-0.5"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider select-none">
            {t('sidebar.nav.personas')}
          </div>

          {/* Project SOUL.md option if available in workspace */}
          {workspaceSoul && (
            <button
              id="persona-opt-soul"
              type="button"
              role="option"
              aria-selected={isSoulActive}
              disabled={disabled}
              onClick={() => {
                onSelect(-1)
                setOpen(false)
              }}
              className="w-full text-left px-2 py-1.5 rounded-[5px] transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between cursor-pointer"
              style={isSoulActive || optionIds[activeIndex]?.id === -1 ? { backgroundColor: 'var(--content-bg)' } : {}}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles size={11} className="text-[var(--accent)] shrink-0" />
                <span className="truncate font-medium" style={{ color: isSoulActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                  SOUL.md: {workspaceSoul.name}
                </span>
              </div>
              {isSoulActive && <Check size={11} className="text-[var(--accent)] shrink-0 ml-1" />}
            </button>
          )}

          {/* Clean Slate / Default option */}
          <button
            id="persona-opt-none"
            type="button"
            role="option"
            aria-selected={!isSoulActive && (!currentPersonaId || currentPersonaId === 0)}
            disabled={disabled}
            onClick={() => {
              onSelect(0)
              setOpen(false)
            }}
            className="w-full text-left px-2 py-1.5 rounded-[5px] transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between cursor-pointer"
            style={(!isSoulActive && (!currentPersonaId || currentPersonaId === 0)) || optionIds[activeIndex]?.id === 0 ? { backgroundColor: 'var(--content-bg)' } : {}}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <User size={11} className="text-[var(--text-muted)] shrink-0" />
              <span
                className="truncate"
                style={{ color: !isSoulActive && (!currentPersonaId || currentPersonaId === 0) ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                {t('chat.no_persona')}
              </span>
            </div>
            {!isSoulActive && (!currentPersonaId || currentPersonaId === 0) && (
              <Check size={11} className="text-[var(--accent)] shrink-0 ml-1" />
            )}
          </button>

          {/* Saved SQLite Personas */}
          {personas.map((p) => {
            const isSelected = !isSoulActive && currentPersonaId === p.id
            return (
              <button
                id={`persona-opt-${p.id}`}
                key={p.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => {
                  onSelect(p.id)
                  setOpen(false)
                }}
                className="w-full text-left px-2 py-1.5 rounded-[5px] transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between cursor-pointer"
                style={isSelected || optionIds[activeIndex]?.id === p.id ? { backgroundColor: 'var(--content-bg)' } : {}}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <User size={11} className="text-[var(--text-muted)] shrink-0" />
                  <span className="truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {p.name}
                  </span>
                </div>
                {isSelected && <Check size={11} className="text-[var(--accent)] shrink-0 ml-1" />}
              </button>
            )
          })}

          <div className="pt-1 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                useStore.getState().setCurrentView('settings')
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('aether:settings-tab', { detail: 'providers-routing' }))
                  setTimeout(() => {
                    const prefersReducedMotion =
                      typeof window !== 'undefined' &&
                      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                    document.getElementById('settings-personas-card')?.scrollIntoView({
                      behavior: prefersReducedMotion ? 'auto' : 'smooth',
                      block: 'start',
                    })
                  }, 50)
                }, 30)
              }}
              className="w-full text-left px-2 py-1.5 rounded-[5px] transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <SlidersHorizontal size={11} className="shrink-0" />
              <span className="truncate">{t('persona.manage')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
