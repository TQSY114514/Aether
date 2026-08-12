import { describe, it, expect } from 'vitest'
import { buildProviderPayload, isComplete, EMPTY_FORM } from './wizardLogic'
import { PROVIDER_PRESETS } from './providerPresets'

const preset = (name: string) => {
  const p = PROVIDER_PRESETS.find((x) => x.name === name)
  if (!p) throw new Error(`preset not found: ${name}`)
  return p
}

describe('buildProviderPayload', () => {
  it('maps a cloud preset + entered key, trimming whitespace', () => {
    const payload = buildProviderPayload(preset('DeepSeek'), {
      name: '',
      api_url: '',
      api_key: ' sk-abc ',
      api_format: 'openai',
    })
    expect(payload).toEqual({
      name: 'DeepSeek',
      api_url: 'https://api.deepseek.com',
      api_key: 'sk-abc',
      api_format: 'openai',
      enabled: 1,
    })
  })

  it('always yields an empty key for local presets (Ollama)', () => {
    const payload = buildProviderPayload(preset('Ollama'), {
      name: 'My Ollama',
      api_url: 'http://127.0.0.1:11434/v1',
      api_key: 'should-be-ignored',
      api_format: 'openai',
    })
    expect(payload.api_key).toBe('')
    expect(payload.name).toBe('My Ollama')
  })

  it('falls back to preset values for empty form fields', () => {
    const payload = buildProviderPayload(preset('OpenAI'), EMPTY_FORM)
    expect(payload.name).toBe('OpenAI')
    expect(payload.api_url).toBe('https://api.openai.com/v1')
    expect(payload.api_format).toBe('openai')
    expect(payload.enabled).toBe(1)
  })
})

describe('isComplete', () => {
  it('requires a preset', () => {
    expect(isComplete(null, EMPTY_FORM)).toBe(false)
  })

  it('requires a non-empty name and url', () => {
    const openai = preset('OpenAI')
    expect(isComplete(openai, { ...EMPTY_FORM, api_url: ' ' })).toBe(false)
    expect(isComplete(openai, { ...EMPTY_FORM, name: ' ' })).toBe(false)
    // Preset values satisfy the gate when the form fields are empty.
    expect(isComplete(openai, EMPTY_FORM)).toBe(true)
  })
})
