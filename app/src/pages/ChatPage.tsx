import { useMemo } from 'react'
import { useStore } from '@/store'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import ContextBar from '@/components/chat/ContextBar'
import EmptyState from '@/components/chat/EmptyState'
import Tooltip from '@/components/Tooltip'
import { MessageSquare, PanelLeft, Cpu, FlaskConical } from 'lucide-react'
import { t } from '@/utils/i18n'

export default function ChatPage() {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const personas = useStore((s) => s.personas)
  const providers = useStore((s) => s.providers)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const messages = useStore((s) => s.messages)
  const createSession = useStore((s) => s.createSession)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const chatMode = useStore((s) => s.chatMode)
  const setChatMode = useStore((s) => s.setChatMode)
  const arenaModelIds = useStore((s) => s.arenaModelIds)
  const setArenaModelIds = useStore((s) => s.setArenaModelIds)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const saveSessionConfig = useStore((s) => s.saveSessionConfig)
  const loadModels = useStore((s) => s.loadModels)
  const allModels = useStore((s) => s.allModels)
  const agentMode = useStore((s) => s.agentMode)
  const setAgentMode = useStore((s) => s.setAgentMode)

  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const activeProviderId = cfg?.providerId ?? null
  const activeModelId = cfg?.modelId ?? null
  const currentPersonaId = cfg?.personaId ?? null

  const models = activeProviderId ? (modelsByProvider[activeProviderId] || []) : []
  const currentModel = models.find(m => m.id === activeModelId)
  const currentProvider = providers.find(p => p.id === activeProviderId)
  const currentPersona = personas.find(p => p.id === currentPersonaId)

  if (!currentSessionId) {
    return (
      <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <EmptyState noSession />
      </div>
    )
  }

  // Build model options grouped by provider — memoized; only recomputes when
  // providers or allModels change (avoids O(P×M) filtering on every render).
  const allModelOptions = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    if (ms.length === 0) return null
    return { providerId: p.id, providerName: p.name, models: ms.map(m => ({ id: m.id, name: m.display_name || m.model_name })) }
  }).filter(Boolean), [providers, allModels])

  // Build arena model checkboxes — memoized alongside the grouped options.
  const allArenaModels = useMemo(() => allModelOptions.flatMap(g => g.models.map(m => ({ ...m, providerName: g.providerName }))), [allModelOptions])

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--content-bg, var(--bg-primary))' }}>
      {/* Top bar */}
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
          {/* Agent mode (risk-ascending): off → plan (read-only) → ask (confirm) → auto (sandboxed) → yolo (full). */}
          <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
            {([['off', t('agent.mode.off')], ['plan', t('agent.mode.plan')], ['ask', t('agent.mode.ask')], ['auto', t('agent.mode.auto')], ['yolo', t('agent.mode.yolo')]] as const).map(([k,label]) => (
              <Tooltip key={k} text={t(`agent.mode.${k}.desc`)}>
                <button onClick={() => {
                  if (k === 'yolo') {
                    // High-risk mode: warn before enabling.
                    if (!window.confirm(t('agent.mode.yolo_warn'))) return
                  }
                  setAgentMode(k)
                }} disabled={chatMode === 'arena'}
                  className={`px-2 py-1.5 transition-colors ${agentMode === k ? (k === 'yolo' ? 'bg-red-600 text-white' : 'bg-black text-white') : ''}`}
                  style={agentMode !== k ? { color: k === 'yolo' ? 'var(--error)' : 'var(--text-secondary)' } : {}}>{label}</button>
              </Tooltip>
            ))}
          </div>
          {/* Persona selector */}
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

      {/* Arena model selector: checkbox grid — no Ctrl+click needed */}
      {chatMode === 'arena' && (
        <div className="px-4 py-1.5 border-b text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-medium mr-1" style={{ color: 'var(--text-primary)' }}>{t('chat.arena_model_sel')}:</span>
            {allArenaModels.map(m => (
              <label key={m.id} className="inline-flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded border bg-white hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border)' }}>
                <input type="checkbox" checked={arenaModelIds.includes(m.id)}
                  onChange={(e) => {
                    const newIds = e.target.checked
                      ? [...arenaModelIds, m.id]
                      : arenaModelIds.filter(x => x !== m.id)
                    useStore.getState().setArenaModelIds(newIds)
                  }} className="w-3 h-3" />
                <span style={{ color: 'var(--text-muted)' }}>{m.providerName}</span>
                <span>{m.name}</span>
              </label>
            ))}
          </div>
          {arenaModelIds.length < 2 && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--warning)' }}>{t('chat.arena.min_models')}</p>
          )}
        </div>
      )}

      {/* Model selector now lives under the input bar (ChatInput) next to the
          thinking-effort slider — Claude-Code-style. */}

      <ContextBar />
      <ChatWindow />
      <ChatInput />
    </div>
  )
}
