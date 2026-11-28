interface GhostTextMirrorProps {
  value: string
  ghostSuffix: string
  scrollTop: number
}

/**
 * Invisible-prefix + muted-suffix mirror layer aligned with ChatInput's textarea.
 * Keeps native textarea IME, paste, undo, and selection untouched while rendering
 * inline gray ghost completions immediately after the caret.
 */
export default function GhostTextMirror({ value, ghostSuffix, scrollTop }: GhostTextMirrorProps) {
  if (!ghostSuffix) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 overflow-hidden py-0.5 text-[13.5px] leading-[1.6] tracking-[-0.005em] whitespace-pre-wrap break-words"
    >
      <div style={{ transform: scrollTop ? `translateY(-${scrollTop}px)` : undefined }}>
        <span className="text-transparent">{value}</span>
        <span className="opacity-55" style={{ color: 'var(--text-muted)' }}>
          {ghostSuffix}
        </span>
      </div>
    </div>
  )
}
