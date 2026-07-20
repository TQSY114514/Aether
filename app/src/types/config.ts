// ───────────────────────────────────────────────────────────────────────────
// Declarative config schema (inspired by Continue's config.json — "config is
// the source, UI is an editor of it").
//
// This describes the shape of an exportable/importable bundle of the app's
// configuration: providers, models, personas. Sessions are NOT included
// (they're user data, not configuration). API keys are included by default
// since a config bundle you intend to restore on another machine is useless
// without them, but `exportConfig({ includeSecrets: false })` strips them.
//
// `version` lets import migrate older bundles forward later.
// ───────────────────────────────────────────────────────────────────────────

import type { Provider, Model, Persona } from '@/types'

export const CONFIG_BUNDLE_VERSION = 1

export interface ConfigBundleProvider {
  name: string
  api_url: string
  api_key: string
  api_format: string
  enabled: number
}

export interface ConfigBundleModel {
  provider_name: string // link to provider by name within the bundle (ids differ across machines)
  model_name: string
  display_name: string | null
  is_primary: number
  fallback_order: number | null
  context_window: number | null
  input_price_per_1k: number | null
  output_price_per_1k: number | null
}

export interface ConfigBundlePersona {
  name: string
  prompt: string
  avatar: string | null
}

export interface ConfigBundle {
  version: number
  exported_at: string
  providers: ConfigBundleProvider[]
  models: ConfigBundleModel[]
  personas: ConfigBundlePersona[]
}

// Build a bundle from live DB rows. `includeSecrets` controls whether api_key
// is included; stripping is for sharing a config publicly.
export function buildConfigBundle(
  providers: Provider[],
  models: Model[],
  personas: Persona[],
  { includeSecrets = true }: { includeSecrets?: boolean } = {}
): ConfigBundle {
  return {
    version: CONFIG_BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    providers: providers.map(p => ({
      name: p.name,
      api_url: p.api_url,
      api_key: includeSecrets ? p.api_key : '',
      api_format: p.api_format || 'openai',
      enabled: p.enabled,
    })),
    models: models.map(m => ({
      provider_name: m.provider_name || providers.find(p => p.id === m.provider_id)?.name || '',
      model_name: m.model_name,
      display_name: m.display_name,
      is_primary: m.is_primary,
      fallback_order: m.fallback_order,
      context_window: m.context_window,
      input_price_per_1k: m.input_price_per_1k,
      output_price_per_1k: m.output_price_per_1k,
    })),
    personas: personas.map(p => ({ name: p.name, prompt: p.prompt, avatar: p.avatar })),
  }
}
