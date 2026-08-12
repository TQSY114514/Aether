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
  // Shift+Enter: 插入换行而非提交（todo 5 多行输入）
  if (key.shift === true && (key.return === true || key.enter === true || key.name === 'return' || key.name === 'enter')) {
    return { type: 'INPUT', value: '\n' }
  }
  if (key.return === true || key.enter === true || key.name === 'return' || key.name === 'enter') {
    return { type: 'SUBMIT' }
  }
  if (key.backspace === true || key.name === 'backspace' || key.delete === true || key.name === 'delete') {
    return { type: 'INPUT_BACKSPACE' }
  }
  // 光标编辑键（todo 4; --smoke 状态机与 keyToAction 测试共用此归一）
  const ctrl = key.ctrl === true
  if (ctrl && input === 'w') return { type: 'INPUT_WORD_BACKWARD' }
  if (ctrl && input === 'u') return { type: 'INPUT_CLEAR_LINE' }
  if (ctrl && input === 'k') return { type: 'INPUT_TO_LINE_END' }
  if (ctrl && input === 'a') return { type: 'INPUT_LINE_HOME' }
  if (ctrl && input === 'e') return { type: 'INPUT_LINE_END' }
  if (key.leftArrow === true) return { type: 'INPUT_LEFT' }
  if (key.rightArrow === true) return { type: 'INPUT_RIGHT' }
  if (key.home === true) return { type: 'INPUT_HOME' }
  if (key.end === true) return { type: 'INPUT_END' }
  // 注意: 不用单字母当快捷键(m/q/v 等)——它们会吞掉输入框里的字母。
  // 需要按键的操作用修饰键组合(Alt+m / Alt+v)或斜杠命令(/mode)。
  return null
}
