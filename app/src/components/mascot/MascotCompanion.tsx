import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { useFeatureFlag } from '@/utils/featureFlags'
import {
  getMascotPokeKey,
  MASCOT_IDLE_TIMEOUT_MS,
  resolveMascotState,
  type MascotState,
} from '@/utils/mascotState'
import { t } from '@/utils/i18n'
import avatarReady from '@/assets/mascot/avatar-ready.webp'
import avatarWorking from '@/assets/mascot/avatar-working.webp'
import avatarSleeping from '@/assets/mascot/avatar-sleeping.webp'
import avatarAlert from '@/assets/mascot/avatar-alert.webp'

const AVATAR_BY_STATE: Record<MascotState, string> = {
  ready: avatarReady,
  working: avatarWorking,
  sleeping: avatarSleeping,
  alert: avatarAlert,
}

const STATE_LABEL_KEY: Record<MascotState, string> = {
  ready: 'mascot.state.ready',
  working: 'mascot.state.working',
  sleeping: 'mascot.state.sleeping',
  alert: 'mascot.state.alert',
}

export interface MascotCompanionProps {
  compact?: boolean
}

/** Optional framed illustration mascot companion mounted in the sidebar footer. */
export default function MascotCompanion({ compact = false }: MascotCompanionProps) {
  const enabled = useFeatureFlag('ux.mascotCompanion', false)
  const needsInput = useStore(
    (s) => s.pendingQuestions.length > 0 || s.permissionRequests.length > 0
  )
  const isWorking = useStore(
    (s) =>
      s.sending ||
      Object.keys(s.streamingBySession).some((id) => Boolean(s.streamingBySession[Number(id)]))
  )
  const setCurrentView = useStore((s) => s.setCurrentView)

  const [isIdle, setIsIdle] = useState(false)
  const [poked, setPoked] = useState(false)
  const [activityTick, setActivityTick] = useState(0)
  const pokeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (isWorking || needsInput) {
      setIsIdle(false)
      return
    }
    setIsIdle(false)
    const timer = window.setTimeout(() => setIsIdle(true), MASCOT_IDLE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [enabled, isWorking, needsInput, activityTick])

  useEffect(() => {
    return () => {
      if (pokeTimerRef.current !== null) {
        window.clearTimeout(pokeTimerRef.current)
      }
    }
  }, [])

  if (!enabled) return null

  const state = resolveMascotState({ needsInput, isWorking, isIdle, poked })
  const avatarSrc = AVATAR_BY_STATE[state]
  const stateLabel = t(STATE_LABEL_KEY[state])
  const pokeMessage = t(getMascotPokeKey(state))

  const handleClick = () => {
    if (state === 'alert') {
      setCurrentView('chat')
    }
    setIsIdle(false)
    setPoked(true)
    setActivityTick((n) => n + 1)
    if (pokeTimerRef.current !== null) {
      window.clearTimeout(pokeTimerRef.current)
    }
    pokeTimerRef.current = window.setTimeout(() => {
      setPoked(false)
      pokeTimerRef.current = null
    }, 3200)
  }

  const borderColor =
    state === 'alert'
      ? 'var(--warning)'
      : state === 'working'
        ? 'var(--accent)'
        : 'var(--border)'

  const dotColor =
    state === 'alert'
      ? 'var(--warning)'
      : state === 'working'
        ? 'var(--accent)'
        : 'var(--text-muted)'

  const dotClass =
    state === 'working'
      ? 'w-2 h-2 rounded-full border animate-pulse motion-reduce:animate-none'
      : 'w-2 h-2 rounded-full border'

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Aether · ${stateLabel}`}
        aria-label={`Aether · ${stateLabel}`}
        className="relative w-8 h-8 rounded-[6px] border overflow-hidden shrink-0 transition-colors active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer hover:bg-[var(--content-bg)]"
        style={{ borderColor, backgroundColor: 'var(--bg-primary)' }}
      >
        <img
          src={avatarSrc}
          alt=""
          draggable={false}
          className={`w-full h-full object-cover object-top ${state === 'sleeping' ? 'opacity-80' : ''}`}
        />
        <span
          className={`absolute right-0.5 bottom-0.5 ${dotClass}`}
          style={{ backgroundColor: dotColor, borderColor: 'var(--bg-primary)' }}
        />
      </button>
    )
  }

  return (
    <div className="px-2 pb-1.5 pt-1 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        title={`Aether · ${stateLabel}`}
        aria-label={`Aether · ${stateLabel}`}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] border text-left transition-colors active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer hover:bg-[var(--content-bg)]"
        style={{ borderColor, backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="relative w-8 h-8 rounded-[6px] overflow-hidden border shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <img
            src={avatarSrc}
            alt=""
            draggable={false}
            className={`w-full h-full object-cover object-top ${state === 'sleeping' ? 'opacity-80' : ''}`}
          />
          <span
            className={`absolute right-0.5 bottom-0.5 ${dotClass}`}
            style={{ backgroundColor: dotColor, borderColor: 'var(--bg-primary)' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5 leading-tight">
            <span className="text-[11.5px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              Aether
            </span>
            <span
              className="text-[10px] font-mono shrink-0"
              style={{
                color:
                  state === 'alert'
                    ? 'var(--warning)'
                    : state === 'working'
                      ? 'var(--accent)'
                      : 'var(--text-muted)',
              }}
            >
              {stateLabel}
            </span>
          </div>
          <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {poked ? pokeMessage : 'Plan · Act · Observe · Verify'}
          </p>
        </div>
      </button>
    </div>
  )
}
