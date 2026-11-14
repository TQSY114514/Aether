// ─── Binary Plan / Act + Pre-Write Snapshot + 3 High-Risk Gate E2E Tests ─────
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import Module from 'module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const origLoad = Module._load
let fakeLlm = null

beforeAll(() => {
  Module._load = function (request, ...args) {
    if (request === 'electron') {
      return { app: { getPath: () => join(tmpdir(), 'aether-binary-gate-userdata') } }
    }
    if (request.endsWith('providerAdapter')) {
      return { completeChatMessage: (opts) => fakeLlm(opts) }
    }
    return origLoad.apply(this, [request, ...args])
  }
})

afterAll(() => {
  Module._load = origLoad
})

describe('Binary Plan / Act + Pre-Write Snapshot + 3 High-Risk Gate', () => {
  let toolLoop = null
  let checkpoints = null
  let sandbox = null
  let wsRoot = null

  beforeEach(async () => {
    delete require.cache[require.resolve('../electron/llm/toolLoop')]
    delete require.cache[require.resolve('../electron/llm/checkpoints')]
    toolLoop = await import('../electron/llm/toolLoop')
    checkpoints = require('../electron/llm/checkpoints')
    sandbox = require('../electron/tools/sandbox')
    wsRoot = mkdtempSync(join(tmpdir(), 'aether-binary-ws-'))
    sandbox.setWorkspaceRoot(wsRoot)
  })

  afterEach(() => {
    checkpoints?.setDb(null)
    sandbox?.setWorkspaceRoot(null)
    try { rmSync(wsRoot, { recursive: true, force: true }) } catch {}
  })

  function scriptSequence(calls) {
    let idx = 0
    fakeLlm = ({ messages }) => {
      const hasResults = messages.filter(m => m.role === 'tool').length
      if (idx < calls.length && hasResults === idx) {
        const next = calls[idx++]
        return Promise.resolve({
          content: 'calling tool',
          tool_calls: [{ id: `c_${idx}`, type: 'function', function: { name: next.name, arguments: JSON.stringify(next.args) } }],
        })
      }
      return Promise.resolve({ content: 'done', tool_calls: undefined })
    }
  }

  async function runLoop({ agentMode = 'act', requestPermission, db = {}, onPlanStep, onTodoUpdate } = {}) {
    const entries = []
    const result = await toolLoop.runToolLoop({
      provider: { name: 'mock', api_format: 'openai', base_url: 'http://fake' },
      model: { model_name: 'mock-model' },
      messages: [{ role: 'user', content: 'execute task' }],
      agentMode,
      workspaceRoot: wsRoot,
      maxIterations: 6,
      sessionId: 8888,
      messageId: 42,
      db,
      onToolCall: (e) => entries.push(e),
      onStatus: () => {},
      onPlanStep: onPlanStep || (() => {}),
      onTodoUpdate: onTodoUpdate || (() => {}),
      requestPermission,
    })
    return { entries, final: entries.filter(e => !e.startedAt), result }
  }

  it('Plan mode allows reads, search, read-only git, and session_plan while blocking writes and mutating shell', { timeout: 30000 }, async () => {
    execFileSync('git', ['init'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })
    writeFileSync(join(wsRoot, 'hello.txt'), 'world', 'utf8')

    const todoUpdates = []
    let prompted = 0
    scriptSequence([
      { name: 'read_file', args: { path: join(wsRoot, 'hello.txt') } },
      { name: 'run_command', args: { command: 'git status', description: 'Check git status' } },
      { name: 'session_plan', args: { description: 'Audit Plan', todos: [{ content: 'Inspect code', status: 'completed' }] } },
      { name: 'edit_file', args: { path: join(wsRoot, 'hello.txt'), old_string: 'world', new_string: 'edited' } },
      { name: 'run_command', args: { command: 'npm install evil-pkg', description: 'Install package' } },
    ])

    const { final } = await runLoop({
      agentMode: 'plan',
      requestPermission: async () => { prompted++; return true },
      onTodoUpdate: (todos) => todoUpdates.push(todos),
    })

    expect(prompted).toBe(0)
    expect(final.find(e => e.name === 'read_file')?.error).toBeFalsy()
    expect(final.find(e => e.name === 'run_command' && e.args?.command === 'git status')?.error).toBeFalsy()
    expect(final.find(e => e.name === 'session_plan')?.error).toBeFalsy()
    expect(todoUpdates.length).toBeGreaterThan(0)

    const editErr = final.find(e => e.name === 'edit_file')
    expect(editErr?.failure_kind).toBe('permission_denied')
    expect(readFileSync(join(wsRoot, 'hello.txt'), 'utf8')).toBe('world')

    const npmErr = final.find(e => e.name === 'run_command' && e.args?.command === 'npm install evil-pkg')
    expect(npmErr?.failure_kind).toBe('permission_denied')
  })

  it('Act mode auto-executes workspace edits and write_file overwrites with 0 prompts and attaches accurate pre-write Diff', { timeout: 30000 }, async () => {
    const fileA = join(wsRoot, 'app.js')
    writeFileSync(fileA, 'const v = 1\n', 'utf8')

    let prompted = 0
    scriptSequence([
      { name: 'write_file', args: { path: fileA, content: 'const v = 2\n' } },
      { name: 'edit_file', args: { path: fileA, old_string: 'const v = 2', new_string: 'const v = 3' } },
    ])

    const { final } = await runLoop({
      agentMode: 'act',
      requestPermission: async () => { prompted++; return false },
    })

    expect(prompted).toBe(0)
    expect(readFileSync(fileA, 'utf8')).toBe('const v = 3\n')

    const writeEntry = final.find(e => e.name === 'write_file')
    expect(writeEntry?.error).toBeFalsy()
    expect(writeEntry?.diff).toContain('-const v = 1')
    expect(writeEntry?.diff).toContain('+const v = 2')

    const editEntry = final.find(e => e.name === 'edit_file')
    expect(editEntry?.error).toBeFalsy()
    expect(editEntry?.diff).toContain('-const v = 2')
    expect(editEntry?.diff).toContain('+const v = 3')
  })

  it('Act mode prompts ONLY for the 3 high-risk scenarios (outside workspace, credential files, destructive/remote shell)', { timeout: 30000 }, async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'aether-outside-root-'))
    const outsideFile = join(outsideDir, 'secret.txt')
    writeFileSync(outsideFile, 'top-secret', 'utf8')
    const envFile = join(wsRoot, '.env.local')
    const permPrompts = []

    try {
      scriptSequence([
        { name: 'read_file', args: { path: outsideFile } },
        { name: 'write_file', args: { path: envFile, content: 'API_KEY=123' } },
        { name: 'run_command', args: { command: 'git push --force origin main', description: 'Force push main' } },
      ])

      const { final } = await runLoop({
        agentMode: 'act',
        requestPermission: async (req) => {
          permPrompts.push(req)
          return false // reject all 3 high-risk calls
        },
      })

      expect(permPrompts.length).toBe(3)
      expect(final.filter(e => e.failure_kind === 'permission_denied').length).toBe(3)
      expect(existsSync(envFile)).toBe(false)
    } finally {
      try { rmSync(outsideDir, { recursive: true, force: true }) } catch {}
    }
  })

  it('Non-Git pre-write snapshot saves incremental backup under .aether/snapshots/<turnId> and restores pre-turn contents', () => {
    const targetExisting = join(wsRoot, 'existing.txt')
    const targetCreated = join(wsRoot, 'created.txt')
    writeFileSync(targetExisting, 'v0-initial', 'utf8')

    // First write in turn -> captures v0-initial
    const snap1 = checkpoints.createPreWriteSnapshot({
      workspaceRoot: wsRoot,
      turnId: 'turn_100',
      affectedPaths: [targetExisting],
      toolName: 'edit_file',
    })
    expect(snap1.method).toBe('dir_incremental')
    // No manifest.json sidecar file is written — metadata is preserved in SQLite / memory object
    expect(existsSync(join(wsRoot, '.aether', 'snapshots', 'turn_100', 'manifest.json'))).toBe(false)
    expect(snap1.entries).toBeDefined()

    writeFileSync(targetExisting, 'v1-modified', 'utf8')

    // Second write in same turn -> deduplicates so v0-initial is preserved, also tracks created.txt as existed=false
    checkpoints.createPreWriteSnapshot({
      workspaceRoot: wsRoot,
      turnId: 'turn_100',
      affectedPaths: [targetExisting, targetCreated],
      toolName: 'write_file',
    })
    writeFileSync(targetExisting, 'v2-modified-again', 'utf8')
    writeFileSync(targetCreated, 'brand-new', 'utf8')

    const rb = checkpoints.rollbackPreWriteSnapshot(snap1)
    expect(rb.success).toBe(true)
    expect(readFileSync(targetExisting, 'utf8')).toBe('v0-initial')
    expect(existsSync(targetCreated)).toBe(false)
  })

  it('Git repo pre-write snapshot uses git stash create hash and rollbackPreWriteSnapshot restores tracked file', { timeout: 30000 }, () => {
    execFileSync('git', ['init'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })
    execFileSync('git', ['config', 'user.email', 'test@aether.local'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })
    execFileSync('git', ['config', 'user.name', 'Aether Test'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })

    const trackedFile = join(wsRoot, 'tracked.txt')
    writeFileSync(trackedFile, 'committed-v1\n', 'utf8')
    execFileSync('git', ['add', 'tracked.txt'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: wsRoot, stdio: 'ignore', windowsHide: true })

    // Dirty uncommitted edit before AI modifies the file -> git stash create must capture dirty-v2!
    writeFileSync(trackedFile, 'dirty-v2\n', 'utf8')

    const snap = checkpoints.createPreWriteSnapshot({
      workspaceRoot: wsRoot,
      turnId: 'turn_git_1',
      affectedPaths: [trackedFile],
      toolName: 'edit_file',
    })
    expect(snap.method).toBe('git_stash_create')
    expect(snap.hadDirtyStash).toBe(true)
    expect(snap.stashHash).toMatch(/^[0-9a-f]{40}$/)

    // AI mutates file
    writeFileSync(trackedFile, 'ai-mutated-v3\n', 'utf8')

    // One-click rollback restores dirty-v2 (from git stash create object)!
    const rb = checkpoints.rollbackPreWriteSnapshot(snap)
    expect(rb.success).toBe(true)
    expect(readFileSync(trackedFile, 'utf8')).toBe('dirty-v2\n')
  })
})
