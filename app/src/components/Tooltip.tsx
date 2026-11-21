import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Module-level warm-handoff state (Emil Kowalski / Linear toolbar pattern):
// First tooltip waits 220ms to avoid accidental hover flashes; once warm,
// moving across adjacent controls within 320ms opens instantly with zero delay.
let lastTooltipClosedAt = 0
let activeTooltipCount = 0
const INITIAL_DELAY_MS = 220
const WARM_WINDOW_MS = 320

export default function Tooltip({ text, children, side = 'bottom' }: { text: string; children: ReactNode; side?: 'bottom' | 'top' }) {
  const [open, setOpen] = useState(false)
  const [instant, setInstant] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasOpenRef = useRef(false)
  const tipRef = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  const [actualSide, setActualSide] = useState<'bottom' | 'top'>(side)

  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    const isWarm = activeTooltipCount > 0 || Date.now() - lastTooltipClosedAt < WARM_WINDOW_MS
    if (isWarm) {
      setInstant(true)
      if (!wasOpenRef.current) {
        wasOpenRef.current = true
        activeTooltipCount += 1
      }
      setOpen(true)
    } else {
      setInstant(false)
      timer.current = setTimeout(() => {
        if (!wasOpenRef.current) {
          wasOpenRef.current = true
          activeTooltipCount += 1
        }
        setOpen(true)
      }, INITIAL_DELAY_MS)
    }
  }

  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    if (wasOpenRef.current) {
      wasOpenRef.current = false
      activeTooltipCount = Math.max(0, activeTooltipCount - 1)
      lastTooltipClosedAt = Date.now()
    }
    setOpen(false)
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (wasOpenRef.current) {
        wasOpenRef.current = false
        activeTooltipCount = Math.max(0, activeTooltipCount - 1)
        lastTooltipClosedAt = Date.now()
      }
    }
  }, [])

  // After the tooltip renders, measure it and clamp within the viewport so it
  // never escapes the window edge. Runs on every open.
  useLayoutEffect(() => {
    if (!open || !tipRef.current) return
    const el = tipRef.current
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let dx = 0
    if (r.right > vw - 8) dx = vw - 8 - r.right
    if (r.left + dx < 8) dx = 8 - r.left
    setShift(dx)
    if (side === 'bottom' && r.bottom > vh - 8 && r.top - r.height > 8) setActualSide('top')
    else if (side === 'top' && r.top < 8 && r.bottom + r.height < vh - 8) setActualSide('bottom')
    else setActualSide(side)
  }, [open, side, text])

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
      {children}
      {open && text && (
        <div
          ref={tipRef}
          className={cn(
            'absolute left-1/2 px-2.5 py-1 rounded-md text-[11px] leading-snug pointer-events-none z-50 shadow-md',
            !instant && 'animate-fade-in',
            actualSide === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            width: 'max-content',
            maxWidth: 'min(260px, 80vw)',
            whiteSpace: 'normal',
            transform: `translateX(calc(-50% + ${shift}px))`,
          }}
        >
          {text}
        </div>
      )}
    </div>
  )
}
