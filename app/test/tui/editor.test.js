// ─────────────────────────────────────────────────────────────────────────────
// editor.test.js — W3-t20: 外部编辑器纯助手单测
// resolveEditorCommand（env 注入）/ editorTempPath 形状 / readEditorResult。
// spawnEditor 的真实 GUI 等待语义已在 App.mjs 注释记录实测结论
// （本机直接 spawn notepad 不立即返回; start /wait 在非交互会话挂起——弃用）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveEditorCommand, editorTempPath, readEditorResult } from '../../tui/editor.js'

const tmpDirs = []
function makeTmp(prefix = 'editor-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('resolveEditorCommand — EDITOR/VISUAL 解析与回退', () => {
  it('无 EDITOR/VISUAL → notepad.exe 回退', () => {
    expect(resolveEditorCommand({})).toEqual(['notepad.exe'])
    expect(resolveEditorCommand({ PATH: 'C:\\x' })).toEqual(['notepad.exe'])
  })

  it('$EDITOR 优先于 $VISUAL', () => {
    expect(resolveEditorCommand({ EDITOR: 'code --wait', VISUAL: 'vim' })).toEqual(['code', '--wait'])
  })

  it('无 EDITOR 时 $VISUAL 生效', () => {
    expect(resolveEditorCommand({ VISUAL: 'nvim' })).toEqual(['nvim'])
  })

  it('按空白切分（含参数）; 空串 env 值 → 回退', () => {
    expect(resolveEditorCommand({ EDITOR: 'C:\\tools\\my-editor.exe --wait' })).toEqual(['C:\\tools\\my-editor.exe', '--wait'])
    expect(resolveEditorCommand({ EDITOR: '   ' })).toEqual(['notepad.exe'])
    expect(resolveEditorCommand({ EDITOR: '' })).toEqual(['notepad.exe'])
  })
})

describe('editorTempPath — 临时文件路径形状', () => {
  it('在 os.tmpdir() 下, aether-prompt-<ts>.txt', () => {
    const p = editorTempPath(12345)
    expect(p).toBe(join(tmpdir(), 'aether-prompt-12345.txt'))
    expect(p.startsWith(tmpdir())).toBe(true)
  })

  it('默认 ts 为当前时间（可生成）', () => {
    expect(editorTempPath()).toMatch(/aether-prompt-\d+\.txt$/)
  })
})

describe('readEditorResult — 读回结果', () => {
  it('存在文件 → 内容', () => {
    const d = makeTmp()
    const f = join(d, 'x.txt')
    writeFileSync(f, 'hello', 'utf8')
    expect(readEditorResult(f)).toBe('hello')
  })

  it('不存在/不可读 → null（取消语义）', () => {
    expect(readEditorResult(join(makeTmp(), 'nope.txt'))).toBeNull()
  })
})
