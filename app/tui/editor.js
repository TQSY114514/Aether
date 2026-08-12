// ─────────────────────────────────────────────────────────────────────────────
// editor.js — W3-t20: 外部编辑器纯助手（Electron-free, 无新依赖）
//   resolveEditorCommand(env)   $EDITOR > $VISUAL > notepad.exe 回退;
//                              EDITOR 按空白切分（限制: 含空格引号路径不支持,
//                              文档写明; 有这类需求用短路径或环境变量别名）
//   editorTempPath(ts)          os.tmpdir()/aether-prompt-<ts>.txt
//   readEditorResult(file)      读回编辑结果; 失败 → null
//   spawnEditor(cmd, file)      直接 spawn 编辑器（detached, 不包 cmd /c start）
//
// 等待语义实测结论（2026-08, Windows 10.0.26200 / Node 24）:
//   A) 直接 spawn('notepad.exe', [file]) —— 实测进程句柄存活整个编辑会话,
//      'close' 仅在用户关闭 notepad 后触发（taskkill 前 10s 仍存活）。结论:
//      本机不需要 'cmd /c start /wait' 包装, 直接 spawn + close 等待即可。
//   B) 'cmd /c start "" /wait <exe> <file>' 包装 —— 在本机测试环境下挂起
//      （start 创建新窗口在非交互会话中不返回; 且会残留孤儿 cmd 进程）。
//      因此弃用 start /wait, 采用 A 方案 + App 层"快速退出→短轮询"防御兜底
//      （覆盖其他机器上 notepad 立即返回的情形: close<800ms 且内容未变时
//      轮询 mtime 至多 10s）。
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/**
 * 解析编辑器命令。$EDITOR 优先, 其次 $VISUAL, 回退 notepad.exe。
 * @param {object} [env]  默认 process.env（测试可注入）
 * @returns {string[]}   [可执行文件, ...参数]（exe 在首位）
 */
export function resolveEditorCommand(env = process.env) {
  const raw = (env && (env.EDITOR || env.VISUAL) || '').trim()
  if (!raw) return ['notepad.exe']
  // 按空白切分（限制: 含空格的带引号路径不解析——文档写明, 保持简单）
  return raw.split(/\s+/).filter(Boolean)
}

/**
 * 临时编辑文件路径。
 * @param {number} [ts]
 * @returns {string}
 */
export function editorTempPath(ts = Date.now()) {
  return join(tmpdir(), `aether-prompt-${ts}.txt`)
}

/**
 * 读回编辑结果; 文件不存在/不可读 → null（调用方按"取消"处理）。
 * @param {string} file
 * @returns {string | null}
 */
export function readEditorResult(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * 直接 spawn 编辑器进程（detached: 不占用 TUI 终端; TUI 保持响应）。
 * @param {string[]} editorCmd  [exe, ...args]（空 → notepad.exe）
 * @param {string} file
 * @returns {{ child: import('node:child_process').ChildProcess, wait: Promise<void> }}
 *   wait 在编辑器进程退出（close）后 resolve; spawn 失败也 resolve（不悬挂）。
 */
export function spawnEditor(editorCmd, file) {
  const [exe, ...args] = editorCmd && editorCmd.length ? editorCmd : ['notepad.exe']
  const child = spawn(exe, [...args, file], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  })
  const wait = new Promise((resolve) => {
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })
  return { child, wait }
}
