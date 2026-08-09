// ─────────────────────────────────────────────────────────────────────────────
// keymap.js — ink useInput 的 key 对象 → reducer action（纯函数，todo 1）
// 普通可打印字符不进这里（组件层直接走 INPUT 追加）；控制键在此归一。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{name?: string, ctrl?: boolean, backspace?: boolean}} [key]
 * @returns {{type: string, [k: string]: unknown} | null}
 */
export function keyToAction(key) {
  if (!key || typeof key !== 'object') return null
  if (key.ctrl && key.name === 'c') return { type: 'QUIT_INTENT' }
  if (key.name === 'return' || key.name === 'enter') return { type: 'SUBMIT' }
  if (key.backspace) return { type: 'INPUT_BACKSPACE' }
  if (key.name === 'm') return { type: 'MODE_CYCLE' }
  return null
}
