// ─────────────────────────────────────────────────────────────────────────────
// wheel.js — SGR 1006 滚轮按钮码 → 垂直滚动方向（纯函数, W0-t8）
//
// 编码验证（xterm ctlseqs「Wheel mice」+ Windows Terminal 同款）:
//   CSI < Cb ; Cx ; Cy M|m   — Cb 低 5 位是按钮码:
//     4 → 64  滚轮上（WheelUp）     5 → 65  滚轮下（WheelDown）
//     6 → 66  滚轮左（横向）        7 → 67  滚轮右（横向）
//   Shift 修饰 +4（68/69）; Alt +8; Ctrl +16
//   滚轮只发 'M'（按下）不发 'm'（释放）——剥离层(index.mjs)对 M/m 同等剥离
//
// 注意: 66/67 是横向滚轮（xterm 不产生该事件, 无对应 X 事件）——本 TUI 只有
// 垂直消息区, 一律忽略返回 0; 不按「66/67=滚轮下」的直觉猜测映射（会反向）。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SGR 按钮码 → 垂直滚动方向: 滚轮上/Shift+上 → +1（向旧消息）, 滚轮下 → -1, 其他 0。
 * 畸形输入（NaN/负数/非整数/字符串垃圾）安全返回 0, 不抛错。
 * @param {number|string} buttonCode
 * @returns {number} -1 | 0 | 1
 */
export function wheelDelta(buttonCode) {
  const b = Number(buttonCode)
  if (!Number.isInteger(b) || b < 0) return 0
  if (b === 64 || b === 68) return 1   // 滚轮上 / Shift+滚轮上
  if (b === 65 || b === 69) return -1  // 滚轮下 / Shift+滚轮下
  return 0                             // 66/67 横向, 0-3 按键, 72/73/80/81 修饰组合
}
