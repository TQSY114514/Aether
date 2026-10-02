import { describe, it, expect, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { isSupported, assignProcess, shutdown } from '../electron/exec/winJobObject'

describe('winJobObject (Windows Native Job Object Sandbox)', () => {
  afterAll(() => {
    shutdown()
  })

  it('reports supported on win32', () => {
    if (process.platform === 'win32') {
      expect(isSupported()).toBe(true)
    } else {
      expect(isSupported()).toBe(false)
    }
  })

  it('can assign a child process to the job object on Windows', async () => {
    if (process.platform !== 'win32') return

    // Spawn a long-lived child process so it doesn't terminate before assignment
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 10'], { windowsHide: true })
    expect(child.pid).toBeDefined()

    const res = await assignProcess(child.pid)
    expect(res.ok).toBe(true)
    expect(res.pid).toBe(child.pid)

    child.kill()
  }, 15000)
})
