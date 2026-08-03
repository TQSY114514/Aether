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

// Wrap ipcRenderer.on with automatic listener cleanup. The returned function
// unsubscribes, so callers can wire it straight into useEffect cleanup.
function subscribe(channel, callback) {
  const handler = (_e, ...args) => callback(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
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
  agent: {
    getWorkspace: (sessionId) => ipcRenderer.invoke('agent:workspace:get', sessionId),
    setWorkspace: (opts) => ipcRenderer.invoke('agent:workspace:set', typeof opts === 'string' ? { dir: opts } : opts),
    reindexProject: () => ipcRenderer.invoke('agent:project:reindex'),
    hasProjectInstructions: () => ipcRenderer.invoke('agent:has-project-instructions'),
    listCheckpoints: (sessionId) => ipcRenderer.invoke('agent:checkpoint:list', sessionId),
    getCheckpoint: (id) => ipcRenderer.invoke('agent:checkpoint:get', id),
    deleteCheckpoint: (id) => ipcRenderer.invoke('agent:checkpoint:delete', id),
    cleanupCheckpoints: (sessionId) => ipcRenderer.invoke('agent:checkpoint:cleanup', sessionId),
  },
  model: {
    list: (providerId) => ipcRenderer.invoke('model:list', providerId),
    create: (data) => ipcRenderer.invoke('model:create', data),
    update: (id, data) => ipcRenderer.invoke('model:update', id, data),
    delete: (id) => ipcRenderer.invoke('model:delete', id),
    fallbackChain: (providerId) => ipcRenderer.invoke('model:fallback-chain', providerId),
    listAll: () => ipcRenderer.invoke('model:list-all'),
    primary: () => ipcRenderer.invoke('model:primary'),
    suggest: (params) => ipcRenderer.invoke('model:suggest', params),
    routeTier: (params) => ipcRenderer.invoke('model:route-tier', params),
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
    deleteArena: (sessionId) => ipcRenderer.invoke('message:delete-arena', sessionId),
    addNormal: (msg) => ipcRenderer.invoke('message:add-normal', msg),
  },
  chat: {
    send: (params) => ipcRenderer.invoke('chat:send', params),
    onChunk: (cb) => subscribe('chat:stream-chunk', cb),
    onToolCall: (cb) => subscribe('chat:tool-call', cb),
    onPlanStep: (cb) => subscribe('chat:plan-step', cb),
    onTodoUpdate: (cb) => subscribe('chat:todo-update', cb),
    onStatus: (cb) => subscribe('chat:status', cb),
    onQuestion: (cb) => subscribe('chat:question', cb),
    onQuestionExpired: (cb) => subscribe('chat:question-expired', cb),
    replyQuestion: (payload) => ipcRenderer.invoke('chat:question-reply', payload),
    onPermissionRequest: (cb) => subscribe('chat:permission-request', cb),
    onPermissionExpired: (cb) => subscribe('chat:permission-expired', cb),
    replyPermission: (payload) => ipcRenderer.invoke('chat:permission-reply', payload),
    onToolStream: (cb) => subscribe('chat:tool-stream', cb),
    onHabitProposed: (cb) => subscribe('chat:habit-proposed', cb),
    confirmHabit: (key) => ipcRenderer.invoke('chat:habit-confirm', key),
    dismissHabit: (key) => ipcRenderer.invoke('chat:habit-dismiss', key),
    onHabitSuggestion: (cb) => subscribe('chat:habit-suggestion', cb),
    onContextBudget: (cb) => subscribe('chat:context-budget', cb),
    onThinkingStart: (cb) => subscribe('chat:thinking-start', cb),
    onThinkingEnd: (cb) => subscribe('chat:thinking-end', cb),
    onThinkingChunk: (cb) => subscribe('chat:thinking-chunk', cb),
    stop: (sessionId) => ipcRenderer.invoke('chat:stop', sessionId),
    inject: (payload) => ipcRenderer.invoke('chat:inject', payload),
    onInjectionQueued: (cb) => subscribe('chat:injection-queued', cb),
    onToolLoopStart: (cb) => subscribe('chat:tool-loop-start', cb),
    onToolLoopEnd: (cb) => subscribe('chat:tool-loop-end', cb),
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
    onChanged: (cb) => subscribe('settings:changed', cb),
  },
  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    create: (data) => ipcRenderer.invoke('memory:create', data),
    update: (id, data) => ipcRenderer.invoke('memory:update', id, data),
    delete: (id) => ipcRenderer.invoke('memory:delete', id),
    conflicts: () => ipcRenderer.invoke('memory:conflicts'),
    conflictResolve: (keepId, removeId) => ipcRenderer.invoke('memory:conflict:resolve', keepId, removeId),
    access: (id) => ipcRenderer.invoke('memory:access', id),
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
    onOpen: (cb) => subscribe('protocol:open', cb),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    rescan: () => ipcRenderer.invoke('skills:rescan'),
    stats: () => ipcRenderer.invoke('skills:stats'),
    record: (name, success) => ipcRenderer.invoke('skills:record', name, success),
    autoDraft: (name, description) => ipcRenderer.invoke('skills:autoDraft', name, description),
    getUsage: () => ipcRenderer.invoke('skills:getUsage'),
    updateState: (name, state) => ipcRenderer.invoke('skills:updateState', name, state),
    pin: (name, pinned) => ipcRenderer.invoke('skills:pin', name, pinned),
  },
  search: {
    messages: (query, sessionId) => ipcRenderer.invoke('search:messages', { query, sessionId }),
  },
  moa: {
    getPresets: () => ipcRenderer.invoke('moa:getPresets'),
    addPreset: (name, description, references, aggregatorModelId) => ipcRenderer.invoke('moa:addPreset', { name, description, references, aggregatorModelId }),
    deletePreset: (id) => ipcRenderer.invoke('moa:deletePreset', id),
  },
  commands: {
    list: () => ipcRenderer.invoke('commands:list'),
    rescan: () => ipcRenderer.invoke('commands:rescan'),
  },
  task: {
    start: (params) => ipcRenderer.invoke('task:start', params),
    list: () => ipcRenderer.invoke('task:list'),
    cancel: (taskId) => ipcRenderer.invoke('task:cancel', taskId),
    getResult: (taskId) => ipcRenderer.invoke('task:get-result', taskId),
    onStarted: (cb) => subscribe('task:started', cb),
    onProgress: (cb) => subscribe('task:progress', cb),
    onDone: (cb) => subscribe('task:done', cb),
    onCancelled: (cb) => subscribe('task:cancelled', cb),
    onError: (cb) => subscribe('task:error', cb),
  },
  cron: {
    list: () => ipcRenderer.invoke('cron:list'),
    runNow: (name) => ipcRenderer.invoke('cron:run-now', name),
  },
  steering: {
    steer: (params) => ipcRenderer.invoke('steering:steer', params),
    followUp: (params) => ipcRenderer.invoke('steering:follow-up', params),
    listSessions: () => ipcRenderer.invoke('steering:list-sessions'),
  },
  evolution: {
    runCycle: (params) => ipcRenderer.invoke('evolution:run-cycle', params),
    history: () => ipcRenderer.invoke('evolution:history'),
  },
  trajectory: {
    getStats: (sessionId) => ipcRenderer.invoke('trajectory:stats', sessionId),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    status: () => ipcRenderer.invoke('updater:status'),
    onUpdateAvailable: (cb) => subscribe('updater:update-available', cb),
    onUpdateDownloaded: (cb) => subscribe('updater:update-downloaded', cb),
    onProgress: (cb) => subscribe('updater:progress', cb),
    onUpToDate: (cb) => subscribe('updater:up-to-date', cb),
    onError: (cb) => subscribe('updater:error', cb),
  },
  usage: {
    stats: (range) => ipcRenderer.invoke('usage:stats', range),
    byProvider: (range) => ipcRenderer.invoke('usage:by-provider', range),
    byModel: (range) => ipcRenderer.invoke('usage:by-model', range),
    daily: (range) => ipcRenderer.invoke('usage:daily', range),
    log: (range) => ipcRenderer.invoke('usage:log', range),
  },
  audit: {
    log: (params) => ipcRenderer.invoke('audit:log', params),
  },
  agentCheckpoint: {
    list: (params) => ipcRenderer.invoke('agent-checkpoint:list', params),
    rollback: (params) => ipcRenderer.invoke('agent-checkpoint:rollback', params),
  },
  trust: {
    badge: (params) => ipcRenderer.invoke('trust:badge', params),
  },
})
