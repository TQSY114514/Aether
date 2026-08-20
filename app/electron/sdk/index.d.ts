// TypeScript declarations for the Electron-free SDK (`aetherai/sdk`, todo 12).
// The runtime module is CJS (module.exports); declarations use named exports so
// both `import { x } from 'aetherai/sdk'` (esModuleInterop) and
// `import sdk = require('aetherai/sdk')` consumers type-check.

export interface ProviderLike {
  id?: number
  name: string
  api_url?: string
  api_key?: string
  api_format?: string
}

export interface ModelLike {
  id?: number
  model_name: string
}

export interface ResolvedModel {
  provider: ProviderLike
  model: ModelLike
}

export interface RunAgentOptions {
  prompt?: string
  provider?: ProviderLike
  model?: ModelLike
  messages?: unknown[]
  options?: Record<string, unknown>
  agentMode?: 'auto' | 'plan' | 'ask'
  maxIterations?: number
  workspace?: string
  signal?: AbortSignal
  requestPermission?: (perm: unknown) => Promise<boolean>
  onText?: (chunk: { text: string; done?: boolean }) => void
  onToolCall?: (entry: Record<string, unknown>) => void
  onStatus?: (s: { text: string; kind?: string }) => void
  onPlanStep?: (step: unknown) => void
  onEvent?: (e: unknown) => void
}

export interface RunAgentResult {
  text: string
  toolCalls: unknown[]
  /** 注入的记忆条目数（--memory-trace 展示用，todo 20）。 */
  memoryTrace?: { memoryCount: number }
}

export declare function runAgent(opts: RunAgentOptions): Promise<RunAgentResult>

export declare function openDatabase(dbPath?: string): unknown

export declare function resolveProviderModel(
  db: unknown,
  opts?: { providerName?: string; modelName?: string },
): ResolvedModel | null

export declare function taskDbAdapter(db: unknown): unknown

export declare const memory: {
  prefetch: (...args: unknown[]) => string
  recall: (...args: unknown[]) => unknown
  sync: (...args: unknown[]) => unknown
  search: (...args: unknown[]) => unknown
  prune: (...args: unknown[]) => unknown
  keywords: (...args: unknown[]) => unknown
  parseEntry: (...args: unknown[]) => unknown
  detectConflict: (...args: unknown[]) => unknown
}

export interface ClassifyInput {
  prompt?: string
  toolNames?: string[]
  history?: unknown[]
}

export interface ClassifyResult {
  mode: 'ask' | 'plan' | 'auto'
  reason: string
}

export declare function classifyAgentMode(input?: ClassifyInput): ClassifyResult

// ── Agent Roles ──────────────────────────────────────────────────────────────

export interface AgentRole {
  name: string
  label: string
  description: string
  systemPrompt: string
  defaultMode: string
  allowTools: string[] | null
}

export declare const agentRoles: {
  listRoles: () => AgentRole[]
  getRole: (name: string) => AgentRole | null
  buildRolePrompt: (roleName: string, taskDescription: string) => string | null
  buildToolFilter: (roleName: string) => string[] | null
  getRoleDefaultMode: (roleName: string) => string
  ROLE_NAMES: string[]
}

// ── Memory → Skill Bridge ─────────────────────────────────────────────────────

export declare const memorySkillBridge: {
  clusterMemories: (memories: unknown[]) => unknown[][]
  generateDraftSkill: (opts: { provider: unknown; model: unknown; memories: unknown[]; signal?: AbortSignal }) => Promise<string | null>
  saveDraftSkill: (content: string, skillsDir: string) => { name: string; path: string; content: string } | null
  runMemoryAudit: (opts: { db: unknown; provider: unknown; model: unknown; signal?: AbortSignal; skillsDir: string }) => Promise<{ drafts: number; clusters?: number; totalMemories?: number; error?: string; reason?: string }>
  listDraftSkills: (skillsDir: string) => Array<{ name: string; path: string; content: string }>
  promoteDraftSkill: (draftPath: string, skillsDir: string) => { name: string; path: string } | null
}

// ── Custom Mode ──────────────────────────────────────────────────────────────

export declare const customMode: {
  buildCustomPolicy: (db: unknown) => { policy: unknown; errors: string[] }
  getCustomPolicySummary: (db: unknown) => Record<string, string>
  saveCustomPolicy: (db: unknown, key: string, value: string) => void
}

// ── Codebase Analysis ────────────────────────────────────────────────────────

export declare const codebase: {
  detectFrameworks: (rootDir: string) => Array<{ framework: string; confidence: number }>
  detectEntryPoints: (rootDir: string, frameworks?: unknown[]) => Array<{ type: string; file: string }>
  detectApiRoutes: (rootDir: string, frameworks?: unknown[]) => Array<{ method: string; path: string; file: string }>
  detectDataModels: (rootDir: string, frameworks?: unknown[]) => Array<{ type: string; file: string }>
  detectConfigFiles: (rootDir: string) => Array<{ type: string; file: string }>
  analyzeImpact: (graph: unknown, symbol: string) => { direct: string[]; transitive: string[]; total: number }
  scoreRelevance: (graph: unknown, taskDesc: string, topN: number) => Array<{ file: string; score: number }>
  analyzeCodebase: (db: unknown, rootDir: string, options?: { maxFiles?: number }) => unknown
}

/** RPC 帧类型（todo 10 落地后存在；此前为 undefined）。 */
export declare const rpc: unknown
/** sessionContext persona+记忆注入（todo 13 落地后存在；此前为 undefined）。 */
export declare const sessionContext: unknown
