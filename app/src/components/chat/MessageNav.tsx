import { useMemo, useState, useRef, useEffect, type RefObject } from 'react'
import type { Message } from '@/types'

/**
 * 消息导航点条 — 借鉴 Trae IDE 左侧的导航轴。
 *
 * 功能:
 *   - 点击点 → 跳转到对应 user 消息
 *   - hover 点 → 显示消息内容预览（跟随鼠标 Y 位置，显示在点条右侧）
 *   - 在点条上滚轮 → 滑动点条自己的可见窗口（不转发到消息列表）
 *   - 点数量超过 maxVisible 时只显示一个窗口，滚轮可上下翻
 *   - 新消息到来时自动跟随到最新窗口
 *   - activeId 高亮当前消息
 */
const MAX_VISIBLE = 10 // 同时展示的最大刻度数
const DOT_GAP = 14     // 刻度间距（中心到中心）

export default function MessageNav({
  messages, activeId, scrollTo,
}: {
  messages: Message[]
  activeId: number | null
  scrollTo: (id: number) => void
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const [hoverState, setHoverState] = useState<{ id: number; idx: number } | null>(null)
  const [scrollOffset, setScrollOffset] = useState(0)
  const navRef = useRef<HTMLDivElement>(null)

  const hoverMsg = useMemo(
    () => (hoverState ? messages.find((m) => m.id === hoverState.id) : null),
    [messages, hoverState]
  )
  const userMsgs = useMemo(() => messages.filter((m) => m.role === 'user'), [messages])
  const count = userMsgs.length

  // 非 passive wheel listener — 滑动刻度条窗口。必须在条件 return 之前调用
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScrollOffset((prev) => {
        const max = Math.max(0, count - MAX_VISIBLE)
        const step = 1
        const next = e.deltaY > 0 ? prev + step : prev - step
        return Math.max(0, Math.min(max, next))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [count])

  // 新消息到来时自动跟随到最新窗口
  useEffect(() => {
    const max = Math.max(0, count - MAX_VISIBLE)
    setScrollOffset(max)
  }, [count])

  if (count < 3) return null

  const maxOffset = Math.max(0, count - MAX_VISIBLE)
  const clampedOffset = Math.min(scrollOffset, maxOffset)

  const visibleCount = Math.min(count, MAX_VISIBLE)
  const visibleMsgs = userMsgs.slice(clampedOffset, clampedOffset + visibleCount)
  const hasMoreAbove = clampedOffset > 0
  const hasMoreBelow = clampedOffset < maxOffset

  const windowHeight = (visibleCount - 1) * DOT_GAP
  const getTickTop = (idx: number) => `calc(50% - ${windowHeight / 2}px + ${idx * DOT_GAP}px)`

  return (
    <div
      ref={navRef}
      className="absolute left-1.5 top-10 bottom-10 z-30 select-none"
      style={{ width: '20px' }}
    >
      {/* 顶部微指示: 上方还有更多历史消息 */}
      {hasMoreAbove && (
        <div
          className="absolute left-1.5 pointer-events-none rounded-full"
          style={{
            top: `calc(50% - ${windowHeight / 2}px - 12px)`,
            width: '3px',
            height: '3px',
            backgroundColor: 'var(--text-muted)',
            opacity: 0.45,
          }}
        />
      )}

      {/* 可见刻度 — 水平微刻度线，大热区易点击，悬停锚定不抖动 */}
      {visibleMsgs.map((msg, idx) => {
        const isActive = activeId === msg.id
        const isHovered = hoverState?.id === msg.id
        const turnNum = clampedOffset + idx + 1
        return (
          <button
            key={msg.id}
            type="button"
            onClick={() => scrollTo(msg.id)}
            onMouseEnter={() => setHoverState({ id: msg.id, idx })}
            onMouseLeave={() => setHoverState((prev) => (prev?.id === msg.id ? null : prev))}
            className="absolute left-0 w-5 h-3.5 -translate-y-1/2 flex items-center justify-start pl-1 cursor-pointer focus-visible:outline-none group"
            style={{ top: getTickTop(idx) }}
            aria-label={`跳转至第 ${turnNum} 条提问`}
          >
            <span
              className="rounded-full transition-all duration-150"
              style={{
                width: isActive || isHovered ? '13px' : '7px',
                height: isActive || isHovered ? '2.5px' : '2px',
                backgroundColor: isActive || isHovered ? 'var(--accent)' : 'var(--text-muted)',
                opacity: isActive ? 1 : isHovered ? 0.9 : 0.4,
              }}
            />
          </button>
        )
      })}

      {/* 底部微指示: 下方还有更多消息 */}
      {hasMoreBelow && (
        <div
          className="absolute left-1.5 pointer-events-none rounded-full"
          style={{
            top: `calc(50% + ${windowHeight / 2}px + 10px)`,
            width: '3px',
            height: '3px',
            backgroundColor: 'var(--text-muted)',
            opacity: 0.45,
          }}
        />
      )}

      {/* 悬停预览卡片 — 精准锚定在当前刻度的 Y 轴中心，不随鼠标微动抖动 */}
      {hoverMsg && hoverState && (
        <div
          className="absolute z-50 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg px-2.5 py-2 text-xs pointer-events-none transition-all duration-100"
          style={{
            top: getTickTop(hoverState.idx),
            left: '100%',
            marginLeft: '4px',
            transform: 'translateY(-50%)',
            maxWidth: '240px',
            width: 'max-content',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          <div className="flex items-center gap-1.5 mb-0.5 text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
            <span>#{clampedOffset + hoverState.idx + 1}</span>
          </div>
          <span className="block leading-relaxed text-[11.5px]" style={{ color: 'var(--text-primary)' }}>
            {hoverMsg.content.slice(0, 120)}{hoverMsg.content.length > 120 ? '…' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
