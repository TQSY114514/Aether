import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Harness Phase 3 & 4: Process Tap & ShadowGit Hardening', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-p34-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('extractCrashSignal parses TypeScript, Vitest, and Node runtime errors cleanly', () => {
    const { extractCrashSignal, formatCrashTapBanner } = require('../electron/llm/processTap')

    const tsSig = extractCrashSignal({
      command: 'tsc --noEmit',
      exitCode: 2,
      stdout: '\x1b[31msrc/index.ts(42,10): error TS2345: Argument of type \'string\' is not assignable.\x1b[0m\n',
      stderr: '',
    })
    expect(tsSig.ok).toBe(false)
    expect(tsSig.kind).toBe('typescript')
    expect(tsSig.location).toBe('src/index.ts:42:10')
    expect(tsSig.primaryError).toContain('TS2345')
    expect(formatCrashTapBanner(tsSig)).toContain('[Process Tap] Command failed (exitCode=2, kind=typescript)')

    const nodeSig = extractCrashSignal({
      command: 'node app.js',
      exitCode: 1,
      stderr: 'TypeError: Cannot read properties of undefined (reading \'id\')\n    at main (D:\\proj\\app.js:18:5)\n',
    })
    expect(nodeSig.ok).toBe(false)
    expect(nodeSig.kind).toBe('runtime')
    expect(nodeSig.location).toBe('D:\\proj\\app.js:18:5')
    expect(nodeSig.primaryError).toContain('Cannot read properties of undefined')

    const okSig = extractCrashSignal({ command: 'echo ok', exitCode: 0, stdout: 'ok' })
    expect(okSig.ok).toBe(true)
    expect(formatCrashTapBanner(okSig)).toBe('')

    const winTsSig = extractCrashSignal({
      command: 'tsc',
      exitCode: 2,
      stdout: 'D:\\Aether\\app\\src\\a.ts:15:3 - error TS2322: Type mismatch',
    })
    expect(winTsSig.kind).toBe('typescript')
    expect(winTsSig.location).toBe('D:\\Aether\\app\\src\\a.ts:15:3')

    const rustSig = extractCrashSignal({
      command: 'cargo check',
      exitCode: 101,
      stderr: 'error[E0308]: mismatched types\n  --> src/main.rs:12:5\n',
    })
    expect(rustSig.kind).toBe('rust')
    expect(rustSig.location).toBe('src/main.rs:12:5')
  })

  it('localBackend populates crashSignal on close after stderr finishes', async () => {
    const { localBackend } = require('../electron/exec/localBackend')
    const crashScript = path.join(tmpDir, 'lb_crash.js')
    fs.writeFileSync(crashScript, 'process.stderr.write("TypeError: lb_boom\\n"); process.exit(1)\n', 'utf8')
    const started = await localBackend.execute({ command: process.execPath, args: [crashScript], cwd: tmpDir })
    expect(started.ok).toBe(true)
    let st
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50))
      st = await localBackend.status(started.execId)
      if (st.state !== 'running' && st.crashSignal) break
    }
    expect(st.exitCode).toBe(1)
    expect(st.crashSignal).toBeTruthy()
    expect(st.crashSignal.primaryError).toContain('lb_boom')
  })

  it.skipIf(process.platform !== 'win32')('run_command prepends [Process Tap] banner and emits process_crash status on non-zero exit', async () => {
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const sid = 'p3-runcmd-test'
    setWorkspaceRootForSession(sid, tmpDir)
    const crashScript = path.join(tmpDir, 'crash.js')
    fs.writeFileSync(crashScript, 'throw new TypeError("boom")\n', 'utf8')
    const statuses = []
    try {
      const out = await getTool('run_command').run(
        { command: 'node crash.js && echo done', description: 'trigger crash' },
        { sessionId: sid, agentMode: 'act', onStatus: (s) => statuses.push(s) }
      )
      expect(out).toContain('[Process Tap] Command failed (exitCode=1, kind=runtime)')
      expect(out).toContain('Primary: TypeError: boom')
      expect(out).toContain('(exit code: 1)')
      expect(statuses.some((s) => s.kind === 'process_crash' && s.text.includes('TypeError: boom'))).toBe(true)
    } finally {
      clearSessionWorkspaces(sid)
    }
  })

  it('shadowGit.commitCheckpoint tolerates untracked missing paths and records tracked deletions', () => {
    const shadowGit = require('../electron/llm/shadowGit')
    if (!shadowGit.isAvailable()) return

    const existing = path.join(tmpDir, 'existing.txt')
    const nonExistent = path.join(tmpDir, 'brand_new.txt')
    fs.writeFileSync(existing, 'v1\n', 'utf8')

    const snap = shadowGit.commitCheckpoint(999901, tmpDir, {
      affectedPaths: [existing, nonExistent],
      message: 'pre_write_test',
    })
    expect(snap.ok).toBe(true)
    expect(typeof snap.commitHash).toBe('string')

    // Modify existing file and verify rollback restores v1
    fs.writeFileSync(existing, 'v2_broken\n', 'utf8')
    const rb = shadowGit.rollbackCheckpoint(999901, tmpDir, snap.commitHash, [existing])
    expect(rb.ok).toBe(true)
    expect(fs.readFileSync(existing, 'utf8')).toBe('v1\n')

    // Delete tracked file, commit checkpoint, and verify diff reflects deletion
    fs.unlinkSync(existing)
    const snapDel = shadowGit.commitCheckpoint(999901, tmpDir, {
      affectedPaths: [existing],
      message: 'after_delete',
    })
    expect(snapDel.ok).toBe(true)
    const diff = shadowGit.getDiff(999901, tmpDir, snap.commitHash, snapDel.commitHash)
    expect(diff).toContain('deleted file mode')

    shadowGit.deleteShadowRepo(999901)
  }, 15000)
})
