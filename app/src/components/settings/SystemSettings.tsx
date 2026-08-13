import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { Power, Bell, Rocket, Clipboard, FileText } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SystemSettings — Windows 系统集成（Phase 3 剩余项）
// 开机自启开关 + 系统通知测试（任务完成/新消息提醒的基础）。
// ─────────────────────────────────────────────────────────────────────────────
export default function SystemSettings() {
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
        toast(r.enabled ? '已开启开机自启' : '已关闭开机自启', { type: 'success' })
      } else {
        toast(`设置失败: ${r?.error || ''}`, { type: 'error' })
      }
    } catch { toast('设置失败', { type: 'error' }) }
    finally { setBusy(false) }
  }

  const testNotify = async () => {
    try {
      const r = await window.electronAPI?.system?.notify?.({ title: 'Aether 通知', body: '这是一条测试通知 —— 任务完成/新消息提醒将在这里出现。' })
      if (r?.ok) toast('已发送测试通知', { type: 'success' })
      else toast(`通知不可用: ${r?.error || ''}`, { type: 'error' })
    } catch { toast('通知不可用', { type: 'error' }) }
  }

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Rocket size={15} style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>系统集成</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Windows 原生能力：开机自启、系统通知、剪贴板、文件关联。仅桌面形态可用。</p>
      <div className="mb-4 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          💡 <span className="font-medium">终端续会话</span> —— 在侧边栏任意会话悬停, 点终端图标复制{' '}
          <code className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>aether tui --session &lt;id&gt;</code>{' '}
          命令, 在终端粘贴即无缝继续。全局快捷键 <code className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>Ctrl+Alt+A</code> 随时唤出。
        </p>
      </div>

      <div className="space-y-3">
        {/* 开机自启 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Power size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>开机自启</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>登录 Windows 时后台启动（隐藏到托盘），随时 Ctrl+Alt+A 唤起</p>
            </div>
          </div>
          <button onClick={toggleAutoLaunch} disabled={!loaded || busy}
            className="relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50"
            style={{ backgroundColor: autoLaunch ? 'var(--accent)' : 'var(--border)' }}>
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
              style={{ left: autoLaunch ? '20px' : '2px' }} />
          </button>
        </div>

        {/* 系统通知 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Bell size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>系统通知</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>任务完成、新消息提醒。点右侧按钮发送测试通知</p>
            </div>
          </div>
          <button onClick={testNotify}
            className="text-[11px] px-3 py-1.5 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            发送测试通知
          </button>
        </div>

        {/* 剪贴板 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Clipboard size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>剪贴板</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>复制 AI 回复到剪贴板、粘贴外部文本作为上下文</p>
            </div>
          </div>
          <button onClick={async () => {
            try {
              const r = await window.electronAPI?.system?.clipboardWrite?.('Aether 剪贴板测试 —— 粘贴到任意位置验证。')
              toast(r?.ok ? '已复制到剪贴板' : `失败: ${r?.error || ''}`, { type: r?.ok ? 'success' : 'error' })
            } catch { toast('剪贴板不可用', { type: 'error' }) }
          }}
            className="text-[11px] px-3 py-1.5 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            复制测试文本
          </button>
        </div>

        {/* 文件关联 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <FileText size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-primary)' }}>文件关联</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>注册右键「用 Aether 打开」(.cs/.js/.ts/.tsx/.md/.json + 文件夹)。可能需要管理员权限</p>
            </div>
          </div>
          <button onClick={async () => {
            try {
              const r = await window.electronAPI?.system?.registerFileAssociations?.()
              toast(r?.ok ? '文件关联已注册' : `失败: ${r?.error || '需要管理员权限'}`, { type: r?.ok ? 'success' : 'error' })
            } catch { toast('文件关联注册失败', { type: 'error' }) }
          }}
            className="text-[11px] px-3 py-1.5 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            注册文件关联
          </button>
        </div>
      </div>
    </div>
  )
}
