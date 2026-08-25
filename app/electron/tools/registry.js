// Built-in tool registry
const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { runCommand, runCommandSync } = require('./exec')
const { glob } = require('glob')
const { checkWritePath, checkCommand, isInsideWorkspace } = require('./sandbox')
const { streamCommand, formatStreamResult } = require('../llm/toolStream')
const { checkSSRF, checkSSRFHostname } = require('./ssrf')
const { resolveBackendForMode } = require('../exec/resolveBackend')
const { dockerBackend } = require('../exec/dockerBackend')

const MAX_READ_BYTES = 64 * 1024
const MAX_GREP_BYTES = 32 * 1024

function guardWorkspaceRead(target, ctx, label) {
  const p = String(target || ''); if (!p) return
  if (ctx?.agentMode !== 'ask') return
  if (isInsideWorkspace(p, ctx?.sessionId)) return
  throw new Error(`读取被拒绝：${label} ${p} 位于工作区之外（当前为 ask 模式）。如确需读取该路径，请改用 ask_user 工具向用户说明并请求批准`)
}

function lspFullEnabled(ctx) {
  try { return require('../featureFlags').isEnabled(ctx?.db, 'lsp.full') } catch { return false }
}

let _rgAvailableCache = null
function rgAvailable() {
  if (_rgAvailableCache === null) {
    try { _rgAvailableCache = spawnSync('rg', ['--version'], { windowsHide: true }).status === 0 } catch { _rgAvailableCache = false }
  }
  return _rgAvailableCache
}

function grepWithRipgrep({ cwd, glob: globPattern, pattern }) {
  return new Promise((resolve) => {
    const args = ['--line-number', '--no-heading', '--max-count=50']
    if (globPattern) args.push('--glob', globPattern)
    args.push('.')
    let child
    try { child = spawn('rg', args, { cwd: cwd || process.cwd(), windowsHide: true }) } catch { resolve(null); return }
    let stdout = ''; let stderr = ''; let done = false
    const finish = () => { if (!done) { done = true; resolve(stdout) } }
    child.stdout.on('data', (d) => { stdout += d.toString(); if (stdout.length > MAX_GREP_BYTES) { try { child.kill() } catch {}; finish() } })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', () => finish())
    child.on('close', (code) => { if (code === 2 && !stdout) resolve(null); else finish() })
    setTimeout(() => { if (!done) { try { child.kill() } catch {}; finish() } }, 15000)
  })
}

function formatRipgrepLines(output, cwd) {
  const hits = []
  for (const line of output.split('\n')) {
    if (!line) continue
    const idx = line.indexOf(':'); if (idx < 0) { hits.push(line); continue }
    const rest = line.slice(idx + 1); const idx2 = rest.indexOf(':')
    const lineno = idx2 >= 0 ? rest.slice(0, idx2) : ''; const content = idx2 >= 0 ? rest.slice(idx2 + 1) : ''
    let rel = line.slice(0, idx)
    if (cwd) { try { rel = path.relative(cwd, rel) || path.basename(rel) } catch {} }
    hits.push(`${rel}:${lineno}: ${content.trim().slice(0, 200)}`)
    if (hits.length >= 200) break
  }
  return hits.join('\n') || '(no matches)'
}

// ── DDG snippet extraction ──────────────────────────────────────────────
function extractDdgSnippets(html, q) {
  const snippets = []; const re = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g; let m
  while ((m = re.exec(html)) && snippets.length < 5) { const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); if (t) snippets.push(`- ${t}`) }
  if (snippets.length === 0) return `No snippets extracted for "${q}".`
  return snippets.join('\n')
}

// ── Unified diff parser ─────────────────────────────────────────────────
function parseUnifiedDiff(text) {
  const lines = text.split('\n'); const hunks = []; let current = null; let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (m) { if (current && current.lines.length > 0) hunks.push(current); current = { oldStart: parseInt(m[1]), oldCount: parseInt(m[2] || 1), newStart: parseInt(m[3]), newCount: parseInt(m[4] || 1), lines: [] } }
    } else if (current) {
      if (line.startsWith(' ')) current.lines.push({ type: 'context', content: line.slice(1) })
      else if (line.startsWith('+')) current.lines.push({ type: 'add', content: line.slice(1) })
      else if (line.startsWith('-')) current.lines.push({ type: 'remove', content: line.slice(1) })
    }
    i++
  }
  if (current && current.lines.length > 0) hunks.push(current)
  return hunks
}

function applyHunks(fileLines, hunks) {
  const conflicts = []; let result = [...fileLines]; let applied = 0; let lineDelta = 0
  for (const hunk of hunks) {
    const idx = hunk.oldStart - 1 + lineDelta
    const ctxLines = hunk.lines.filter(l => l.type === 'context')
    let matchOffset = -1; const searchStart = Math.max(0, idx - 2)
    for (let start = searchStart; start <= Math.max(searchStart, result.length - ctxLines.length); start++) {
      let ok = true
      for (let ci = 0; ci < ctxLines.length; ci++) { if (start + ci >= result.length || result[start + ci] !== ctxLines[ci].content) { ok = false; break } }
      if (ok) { matchOffset = start; break }
    }
    if (matchOffset < 0) { conflicts.push(`hunk at line ${hunk.oldStart}: context did not match`); continue }
    const adds = hunk.lines.filter(l => l.type === 'add'); const oldSpan = hunk.oldCount
    const replacement = adds.map(l => l.content)
    result = [...result.slice(0, matchOffset), ...replacement, ...result.slice(matchOffset + oldSpan)]
    lineDelta += replacement.length - oldSpan; applied++
  }
  return { content: result.join('\n'), applied, conflicts }
}

// ── Shell result formatting + optional Docker sandbox for run_command ───

function formatShellResult(stdout, stderr, exitCode, timedOut) {
  const out = stdout?.trim() || ''; const err = stderr?.trim() || ''; const parts = []
  if (out) parts.push('[stdout]\n' + out.slice(0, 4096)); if (err) parts.push('[stderr]\n' + err.slice(0, 4096))
  const r = parts.join('\n\n') || '(no output)'
  if (timedOut) return `[timed out] ${r}`
  if (exitCode !== 0) return `[exit code: ${exitCode}]\n${r}`
  return r
}

const DOCKER_EXIT_MARKER = 'AETHER_EXIT_CODE:'

// Run a command inside an ephemeral no-network container (docker backend).
// Wraps the command so the container's real exit code survives `sh -lc`,
// polls status() until the container exits or the deadline hits, then
// normalizes the output into the same shape as the local run_command path.
async function runInDocker(cmd, timeoutMs, db) {
  let image = 'node:22-alpine'
  try { image = String(db?.getSetting('exec.docker.image') || image) } catch { /* keep default image */ }
  let started
  try {
    started = await dockerBackend.execute({
      image,
      command: 'sh',
      args: ['-lc', `${cmd}\n__aether_rc=$?\necho ${DOCKER_EXIT_MARKER}$__aether_rc\nexit $__aether_rc`],
      network: 'none',
    })
  } catch (e) {
    return `[docker unavailable] ${e?.message || e}`
  }
  if (!started.ok) return `[docker unavailable] ${started.error || 'docker execute failed'}`

  // Containers run without --rm so a fast exit can't beat the first poll
  // (logs + exit marker survive); dispose() below is the cleanup point on
  // every path: result, timeout, or error return.
  try {
    const deadline = Date.now() + timeoutMs
    let timedOut = false
    let st = null
    while (true) {
      await new Promise((r) => setTimeout(r, 500))
      st = await dockerBackend.status(started.execId).catch(() => null)
      if (!st || (st.state !== 'running' && st.state !== 'paused')) break
      if (Date.now() >= deadline) {
        timedOut = true
        try { await dockerBackend.terminate(started.execId) } catch { /* best effort */ }
        st = await dockerBackend.status(started.execId).catch(() => null)
        break
      }
    }
    if (!st || !st.ok) return '[docker unavailable] command execution failed'

    const raw = `${st.stdoutTail || ''}\n${st.stderrTail || ''}`
    const idx = raw.lastIndexOf(DOCKER_EXIT_MARKER)
    // Exit code priority: in-band marker (command ran to completion) →
    // the container's real .State.ExitCode from docker inspect. Never default
    // an exited container to 0 — a failed entrypoint or a kill must surface.
    let exitCode = typeof st.exitCode === 'number' ? st.exitCode : undefined
    let combined = raw
    if (idx !== -1) {
      const parsed = parseInt(raw.slice(idx + DOCKER_EXIT_MARKER.length).trim(), 10)
      if (Number.isFinite(parsed)) exitCode = parsed
      combined = raw.slice(0, idx)
    }
    return formatShellResult(combined, '', exitCode ?? '', timedOut)
  } finally {
    try { await dockerBackend.dispose(started.execId) } catch { /* best effort */ }
  }
}

// ── Tool definitions ────────────────────────────────────────────────────
const TOOLS = [
  // ── Read tools ──────────────────────────────────────────────────────────
  { name: 'read_file', description: 'Read file content (up to 64KB).', risk: 'safe', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] }, run: (args, ctx) => {
    const p = String(args.path || ''); if (!p) throw new Error('path is required'); guardWorkspaceRead(p, ctx, 'path')
    const buf = fs.readFileSync(p); let text = buf.slice(0, MAX_READ_BYTES).toString('utf-8')
    const offset = Number(args.offset) || 0; const limit = Number(args.limit) || 0
    if (offset > 1 || limit > 0) { const lines = text.split('\n'); const start = Math.max(0, (offset ? offset - 1 : 0)); text = (limit > 0 ? lines.slice(start, start + limit) : lines.slice(start)).join('\n') }
    return text + (buf.length > MAX_READ_BYTES ? `\n\n[truncated, ${buf.length} bytes total]` : '')
  }},
  { name: 'list_dir', description: 'List directory entries.', risk: 'safe', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, run: (args, ctx) => {
    const p = String(args.path || ''); if (!p) throw new Error('path is required'); guardWorkspaceRead(p, ctx, 'path')
    return fs.readdirSync(p, { withFileTypes: true }).map(e => e.isDirectory() ? e.name + '/' : e.name).join('\n') || '(empty)'
  }},
  { name: 'glob_find', description: 'Find files by glob (up to 100).', risk: 'safe', parameters: { type: 'object', properties: { pattern: { type: 'string' }, cwd: { type: 'string' } }, required: ['pattern', 'cwd'] }, run: async (args, ctx) => {
    const pattern = String(args.pattern || ''); const cwd = String(args.cwd || '')
    if (!pattern) throw new Error('pattern is required'); guardWorkspaceRead(cwd, ctx, 'cwd')
    const m = await glob(pattern, { cwd: cwd || undefined, absolute: true, nodir: true })
    return m.slice(0, 100).join('\n') || '(no matches)'
  }},
  { name: 'grep_search', description: 'Search file contents by regex (up to 50 hits).', risk: 'safe', parameters: { type: 'object', properties: { pattern: { type: 'string' }, cwd: { type: 'string' }, glob: { type: 'string' } }, required: ['pattern', 'cwd'] }, run: async (args, ctx) => {
    const pattern = String(args.pattern || ''); const cwd = String(args.cwd || '')
    if (!pattern) throw new Error('pattern is required'); guardWorkspaceRead(cwd, ctx, 'cwd')
    let re; try { re = new RegExp(pattern) } catch (e) { return `invalid regex: ${e.message}` }
    if (rgAvailable()) { const o = await grepWithRipgrep({ cwd, glob: args.glob, pattern }); if (o !== null) return formatRipgrepLines(o, cwd) }
    const files = await glob(args.glob || '**/*', { cwd: cwd || undefined, absolute: true, nodir: true })
    const hits = []; outer: for (const f of files.slice(0, 2000)) {
      try { const text = fs.readFileSync(f, 'utf-8'); const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { hits.push(`${path.relative(cwd || path.dirname(f), f)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`); if (hits.length >= 200) break outer } }
      } catch {}
    } return hits.join('\n').slice(0, MAX_GREP_BYTES) || '(no matches)'
  }},
  { name: 'find_symbol', description: 'Find symbol definition (LSP-first, regex fallback).', risk: 'safe', parameters: { type: 'object', properties: { name: { type: 'string' }, cwd: { type: 'string' } }, required: ['name', 'cwd'] }, run: async (args, ctx) => {
    const name = String(args.name || ''); const cwd = String(args.cwd || '')
    if (!name) throw new Error('name is required'); guardWorkspaceRead(cwd, ctx, 'cwd')
    if (lspFullEnabled(ctx)) { try { const lsp = require('../context/lspClient'); const r = await lsp.findSymbol(name, cwd); if (r && r.length) return JSON.stringify(r) } catch {} }
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()[\\]\\]/g, '\\$&')}\\b`)
    const files = await glob('**/*', { cwd: cwd || undefined, absolute: true, nodir: true })
    const hits = []; outer: for (const f of files.slice(0, 2000)) {
      try { const text = fs.readFileSync(f, 'utf-8'); const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { hits.push(`${path.relative(cwd || path.dirname(f), f)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`); if (hits.length >= 50) break outer } }
      } catch {}
    } return hits.join('\n') || '(no matches)'
  }},
  { name: 'codebase_graph', description: 'Analyze codebase architecture (frameworks, entry points, API routes, data models). Modes: overview, impact, relevance.', risk: 'safe', parameters: { type: 'object', properties: { query: { type: 'string' }, mode: { type: 'string', enum: ['overview', 'impact', 'relevance'] }, maxFiles: { type: 'number' } } }, run: async (args, ctx) => {
    const { getWorkspaceRoot } = require('./sandbox'); const root = getWorkspaceRoot(ctx?.sessionId); if (!root) return 'no workspace'
    const a = require('../context/codebaseAnalyzer'); const pi = require('../context/projectIndexer'); const mode = String(args.mode || 'overview').toLowerCase()
    if (mode === 'impact') {
      const g = await pi.indexWorkspace(root); const r = a.analyzeImpact(g, String(args.query || ''))
      if (!r.total) return `no files reference "${args.query}"`
      return [`Impact: "${args.query}"`, `Direct: ${r.direct.length}`, ...r.direct.map(f => `  → ${f}`), `Transitive: ${r.transitive.length}`, ...r.transitive.map(f => `  → ${f}`), `Total: ${r.total}`].join('\n')
    }
    if (mode === 'relevance') {
      const g = await pi.indexWorkspace(root); const topN = Number(args.maxFiles) || 20
      const r = a.scoreRelevance(g, String(args.query || ''), topN)
      if (!r.length) return 'no relevant files'
      return [`Top ${r.length} files:`, ...r.map(x => `  [${x.score}] ${x.file}`)].join('\n')
    }
    const an = a.analyzeCodebase(null, root, { maxFiles: 3000 }); if (!an) return 'analysis failed'
    const L = [`Codebase: ${path.basename(root)}`, `Frameworks: ${an.frameworks.map(f => `${f.framework} (${Math.round(f.confidence * 100)}%)`).join(', ') || 'none'}`, `Files: ${an.fileCount} | Graph: ${an.graphNodes} nodes, ${an.graphEdges} edges`, '']
    if (an.entryPoints.length) { L.push(`Entry points:`, ...an.entryPoints.slice(0, 10).map(e => `  [${e.type}] ${e.file}`)); L.push('') }
    if (an.apiRoutes.length) { L.push(`API routes:`, ...an.apiRoutes.slice(0, 15).map(r => `  ${r.path} → ${r.file}`)); L.push('') }
    if (an.configs.length) L.push(`Configs: ${an.configs.map(c => c.type).join(', ')}`)
    return L.join('\n')
  }},
  { name: 'workspace_files', description: 'Detect and load workspace files (AGENTS.md/AETHER.md/SOUL.md/MEMORY.md).', risk: 'safe', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'load'] } } }, run: async (args) => {
    const ws = require('../workspace/workspaceDetector'); const a = String(args.action || 'list')
    if (a === 'list') { const { files } = ws.detectWorkspaceFiles(); return files.length ? files.map(f => `${f.name} (${f.type})`).join('\n') : 'no workspace files' }
    const { files } = ws.loadAllWorkspaceFiles(); const keys = Object.keys(files); if (!keys.length) return 'no files found'
    return Object.entries(files).map(([t, f]) => `## ${f.fileName} (${t})\n\n${f.content}`).join('\n\n---\n\n')
  }},

  // ── Write tools ────────────────────────────────────────────────────────
  { name: 'write_file', description: 'Write text to a file. DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, run: async (args, ctx) => {
    const p = String(args.path || ''); const c = String(args.content ?? ''); if (!p) throw new Error('path is required')
    if (ctx?.agentMode !== 'yolo') { const g = checkWritePath(p, ctx?.sessionId); if (!g.ok) throw new Error(g.reason) }
    await fs.promises.mkdir(path.dirname(p), { recursive: true }); await fs.promises.writeFile(p, c, 'utf-8')
    return `wrote ${c.length} chars to ${p}`
  }},
  { name: 'edit_file', description: 'Replace text in a file. DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] }, run: async (args, ctx) => {
    const p = String(args.path || ''); const o = String(args.old_string ?? ''); const n = String(args.new_string ?? '')
    if (!p || !o) throw new Error('path and old_string are required')
    if (ctx?.agentMode !== 'yolo') { const g = checkWritePath(p, ctx?.sessionId); if (!g.ok) throw new Error(g.reason) }
    const orig = await fs.promises.readFile(p, 'utf-8'); const idx = orig.indexOf(o)
    if (idx === -1) throw new Error('old_string not found'); if (orig.indexOf(o, idx + 1) !== -1) throw new Error('old_string is not unique')
    await fs.promises.writeFile(p, orig.slice(0, idx) + n + orig.slice(idx + o.length), 'utf-8')
    return `edited ${p}`
  }},
  { name: 'apply_patch', description: 'Apply a unified diff patch. DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { path: { type: 'string' }, patch: { type: 'string' } }, required: ['path', 'patch'] }, run: async (args, ctx) => {
    const p = String(args.path || ''); const pt = String(args.patch || ''); if (!p || !pt) throw new Error('path and patch required')
    if (ctx?.agentMode !== 'yolo') { const g = checkWritePath(p, ctx?.sessionId); if (!g.ok) throw new Error(g.reason) }
    const orig = await fs.promises.readFile(p, 'utf-8'); const r = applyHunks(orig.split('\n'), parseUnifiedDiff(pt))
    if (r.conflicts.length) return `conflicts: ${r.conflicts.join('; ')}`
    await fs.promises.writeFile(p, r.content, 'utf-8'); return `patched ${p} (${r.applied} hunks)`
  }},

  // ── Execution tools ─────────────────────────────────────────────────────
  { name: 'run_command', description: 'Run a shell command. DANGEROUS.', risk: 'dangerous', executionMode: 'sequential', parameters: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'number' } }, required: ['command', 'description'] }, run: (args, ctx) => {
    const cmd = String(args.command || ''); if (!cmd) throw new Error('command is required')
    if (ctx?.agentMode !== 'yolo') { const g = checkCommand(cmd); if (!g.ok) throw new Error(g.reason) }
    const cwd = args.cwd ? String(args.cwd) : undefined; const timeoutMs = Number(args.timeout) || 30000
    // Explicit backend selection: ctx.executionBackend (future wiring) or the
    // exec.backend setting — makes the resolver's configured branch reachable
    // from this tool instead of dead code.
    let configured = ctx?.executionBackend || ''
    if (!configured && ctx?.db) { try { configured = String(ctx.db.getSetting('exec.backend') || '') } catch { /* fall through to mode-based resolution */ } }
    // Docker-as-safe-default (flag exec.docker.defaultForAuto, default off):
    // in auto/auto_confirm with the flag enabled and a reachable daemon the
    // command runs inside an ephemeral no-network container instead of the host shell.
    return resolveBackendForMode(ctx?.agentMode, { db: ctx?.db, configured }).then((backendId) => {
      if (backendId !== 'docker') {
        return (/[|&;`$(){}!\\]/.test(cmd) ? runCommand('cmd.exe', ['/c', cmd], { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024, shell: true }) : runCommand(cmd, [], { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 }))
          .then(({ stdout, stderr, exitCode, timedOut }) => formatShellResult(stdout, stderr, exitCode, timedOut))
      }
      return runInDocker(cmd, timeoutMs, ctx?.db)
    })
  }},

  // ── Agent tools ─────────────────────────────────────────────────────────
  { name: 'delegate_task', description: 'Delegate parallel sub-tasks to sub-agents.', risk: 'dangerous', parameters: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 } }, required: ['tasks'] }, run: async (args, ctx) => {
    const tasks = Array.isArray(args.tasks) ? args.tasks.filter(Boolean) : []
    if (!tasks.length) throw new Error('tasks must be non-empty')
    const SA = require('./subAgent'); const shared = { db: ctx.db, provider: ctx.provider, model: ctx.model, signal: ctx.signal, options: ctx.options || {}, agentMode: 'auto' }
    const results = await SA.runParallel(tasks, shared)
    return results.map((r, i) => `### Task ${i + 1}: ${tasks[i].slice(0, 80)}\n${r.success ? r.output : `(failed: ${r.error})`}`).join('\n\n')
  }},
  { name: 'run_agent', description: 'Spawn a specialized sub-agent (explore/build/review/research/debug).', risk: 'dangerous', parameters: { type: 'object', properties: { role: { type: 'string', enum: ['explore', 'build', 'review', 'research', 'debug'] }, task: { type: 'string' }, maxIterations: { type: 'number' } }, required: ['role', 'task'] }, run: async (args, ctx) => {
    if (!ctx) return 'no context'
    const roles = require('../llm/agentRoles'); const SA = require('./subAgent')
    if (!roles.getRole(args.role)) return `unknown role: ${args.role}`
    const td = String(args.task || '').trim(); if (!td) return 'task is required'
    const mp = roles.buildRolePrompt(args.role, td); if (!mp) return 'prompt build failed'
    try {
      const o = await SA.runSubagent({ db: ctx.db, parentSessionId: ctx.sessionId, provider: ctx.provider, model: ctx.model, prompt: mp, signal: ctx.signal, agentMode: roles.getRoleDefaultMode(args.role), callbacks: ctx.callbacks || {} })
      return o.content || '(no content)'
    } catch (e) { return `agent error: ${e?.message}` }
  }},
  { name: 'run_workflow', description: 'Execute a typed multi-step workflow (feature/bugfix/refactor/explore).', risk: 'dangerous', parameters: { type: 'object', properties: { template: { type: 'string', enum: ['feature', 'bugfix', 'refactor', 'explore'] }, request: { type: 'string' } }, required: ['template', 'request'] }, run: async (args, ctx) => {
    if (!ctx) return 'no context'
    const wf = require('../llm/workflow'); const tn = String(args.template || 'feature'); const req = String(args.request || '').trim(); if (!req) return 'request required'
    try {
      const r = await wf.runWorkflow({ db: ctx.db, provider: ctx.provider, model: ctx.model, templateName: tn, userRequest: req, signal: ctx.signal })
      if (!r.ok) return `failed: ${r.error}`; return r.summary || '(done)'
    } catch (e) { return `error: ${e?.message}` }
  }},
  { name: 'run_long_task', description: 'Run a long-running persistent task (debug_loop/test_fix/build_verify).', risk: 'dangerous', parameters: { type: 'object', properties: { taskType: { type: 'string', enum: ['debug_loop', 'test_fix', 'build_verify'] }, prompt: { type: 'string' } }, required: ['taskType', 'prompt'] }, run: async (args, ctx) => {
    if (!ctx) return 'no context'
    const lrt = require('../llm/longRunningTask'); const tt = String(args.taskType || 'debug_loop'); const p = String(args.prompt || '').trim(); if (!p) return 'prompt required'
    try {
      const r = await lrt.runLongTask({ db: ctx.db, provider: ctx.provider, model: ctx.model, sessionId: ctx.sessionId, taskType: tt, prompt: p, signal: ctx.signal })
      if (!r.ok) return `failed: ${r.error} (${r.cycles} cycles)`; return r.summary || 'done'
    } catch (e) { return `error: ${e?.message}` }
  }},
  { name: 'review_code', description: 'Review code for bugs, security, performance.', risk: 'safe', parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } } }, run: async (args, ctx) => {
    const { reviewFiles } = require('./reviewer')
    const ftr = (Array.isArray(args.files) ? args.files : []).slice(0, 5).map(f => { try { return { path: f, content: fs.readFileSync(f, 'utf-8') } } catch { return null } }).filter(Boolean)
    return (await reviewFiles({ provider: ctx.provider, model: ctx.model, files: ftr, signal: ctx.signal })).summary
  }},
  { name: 'run_arena', description: 'Multi-agent arena: plan → cross-review → judge → execute. Modes: plan_only, full.', risk: 'dangerous', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['plan_only', 'full'] }, request: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } } }, required: ['request'] }, run: async (args, ctx) => {
    if (!ctx) return 'no context'
    const ar = require('../llm/agentArena'); const mode = String(args.mode || 'plan_only'); const req = String(args.request || '').trim(); if (!req) return 'request required'
    try {
      const r = await ar.runArena({ db: ctx.db, provider: ctx.provider, model: ctx.model, userRequest: req, signal: ctx.signal, mode, roles: Array.isArray(args.roles) && args.roles.length ? args.roles : ['explore', 'build', 'review'] })
      if (!r.ok) return `failed: ${r.error}`
      if (mode === 'plan_only') return (r.plans || []).map(p => `[${p.role}] ${(p.plan || '').slice(0, 300)}...`).join('\n')
      return [`Best: ${r.bestPlan.role} (${r.bestPlan.score})`, r.execution?.success ? r.execution.output : `exec failed: ${r.execution?.error}`].join('\n')
    } catch (e) { return `error: ${e?.message}` }
  }},

  // ── Memory tools ────────────────────────────────────────────────────────
  { name: 'memory_save', description: 'Save a structured memory entry (entity/fact/context/relation). DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { content: { type: 'string' }, type: { type: 'string', enum: ['entity', 'fact', 'context', 'relation'] } }, required: ['content', 'type'] }, run: async (args, ctx) => {
    if (!ctx?.db) return 'no db'
    const c = String(args.content || '').trim(); const t = String(args.type || 'fact')
    try {
      if (t === 'relation') { const p = c.split('|'); if (p.length < 3) return 'format: entity1|relation|entity2'
        ctx.db.run('INSERT INTO memory (content, type, relation_entity, relation_type, relation_target, source_session_id) VALUES (?,?,?,?,?,?)', c, 'relation', p[0].trim(), p[1].trim(), p.slice(2).join('|').trim(), ctx.sessionId || null) }
      else { ctx.db.addMemoryWithProvenance(c, t, ctx.sessionId || null, 'user') }
      return `saved ${t}: ${c.slice(0, 80)}`
    } catch (e) { return `error: ${e.message}` }
  }},

  // ── Web tools ───────────────────────────────────────────────────────────
  { name: 'web_search', description: 'Search the web (DDG).', risk: 'safe', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, run: async (args, ctx) => {
    const q = String(args.query || ''); if (!q) throw new Error('query required')
    const ctrl = new AbortController(); const timeout = setTimeout(() => ctrl.abort(), 15000)
    try {
      const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q)
      if (ctx?.db) { try { const { policyActive, checkUrlPolicy } = require('../llm/networkPolicy'); if (policyActive(ctx.db)) { const a2 = checkUrlPolicy(ctx.db, url); if (!a2.ok) return `[blocked]` } } catch { return `[blocked: network policy check failed]` } }
      await checkSSRFHostname(new URL(url).hostname)
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Aether/0.1' }, redirect: 'error' })
      if (!res.ok) return `[failed: HTTP ${res.status}]`; const html = await res.text(); return `<!-- EXTERNAL_WEB_SEARCH -->\n${extractDdgSnippets(html, q)}`
    } catch (e) { return `[error: ${e.message}]` } finally { clearTimeout(timeout) }
  }},
  { name: 'web_fetch', description: 'Fetch URL content (up to 16KB).', risk: 'safe', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, run: async (args, ctx) => {
    const url = String(args.url || ''); if (!url) throw new Error('url required')
    if (ctx?.db) { try { const { policyActive, checkUrlPolicy } = require('../llm/networkPolicy'); if (policyActive(ctx.db)) { const a2 = checkUrlPolicy(ctx.db, url); if (!a2.ok) return `[blocked]` } } catch { return `[blocked: network policy check failed]` } }
    const ssrf = checkSSRF(url); if (!ssrf.ok) return `[blocked]`
    let parsed; try { parsed = new URL(url) } catch { return '[invalid]' }
    try { await checkSSRFHostname(parsed.hostname) } catch (e) { return `[blocked: ${e.message}]` }
    const ctrl = new AbortController(); const timeout = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Aether/0.1' }, redirect: 'error' })
      if (!res.ok) return `[failed: HTTP ${res.status}]`; const raw = await res.text()
      const text = (res.headers.get('content-type') || '').includes('html') ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : raw
      return `<!-- EXTERNAL_WEB_FETCH -->\n${text.slice(0, 16384)}${text.length > 16384 ? '\n[truncated]' : ''}`
    } catch (e) { return `[error: ${e.message}]` } finally { clearTimeout(timeout) }
  }},

  // ── Platform tools ──────────────────────────────────────────────────────
  { name: 'use_skill', description: 'Load a skill by name.', risk: 'safe', parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] }, run: (args) => {
    const name = String(args.skill_name || ''); if (!name) throw new Error('skill_name required')
    const skill = require('./skills').getSkill(name); if (!skill) throw new Error(`unknown skill: ${name}`); return skill.content
  }},
  { name: 'gateway', description: 'Start/stop/get status of gateway channels (webhook/telegram/discord).', risk: 'dangerous', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'stop', 'status', 'send'] }, channel: { type: 'string' }, type: { type: 'string', enum: ['webhook', 'telegram', 'discord'] }, config: { type: 'object' }, message: { type: 'string' } } }, run: async (args, ctx) => {
    if (!ctx) return 'no context'
    const gw = require('../gateway/index'); const a = String(args.action || 'status')
    try {
      if (a === 'status') { return Array.from(gw.gateway.channels.entries()).map(([n, c]) => `${n}: ${c.status}`).join('\n') || 'no channels' }
      if (a === 'start') { const ch = gw.gateway.addChannel(args.channel || 'default', args.type || 'webhook', { ...(args.config || {}), db: ctx.db }); await gw.gateway.startChannel(args.channel || 'default'); return `started` }
      if (a === 'stop') { await gw.gateway.stopChannel(args.channel || 'default'); return `stopped` }
      if (a === 'send') { const ch = gw.gateway.channels.get(args.channel || 'default'); if (!ch) return 'not found'; await ch.send('*broadcast*', String(args.message || '')); return 'sent' }
      return 'unknown action'
    } catch (e) { return `error: ${e.message}` }
  }},

  // ── Debug tools ─────────────────────────────────────────────────────────
  { name: 'debug_loop', description: 'Run test → analyze → fix loop until tests pass or max cycles.', risk: 'dangerous', parameters: { type: 'object', properties: { maxCycles: { type: 'number' } } }, run: async (args, ctx) => {
    const da = require('./debugAgent'); const maxC = Math.min(Number(args.maxCycles) || 5, 10)
    const r = await da.runDebugLoop({ provider: ctx.provider, model: ctx.model, signal: ctx.signal, sessionId: ctx.sessionId })
    if (r.success) return `✅ ${r.summary} (${r.cycles} cycles)`
    const lines = [r.analysis ? r.analysis.description : `❌ Failed (${r.cycles}/${maxC})`]; return lines.join('\n')
  }},
]

// ── LSP tools (feature-flagged) ──────────────────────────────────────────
function makeLspTool(name, desc, fn) {
  return { name, description: desc, risk: 'safe', parameters: { type: 'object', properties: { position: { type: 'object' } } }, run: async (args, ctx) => {
    if (!lspFullEnabled(ctx)) return 'LSP disabled'
    try { const r = await require('../context/lspClient')[fn](args.position || args); return r ? JSON.stringify(r) : '(no result)' } catch (e) { return `LSP error: ${e.message}` }
  }}
}
TOOLS.push(makeLspTool('lsp_definition', 'Find symbol definition via LSP', 'getDefinition'))
TOOLS.push(makeLspTool('lsp_references', 'Find symbol references via LSP', 'getReferences'))
TOOLS.push(makeLspTool('lsp_diagnostics', 'Get LSP diagnostics', 'getDiagnostics'))
TOOLS.push(makeLspTool('lsp_code_actions', 'Get LSP code actions', 'getCodeActions'))
TOOLS.push({ name: 'lsp_rename', description: 'Rename symbol via LSP. DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { position: { type: 'object' }, new_name: { type: 'string' } }, required: ['position', 'new_name'] }, run: async (args, ctx) => {
  if (!lspFullEnabled(ctx)) return 'LSP disabled'
  try { const r = await require('../context/lspClient').renameSymbol(args.position || {}, args.new_name); return r ? JSON.stringify(r) : '(no result)' } catch (e) { return `LSP error: ${e.message}` }
}})

// ── GitHub tools ─────────────────────────────────────────────────────────
TOOLS.push(
  { name: 'github_issue_create', description: 'Create a GitHub issue. DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title'] }, run: async (args) => {
    const t = String(args.title || ''); if (!t) throw new Error('title required')
    const r = await runCommand('gh', ['issue', 'create', '--title', t, ...(args.body ? ['--body', String(args.body)] : [])], { timeout: 30000, maxBuffer: 16 * 1024 })
    if (r.exitCode !== 0) throw new Error(r.stderr || 'failed'); return (r.stdout || 'Issue created').trim()
  }},
  { name: 'github_issue_list', description: 'List GitHub issues. Read-only.', risk: 'safe', parameters: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] }, limit: { type: 'number' } } }, run: async (args) => {
    const r = await runCommand('gh', ['issue', 'list', '--state', String(args.state || 'open'), '--limit', String(args.limit || 30)], { timeout: 30000, maxBuffer: 32 * 1024 })
    if (r.exitCode !== 0) throw new Error(r.stderr || 'failed'); return r.stdout || '(none)'
  }},
  { name: 'github_pr_create', description: 'Create a GitHub PR. DANGEROUS.', risk: 'dangerous', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, base: { type: 'string' } }, required: ['title'] }, run: async (args, ctx) => {
    const t = String(args.title || ''); if (!t) throw new Error('title required')
    const r = await runCommand('gh', ['pr', 'create', '--title', t, '--base', String(args.base || 'master'), ...(args.body ? ['--body', String(args.body)] : [])], { timeout: 30000, maxBuffer: 16 * 1024 })
    if (r.exitCode !== 0) throw new Error(r.stderr || 'failed'); return (r.stdout || 'PR created').trim()
  }}
)

// ── Exports ──────────────────────────────────────────────────────────────
function getTool(name) { return TOOLS.find(t => t.name === name) }
function toolsPayload() { return TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }

module.exports = { TOOLS, getTool, toolsPayload, parseUnifiedDiff, applyHunks }
