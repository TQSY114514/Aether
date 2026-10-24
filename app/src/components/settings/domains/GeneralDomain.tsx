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
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {LANGS.map((l) => (
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
              {l.label}
            </button>
          ))}
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
    </div>
  )
}
