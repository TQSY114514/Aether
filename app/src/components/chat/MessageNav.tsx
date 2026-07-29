import { useMemo, useState, useRef, useEffect, type RefObject } from 'react'
import type { Message } from '@/types'

/**
 * 消息导航点条 — 借鉴 Trae IDE 左侧的导航轴。
 *
 * 功能:
 *   - 点击点 → 跳转到对应 user 消息
 *   - hover 点 → 显示消息内容预览（跟随鼠标 Y 位置）
 *   - 在点条上滚轮 → 滚动消息列表（转发 wheel 到 scrollContainer）
 *   - 消息多时点自动变小，百分比分布不溢出
 *   - activeId 高亮当前消息
 */
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
  const navRef = useRef<HTMLDivElement>(null)

  const hoverMsg = useMemo(() => hoverId ? messages.find(m => m.id === hoverId) : null, [messages, hoverId])
  const userMsgs = useMemo(() => messages.filter(m => m.role === 'user'), [messages])

  // 非 passive wheel listener — 让 preventDefault 生效,把滚轮转发到消息列表
  // 注意:必须在条件 return 之前调用,否则违反 hooks 规则 (React error #310)
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!scrollRef?.current) return
      e.preventDefault()
      // 放大滚动速度,让点条上小幅滚动也能快速浏览
      scrollRef.current.scrollTop += e.deltaY * 1.5
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scrollRef])

  if (userMsgs.length < 3) return null

  // 动态点大小:消息越多点越小 (4px ~ 8px)
  const count = userMsgs.length
  const dotSize = count > 30 ? 4 : count > 15 ? 5 : count > 8 ? 6 : 8

  // hover 时记录鼠标 Y (相对于视口),用于定位预览气泡
  const handleMouseMove = (e: React.MouseEvent) => {
    setMouseY(e.clientY)
  }

  return (
    <>
      {/* hover 预览气泡 — 跟随鼠标 Y 位置 */}
      {hoverMsg && (
        <div
          className="fixed z-50 bg-[var(--content-bg)] border border-[var(--border)] rounded-xl shadow-elevated p-2.5 text-xs max-w-[240px] pointer-events-none transition-opacity duration-100"
          style={{
            top: mouseY,
            right: '36px',
            transform: 'translateY(-50%)',
          }}
        >
          <span className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--accent)' }}>
            你 · #{userMsgs.findIndex(m => m.id === hoverMsg.id) + 1}
          </span>
          <span className="block leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {hoverMsg.content.slice(0, 120)}{hoverMsg.content.length > 120 ? '…' : ''}
          </span>
        </div>
      )}

      {/* 导航点条 — 固定在右侧,滚轮转发到消息列表 */}
      <div
        ref={navRef}
        onMouseMove={handleMouseMove}
        className="absolute right-1 top-10 bottom-10 z-30"
        style={{ width: '16px', cursor: 'pointer' }}
      >
        {/* 轨道线 */}
        <div
          className="absolute left-1/2 top-2 bottom-2 -translate-x-1/2"
          style={{ width: '1px', backgroundColor: 'var(--border)', opacity: 0.5 }}
        />
        {/* 点 — 百分比分布,不溢出 */}
        {userMsgs.map((msg, idx) => {
          const isActive = activeId === msg.id
          return (
            <button
              key={msg.id}
              onClick={() => scrollTo(msg.id)}
              onMouseEnter={() => setHoverId(msg.id)}
              onMouseLeave={() => setHoverId(null)}
              className="absolute left-1/2 rounded-full transition-all duration-150 hover:scale-200"
              style={{
                top: `${((idx + 1) / (count + 1)) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: `${dotSize}px`,
                height: `${dotSize}px`,
                backgroundColor: isActive ? 'var(--accent)' : 'var(--text-muted)',
                opacity: isActive ? 1 : 0.6,
                boxShadow: isActive ? `0 0 6px var(--accent)` : 'none',
              }}
              title={`消息 ${idx + 1}`}
            />
          )
        })}
      </div>
    </>
  )
}
