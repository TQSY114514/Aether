import { useEffect, useRef } from 'react'

// Spring physics for rubber-band overscroll bounce
// F = -k·x - b·v  (Hooke's law + damping)
export function useOverscrollSpring(
  ref: React.RefObject<HTMLElement | null>,
  stiffness = 0.06,
  damping = 0.72
) {
  const state = useRef({
    offset: 0,
    velocity: 0,
    active: false,
    lastY: 0,
    rid: 0,
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const elSafe: HTMLElement = el

    const s = state.current

    function tick() {
      if (!s.active) return
      const f = -stiffness * s.offset - damping * s.velocity
      s.velocity += f
      s.offset += s.velocity
      if (Math.abs(s.offset) < 0.3 && Math.abs(s.velocity) < 0.3) {
        s.active = false
        s.offset = 0
        s.velocity = 0
        elSafe.style.transform = ''
        return
      }
      elSafe.style.transform = `translateY(${s.offset}px)`
      s.rid = requestAnimationFrame(tick)
    }

    function kick(v: number) {
      s.velocity += v
      if (!s.active) {
        s.active = true
        s.rid = requestAnimationFrame(tick)
      }
    }

    function onWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = elSafe
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault()
        kick(e.deltaY * 0.05)
      }
    }

    function onTouchStart(e: TouchEvent) {
      s.lastY = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      const dy = s.lastY - e.touches[0].clientY
      const { scrollTop, scrollHeight, clientHeight } = elSafe
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1
      if ((atTop && dy < 0) || (atBottom && dy > 0)) {
        kick(dy * 0.4)
      }
      s.lastY = e.touches[0].clientY
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      cancelAnimationFrame(s.rid)
    }
  }, [ref, stiffness, damping])
}
