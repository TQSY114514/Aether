import { useMemo, useState } from 'react'
import type { Message } from '@/types'

export default function MessageNav({
  messages, activeId, scrollTo,
}: {
  messages: Message[]
  activeId: number | null
  scrollTo: (id: number) => void
}) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const hoverMsg = useMemo(() => hoverId ? messages.find(m => m.id === hoverId) : null, [messages, hoverId])
  const userMsgs = useMemo(() => messages.filter(m => m.role === 'user'), [messages])
  if (userMsgs.length < 3) return null

  return (
    <>
      {hoverMsg && (
        <div className="fixed z-50 bg-white border border-[var(--border)] rounded-xl shadow-elevated p-2.5 text-xs max-w-[220px] pointer-events-none" style={{
          top: '50%', right: '38px', transform: 'translateY(-50%)'
        }}>
          <span className="text-[10px] font-medium block mb-0.5" style={{ color: hoverMsg.role === 'user' ? 'var(--accent)' : 'var(--text-muted)' }}>
            {hoverMsg.role === 'user' ? '你' : 'AI'}
          </span>
          <span className="block leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {hoverMsg.content.slice(0, 80)}{hoverMsg.content.length > 80 ? '...' : ''}
          </span>
        </div>
      )}
      <div className="absolute right-0 top-12 bottom-12 w-4 z-10 pointer-events-none">
        {userMsgs.map((msg, idx) => (
          <button
            key={msg.id}
            onClick={() => scrollTo(msg.id)}
            onMouseEnter={() => setHoverId(msg.id)}
            onMouseLeave={() => setHoverId(null)}
            className="absolute right-1 pointer-events-auto rounded-full transition-all duration-150"
            style={{
              top: `${((idx * 100) / (userMsgs.length + 1)) + 8}%`,
              transform: 'translateY(-50%)',
              width: activeId === msg.id ? '6px' : '4px',
              height: activeId === msg.id ? '6px' : '4px',
              backgroundColor: activeId === msg.id ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: activeId === msg.id ? '0 0 4px rgba(37,99,235,0.3)' : 'none',
            }}
          />
        ))}
      </div>
    </>
  )
}
