// ─────────────────────────────────────────────────────────────────────────────
// sandbox-win.test.js — Windows 路径强化矩阵（todo 19）
// 验收：拒绝 \\server\share 越界、C:\Windows\system32、junction 逃逸、危险扩展名；
// 不减弱现有权限（既有 sandbox.test.js 全绿）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setWorkspaceRoot, checkWritePath, hasUnsafeWindowsPrefix, hasDangerousExtension, isReparsePoint, DANGEROUS_EXTENSIONS } from '../electron/tools/sandbox.js'

const tmpDirs = []
function makeWs(prefix = 'sandboxwin-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  setWorkspaceRoot(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('前缀强化（跨平台，\\?\\ 与 UNC）', () => {
  it('hasUnsafeWindowsPrefix: \\\\?\\ 长路径前缀与 \\\\server\\share 判定', () => {
    expect(hasUnsafeWindowsPrefix('\\\\?\\C:\\Windows\\system32\\x.txt')).toBe(true)
    expect(hasUnsafeWindowsPrefix('\\\\server\\share\\file.txt')).toBe(true)
    expect(hasUnsafeWindowsPrefix('C:\\my\\workspace\\file.txt')).toBe(false)
    expect(hasUnsafeWindowsPrefix('relative/path.txt')).toBe(false)
  })

  it('checkWritePath 拒绝 \\\\server\\share 越界', () => {
    makeWs()
    const r = checkWritePath('\\\\server\\share\\evil.txt')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('prefix')
  })

  it('checkWritePath 拒绝 \\\\?\\ 原始路径', () => {
    makeWs()
    const r = checkWritePath('\\\\?\\C:\\Windows\\system32\\x.dll')
    expect(r.ok).toBe(false)
  })
})

describe('危险扩展名块（点击即执行）', () => {
  it('DANGEROUS_EXTENSIONS 覆盖 .lnk/.url/.scr 等', () => {
    for (const ext of ['.lnk', '.url', '.pif', '.cpl', '.scr', '.msi', '.msp', '.hta', '.jse', '.wsf']) {
      expect(DANGEROUS_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  it('hasDangerousExtension 判定', () => {
    expect(hasDangerousExtension('shortcut.lnk')).toBe(true)
    expect(hasDangerousExtension('file.LNK')).toBe(true) // 大小写不敏感
    expect(hasDangerousExtension('code.js')).toBe(false)
    expect(hasDangerousExtension('notes.md')).toBe(false)
  })

  it('checkWritePath 拒绝工作区内 .lnk 写入', () => {
    const ws = makeWs()
    const r = checkWritePath(join(ws, 'evil.lnk'))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('extension')
  })

  it('checkWritePath 放行工作区内普通源文件写入（不减弱现有权限）', () => {
    const ws = makeWs()
    expect(checkWritePath(join(ws, 'code.js')).ok).toBe(true)
    expect(checkWritePath(join(ws, 'src', 'notes.md')).ok).toBe(true)
  })
})

const winOnly = process.platform === 'win32' ? describe : describe.skip

winOnly('Windows 具体行为（win32）', () => {
  it('checkWritePath 拒绝 C:\\Windows\\system32 越界', () => {
    makeWs()
    const r = checkWritePath('C:\\Windows\\system32\\evil.dll')
    expect(r.ok).toBe(false)
  })

  it('junction 逃逸：写穿 junction → realpath 越界拒绝', () => {
    const outside = mkdtempSync(join(tmpdir(), 'sandboxwin-out-'))
    tmpDirs.push(outside)
    const ws = makeWs()
    const junction = join(ws, 'junc')
    symlinkSync(outside, junction, 'junction')

    // isReparsePoint 识别 junction（Windows 上 lstat.isSymbolicLink 对 junction 为 true）
    expect(isReparsePoint(junction)).toBe(true)

    // 写穿 junction 指向外部 → realpath 解析出工作区 → 拒绝
    const r = checkWritePath(join(junction, 'escape.txt'))
    expect(r.ok).toBe(false)
  })

  it('工作区正常文件往返不回归（写路径放行）', () => {
    const ws = makeWs()
    const f = join(ws, 'ok.txt')
    writeFileSync(f, 'hi')
    expect(checkWritePath(f).ok).toBe(true)
  })
})
