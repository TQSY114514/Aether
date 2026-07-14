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
      rename: (id: number, title: string) => Promise<void>
      pin: (id: number, pinned: number) => Promise<void>
      delete: (id: number) => Promise<void>
      touch: (id: number) => Promise<void>
      getConfig: (id: number) => Promise<{ providerId: number | null; modelId: number | null; personaId: number | null } | null>
      setConfig: (id: number, config: any) => Promise<void>
    }
    message: {
      list: (sessionId: number) => Promise<Message[]>
    }
    chat: {
      send: (params: { sessionId: number; content: string; modelId: number; mode?: string; personaId?: number | null; regenerate?: boolean; attachments?: { name: string; mime: string; dataUrl: string }[]; useTools?: boolean; agentMode?: 'off' | 'plan' | 'ask' | 'auto' | 'yolo'; effortLevel?: 'off' | 'low' | 'medium' | 'high'; genParams?: { maxTokens?: number; temperature?: number; topP?: number }; systemPrefix?: string }) => Promise<{ messageId: number }>
      onChunk: (callback: (payload: { messageId: number; delta: string; done: boolean; sessionId?: number }) => void) => () => void
      onToolCall: (callback: (payload: { messageId: number; sessionId: number; tool: { name: string; args: any; result: string | null; error: string | null } }) => void) => () => void
      onPlanStep: (callback: (payload: { messageId: number; sessionId: number; step: { step: number; depth: number; assistantText: string } }) => void) => () => void
      onTodoUpdate: (callback: (payload: { messageId: number; sessionId: number; todos: { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }[] }) => void) => () => void
      onStatus: (callback: (payload: { messageId: number; sessionId: number; text: string; kind?: string }) => void) => () => void
      onQuestion: (callback: (payload: { reqId: string; sessionId: number; questions: { question: string; header?: string; options: { label: string; description?: string }[] }[] }) => void) => () => void
      onQuestionExpired: (callback: (payload: { reqId: string }) => void) => () => void
      replyQuestion: (payload: { reqId: string; answers: { question: string; answer: string }[] }) => Promise<boolean>
      onPermissionRequest: (callback: (payload: { reqId: string; messageId: number; sessionId: number; name: string; args: any; risk: 'safe' | 'dangerous' }) => void) => () => void
      onPermissionExpired: (callback: (payload: { reqId: string }) => void) => () => void
      replyPermission: (payload: { reqId: string; allowed: boolean }) => Promise<boolean>
      stop: () => Promise<void>
    }
    arena: {
      send: (params: { sessionId: number; content: string; modelIds: number[] }) => Promise<{ results: ArenaResult[] }>
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
    }
  }
  memory: {
    list: () => Promise<{ id: number; content: string; created_at: string }[]>
    create: (data: { content: string }) => Promise<{ lastInsertRowid: number }>
    update: (id: number, data: { content: string }) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  background: {
    set: (dataUrl: string | null) => Promise<{ success: boolean; hasImage?: boolean; error?: string }>
    get: () => Promise<string | null>
  }
  config: {
    export: (opts?: { includeSecrets?: boolean }) => Promise<{ success: boolean; bundle?: any; error?: string }>
    import: (bundle: any) => Promise<{ success: boolean; created?: { providers: number; models: number; personas: number }; skipped?: { providers: number; models: number; personas: number }; error?: string }>
  }
  agent: {
    getWorkspace: () => Promise<string>
    setWorkspace: (dir: string | null) => Promise<{ success: boolean; root: string }>
  }
  skills: {
    list: () => Promise<{ name: string; description: string; filePath: string }[]>
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
  }
  usage: {
    stats: (range?: { since?: string; until?: string }) => Promise<{ requests: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost: number; latency_avg: number }>
    byProvider: (range?: { since?: string; until?: string }) => Promise<{ provider_name: string; requests: number; total_tokens: number; cost: number }[]>
    byModel: (range?: { since?: string; until?: string }) => Promise<{ model_name: string; requests: number; total_tokens: number; cost: number }[]>
    daily: (range?: { since?: string; until?: string }) => Promise<{ day: string; requests: number; total_tokens: number; cost: number }[]>
    log: (range?: { since?: string; until?: string; limit?: number }) => Promise<any[]>
  }
}
