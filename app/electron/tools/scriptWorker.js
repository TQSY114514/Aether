// ───────────────────────────────────────────────────────────────────────────
// Isolated VM worker process for `run_script`.
//
// Spawned by `scriptRunner.js` with minimal sanitized env (zero API keys)
// and stdin/stdout JSONL RPC. Runs LLM-authored JS inside a strict `vm`
// context with `codeGeneration: { strings: false, wasm: false }`, zero access
// to `require`, `process`, `fs`, `net`, or host object prototypes, exposing
// only `inputs`, `console`, and a `tools.<name>(args)` JSONL RPC proxy.
// ───────────────────────────────────────────────────────────────────────────
'use strict'

const vm = require('vm')
const readline = require('readline')

const MAX_LOG_LINES = 200
const MAX_LOG_CHARS = 1000

function sendFrame(frame) {
  try {
    process.stdout.write(JSON.stringify(frame) + '\n')
  } catch { /* parent closed pipe */ }
}

function formatArg(val) {
  if (typeof val === 'string') return val
  if (val === undefined) return 'undefined'
  if (val === null) return 'null'
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

function safeSerializeValue(val) {
  if (val === undefined) return null
  try {
    const json = JSON.stringify(val)
    return json === undefined ? null : JSON.parse(json)
  } catch {
    return String(val)
  }
}

const pendingCalls = new Map()
let callSeq = 0
let started = false

async function executeRun({ code, inputs }) {
  const logs = []
  const pushLog = (level, args) => {
    if (logs.length >= MAX_LOG_LINES) return
    const text = Array.from(args).map(formatArg).join(' ').slice(0, MAX_LOG_CHARS)
    logs.push(level === 'log' ? text : `[${level}] ${text}`)
  }

  // Host dispatch bridge — crosses the boundary via serialized JSON strings only
  // so no host object prototypes ever enter the sandbox realm.
  const dispatchToolJson = (name, argsJson, onResolve, onReject) => {
    const id = ++callSeq
    pendingCalls.set(id, {
      resolve: (payloadJson) => onResolve(String(payloadJson)),
      reject: (errMsg) => onReject(String(errMsg || 'tool error')),
    })
    let parsedArgs = {}
    try {
      const parsed = argsJson ? JSON.parse(argsJson) : {}
      parsedArgs = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      parsedArgs = {}
    }
    sendFrame({ type: 'tool_call', id, name: String(name || ''), args: parsedArgs })
  }

  const hostBridge = Object.freeze({
    dispatchToolJson,
    log: (level, line) => pushLog(level, [line]),
    inputsJson: JSON.stringify(inputs === undefined ? {} : inputs),
  })

  const sandbox = vm.createContext(
    {
      __bridge: hostBridge,
      setTimeout,
      clearTimeout,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
    },
    { codeGeneration: { strings: false, wasm: false } }
  )

  // Construct `inputs`, `console`, and `tools` Proxy entirely inside the VM realm.
  const bootstrapCode = `
    (function(__b) {
      "use strict";
      const safeInputs = Object.freeze(JSON.parse(__b.inputsJson || '{}'));
      const fmt = (v) => {
        if (typeof v === 'string') return v;
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        try { return JSON.stringify(v); } catch { return String(v); }
      };
      const safeConsole = Object.freeze({
        log: (...a) => __b.log('log', a.map(fmt).join(' ')),
        info: (...a) => __b.log('info', a.map(fmt).join(' ')),
        warn: (...a) => __b.log('warn', a.map(fmt).join(' ')),
        error: (...a) => __b.log('error', a.map(fmt).join(' ')),
        debug: (...a) => __b.log('debug', a.map(fmt).join(' ')),
      });
      const toolsProxy = new Proxy(Object.create(null), {
        get(_target, prop) {
          if (typeof prop !== 'string' || prop === 'then' || prop.startsWith('__')) return undefined;
          return (args) => new Promise((resolve, reject) => {
            let serialized = '{}';
            try { serialized = JSON.stringify(args === undefined ? {} : args); } catch (e) {
              reject(new Error('Failed to serialize tool arguments: ' + (e && e.message ? e.message : String(e))));
              return;
            }
            __b.dispatchToolJson(
              prop,
              serialized,
              (resJson) => {
                try {
                  const parsed = JSON.parse(resJson);
                  resolve(parsed);
                } catch {
                  resolve(resJson);
                }
              },
              (errMsg) => reject(new Error(errMsg))
            );
          });
        }
      });
      return { inputs: safeInputs, tools: toolsProxy, console: safeConsole };
    })(__bridge);
  `

  try {
    const envObjs = vm.runInContext(bootstrapCode, sandbox, { filename: 'script-bootstrap.js' })
    vm.runInContext('delete globalThis.__bridge;', sandbox)

    sandbox.__runEnv = envObjs
    const userWrapper = `(async function(inputs, tools, console) { "use strict";\n${String(code || '')}\n})(__runEnv.inputs, __runEnv.tools, __runEnv.console)`
    const value = await vm.runInContext(userWrapper, sandbox, { filename: 'agent-script.js' })
    sendFrame({
      type: 'result',
      ok: true,
      value: safeSerializeValue(value),
      logs,
    })
  } catch (err) {
    sendFrame({
      type: 'result',
      ok: false,
      error: err && err.message ? err.message : String(err),
      logs,
    })
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    return
  }
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'run' && !started) {
    started = true
    executeRun({ code: msg.code, inputs: msg.inputs }).finally(() => {
      try { rl.close() } catch { /* ignore */ }
      setImmediate(() => process.exit(0))
    })
    return
  }

  if (msg.type === 'tool_result' && msg.id != null) {
    const entry = pendingCalls.get(msg.id)
    if (!entry) return
    pendingCalls.delete(msg.id)
    if (msg.ok) {
      entry.resolve(JSON.stringify(msg.result ?? ''))
    } else {
      entry.reject(msg.error || 'Tool call failed')
    }
  }
})

rl.on('close', () => {
  for (const entry of pendingCalls.values()) {
    entry.reject('Worker stdin closed')
  }
  pendingCalls.clear()
})
