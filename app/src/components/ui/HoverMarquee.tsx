import React, { useRef, useState, useCallback, useEffect } from 'react'

export interface HoverMarqueeProps {
  text: string
  className?: string
  style?: React.CSSProperties
  /** Base speed in px/s before overflow acceleration (default: 24) */
  baseSpeedPxPerSec?: number
  /** Extra speed per px of overflow so very long titles scroll slightly faster (default: 0.035) */
  accelPerOverflowPx?: number
}

/**
 * Smart overflow-aware text marquee on hover.
 * - When not hovered (or when text fits inside its container), renders a clean
 *   single-line truncated string (`text-overflow: ellipsis`).
 * - On mouse enter, measures exact pixel overflow (`scrollWidth - clientWidth`).
 * - If overflowing, scrolls smoothly to reveal the full text with speed
 *   gently scaled by the overflow distance and capped at a calm reading pace.
 */
export default function HoverMarquee({
  text,
  className = '',
  style,
  baseSpeedPxPerSec = 24,
  accelPerOverflowPx = 0.035,
}: HoverMarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [overflowPx, setOverflowPx] = useState(0)
  const [hovered, setHovered] = useState(false)

  const measureOverflow = useCallback(() => {
    const container = containerRef.current
    const inner = innerRef.current
    if (!container || !inner) return 0
    const diff = Math.ceil(inner.scrollWidth - container.clientWidth)
    return diff > 2 ? diff : 0
  }, [])

  useEffect(() => {
    setOverflowPx(0)
    setHovered(false)
  }, [text])

  const rafRef = useRef<number>(0)

  const handleMouseEnter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const diff = measureOverflow()
      setOverflowPx(diff)
      if (diff > 0) {
        setHovered(true)
      }
    })
  }, [measureOverflow])

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    setHovered(false)
  }, [])

  // Calm, human-readable dynamic speed formula:
  // Short overflow (e.g. 40px)  -> ~25 px/s (min 1.8s)
  // Medium overflow (e.g. 160px) -> ~30 px/s (~5.3s)
  // Long overflow (e.g. 450px)  -> ~40 px/s (capped at 42 px/s so sidebar titles never blur)
  const effectiveSpeed = Math.min(42, baseSpeedPxPerSec + overflowPx * accelPerOverflowPx)
  const durationSec = overflowPx > 0
    ? Math.max(1.8, Math.min(14.0, overflowPx / Math.max(18, effectiveSpeed)))
    : 0.25

  const isScrolling = hovered && overflowPx > 0

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`block overflow-hidden whitespace-nowrap min-w-0 ${className}`}
      style={style}
    >
      <span
        ref={innerRef}
        className={`motion-reduce:transform-none motion-reduce:transition-none ${
          isScrolling ? 'inline-block align-bottom' : 'block w-full truncate'
        }`}
        style={{
          transform: isScrolling ? `translateX(-${overflowPx}px)` : 'translateX(0)',
          transition: isScrolling
            ? `transform ${durationSec.toFixed(2)}s cubic-bezier(0.25, 0.1, 0.25, 1) 0.18s`
            : 'transform 0.22s ease-out',
          willChange: isScrolling ? 'transform' : 'auto',
        }}
      >
        {text}
      </span>
    </div>
  )
}
