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
      send: (params: { sessionId: number; content: string; modelId: number; mode?: string; personaId?: number | null; regenerate?: boolean; attachments?: { name: string; mime: string; dataUrl: string }[]; useTools?: boolean; agentMode?: 'ask' | 'auto' | 'plan'; effortLevel?: 'off' | 'low' | 'medium' | 'high' }) => Promise<{ messageId: number }>
      onChunk: (callback: (payload: { messageId: number; delta: string; done: boolean; sessionId?: number }) => void) => () => void
      onToolCall: (callback: (payload: { messageId: number; sessionId: number; tool: { name: string; args: any; result: string | null; error: string | null } }) => void) => () => void
      onPermissionRequest: (callback: (payload: { reqId: string; messageId: number; sessionId: number; name: string; args: any; risk: 'safe' | 'dangerous' }) => void) => () => void
      replyPermission: (payload: { reqId: string; allowed: boolean }) => Promise<boolean>
      stop: () => Promise<void>
    }
    arena: {
      send: (params: { sessionId: number; content: string; modelIds: number[] }) => Promise<{ results: ArenaResult[] }>
      vote: (data: { prompt: string; winnerModelId: number; winnerModelName: string; loserModelIds: number[]; loserModelNames: string[]; intent?: string }) => Promise<{ success: boolean }>
      scores: () => Promise<ModelScore[]>
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
}
