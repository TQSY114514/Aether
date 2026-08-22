// ───────────────────────────────────────────────────────────────────────────
// Sliding-window no-progress detector (OpenClaw tool-loop-detection.ts,
// generic_repeat + global_circuit_breaker subset).
//
// Thresholds are deliberately HARDCODED (OpenClaw #111382): keeping every
// admission path on the same built-in threshold so policy rewrites cannot
// drift from detection. Do not expose these as settings.
//
// Scope note: this is the trailing-streak detector only. ping-pong / poll /
// argument-churn detectors from OpenClaw are out of scope (YAGNI until data
// shows we need them — see toolLoopMetrics.js for future telemetry).
//
// veto 语义：veto 记录永不触发 block（模型对警告做出反应的重试本身长得像
// 重复），但 streak 继续累计——若模型无视警告继续空转，最终仍会到达 warn。
// ───────────────────────────────────────────────────────────────────────────

const WINDOW_SIZE = 30   // matches OpenClaw toolCallHistory window
const WARN_STREAK = 10   // warn threshold
const BLOCK_STREAK = 20  // block threshold

class LoopGuard {
  constructor() { this.history = [] }

  record({ toolName, argsHash, resultHash, veto = false }) {
    this.history.push({ toolName, argsHash, resultHash, veto })
    if (this.history.length > WINDOW_SIZE) this.history.shift()
  }

  // Trailing run of identical (toolName, argsHash, resultHash).
  evaluate() {
    const h = this.history
    if (h.length === 0) return { action: 'ok', streak: 0 }
    const last = h[h.length - 1]
    let streak = 0
    for (let i = h.length - 1; i >= 0; i--) {
      const e = h[i]
      if (e.toolName === last.toolName && e.argsHash === last.argsHash && e.resultHash === last.resultHash) streak++
      else break
    }
    let action = 'ok'
    if (streak >= BLOCK_STREAK && !last.veto) action = 'block'
    else if (streak >= WARN_STREAK) action = 'warn'
    return { action, streak }
  }
}

module.exports = { LoopGuard, WINDOW_SIZE, WARN_STREAK, BLOCK_STREAK }
