// ─────────────────────────────────────────────────────────────────────────────
// featureFlags-hook.test.js — renderer-side snapshot-stability regression
//
// Locks the contract that caused a real startup crash (React error #185,
// "Maximum update depth exceeded"): useSyncExternalStore requires getSnapshot()
// to return a STABLE reference while the store hasn't changed. The old code
// returned `cache ?? []` — a fresh array every call while cache was null
// (pre-IPC-load), which made React believe the store changed every frame and
// re-render infinitely. Verified fix: module-level EMPTY_FLAGS constant.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { _getSnapshotForTest, _resetForTest } from '../src/utils/featureFlags'

describe('featureFlags renderer snapshot (React #185 regression)', () => {
  beforeEach(() => { _resetForTest() })

  it('getSnapshot returns the SAME reference before IPC load (cache=null)', () => {
    const a = _getSnapshotForTest()
    const b = _getSnapshotForTest()
    const c = _getSnapshotForTest()
    // 旧实现 `cache ?? []` 每次返回新数组 → React 判定 store 永远在变 →
    // 无限重渲染 → "Maximum update depth exceeded" 崩溃。引用必须恒等。
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('getSnapshot stays stable across many calls (simulated render loop)', () => {
    const first = _getSnapshotForTest()
    for (let i = 0; i < 1000; i++) {
      expect(_getSnapshotForTest()).toBe(first)
    }
  })
})
