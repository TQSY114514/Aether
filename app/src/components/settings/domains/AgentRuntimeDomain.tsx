import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { Shield, Clock, Save, Check } from 'lucide-react'
import { t } from '@/utils/i18n'
import AgentSettings from '@/components/settings/AgentSettings'
import CustomPolicySettings from '@/components/settings/CustomPolicySettings'
import AdvancedSettings from '@/components/settings/AdvancedSettings'

export default function AgentRuntimeDomain() {
  const fallbackTimeout = useStore((s) => s.fallbackTimeout)
  const setFallbackTimeout = useStore((s) => s.setFallbackTimeout)
  const sessionBudgetUsd = useStore((s) => s.sessionBudgetUsd)
  const setSessionBudgetUsd = useStore((s) => s.setSessionBudgetUsd)

  const [savedTimeout, setSavedTimeout] = useState(false)
  const [savedBudget, setSavedBudget] = useState(false)
  const [localTimeout, setLocalTimeout] = useState(String(fallbackTimeout))
  const [localBudget, setLocalBudget] = useState(String(sessionBudgetUsd))

  useEffect(() => { setLocalTimeout(String(fallbackTimeout)) }, [fallbackTimeout])
  useEffect(() => { setLocalBudget(String(sessionBudgetUsd)) }, [sessionBudgetUsd])

  const handleSaveTimeout = async () => {
    const ms = parseInt(localTimeout, 10)
    if (ms > 0 && ms <= 300000) {
      await setFallbackTimeout(ms)
      setSavedTimeout(true)
      setTimeout(() => setSavedTimeout(false), 2000)
    }
  }

  const handleSaveBudget = async () => {
    const v = parseFloat(localBudget)
    if (!isNaN(v) && v >= 0) {
      await setSessionBudgetUsd(v)
      setSavedBudget(true)
      setTimeout(() => setSavedBudget(false), 2000)
    }
  }

  return (
    <div className="space-y-4">
      {/* Core Agent Execution & Workspace Settings */}
      <AgentSettings />

      {/* Custom Mode Capability Matrix */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Shield size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.custom_mode', '自定义模式策略矩阵')}
          </h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.custom_mode_desc', '配置各能力维度（文件读写、系统终端、网络请求）的权限边界与二次确认策略。')}
        </p>
        <CustomPolicySettings />
      </div>

      {/* Advanced Agent Engine Settings */}
      <AdvancedSettings />

      {/* Timeouts & Session Budget Limits */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Clock size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.advanced', '限额与超时控制')}
          </h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.agent.session_budget_desc', '设定单次网络请求超时上限与单会话费用上限（USD）')}
        </p>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('settings.advanced.timeout')}
              </span>
              <div className="flex items-center gap-2">
                <input
                  value={localTimeout}
                  onChange={(e) => setLocalTimeout(e.target.value)}
                  type="number"
                  min="5000"
                  max="300000"
                  step="5000"
                  className="w-24 px-2 py-1 text-xs rounded-md border outline-none bg-[var(--bg-primary)] text-right font-mono"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleSaveTimeout}
                  className="flex items-center gap-1 px-3 py-1 text-xs rounded-md font-medium text-white transition-opacity active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {savedTimeout ? <Check size={12} /> : <Save size={12} />}
                  {savedTimeout ? t('settings.advanced.saved') : t('settings.advanced.save')}
                </button>
              </div>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {t('settings.advanced.timeout_desc')}
            </p>
          </div>

          <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('settings.advanced.budget')}
              </span>
              <div className="flex items-center gap-2">
                <input
                  value={localBudget}
                  onChange={(e) => setLocalBudget(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-24 px-2 py-1 text-xs rounded-md border outline-none bg-[var(--bg-primary)] text-right font-mono"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleSaveBudget}
                  className="flex items-center gap-1 px-3 py-1 text-xs rounded-md font-medium text-white transition-opacity active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {savedBudget ? <Check size={12} /> : <Save size={12} />}
                  {savedBudget ? t('settings.advanced.saved') : t('settings.advanced.save')}
                </button>
              </div>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {t('settings.advanced.budget_desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
