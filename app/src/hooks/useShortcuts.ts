import { useEffect } from 'react'
import { SHORTCUTS, matchCombo } from '@/shortcuts'

export interface ShortcutBinding {
  id: string // must match a SHORTCUTS entry id
  when?: () => boolean
  run: () => void
  /** Skip firing while focus is inside a text field (leave native input undo alone). */
  skipWhenEditable?: boolean
}

// Text-field focus guard: input/textarea/contenteditable are left to native
// undo and ChatInput's own Ctrl+Z, so the app-level undo can't double-fire.
function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

// Binds one global keydown listener from the central registry. Only the ids
// passed in are actually bound — the full SHORTCUTS list is owned by
// shortcuts.ts and rendered by ShortcutOverlay, so help always stays in sync.
export function useShortcuts(bindings: ShortcutBinding[]) {
  useEffect(() => {
    const byId = new Map(bindings.map((b) => [b.id, b]))
    const handler = (e: KeyboardEvent) => {
      for (const meta of SHORTCUTS) {
        const b = byId.get(meta.id)
        if (!b) continue
        const hit = meta.combos.some((combo) => matchCombo(e, combo, meta.laxMods))
        if (!hit) continue
        if (b.skipWhenEditable && isEditableTarget(e.target)) continue
        if (b.when && !b.when()) continue
        e.preventDefault()
        b.run()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [bindings])
}