// ─────────────────────────────────────────────────────────────────────────────
// test/cli/config.test.js — W5-t30 config file + env defaults.
// 验收：优先级 flag > env > config；坏 JSON → {error} 不崩；ENOENT → null；
// 相对 workspace 按 cwd 解析；非法 mode / 非数字 maxIterations 忽略。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfigFile, resolveDefaults, configPath } from '../../electron/cli/config.js'

const tmpDirs = []
function tempFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'aether-cli-config-'))
  tmpDirs.push(dir)
  const p = join(dir, 'config.json')
  writeFileSync(p, content, 'utf8')
  return p
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('loadConfigFile（W5-t30）', () => {
  it('文件不存在 → null', () => {
    expect(loadConfigFile(join(tmpdir(), `nope-${Date.now()}-${Math.random()}.json`))).toBeNull()
  })

  it('合法对象 → 原样返回', () => {
    const p = tempFile('{"model":"deepseek","mode":"plan","maxIterations":5}')
    expect(loadConfigFile(p)).toEqual({ model: 'deepseek', mode: 'plan', maxIterations: 5 })
  })

  it('坏 JSON → {error}（不抛异常）', () => {
    const p = tempFile('{ not json !!')
    const r = loadConfigFile(p)
    expect(r.error).toBeTruthy()
    expect(r.error).toMatch(/malformed JSON/)
  })

  it('根不是对象（数组/字符串）→ {error}', () => {
    expect(loadConfigFile(tempFile('[1,2]')).error).toMatch(/must be a JSON object/)
    expect(loadConfigFile(tempFile('"str"')).error).toMatch(/must be a JSON object/)
  })
})

describe('resolveDefaults 优先级（W5-t30）', () => {
  it('flag > env > config（model）', () => {
    expect(resolveDefaults({ opts: { model: 'flag' }, env: { AETHER_MODEL: 'env' }, config: { model: 'conf' } }))
      .toMatchObject({ model: 'flag' })
    expect(resolveDefaults({ opts: {}, env: { AETHER_MODEL: 'env' }, config: { model: 'conf' } }))
      .toMatchObject({ model: 'env' })
    expect(resolveDefaults({ opts: {}, env: {}, config: { model: 'conf' } }))
      .toMatchObject({ model: 'conf' })
    expect(resolveDefaults({ opts: {}, env: {}, config: {} }).model).toBeUndefined()
  })

  it('flag > env > config（mode），非法值忽略', () => {
    expect(resolveDefaults({ opts: { mode: 'ask' }, env: { AETHER_MODE: 'yolo' }, config: { mode: 'plan' } }))
      .toMatchObject({ mode: 'ask' })
    expect(resolveDefaults({ opts: {}, env: { AETHER_MODE: 'yolo' }, config: { mode: 'plan' } }))
      .toMatchObject({ mode: 'yolo' })
    expect(resolveDefaults({ opts: {}, env: {}, config: { mode: 'plan' } }))
      .toMatchObject({ mode: 'plan' })
    // 非法 mode（config 或 env）→ 不输出该键
    expect(resolveDefaults({ opts: {}, env: {}, config: { mode: 'banana' } }).mode).toBeUndefined()
    expect(resolveDefaults({ opts: {}, env: { AETHER_MODE: 'json' }, config: {} }).mode).toBeUndefined()
  })

  it('flag > env > config（workspace），相对路径按 cwd 解析', () => {
    const cwd = join(tmpdir(), 'fake-cwd')
    expect(resolveDefaults({ opts: { workspace: './flag-ws' }, env: { AETHER_WORKSPACE: './env-ws' }, config: { workspace: './conf-ws' }, cwd }))
      .toMatchObject({ workspace: join(cwd, 'flag-ws') })
    expect(resolveDefaults({ opts: {}, env: { AETHER_WORKSPACE: './env-ws' }, config: { workspace: './conf-ws' }, cwd }))
      .toMatchObject({ workspace: join(cwd, 'env-ws') })
    expect(resolveDefaults({ opts: {}, env: {}, config: { workspace: 'conf-ws' }, cwd }))
      .toMatchObject({ workspace: join(cwd, 'conf-ws') })
    // 绝对路径原样保留
    expect(resolveDefaults({ opts: {}, env: {}, config: { workspace: 'C:\\abs\\ws' }, cwd }))
      .toMatchObject({ workspace: 'C:\\abs\\ws' })
  })

  it('flag > env > config（maxIterations），非数字忽略', () => {
    expect(resolveDefaults({ opts: { 'max-iterations': '3' }, env: { AETHER_MAX_ITERATIONS: '7' }, config: { maxIterations: 9 } }))
      .toMatchObject({ maxIterations: 3 })
    expect(resolveDefaults({ opts: {}, env: { AETHER_MAX_ITERATIONS: '7' }, config: { maxIterations: 9 } }))
      .toMatchObject({ maxIterations: 7 })
    expect(resolveDefaults({ opts: {}, env: {}, config: { maxIterations: 9 } }))
      .toMatchObject({ maxIterations: 9 })
    expect(resolveDefaults({ opts: {}, env: {}, config: { maxIterations: 'abc' } }).maxIterations).toBeUndefined()
    expect(resolveDefaults({ opts: {}, env: { AETHER_MAX_ITERATIONS: '-5' }, config: {} }).maxIterations).toBeUndefined()
  })
})

describe('configPath（W5-t30）', () => {
  it('落在 ~/.config/aether/config.json（与 keybindings 同目录约定）', () => {
    expect(configPath()).toMatch(/[\\/]\.config[\\/]aether[\\/]config\.json$/)
  })
})
