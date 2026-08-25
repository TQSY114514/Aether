import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'

// Standard headless loader guard. Additionally intercept './dockerBackend'
// (as required from exec/resolveBackend.js) so we can drive the real-probe
// fallback path deterministically instead of shelling out to Docker in CI.
const require = createRequire(import.meta.url)
const origLoad = Module._load
let fakeProbe

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  if (request === './dockerBackend' && parent && String(parent.filename).includes('resolveBackend')) {
    return { isDockerAvailable: (...args) => fakeProbe(...args) }
  }
  return origLoad.apply(this, arguments)
}
afterAll(() => {
  Module._load = origLoad
})

const { resolveBackendForMode } = require('../electron/exec/resolveBackend.js')

function makeDb(flagValue) {
  return { getSetting: () => flagValue }
}

describe('resolveBackendForMode decision table', () => {
  it('yolo ignores a configured backend and stays local (full-access contract)', async () => {
    const id = await resolveBackendForMode('yolo', { configured: 'ssh', db: makeDb(true), dockerAvailable: false })
    expect(id).toBe('local')
  })

  it('trims whitespace around the configured backend', async () => {
    const id = await resolveBackendForMode('auto', { configured: '  local  ', db: makeDb(true) })
    expect(id).toBe('local')
  })

  it('yolo always runs local, regardless of flag or availability', async () => {
    const id = await resolveBackendForMode('yolo', { db: makeDb(true), dockerAvailable: true })
    expect(id).toBe('local')
  })

  it('plan mode stays local', async () => {
    const id = await resolveBackendForMode('plan', { db: makeDb(true), dockerAvailable: true })
    expect(id).toBe('local')
  })

  it('ask mode stays local', async () => {
    const id = await resolveBackendForMode('ask', { db: makeDb(true), dockerAvailable: true })
    expect(id).toBe('local')
  })

  it('custom / unknown modes stay local', async () => {
    for (const mode of ['custom', '', undefined, null, 'wat']) {
      const id = await resolveBackendForMode(mode, { db: makeDb(true), dockerAvailable: true })
      expect(id).toBe('local')
    }
  })

  it('auto + conservative flag OFF falls back to local (default posture)', async () => {
    const id = await resolveBackendForMode('auto', { db: makeDb(false), dockerAvailable: true })
    expect(id).toBe('local')
  })

  it('auto + flag ON + Docker unavailable falls back to local', async () => {
    const id = await resolveBackendForMode('auto', { db: makeDb(true), dockerAvailable: false })
    expect(id).toBe('local')
  })

  it('auto + flag ON + Docker available selects docker', async () => {
    const id = await resolveBackendForMode('auto', { db: makeDb(true), dockerAvailable: true })
    expect(id).toBe('docker')
  })

  it('auto_confirm behaves like auto', async () => {
    expect(await resolveBackendForMode('auto_confirm', { db: makeDb(true), dockerAvailable: false })).toBe('local')
    expect(await resolveBackendForMode('auto_confirm', { db: makeDb(true), dockerAvailable: true })).toBe('docker')
  })

  it('accepts truthy string flag spellings stored in settings', async () => {
    expect(await resolveBackendForMode('auto', { db: makeDb('1'), dockerAvailable: true })).toBe('docker')
    expect(await resolveBackendForMode('auto', { db: makeDb('true'), dockerAvailable: true })).toBe('docker')
  })

  it('missing db never throws and degrades to local', async () => {
    const id = await resolveBackendForMode('auto', { db: null, dockerAvailable: true })
    expect(id).toBe('local')
  })

  it('real-probe path: daemon reachable -> docker', async () => {
    fakeProbe = async () => true
    const id = await resolveBackendForMode('auto', { db: makeDb(true) })
    expect(id).toBe('docker')
  })

  it('real-probe path: probe failure degrades to local instead of throwing', async () => {
    fakeProbe = async () => {
      throw new Error('docker cli missing')
    }
    const id = await resolveBackendForMode('auto', { db: makeDb(true) })
    expect(id).toBe('local')
  })
})
