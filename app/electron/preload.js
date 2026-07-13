const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    get: (id) => ipcRenderer.invoke('provider:get', id),
    create: (data) => ipcRenderer.invoke('provider:create', data),
    update: (id, data) => ipcRenderer.invoke('provider:update', id, data),
    delete: (id) => ipcRenderer.invoke('provider:delete', id),
    testConnection: (id) => ipcRenderer.invoke('provider:test-connection', id),
    fetchModels: (id) => ipcRenderer.invoke('provider:fetch-models', id),
  },
  model: {
    list: (providerId) => ipcRenderer.invoke('model:list', providerId),
    create: (data) => ipcRenderer.invoke('model:create', data),
    update: (id, data) => ipcRenderer.invoke('model:update', id, data),
    delete: (id) => ipcRenderer.invoke('model:delete', id),
    fallbackChain: (providerId) => ipcRenderer.invoke('model:fallback-chain', providerId),
    listAll: () => ipcRenderer.invoke('model:list-all'),
    primary: () => ipcRenderer.invoke('model:primary'),
  },
  persona: {
    list: () => ipcRenderer.invoke('persona:list'),
    create: (data) => ipcRenderer.invoke('persona:create', data),
    update: (id, data) => ipcRenderer.invoke('persona:update', id, data),
    delete: (id) => ipcRenderer.invoke('persona:delete', id),
    import: (data) => ipcRenderer.invoke('persona:import', data),
    export: (id) => ipcRenderer.invoke('persona:export', id),
  },
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    create: (data) => ipcRenderer.invoke('session:create', data),
    rename: (id, title) => ipcRenderer.invoke('session:rename', id, title),
    pin: (id, pinned) => ipcRenderer.invoke('session:pin', id, pinned),
    delete: (id) => ipcRenderer.invoke('session:delete', id),
    touch: (id) => ipcRenderer.invoke('session:touch', id),
    getConfig: (id) => ipcRenderer.invoke('session:get-config', id),
    setConfig: (id, config) => ipcRenderer.invoke('session:set-config', id, config),
  },
  message: {
    list: (sessionId) => ipcRenderer.invoke('message:list', sessionId),
  },
  chat: {
    send: (params) => ipcRenderer.invoke('chat:send', params),
    onChunk: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:stream-chunk', handler)
      return () => ipcRenderer.removeListener('chat:stream-chunk', handler)
    },
    onToolCall: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:tool-call', handler)
      return () => ipcRenderer.removeListener('chat:tool-call', handler)
    },
    onPlanStep: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:plan-step', handler)
      return () => ipcRenderer.removeListener('chat:plan-step', handler)
    },
    onPermissionRequest: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:permission-request', handler)
      return () => ipcRenderer.removeListener('chat:permission-request', handler)
    },
    onPermissionExpired: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:permission-expired', handler)
      return () => ipcRenderer.removeListener('chat:permission-expired', handler)
    },
    replyPermission: (payload) => ipcRenderer.invoke('chat:permission-reply', payload),
    stop: () => ipcRenderer.invoke('chat:stop'),
  },
  arena: {
    send: (params) => ipcRenderer.invoke('arena:send', params),
    vote: (data) => ipcRenderer.invoke('arena:vote', data),
    scores: () => ipcRenderer.invoke('arena:scores'),
    stop: () => ipcRenderer.invoke('arena:stop'),
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    create: (data) => ipcRenderer.invoke('mcp:create', data),
    update: (id, data) => ipcRenderer.invoke('mcp:update', id, data),
    delete: (id) => ipcRenderer.invoke('mcp:delete', id),
    connect: (id) => ipcRenderer.invoke('mcp:connect', id),
    status: () => ipcRenderer.invoke('mcp:status'),
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    onChanged: (callback) => {
      const handler = (_e, key, value) => callback(key, value)
      ipcRenderer.on('settings:changed', handler)
      return () => ipcRenderer.removeListener('settings:changed', handler)
    },
  },
  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    create: (data) => ipcRenderer.invoke('memory:create', data),
    update: (id, data) => ipcRenderer.invoke('memory:update', id, data),
    delete: (id) => ipcRenderer.invoke('memory:delete', id),
  },
  background: {
    set: (dataUrl) => ipcRenderer.invoke('background:set', dataUrl),
    get: () => ipcRenderer.invoke('background:get'),
  },
  config: {
    export: (opts) => ipcRenderer.invoke('config:export', opts),
    import: (bundle) => ipcRenderer.invoke('config:import', bundle),
  },
  agent: {
    getWorkspace: () => ipcRenderer.invoke('agent:workspace:get'),
    setWorkspace: (dir) => ipcRenderer.invoke('agent:workspace:set', dir),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    rescan: () => ipcRenderer.invoke('skills:rescan'),
  },
})
