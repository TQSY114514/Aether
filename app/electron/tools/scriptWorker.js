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

if (process.stdout) {
  process.stdout.on('error', () => { /* parent closed pipe */ })
}

function sendFrame(frame, onWritten) {
  let called = false
  const done = () => {
    if (called) return
    called = true
    if (typeof onWritten === 'function') onWritten()
  }
  try {
    const payload = JSON.stringify(frame) + '\n'
    if (!process.stdout || process.stdout.destroyed || !process.stdout.writable) {
      done()
      return
    }
    if (typeof onWritten === 'function') {
      process.stdout.write(payload, done)
    } else {
      process.stdout.write(payload)
    }
  } catch {
    done()
  }
}

function sendFrameAndFlush(frame) {
  return new Promise((resolve) => sendFrame(frame, resolve))
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

function parseSerializedResult(payloadJson) {
  try {
    const parsed = JSON.parse(String(payloadJson || '{}'))
    if (parsed && typeof parsed === 'object') {
      return {
        ok: Boolean(parsed.ok),
        value: parsed.value === undefined ? null : parsed.value,
        error: parsed.error ? String(parsed.error) : null,
      }
    }
  } catch { /* fall through */ }
  return { ok: false, value: null, error: 'Script returned an invalid response payload' }
}

async function executeRun({ code, inputs }) {
  const logs = []
  const pushLog = (level, line) => {
    if (logs.length >= MAX_LOG_LINES) return
    const text = String(line === undefined ? '' : line).slice(0, MAX_LOG_CHARS)
    logs.push(level === 'log' ? text : `[${level}] ${text}`)
  }

  let safeInputsJson = '{}'
  try {
    const serialized = JSON.stringify(inputs === undefined ? {} : inputs)
    safeInputsJson = serialized === undefined ? '{}' : serialized
  } catch {
    safeInputsJson = '{}'
  }

  // Host callbacks cross the VM boundary strictly with primitive strings so no
  // host Error, prototype, or object reference ever enters the sandbox realm.
  const dispatchTool = (name, argsJson, onResolve, onReject) => {
    try {
      const id = ++callSeq
      pendingCalls.set(id, {
        resolve: (payloadJson) => {
          try { onResolve(String(payloadJson)) } catch { /* ignore */ }
        },
        reject: (errMsg) => {
          try { onReject(String(errMsg || 'tool error')) } catch { /* ignore */ }
        },
      })
      let parsedArgs = {}
      try {
        const parsed = argsJson ? JSON.parse(String(argsJson)) : {}
        parsedArgs = parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        parsedArgs = {}
      }
      sendFrame({ type: 'tool_call', id, name: String(name || ''), args: parsedArgs })
    } catch {
      try { onReject('Failed to dispatch tool call') } catch { /* ignore */ }
    }
  }

  const logLine = (level, line) => {
    try {
      pushLog(String(level || 'log'), line)
    } catch { /* ignore */ }
  }

  // Null-prototype context object + codeGeneration disabled prevents host
  // Function/constructor traversal (`globalThis.constructor.constructor`, etc.).
  const sandbox = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  })

  const bootstrapBody = `
    "use strict";
    const freeze = Object.freeze;
    const ownKeys = Object.keys;
    const createNull = Object.create;
    const jsonParse = JSON.parse;
    const jsonStringify = JSON.stringify;
    const VmPromise = Promise;
    const vmPromiseThen = Promise.prototype.then;
    const VmError = Error;
    const VmProxy = Proxy;
    const toString = String;
    const arrayMap = Array.prototype.map;
    const arrayJoin = Array.prototype.join;
    const applyFn = Reflect.apply;

    const deepFreeze = (obj) => {
      if (obj && typeof obj === 'object') {
        freeze(obj);
        const keys = ownKeys(obj);
        for (let i = 0; i < keys.length; i++) {
          deepFreeze(obj[keys[i]]);
        }
      }
      return obj;
    };

    const safeInputs = deepFreeze(jsonParse(inputsJson || '{}'));

    const fmt = (v) => {
      if (typeof v === 'string') return v;
      if (v === undefined) return 'undefined';
      if (v === null) return 'null';
      try { return jsonStringify(v); } catch {
        try { return toString(v); } catch { return '[unprintable]'; }
      }
    };

    const safeConsole = freeze({
      log: (...a) => logLine('log', applyFn(arrayJoin, applyFn(arrayMap, a, [fmt]), [' '])),
      info: (...a) => logLine('info', applyFn(arrayJoin, applyFn(arrayMap, a, [fmt]), [' '])),
      warn: (...a) => logLine('warn', applyFn(arrayJoin, applyFn(arrayMap, a, [fmt]), [' '])),
      error: (...a) => logLine('error', applyFn(arrayJoin, applyFn(arrayMap, a, [fmt]), [' '])),
      debug: (...a) => logLine('debug', applyFn(arrayJoin, applyFn(arrayMap, a, [fmt]), [' '])),
    });

    const toolsProxy = new VmProxy(createNull(null), {
      get(_target, prop) {
        if (
          typeof prop !== 'string' ||
          prop === 'then' ||
          prop === 'constructor' ||
          prop === 'toString' ||
          prop === 'valueOf' ||
          prop.startsWith('__')
        ) {
          return undefined;
        }
        return (args) => new VmPromise((resolve, reject) => {
          let serialized = '{}';
          try {
            const out = jsonStringify(args === undefined ? {} : args);
            serialized = out === undefined ? '{}' : out;
          } catch (e) {
            const msg = e && typeof e.message === 'string' ? e.message : toString(e);
            reject(new VmError('Failed to serialize tool arguments: ' + msg));
            return;
          }
          dispatchTool(
            prop,
            serialized,
            (resJson) => {
              try {
                resolve(jsonParse(resJson));
              } catch {
                resolve(resJson);
              }
            },
            (errMsg) => reject(new VmError(errMsg))
          );
        });
      }
    });

    const toSerializable = (val) => {
      if (val === undefined) return null;
      try {
        const json = jsonStringify(val);
        return json === undefined ? null : jsonParse(json);
      } catch {
        try {
          return toString(val);
        } catch {
          return '[unserializable]';
        }
      }
    };

    const extractErrMsg = (err) => {
      try {
        if (err && typeof err === 'object' && typeof err.message === 'string') return err.message;
        return toString(err);
      } catch {
        return 'Script execution failed';
      }
    };

    try {
      const promise = userFn(safeInputs, toolsProxy, safeConsole);
      applyFn(vmPromiseThen, promise, [
        (val) => {
          finishRun(jsonStringify({ ok: true, value: toSerializable(val) }));
        },
        (err) => {
          finishRun(jsonStringify({ ok: false, error: extractErrMsg(err) }));
        }
      ]);
    } catch (syncErr) {
      finishRun(jsonStringify({ ok: false, error: extractErrMsg(syncErr) }));
    }
  `

  try {
    const userFn = vm.compileFunction(
      `"use strict";\nreturn (async function(inputs, tools, console) {\n${String(code || '')}\n})(inputs, tools, console);`,
      ['inputs', 'tools', 'console'],
      { parsingContext: sandbox, filename: 'agent-script.js' }
    )
    const bootstrapFactory = vm.compileFunction(
      bootstrapBody,
      ['userFn', 'dispatchTool', 'logLine', 'inputsJson', 'finishRun'],
      { parsingContext: sandbox, filename: 'script-bootstrap.js' }
    )

    const resultPayload = await new Promise((resolve) => {
      let settled = false
      const finishRun = (payloadJson) => {
        if (settled) return
        settled = true
        resolve(parseSerializedResult(payloadJson))
      }
      bootstrapFactory(userFn, dispatchTool, logLine, safeInputsJson, finishRun)
    })

    if (resultPayload.ok) {
      await sendFrameAndFlush({
        type: 'result',
        ok: true,
        value: safeSerializeValue(resultPayload.value),
        logs,
      })
    } else {
      await sendFrameAndFlush({
        type: 'result',
        ok: false,
        error: resultPayload.error || 'Script execution failed',
        logs,
      })
    }
  } catch (err) {
    await sendFrameAndFlush({
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
