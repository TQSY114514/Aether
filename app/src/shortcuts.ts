// Central shortcut registry — single source of truth for key bindings AND the
// help overlay (A3): App.tsx binds via useShortcuts(), ShortcutOverlay renders
// from this list, so a new shortcut registered here shows up in help for free.

export interface ShortcutMeta {
  id: string
  group: 'global' | 'chat' | 'navigation'
  desc: string
  combos: string[] // e.g. ['Ctrl+K']; 'Ctrl' also accepts Meta (mac-style)
  // Modifiers allowed to be pressed in ADDITION to the required ones
  // (Ctrl+? physically arrives as Ctrl+Shift+? on many layouts).
  laxMods?: string[]
}

export const SHORTCUTS: ShortcutMeta[] = [
  { id: 'toggle-palette', group: 'global', desc: 'Command palette', combos: ['Ctrl+K'] },
  { id: 'toggle-shortcuts', group: 'global', desc: 'Keyboard shortcuts help', combos: ['Ctrl+?', 'Ctrl+/'], laxMods: ['shift'] },
  { id: 'new-chat', group: 'chat', desc: 'New chat', combos: ['Ctrl+N'] },
  { id: 'regenerate', group: 'chat', desc: 'Regenerate last reply', combos: ['Ctrl+R'] },
  { id: 'edit-last', group: 'chat', desc: 'Edit last message', combos: ['Ctrl+E'] },
  { id: 'undo', group: 'chat', desc: 'Undo last edit', combos: ['Ctrl+Z'] },
  { id: 'redo', group: 'chat', desc: 'Redo last undo', combos: ['Ctrl+Shift+Z'] },
  { id: 'copy-code', group: 'chat', desc: 'Copy code block', combos: ['Ctrl+Shift+C'] },
  { id: 'stop', group: 'chat', desc: 'Stop generating / close dialogs', combos: ['Escape'] },
  { id: 'history-back', group: 'navigation', desc: 'Back in session history', combos: ['Alt+ArrowLeft'] },
  { id: 'history-forward', group: 'navigation', desc: 'Forward in session history', combos: ['Alt+ArrowRight'] },
  { id: 'send', group: 'chat', desc: 'Send message', combos: ['Enter'] },
  { id: 'newline', group: 'chat', desc: 'New line in input', combos: ['Shift+Enter'] },
  { id: 'slashes', group: 'chat', desc: 'Slash commands', combos: ['/'] },
]

// Strict match: every required modifier present, no unexpected extra modifiers
// (capped by laxMods), and the exact key.
export function matchCombo(e: KeyboardEvent, combo: string, lax: string[] = []): boolean {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]
  if (e.key.toLowerCase() !== key) return false
  const required = parts.slice(0, -1)
  const pressed = [
    e.ctrlKey || e.metaKey ? 'ctrl' : '',
    e.altKey ? 'alt' : '',
    e.shiftKey ? 'shift' : '',
  ].filter(Boolean)
  for (const need of required) {
    if (!pressed.includes(need)) return false
  }
  for (const p of pressed) {
    if (!required.includes(p) && !lax.includes(p)) return false
  }
  return true
}