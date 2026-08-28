import { useMemo, useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import ContextBar from '@/components/chat/ContextBar'
import EmptyState from '@/components/chat/EmptyState'
import Tooltip from '@/components/Tooltip'
import { Cpu, FlaskConical } from 'lucide-react'
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

export default function ChatPage() {
  const currentSessionId = useStore((s) => s.currentSessionId)
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

  const models = activeProviderId ? (modelsByProvider[activeProviderId] || []) : []
  const currentModel = models.find(m => m.id === activeModelId)
  const currentProvider = providers.find(p => p.id === activeProviderId)
  const currentPersona = personas.find(p => p.id === currentPersonaId)

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
      <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="min-h-12 py-1.5 border-b flex flex-wrap items-center justify-between px-4 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('chat.new')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chatMode === 'arena' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={localArenaIds[0] ?? ''} onChange={(e) => {
                  const ids = [Number(e.target.value) || 0, localArenaIds[1] ?? 0].filter(Boolean)
                  syncLocalArena(ids)
                }}
                  className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[200px]" style={{ borderColor: 'var(--border)' }}>
                  <option value="">{t('chat.arena.model1')}</option>
                  {allArenaModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
                  ))}
                </select>
                <select value={localArenaIds[1] ?? ''} onChange={(e) => {
                  const ids = [localArenaIds[0] ?? 0, Number(e.target.value) || 0].filter(Boolean)
                  syncLocalArena(ids)
                }}
                  className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[200px]" style={{ borderColor: 'var(--border)' }}>
                  <option value="">{t('chat.arena.model2')}</option>
                  {allArenaModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <Tooltip text={t('tooltip.mode_switch')}>
            <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setChatMode('normal')}
                className={`px-2.5 py-1.5 transition-colors ${chatMode === 'normal' ? 'bg-[var(--accent)] text-white' : ''}`}
                style={chatMode !== 'normal' ? { color: 'var(--text-secondary)' } : {}}>{t('chat.mode.normal')}</button>
              <Tooltip text={t('tooltip.arena_mode')}>
                <button onClick={() => setChatMode('arena')}
                  className={`px-2.5 py-1.5 transition-colors ${chatMode === 'arena' ? 'bg-[var(--accent)] text-white' : ''}`}
                  style={chatMode !== 'arena' ? { color: 'var(--text-secondary)' } : {}}>
                  <FlaskConical size={12} className="inline mr-0.5" />{t('chat.mode.arena')}</button>
              </Tooltip>
            </div>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1">
          <EmptyState />
        </div>
        <ChatInput />
      </div>
    )
  }

  // ── View 3: Active chat ──
  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--content-bg, var(--bg-primary))' }} {...arenaBgStyle}>
      <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-[var(--content-bg)]/95 backdrop-blur-sm" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          {currentModel && currentProvider && (
            <Tooltip text={t('tooltip.model_badge')}>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                <Cpu size={12} className="text-gray-400" />
                <span style={{ color: 'var(--text-secondary)' }}>{currentProvider.name}</span>
                <span style={{ color: 'var(--text-primary)' }}>{currentModel.model_name}</span>
              </div>
            </Tooltip>
          )}
          {trustBadge && currentSessionId && (
            <Tooltip text={`Trust: ${trustBadge.trust}/100 · ${TRUST_TIP[trustBadge.color] || trustBadge.label}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TRUST_DOT[trustBadge.color] || '#888' }} />
            </Tooltip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Arena model selectors — shown when in arena mode */}
          {chatMode === 'arena' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={localArenaIds[0] ?? ''} onChange={(e) => {
                const ids = [Number(e.target.value) || 0, localArenaIds[1] ?? 0].filter(Boolean)
                syncLocalArena(ids)
              }}
                className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[200px]" style={{ borderColor: 'var(--border)' }}>
                  <option value="">{t('chat.arena.model1')}</option>
                  {allArenaModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
                  ))}
                </select>
                <select value={localArenaIds[1] ?? ''} onChange={(e) => {
                  const ids = [localArenaIds[0] ?? 0, Number(e.target.value) || 0].filter(Boolean)
                  syncLocalArena(ids)
                }}
                  className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[200px]" style={{ borderColor: 'var(--border)' }}>
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
                className="text-xs px-2 py-1 rounded border outline-none bg-[var(--content-bg)] shrink-0 max-w-[140px]" style={{ borderColor: 'var(--border)' }}>
                <option value="">{t('chat.arena.single')}</option>
                <option value="0.2,0.8">{t('chat.arena.temp_pair')}</option>
                <option value="0.2,0.5,0.8">{t('chat.arena.temp_triple')}</option>
              </select>
            </div>
          ) : null}
          <Tooltip text={t('tooltip.mode_switch')}>
          <div className="flex items-center border rounded-lg overflow-hidden text-xs shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setChatMode('normal')}
              className={`px-2.5 py-1.5 transition-colors ${chatMode === 'normal' ? 'bg-[var(--accent)] text-white' : ''}`}
              style={chatMode !== 'normal' ? { color: 'var(--text-secondary)' } : {}}>{t('chat.mode.normal')}</button>
            <Tooltip text={t('tooltip.arena_mode')}>
              <button onClick={() => setChatMode('arena')}
                className={`px-2.5 py-1.5 transition-colors ${chatMode === 'arena' ? 'bg-[var(--accent)] text-white' : ''}`}
                style={chatMode !== 'arena' ? { color: 'var(--text-secondary)' } : {}}>
                <FlaskConical size={12} className="inline mr-0.5" />{t('chat.mode.arena')}</button>
            </Tooltip>
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
