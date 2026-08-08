// ─────────────────────────────────────────────────────────────────────────────
// backend.js  — ExecutionBackend registry
//
// A backend executes a long-running command (shell pipeline, build, agent run,
// docker container, remote ssh command, ...) OUTSIDE the renderer, returning
// an execId handle immediately. Callers poll status() — never block on
// execute(). Every backend MUST implement the same contract:
//
//   execute({ command, args, cwd, env, timeout, ... }) → { ok, execId?, error? }
//   status(execId) → { state, exitCode?, stdoutTail?, stderrTail?, ... }
//   terminate(execId) → { ok, error? }
//   pause(execId)    → { ok, supported, error? }   // supported=false = N/A
//   resume(execId)   → { ok, supported, error? }
//
// contract: execute() never throws — failures are returned as { ok:false }.
// ─────────────────────────────────────────────────────────────────────────────

const backends = new Map()

function registerBackend(backend) {
  if (!backend || typeof backend.id !== 'string') {
    throw new Error(`registerBackend: backend.id (string) is required`)
  }
  for (const fn of ['execute', 'status', 'terminate', 'pause', 'resume']) {
    if (typeof backend[fn] !== 'function') {
      throw new Error(`registerBackend(${backend.id}): missing ${fn}()`)
    }
  }
  backends.set(backend.id, backend)
}

/**
 * Resolve a backend by id. Unknown ids fall back to the 'local' backend so
 * callers never crash on a stale configured backend id.
 */
function getBackend(id) {
  return backends.get(id) || backends.get('local') || null
}

function listBackends() {
  return Array.from(backends.values()).map(({ id, name, supportsPause }) => ({
    id, name, supportsPause: !!supportsPause,
  }))
}

/** Convenience dispatch: execute on the resolved backend. */
async function executeOn(backendId, opts) {
  const backend = getBackend(backendId)
  if (!backend) return { ok: false, error: 'no execution backend available' }
  return backend.execute(opts)
}

module.exports = {
  registerBackend,
  getBackend,
  listBackends,
  executeOn,
}