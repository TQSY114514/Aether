// ─────────────────────────────────────────────────────────────────────────────
// test/cli/completions.test.js — W5-t29 shell completion script builders.
// 验收：三套脚本含关键 flag 与子命令；未知 shell 拒绝（{ok:false}）。
// 不要求真实 source（F3 手动 source bash 脚本验证）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  allFlags, subcommands, modeValues,
  bashScript, zshScript, powershellScript, scriptFor,
} from '../../electron/cli/completions.js'

describe('allFlags（W5-t29）', () => {
  it('包含全部长 flag 与短 flag', () => {
    const required = [
      '--model', '--provider', '--api-key', '--api-url', '--api-format',
      '--mode', '--workspace', '--max-iterations', '--json', '--json-lines',
      '--task', '--setup-term', '--memory-trace', '--skills', '--list-models',
      '--list-providers', '--db', '--persona', '--stdin', '--resume',
      '--session', '--fork', '--version', '--help', '-p', '-o', '-h',
    ]
    for (const f of required) expect(allFlags).toContain(f)
  })
})

describe('bashScript（W5-t29）', () => {
  it('包含 complete -F、关键 flag、子命令与 --mode 值', () => {
    const s = bashScript()
    expect(s).toContain('complete -F _aether aether')
    expect(s).toContain('--model')
    expect(s).toContain('--resume')
    expect(s).toContain('--fork')
    // tui 与 completion 必须是独立 token（曾因数组插值打成 "tui,completion"）
    expect(s).toMatch(/\stui completion\b/)
    expect(s).toContain('tui')
    expect(s).toContain('completion')
    expect(s).toContain('auto plan ask yolo json rpc')
  })
})

describe('zshScript（W5-t29）', () => {
  it('包含 #compdef 与 flag 列表', () => {
    const s = zshScript()
    expect(s).toContain('#compdef aether')
    expect(s).toContain('--model')
    expect(s).toContain('tui')
    expect(s).toContain('completion')
  })
})

describe('powershellScript（W5-t29）', () => {
  it('包含 Register-ArgumentCompleter 与 --mode 值', () => {
    const s = powershellScript()
    expect(s).toContain('Register-ArgumentCompleter -Native -CommandName aether')
    expect(s).toContain('--model')
    expect(s).toContain('--mode')
    expect(s).toContain("'json'")
  })
})

describe('scriptFor（W5-t29）', () => {
  it('bash/zsh/powershell 返回脚本（默认 bash）', () => {
    expect(scriptFor('bash').ok).toBe(true)
    expect(scriptFor('zsh').ok).toBe(true)
    expect(scriptFor('powershell').ok).toBe(true)
    expect(scriptFor().ok).toBe(true)
    expect(scriptFor('').ok).toBe(true)
    expect(scriptFor('BASH').ok).toBe(true) // case-insensitive
  })

  it('未知 shell → {ok:false} 且报支持的列表', () => {
    const r = scriptFor('fish')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unknown shell: fish/)
    expect(r.error).toContain('bash')
    expect(r.error).toContain('zsh')
    expect(r.error).toContain('powershell')
  })

  it('modeValues 与子命令常量完整', () => {
    expect(modeValues).toEqual(['auto', 'plan', 'ask', 'yolo', 'json', 'rpc'])
    expect(subcommands).toEqual(['tui', 'completion'])
  })
})
