const { contextBridge, ipcRenderer } = require('electron')

// app.getLocale() requires the app to be ready. Lazily resolve it on first
// access so the preload doesn't crash during module load in sandbox mode.
let _locale = null
function getLocale() {
  if (_locale === null) {
    try { _locale = require('electron').app.getLocale() } catch { _locale = 'en-US' }
  }
  return _locale
}

contextBridge.exposeInMainWorld('electronAPI', {
  sys: { locale: getLocale() },
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
    createAndSelect: (opts) => ipcRenderer.invoke('session:create-and-select', opts),
    rename: (id, title) => ipcRenderer.invoke('session:rename', id, title),
    pin: (id, pinned) => ipcRenderer.invoke('session:pin', id, pinned),
    delete: (id) => ipcRenderer.invoke('session:delete', id),
    touch: (id) => ipcRenderer.invoke('session:touch', id),
    getConfig: (id) => ipcRenderer.invoke('session:get-config', id),
    setConfig: (id, config) => ipcRenderer.invoke('session:set-config', id, config),
  },
  message: {
    list: (sessionId) => ipcRenderer.invoke('message:list', sessionId),
    update: (id, data) => ipcRenderer.invoke('message:update', id, data),
    deleteAfter: (sessionId, afterId) => ipcRenderer.invoke('message:delete-after', sessionId, afterId),
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
    onTodoUpdate: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:todo-update', handler)
      return () => ipcRenderer.removeListener('chat:todo-update', handler)
    },
    onStatus: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:status', handler)
      return () => ipcRenderer.removeListener('chat:status', handler)
    },
    onQuestion: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:question', handler)
      return () => ipcRenderer.removeListener('chat:question', handler)
    },
    onQuestionExpired: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:question-expired', handler)
      return () => ipcRenderer.removeListener('chat:question-expired', handler)
    },
    replyQuestion: (payload) => ipcRenderer.invoke('chat:question-reply', payload),
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
    replyPermission: (payload) => ipcRenderer.send('chat:permission-reply', payload),
    onHabitProposed: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('chat:habit-proposed', handler)
      return () => ipcRenderer.removeListener('chat:habit-proposed', handler)
    },
    confirmHabit: (key) => ipcRenderer.invoke('chat:habit-confirm', key),
    dismissHabit: (key) => ipcRenderer.invoke('chat:habit-dismiss', key),
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
  protocol: {
    onOpen: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('protocol:open', handler)
      return () => ipcRenderer.removeListener('protocol:open', handler)
    },
  },
  agent: {
    getWorkspace: () => ipcRenderer.invoke('agent:workspace:get'),
    setWorkspace: (dir) => ipcRenderer.invoke('agent:workspace:set', dir),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    rescan: () => ipcRenderer.invoke('skills:rescan'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    status: () => ipcRenderer.invoke('updater:status'),
    onUpdateAvailable: (cb) => {
      const h = (_e, p) => cb(p); ipcRenderer.on('updater:update-available', h)
      return () => ipcRenderer.removeListener('updater:update-available', h)
    },
    onUpdateDownloaded: (cb) => {
      const h = (_e, p) => cb(p); ipcRenderer.on('updater:update-downloaded', h)
      return () => ipcRenderer.removeListener('updater:update-downloaded', h)
    },
    onProgress: (cb) => {
      const h = (_e, p) => cb(p); ipcRenderer.on('updater:progress', h)
      return () => ipcRenderer.removeListener('updater:progress', h)
    },
    onUpToDate: (cb) => {
      const h = (_e, p) => cb(p); ipcRenderer.on('updater:up-to-date', h)
      return () => ipcRenderer.removeListener('updater:up-to-date', h)
    },
  },
  usage: {
    stats: (range) => ipcRenderer.invoke('usage:stats', range),
    byProvider: (range) => ipcRenderer.invoke('usage:by-provider', range),
    byModel: (range) => ipcRenderer.invoke('usage:by-model', range),
    daily: (range) => ipcRenderer.invoke('usage:daily', range),
    log: (range) => ipcRenderer.invoke('usage:log', range),
  },
})
