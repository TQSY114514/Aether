import type { Provider } from '@/types'
import { PROVIDER_PRESETS } from './providerPresets'

export type Preset = (typeof PROVIDER_PRESETS)[number]

export type WizardStep = 'template' | 'provider' | 'permission'

export interface ProviderForm {
  name: string
  api_url: string
  api_key: string
  api_format: string
}

export const EMPTY_FORM: ProviderForm = { name: '', api_url: '', api_key: '', api_format: 'openai' }

// Map a picked preset + edited form into the payload the store's addProvider
// action expects (Omit<Provider, 'id' | 'created_at'>, which includes `enabled`).
// Local presets (Ollama / LM Studio) never carry an API key.
export function buildProviderPayload(preset: Preset, form: ProviderForm): Omit<Provider, 'id' | 'created_at'> {
  return {
    name: (form.name || preset.name).trim(),
    api_url: (form.api_url || preset.api_url).trim(),
    api_key: preset.local ? '' : (form.api_key || '').trim(),
    api_format: preset.api_format || 'openai',
    enabled: 1,
  }
}

// Gate for advancing from the provider step: a name and an API URL are required.
export function isComplete(preset: Preset | null, form: ProviderForm): boolean {
  if (!preset) return false
  return !!(form.name || preset.name).trim() && !!(form.api_url || preset.api_url).trim()
}
