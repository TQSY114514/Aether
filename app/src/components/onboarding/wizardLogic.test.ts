import { describe, it, expect } from 'vitest'
import { buildProviderPayload, isComplete, EMPTY_FORM, presetForChoice, stepForChoice, choiceOffersImport, stepAfterImport } from './wizardLogic'
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

describe('presetForChoice', () => {
  it('maps chat → OpenRouter (default cloud preset)', () => {
    expect(presetForChoice('chat')?.name).toBe('OpenRouter')
  })

  it('maps code → OpenAI', () => {
    expect(presetForChoice('code')?.name).toBe('OpenAI')
  })

  it('maps local → Ollama', () => {
    expect(presetForChoice('local')?.name).toBe('Ollama')
  })

  it('maps compare → null (routes to the template picker instead)', () => {
    expect(presetForChoice('compare')).toBeNull()
  })
})

describe('stepForChoice', () => {
  it('jumps to the provider step when a preset is preselected', () => {
    expect(stepForChoice('chat')).toBe('provider')
    expect(stepForChoice('code')).toBe('provider')
    expect(stepForChoice('local')).toBe('provider')
  })

  it('routes compare to the template picker', () => {
    expect(stepForChoice('compare')).toBe('template')
  })
})

describe('choiceOffersImport', () => {
  it('offers the Claude Code / OpenCode import for chat and code', () => {
    expect(choiceOffersImport('chat')).toBe(true)
    expect(choiceOffersImport('code')).toBe(true)
  })

  it('does not offer import for compare or local', () => {
    expect(choiceOffersImport('compare')).toBe(false)
    expect(choiceOffersImport('local')).toBe(false)
  })
})

describe('stepAfterImport', () => {
  it('jumps to the permission step when at least one provider was created', () => {
    expect(stepAfterImport(1)).toBe('permission')
    expect(stepAfterImport(3)).toBe('permission')
  })

  it('falls back to the template picker when nothing was found', () => {
    expect(stepAfterImport(0)).toBe('template')
  })
})
