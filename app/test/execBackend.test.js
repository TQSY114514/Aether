// ─── ExecutionBackend registry + local/docker/ssh backend contract tests ───
// Pure Node tests (no electron): registry shape, local spawn lifecycle
// (execute → status → terminate), graceful degradation when docker/ssh are
// unavailable, and honest supported:false answers on Windows pause/resume.

import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'child_process'

// Assemble the registry locally: under vitest, ESM import and CJS require
// resolve to separate module instances, so a side-effect `import index` would
// register backends on an instance this test file does not see. Registering
// here pins the same instance for the assertions below.
import {
  registerBackend,
  getBackend,
  listBackends,
  executeOn,
} from '../electron/exec/backend'
import { localBackend } from '../electron/exec/localBackend'
import { dockerBackend } from '../electron/exec/dockerBackend'
import { sshBackend } from '../electron/exec/sshBackend'

beforeAll(() => {
  for (const b of [localBackend, dockerBackend, sshBackend]) registerBackend(b)
})

const IS_WIN = process.platform === 'win32'

// ─── Registry ──────────────────────────────────────────────────────────────

describe('ExecutionBackend registry', () => {
  it('knows all built-in backends', () => {
    const ids = listBackends().map(b => b.id).sort()
    expect(ids).toEqual(['docker', 'local', 'ssh'])
  })

  it('resolves by id and falls back to local for unknown ids', () => {
    expect(getBackend('local').id).toBe('local')
    expect(getBackend('docker').id).toBe('docker')
    expect(getBackend('ssh').id).toBe('ssh')
    expect(getBackend('nope')).toBe(localBackend)
  })

  it('rejects registrations that break the contract', () => {
    expect(() => registerBackend({ id: 'broken' })).toThrow(/missing execute/)
    expect(() => registerBackend(null)).toThrow()
    expect(() => registerBackend({ id: 42 })).toThrow(/backend.id/)
  })
})

// ─── Local backend ─────────────────────────────────────────────────────────

describe('localBackend', () => {
  it('executes a short command to completion with output tails', async () => {
    const r = await localBackend.execute({
      command: 'node',
      args: ['-e', 'console.log("hello-backend")'],
    })
    expect(r.ok).toBe(true)
    expect(typeof r.execId).toBe('number')

    const s = await localBackend.status(r.execId)
    expect(s.state).toBe('running')

    // Wait for exit (poll with a generous ceiling for slow CI).
    let final
    for (let i = 0; i < 50; i++) {
      final = await localBackend.status(r.execId)
      if (final.state !== 'running') break
      await new Promise(res => setTimeout(res, 50))
    }
    expect(final.state).toBe('exited')
    expect(final.exitCode).toBe(0)
    expect(final.stdoutTail).toContain('hello-backend')
  })

  it('reports non-zero exits as error state', async () => {
    const r = await localBackend.execute({
      command: 'node',
      args: ['-e', 'process.exit(3)'],
    })
    let final
    for (let i = 0; i < 50; i++) {
      final = await localBackend.status(r.execId)
      if (final.state !== 'running') break
      await new Promise(res => setTimeout(res, 50))
    }
    expect(final.state).toBe('error')
    expect(final.exitCode).toBe(3)
  })

  it('terminates a long-running process', async () => {
    const r = await localBackend.execute({
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 60000)'],
    })
    const s = await localBackend.status(r.execId)
    expect(s.state).toBe('running')

    const t = await localBackend.terminate(r.execId)
    expect(t.ok).toBe(true)

    let final
    for (let i = 0; i < 50; i++) {
      final = await localBackend.status(r.execId)
      if (final.state !== 'running') break
      await new Promise(res => setTimeout(res, 50))
    }
    expect(['terminated', 'error']).toContain(final.state)
  })

  describe('pause/resume', () => {
    it('reports honest platform support', async () => {
      const r = await localBackend.execute({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 60000)'],
      })
      const p = await localBackend.pause(r.execId)
      expect(typeof p.ok).toBe('boolean')
      expect(typeof p.supported).toBe('boolean')
      // Windows literally cannot suspend a process — contract says supported:false.
      if (IS_WIN) {
        expect(p.ok).toBe(false)
        expect(p.supported).toBe(false)
      } else {
        expect(p.ok).toBe(true)
        expect(p.supported).toBe(true)
        const paused = await localBackend.status(r.execId)
        expect(paused.state).toBe('paused')
        const r2 = await localBackend.resume(r.execId)
        expect(r2.ok).toBe(true)
      }
      await localBackend.dispose(r.execId)
    })
  })

  it('rejects broken invocations without throwing', async () => {
    const r = await localBackend.execute({ command: '' })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
    const s = await localBackend.status(999999)
    expect(s.ok).toBe(false)
  })
})

// ─── Docker backend ────────────────────────────────────────────────────────

describe('dockerBackend', () => {
  const hasDocker = (() => {
    try {
      return spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 8000 }).status === 0
    } catch { return false }
  })()

  // When docker is absent the backend must degrade gracefully ({ ok:false,
  // error }) — never throw. With a live daemon the real run path would pull
  // images and hang CI, so that path is left to integration testing.
  it.skipIf(hasDocker)('degrades gracefully when docker CLI is missing', async () => {
    const r = await dockerBackend.execute({ image: 'alpine', command: 'true' })
    expect(r.ok).toBe(false)
    expect(typeof r.error).toBe('string')
  })
})

// ─── SSH backend ───────────────────────────────────────────────────────────

describe('sshBackend', () => {
  it('requires a host', async () => {
    const r = await sshBackend.execute({ command: 'echo hi' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/host/)
  })

  it('never supports pause/resume (remote control needs agent tooling)', async () => {
    const p = await sshBackend.pause(1)
    expect(p).toEqual({ ok: false, supported: false, error: expect.any(String) })
    const r = await sshBackend.resume(1)
    expect(r.ok).toBe(false)
    expect(r.supported).toBe(false)
  })

  it('fails fast against an unreachable port and reports a non-running state', async () => {
    const r = await sshBackend.execute({
      host: '127.0.0.1',
      port: 1, // almost certainly closed → immediate connect refusal
      command: 'echo hi',
      timeout: 3000,
    })
    // ssh itself may be missing on some Windows images; either way the
    // backend must NOT throw — a shaped result is mandatory.
    expect(r).toHaveProperty('ok')
    if (!r.ok) return // ssh client missing — covered by the contract above

    let final
    for (let i = 0; i < 60; i++) {
      final = await sshBackend.status(r.execId)
      if (final.state !== 'running') break
      await new Promise(res => setTimeout(res, 100))
    }
    expect(final.state).not.toBe('running')
  })
})

// ─── executeOn dispatch ────────────────────────────────────────────────────

describe('executeOn', () => {
  it('dispatches to the resolved backend and falls back safely', async () => {
    const r = await executeOn('local', { command: 'node', args: ['-e', 'console.log("dispatch")'] })
    expect(r.ok).toBe(true)
    expect(r.execId).toBeTypeOf('number')
    // Unknown id → local fallback, still works.
    const r2 = await executeOn('cloud-sandbox', { command: 'node', args: ['-e', ''] })
    expect(r2.ok).toBe(true)
  })
})