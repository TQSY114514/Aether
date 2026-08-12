// ─────────────────────────────────────────────────────────────────────────────
// terminal.js — 终端类型检测
// Windows Terminal / VS Code 等现代终端走 ConPTY, ink 差分渲染正常;
// cmd(ConHost)是微软遗留控制台, 对 ANSI 光标定位处理不完整——
// 面板切换残留、抽搐、消息区错位(用户实测)均是其典型症状。
// ─────────────────────────────────────────────────────────────────────────────

/** 检测当前终端类型 */
export function detectTerminal() {
  const env = process.env
  if (env.WT_SESSION) return 'windows-terminal'      // Windows Terminal
  if (env.TERM_PROGRAM === 'vscode') return 'vscode' // VS Code 集成终端
  if (env.TERM_PROGRAM) return env.TERM_PROGRAM      // wezterm/alacritty/...
  if (env.ALACRITTY_WINDOW_ID) return 'alacritty'
  if (env.KITTY_WINDOW_ID) return 'kitty'
  if (env.TERM && /xterm|screen|tmux|linux/.test(env.TERM)) return 'xterm-like'
  return 'conhost' // cmd / PowerShell 旧窗口 / 未知
}

/** 是否为建议使用 Windows Terminal 的遗留控制台 */
export function isLegacyConsole() {
  return detectTerminal() === 'conhost'
}
