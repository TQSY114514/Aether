import { useMemo } from 'react'
import { Trophy, Sparkles } from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export function formatSuggestionReason(modelSuggestion: ModelSuggestion | null): string {
  if (!modelSuggestion) return t('chat.model_switch')
  const rp = modelSuggestion.reasonParts
  if (!rp || rp.noMatch) return t('model.suggest.no_match')

  const lines: string[] = []
  const taskKey = rp.task ? `model.suggest.task.${rp.task}` : null
  lines.push(t('model.suggest.task', taskKey ? t(taskKey) : rp.taskLabel || ''))

  lines.push(t('model.suggest.heuristic', rp.heuristic ?? 0, rp.family || ''))

  if (rp.eloScore != null) {
    const elo = Number(rp.eloScore).toFixed(1)
    const sigmaStr = rp.eloSigma ? ` ±${rp.eloSigma}` : ''
    lines.push(rp.eloReliable
      ? t('model.suggest.elo', `${elo}${sigmaStr}`, rp.eloWins ?? 0, rp.eloTotal ?? 0)
      : t('model.suggest.elo_insufficient', `${elo}${sigmaStr}`))
  }

  if (rp.useTools) {
    lines.push(rp.reasonPickUsed ? t('model.suggest.reason_pick') : t('model.suggest.tools'))
  }

  if (rp.closeRace && rp.gap != null && rp.runnerUpName) {
    lines.push(t('model.suggest.close_race', rp.gap, rp.runnerUpName))
  }

  if (rp.secondary && rp.secondary.length) {
    const labels = rp.secondary
      .map(s => t(`model.suggest.task.${s.type}`))
      .filter(l => !l.startsWith('model.suggest.task.'))
    if (labels.length) lines.push(t('model.suggest.secondary', labels.join(', ')))
  }

  if (rp.confidence != null) lines.push(t('model.suggest.confidence', rp.confidence))

  return lines.join('\n')
}

export interface ModelSelectorProps {
  providers: { id: number; name: string }[]
  allModels: { id: number; provider_id: number; model_name: string; display_name?: string | null }[]
  activeModelId: number | null
  onSelect: (modelId: number, providerId: number) => void
  modelSuggestion: ModelSuggestion | null
  scoreByModel: Record<number, number>
  currentPrompt?: string
}

export default function ModelSelector({
  providers,
  allModels,
  activeModelId,
  onSelect,
  modelSuggestion,
  scoreByModel,
  currentPrompt,
}: ModelSelectorProps) {
  const groups = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    return ms.length ? { providerId: p.id, providerName: p.name, models: ms } : null
  }).filter(Boolean) as { providerId: number; providerName: string; models: typeof allModels }[], [providers, allModels])

  const handleAutoRoute = async () => {
    try {
      const route = await window.electronAPI.arena.autoRoute({ prompt: currentPrompt })
      if (route && route.model_id) {
        onSelect(route.model_id, route.provider_id)
        useStore.getState().triggerToast(
          t('chat.model_routed').replace('{0}', route.model_name).replace('{1}', route.route_reason),
          'success'
        )
      } else {
        useStore.getState().triggerToast(t('model.suggest.no_match'), 'info')
      }
    } catch {
      useStore.getState().triggerToast(t('chat.auto_route_failed', '自动路由失败'), 'warning')
    }
  }

  if (groups.length === 0) return null

  const reasonTitle = formatSuggestionReason(modelSuggestion)
  const arenaElo = modelSuggestion?.reasonParts?.arenaElo ?? (modelSuggestion?.reasonParts?.eloTotal && modelSuggestion?.reasonParts?.eloTotal > 0 && modelSuggestion?.reasonParts?.eloScore ? Math.round(modelSuggestion.reasonParts.eloScore) : null)

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative shrink-0" title={reasonTitle}>
        <select
          value={String(activeModelId ?? '')}
          onChange={(e) => {
            const mid = Number(e.target.value)
            const model = allModels.find(m => m.id === mid)
            if (model) onSelect(mid, model.provider_id)
          }}
          className="text-[11px] rounded-lg border px-1.5 sm:px-2 py-1 outline-none max-w-[125px] sm:max-w-[155px] truncate bg-[var(--content-bg)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="" disabled>{t('chat.select_model')}</option>
          {groups.map(g => (
            <optgroup key={g.providerId} label={g.providerName}>
              {g.models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.model_name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {arenaElo != null && (
        <span
          className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] shrink-0 select-none shadow-2xs font-mono"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
          title={reasonTitle || `Arena ELO ${arenaElo}`}
        >
          <Trophy size={10} className="text-amber-500 shrink-0" />
          <span>ELO {arenaElo}</span>
        </span>
      )}

      <button
        onClick={handleAutoRoute}
        className="p-1 px-1.5 sm:px-2 rounded-lg border text-[10px] flex items-center gap-1 hover:bg-[var(--bg-secondary)] transition-colors shrink-0 cursor-pointer shadow-2xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        title={t('chat.model_auto_route_desc')}
        aria-label={t('chat.model_auto_route')}
      >
        <Sparkles size={11} className="text-amber-500 shrink-0" />
        <span className="hidden md:inline font-medium">{t('chat.model_auto_route')}</span>
      </button>
    </div>
  )
}
