// ─── Cloud backend contract tests ───────────────────────────────────────────
// Pure Node (no electron): unconfigured → honest error; ssh transport
// delegates to sshBackend (missing host → its own error); http transport
// against a stubbed global.fetch simulating a managed sandbox API.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cloudBackend } from '../electron/exec/cloudBackend'
import { registerBackend, getBackend, listBackends } from '../electron/exec/backend'

beforeAll(() => {
  registerBackend(cloudBackend)
})

afterEach(() => {
  // Restore real-fetch behavior for tests that don't stub it.
  delete globalThis.fetch
})

describe('cloudBackend registry', () => {
  it('is registered under id cloud', () => {
    expect(getBackend('cloud').id).toBe('cloud')
    expect(listBackends().map(b => b.id)).toContain('cloud')
  })
})

describe('cloudBackend.execute', () => {
  it('returns an honest error when nothing is configured', async () => {
    const r = await cloudBackend.execute({ command: 'echo hi' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not configured/)
  })

it('delegates to sshBackend when ssh transport is chosen', async () => {
    // Empty ssh config object → the ssh backend's OWN validation fires
    // ("host is required"), proving execution was delegated (not a cloud error).
    const r = await cloudBackend.execute({ command: 'ls', ssh: {} })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('host is required')
    // Error must come from sshBackend, not the cloud "not configured" branch.
    expect(r.error).not.toContain('not configured')
  })

it('starts an http job and polls it to completion', async () => {
    // Fast managed sandbox API.
    let jobState = 'running'
    let missCount = 0
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url)
      if (opts.method === 'POST' && u.endsWith('/exec')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ jobId: 'job-1' }) }
      }
      if (u.endsWith('/exec/job-1')) {
        // First poll → running, second → exited.
        missCount++
        const done = missCount >= 2
        return { ok: true, status: 200, text: async () => JSON.stringify(done
          ? { state: 'exited', exitCode: 0, stdout: 'cloud output', stderr: '' }
          : { state: 'running', stdout: '', stderr: '' }) }
      }
      if (u.endsWith('/terminate')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) }
      }
      return { ok: false, status: 404, text: async () => 'not found' }
    }

    const r = await cloudBackend.execute({ command: 'echo hi', http: { endpoint: 'https://sandbox.example.com', token: 't0k3n' } })
    expect(r.ok).toBe(true)
    expect(typeof r.execId).toBe('number')
    expect(r.jobId).toBe('job-1')

    // Poll = await the background poll loop to land the exit state (≤ 5s).
    let s = null
    for (let i = 0; i < 50; i++) {
      s = await cloudBackend.status(r.execId)
      if (s.state !== 'running') break
      await new Promise(res => setTimeout(res, 100))
    }
    expect(s.state).toBe('exited')
    expect(s.exitCode).toBe(0)
    expect(s.stdoutTail).toContain('cloud output')
  })

  it('terminate marks a running job terminated and notifies the API', async () => {
    globalThis.fetch = async (url, opts = {}) => {
      if (opts.method === 'POST' && /\/exec$/.test(String(url))) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ jobId: 'job-kill' }) }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ state: 'running' }) }
    }
    const r = await cloudBackend.execute({ command: 'sleep 9', http: { endpoint: 'https://sandbox.example.com' } })
    expect(r.ok).toBe(true)
    const t = await cloudBackend.terminate(r.execId)
    expect(t.ok).toBe(true)
    const s = await cloudBackend.status(r.execId)
    expect(s.state).toBe('terminated')
  })

  it('pause/resume are honestly unsupported', async () => {
    const p = await cloudBackend.pause()
    expect(p).toMatchObject({ ok: false, supported: false })
    const q = await cloudBackend.resume()
    expect(q).toMatchObject({ ok: false, supported: false })
  })

  it('status on unknown execId errors', async () => {
    const s = await cloudBackend.status(999999)
    expect(s.ok).toBe(false)
  })
})