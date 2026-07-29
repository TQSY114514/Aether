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
const MAX_VISIBLE = 8 // 同时展示的最大点数
const DOT_SIZE = 7    // 固定点大小
const DOT_GAP = 12    // 固定点间距（中心到中心）

export default function MessageNav({
  messages, activeId, scrollTo, scrollRef,
}: {
  messages: Message[]
  activeId: number | null
  scrollTo: (id: number) => void
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [mouseY, setMouseY] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const navRef = useRef<HTMLDivElement>(null)

  const hoverMsg = useMemo(() => hoverId ? messages.find(m => m.id === hoverId) : null, [messages, hoverId])
  const userMsgs = useMemo(() => messages.filter(m => m.role === 'user'), [messages])
  const count = userMsgs.length

  // 非 passive wheel listener — 滑动点条窗口。必须在条件 return 之前调用,
  // 否则违反 hooks 规则 (React error #310)。
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScrollOffset(prev => {
        const max = Math.max(0, count - MAX_VISIBLE)
        // 每次滚动 1 个点
        const step = 1
        const next = e.deltaY > 0 ? prev + step : prev - step
        return Math.max(0, Math.min(max, next))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [count])

  // 新消息到来时自动跟随到最新窗口（像聊天软件自动滚到底部）。
  useEffect(() => {
    const max = Math.max(0, count - MAX_VISIBLE)
    setScrollOffset(max)
  }, [count])

  if (count < 3) return null

  const maxOffset = Math.max(0, count - MAX_VISIBLE)
  const clampedOffset = Math.min(scrollOffset, maxOffset)

  // 可见窗口
  const visibleCount = Math.min(count, MAX_VISIBLE)
  const visibleMsgs = userMsgs.slice(clampedOffset, clampedOffset + visibleCount)
  const hasMoreAbove = clampedOffset > 0
  const hasMoreBelow = clampedOffset < maxOffset

  // 可见窗口的总高度（用于垂直居中）
  const windowHeight = visibleCount * DOT_GAP

  // hover 时记录鼠标 Y (相对于点条容器),用于定位预览气泡
  const handleMouseMove = (e: React.MouseEvent) => {
    const navRect = navRef.current?.getBoundingClientRect()
    setMouseY(navRect ? e.clientY - navRect.top : e.clientY)
  }

  return (
    <>
      {/* 导航点条 — 固定在左侧,滚轮滑动自身窗口。作为 tooltip 的定位容器 */}
      <div
        ref={navRef}
        onMouseMove={handleMouseMove}
        className="absolute left-1 top-10 bottom-10 z-30"
        style={{ width: '16px', cursor: 'pointer' }}
      >
        {/* 轨道线 */}
        <div
          className="absolute left-1/2 top-2 bottom-2 -translate-x-1/2"
          style={{ width: '1px', backgroundColor: 'var(--border)', opacity: 0.5 }}
        />
        {/* 顶部渐变指示:上面还有更多点 */}
        {hasMoreAbove && (
          <div
            className="absolute left-1/2 top-1 -translate-x-1/2 pointer-events-none"
            style={{
              width: '0', height: '0',
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '5px solid var(--text-muted)',
              opacity: 0.5,
            }}
          />
        )}
        {/* 可见点 — 在容器垂直居中区域排列，固定大小和间距 */}
        {visibleMsgs.map((msg, idx) => {
          const isActive = activeId === msg.id
          // 点从窗口顶部开始向下排列，整个窗口在容器中垂直居中
          const y = `calc(50% - ${windowHeight / 2}px + ${idx * DOT_GAP}px)`
          return (
            <button
              key={msg.id}
              onClick={() => scrollTo(msg.id)}
              onMouseEnter={() => setHoverId(msg.id)}
              onMouseLeave={() => setHoverId(null)}
              className="absolute left-1/2 rounded-full transition-all duration-150 hover:scale-150"
              style={{
                top: y,
                transform: 'translate(-50%, -50%)',
                width: `${DOT_SIZE}px`,
                height: `${DOT_SIZE}px`,
                backgroundColor: isActive ? 'var(--accent)' : 'var(--text-muted)',
                opacity: isActive ? 1 : 0.6,
                boxShadow: isActive ? `0 0 6px var(--accent)` : 'none',
              }}
            />
          )
        })}
        {/* 底部渐变指示:下面还有更多点 */}
        {hasMoreBelow && (
          <div
            className="absolute left-1/2 bottom-1 -translate-x-1/2 pointer-events-none"
            style={{
              width: '0', height: '0',
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderBottom: '5px solid var(--text-muted)',
              opacity: 0.5,
            }}
          />
        )}
        {/* hover 预览气泡 — 相对点条定位,显示在右侧,宽度随内容自适应 */}
        {hoverMsg && (
          <div
            className="absolute z-50 bg-[var(--content-bg)] border border-[var(--border)] rounded-xl shadow-elevated p-2.5 text-xs pointer-events-none transition-opacity duration-100"
            style={{
              top: mouseY,
              left: '100%',
              marginLeft: '8px',
              transform: 'translateY(-50%)',
              maxWidth: '220px',
              width: 'max-content',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
            }}
          >
            <span className="block leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {hoverMsg.content.slice(0, 120)}{hoverMsg.content.length > 120 ? '…' : ''}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
