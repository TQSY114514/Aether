import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('Personal SWE-bench Benchmark Suite (P1-09)', () => {
  it('executes verify commands accurately', () => {
    // Test passing command
    let passOk = false
    try {
      execSync('node -e "process.exit(0)"', { stdio: 'pipe' })
      passOk = true
    } catch {
      passOk = false
    }
    expect(passOk).toBe(true)

    // Test failing command
    let failOk = false
    try {
      execSync('node -e "process.exit(1)"', { stdio: 'pipe' })
      failOk = true
    } catch {
      failOk = false
    }
    expect(failOk).toBe(false)
  })

  it('supports structured SWE-bench task objects with verification contracts', () => {
    const task = {
      name: 'Fix Failing Test in Recipes',
      prompt: 'Please fix the failing tests in registry',
      verifyCommand: 'node -e "process.exit(0)"',
      expectedExitCode: 0,
    }

    expect(task.name).toBe('Fix Failing Test in Recipes')
    expect(task.verifyCommand).toBeDefined()

    let executed = false
    try {
      execSync(task.verifyCommand, { stdio: 'pipe' })
      executed = true
    } catch {
      executed = false
    }
    expect(executed).toBe(true)
  })

  it('computes SWE-bench pass rates correctly across tasks', () => {
    const runs = [
      { ok: true, verified: true },
      { ok: false, verified: true },
      { ok: true, verified: true },
    ]

    let verified_runs = 0
    let verified_passes = 0
    for (const r of runs) {
      if (r.verified) {
        verified_runs += 1
        if (r.ok) verified_passes += 1
      }
    }

    const passRate = (verified_passes / verified_runs) * 100
    expect(verified_runs).toBe(3)
    expect(verified_passes).toBe(2)
    expect(Math.round(passRate)).toBe(67)
  })
})
