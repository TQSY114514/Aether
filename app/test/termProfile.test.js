// ─────────────────────────────────────────────────────────────────────────────
// termProfile.test.js — Windows Terminal profile 引导（todo 18）
// 验收：--setup-term 生成/更新 settings.json 且 JSON.parse 通过；幂等去重。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTermProfile, updateSettingsJson, PROFILE_NAME, SCHEME_DARK, SCHEME_LIGHT } from '../electron/llm/termProfile.js'

const __dirname = join(fileURLToPath(import.meta.url), '..')
const CLI = join(__dirname, '..', 'cli.js')

const tmpDirs = []
function makeTmp(prefix = 'term-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('buildTermProfile（todo 18）', () => {
  it('生成 Aether TUI profile + 深/浅两套配色', () => {
    const f = buildTermProfile()
    expect(f.profiles).toHaveLength(1)
    expect(f.profiles[0]).toMatchObject({ name: PROFILE_NAME, colorScheme: SCHEME_DARK })
    expect(f.profiles[0].commandline).toContain('aether.ps1')
    expect(f.schemes.some((s) => s.name === SCHEME_DARK)).toBe(true)
    expect(f.schemes.some((s) => s.name === SCHEME_LIGHT)).toBe(true)
  })
})

describe('updateSettingsJson（todo 18）', () => {
  it('新建 settings.json → 合并 → JSON.parse 通过 + profile 存在', () => {
    const dir = makeTmp()
    const settingsPath = join(dir, 'settings.json')
    const f = buildTermProfile()
    const r = updateSettingsJson(settingsPath, f)
    expect(r.ok).toBe(true)
    expect(r.profiles).toBe(1)
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.profiles.list.some((p) => p.name === PROFILE_NAME)).toBe(true)
    expect(parsed.schemes.some((s) => s.name === SCHEME_DARK)).toBe(true)
  })

  it('既有 settings.json（含用户 profile）→ 合并且不破坏既有内容', () => {
    const dir = makeTmp()
    const settingsPath = join(dir, 'settings.json')
    writeFileSync(settingsPath, JSON.stringify({ profiles: { list: [{ name: 'User Shell', commandline: 'pwsh.exe' }] }, defaultProfile: 'User Shell' }))
    const r = updateSettingsJson(settingsPath, buildTermProfile())
    expect(r.ok).toBe(true)
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.defaultProfile).toBe('User Shell') // 既有字段保留
    expect(parsed.profiles.list).toHaveLength(2)
    expect(parsed.profiles.list.some((p) => p.name === PROFILE_NAME)).toBe(true)
  })

  it('幂等：重复合并不产生重复 profile/scheme', () => {
    const dir = makeTmp()
    const settingsPath = join(dir, 'settings.json')
    updateSettingsJson(settingsPath, buildTermProfile())
    updateSettingsJson(settingsPath, buildTermProfile())
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(parsed.profiles.list.filter((p) => p.name === PROFILE_NAME)).toHaveLength(1)
    expect(parsed.schemes.filter((s) => s.name === SCHEME_DARK)).toHaveLength(1)
  })

  it('损坏的既有 JSON → 以空配置重建（不抛错）', () => {
    const dir = makeTmp()
    const settingsPath = join(dir, 'settings.json')
    writeFileSync(settingsPath, '{broken json!!!')
    const r = updateSettingsJson(settingsPath, buildTermProfile())
    expect(r.ok).toBe(true)
    expect(() => JSON.parse(readFileSync(settingsPath, 'utf8'))).not.toThrow()
  })
})

describe('CLI --setup-term（todo 18）', () => {
  it('spawn: node cli.js --setup-term --term-settings <tmp> → exit 0 + JSON.parse 通过', async () => {
    const dir = makeTmp()
    const settingsPath = join(dir, 'wt-settings.json')
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, '--setup-term', '--term-settings', settingsPath], { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => { stdout += d })
      child.stderr.on('data', (d) => { stderr += d })
      child.on('exit', (code) => resolve({ code, stdout, stderr }))
      child.stdin.end()
    })
    expect(out.code).toBe(0)
    expect(out.stderr).toBe('')
    expect(JSON.parse(out.stdout).ok).toBe(true)
    expect(existsSync(settingsPath)).toBe(true)
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).profiles.list.some((p) => p.name === PROFILE_NAME)).toBe(true)
  }, 30000)
})
