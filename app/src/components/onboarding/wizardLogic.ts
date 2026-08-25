import type { Provider } from '@/types'
import { PROVIDER_PRESETS } from './providerPresets'

export type Preset = (typeof PROVIDER_PRESETS)[number]

// First-run "how do you want to use Aether?" choice. Each card routes to the
// provider step with a preset preselected, or to the template picker.
export type Choice = 'chat' | 'code' | 'compare' | 'local'

export type WizardStep = 'choice' | 'template' | 'provider' | 'permission'

// The preset a choice preselects when it jumps straight to the provider step.
// Returns null when the choice routes to the template picker instead.
export function presetForChoice(choice: Choice): Preset | null {
  switch (choice) {
    case 'chat': return PROVIDER_PRESETS.find((p) => p.name === 'OpenRouter') ?? null
    case 'code': return PROVIDER_PRESETS.find((p) => p.name === 'OpenAI') ?? null
    case 'local': return PROVIDER_PRESETS.find((p) => p.name === 'Ollama') ?? null
    case 'compare': return null
  }
}

// The step a choice lands on: provider (preset preselected) or template picker.
export function stepForChoice(choice: Choice): WizardStep {
  return presetForChoice(choice) ? 'provider' : 'template'
}

// Chat / Code offer the one-click "import from Claude Code / OpenCode" action.
export function choiceOffersImport(choice: Choice): boolean {
  return choice === 'chat' || choice === 'code'
}

// After an external-config import, decide the next wizard step. If at least
// one provider was created, jump straight to the permission step — the App
// mount gate (showWizard && onboardingDone === false && providers.length === 0)
// closes once providers exist, so the user isn't stuck mid-state. Otherwise
// fall back to the template picker so they can add a provider manually.
export function stepAfterImport(createdProviders: number): WizardStep {
  return createdProviders > 0 ? 'permission' : 'template'
}

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
