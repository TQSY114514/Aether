import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import {
  Info,
  Save,
  Check,
  ImageIcon,
  Trash2,
  Download,
  Upload,
  Copy,
  Plug,
  ChevronLeft,
  DollarSign,
  GitBranch,
  Network as NetworkIcon,
  BookOpen,
  ChevronRight,
  Palette,
  Bot,
  Blocks,
  Wrench,
  Shield,
  Sparkles,
  HardDrive,
  Layers,
} from 'lucide-react'
import { t, LANGS } from '@/utils/i18n'
import McpSettings from '@/components/settings/McpSettings'
import AdvancedSettings from '@/components/settings/AdvancedSettings'
import AgentSettings from '@/components/settings/AgentSettings'
import CustomPolicySettings from '@/components/settings/CustomPolicySettings'
import SystemSettings from '@/components/settings/SystemSettings'
import SkillsSettings from '@/components/settings/SkillsSettings'
import DefaultChatSettings from '@/components/settings/DefaultChatSettings'
import FeatureFlagsSettings from '@/components/settings/FeatureFlagsSettings'
import TokenPage from '@/pages/TokenPage'
import EvolutionPage from '@/pages/EvolutionPage'
import LearningGraphPage from '@/pages/LearningGraphPage'
import SkillsPage from '@/pages/SkillsPage'

// Sub-panels reachable from the "Data & tools" card.
type ToolsPanel = 'tokens' | 'evolution' | 'learning' | 'skills' | null

type SettingsTab = 'general' | 'agent' | 'extensions' | 'advanced'

const TOOLS_ENTRIES: { key: Exclude<ToolsPanel, null>; icon: any; titleKey: string; descKey: string }[] = [
  { key: 'tokens', icon: DollarSign, titleKey: 'settings.tools.tokens', descKey: 'settings.tools.tokens_desc' },
  { key: 'evolution', icon: GitBranch, titleKey: 'settings.tools.evolution', descKey: 'settings.tools.evolution_desc' },
  { key: 'learning', icon: NetworkIcon, titleKey: 'settings.tools.learning', descKey: 'settings.tools.learning_desc' },
  { key: 'skills', icon: BookOpen, titleKey: 'settings.tools.skills', descKey: 'settings.tools.skills_desc' },
]

// "Local Gateway" card — connection info for VS Code / external tools
function GatewayCard() {
  const { toast } = useUI()
  const [info, setInfo] = useState<{ enabled: boolean; port: number; token: string | null; running: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    try { setInfo(await window.electronAPI?.gateway?.info?.()) } catch { setInfo(null) }
  }
  useEffect(() => { refresh() }, [])

  const toggle = async () => {
    if (!info) return
    setBusy(true)
    try { await window.electronAPI?.gateway?.setEnabled?.(!info.enabled); await refresh() } catch {}
    setBusy(false)
  }

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} 已复制`, { type: 'success' }) } catch { toast('复制失败', { type: 'error' }) }
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Plug size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Local Gateway / VS Code 集成</h2>
        </div>
        <button
          onClick={toggle}
          disabled={busy || !info}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-all active:scale-[0.98] ${
            info?.enabled ? 'text-white' : 'border'
          }`}
          style={info?.enabled ? { backgroundColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {info?.enabled ? '已启用' : '已停用'} · {busy ? '…' : '切换'}
        </button>
      </div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        在 VS Code 里安装 Aether 扩展后，填入下面的地址与 Token 即可连接当前桌面 App，复用已配置的模型/记忆/技能。
      </p>
      {info ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>服务地址</span>
            <button
              onClick={() => copy(`http://127.0.0.1:${info.port}`, '地址')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors font-mono active:scale-[0.98]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              http://127.0.0.1:{info.port} <Copy size={11} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>访问 Token</span>
            <button
              onClick={() => info.token && copy(info.token, 'Token')}
              disabled={!info.token}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors font-mono disabled:opacity-40 active:scale-[0.98]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {info.token ? `${info.token.slice(0, 12)}…` : '—'} <Copy size={11} />
            </button>
          </div>
          <div className="text-[11px] font-medium pt-1" style={{ color: info.running ? 'var(--success)' : '#dc2626' }}>
            {info.running ? '● 运行中（仅本机可访问）' : '● 未运行（启用后生效）'}
          </div>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>加载中…</p>
      )}
    </div>
  )
}

// "Check for updates" card
function UpdateCard() {
  const { toast } = useUI()
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [percent, setPercent] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    const off1 = window.electronAPI?.updater?.onUpdateAvailable?.(({ version }) => {
      setNewVersion(version); setStatus(`v${version} 可用`)
    })
    const off2 = window.electronAPI?.updater?.onUpdateDownloaded?.(({ version }) => {
      setDownloaded(true); setPercent(null); setStatus(`v${version} 已下载，重启以安装`)
    })
    const off3 = window.electronAPI?.updater?.onProgress?.(({ percent }) => setPercent(Math.round(percent)))
    const off4 = window.electronAPI?.updater?.onUpToDate?.(() => setStatus('已是最新版本'))
    const off5 = window.electronAPI?.updater?.onError?.(({ message }) => {
      setStatus('检查失败'); setBusy(false); toast(message, { type: 'error' })
    })
    return () => { off1?.(); off2?.(); off3?.(); off4?.(); off5?.() }
  }, [toast])

  const check = async () => {
    setBusy(true); setStatus('检查中…')
    try {
      const r = await window.electronAPI?.updater?.check?.()
      if (r?.error) { setStatus('检查失败'); toast(r.error, { type: 'error' }) }
      else if (r?.updateInfo?.version) { setNewVersion(r.updateInfo.version); setStatus(`v${r.updateInfo.version} 可用`) }
      else if (r?.downloaded) { setDownloaded(true); setStatus('已下载，重启以安装') }
      else { setStatus('已是最新版本') }
    } catch (e: any) { setStatus('检查失败'); toast(e?.message || String(e), { type: 'error' }) }
    finally { setBusy(false) }
  }

  const install = async () => {
    const ok = await window.electronAPI?.updater?.install?.()
    if (!ok) toast('更新尚未下载完成', { type: 'info' })
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Download size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.update.title')}</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {status || t('settings.update.idle')}
              {percent != null && `  ·  ${percent}%`}
            </p>
          </div>
        </div>
        {downloaded ? (
          <button
            onClick={install}
            className="px-3.5 py-1.5 text-xs rounded-md text-white font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('settings.update.restart')}
          </button>
        ) : (
          <button
            onClick={check}
            disabled={busy}
            className="px-3.5 py-1.5 text-xs rounded-md border font-medium hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors active:scale-[0.98]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {busy ? t('settings.update.checking') : t('settings.update.check')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function SettingPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const language = useStore((s) => s.language)
  const theme = useStore((s) => s.theme)
  const fallbackTimeout = useStore((s) => s.fallbackTimeout)
  const setLanguage = useStore((s) => s.setLanguage)
  const setTheme = useStore((s) => s.setTheme)
  const setFallbackTimeout = useStore((s) => s.setFallbackTimeout)
  const sessionBudgetUsd = useStore((s) => s.sessionBudgetUsd)
  const setSessionBudgetUsd = useStore((s) => s.setSessionBudgetUsd)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const backgroundOpacity = useStore((s) => s.backgroundOpacity)
  const backgroundBlur = useStore((s) => s.backgroundBlur)
  const fontScale = useStore((s) => s.fontScale)
  const bubbleWidth = useStore((s) => s.bubbleWidth)
  const defaultEffort = useStore((s) => s.defaultEffort)
  const defaultThinkingEnabled = useStore((s) => s.defaultThinkingEnabled)
  const setBackgroundImage = useStore((s) => s.setBackgroundImage)
  const setBackgroundOpacity = useStore((s) => s.setBackgroundOpacity)
  const setBackgroundBlur = useStore((s) => s.setBackgroundBlur)
  const setFontScale = useStore((s) => s.setFontScale)
  const setBubbleWidth = useStore((s) => s.setBubbleWidth)
  const setDefaultEffort = useStore((s) => s.setDefaultEffort)
  const setDefaultThinkingEnabled = useStore((s) => s.setDefaultThinkingEnabled)

  const [saved, setSaved] = useState(false)
  const [localTimeout, setLocalTimeout] = useState(String(fallbackTimeout))
  const [localBudget, setLocalBudget] = useState(String(sessionBudgetUsd))
  const [toolsPanel, setToolsPanel] = useState<ToolsPanel>(null)
  const { toast } = useUI()

  useEffect(() => { setLocalTimeout(String(fallbackTimeout)) }, [fallbackTimeout])
  useEffect(() => { setLocalBudget(String(sessionBudgetUsd)) }, [sessionBudgetUsd])

  const handleSaveTimeout = async () => {
    const ms = parseInt(localTimeout, 10)
    if (ms > 0 && ms <= 300000) {
      await setFallbackTimeout(ms)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleSaveBudget = async () => {
    const v = parseFloat(localBudget)
    if (!isNaN(v) && v >= 0) {
      await setSessionBudgetUsd(v)
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
    e.target.value = ''
  }

  if (toolsPanel) {
    return (
      <div className="flex-1 flex flex-col min-h-0 page-fade-in" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {/* Sub-panel back bar */}
        <div className="flex items-center gap-3 px-6 py-3 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setToolsPanel(null)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft size={14} />
            <span>{t('settings.tools.back', '返回设置')}</span>
          </button>
          <div className="h-4 w-px bg-[var(--border)]" />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {TOOLS_ENTRIES.find(e => e.key === toolsPanel)?.titleKey
              ? t(TOOLS_ENTRIES.find(e => e.key === toolsPanel)!.titleKey)
              : toolsPanel}
          </span>
        </div>
        {/* Full page view */}
        <div className="flex-1 min-h-0 flex flex-col">
          {toolsPanel === 'tokens' && <TokenPage />}
          {toolsPanel === 'evolution' && <EvolutionPage />}
          {toolsPanel === 'learning' && <LearningGraphPage />}
          {toolsPanel === 'skills' && <SkillsPage />}
        </div>
      </div>
    )
  }

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'general', label: t('settings.tab.general'), icon: Palette },
    { id: 'agent', label: t('settings.tab.agent'), icon: Bot },
    { id: 'extensions', label: t('settings.tab.extensions'), icon: Blocks },
    { id: 'advanced', label: t('settings.tab.advanced'), icon: Wrench },
  ]

  return (
    <div className="flex-1 overflow-y-auto page-fade-in" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Top Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {t('settings.title')}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            配置 Aether 桌面客户端的外观、Agent 运行时能力、外部集成与高级参数
          </p>
        </div>

        {/* Tab Segmented Control */}
        <div
          className="flex items-center gap-1.5 p-1 mb-6 rounded-lg border bg-[var(--bg-secondary)]"
          style={{ borderColor: 'var(--border)' }}
          role="tablist"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-all ${
                  isActive
                    ? 'bg-[var(--content-bg)] shadow-sm font-semibold'
                    : 'hover:bg-[var(--border)]/50'
                }`}
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderColor: isActive ? 'var(--border)' : 'transparent',
                }}
              >
                <Icon size={14} className="shrink-0" style={{ color: isActive ? 'var(--accent)' : 'inherit' }} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab 1: General & Appearance */}
        {activeTab === 'general' && (
          <div className="space-y-5 tab-fade-in">
            {/* Language */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.language')}</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>选择全局界面显示语言</p>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="w-full max-w-xs px-3 py-2 text-xs rounded-md border outline-none cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.native} — {l.label}</option>
                ))}
              </select>
            </div>

            {/* Theme */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.theme')}</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>切换应用整体色彩风格与明暗模式</p>
              <div className="flex gap-2 flex-wrap">
                {(['light', 'auto', 'dark', 'blue', 'glass', 'retro'] as const).map((tKey) => {
                  const isCurrent = theme === tKey
                  return (
                    <button
                      key={tKey}
                      onClick={() => setTheme(tKey)}
                      className="px-3.5 py-2 text-xs rounded-md border font-medium transition-all active:scale-[0.98]"
                      style={{
                        borderColor: isCurrent ? 'var(--accent)' : 'var(--border)',
                        backgroundColor: isCurrent ? 'var(--accent)' : 'var(--bg-primary)',
                        color: isCurrent ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      {t(`settings.theme.${tKey}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Background Image & Opacity/Blur */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.background')}</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.background.desc')}</p>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-16 h-16 rounded-md border shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  {backgroundImage ? (
                    <img src={backgroundImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={20} className="text-zinc-400" />
                  )}
                </div>
                <div className="flex gap-2">
                  <label
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors active:scale-[0.98]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <ImageIcon size={13} />
                    {t('settings.background.upload')}
                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  </label>
                  {backgroundImage && (
                    <button
                      onClick={() => setBackgroundImage(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <Trash2 size={13} />
                      {t('settings.background.clear')}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('settings.background.opacity')}</span>
                    <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{backgroundOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={backgroundOpacity}
                    onChange={(e) => setBackgroundOpacity(parseInt(e.target.value, 10))}
                    className="w-full accent-black dark:accent-white"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('settings.background.blur')}</span>
                    <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{backgroundBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={backgroundBlur}
                    onChange={(e) => setBackgroundBlur(parseInt(e.target.value, 10))}
                    className="w-full accent-black dark:accent-white"
                  />
                </div>
              </div>
            </div>

            {/* Display customization: Font & Bubble width */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.display', '显示排版')}</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>自定义对话气泡最大展示宽度与文本基础缩放</p>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.font_scale', '字体缩放')}</span>
                    <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{(fontScale * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.25}
                    step={0.05}
                    value={fontScale}
                    onChange={(e) => setFontScale(parseFloat(e.target.value))}
                    className="w-full accent-black dark:accent-white"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.bubble_width', '消息气泡最大宽度')}</span>
                    <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{bubbleWidth}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    step={5}
                    value={bubbleWidth}
                    onChange={(e) => setBubbleWidth(parseInt(e.target.value, 10))}
                    className="w-full accent-black dark:accent-white"
                  />
                </div>
              </div>
            </div>

            {/* Windows System Settings */}
            <SystemSettings />
          </div>
        )}

        {/* Tab 2: Chat & Agent */}
        {activeTab === 'agent' && (
          <div className="space-y-5 tab-fade-in">
            {/* Default Chat Settings */}
            <DefaultChatSettings />

            {/* Thinking & Effort */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.default_effort', '默认思考等级')}</h2>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs font-medium" style={{ color: defaultThinkingEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {defaultThinkingEnabled ? t('effort.on', '思考模式开启') : t('effort.off', '思考模式关闭')}
                  </span>
                  <div className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${defaultThinkingEnabled ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                    <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white dark:bg-zinc-900 shadow transition duration-200 ease-in-out mt-[2px] ml-[2px] ${defaultThinkingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <input
                    type="checkbox"
                    checked={defaultThinkingEnabled}
                    onChange={(e) => setDefaultThinkingEnabled(e.target.checked)}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.default_effort_desc')}</p>
              <div className="flex items-center rounded-md border p-1 w-fit gap-1" style={{ borderColor: 'var(--border)', opacity: defaultThinkingEnabled ? 1 : 0.5 }}>
                {(['low', 'medium', 'high'] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setDefaultEffort(e)}
                    disabled={!defaultThinkingEnabled}
                    className={`px-3 py-1 text-xs rounded transition-all active:scale-[0.98] ${
                      defaultEffort === e
                        ? 'bg-[var(--accent)] text-white font-medium'
                        : 'hover:bg-[var(--bg-secondary)]'
                    }`}
                    style={defaultEffort !== e ? { color: 'var(--text-secondary)' } : {}}
                  >
                    {e === 'low' ? t('effort.low') : e === 'medium' ? t('effort.medium') : t('effort.high')}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent Workspace & Safety */}
            <AgentSettings />

            {/* Custom Mode Policy Settings */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Shield size={15} style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.custom_mode', '自定义模式策略')}</h2>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                {t('settings.custom_mode_desc', '配置 Custom 模式下各能力类别的权限级别。Custom 模式需从聊天栏 Agent 模式选择器中切换到 Custom。')}
              </p>
              <CustomPolicySettings />
            </div>

            {/* Advanced Generation & Title Settings */}
            <AdvancedSettings />

            {/* Timeouts & Session Budget Limits */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.advanced', '限额与超时')}</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>设定单次网络请求超时上限与单会话代币消费警戒线</p>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.advanced.timeout')}</span>
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
                        {saved ? <Check size={12} /> : <Save size={12} />}
                        {saved ? t('settings.advanced.saved') : t('settings.advanced.save')}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('settings.advanced.timeout_desc')}</p>
                </div>

                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.advanced.budget')}</span>
                    <div className="flex items-center gap-2">
                      <input
                        value={localBudget}
                        onChange={(e) => setLocalBudget(e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={t('settings.advanced.budget')}
                        className="w-24 px-2 py-1 text-xs rounded-md border outline-none bg-[var(--bg-primary)] text-right font-mono"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                      <button
                        onClick={handleSaveBudget}
                        className="flex items-center gap-1 px-3 py-1 text-xs rounded-md font-medium text-white transition-opacity active:scale-[0.98]"
                        style={{ backgroundColor: 'var(--accent)' }}
                      >
                        {saved ? <Check size={12} /> : <Save size={12} />}
                        {saved ? t('settings.advanced.saved') : t('settings.advanced.save')}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('settings.advanced.budget_desc')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Extensions & Gateway */}
        {activeTab === 'extensions' && (
          <div className="space-y-5 tab-fade-in">
            {/* MCP Servers */}
            <McpSettings />

            {/* Custom Skills */}
            <SkillsSettings />

            {/* Local Gateway / VS Code Integration */}
            <GatewayCard />

            {/* Developer-facing Tools & Panels */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Layers size={15} style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.tools.title')}</h2>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.tools.desc')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TOOLS_ENTRIES.map((entry) => {
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.key}
                      onClick={() => setToolsPanel(entry.key)}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-[var(--bg-secondary)] transition-all text-left active:scale-[0.99]"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
                    >
                      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <Icon size={16} style={{ color: 'var(--accent)' }} />
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t(entry.titleKey)}</span>
                        <span className="block text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{t(entry.descKey)}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: System & Advanced */}
        {activeTab === 'advanced' && (
          <div className="space-y-5 tab-fade-in">
            {/* Software Updates */}
            <UpdateCard />

            {/* Feature Flags */}
            <FeatureFlagsSettings />

            {/* Data Backup & Export/Import */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <HardDrive size={15} style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.data')}</h2>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.data_desc')}</p>
              <div className="flex gap-2.5 flex-wrap">
                <button
                  onClick={async () => {
                    const withSecrets = window.confirm('导出是否包含 API 密钥？\n\n包含密钥的配置文件请妥善保管，避免泄露。默认不含密钥。')
                    const res = await window.electronAPI.config.export({ includeSecrets: withSecrets })
                    if (!res.success || !res.bundle) return
                    const blob = new Blob([JSON.stringify(res.bundle, null, 2)], { type: 'application/json' })
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                    a.download = `aetherai-config-${new Date().toISOString().slice(0, 10)}.json`
                    a.click(); URL.revokeObjectURL(a.href)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <Download size={13} />导出配置
                </button>
                <button
                  onClick={() => {
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
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <Upload size={13} />导入配置
                </button>
              </div>
            </div>

            {/* About & Feature Badges (Anti-AI slop: no emoji) */}
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              <div className="flex items-start gap-3 mb-3">
                <Info size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                <div>
                  <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.about')}</h2>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {t('settings.about_desc', 'v0.9.0')}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.features')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['providers', 'chat', 'persona', 'arena', 'route'].map(k => (
                    <div
                      key={k}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    >
                      <Check size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{t(`settings.feature.${k}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
