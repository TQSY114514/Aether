// ─────────────────────────────────────────────────────────────────────────────
// keymap.js — ink useInput 的 key 对象 → reducer action（纯函数，todo 1）
// 普通可打印字符不进这里（组件层直接走 INPUT 追加）；控制键在此归一。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} [key]  ink v5 useInput 的 key 是布尔标志对象(key.return/ctrl/escape/backspace)，
 *                        兼容旧形态 key.name 字符串(测试与 ink v4 文档写法)。
 * @param {string} [input] ink 的 input 字符串(Ctrl+C 时 input==='c')
 * @returns {{type: string, [k: string]: unknown} | null}
 */
export function keyToAction(key, input) {
  if (!key || typeof key !== 'object') return null
  // 真实终端退格键常发 \x7f(DEL)。ink 把它解析为 key.delete=true 且把 input 置空
  // (nonAlphanumericKeys)——所以必须同时认 backspace 和 delete, 否则表现为"删不了"。
  if (input === '\x7f' || input === '\b') return { type: 'INPUT_BACKSPACE' }
  const isCtrlC = key.ctrl === true && (input === 'c' || key.name === 'c')
  if (isCtrlC) return { type: 'QUIT_INTENT' }
  if (key.return === true || key.enter === true || key.name === 'return' || key.name === 'enter') {
    return { type: 'SUBMIT' }
  }
  if (key.backspace === true || key.name === 'backspace' || key.delete === true || key.name === 'delete') {
    return { type: 'INPUT_BACKSPACE' }
  }
  // 注意: 不用单字母当快捷键(m/q/v 等)——它们会吞掉输入框里的字母。
  // 需要按键的操作用修饰键组合(Alt+m / Alt+v)或斜杠命令(/mode)。
  return null
}
