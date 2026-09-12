// ─────────────────────────────────────────────────────────────────────────────
// envSanitizer.test.js — Child process environment variable isolation tests
// (QVD-2026-57410 / DeepSeek Harness defense)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { isSensitiveEnvKey, sanitizeProcessEnv } from '../electron/tools/envSanitizer'
import { runCommand } from '../electron/tools/exec'

describe('envSanitizer', () => {
  it('identifies sensitive environment keys accurately', () => {
    expect(isSensitiveEnvKey('OPENAI_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('ANTHROPIC_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('GEMINI_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('DEEPSEEK_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('GITHUB_TOKEN')).toBe(true)
    expect(isSensitiveEnvKey('GH_TOKEN')).toBe(true)
    expect(isSensitiveEnvKey('AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(isSensitiveEnvKey('DATABASE_PASSWORD')).toBe(true)
    expect(isSensitiveEnvKey('AETHER_TEST_SECRET')).toBe(true)

    // Essential system vars should NOT be marked sensitive
    expect(isSensitiveEnvKey('PATH')).toBe(false)
    expect(isSensitiveEnvKey('SYSTEMROOT')).toBe(false)
    expect(isSensitiveEnvKey('USERPROFILE')).toBe(false)
    expect(isSensitiveEnvKey('TEMP')).toBe(false)
    expect(isSensitiveEnvKey('KEYBOARD')).toBe(false)
  })

  it('strips sensitive keys and retains safe variables', () => {
    const mockEnv = {
      PATH: 'C:\\Windows\\System32',
      SYSTEMROOT: 'C:\\Windows',
      OPENAI_API_KEY: 'sk-proj-supersecret',
      ANTHROPIC_API_KEY: 'sk-ant-topsecret',
      GH_TOKEN: 'ghp_secrettoken',
      MY_CUSTOM_PASSWORD: 'password123',
      USERPROFILE: 'C:\\Users\\test',
    }

    const cleaned = sanitizeProcessEnv(mockEnv, { EXTRA_SAFE_VAR: 'hello' })

    expect(cleaned.PATH).toBe('C:\\Windows\\System32')
    expect(cleaned.SYSTEMROOT).toBe('C:\\Windows')
    expect(cleaned.USERPROFILE).toBe('C:\\Users\\test')
    expect(cleaned.EXTRA_SAFE_VAR).toBe('hello')

    expect(cleaned.OPENAI_API_KEY).toBeUndefined()
    expect(cleaned.ANTHROPIC_API_KEY).toBeUndefined()
    expect(cleaned.GH_TOKEN).toBeUndefined()
    expect(cleaned.MY_CUSTOM_PASSWORD).toBeUndefined()
  })

  it('prevents child process from reading host secrets via runCommand', async () => {
    // Inject a dummy sensitive key into current process.env temporarily
    const testSecretKey = 'OPENAI_API_KEY'
    const prevVal = process.env[testSecretKey]
    process.env[testSecretKey] = 'leaked-secret-should-be-stripped'

    try {
      const r = await runCommand('node', ['-e', 'console.log(process.env.OPENAI_API_KEY || "SAFE_NOT_FOUND")'], { timeout: 10000 })
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('SAFE_NOT_FOUND')
      expect(r.stdout).not.toContain('leaked-secret-should-be-stripped')
    } finally {
      if (prevVal === undefined) {
        delete process.env[testSecretKey]
      } else {
        process.env[testSecretKey] = prevVal
      }
    }
  })

  it('边界: 密钥识别大小写不敏感, 子串陷阱不误伤', () => {
    expect(isSensitiveEnvKey('openai_api_key')).toBe(true)
    expect(isSensitiveEnvKey('OPENROUTER_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('GitHub_Token')).toBe(true)
    expect(isSensitiveEnvKey('npm_token')).toBe(true)
    expect(isSensitiveEnvKey('MONKEY')).toBe(false)
    expect(isSensitiveEnvKey('KEYCHAIN')).toBe(false)
    expect(isSensitiveEnvKey('DATABASE_PASSWORD')).toBe(true)
  })

  it('边界: 前缀规则覆盖各主流供应商与 npm token', () => {
    const prefixes = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'DEEPSEEK', 'GROQ', 'MISTRAL', 'PERPLEXITY', 'COHERE', 'OPENROUTER', 'AETHER', 'GITHUB', 'GH', 'NPM', 'AWS', 'AZURE', 'DISCORD', 'SLACK', 'TELEGRAM']
    for (const p of prefixes) {
      expect(isSensitiveEnvKey(`${p}_API_KEY`)).toBe(true)
      expect(isSensitiveEnvKey(`${p}_TOKEN`)).toBe(true)
    }
  })

  it('边界: sanitizeProcessEnv 保留安全变量并类型归一 extraEnv', () => {
    const cleaned = sanitizeProcessEnv(
      { SAFE_VAR: 'ok', openai_api_key: 'sk-x', MONKEY: 'banana' },
      { EXTRA_NUM: 42, EXTRA_BOOL: true, EXTRA_NULL: null, EXTRA_UNDEF: undefined },
    )
    expect(cleaned.SAFE_VAR).toBe('ok')
    expect(cleaned.MONKEY).toBe('banana')
    expect(cleaned.openai_api_key).toBeUndefined()
    expect(cleaned.EXTRA_NUM).toBe('42')
    expect(cleaned.EXTRA_BOOL).toBe('true')
    expect(cleaned.EXTRA_NULL).toBeUndefined()
    expect(cleaned.EXTRA_UNDEF).toBeUndefined()
  })

  it('边界: 非对象 baseEnv 不抛错, 仅合入 extraEnv', () => {
    const cleaned = sanitizeProcessEnv(null, { ONLY: 'x' })
    expect(cleaned).toEqual({ ONLY: 'x' })
  })
})
