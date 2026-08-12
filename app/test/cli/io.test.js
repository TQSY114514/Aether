// ─────────────────────────────────────────────────────────────────────────────
// test/cli/io.test.js — W5-t32 -o/--output-last-message file writer helper.
// 验收：成功写入 {ok:true} + 内容往返；不可写路径 → {ok:false, error}（不抛）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeLastMessage } from '../../electron/cli/io.js'

const tmpDirs = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'aether-cli-io-'))
  tmpDirs.push(dir)
  return dir
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('writeLastMessage（W5-t32）', () => {
  it('成功写入 utf8，内容往返', () => {
    const p = join(tempDir(), 'out.txt')
    const r = writeLastMessage(p, 'hello aether')
    expect(r.ok).toBe(true)
    expect(readFileSync(p, 'utf8')).toBe('hello aether')
  })

  it('null/undefined text → 空串', () => {
    const p = join(tempDir(), 'empty.txt')
    expect(writeLastMessage(p, null).ok).toBe(true)
    expect(readFileSync(p, 'utf8')).toBe('')
  })

  it('不可写目录 → {ok:false, error}（不抛）', () => {
    const r = writeLastMessage(join(tempDir(), 'no-such-dir', 'out.txt'), 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
