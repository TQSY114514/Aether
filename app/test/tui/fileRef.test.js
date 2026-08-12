// ─────────────────────────────────────────────────────────────────────────────
// fileRef.test.js — W3-t18: @文件引用纯助手单测
// resolveFileRefs: 存在/小/大/缺失/目录/词中 @/多引用;
// globCandidates: 前缀匹配/目录标记/上限/跳过 node_modules/.git。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveFileRefs, globCandidates, FILE_REF_LIMIT } from '../../tui/fileRef.js'

const tmpDirs = []
function makeTmp(prefix = 'fileref-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('resolveFileRefs — 词首 @ 文件引用', () => {
  it('存在的小文件: 内容块注入, token 被块替换', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 'a.txt'), 'hello world', 'utf8')
    const r = resolveFileRefs('read @a.txt and explain', cwd)
    expect(r.prompt).toBe(`read \n\n[file: @a.txt]\nhello world\n[/file]\n and explain`)
    expect(r.refs).toHaveLength(1)
    expect(r.refs[0]).toMatchObject({ token: '@a.txt', ok: true, size: 11, content: 'hello world' })
  })

  it('超过 50KB: 截断标注, 不注入内容', () => {
    const cwd = makeTmp()
    const big = 'x'.repeat(FILE_REF_LIMIT + 1)
    writeFileSync(join(cwd, 'big.txt'), big, 'utf8')
    const r = resolveFileRefs('summarize @big.txt', cwd)
    expect(r.prompt).toBe(`summarize [file: @big.txt] (truncated: ${FILE_REF_LIMIT + 1} bytes)`)
    expect(r.refs[0]).toMatchObject({ ok: false, content: null, size: FILE_REF_LIMIT + 1 })
  })

  it('文件不存在: token 原样保留, 不崩溃', () => {
    const cwd = makeTmp()
    const r = resolveFileRefs('see @missing.txt please', cwd)
    expect(r.prompt).toBe('see @missing.txt please')
    expect(r.refs[0]).toMatchObject({ token: '@missing.txt', ok: false, content: null })
  })

  it('目录引用: token 保留（不注入目录内容）', () => {
    const cwd = makeTmp()
    mkdirSync(join(cwd, 'src'))
    const r = resolveFileRefs('look at @src', cwd)
    expect(r.prompt).toBe('look at @src')
    expect(r.refs[0].ok).toBe(false)
  })

  it('词中 @ 不触发（非词首）', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 'a.txt'), 'x', 'utf8')
    const r = resolveFileRefs('email me a@b.com now', cwd)
    expect(r.prompt).toBe('email me a@b.com now')
    expect(r.refs).toHaveLength(0)
  })

  it('行首 @ 触发（无前置空格）', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 'b.md'), '# t', 'utf8')
    const r = resolveFileRefs('@b.md explain', cwd)
    expect(r.refs).toHaveLength(1)
    expect(r.prompt).toContain('[file: @b.md]')
  })

  it('多个引用: 全部解析, 顺序保持', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 'one.txt'), '1', 'utf8')
    writeFileSync(join(cwd, 'two.txt'), '2', 'utf8')
    const r = resolveFileRefs('a @one.txt b @two.txt c @nope.txt', cwd)
    expect(r.refs.map((x) => x.token)).toEqual(['@one.txt', '@two.txt', '@nope.txt'])
    expect(r.prompt).toContain('[file: @one.txt]')
    expect(r.prompt).toContain('[file: @two.txt]')
    expect(r.prompt).toContain('@nope.txt') // 缺失原样
  })

  it('空/无 @: 原样返回, refs 空数组', () => {
    const cwd = makeTmp()
    expect(resolveFileRefs('', cwd).prompt).toBe('')
    expect(resolveFileRefs('hello world', cwd)).toEqual({ prompt: 'hello world', refs: [] })
  })

  it('不可读文件（目录下无权限模拟为不存在）: 不崩溃', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 'locked.txt'), 'secret', 'utf8')
    // 模拟读取失败路径：直接传不存在路径, 断言返回 ok=false 而非抛错
    const r = resolveFileRefs('@locked.txt', join(cwd, 'nonexistent-sub'))
    expect(r.refs[0].ok).toBe(false)
  })
})

describe('globCandidates — 前缀匹配候选', () => {
  it('子目录前缀匹配, 目录项标记 isDir, 路径用正斜杠', () => {
    const cwd = makeTmp()
    mkdirSync(join(cwd, 'src'), { recursive: true })
    mkdirSync(join(cwd, 'src', 'main'), { recursive: true })
    writeFileSync(join(cwd, 'src', 'main.ts'), '', 'utf8')
    writeFileSync(join(cwd, 'src', 'main', 'x.ts'), '', 'utf8')
    writeFileSync(join(cwd, 'other.txt'), '', 'utf8')
    const r = globCandidates('src/ma', cwd, 30)
    const paths = r.map((x) => x.path)
    expect(paths).toContain('src/main.ts')
    expect(paths).toContain('src/main')
    expect(paths).not.toContain('other.txt')
    expect(r.find((x) => x.path === 'src/main').isDir).toBe(true)
    expect(r.find((x) => x.path === 'src/main.ts').isDir).toBe(false)
  })

  it('空 partial: 返回全部候选（有上限）', () => {
    const cwd = makeTmp()
    for (let i = 0; i < 5; i++) writeFileSync(join(cwd, `f${i}.txt`), '', 'utf8')
    const r = globCandidates('', cwd, 30)
    expect(r.length).toBeGreaterThanOrEqual(5)
  })

  it('limit 生效', () => {
    const cwd = makeTmp()
    for (let i = 0; i < 10; i++) writeFileSync(join(cwd, `f${i}.txt`), '', 'utf8')
    const r = globCandidates('', cwd, 3)
    expect(r.length).toBe(3)
  })

  it('跳过 .git 与 node_modules', () => {
    const cwd = makeTmp()
    mkdirSync(join(cwd, '.git'), { recursive: true })
    mkdirSync(join(cwd, 'node_modules'), { recursive: true })
    writeFileSync(join(cwd, '.git', 'config'), '', 'utf8')
    writeFileSync(join(cwd, 'node_modules', 'pkg.js'), '', 'utf8')
    writeFileSync(join(cwd, 'real.ts'), '', 'utf8')
    const r = globCandidates('', cwd, 30)
    const paths = r.map((x) => x.path)
    expect(paths).toContain('real.ts')
    expect(paths).not.toContain('.git/config')
    expect(paths).not.toContain('node_modules/pkg.js')
  })

  it('大小写不敏感前缀匹配（Windows 习惯）', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 'MainFile.ts'), '', 'utf8')
    const r = globCandidates('mainfi', cwd, 30)
    expect(r.map((x) => x.path)).toContain('MainFile.ts')
  })

  it('不存在目录: 空数组不崩溃', () => {
    expect(globCandidates('x', join(tmpdir(), 'definitely-not-here-xyz'), 30)).toEqual([])
  })

  it('statSync 后文件大小与内容一致', () => {
    const cwd = makeTmp()
    writeFileSync(join(cwd, 's.txt'), '12345', 'utf8')
    const r = resolveFileRefs('@s.txt', cwd)
    expect(r.refs[0].size).toBe(statSync(join(cwd, 's.txt')).size)
  })
})
