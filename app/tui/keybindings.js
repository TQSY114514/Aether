// ─────────────────────────────────────────────────────────────────────────────
// keybindings.js — 用户键位重绑（对齐 Claude/Codex/Gemini 可配置 keybindings）
// 读取顺序: $AETHER_KEYBINDINGS 指定文件 > ~/.config/aether/keybindings.json
// 格式: { "默认keyId": "新keyId" 或 null(禁用) }
//   keyId 与 keyHandlers.normalizeKey 输出一致:
//   up/down/left/right/pageup/pagedown/enter/esc/tab/shift-tab/backspace/
//   ctrl-c/ctrl-x/ctrl-p/ctrl-n/alt-m/alt-v/alt-up/alt-down/char/char:y ...
// 例: { "shift-tab": "ctrl-t", "char:?": null }  (Shift+Tab 改到 Ctrl+T, 禁用 '?' 帮助)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function loadKeybindings() {
  const candidates = []
  if (process.env.AETHER_KEYBINDINGS) candidates.push(process.env.AETHER_KEYBINDINGS)
  candidates.push(join(homedir(), '.config', 'aether', 'keybindings.json'))
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, 'utf8'))
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
      }
    } catch {
      // 文件损坏 → 忽略, 用默认键位
    }
  }
  return null
}
