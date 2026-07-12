import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { getThemes } from '@/utils/theme'
import { Info, Save, Check, ImageIcon, Trash2, Download, Upload } from 'lucide-react'
import { t, LANGS } from '@/utils/i18n'
import McpSettings from '@/components/settings/McpSettings'
import AdvancedSettings from '@/components/settings/AdvancedSettings'

export default function SettingPage() {
  const language = useStore((s) => s.language)
  const theme = useStore((s) => s.theme)
  const fallbackTimeout = useStore((s) => s.fallbackTimeout)
  const setLanguage = useStore((s) => s.setLanguage)
  const setTheme = useStore((s) => s.setTheme)
  const setFallbackTimeout = useStore((s) => s.setFallbackTimeout)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const backgroundOpacity = useStore((s) => s.backgroundOpacity)
  const backgroundBlur = useStore((s) => s.backgroundBlur)
  const fontScale = useStore((s) => s.fontScale)
  const bubbleWidth = useStore((s) => s.bubbleWidth)
  const defaultEffort = useStore((s) => s.defaultEffort)
  const setBackgroundImage = useStore((s) => s.setBackgroundImage)
  const setBackgroundOpacity = useStore((s) => s.setBackgroundOpacity)
  const setBackgroundBlur = useStore((s) => s.setBackgroundBlur)
  const setFontScale = useStore((s) => s.setFontScale)
  const setBubbleWidth = useStore((s) => s.setBubbleWidth)
  const setDefaultEffort = useStore((s) => s.setDefaultEffort)

  const [saved, setSaved] = useState(false)
  const [localTimeout, setLocalTimeout] = useState(String(fallbackTimeout))
  const { toast } = useUI()

  useEffect(() => { setLocalTimeout(String(fallbackTimeout)) }, [fallbackTimeout])

  const handleSaveTimeout = async () => {
    const ms = parseInt(localTimeout, 10)
    if (ms > 0 && ms <= 300000) {
      await setFallbackTimeout(ms)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setBackgroundImage(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = '' // allow re-uploading the same file
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-lg font-semibold mb-8" style={{ color: 'var(--text-primary)' }}>{t('settings.title')}</h1>
        <div className="space-y-6">

          {/* MCP servers */}
          <McpSettings />

          {/* Language */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{t('settings.language')}</h2>
            <select value={language} onChange={(e) => setLanguage(e.target.value as any)}
              className="w-full max-w-xs px-3 py-2 text-sm rounded-lg border outline-none bg-white"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native} — {l.label}</option>)}
            </select>
          </div>

          {/* Theme */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{t('settings.theme')}</h2>
            <div className="flex gap-2 flex-wrap">
              {(['light', 'dark', 'blue', 'glass', 'retro'] as const).map((tKey) => (
                <button key={tKey} onClick={() => setTheme(tKey)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${theme === tKey ? 'bg-black text-white border-black' : ''}`}
                  style={theme !== tKey ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : {}}>
                  {t(`settings.theme.${tKey}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Background Image */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.background')}</h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.background.desc')}</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-16 h-16 rounded-lg border shrink-0 overflow-hidden flex items-center justify-center"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                {backgroundImage
                  ? <img src={backgroundImage} alt="" className="w-full h-full object-cover" />
                  : <ImageIcon size={20} className="text-gray-400" />}
              </div>
              <div className="flex gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-white hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                  style={{ borderColor: 'var(--border)' }}>
                  <ImageIcon size={12} />{t('settings.background.upload')}
                  <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                </label>
                {backgroundImage && (
                  <button onClick={() => setBackgroundImage(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <Trash2 size={12} />{t('settings.background.clear')}
                  </button>
                )}
              </div>
            </div>
            {backgroundImage ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('settings.background.opacity')}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{backgroundOpacity}%</span>
                  </div>
                  <input type="range" min={10} max={100} value={backgroundOpacity}
                    onChange={(e) => setBackgroundOpacity(parseInt(e.target.value, 10))}
                    className="w-full accent-black" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('settings.background.blur')}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{backgroundBlur}px</span>
                  </div>
                  <input type="range" min={0} max={20} value={backgroundBlur}
                    onChange={(e) => setBackgroundBlur(parseInt(e.target.value, 10))}
                    className="w-full accent-black" />
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('settings.background.none')}</p>
            )}
          </div>

          {/* Display customization */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.display', '显示')}</h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.font_scale', '字体大小')}</p>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{(fontScale * 100).toFixed(0)}%</span>
                </div>
                <input type="range" min={0.85} max={1.25} step={0.05} value={fontScale}
                  onChange={(e) => setFontScale(parseFloat(e.target.value))}
                  className="w-full accent-black" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.bubble_width', '气泡宽度')}</p>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{bubbleWidth}%</span>
                </div>
                <input type="range" min={60} max={100} step={5} value={bubbleWidth}
                  onChange={(e) => setBubbleWidth(parseInt(e.target.value, 10))}
                  className="w-full accent-black" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.default_effort', '默认思考等级')}</p>
                </div>
                <div className="flex items-center rounded-lg border overflow-hidden w-fit" style={{ borderColor: 'var(--border)' }}>
                  {(['off', 'low', 'medium', 'high'] as const).map((e) => (
                    <button key={e} onClick={() => setDefaultEffort(e)}
                      className={`px-3 py-1 text-xs transition-colors ${defaultEffort === e ? 'bg-black text-white' : 'hover:bg-[var(--bg-secondary)]'}`}
                      style={defaultEffort !== e ? { color: 'var(--text-muted)' } : {}}>
                      {e === 'off' ? '关闭' : e === 'low' ? '低' : e === 'medium' ? '中' : '高'}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('settings.default_effort_desc', '新会话的默认思考等级（仅推理模型生效）')}</p>
              </div>
            </div>
          </div>

          {/* Advanced */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>{t('settings.advanced')}</h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.advanced.timeout')}</p>
                  <div className="flex items-center gap-2">
                    <input value={localTimeout} onChange={(e) => setLocalTimeout(e.target.value)}
                      type="number" min="5000" max="300000" step="5000"
                      className="w-24 px-2 py-1 text-xs rounded-lg border outline-none bg-white text-right"
                      style={{ borderColor: 'var(--border)' }} />
                    <button onClick={handleSaveTimeout}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-black text-white hover:opacity-80 transition-opacity">
                      {saved ? <Check size={12} /> : <Save size={12} />}
                      {saved ? t('settings.advanced.saved') : t('settings.advanced.save')}
                    </button>
                  </div>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('settings.advanced.timeout_desc')}</p>
              </div>
            </div>
          </div>

          {/* Advanced generation + title settings */}
          <AdvancedSettings />

          {/* About */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-3">
              <Info size={16} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.about')}</h2>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {t('settings.about_desc', '0.1.0')}
                </p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.features')}</h2>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              {['providers', 'chat', 'persona', 'arena', 'route'].map(k => (
                <li key={k}>✅ {t(`settings.feature.${k}`)}</li>
              ))}
            </ul>
          </div>

          {/* Data */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.data')}</h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.data_desc')}</p>
            <div className="flex gap-2">
              <button onClick={async () => {
                const res = await window.electronAPI.config.export({ includeSecrets: true })
                if (!res.success || !res.bundle) return
                const blob = new Blob([JSON.stringify(res.bundle, null, 2)], { type: 'application/json' })
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                a.download = `aetherai-config-${new Date().toISOString().slice(0, 10)}.json`
                a.click(); URL.revokeObjectURL(a.href)
              }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                <Download size={12} />导出配置
              </button>
              <button onClick={() => {
                const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
                  try {
                    const bundle = JSON.parse(await file.text())
                    const res = await window.electronAPI.config.import(bundle)
                    if (!res.success) { toast(res.error || '导入失败', { type: 'error' }); return }
                    toast(`导入完成：新增 ${res.created?.providers || 0} 供应商 / ${res.created?.models || 0} 模型 / ${res.created?.personas || 0} 人设`, { type: 'success' })
                    await useStore.getState().loadProviders()
                    await useStore.getState().loadAllModels()
                    await useStore.getState().loadPersonas()
                  } catch { toast('无效的 JSON 文件', { type: 'error' }) }
                }
                input.click()
              }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                <Upload size={12} />导入配置
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
