import { useState, useEffect } from 'react'
import { t } from '@/utils/i18n'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useUI } from '@/components/ui/feedback'

export default function FeatureFlagsSettings() {
  const { toast } = useUI()
  const [flags, setFlags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadFlags = async () => {
    try {
      const list = await window.electronAPI.flags.list()
      setFlags(list)
    } catch (e) {
      console.error('Failed to load flags:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFlags()
    
    const unsubs = [
      window.electronAPI.flags.onChanged(() => {
        loadFlags()
      })
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  const toggleFlag = async (key: string, value: boolean) => {
    try {
      await window.electronAPI.flags.set(key, value)
    } catch (e) {
      console.error('Failed to toggle flag:', e)
      toast('Failed to toggle flag', { type: 'error' })
    }
  }

  const applySafeMode = async () => {
    try {
      const res = await window.electronAPI.flags.safeMode()
      if (res.ok) {
        toast('Safe Mode Applied (All experimental features disabled)', { type: 'success' })
      }
    } catch (e) {
      console.error('Failed to apply safe mode:', e)
      toast('Failed to apply safe mode', { type: 'error' })
    }
  }

  const applyFullMode = async () => {
    if (!confirm('Warning: Enabling all experimental features may lead to unstable behavior. Proceed?')) return
    try {
      // Set all flags to true
      let count = 0
      for (const f of flags) {
        if (!f.enabled) {
          await window.electronAPI.flags.set(f.key, true)
          count++
        }
      }
      if (count > 0) {
        toast(`Full Mode Applied (Enabled ${count} features)`, { type: 'success' })
        loadFlags()
      } else {
        toast('All features are already enabled', { type: 'info' })
      }
    } catch (e) {
      console.error('Failed to apply full mode:', e)
      toast('Failed to apply full mode', { type: 'error' })
    }
  }

  if (loading) return null

  // Group by category
  const grouped: Record<string, any[]> = {}
  for (const f of flags) {
    if (!grouped[f.category]) grouped[f.category] = []
    grouped[f.category].push(f)
  }

  return (
    <>
      <div className="rounded-xl p-4 mb-4" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle size={14} className="text-orange-500" />
              Feature Flags (Experimental)
            </h2>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Toggling these flags can change Aether's behavior significantly. Experimental features may be unstable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={applyFullMode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border hover:bg-[var(--bg-tertiary)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              完整模式
            </button>
            <button onClick={applySafeMode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border hover:bg-[var(--bg-tertiary)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <ShieldCheck size={14} className="text-green-600" />
              安全模式
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
              {cat}
            </h3>
            <div className="space-y-4">
              {list.map(f => (
                <label key={f.key} className="flex items-start justify-between cursor-pointer group">
                  <div className="pr-4">
                    <span className="text-sm font-mono block mb-1" style={{ color: 'var(--text-primary)' }}>
                      {f.key}
                    </span>
                    <span className="text-[11px] block leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {f.description}
                    </span>
                  </div>
                  <input type="checkbox" checked={f.enabled} onChange={(e) => toggleFlag(f.key, e.target.checked)}
                    className="mt-1 w-4 h-4 accent-black shrink-0 cursor-pointer" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
