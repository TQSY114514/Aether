import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShieldAlert, Plus, Trash2, Check, Globe, MessageSquare, RefreshCw, X } from 'lucide-react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'

interface PersistedRule {
  tool: string
  ruleKey: string
  decision: string
  sessionIds?: number[] | null
  key: string
}

interface SessionRule {
  sessionId?: number | string
  key: string
  tool?: string
  ruleKey?: string
  decision: string
}

const TOOL_OPTIONS = ['run_command', 'write_file', 'edit_file', 'apply_patch', 'web_fetch', 'mcp_call']

export default function PermissionRulesSettings() {
  const { toast } = useUI()
  const sessions = useStore((s) => s.sessions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const loadSessions = useStore((s) => s.loadSessions)

  const [persisted, setPersisted] = useState<PersistedRule[]>([])
  const [sessionRules, setSessionRules] = useState<SessionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Inline add-rule form state
  const [showAdd, setShowAdd] = useState(false)
  const [newTool, setNewTool] = useState('run_command')
  const [newPattern, setNewPattern] = useState('')
  const [newDecision, setNewDecision] = useState<'allow' | 'ask' | 'deny'>('allow')
  const [newScopeMode, setNewScopeMode] = useState<'global' | 'specific'>('global')
  const [newSessionIds, setNewSessionIds] = useState<number[]>([])

  // Scope picker state for editing existing persisted rule
  const [editingScopeKey, setEditingScopeKey] = useState<string | null>(null)
  const [draftSessionIds, setDraftSessionIds] = useState<number[]>([])

  const sessionMap = useMemo(() => {
    const m = new Map<number, { id: number; title: string | null }>()
    for (const s of sessions) m.set(s.id, s)
    return m
  }, [sessions])

  const loadRules = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await window.electronAPI?.chat?.listPermissionRules?.()
      setPersisted(Array.isArray(res?.persisted) ? res.persisted : [])
      setSessionRules(Array.isArray(res?.session) ? res.session : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
    if (sessions.length === 0) {
      loadSessions().catch(() => {})
    }
  }, [loadRules, sessions.length, loadSessions])

  const handleSaveRule = async (
    tool: string,
    ruleKey: string,
    decision: string,
    sessionIds: number[] | null
  ) => {
    const busyId = `${tool}:${ruleKey}`
    setBusyKey(busyId)
    try {
      const res = await window.electronAPI?.chat?.savePermissionRule?.(tool, ruleKey, decision, sessionIds)
      if (res && !res.ok) {
        toast(res.error || t('settings.permissions.save_failed'), { type: 'error' })
        return
      }
      toast(t('settings.permissions.saved'), { type: 'success' })
      await loadRules()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { type: 'error' })
    } finally {
      setBusyKey(null)
    }
  }

  const handleDeletePersisted = async (tool: string, ruleKey: string) => {
    const busyId = `${tool}:${ruleKey}`
    setBusyKey(busyId)
    try {
      await window.electronAPI?.chat?.removePermissionRule?.(tool, ruleKey, { scope: 'persisted' })
      if (editingScopeKey === busyId) setEditingScopeKey(null)
      toast(t('settings.permissions.deleted'), { type: 'success' })
      await loadRules()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { type: 'error' })
    } finally {
      setBusyKey(null)
    }
  }

  const handleRevokeSessionRule = async (item: SessionRule) => {
    if (item.sessionId == null) return
    const busyId = `sess:${item.sessionId}:${item.key}`
    setBusyKey(busyId)
    try {
      await window.electronAPI?.chat?.removePermissionRule?.(
        item.tool || '',
        item.ruleKey || '*',
        { scope: 'session', sessionId: item.sessionId, key: item.key }
      )
      await loadRules()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { type: 'error' })
    } finally {
      setBusyKey(null)
    }
  }

  const handlePromoteSessionRule = async (item: SessionRule) => {
    const sid = Number(item.sessionId)
    const idx = item.key.indexOf(':')
    const tool = item.tool || (idx > -1 ? item.key.slice(0, idx) : item.key)
    const ruleKey = item.ruleKey || (idx > -1 ? item.key.slice(idx + 1) : '*')
    const scoped = Number.isFinite(sid) && sid > 0 ? [sid] : null
    await handleSaveRule(tool, ruleKey, item.decision || 'allow', scoped)
    if (item.sessionId != null) {
      await window.electronAPI?.chat?.removePermissionRule?.(tool, ruleKey, {
        scope: 'session',
        sessionId: item.sessionId,
        key: item.key,
      })
      await loadRules()
    }
  }

  const handleApplyPreset = async (preset: 'safe_git' | 'test_runners' | 'read_tools') => {
    setBusyKey(`preset:${preset}`)
    try {
      const res = await window.electronAPI?.chat?.applyPermissionPreset?.(preset)
      toast(t('settings.permissions.preset_applied', res?.added ?? 0), { type: 'success' })
      await loadRules()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { type: 'error' })
    } finally {
      setBusyKey(null)
    }
  }

  const toggleIdInList = (list: number[], id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const startScopeEdit = (rule: PersistedRule) => {
    if (editingScopeKey === rule.key) {
      setEditingScopeKey(null)
      return
    }
    setEditingScopeKey(rule.key)
    if (Array.isArray(rule.sessionIds) && rule.sessionIds.length > 0) {
      setDraftSessionIds(rule.sessionIds)
    } else if (currentSessionId) {
      setDraftSessionIds([currentSessionId])
    } else {
      setDraftSessionIds([])
    }
  }

  const handleCreateRule = async () => {
    const pat = newPattern.trim()
    if (!pat) return
    if (newScopeMode === 'specific' && newSessionIds.length === 0) {
      toast(t('settings.permissions.scope.select_hint'), { type: 'error' })
      return
    }
    await handleSaveRule(
      newTool,
      pat,
      newDecision,
      newScopeMode === 'specific' ? newSessionIds : null
    )
    setNewPattern('')
    setNewSessionIds([])
    setShowAdd(false)
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <ShieldAlert size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.permissions.title')}
            </h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.permissions.desc')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={loadRules}
            disabled={loading}
            className="p-1.5 rounded-md border transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title={t('common.refresh', '刷新')}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={12} />
            <span>{t('settings.permissions.add')}</span>
          </button>
        </div>
      </div>

      {/* Presets strip */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 pt-1">
        {([
          { id: 'safe_git' as const, label: t('settings.permissions.preset_git') },
          { id: 'test_runners' as const, label: t('settings.permissions.preset_tests') },
          { id: 'read_tools' as const, label: t('settings.permissions.preset_read') },
        ]).map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={busyKey === `preset:${preset.id}`}
            onClick={() => handleApplyPreset(preset.id)}
            className="px-2 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
          >
            + {preset.label}
          </button>
        ))}
      </div>

      {/* Inline Add Rule Form */}
      {showAdd && (
        <div className="mb-4 p-3 rounded-lg border space-y-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.permissions.tool_label')}
              </label>
              <select
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-md border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] bg-[var(--bg-primary)] font-mono"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {TOOL_OPTIONS.map((tool) => (
                  <option key={tool} value={tool}>{tool}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.permissions.pattern_label')}
              </label>
              <input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder={t('settings.permissions.pattern_placeholder')}
                className="w-full px-2 py-1.5 text-xs rounded-md border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] bg-[var(--bg-primary)] font-mono"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.permissions.strategy_label')}
              </label>
              <select
                value={newDecision}
                onChange={(e) => setNewDecision(e.target.value as 'allow' | 'ask' | 'deny')}
                className="w-full px-2 py-1.5 text-xs rounded-md border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] bg-[var(--bg-primary)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="allow">{t('settings.permissions.decision.allow')}</option>
                <option value="ask">{t('settings.permissions.decision.ask')}</option>
                <option value="deny">{t('settings.permissions.decision.deny')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-primary)' }}>
              <input
                type="radio"
                name="new-rule-scope"
                checked={newScopeMode === 'global'}
                onChange={() => setNewScopeMode('global')}
              />
              <span>{t('settings.permissions.scope.global')}</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-primary)' }}>
              <input
                type="radio"
                name="new-rule-scope"
                checked={newScopeMode === 'specific'}
                onChange={() => {
                  setNewScopeMode('specific')
                  if (newSessionIds.length === 0 && currentSessionId) setNewSessionIds([currentSessionId])
                }}
              />
              <span>{t('settings.permissions.scope.pick')}</span>
            </label>
          </div>

          {newScopeMode === 'specific' && (
            <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
              {sessions.length === 0 ? (
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.permissions.no_sessions')}
                </div>
              ) : (
                sessions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={newSessionIds.includes(s.id)}
                      onChange={() => setNewSessionIds((prev) => toggleIdInList(prev, s.id))}
                    />
                    <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>#{s.id}</span>
                    <span className="truncate">{s.title || `Session ${s.id}`}</span>
                  </label>
                ))
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-2.5 py-1 text-xs rounded-md border transition-colors hover:bg-[var(--bg-primary)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {t('settings.permissions.cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreateRule}
              disabled={!newPattern.trim()}
              className="px-3 py-1 text-xs rounded-md font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('settings.permissions.save')}
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-3 p-2.5 rounded-md border text-xs flex items-center justify-between" style={{ borderColor: 'var(--error)', color: 'var(--error)', backgroundColor: 'var(--bg-secondary)' }}>
          <span>{loadError}</span>
          <button type="button" onClick={loadRules} className="underline cursor-pointer">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Persisted Rules Section */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.permissions.persisted_heading')} ({persisted.length})
        </div>

        {loading ? (
          <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </div>
        ) : persisted.length === 0 ? (
          <div className="py-4 px-3 rounded-lg border text-xs text-center" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-primary)' }}>
            {t('settings.permissions.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {persisted.map((rule) => {
              const isScoped = Array.isArray(rule.sessionIds) && rule.sessionIds.length > 0
              const compositeKey = `${rule.tool}:${rule.ruleKey}`
              const isEditing = editingScopeKey === compositeKey || editingScopeKey === rule.key
              const isBusy = busyKey === compositeKey || busyKey === rule.key
              return (
                <div
                  key={rule.key}
                  className="rounded-lg border p-2.5 space-y-2"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-mono rounded border shrink-0"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        {rule.tool}
                      </span>
                      <span className="text-xs font-mono truncate" style={{ color: 'var(--text-primary)' }} title={rule.ruleKey}>
                        {rule.ruleKey}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={rule.decision}
                        disabled={isBusy}
                        onChange={(e) => handleSaveRule(rule.tool, rule.ruleKey, e.target.value, rule.sessionIds ?? null)}
                        className="px-2 py-1 text-[11px] rounded border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] bg-[var(--bg-secondary)] cursor-pointer disabled:opacity-40"
                        style={{
                          borderColor: 'var(--border)',
                          color: rule.decision === 'deny' ? 'var(--error)' : rule.decision === 'ask' ? 'var(--warning)' : 'var(--success)',
                        }}
                      >
                        <option value="allow">{t('settings.permissions.decision.allow')}</option>
                        <option value="ask">{t('settings.permissions.decision.ask')}</option>
                        <option value="deny">{t('settings.permissions.decision.deny')}</option>
                      </select>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => startScopeEdit(rule)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer"
                        style={{
                          borderColor: isScoped ? 'var(--accent)' : 'var(--border)',
                          color: isScoped ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {isScoped ? <MessageSquare size={11} /> : <Globe size={11} />}
                        <span>
                          {isScoped
                            ? t('settings.permissions.scope.specific', rule.sessionIds!.length)
                            : t('settings.permissions.scope.global')}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeletePersisted(rule.tool, rule.ruleKey)}
                        className="p-1 rounded border transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--error)] disabled:opacity-40 cursor-pointer"
                        style={{ borderColor: 'var(--border)', color: 'var(--error)' }}
                        title={t('settings.permissions.delete')}
                        aria-label={t('settings.permissions.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isScoped && !isEditing && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {rule.sessionIds!.map((sid) => {
                        const sess = sessionMap.get(sid)
                        return (
                          <span
                            key={sid}
                            className="px-1.5 py-0.5 text-[10px] font-mono rounded border"
                            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                          >
                            #{sid}{sess?.title ? ` · ${sess.title.slice(0, 18)}` : ''}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {isEditing && (
                    <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {t('settings.permissions.scope.pick')}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleSaveRule(rule.tool, rule.ruleKey, rule.decision, null)
                            setEditingScopeKey(null)
                          }}
                          className="text-[11px] underline cursor-pointer"
                          style={{ color: 'var(--accent)' }}
                        >
                          {t('settings.permissions.scope.global')}
                        </button>
                      </div>

                      <div className="max-h-36 overflow-y-auto rounded border p-2 space-y-1" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                        {sessions.length === 0 ? (
                          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {t('settings.permissions.no_sessions')}
                          </div>
                        ) : (
                          sessions.map((s) => (
                            <label key={s.id} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                              <input
                                type="checkbox"
                                checked={draftSessionIds.includes(s.id)}
                                onChange={() => setDraftSessionIds((prev) => toggleIdInList(prev, s.id))}
                              />
                              <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>#{s.id}</span>
                              <span className="truncate flex-1">{s.title || `Session ${s.id}`}</span>
                              {currentSessionId === s.id && (
                                <span className="text-[10px] px-1 rounded border" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                                  {t('settings.permissions.current_badge')}
                                </span>
                              )}
                            </label>
                          ))
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingScopeKey(null)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--bg-secondary)] cursor-pointer"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <X size={11} />
                          <span>{t('settings.permissions.cancel')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (draftSessionIds.length === 0) {
                              toast(t('settings.permissions.scope.select_hint'), { type: 'error' })
                              return
                            }
                            await handleSaveRule(rule.tool, rule.ruleKey, rule.decision, draftSessionIds)
                            setEditingScopeKey(null)
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
                          style={{ backgroundColor: 'var(--accent)' }}
                        >
                          <Check size={11} />
                          <span>{t('settings.permissions.save')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Active Session Rules Section */}
      {sessionRules.length > 0 && (
        <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.permissions.session_heading')} ({sessionRules.length})
          </div>
          <div className="space-y-1.5">
            {sessionRules.map((item) => {
              const sid = item.sessionId != null ? Number(item.sessionId) : null
              const sess = sid != null ? sessionMap.get(sid) : undefined
              const rowKey = `${item.sessionId}:${item.key}`
              const isBusy = busyKey === `sess:${rowKey}`
              return (
                <div
                  key={rowKey}
                  className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-md border text-xs"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                      #{item.sessionId}{sess?.title ? ` · ${sess.title.slice(0, 16)}` : ''}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded border shrink-0" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      {item.tool || item.key}
                    </span>
                    <span className="font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                      {item.ruleKey || '*'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handlePromoteSessionRule(item)}
                      className="px-2 py-0.5 text-[11px] rounded border transition-colors hover:bg-[var(--bg-primary)] disabled:opacity-40 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                    >
                      {t('settings.permissions.promote')}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRevokeSessionRule(item)}
                      className="px-2 py-0.5 text-[11px] rounded border transition-colors hover:bg-[var(--bg-primary)] disabled:opacity-40 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--error)' }}
                    >
                      {t('settings.permissions.revoke')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
