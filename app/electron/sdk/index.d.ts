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

/** RPC 帧类型（todo 10 落地后存在；此前为 undefined）。 */
export declare const rpc: unknown
/** sessionContext persona+记忆注入（todo 13 落地后存在；此前为 undefined）。 */
export declare const sessionContext: unknown
