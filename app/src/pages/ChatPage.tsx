import { useMemo, useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import ContextBar from '@/components/chat/ContextBar'
import EmptyState from '@/components/chat/EmptyState'
import ChatBackgroundPattern from '@/components/chat/ChatBackgroundPattern'
import Tooltip from '@/components/Tooltip'
import { FlaskConical } from 'lucide-react'
import { t } from '@/utils/i18n'

// Trust badge dot color → tailwind class
const TRUST_DOT: Record<string, string> = {
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
}
const TRUST_TIP: Record<string, string> = {
  green: 'trusted',
  yellow: 'neutral',
  red: 'cautious',
}

/** Compose the sidebar, conversation, and auxiliary chat panels. */
export default function ChatPage() {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const theme = useStore((s) => s.theme)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const hasBg = !!backgroundImage
  const personas = useStore((s) => s.personas)
  const providers = useStore((s) => s.providers)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const chatMode = useStore((s) => s.chatMode)
  const setChatMode = useStore((s) => s.setChatMode)
  const arenaModelIds = useStore((s) => s.arenaModelIds)
  const setArenaModelIds = useStore((s) => s.setArenaModelIds)
  const arenaTemperatures = useStore((s) => s.arenaTemperatures)
  const setArenaTemperatures = useStore((s) => s.setArenaTemperatures)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const saveSessionConfig = useStore((s) => s.saveSessionConfig)
  const allModels = useStore((s) => s.allModels)
  const defaultPersonaId = useStore((s) => s.defaultPersonaId)
  const newChat = () => useStore.getState().newChat()

  // Trust badge
  const [trustBadge, setTrustBadge] = useState<{ trust: number; color: string; label: string } | null>(null)
  useEffect(() => {
    if (!currentSessionId) { setTrustBadge(null); return }
    window.electronAPI.trust.badge({ sessionId: currentSessionId }).then((badge: any) => {
      if (badge) setTrustBadge(badge)
    }).catch(() => {})
  }, [currentSessionId])

  // Arena model selections — local state synced to store for persistence.
  const [localArenaIds, setLocalArenaIds] = useState<number[]>([])
  useEffect(() => {
    if (arenaModelIds.length >= 2) setLocalArenaIds(arenaModelIds.slice(0, 2))
  }, [arenaModelIds])
  const syncLocalArena = useCallback((ids: number[]) => {
    setLocalArenaIds(ids.slice(0, 2))
    if (ids.length >= 2) setArenaModelIds(ids.slice(0, 2))
  }, [setArenaModelIds])

  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const activeProviderId = cfg?.providerId ?? null
  const activeModelId = cfg?.modelId ?? null
  const currentPersonaId = cfg?.personaId ?? null

  const allModelOptions = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    if (ms.length === 0) return null
    return { providerId: p.id, providerName: p.name, models: ms.map(m => ({ id: m.id, name: m.display_name || m.model_name })) }
  }).filter(Boolean) as { providerId: number; providerName: string; models: { id: number; name: string }[] }[], [providers, allModels])

  const allArenaModels = useMemo(() => allModelOptions?.flatMap(g => g.models.map(m => ({ ...m, providerName: g.providerName }))) || [], [allModelOptions])

  // ELO scores for arena selector display
  const scores = useStore((s) => s.scores)
  const loadScores = useStore((s) => s.loadScores)
  useEffect(() => { if (scores.length === 0) loadScores() }, [])
  const scoreByModel = useMemo(() => {
    const map: Record<number, number> = {}
    for (const sc of scores) { map[sc.model_id] = Math.round(sc.score) }
    return map
  }, [scores])

  // Arena bg: semi-transparent so arena mode visually differs from normal chat.
  // When no background image is set, --content-bg resolves to solid white.
  const arenaBgStyle = chatMode === 'arena'
    ? { backgroundColor: 'rgba(255,255,255,0.82)' }
    : {}

  // ── Blank new chat — empty state with model selector in header ──
  // Only arena selectors in header — model/persona selection happens in
  // ChatInput's bottom bar (ModelSelector). Arena must stay here because
  // it writes to store before a session exists.
  if (!currentSessionId) {
    return (
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-transparent">
        {!hasBg && <ChatBackgroundPattern theme={theme} />}
        <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-[var(--content-bg)]/95 backdrop-blur-sm app-drag wco-pr relative z-[2]" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('chat.new')}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Arena model selectors with smooth expand/collapse entrance & exit transition */}
            <div
              className={`flex items-center gap-1.5 flex-nowrap whitespace-nowrap shrink-0 overflow-hidden transition-[max-width,opacity] duration-200 ease-out ${
                chatMode === 'arena'
                  ? 'max-w-[480px] opacity-100 mr-1'
                  : 'max-w-0 opacity-0 pointer-events-none mr-0'
              }`}
            >
              <select value={localArenaIds[0] ?? ''} onChange={(e) => {
                const ids = [Number(e.target.value) || 0, localArenaIds[1] ?? 0].filter(Boolean)
                syncLocalArena(ids)
              }}
                className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[160px] transition-all" style={{ borderColor: 'var(--border)' }}>
                <option value="">{t('chat.arena.model1')}</option>
                {allArenaModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
                ))}
              </select>
              <select value={localArenaIds[1] ?? ''} onChange={(e) => {
                const ids = [localArenaIds[0] ?? 0, Number(e.target.value) || 0].filter(Boolean)
                syncLocalArena(ids)
              }}
                className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[160px] transition-all" style={{ borderColor: 'var(--border)' }}>
                <option value="">{t('chat.arena.model2')}</option>
                {allArenaModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
                ))}
              </select>
            </div>
            <Tooltip text={t('tooltip.mode_switch')}>
              <div className="relative inline-grid grid-cols-2 p-0.5 rounded-lg border text-xs bg-[var(--bg-secondary)] shrink-0 w-[148px] select-none" style={{ borderColor: 'var(--border)' }}>
                <div
                  className="absolute inset-y-0.5 rounded-md bg-[var(--accent)] shadow-xs transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
                  style={{
                    left: '2px',
                    width: 'calc(50% - 2px)',
                    transform: chatMode === 'normal' ? 'translateX(0)' : 'translateX(calc(100%))',
                  }}
                />
                <button
                  onClick={() => setChatMode('normal')}
                  className={`relative z-[1] py-1 text-center transition-colors duration-200 font-medium truncate ${chatMode === 'normal' ? 'text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  {t('chat.mode.normal')}
                </button>
                <button
                  onClick={() => setChatMode('arena')}
                  title={t('tooltip.arena_mode')}
                  className={`relative z-[1] py-1 flex items-center justify-center gap-1 transition-colors duration-200 font-medium truncate ${chatMode === 'arena' ? 'text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  <FlaskConical size={12} className="shrink-0" />
                  <span>{t('chat.mode.arena')}</span>
                </button>
              </div>
            </Tooltip>
          </div>
        </div>
        {/* 空态容器: 确保充足的顶部呼吸空间，彻底消除方块图标被标题栏边缘截断问题 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-bounce px-4 pt-6 pb-4 relative z-[1]">
          <div className="my-auto w-full max-w-3xl mx-auto flex flex-col items-center">
            <EmptyState noSession={true} />
          </div>
        </div>
        <div className="relative z-[2]">
          <ChatInput />
        </div>
      </div>
    )
  }

  // ── View 3: Active chat ──
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent relative overflow-hidden" {...arenaBgStyle}>
      {!hasBg && <ChatBackgroundPattern theme={theme} />}
      <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-[var(--content-bg)]/95 backdrop-blur-sm app-drag wco-pr relative z-[2]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          {trustBadge && currentSessionId && (
            <Tooltip text={`Trust: ${trustBadge.trust}/100 · ${TRUST_TIP[trustBadge.color] || trustBadge.label}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TRUST_DOT[trustBadge.color] || '#888' }} />
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Arena model selectors with smooth expand/collapse entrance & exit transition */}
          <div
            className={`flex items-center gap-1.5 flex-nowrap whitespace-nowrap shrink-0 overflow-hidden transition-[max-width,opacity] duration-200 ease-out ${
              chatMode === 'arena'
                ? 'max-w-[480px] opacity-100 mr-1'
                : 'max-w-0 opacity-0 pointer-events-none mr-0'
            }`}
          >
            <select value={localArenaIds[0] ?? ''} onChange={(e) => {
              const ids = [Number(e.target.value) || 0, localArenaIds[1] ?? 0].filter(Boolean)
              syncLocalArena(ids)
            }}
              className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[160px] transition-all" style={{ borderColor: 'var(--border)' }}>
                <option value="">{t('chat.arena.model1')}</option>
                {allArenaModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
                ))}
            </select>
            <select value={localArenaIds[1] ?? ''} onChange={(e) => {
              const ids = [localArenaIds[0] ?? 0, Number(e.target.value) || 0].filter(Boolean)
              syncLocalArena(ids)
            }}
              className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[160px] transition-all" style={{ borderColor: 'var(--border)' }}>
              <option value="">{t('chat.arena.model2')}</option>
              {allArenaModels.map(m => (
                <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
              ))}
            </select>
            {/* Arena 2.0: same-model multi-temperature comparison */}
            <select value={arenaTemperatures ? arenaTemperatures.join(',') : ''} onChange={(e) => {
              const v = e.target.value
              setArenaTemperatures(v ? v.split(',').map(Number) : null)
            }}
              title={t('chat.arena.temp_title')}
              className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[120px] transition-all" style={{ borderColor: 'var(--border)' }}>
              <option value="">{t('chat.arena.single')}</option>
              <option value="0.2,0.8">{t('chat.arena.temp_pair')}</option>
              <option value="0.2,0.5,0.8">{t('chat.arena.temp_triple')}</option>
            </select>
          </div>
          <Tooltip text={t('tooltip.mode_switch')}>
            <div className="relative inline-grid grid-cols-2 p-0.5 rounded-lg border text-xs bg-[var(--bg-secondary)] shrink-0 w-[148px] select-none" style={{ borderColor: 'var(--border)' }}>
              <div
                className="absolute inset-y-0.5 rounded-md bg-[var(--accent)] shadow-xs transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
                style={{
                  left: '2px',
                  width: 'calc(50% - 2px)',
                  transform: chatMode === 'normal' ? 'translateX(0)' : 'translateX(calc(100%))',
                }}
              />
              <button
                onClick={() => setChatMode('normal')}
                className={`relative z-[1] py-1 text-center transition-colors duration-200 font-medium truncate ${chatMode === 'normal' ? 'text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                {t('chat.mode.normal')}
              </button>
              <button
                onClick={() => setChatMode('arena')}
                title={t('tooltip.arena_mode')}
                className={`relative z-[1] py-1 flex items-center justify-center gap-1 transition-colors duration-200 font-medium truncate ${chatMode === 'arena' ? 'text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                <FlaskConical size={12} className="shrink-0" />
                <span>{t('chat.mode.arena')}</span>
              </button>
            </div>
          </Tooltip>
          <Tooltip text={t('tooltip.persona')}>
            <select value={currentPersonaId ?? ''} onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null
              if (currentSessionId) saveSessionConfig(currentSessionId, { personaId: v })
            }} className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-[var(--content-bg)] shrink-0 max-w-[180px]" style={{ borderColor: 'var(--border)' }}>
              <option value="">{t('chat.no_persona')}</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Tooltip>
        </div>
      </div>

      <ContextBar />
      <ChatWindow />
      <ChatInput />
    </div>
  )
}
