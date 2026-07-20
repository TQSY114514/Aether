import { useState, useRef, useLayoutEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Tooltip with a small open delay so quick mouse-overs don't flash it.
// Boundary-aware: measures its rendered rect and shifts/flips so the text
// never overflows the window. Allows wrapping (max-width) so long
// descriptions don't shoot off-screen.
export default function Tooltip({ text, children, side = 'bottom' }: { text: string; children: ReactNode; side?: 'bottom' | 'top' }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  const [actualSide, setActualSide] = useState<'bottom' | 'top'>(side)

  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), 250)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  // After the tooltip renders, measure it and clamp within the viewport so it
  // never escapes the window edge. Runs on every open.
  useLayoutEffect(() => {
    if (!open || !tipRef.current) return
    const el = tipRef.current
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Horizontal: if it overflows the right edge, shift left; if it overflows
    // the left edge, shift right. We translate by the overflow amount.
    let dx = 0
    if (r.right > vw - 8) dx = vw - 8 - r.right
    if (r.left + dx < 8) dx = 8 - r.left
    setShift(dx)
    // Vertical: if it overflows the bottom and there's room above, flip to top.
    if (side === 'bottom' && r.bottom > vh - 8 && r.top - r.height > 8) setActualSide('top')
    else if (side === 'top' && r.top < 8 && r.bottom + r.height < vh - 8) setActualSide('bottom')
    else setActualSide(side)
  }, [open, side, text])

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
      {children}
      {open && (
        <div ref={tipRef}
          className={cn(
            'absolute left-1/2 px-2.5 py-1.5 rounded-md text-[11px] leading-snug pointer-events-none z-50 shadow-lg animate-blur-fade',
            actualSide === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
          style={{
            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
            maxWidth: 'min(280px, 80vw)', whiteSpace: 'normal',
            transform: `translateX(calc(-50% + ${shift}px))`,
          }}>
          {text}
        </div>
      )}
    </div>
  )
}
