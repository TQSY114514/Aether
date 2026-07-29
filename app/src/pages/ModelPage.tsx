import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { Plus, Trash2, RefreshCw, Check, X, Globe, Key, Wifi, Edit2, Save } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { t } from '@/utils/i18n'

export default function ModelPage() {
  const providers = useStore((s) => s.providers)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const loadProviders = useStore((s) => s.loadProviders)
  const addProvider = useStore((s) => s.addProvider)
  const deleteProvider = useStore((s) => s.deleteProvider)
  const loadModels = useStore((s) => s.loadModels)
  const addModel = useStore((s) => s.addModel)
  const deleteModel = useStore((s) => s.deleteModel)
  const loadAllModels = useStore((s) => s.loadAllModels)

  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; errorMessage?: string }>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newProvider, setNewProvider] = useState({ name: '', api_url: '', api_key: '', api_format: 'openai' })
  const [showAddModel, setShowAddModel] = useState<number | null>(null)
  const [newModelName, setNewModelName] = useState('')
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null)
  const [editData, setEditData] = useState({ name: '', api_url: '', api_key: '' })

  useEffect(() => { loadProviders() }, [loadProviders])

  const handleTest = async (providerId: number) => {
    setTestingId(providerId)
    const result = await window.electronAPI.provider.testConnection(providerId)
    setTestResults((prev) => ({ ...prev, [providerId]: result }))
    setTestingId(null)
  }

  const handleFetchModels = async (providerId: number) => {
    setTestingId(providerId)
    try {
      const modelNames = await window.electronAPI.provider.fetchModels(providerId)
      const existing = (modelsByProvider[providerId] || []).map(m => m.model_name)
      const existingSet = new Set(existing)
      for (const name of modelNames) {
        if (existingSet.has(name)) continue // skip duplicates from re-fetching
        await addModel({ provider_id: providerId, model_name: name, is_primary: 0, display_name: null, fallback_order: null, context_window: null, input_price_per_1k: null, output_price_per_1k: null })
      }
      await loadModels(providerId)
    } catch {}
    setTestingId(null)
  }

  const handleAddProvider = async () => {
    if (!newProvider.name || !newProvider.api_url) return
    await addProvider({ ...newProvider, api_format: newProvider.api_format || 'openai', enabled: 1 })
    setNewProvider({ name: '', api_url: '', api_key: '', api_format: 'openai' })
    setShowAdd(false)
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('models.title')}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('models.subtitle')}</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ borderColor: 'var(--border)' }}>
            <Plus size={14} />{t('models.add_provider')}
          </button>
        </div>

        {showAdd && (
          <div className="mb-6 p-4 rounded-xl space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <input value={newProvider.name} onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
              placeholder={t('models.add_provider_name')}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:border-gray-300 bg-white"
              style={{ border: '1px solid var(--border)' }} />
            <input value={newProvider.api_url} onChange={(e) => setNewProvider({ ...newProvider, api_url: e.target.value })}
              placeholder={t('models.add_provider_url')}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:border-gray-300 bg-white"
              style={{ border: '1px solid var(--border)' }} />
            <input value={newProvider.api_key} onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
              placeholder={t('models.add_provider_key')} type="password"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:border-gray-300 bg-white"
              style={{ border: '1px solid var(--border)' }} />
            <div className="flex items-center gap-2">
              <label className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{t('models.api_format')}</label>
              <select value={newProvider.api_format} onChange={(e) => setNewProvider({ ...newProvider, api_format: e.target.value })}
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
                <option value="openai">OpenAI (/chat/completions)</option>
                <option value="anthropic">Anthropic (/messages)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddProvider} className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-80">{t('models.save')}</button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-white transition-colors" style={{ borderColor: 'var(--border)' }}>{t('models.cancel')}</button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {providers.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>{t('models.no_providers')}</div>
          )}
          {providers.map((provider) => {
            const models = modelsByProvider[provider.id] || []
            const testResult = testResults[provider.id]
            const isEditing = editingProviderId === provider.id

            return (
              <div key={provider.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-gray-400" />
                      {isEditing ? (
                        <input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="text-sm font-medium px-2 py-1 rounded border outline-none bg-white" style={{ borderColor: 'var(--accent)' }} />
                      ) : (
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{provider.name}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <button onClick={async () => {
                          await window.electronAPI.provider.update(provider.id, editData)
                          setEditingProviderId(null); loadProviders()
                        }} className="p-1 rounded hover:bg-[var(--border)] transition-colors">
                          <Save size={14} className="text-green-500" />
                        </button>
                      ) : (
                        <button onClick={() => { setEditingProviderId(provider.id); setEditData({ name: provider.name, api_url: provider.api_url, api_key: provider.api_key }) }}
                          className="p-1 rounded hover:bg-[var(--border)] transition-colors">
                          <Edit2 size={14} className="text-gray-400" />
                        </button>
                      )}
                      <button onClick={() => deleteProvider(provider.id)} className="p-1 rounded hover:bg-[var(--border)] transition-colors">
                        <Trash2 size={14} className="text-gray-400" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 mb-3">
                    {isEditing ? (
                      <>
                        <input value={editData.api_url} onChange={(e) => setEditData({ ...editData, api_url: e.target.value })}
                          placeholder="API URL" className="w-full px-2 py-1.5 text-xs rounded border outline-none bg-white mb-2 font-mono" style={{ borderColor: 'var(--accent)' }} />
                        <input value={editData.api_key} onChange={(e) => setEditData({ ...editData, api_key: e.target.value })}
                          placeholder="API Key" type="password" className="w-full px-2 py-1.5 text-xs rounded border outline-none bg-white font-mono" style={{ borderColor: 'var(--accent)' }} />
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Globe size={12} className="text-gray-400 shrink-0" />
                          <span className="text-xs" style={{ color: 'var(--text-muted)', width: 60 }}>{t('models.api_url')}</span>
                          <span className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{provider.api_url}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Key size={12} className="text-gray-400 shrink-0" />
                          <span className="text-xs" style={{ color: 'var(--text-muted)', width: 60 }}>{t('models.api_key')}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {provider.api_key ? `${provider.api_key.slice(0, 8)}...${provider.api_key.slice(-4)}` : t('models.add_provider_key')}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Tooltip text={t('tooltip.model_test')}>
                      <button onClick={() => handleTest(provider.id)} disabled={testingId === provider.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-white hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                        style={{ borderColor: 'var(--border)' }}>
                        {testingId === provider.id ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />}
                        {t('models.test')}
                      </button>
                    </Tooltip>
                    <Tooltip text={t('tooltip.model_fetch')}>
                      <button onClick={() => handleFetchModels(provider.id)} disabled={testingId === provider.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-white hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                        style={{ borderColor: 'var(--border)' }}>
                        <RefreshCw size={12} />{t('models.fetch')}
                      </button>
                    </Tooltip>
                  </div>

                  {testResult !== undefined && (
                    <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                      {testResult.success ? <Check size={12} /> : <X size={12} />}
                      {testResult.success ? t('models.success') : (testResult.errorMessage || t('models.fail'))}
                    </div>
                  )}
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {models.length === 0 && (
                    <div className="px-4 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>{t('models.no_models')}</div>
                  )}
                  {models.map((model) => (
                    <div key={model.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
                      onClick={() => {}}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{model.model_name}</span>
                        {model.is_primary ? <span className="cost-badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{t('models.default')}</span> : null}
                        {model.input_price_per_1k != null && (
                          <span className="cost-badge">${(model.input_price_per_1k || 0).toFixed(6)} / 1K</span>
                        )}
                        {model.fallback_order != null && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">{t('models.fallback')} #{model.fallback_order}</span>
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); loadModels(provider.id); loadAllModels() }}
                        className="p-1 rounded hover:bg-[var(--border)] transition-colors opacity-0 hover:opacity-100 shrink-0">
                        <Trash2 size={12} className="text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-2" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  {showAddModel === provider.id ? (
                    <div className="flex gap-2">
                      <input value={newModelName} onChange={(e) => setNewModelName(e.target.value)}
                        placeholder={t('models.add_model_name')} autoFocus
                        className="flex-1 px-2 py-1 text-xs rounded border outline-none bg-white" style={{ borderColor: 'var(--accent)' }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newModelName.trim()) {
                            await addModel({ provider_id: provider.id, model_name: newModelName.trim(), is_primary: 0, display_name: null, fallback_order: null, context_window: null, input_price_per_1k: null, output_price_per_1k: null })
                            setNewModelName(''); setShowAddModel(null)
                          }
                          if (e.key === 'Escape') setShowAddModel(null)
                        }} />
                      <button onClick={async () => {
                        if (newModelName.trim()) {
                          await addModel({ provider_id: provider.id, model_name: newModelName.trim(), is_primary: 0, display_name: null, fallback_order: null, context_window: null, input_price_per_1k: null, output_price_per_1k: null })
                          setNewModelName(''); setShowAddModel(null)
                        }
                      }} className="px-2 py-1 text-xs bg-black text-white rounded-lg">{t('models.add_model')}</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddModel(provider.id)}
                      className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>
                      <Plus size={12} />{t('models.add_model')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
