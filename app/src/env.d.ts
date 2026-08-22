/// <reference types="vite/client" />

interface MarketServer {
  name: string
  title: string
  description: string
  version: string
  repositoryUrl: string | null
  installable: boolean
  config: { name: string; command: string; args: string[]; env: Record<string, string> } | null
}

// One row of the agent_execution_log audit table as returned by the
// usage:agent-history IPC (payload parsed into an object).
interface AgentExecutionTurn {
  id: number
  session_id: number
  turn_id: number
  created_at: string
  payload: {
    toolCalls: { name: string; args: unknown; result?: string; error?: string | null; latencyMs?: number }[]
    planId?: string | number | null
    planStatus?: string | null
    totalIterations?: number
    finalStatus?: string
  }
}

// Task status enum (7 states + legacy `pending` alias) — shared by task:*
// IPC shapes below. Mirrors app/electron/llm/eventTypes.js.
type TaskStatus7 = 'queued' | 'running' | 'plan' | 'paused' | 'done' | 'cancelled' | 'error' | 'pending'

// One row of the evolution_events table as returned by the evolution:history
// IPC (genes/signals/blast_radius are JSON-encoded strings).
interface EvolutionEvent {
  capsule_id: string
  genes?: string
  strategy?: string
  signals?: string
  blast_radius?: string
  created_at?: string
}

// Structured rationale returned by model:suggest — the renderer localizes
// these fields (via i18n) instead of showing the raw English `reason` string.
interface ModelSuggestionReasonParts {
  task?: string
  taskLabel?: string
  confidence?: number
  lowConfidence?: boolean
  family?: string
  heuristic?: number
  eloScore?: number | null
  eloWins?: number
  eloTotal?: number
  eloReliable?: boolean
  useTools?: boolean
  reasonPickUsed?: boolean
  closeRace?: boolean
  gap?: number | null
  runnerUpName?: string | null
  secondary?: { type: string; label: string }[]
  ranked?: number
  noMatch?: boolean
}

interface ModelSuggestion {
  suggestedModelId: number | null
  reason: string
  reasonParts?: ModelSuggestionReasonParts
  heuristicScores?: { modelId: number; modelName: string; family: string; heuristic: number; eloScore: number | null; blended: number }[]
  confidence: number
}

interface Window {
  electronAPI: {
    provider: {
      list: () => Promise<Provider[]>
      get: (id: number) => Promise<Provider>
      create: (data: Omit<Provider, 'id' | 'created_at'>) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: Partial<Provider>) => Promise<void>
      delete: (id: number) => Promise<void>
      testConnection: (id: number) => Promise<TestConnectionResult>
      fetchModels: (id: number) => Promise<string[]>
      detectOllama: () => Promise<{ ok: boolean; providerId?: number; models?: string[]; recommended?: string | null; error?: string }>
    }
    model: {
      list: (providerId: number) => Promise<Model[]>
      create: (data: Omit<Model, 'id' | 'created_at'>) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: Partial<Model>) => Promise<void>
      delete: (id: number) => Promise<void>
      fallbackChain: (providerId: number) => Promise<Model[]>
      listAll: () => Promise<Model[]>
      primary: () => Promise<{ id: number; provider_id: number } | null>
      suggest: (params: { sessionId: number; userMessage: string }) => Promise<ModelSuggestion>
    }
    persona: {
      list: () => Promise<Persona[]>
      create: (data: Omit<Persona, 'id' | 'created_at'>) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: Partial<Persona>) => Promise<void>
      delete: (id: number) => Promise<void>
      import: (data: any) => Promise<{ success: boolean; error?: string }>
      export: (id: number) => Promise<any>
    }
    session: {
      list: () => Promise<Session[]>
      create: (data: any) => Promise<{ lastInsertRowid: number }>
      createAndSelect: (opts: { providerId?: number | null; modelId?: number | null; personaId?: number | null }) => Promise<{ session: Session & { id: number }; config: { providerId: number | null; modelId: number | null; personaId: number | null }; messages: Message[] }>
      rename: (id: number, title: string) => Promise<void>
      pin: (id: number, pinned: number) => Promise<void>
      delete: (id: number) => Promise<void>
      touch: (id: number) => Promise<void>
      getConfig: (id: number) => Promise<{ providerId: number | null; modelId: number | null; personaId: number | null } | null>
      setConfig: (id: number, config: any) => Promise<void>
    }
    message: {
      list: (sessionId: number) => Promise<Message[]>
      update: (id: number, data: Partial<Message>) => Promise<void>
      deleteAfter: (sessionId: number, afterId: number) => Promise<void>
      deleteArena: (sessionId: number) => Promise<void>
      addNormal: (msg: any) => Promise<{ lastInsertRowid: number }>
    }
    chat: {
      send: (params: { sessionId: number; content: string; modelId: number; mode?: string; personaId?: number | null; regenerate?: boolean; attachments?: { name: string; mime: string; dataUrl: string }[]; useTools?: boolean; agentMode?: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' | 'custom'; effortLevel?: 'low' | 'medium' | 'high'; thinkingEnabled?: boolean; genParams?: { maxTokens?: number; temperature?: number; topP?: number }; systemPrefix?: string }) => Promise<{ messageId: number; modelSuggestion?: ModelSuggestion | null; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: number; model_name: string; provider_name: string } }>
      complete: (params: { content: string; modelId?: number | null; sessionId?: number | null; context?: string; systemPrefix?: string }) => Promise<{ content?: string; sessionId?: number; messageId?: number; error?: string }>
      onChunk: (callback: (payload: { messageId: number; delta: string; done: boolean; sessionId?: number }) => void) => () => void
      onToolCall: (callback: (payload: { messageId: number; sessionId: number; tool: { name: string; args: any; result: string | null; error: string | null; failure_kind?: string | null; recovery_hint?: { action: string; hint: string } | null; risk?: string | null; latencyMs?: number | null; startedAt?: number | null; checkpointId?: number | null; diff?: string | null; after_snapshot?: { path: string; content: string; truncated: boolean } | null } }) => void) => () => void
      onPlanStep: (callback: (payload: { messageId: number; sessionId: number; step: { step: number; depth: number; assistantText: string; kind?: 'plan' | 'act' | 'observe' } }) => void) => () => void
      onTodoUpdate: (callback: (payload: { messageId: number; sessionId: number; todos: { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }[] }) => void) => () => void
      onStatus: (callback: (payload: { messageId: number; sessionId: number; text: string; kind?: string }) => void) => () => void
      onQuestion: (callback: (payload: { reqId: string; sessionId: number; questions: { question: string; header?: string; options: { label: string; description?: string }[] }[] }) => void) => () => void
      onQuestionExpired: (callback: (payload: { reqId: string }) => void) => () => void
      replyQuestion: (payload: { reqId: string; answers: { question: string; answer: string }[] }) => Promise<boolean>
      onPermissionRequest: (callback: (payload: { reqId: string; messageId: number; sessionId: number; name: string; args: any; risk: 'safe' | 'dangerous'; impact?: { summary?: string; severity?: string; affectedFiles?: string[]; command?: string; riskTags?: string[]; rollback?: string; alternatives?: string } | null }) => void) => () => void
      onPermissionExpired: (callback: (payload: { reqId: string }) => void) => () => void
      replyPermission: (payload: { reqId: string; allowed: boolean; remember?: boolean }) => Promise<boolean>
      onToolStream: (callback: (payload: { messageId: number; sessionId: number; text: string; done: boolean }) => void) => () => void
      onHabitProposed: (callback: (payload: { key: string; imperative: string; reason: string }) => void) => () => void
      confirmHabit: (key: string) => Promise<{ ok: boolean }>
      dismissHabit: (key: string) => Promise<{ ok: boolean }>
      onHabitSuggestion: (callback: (payload: { key: string; imperative: string; reason: string }[]) => void) => () => void
      onContextBudget: (callback: (payload: { text: string }) => void) => () => void
      stop: (sessionId: number) => Promise<void>
      inject: (payload: { sessionId: number; content: string }) => Promise<{ queued: boolean }>
      onInjectionQueued: (callback: (payload: { sessionId: number; content: string }) => void) => () => void
      onToolLoopStart: (callback: (payload: { sessionId: number }) => void) => () => void
      onToolLoopEnd: (callback: (payload: { sessionId: number }) => void) => () => void
      onThinkingStart: (callback: (payload: { messageId: number; sessionId: number }) => void) => () => void
      onThinkingEnd: (callback: (payload: { messageId: number; sessionId: number }) => void) => () => void
      onThinkingChunk: (callback: (payload: { messageId: number; delta: string; done?: boolean }) => void) => () => void
    }
    arena: {
      send: (params: { sessionId: number; content: string; modelIds: number[]; personaId?: number | null; temperatures?: number[] | null }) => Promise<{ results: ArenaResult[] }>
      vote: (data: { prompt: string; winnerModelId: number; winnerModelName: string; loserModelIds: number[]; loserModelNames: string[]; intent?: string }) => Promise<{ success: boolean }>
      scores: () => Promise<ModelScore[]>
      stop: (sessionId?: number) => Promise<void>
      benchmarkList: () => Promise<ArenaBenchmark[]>
      benchmarkSave: (data: { id?: number | null; name: string; tasks: string[]; modelIds: number[] }) => Promise<{ id: number; error?: string }>
      benchmarkDelete: (id: number) => Promise<{ ok: boolean; error?: string }>
      benchmarkRun: (data: { id: number; modelIds: number[] }) => Promise<{ lastRun: string; models: Record<number, { model_name: string; provider_name: string }>; results: Record<number, { wins: number; runs: number; total_ms: number; total_cost: number }>; error?: string }>
      benchmarkStop: (id: number) => Promise<void>
      onModelDone: (callback: (payload: { sessionId: number; result: ArenaResult }) => void) => () => void
    }
    mcp: {
      list: () => Promise<{ id: number; name: string; command: string; args: string[]; env: Record<string, string>; enabled: number }[]>
      create: (data: { name: string; command: string; args?: string[]; env?: Record<string, string>; enabled?: number }) => Promise<{ lastInsertRowid?: number; cancelled?: boolean; error?: string }>
      update: (id: number, data: Partial<{ name: string; command: string; args: string[]; env: Record<string, string>; enabled: number }>) => Promise<{ success: boolean }>
      delete: (id: number) => Promise<{ success: boolean }>
      connect: (id: number) => Promise<{ success: boolean; tools?: { name: string; description: string; risk: string }[]; error?: string }>
      status: () => Promise<{ connected: string[] }>
    }
    market: {
      list: () => Promise<{ servers: MarketServer[] }>
      search: (query: string) => Promise<{ servers: MarketServer[] }>
      install: (entry: MarketServer | { name: string; command: string; args?: string[]; env?: Record<string, string> }) => Promise<{ success: boolean; id?: number; error?: string; cancelled?: boolean }>
    }
    settings: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
      getAll: () => Promise<Record<string, string>>
      onChanged: (callback: (key: string, value: string) => void) => () => void
    }
    flags: {
      list: () => Promise<{ key: string; default: boolean; value: string | null; enabled: boolean; category: string; description: string }[]>
      set: (key: string, value: boolean | string) => Promise<{ ok: boolean; key?: string; value?: string; error?: string }>
      safeMode: () => Promise<{ ok: boolean; written: { key: string; value: string }[] }>
      onChanged: (callback: (key: string, value: string) => void) => () => void
    }
    mainLog: {
      onEntry: (callback: (entry: { level: string; time: string; msg: string }) => void) => () => void
    }
    memory: {
      list: () => Promise<{ id: number; content: string; type: string; created_at: string; access_count: number; last_accessed_at: string | null; source_session_id: number | null; confidence: number; conflicts_with: number | null; origin: string }[]>
      create: (data: { content: string; type?: string; source_session_id?: number | null }) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: { content: string }) => Promise<void>
      delete: (id: number) => Promise<void>
      conflicts: () => Promise<{ memoryId: number; content: string; conflictingId: number; conflictingContent: string }[]>
      conflictResolve: (keepId: number, removeId: number) => Promise<{ ok: boolean }>
      access: (id: number) => Promise<void>
      dedupe: () => Promise<{ removed: number }>
    }
    learning: {
      overview: () => Promise<{
        memory: { total: number; assistant: number; user: number; external: number }
        autoSkills: number
        evolution: number
        habits: { total: number; recent: { key: string; imperative: string; occurrences: number }[] }
        replay: { total: number; top: { signature: string; tools: string; count: number }[] }
      }>
      recentAudit: (limit?: number) => Promise<{ id: number; session_id: number; turn_id: number; payload: any; created_at: string }[]>
    }
    kg: {
      graph: (opts?: { nodeLimit?: number; edgeLimit?: number }) => Promise<{ nodes: { id: string; label: string; type: string }[]; edges: { source: string; target: string; relation: string; confidence: number }[] }>
      deleteNode: (entity: string) => Promise<{ ok: boolean; removed?: number; entity?: string; error?: string }>
      renameNode: (entity: string, newEntity: string) => Promise<{ ok: boolean; entity?: string; error?: string }>
    }
    background: {
      set: (dataUrl: string | null) => Promise<{ success: boolean; hasImage?: boolean; error?: string }>
      get: () => Promise<string | null>
    }
    gateway: {
      info: () => Promise<{ enabled: boolean; port: number; token: string | null; running: boolean }>
      setEnabled: (enabled: boolean) => Promise<{ ok: boolean; running: boolean }>
    }
    system: {
      getAutoLaunch: () => Promise<{ enabled: boolean }>
      setAutoLaunch: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean; error?: string }>
      notify: (data: { title?: string; body?: string }) => Promise<{ ok: boolean; error?: string }>
      clipboardWrite: (text: string) => Promise<{ ok: boolean; error?: string }>
      clipboardRead: () => Promise<{ ok: boolean; text?: string; error?: string }>
      registerFileAssociations: () => Promise<{ ok: boolean; error?: string }>
    }
    config: {
      export: (opts?: { includeSecrets?: boolean }) => Promise<{ success: boolean; bundle?: any; error?: string }>
      import: (bundle: any) => Promise<{ success: boolean; created?: { providers: number; models: number; personas: number }; skipped?: { providers: number; models: number; personas: number }; error?: string }>
    }
    protocol: {
      // aetherai:// 协议事件(todo 17): open(workspace 路径) / tui / new / chat
      onOpen: (callback: (payload: { action: string; workspace?: string; raw?: string }) => void) => () => void
    }
    agent: {
      getWorkspace: (sessionId?: number) => Promise<string>
      setWorkspace: (opts: { dir?: string | null; sessionId?: number }) => Promise<{ success: boolean; root: string }>
      hasProjectInstructions: () => Promise<{ has: boolean; fileName: string | null }>
      reindexProject: () => Promise<{ ok: boolean; stats?: { totalFiles: number; totalEdges: number; languages: string[] }; error?: string }>
      listCheckpoints: (sessionId: number) => Promise<{ id: number; sessionId: number; turnId: number; stepIndex: number; meta: Record<string, unknown>; createdAt: string }[]>
      getCheckpoint: (id: number) => Promise<{ id: number; sessionId: number; turnId: number; stepIndex: number; messages: unknown[]; toolTrace: unknown[]; meta: Record<string, unknown>; createdAt: string } | null>
      deleteCheckpoint: (id: number) => Promise<{ ok: boolean }>
      cleanupCheckpoints: (sessionId: number) => Promise<{ ok: boolean }>
    }
    git: {
      undo: (cwd?: string) => Promise<{ success: boolean; message?: string; undoneCommit?: string | null; error?: string }>
      status: (cwd?: string) => Promise<{ success: boolean; root?: string | null; status?: string; recent?: string; error?: string }>
      setAutoCommit: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>
      getAutoCommit: () => Promise<{ enabled: boolean }>
    }
    model: {
      routeTier: (params: { taskType: string; userMessage: string }) => Promise<{ tier: string; modelName: string | null; modelId: number | null; rationale: string; eloScore: number | null; autoMode: boolean }>
    }
    skills: {
      list: () => Promise<{ name: string; description: string; filePath: string; metadata?: Record<string, string>; usage?: { count: number; lastUsedAt: string | null } }[]>
      rescan: () => Promise<{ success: boolean; count: number }>
      stats: () => Promise<{ name: string; totalUses: number; successes: number; successRate: number; lastResult: boolean }[]>
      record: (name: string, success: boolean) => Promise<{ ok: boolean }>
      autoDraft: (name: string, description?: string) => Promise<{ ok: boolean; error?: string }>
      getUsage: () => Promise<{ name: string; use_count: number; last_used_at: string | null; state: string; pinned: number; created_by: string; patch_count: number; last_viewed_at: string | null; archived_at: string | null }[]>
      updateState: (name: string, state: string) => Promise<{ ok: boolean }>
      pin: (name: string, pinned: boolean) => Promise<{ ok: boolean }>
      importDir: () => Promise<{ ok: boolean; count?: number; error?: string }>
    }
    search: {
      messages: (query: string, sessionId?: number) => Promise<{ id: number; session_id: number; role: string; content: string; model_used: string | null; created_at: string; session_title?: string; terms?: string[] }[]>
      memories: (query: string) => Promise<{ id: number; content: string; type: string; created_at: string; source_session_id: number | null; confidence: number; terms?: string[] }[]>
      files: (query: string, root?: string) => Promise<{ relPath: string; absPath: string; size: number; ext: string; modified: number }[]>
      unified: (query: string, opts?: { sessionId?: number; root?: string; limit?: number }) => Promise<{
        messages: { id: number; session_id: number; role: string; content: string; model_used: string | null; created_at: string; session_title?: string; terms?: string[] }[]
        memories: { id: number; content: string; type: string; created_at: string; source_session_id: number | null; confidence: number; terms?: string[] }[]
        files: { relPath: string; absPath: string; size: number; ext: string; modified: number; terms?: string[] }[]
      }>
    }
    commands: {
      list: () => Promise<{ id: string; name: string; description: string; prompt: string }[]>
      rescan: () => Promise<{ success: boolean; count: number }>
    }
    updater: {
      check: () => Promise<{ currentVersion?: string; updateInfo?: { version?: string } | null; downloaded?: boolean; error?: string }>
      install: () => Promise<boolean>
      status: () => Promise<{ currentVersion?: string; updateInfo?: { version?: string } | null; downloaded?: boolean }>
      onUpdateAvailable: (cb: (p: { version: string }) => void) => () => void
      onUpdateDownloaded: (cb: (p: { version: string }) => void) => () => void
      onProgress: (cb: (p: { percent: number }) => void) => () => void
      onUpToDate: (cb: (p: { version: string }) => void) => () => void
      onError: (cb: (p: { message: string }) => void) => () => void
    }
    usage: {
      stats: (range?: { since?: string; until?: string }) => Promise<{ requests: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost: number; latency_avg: number }>
      byProvider: (range?: { since?: string; until?: string }) => Promise<{ provider_name: string; requests: number; total_tokens: number; cost: number }[]>
      byModel: (range?: { since?: string; until?: string }) => Promise<{ model_name: string; requests: number; total_tokens: number; cost: number }[]>
      daily: (range?: { since?: string; until?: string }) => Promise<{ day: string; requests: number; total_tokens: number; cost: number }[]>
      log: (range?: { since?: string; until?: string; limit?: number }) => Promise<any[]>
      toolLoopSummary: (limit?: number) => Promise<{ runs: number; avgDurationMs: number; avgIterations: number; totalInputTokens: number; totalOutputTokens: number; errorRuns: number } | null>
      toolLoopRecent: (limit?: number) => Promise<{ id: number; session_id: number | null; started_at: string; duration_ms: number; iterations: number; input_tokens: number; output_tokens: number; error_kind: string | null }[]>
      toolLoopByTool: (limit?: number) => Promise<{ tool_name: string; calls: number; avg_duration_ms: number; ok: number }[]>
      agentHistory: (sessionId: number, limit?: number) => Promise<AgentExecutionTurn[]>
      agentStats: (sessionId: number) => Promise<{ turns: number; totalToolCalls: number; avgLatencyMs: number }>
    }
    audit: {
      log: (params: { sessionId: number; limit?: number }) => Promise<any[]>
    }
    agentCheckpoint: {
      list: (params: { sessionId: number; messageId?: number | null }) => Promise<any[]>
      rollback: (params: { id: number }) => Promise<{ success: boolean; restored?: string[]; error?: string }>
    }
    trust: {
      badge: (params: { sessionId?: number; modelId?: number }) => Promise<{ level: string; score: number; reason: string } | null>
    }
    task: {
      start: (params: { content: string; modelId: number; agentMode?: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo'; priority?: number; maxRetry?: number }) => Promise<{ taskId: number; sessionId: number; error?: string }>
      list: () => Promise<{ id: number; sessionId: number; status: TaskStatus7; title: string; createdAt: number; priority: number; attempts: number; maxRetry: number; finalContent?: string | null; error?: string | null }[]>
      cancel: (taskId: number) => Promise<{ ok: boolean }>
      pause: (taskId: number) => Promise<{ ok: boolean }>
      resume: (taskId: number) => Promise<{ ok: boolean }>
      derive: (params: { content: string; modelId: number; agentMode?: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo'; priority?: number; maxRetry?: number }) => Promise<{ taskId: number; sessionId: number; error?: string }>
      getResult: (taskId: number) => Promise<{ status: string; finalContent: string | null } | null>
      onStarted: (callback: (payload: { id: number; sessionId: number; status: TaskStatus7; title: string; createdAt: number; priority: number; attempts: number; maxRetry: number; finalContent?: string | null; error?: string | null }) => void) => () => void
      onProgress: (callback: (payload: { taskId: number; type: 'tool-call' | 'plan-step' | 'status' | 'todo-update' | 'chunk' | 'paused' | 'resumed'; payload: unknown }) => void) => () => void
      onDone: (callback: (payload: { taskId: number; sessionId: number; finalContent: string }) => void) => () => void
      onCancelled: (callback: (payload: { taskId: number }) => void) => () => void
      onError: (callback: (payload: { taskId: number; error: string }) => void) => () => void
      // todo 16：托盘"新建任务"→ 打开 TaskPanel
      onOpenTasks: (callback: () => void) => () => void
    }
    cron: {
      list: () => Promise<{ name: string; intervalMs: number; running: boolean }[]>
      runNow: (name: string) => Promise<boolean>
      tasks: {
        list: () => Promise<{ id: number; name: string; type: 'code-review' | 'dependency-check' | 'backup'; interval_ms: number; enabled: boolean; config: Record<string, unknown>; last_run_at: string | null; created_at: string; running: boolean }[]>
        add: (data: { name: string; type: 'code-review' | 'dependency-check' | 'backup'; intervalMs: number; enabled?: boolean; config?: Record<string, unknown> }) => Promise<{ ok: boolean; id?: number; error?: string }>
        remove: (id: number) => Promise<{ ok: boolean; error?: string }>
        runNow: (id: number) => Promise<{ ok: boolean; error?: string }>
      }
    }
    steering: {
      steer: (params: { sessionId: number; text: string; priority?: string }) => Promise<{ text: string; priority: string; timestamp: number; processed: boolean }>
      followUp: (params: { sessionId: number; task: string | { text: string; context?: Record<string, unknown> } }) => Promise<{ id: string; text: string; status: string }>
      listSessions: () => Promise<number[]>
      planControl: {
        skipStep: (params: { sessionId: number; stepId: string }) => Promise<{ stepId: string; action: string }>
        retryStep: (params: { sessionId: number; stepId: string }) => Promise<{ stepId: string; action: string }>
      }
    }
    evolution: {
      runCycle: (params: { strategy?: string; auditTrail?: { name: string; args?: Record<string, unknown>; error?: string | null }[] }) => Promise<{ ok: boolean; result?: unknown; error?: string }>
      history: () => Promise<EvolutionEvent[]>
      strategy: {
        get: () => Promise<{ count: number; chars: number; maxChars: number; needsMerge: boolean; entries: { id: number; text: string }[]; file?: string; error?: string }>
        add: (text: string) => Promise<{ ok: boolean; id?: number; chars?: number; needsMerge?: boolean; reason?: string; duplicateOf?: number }>
        replace: (id: number, text: string) => Promise<{ ok: boolean; id?: number; chars?: number; needsMerge?: boolean; reason?: string; duplicateOf?: number }>
        remove: (id: number) => Promise<{ ok: boolean; removed?: number; chars?: number; needsMerge?: boolean; reason?: string }>
        reflectNow: () => Promise<{ ok: boolean; added?: number[]; replaced?: number[]; removed?: number[]; rejected?: string[]; needsMerge?: boolean; reason?: string; error?: string }>
      }
    }
    trajectory: {
      getStats: (sessionId: number) => Promise<{ totalCompressed: number; turnsSinceCompression: number }>
    }
  }
}
