export interface Provider {
  id: number
  name: string
  api_url: string
  api_key: string
  api_format: string
  enabled: number
  created_at: string
}

export interface Model {
  id: number
  provider_id: number
  model_name: string
  is_primary: number
  display_name: string | null
  fallback_order: number | null
  context_window: number | null
  input_price_per_1k: number | null
  output_price_per_1k: number | null
  created_at: string
  // populated by join
  provider_name?: string
  api_url?: string
  api_key?: string
}

export interface PartialModel {
  provider_id: number
  model_name: string
  is_primary?: number
  display_name?: string | null
  fallback_order?: number | null
  context_window?: number | null
  input_price_per_1k?: number | null
  output_price_per_1k?: number | null
}

export interface Persona {
  id: number
  name: string
  prompt: string
  avatar: string | null
  created_at: string
}

export interface Session {
  id: number
  title: string | null
  persona_id: number | null
  created_at: string
  last_message?: string
  pinned: number
  updated_at: string
}

export interface Message {
  id: number
  session_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  model_used: string | null
  provider_used: number | null
  token_count: number | null
  latency_ms: number | null
  status: 'success' | 'error' | 'fallback' | 'aborted'
  error_message: string | null
  arena_model?: string | null
  attachment?: { name: string; mime: string; kind: 'text' | 'image'; preview?: string } | null
}

export type ViewType = 'chat' | 'models' | 'agents' | 'settings' | 'scores' | 'tokens' | 'memory' | 'learning'

export interface TestConnectionResult {
  success: boolean
  latencyMs?: number
  errorMessage?: string
}

export interface ArenaResult {
  model_id: number
  model_name: string
  provider_name: string
  content: string
  latency_ms?: number
}

export interface ModelScore {
  id: number
  model_id: number
  intent: string
  score: number
  win_count: number
  total_count: number
  model_name: string
  provider_name: string
}

export interface RouteResult {
  model_id: number
  model_name: string
  provider_id?: number
  api_url?: string
  api_key?: string
  route_reason: string
}
