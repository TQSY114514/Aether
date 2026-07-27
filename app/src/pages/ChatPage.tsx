import { useMemo } from 'react'
import { useStore } from '@/store'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import ContextBar from '@/components/chat/ContextBar'
import EmptyState from '@/components/chat/EmptyState'
import Tooltip from '@/components/Tooltip'
import { PanelLeft, Cpu, FlaskConical, Plus } from 'lucide-react'
import { t } from '@/utils/i18n'

export default function ChatPage() {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessions = useStore((s) => s.sessions)
  const personas = useStore((s) => s.personas)
  const providers = useStore((s) => s.providers)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const chatMode = useStore((s) => s.chatMode)
  const setChatMode = useStore((s) => s.setChatMode)
  const arenaModelIds = useStore((s) => s.arenaModelIds)
  const setArenaModelIds = useStore((s) => s.setArenaModelIds)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const saveSessionConfig = useStore((s) => s.saveSessionConfig)
  const allModels = useStore((s) => s.allModels)
  const agentMode = useStore((s) => s.agentMode)
  const setAgentMode = useStore((s) => s.setAgentMode)
  const effortLevel = useStore((s) => s.effortLevel)
  const createSession = useStore((s) => s.createSession)
  const newChat = () => useStore.getState().newChat()
  const welcomeDismissed = useStore((s) => s.welcomeDismissed)
  const defaultModelId = useStore((s) => s.defaultModelId)
  const defaultPersonaId = useStore((s) => s.defaultPersonaId)
  const setDefaultModel = useStore((s) => s.setDefaultModel)
  const setDefaultPersona = useStore((s) => s.setDefaultPersona)

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

  const hasSessions = sessions.length > 0

  // ── View 1: Welcome page (no sessions at all) ──
  if (!hasSessions && !currentSessionId && !welcomeDismissed) {
    return (
      <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 10px 30px -10px var(--accent)' }}>
              <Cpu size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('empty.welcome')}</h2>
            <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{t('empty.subtitle')}</p>
            <button onClick={newChat}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm rounded-xl hover:opacity-90 transition-all shadow-lg"
              style={{ backgroundColor: 'var(--accent)', boxShadow: '0 4px 12px -2px var(--accent)' }}>
              <Plus size={16} />{t('chat.create')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── View 2: Blank new chat (sessions exist, none selected) ──
  if (!currentSessionId) {
    const activeProviderId = providers.length > 0 ? (providers.find(p => p.enabled) ?? providers[0]).id : null
    const activeProvider = providers.find(p => p.id === activeProviderId)
    const activeModels = activeProviderId ? (modelsByProvider[activeProviderId] || []) : []
    const activeModel = allModels.find(m => m.id === defaultModelId) || activeModels.find(m => m.is_primary) || activeModels[0]
    const activePersonaId = defaultPersonaId

    return (
      <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="h-12 border-b flex items-center justify-between px-4 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-[var(--border)] transition-colors">
                <PanelLeft size={16} className="text-gray-400" />
              </button>
            )}
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('chat.new')}</span>
          </div>
          <div className="flex items-center gap-2">
            {chatMode === 'arena' ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('chat.arena.select_models', '选择模型')}</span>
                <select value={arenaModelIds.slice(0, 2).join('-')} onChange={(e) => {
                  const ids = e.target.value.split('-').map(Number).filter(Boolean)
                  if (ids.length >= 2) setArenaModelIds(ids.slice(0, 2))
                }}
                  className="text-[10px] px-1 py-0.5 rounded border outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
                  <option value="">...</option>
                  {allArenaModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                {activeModel && activeProvider && (
                  <Tooltip text={t('tooltip.model_badge')}>
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                      <Cpu size={12} className="text-gray-400" />
                      <span style={{ color: 'var(--text-secondary)' }}>{activeProvider.name}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{activeModel.model_name}</span>
                    </div>
                  </Tooltip>
                )}
                <select value={String(activeModel?.id ?? '')}
                  onChange={(e) => {
                    const mid = Number(e.target.value)
                    setDefaultModel(mid)
                  }}
                  className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-white max-w-[200px]" style={{ borderColor: 'var(--border)' }}>
                  <option value="" disabled>{t('chat.select_model')}</option>
                  {allModelOptions.map(g => (
                    <optgroup key={g.providerId} label={g.providerName}>
                      {g.models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
            <Tooltip text={t('tooltip.mode_switch')}>
            <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setChatMode('normal')}
                className={`px-2.5 py-1.5 transition-colors ${chatMode === 'normal' ? 'bg-black text-white' : ''}`}
                style={chatMode !== 'normal' ? { color: 'var(--text-secondary)' } : {}}>{t('chat.mode.normal')}</button>
              <Tooltip text={t('tooltip.arena_mode')}>
                <button onClick={() => setChatMode('arena')}
                  className={`px-2.5 py-1.5 transition-colors ${chatMode === 'arena' ? 'bg-black text-white' : ''}`}
                  style={chatMode !== 'arena' ? { color: 'var(--text-secondary)' } : {}}>
                  <FlaskConical size={12} className="inline mr-0.5" />{t('chat.mode.arena')}</button>
              </Tooltip>
            </div>
            </Tooltip>
            <Tooltip text={t('tooltip.persona')}>
              <select value={activePersonaId ?? ''} onChange={(e) => useStore.getState().setDefaultPersona(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
                <option value="">{t('chat.no_persona')}</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--content-bg, var(--bg-primary))' }}>
      <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-white/95 backdrop-blur-sm" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          {!sidebarOpen && (
            <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] transition-colors">
              <PanelLeft size={16} className="text-gray-400" />
            </button>
          )}
          {currentModel && currentProvider && (
            <Tooltip text={t('tooltip.model_badge')}>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                <Cpu size={12} className="text-gray-400" />
                <span style={{ color: 'var(--text-secondary)' }}>{currentProvider.name}</span>
                <span style={{ color: 'var(--text-primary)' }}>{currentModel.model_name}</span>
              </div>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip text={t('tooltip.mode_switch')}>
          <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setChatMode('normal')}
              className={`px-2.5 py-1.5 transition-colors ${chatMode === 'normal' ? 'bg-black text-white' : ''}`}
              style={chatMode !== 'normal' ? { color: 'var(--text-secondary)' } : {}}>{t('chat.mode.normal')}</button>
            <Tooltip text={t('tooltip.arena_mode')}>
              <button onClick={() => setChatMode('arena')}
                className={`px-2.5 py-1.5 transition-colors ${chatMode === 'arena' ? 'bg-black text-white' : ''}`}
                style={chatMode !== 'arena' ? { color: 'var(--text-secondary)' } : {}}>
                <FlaskConical size={12} className="inline mr-0.5" />{t('chat.mode.arena')}</button>
            </Tooltip>
          </div>
          </Tooltip>
          <Tooltip text={t('tooltip.persona')}>
            <select value={currentPersonaId ?? ''} onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null
              if (currentSessionId) saveSessionConfig(currentSessionId, { personaId: v })
            }} className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
              <option value="">{t('chat.no_persona')}</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Tooltip>
        </div>
      </div>

      {/* Arena model selector — shown as inline badges in the message area */}

      <ContextBar />
      <ChatWindow />
      <ChatInput />
    </div>
  )
}
