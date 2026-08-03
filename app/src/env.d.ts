/// <reference types="vite/client" />

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
    }
    model: {
      list: (providerId: number) => Promise<Model[]>
      create: (data: Omit<Model, 'id' | 'created_at'>) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: Partial<Model>) => Promise<void>
      delete: (id: number) => Promise<void>
      fallbackChain: (providerId: number) => Promise<Model[]>
      listAll: () => Promise<Model[]>
      primary: () => Promise<{ id: number; provider_id: number } | null>
      suggest: (params: { sessionId: number; userMessage: string }) => Promise<{
        suggestedModelId: number | null
        reason: string
        heuristicScores?: { modelId: number; modelName: string; family: string; heuristic: number; eloScore: number | null; blended: number }[]
        confidence: number
      }>
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
      send: (params: { sessionId: number; content: string; modelId: number; mode?: string; personaId?: number | null; regenerate?: boolean; attachments?: { name: string; mime: string; dataUrl: string }[]; useTools?: boolean; agentMode?: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo'; effortLevel?: 'off' | 'low' | 'medium' | 'high'; genParams?: { maxTokens?: number; temperature?: number; topP?: number }; systemPrefix?: string }) => Promise<{ messageId: number; modelSuggestion?: { suggestedModelId: number | null; reason: string; confidence: number } | null }>
      onChunk: (callback: (payload: { messageId: number; delta: string; done: boolean; sessionId?: number }) => void) => () => void
      onToolCall: (callback: (payload: { messageId: number; sessionId: number; tool: { name: string; args: any; result: string | null; error: string | null; failure_kind?: string | null; recovery_hint?: { action: string; hint: string } | null; risk?: string | null; latencyMs?: number | null; diff?: string | null; after_snapshot?: { path: string; content: string; truncated: boolean } | null } }) => void) => () => void
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
      send: (params: { sessionId: number; content: string; modelIds: number[]; personaId?: number | null }) => Promise<{ results: ArenaResult[] }>
      vote: (data: { prompt: string; winnerModelId: number; winnerModelName: string; loserModelIds: number[]; loserModelNames: string[]; intent?: string }) => Promise<{ success: boolean }>
      scores: () => Promise<ModelScore[]>
      stop: () => Promise<void>
    }
    mcp: {
      list: () => Promise<{ id: number; name: string; command: string; args: string[]; env: Record<string, string>; enabled: number }[]>
      create: (data: { name: string; command: string; args?: string[]; env?: Record<string, string>; enabled?: number }) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: Partial<{ name: string; command: string; args: string[]; env: Record<string, string>; enabled: number }>) => Promise<{ success: boolean }>
      delete: (id: number) => Promise<{ success: boolean }>
      connect: (id: number) => Promise<{ success: boolean; tools?: { name: string; description: string; risk: string }[]; error?: string }>
      status: () => Promise<{ connected: string[] }>
    }
    settings: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
      getAll: () => Promise<Record<string, string>>
      onChanged: (callback: (key: string, value: string) => void) => () => void
    }
    memory: {
      list: () => Promise<{ id: number; content: string; type: string; created_at: string; access_count: number; last_accessed_at: string | null; source_session_id: number | null; confidence: number; conflicts_with: number | null }[]>
      create: (data: { content: string; type?: string; source_session_id?: number | null }) => Promise<{ lastInsertRowid: number }>
      update: (id: number, data: { content: string }) => Promise<void>
      delete: (id: number) => Promise<void>
      conflicts: () => Promise<{ memoryId: number; content: string; conflictingId: number; conflictingContent: string }[]>
      conflictResolve: (keepId: number, removeId: number) => Promise<{ ok: boolean }>
      access: (id: number) => Promise<void>
    }
    background: {
      set: (dataUrl: string | null) => Promise<{ success: boolean; hasImage?: boolean; error?: string }>
      get: () => Promise<string | null>
    }
    config: {
      export: (opts?: { includeSecrets?: boolean }) => Promise<{ success: boolean; bundle?: any; error?: string }>
      import: (bundle: any) => Promise<{ success: boolean; created?: { providers: number; models: number; personas: number }; skipped?: { providers: number; models: number; personas: number }; error?: string }>
    }
    protocol: {
      onOpen: (callback: (payload: { action: string }) => void) => () => void
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
    model: {
      routeTier: (params: { taskType: string; userMessage: string }) => Promise<{ tier: string; modelName: string | null; modelId: number | null; rationale: string }>
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
    }
    search: {
      messages: (query: string, sessionId?: number) => Promise<{ id: number; session_id: number; role: string; content: string; model_used: string | null; created_at: string; session_title?: string; terms?: string[] }[]>
    }
    moa: {
      getPresets: () => Promise<{ id: number; name: string; description: string; references_config: string; aggregator_model_id: number; enabled: number; created_at: string }[]>
      addPreset: (name: string, description: string, references: { model_id: number }[], aggregatorModelId: number) => Promise<{ lastInsertRowid: number }>
      deletePreset: (id: number) => Promise<void>
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
      start: (params: { content: string; modelId: number; agentMode?: 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' }) => Promise<{ taskId: number; sessionId: number; error?: string }>
      list: () => Promise<{ id: number; sessionId: number; status: 'running' | 'done' | 'cancelled' | 'error'; title: string; createdAt: number; finalContent?: string | null; error?: string | null }[]>
      cancel: (taskId: number) => Promise<{ ok: boolean }>
      getResult: (taskId: number) => Promise<{ status: string; finalContent: string | null } | null>
      onStarted: (callback: (payload: { id: number; sessionId: number; status: 'running' | 'done' | 'cancelled' | 'error'; title: string; createdAt: number; finalContent?: string | null; error?: string | null }) => void) => () => void
      onProgress: (callback: (payload: { taskId: number; type: 'tool-call' | 'plan-step' | 'status' | 'todo-update' | 'chunk'; payload: unknown }) => void) => () => void
      onDone: (callback: (payload: { taskId: number; sessionId: number; finalContent: string }) => void) => () => void
      onCancelled: (callback: (payload: { taskId: number }) => void) => () => void
      onError: (callback: (payload: { taskId: number; error: string }) => void) => () => void
    }
    cron: {
      list: () => Promise<{ name: string; intervalMs: number; running: boolean }[]>
      runNow: (name: string) => Promise<boolean>
    }
    steering: {
      steer: (params: { sessionId: number; text: string; priority?: string }) => Promise<{ text: string; priority: string; timestamp: number; processed: boolean }>
      followUp: (params: { sessionId: number; task: string | { text: string; context?: Record<string, unknown> } }) => Promise<{ id: string; text: string; status: string }>
      listSessions: () => Promise<number[]>
    }
    evolution: {
      runCycle: (params: { strategy?: string }) => Promise<{ ok: boolean; result?: unknown; error?: string }>
      history: () => Promise<unknown[]>
    }
    trajectory: {
      getStats: (sessionId: number) => Promise<{ totalCompressed: number; turnsSinceCompression: number }>
    }
  }
}