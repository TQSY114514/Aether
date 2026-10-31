/**
 * Aether 2.0 Core Domain Type Definitions
 * Progressive Type System (R1)
 *
 * Unified interfaces for the core domain entities used across Electron main,
 * renderer stores, SDK, and tooling. Zero-runtime declaration file.
 */

// ─── 1. Session ──────────────────────────────────────────────────────────────

export interface Session {
  id: number
  title: string | null
  persona_id: number | null
  parent_session_id?: number | null
  pinned: number
  config?: string | Record<string, unknown> | null
  session_kind?: 'chat' | 'subagent' | 'task' | string
  created_at: string
  updated_at: string
  is_placeholder?: number
  last_message?: string
}

// ─── 2. Message ──────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'success' | 'error' | 'fallback' | 'aborted'

export interface MessageAttachment {
  name: string
  mime: string
  kind: 'text' | 'image'
  preview?: string
}

export interface Message {
  id: number
  session_id: number
  role: MessageRole
  content: string
  model_used?: string | null
  provider_used?: number | null
  token_count?: number | null
  latency_ms?: number | null
  status?: MessageStatus
  error_message?: string | null
  arena_model?: string | null
  file_summary?: string | null
  thinking_content?: string | null
  thinking_duration_ms?: number | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  attachment?: MessageAttachment | null
  created_at?: string
}

// ─── 3. TurnSummary & FileChangeEntry ─────────────────────────────────────────

export interface FileChangeEntry {
  path: string
  absPath?: string
  added: number
  removed: number
  status: 'created' | 'modified' | 'deleted'
  diff?: string
}

export interface TurnSummary {
  files: FileChangeEntry[]
  fileCount: number
  totalAdded: number
  totalRemoved: number
}

// ─── 4. ProviderConfig ───────────────────────────────────────────────────────

export interface ProviderConfig {
  id: number
  name: string
  api_url: string
  api_key?: string
  api_format: 'openai' | 'anthropic' | 'responses' | string
  enabled: number
  created_at?: string
}

// ─── 5. ModelConfig ──────────────────────────────────────────────────────────

export interface ModelConfig {
  id: number
  provider_id: number
  model_name: string
  display_name?: string | null
  is_primary: number
  fallback_order?: number | null
  context_window?: number | null
  input_price_per_1k?: number | null
  output_price_per_1k?: number | null
  created_at?: string
  // Joined fields from provider
  provider_name?: string
  api_url?: string
  api_key?: string
}

// ─── 6. ModelTier ────────────────────────────────────────────────────────────

export type ModelTier = 'fast' | 'standard' | 'thinking' | 'escalated_primary'

// ─── 7. ToolDefinition ───────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  risk?: 'safe' | 'dangerous'
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  run?: (args: any, ctx: any) => Promise<any> | any
}

// ─── 8. ToolCall ─────────────────────────────────────────────────────────────

export interface ToolCallRecoveryHint {
  action?: string
  hint?: string
  kind?: string
}

export interface ToolCallSnapshot {
  path: string
  content: string
  truncated: boolean
}

export interface ToolCall {
  id?: string
  name: string
  args: Record<string, any>
  result?: string | null
  error?: string | null
  failure_kind?: string | null
  recovery_hint?: ToolCallRecoveryHint | null
  risk?: 'safe' | 'dangerous' | string | null
  latencyMs?: number | null
  startedAt?: number | null
  checkpointId?: number | null
  diff?: string | null
  after_snapshot?: ToolCallSnapshot | null
  exitCode?: number | null
  commandFailed?: boolean
  timedOut?: boolean
}

// ─── 9. ToolResult ───────────────────────────────────────────────────────────

export interface ToolResult {
  tool_call_id?: string
  name?: string
  result?: any
  error?: string | null
  latencyMs?: number
  isError?: boolean
}

// ─── 10. AgentTask ───────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'queued' | 'running' | 'plan' | 'paused' | 'done' | 'cancelled' | 'error'

export interface AgentTask {
  id: number
  session_id: number
  parent_session_id?: number | null
  title: string
  content: string
  model_id: number
  agent_mode: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' | string
  status: TaskStatus
  priority: number
  attempts: number
  max_retry: number
  error?: string | null
  result?: string | null
  tool_journal?: string | null
  created_at: string | number
  updated_at?: string | null
}

// ─── 11. Checkpoint ──────────────────────────────────────────────────────────

export interface FileSnapshot {
  path: string
  existed: boolean
  isDirectory: boolean
  content: string | null
  error?: string
}

export interface CheckpointSnapshot {
  version: number
  files: FileSnapshot[]
  gitDiff: Record<string, string>
  gitCommit?: { success: boolean; message?: string; root?: string; error?: string }
  shadowGit?: { commitHash?: string; durationMs?: number; error?: string }
}

export interface Checkpoint {
  id: number
  session_id: number
  message_id: number
  tool_name: string
  args: string | Record<string, unknown>
  affected_paths: string[] | string
  snapshot: CheckpointSnapshot | string
  rolled_back_at?: string | null
  created_at: string
}

// ─── 12. StrategyCapsule ─────────────────────────────────────────────────────

export interface StrategyCapsule {
  id: string
  type: 'Capsule'
  schema_version: string
  trigger: string[]
  gene: string | null
  summary: string
  confidence: number
  blast_radius: { files: number; lines: number }
  outcome: { status: 'success' | 'failed'; score: number }
  success_streak?: number
  success_reason?: string | null
  derivation_tokens?: { input_tokens: number; output_tokens: number; total_tokens: number; basis: string } | null
  execution_trace: any[]
  strategy: string[]
  visibility?: 'private' | 'unlisted' | 'public' | null
  author?: { handle: string; evox_install_id: string } | null
}

// ─── Auxiliary LLM & Routing Types ───────────────────────────────────────────

export interface SuggestedModel {
  modelName: string
  modelId: number
  rationale: string
  eloScore: number | null
  autoMode: boolean
}

export interface ModelSelectionOptions {
  autoMode?: boolean
  priority?: 'quality' | 'speed' | 'cost'
  eloData?: Record<number, { score: number; win_count?: number; total_count: number }>
  latencyData?: Record<number, number>
}

export interface EscalationAuditEntry {
  kind: 'model_tier_escalation'
  taskType: string
  taskKind: string
  fromTier: ModelTier | string
  fromModel: string
  toModel: string
  reason: string
  sessionId?: number | null
  timestamp: string
  uiText: string
}

export interface AuxiliaryTargetResolution {
  provider: ProviderConfig | null
  model: ModelConfig | null
  tier: ModelTier
  escalated: boolean
  escalation: EscalationAuditEntry | null
  fallbackProvider?: ProviderConfig | null
  fallbackModel?: ModelConfig | null
}

export type ContextTier = 'system' | 'recent' | 'relevant' | 'noise'

export interface ContextBudgetCalculation {
  totalTokens: number
  breakdown: {
    system: number
    user: number
    assistant: number
    tool: number
  }
}
