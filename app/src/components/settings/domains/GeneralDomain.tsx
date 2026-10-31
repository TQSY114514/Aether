import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import {
  Download,
  Check,
  ImageIcon,
  Trash2,
  Upload,
  Palette,
  Sparkles,
  HardDrive,
  ChevronDown,
  Power,
  Bell,
  Rocket,
} from 'lucide-react'
import { t, LANGS } from '@/utils/i18n'

export function UpdateCard() {
  const { toast } = useUI()
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [percent, setPercent] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    const off1 = window.electronAPI?.updater?.onUpdateAvailable?.(({ version }) => {
      setNewVersion(version)
      setStatus(`v${version} 可用`)
    })
    const off2 = window.electronAPI?.updater?.onUpdateDownloaded?.(({ version }) => {
      setDownloaded(true)
      setPercent(null)
      setStatus(`v${version} 已下载，重启以安装`)
    })
    const off3 = window.electronAPI?.updater?.onProgress?.(({ percent }) => setPercent(Math.round(percent)))
    const off4 = window.electronAPI?.updater?.onUpToDate?.(() => setStatus('已是最新版本'))
    const off5 = window.electronAPI?.updater?.onError?.(({ message }) => {
      setStatus('检查失败')
      setBusy(false)
      toast(message, { type: 'error' })
    })
    return () => {
      off1?.()
      off2?.()
      off3?.()
      off4?.()
      off5?.()
    }
  }, [toast])

  const check = async () => {
    setBusy(true)
    setStatus('检查中…')
    try {
      const r = await window.electronAPI?.updater?.check?.()
      if (r?.error) {
        setStatus('检查失败')
        toast(r.error, { type: 'error' })
      } else if (r?.updateInfo?.version) {
        setNewVersion(r.updateInfo.version)
        setStatus(`v${r.updateInfo.version} 可用`)
      } else if (r?.downloaded) {
        setDownloaded(true)
        setStatus('已下载，重启以安装')
      } else {
        setStatus('已是最新版本')
      }
    } catch (e: any) {
      setStatus('检查失败')
      toast(e?.message || String(e), { type: 'error' })
    } finally {
      setBusy(false)
    }
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
              {percent != null && ` · ${percent}%`}
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

export default function GeneralDomain() {
  const language = useStore((s) => s.language)
  const theme = useStore((s) => s.theme)
  const setLanguage = useStore((s) => s.setLanguage)
  const setTheme = useStore((s) => s.setTheme)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const backgroundOpacity = useStore((s) => s.backgroundOpacity)
  const backgroundBlur = useStore((s) => s.backgroundBlur)
  const fontScale = useStore((s) => s.fontScale)
  const bubbleWidth = useStore((s) => s.bubbleWidth)
  const setBackgroundImage = useStore((s) => s.setBackgroundImage)
  const setBackgroundOpacity = useStore((s) => s.setBackgroundOpacity)
  const setBackgroundBlur = useStore((s) => s.setBackgroundBlur)
  const setFontScale = useStore((s) => s.setFontScale)
  const setBubbleWidth = useStore((s) => s.setBubbleWidth)

  const [showAllLangs, setShowAllLangs] = useState(language !== 'zh-CN' && language !== 'en')
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

  return (
    <div className="space-y-4">
      {/* Updates Card */}
      <UpdateCard />

      {/* Language */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.language')}</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.language_desc')}</p>
        
        {/* Tier 1 Primary Languages */}
        <div className="mb-3">
          <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('settings.language_primary')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {LANGS.filter(l => (l.code as string) === 'zh-CN' || (l.code as string) === 'en').map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code as any)}
                className={`px-3 py-2 text-xs rounded-md border text-center transition-all active:scale-[0.98] ${
                  language === l.code
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white font-medium shadow-xs'
                    : 'hover:bg-[var(--bg-secondary)]'
                }`}
                style={language !== l.code ? { borderColor: 'var(--border)', color: 'var(--text-primary)' } : {}}
              >
                <span className="font-semibold block">{l.native}</span>
                <span className="text-[10px] block opacity-80">{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* More Languages (Community / Auto-generated) */}
        <div>
          <button
            onClick={() => setShowAllLangs(v => !v)}
            className="flex items-center gap-1 text-[11px] hover:underline mb-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>{t('settings.language_more')}</span>
            <ChevronDown size={12} className={`transition-transform ${showAllLangs ? 'rotate-180' : ''}`} />
          </button>
          {showAllLangs && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
              {LANGS.filter(l => (l.code as string) !== 'zh-CN' && (l.code as string) !== 'en').map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code as any)}
                  className={`px-2 py-1.5 text-xs rounded-md border text-center transition-all ${
                    language === l.code
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white font-medium shadow-xs'
                      : 'hover:bg-[var(--bg-secondary)]'
                  }`}
                  style={language !== l.code ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : {}}
                >
                  {l.native}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Palette size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.theme')}</h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.theme_desc')}</p>
        <div className="flex items-center gap-2">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className={`px-3.5 py-1.5 text-xs rounded-md border font-medium capitalize transition-all active:scale-[0.98] ${
                theme === mode
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'hover:bg-[var(--bg-secondary)]'
              }`}
              style={theme !== mode ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : {}}
            >
              {t(`theme.${mode}` as any, mode)}
            </button>
          ))}
        </div>
      </div>

      {/* Font & Bubble Size */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.typography', '排版与间距')}</h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>调整正文字号与对话气泡宽度</p>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-primary)' }}>{t('settings.font_scale', '正文字号缩放')}</span>
              <span className="tabular-nums font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{fontScale}x</span>
            </div>
            <input
              type="range"
              min="0.85"
              max="1.25"
              step="0.05"
              value={fontScale}
              onChange={(e) => setFontScale(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[var(--border)]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-primary)' }}>{t('settings.bubble_width', '消息气泡最大宽度')}</span>
              <span className="tabular-nums font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{bubbleWidth}%</span>
            </div>
            <input
              type="range"
              min="60"
              max="100"
              step="5"
              value={bubbleWidth}
              onChange={(e) => setBubbleWidth(parseInt(e.target.value, 10))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[var(--border)]"
            />
          </div>
        </div>
      </div>

      {/* Background Image Customization */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <ImageIcon size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.background')}</h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.background_desc')}</p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Upload size={13} />
            <span>{t('settings.bg_upload')}</span>
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>
          {backgroundImage && (
            <button
              onClick={() => setBackgroundImage(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors active:scale-[0.98]"
              style={{ borderColor: 'var(--border)' }}
            >
              <Trash2 size={13} />
              <span>{t('settings.bg_remove')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Windows Native Integration */}
      <WindowsIntegrationCard />

      {/* Configuration Backup & Restore */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <HardDrive size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.backup_title', '配置备份与恢复')}</h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('settings.backup_desc', '备份或导入模型提供商、自定义模型与智能体人设配置')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                const data = await window.electronAPI.config.export({ includeSecrets: false })
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `aether-config-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)
                useStore.getState().triggerToast(t('settings.export_success', '配置导出成功'), 'success')
              } catch (e: any) {
                useStore.getState().triggerToast(t('settings.export_failed', '导出失败') + ': ' + (e?.message || e), 'error')
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <Download size={13} />
            <span>{t('settings.export_config', '导出配置 (JSON)')}</span>
          </button>
          <label
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Upload size={13} />
            <span>{t('settings.import_config', '导入配置…')}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const text = await file.text()
                  const json = JSON.parse(text)
                  const res = await window.electronAPI.config.import(json)
                  if (res?.success) {
                    useStore.getState().triggerToast(t('settings.import_success', '配置导入成功'), 'success')
                  } else {
                    useStore.getState().triggerToast(t('settings.import_failed', '导入失败') + ': ' + (res?.error || '未知错误'), 'error')
                  }
                } catch (err: any) {
                  useStore.getState().triggerToast(t('settings.import_failed', '导入失败') + ': ' + (err?.message || err), 'error')
                }
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  )
}

export function WindowsIntegrationCard() {
  const { toast } = useUI()
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      window.electronAPI?.system?.getAutoLaunch?.().then((r) => {
        setAutoLaunch(!!r?.enabled)
        setLoaded(true)
      }).catch(() => { setLoaded(true) })
    } catch { setLoaded(true) }
  }, [])

  const toggleAutoLaunch = async () => {
    setBusy(true)
    try {
      const r = await window.electronAPI?.system?.setAutoLaunch?.(!autoLaunch)
      if (r?.ok) {
        setAutoLaunch(!!r.enabled)
        toast(r.enabled ? t('settings.auto_launch_enabled', '已开启开机自启') : t('settings.auto_launch_disabled', '已关闭开机自启'), { type: 'success' })
      } else {
        toast(`${t('settings.set_failed', '设置失败')}: ${r?.error || ''}`, { type: 'error' })
      }
    } catch { toast(t('settings.set_failed', '设置失败'), { type: 'error' }) }
    finally { setBusy(false) }
  }

  const testNotify = async () => {
    try {
      const r = await window.electronAPI?.system?.notify?.({
        title: 'Aether',
        body: t('settings.notify_sample', '这是一条测试通知 —— 任务完成/新消息提醒将在这里出现。')
      })
      if (r?.ok) toast(t('settings.notify_sent', '已发送测试通知'), { type: 'success' })
      else toast(`${t('settings.notify_unavailable', '通知不可用')}: ${r?.error || ''}`, { type: 'error' })
    } catch { toast(t('settings.notify_unavailable', '通知不可用'), { type: 'error' }) }
  }

  return (
    <div className="rounded-lg p-4 border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Rocket size={15} style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {t('settings.windows_integration', '系统集成')}
        </h2>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        {t('settings.windows_integration_desc', 'Windows 原生能力：开机自启、系统通知。仅桌面形态可用。')}
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Power size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('settings.auto_launch', '开机自启')}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t('settings.auto_launch_desc', '登录 Windows 时后台启动（隐藏到托盘），随时通过快捷键唤起')}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoLaunch}
            onClick={toggleAutoLaunch}
            disabled={!loaded || busy}
            className="relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ backgroundColor: autoLaunch ? 'var(--accent)' : 'var(--border)' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-xs"
              style={{ left: autoLaunch ? '22px' : '2px' }}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start gap-2">
            <Bell size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('settings.notify_test', '系统通知测试')}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t('settings.notify_test_desc', '向 Windows 桌面发送一条原生通知，验证通知中心集成')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={testNotify}
            className="px-2.5 py-1 text-xs rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {t('settings.send_test', '发送测试')}
          </button>
        </div>
      </div>
    </div>
  )
}
