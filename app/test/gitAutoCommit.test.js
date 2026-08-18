// ─── T8: auto-commit secret guard + checkpoint-driven /undo ────────────────
// Covers the audit P1-H8 fixes:
//   1. gitAutoCommit never stages secret-like (.env*/id_rsa*/*.pem/*.key/
//      *credential*/*secret*) or gitignored (git check-ignore) files.
//   2. git:undo (ipc/git.handler.js) restores files from checkpoint snapshots
//      and records a revert commit — never `git reset --hard`.
//
// Loading strategy: the modules under test are plain CommonJS and destructure
// their dependencies at require time, so vi.mock (ESM interop) never reaches
// them. Instead we load everything through one `createRequire` (shared CJS
// cache) and monkey-patch the dependency exports BEFORE the modules load.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)

const mocks = {
  run: vi.fn(),
  nearestGitRoot: vi.fn(),
  findLatestCheckpointForRoot: vi.fn(),
  rollbackCheckpoint: vi.fn(),
  getWorkspaceRoot: vi.fn(),
}

// Shared CJS instances, patched before the modules under test are loaded.
const exec = req('../electron/tools/exec')
const checkpoints = req('../electron/llm/checkpoints')
const sandbox = req('../electron/tools/sandbox')
const realFindLatestCheckpointForRoot = checkpoints.findLatestCheckpointForRoot

exec.runCommandSync = mocks.run
checkpoints.nearestGitRoot = mocks.nearestGitRoot
checkpoints.findLatestCheckpointForRoot = mocks.findLatestCheckpointForRoot
checkpoints.rollbackCheckpoint = mocks.rollbackCheckpoint
sandbox.getWorkspaceRoot = mocks.getWorkspaceRoot

const gitAutoCommit = req('../electron/llm/gitAutoCommit')
const { registerGitHandlers } = req('../electron/ipc/git.handler')

const REPO = '/repo'
const rp = (p) => REPO + '/' + p

// Default git behaviour: nothing ignored, add/commit succeed, tree dirty.
function stubRun({ ignored = [], staged = 'M  src/x.js' } = {}) {
  mocks.run.mockImplementation((_cmd, args) => {
    if (args[0] === 'check-ignore') {
      const target = args[args.length - 1]
      return { exitCode: ignored.includes(target) ? 0 : 1, stdout: '', stderr: '' }
    }
    if (args[0] === 'add') return { exitCode: 0, stdout: '', stderr: '' }
    if (args[0] === 'status') return { exitCode: 0, stdout: staged, stderr: '' }
    if (args[0] === 'diff') return { exitCode: 0, stdout: staged, stderr: '' }
    if (args[0] === 'commit') return { exitCode: 0, stdout: '', stderr: '' }
    return { exitCode: 0, stdout: '', stderr: '' }
  })
}

const gitCommands = () => mocks.run.mock.calls.map((c) => c[1][0])
const callsOf = (sub) => mocks.run.mock.calls.filter((c) => c[1][0] === sub)

beforeEach(() => {
  vi.clearAllMocks()
  stubRun()
  mocks.nearestGitRoot.mockReturnValue(REPO)
})

// ─── Secret-like filename patterns ─────────────────────────────────────────

describe('isSecretLike', () => {
  it.each([
    '.env', '.env.local', '.ENV.PROD',            // .env*
    'id_rsa', 'id_rsa_test', 'ID_ED25519',        // id_rsa* / id_ed25519*
    'server.pem', 'cert.PEM',                     // *.pem
    'tls.key', 'CA.KEY',                          // *.key
    'credentials.json', 'my-secret-config.yaml',  // *credential* / *secret*
    'client.CREDENTIAL.txt', 'app.secrets.yaml',
  ])('flags %s', (name) => {
    expect(gitAutoCommit.isSecretLike(rp('dir/' + name))).toBe(true)
  })

  it.each([
    'x.js', 'package.json', 'readme.md', 'envelope.ts', 'keyboard.pem.bak', 'src',
  ])('passes %s', (name) => {
    expect(gitAutoCommit.isSecretLike(rp(name))).toBe(false)
  })
})

// ─── Single-file auto-commit guard ─────────────────────────────────────────

describe('gitCommit secret/gitignore guard', () => {
  it('skips .env without touching git at all', () => {
    const res = gitAutoCommit.gitCommit(rp('.env'), 'write')
    expect(res).toMatchObject({ success: false, skipped: true, skipReason: 'secret-like filename' })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('skips id_rsa without touching git at all', () => {
    const res = gitAutoCommit.gitCommit(rp('.ssh/id_rsa'), 'edit')
    expect(res).toMatchObject({ success: false, skipped: true, skipReason: 'secret-like filename' })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('skips files ignored by .gitignore (git check-ignore integration)', () => {
    stubRun({ ignored: [rp('build/out.js')] })
    const res = gitAutoCommit.gitCommit(rp('build/out.js'), 'apply')
    expect(res).toMatchObject({ success: false, skipped: true, skipReason: 'ignored by .gitignore' })
    // Only the check-ignore probe ran — no add, no commit.
    expect(gitCommands()).toEqual(['check-ignore'])
  })

  it('commits a normal file (src/x.js)', () => {
    const res = gitAutoCommit.gitCommit(rp('src/x.js'), 'write')
    expect(res.success).toBe(true)
    expect(res.commitMessage).toMatch(/^feat: update src/)
    expect(gitCommands()).toEqual(['check-ignore', 'add', 'status', 'commit'])
  })

  it('never issues a reset command', () => {
    gitAutoCommit.gitCommit(rp('src/x.js'), 'edit')
    expect(callsOf('reset')).toHaveLength(0)
  })
})

// ─── Multi-file (checkpoint / revert) commits ───────────────────────────────

describe('gitCommitMultiple secret/gitignore guard', () => {
  it('skips *.pem / *secret* / *credential* patterns and makes no commit when all files are skipped', () => {
    const res = gitAutoCommit.gitCommitMultiple(
      [rp('certs/server.pem'), rp('app.secret.json'), rp('auth/credentials.yaml')],
      REPO,
      'checkpoint (write_file): x'
    )
    expect(res.success).toBe(false)
    expect(res.nothingToCommit).toBe(true)
    expect(res.skipped).toHaveLength(3)
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('stages only the non-secret files in a mixed batch', () => {
    stubRun({ ignored: [rp('build/gen.js')] })
    const res = gitAutoCommit.gitCommitMultiple(
      [rp('src/x.js'), rp('.env'), rp('build/gen.js')],
      REPO,
      'checkpoint (edit_file): x'
    )
    expect(res.success).toBe(true)
    // .env was skipped by pattern; build/gen.js was probed via check-ignore…
    expect(callsOf('check-ignore').length).toBeGreaterThanOrEqual(1)
    // …and only src/x.js got staged and committed.
    expect(callsOf('add').map((c) => c[1][1])).toEqual([rp('src/x.js')])
    expect(callsOf('commit')).toHaveLength(1)
  })

  it('excludes gitignored files — only clean files are staged', () => {
    stubRun({ ignored: [rp('dist/bundle.js')] })
    const res = gitAutoCommit.gitCommitMultiple([rp('src/a.js'), rp('dist/bundle.js')], REPO, 'cp')
    expect(res.success).toBe(true)
    expect(callsOf('add').map((c) => c[1][1])).toEqual([rp('src/a.js')])
    expect(res.skipped.map((s) => s.reason)).toEqual(['ignored by .gitignore'])
  })
})

// ─── git:undo — checkpoint-driven, refuses without a record ────────────────

describe('ipc git:undo', () => {
  const makeHandlers = () => {
    const handlers = {}
    registerGitHandlers({ handle: (ch, fn) => { handlers[ch] = fn } }, {})
    return handlers
  }

  beforeEach(() => {
    mocks.getWorkspaceRoot.mockReturnValue('/ws')
    mocks.nearestGitRoot.mockReturnValue('/ws')
  })

  it('refuses with a clear error when no checkpoint exists (no reset --hard fallback)', () => {
    const handlers = makeHandlers()
    mocks.findLatestCheckpointForRoot.mockReturnValue(null)
    const res = handlers['git:undo'](null, '/ws')
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/checkpoint/i)
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('restores from checkpoint and records a revert commit (never reset --hard)', () => {
    const handlers = makeHandlers()
    mocks.findLatestCheckpointForRoot.mockReturnValue({ id: 7 })
    mocks.rollbackCheckpoint.mockReturnValue({ success: true, restored: [rp('src/x.js')] })
    stubRun()

    const res = handlers['git:undo'](null, '/ws')
    expect(res.success).toBe(true)
    expect(mocks.rollbackCheckpoint).toHaveBeenCalledWith(7)
    const commitCall = callsOf('commit')[0]
    expect(commitCall[1][2]).toBe('revert: undo agent changes (checkpoint #7)')
    expect(callsOf('reset')).toHaveLength(0)
  })

  it('reports failure when file restore fails', () => {
    const handlers = makeHandlers()
    mocks.findLatestCheckpointForRoot.mockReturnValue({ id: 9 })
    mocks.rollbackCheckpoint.mockReturnValue({
      success: false,
      error: 'some files failed to restore',
      restored: [],
      failed: [{ path: rp('src/x.js'), error: 'EACCES' }],
    })
    const res = handlers['git:undo'](null, '/ws')
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/failed to restore/)
  })
})

// ─── checkpoints.findLatestCheckpointForRoot (real implementation) ─────────

describe('findLatestCheckpointForRoot', () => {
  it('finds the newest checkpoint touching the repo and returns null when none match', () => {
    const rows = [
      { id: 2, affected_paths: JSON.stringify(['/elsewhere/y.js']) },
      { id: 1, affected_paths: JSON.stringify([REPO + '/src/x.js']) },
    ]
    const fakeDb = {
      prepare: () => ({ all: () => rows }),
      getAgentCheckpoint: (id) => ({ id, snapshot: { files: [] } }),
    }
    checkpoints.setDb(fakeDb)
    try {
      expect(realFindLatestCheckpointForRoot(REPO)).toMatchObject({ id: 1 })
      expect(realFindLatestCheckpointForRoot('/other/repo')).toBeNull()
      // Mixed separators (git rev-parse emits forward slashes on Windows).
      expect(checkpoints.isInsideGitRoot(REPO.replace(/\\/g, '/') + '/a.js', REPO)).toBe(true)
      expect(checkpoints.isInsideGitRoot(REPO + '-suffix/a.js', REPO)).toBe(false)
    } finally {
      checkpoints.setDb(null)
    }
  })
})
