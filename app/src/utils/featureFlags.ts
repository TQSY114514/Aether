// ───────────────────────────────────────────────────────────────────────────
// Renderer-side feature-flag helpers (Phase 0 infrastructure).
//
// Thin layer over window.electronAPI.flags with a cached snapshot and a
// useFeatureFlag() hook that re-renders when a flag flips (via flags:changed).
// Also exports getFeatureFlag() for non-hook call sites.
// ───────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react'

export interface FeatureFlagEntry {
  key: string
  default: boolean
  value: string | null
  enabled: boolean
  category: string
  description: string
}

// ─── Snapshot store (useSyncExternalStore-compatible) ───────────────────────

// ⚠️ useSyncExternalStore 硬性要求: getSnapshot 必须返回稳定引用——
// 否则 React 判定 store 每帧都在变 → 无限重渲染 → "Maximum update depth
// exceeded" (React error #185, 实测崩溃)。cache 为 null(初始/加载失败)时
// 必须返回同一个 EMPTY_FLAGS 常量, 绝不能 `?? []`(每次新数组 = 不稳定引用)。
const EMPTY_FLAGS: FeatureFlagEntry[] = []

let cache: FeatureFlagEntry[] | null = null
const listeners = new Set<() => void>()

function emitChange() {
  for (const l of listeners) l()
}

async function refresh() {
  try {
    cache = (await window.electronAPI.flags.list()) as FeatureFlagEntry[]
  } catch {
    cache = null
  }
  emitChange()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // Re-sync from main when a flag changes.
  const unsub = window.electronAPI.flags.onChanged(() => { void refresh() })
  return () => {
    listeners.delete(cb)
    unsub()
  }
}

function getSnapshot(): FeatureFlagEntry[] {
  return cache ?? EMPTY_FLAGS
}

// Internal: exposed for regression tests. Contract: consecutive calls MUST
// return the same reference while the store hasn't changed — a violation here
// is exactly what causes React error #185 ("Maximum update depth exceeded").
export const _getSnapshotForTest = getSnapshot
export const _resetForTest = () => {
  cache = null
  started = false
}

// Trigger an initial load exactly once.
let started = false
function ensureLoaded() {
  if (!started) {
    started = true
    void refresh()
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

// Current snapshot of all flags (may be empty before the first load resolves).
export function getFeatureFlags(): FeatureFlagEntry[] {
  ensureLoaded()
  return getSnapshot()
}

// Effective value of one flag. Unknown flags / pre-load resolve to `fallback`.
export function getFeatureFlag(key: string, fallback = false): boolean {
  ensureLoaded()
  const entry = (cache ?? EMPTY_FLAGS).find(f => f.key === key)
  return entry ? entry.enabled : fallback
}

// React hook: re-renders the component when the flag's value changes.
export function useFeatureFlag(key: string, fallback = false): boolean {
  ensureLoaded()
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const entry = snapshot.find(f => f.key === key)
  return entry ? entry.enabled : fallback
}

// Toggle a flag through main; the flags:changed event refreshes the cache.
export async function setFeatureFlag(key: string, value: boolean | string): Promise<boolean> {
  const result = await window.electronAPI.flags.set(key, value)
  if (result.ok) await refresh()
  return !!result.ok
}

// Read a flag once without subscribing (safe outside React components).
export function useFlagsList(): FeatureFlagEntry[] {
  ensureLoaded()
  return useSyncExternalStore(subscribe, getSnapshot)
}

export default useFeatureFlag
