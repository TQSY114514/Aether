// ───────────────────────────────────────────────────────────────────────────
// Built-in tool registry.
//
// Each tool is a plain object: { name, description, parameters, risk, run }.
//   - risk: 'safe' (read-only, no side effects) or 'dangerous' (writes files,
//     runs commands, or otherwise mutates state). The permission gate in
//     toolLoop.js consults this: in `ask` mode dangerous tools require a user
//     confirm before running; in `plan` mode they are blocked entirely.
//   - run(args, ctx): executes the tool, returns a string result (or throws).
//
// `parameters` is the OpenAI function-call JSON Schema for arguments.
//
// Tool execution modes (OpenClaw-inspired):
//   executionMode: 'parallel' (default) — safe to run concurrently with others
//   executionMode: 'sequential'    — must run alone (e.g. commands that mutate
//                                     shared state). When any tool in a round
//                                     declares sequential, the whole round falls
//                                     back to sequential execution.
//
// Tool lifecycle hooks (per-tool):
//   beforeToolCall(ctx) — runs before the tool; can throw to block
//   afterToolCall(ctx)  — runs after success; can modify the result
//   prepareArguments(args) — can rewrite arguments before execution
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { runCommand, runCommandSync } = require('./exec')
const { glob } = require('glob')
const { checkWritePath, checkCommand, isInsideWorkspace } = require('./sandbox')
const { streamCommand, formatStreamResult } = require('../llm/toolStream')
const { checkSSRF, checkSSRFHostname, ssrfFetchOptions } = require('./ssrf')

const MAX_READ_BYTES = 64 * 1024 // cap read_file output so a huge file doesn't blow the context
const MAX_GREP_BYTES = 32 * 1024

// ─── 读边界（spec P1-H1）─────────────────────────────────────────────────────
// 读工具（read_file/list_dir/glob_find/grep_search）目标路径出 workspace 时：
//   - ask 模式 → 抛明确错误，提示模型改用 ask_user 请求用户批准；
//   - yolo/auto（及未传 agentMode 的旧调用）→ 放行。
function guardWorkspaceRead(target, ctx, label) {
  const p = String(target || '')
  if (!p) return
  if (ctx?.agentMode !== 'ask') return
  if (isInsideWorkspace(p, ctx?.sessionId)) return
  throw new Error(`读取被拒绝：${label} ${p} 位于工作区之外（当前为 ask 模式）。如确需读取该路径，请改用 ask_user 工具向用户说明并请求批准`)
}

// ─── Feature-flag gate for the full LSP tool set ────────────────────────────
// The lsp_* tools ship behind the `lsp.full` flag (featureFlags.js): when the
// flag is off (the default) they return a short notice instead of spawning an
// LSP server, so the capability stays declaratively toggleable. Never throws —
// a missing/unusable db falls back to the flag default.
function lspFullEnabled(ctx) {
  try {
    const { isEnabled } = require('../featureFlags')
    return isEnabled(ctx?.db, 'lsp.full')
  } catch {
    return false
  }
}

// ─── Ripgrep helper ─────────────────────────────────────────────────────────
// Fast content search backed by `rg` when it's on PATH. Returns matched lines
// (`path:line:content`) or null so the caller falls back to the sync loop (e.g.
// rg unavailable, or a JS-only regex rg can't parse — rg exits 2 on that).
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

    let stdout = ''
    let stderr = ''
    let done = false
    const finish = () => { if (!done) { done = true; resolve(stdout) } }
    child.stdout.on('data', (d) => {
      stdout += d.toString()
      if (stdout.length > MAX_GREP_BYTES) { try { child.kill() } catch {}; finish() }
    })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', () => finish())
    child.on('close', (code) => {
      // Exit 2 = rg error (e.g. invalid/incompatible regex) → fall back.
      if (code === 2 && !stdout) resolve(null)
      else finish()
    })
    setTimeout(() => { if (!done) { try { child.kill() } catch {}; finish() } }, 15000)
  })
}

function formatRipgrepLines(output, cwd) {
  const hits = []
  for (const line of output.split('\n')) {
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) { hits.push(line); continue }
    const rest = line.slice(idx + 1)
    const idx2 = rest.indexOf(':')
    const lineno = idx2 >= 0 ? rest.slice(0, idx2) : ''
    const content = idx2 >= 0 ? rest.slice(idx2 + 1) : ''
    let rel = line.slice(0, idx)
    if (cwd) { try { rel = path.relative(cwd, rel) || path.basename(rel) } catch {} }
    hits.push(`${rel}:${lineno}: ${content.trim().slice(0, 200)}`)
    if (hits.length >= 200) break
  }
  return hits.join('\n') || '(no matches)'
}

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the text content of a file at the given absolute path. Returns up to 64KB of UTF-8 text. Use for inspecting local code/config files the user references.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to read.' },
        offset: { type: 'number', description: 'Line number to start reading from (1-based, optional).' },
        limit: { type: 'number', description: 'Maximum number of lines to read (optional).' },
      },
      required: ['path'],
    },
    run: (args, ctx) => {
      const p = String(args.path || '')
      if (!p) throw new Error('path is required')
      guardWorkspaceRead(p, ctx, 'path')
      const buf = fs.readFileSync(p)
      let text = buf.slice(0, MAX_READ_BYTES).toString('utf-8')
      // Line-based slicing if offset/limit given.
      const offset = Number(args.offset) || 0
      const limit = Number(args.limit) || 0
      if (offset > 1 || limit > 0) {
        const lines = text.split('\n')
        const start = Math.max(0, (offset ? offset - 1 : 0))
        const slice = limit > 0 ? lines.slice(start, start + limit) : lines.slice(start)
        text = slice.join('\n')
      }
      const truncated = buf.length > MAX_READ_BYTES ? `\n\n[truncated, ${buf.length} bytes total]` : ''
      return text + truncated
    },
  },
  {
    name: 'list_dir',
    description: 'List the entries of a directory at the given absolute path. Returns one entry per line with a trailing / for directories.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory.' },
      },
      required: ['path'],
    },
    run: (args, ctx) => {
      const p = String(args.path || '')
      if (!p) throw new Error('path is required')
      guardWorkspaceRead(p, ctx, 'path')
      const entries = fs.readdirSync(p, { withFileTypes: true })
      return entries.map(e => e.isDirectory() ? e.name + '/' : e.name).join('\n') || '(empty)'
    },
  },
  {
    name: 'glob_find',
    description: 'Find files matching a glob pattern (e.g. **/*.ts) rooted at a directory. Returns matching absolute paths, up to 100.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts".' },
        cwd: { type: 'string', description: 'Absolute directory to search in.' },
      },
      required: ['pattern', 'cwd'],
    },
    run: async (args, ctx) => {
      const pattern = String(args.pattern || '')
      const cwd = String(args.cwd || '')
      if (!pattern) throw new Error('pattern is required')
      guardWorkspaceRead(cwd, ctx, 'cwd')
      const matches = await glob(pattern, { cwd: cwd || undefined, absolute: true, nodir: true })
      return matches.slice(0, 100).join('\n') || '(no matches)'
    },
  },
  {
    name: 'grep_search',
    description: 'Search file contents under a directory for a regex pattern. Returns matching lines with file:line prefixes, up to 50 hits.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        cwd: { type: 'string', description: 'Absolute directory to search in.' },
        glob: { type: 'string', description: 'Optional glob filter, e.g. "*.ts".' },
      },
      required: ['pattern', 'cwd'],
    },
    run: async (args, ctx) => {
      const pattern = String(args.pattern || '')
      const cwd = String(args.cwd || '')
      if (!pattern) throw new Error('pattern is required')
      guardWorkspaceRead(cwd, ctx, 'cwd')
      let re
      try { re = new RegExp(pattern) } catch (e) { return `invalid regex: ${e.message}` }

      // Fast path: ripgrep when available. Falls back automatically on missing
      // `rg` or a regex rg can't parse.
      if (rgAvailable()) {
        const rgOut = await grepWithRipgrep({ cwd, glob: args.glob, pattern })
        if (rgOut !== null) return formatRipgrepLines(rgOut, cwd)
      }

      // Fallback: sync scan (up to 2000 files / 200 hits).
      const files = await glob(args.glob || '**/*', { cwd: cwd || undefined, absolute: true, nodir: true })
      const hits = []
      outer: for (const f of files.slice(0, 2000)) {
        try {
          const text = fs.readFileSync(f, 'utf-8')
          const lines = text.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              hits.push(`${path.relative(cwd || path.dirname(f), f)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
              if (hits.length >= 200) break outer
            }
          }
        } catch {}
      }
      const out = hits.join('\n').slice(0, MAX_GREP_BYTES)
      return out || '(no matches)'
    },
  },
  {
    name: 'web_search',
    description: 'Search the public web for a query and return short text snippets of the top results. Use when the user asks about recent events, current data, or anything not in your training data.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
      },
      required: ['query'],
    },
    run: async (args, ctx) => {
      const q = String(args.query || '')
      if (!q) throw new Error('query is required')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q)
        // Network policy (allowlist) — only when flag on AND whitelist configured.
        if (ctx?.db) {
          try {
            const { policyActive, checkUrlPolicy } = require('../llm/networkPolicy')
            if (policyActive(ctx.db)) {
              const allowed = checkUrlPolicy(ctx.db, url)
              if (!allowed.ok) return `[blocked: ${allowed.reason}]`
            }
          } catch {}
        }
        // DNS-based SSRF check: resolve hostname before request
        await checkSSRFHostname(new URL(url).hostname)
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Aether/0.1' }, redirect: 'error' })
        if (!res.ok) return `[search failed: HTTP ${res.status}]`
        const html = await res.text()
        const snippets = extractDdgSnippets(html, q)
        // Mark as external content to prevent prompt injection
        return `<!-- EXTERNAL_WEB_SEARCH -->\n${snippets}`
      } catch (e) {
        return `[search error: ${e.message}]`
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch a URL and return its text content (HTML stripped to text, up to 16KB). For reading a specific web page the user gave.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch.' },
      },
      required: ['url'],
    },
    run: async (args, ctx) => {
      const url = String(args.url || '')
      if (!url) throw new Error('url is required')
      // Network policy (allowlist) — only when flag on AND whitelist configured.
      if (ctx?.db) {
        try {
          const { policyActive, checkUrlPolicy } = require('../llm/networkPolicy')
          if (policyActive(ctx.db)) {
            const allowed = checkUrlPolicy(ctx.db, url)
            if (!allowed.ok) return `[blocked: ${allowed.reason}]`
          }
        } catch {}
      }
      // SSRF protection: reject non-http(s), localhost, and cloud metadata
      const ssrf = checkSSRF(url)
      if (!ssrf.ok) return `[blocked: ${ssrf.reason}]`
      let parsed
      try { parsed = new URL(url) } catch { return '[invalid url]' }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '[blocked: non-http(s) url]'
      // DNS-based SSRF check: resolve hostname to IP before request to catch
      // private IP targets. This also guards against DNS rebinding in the
      // initial request (not just redirects).
      try { await checkSSRFHostname(parsed.hostname) } catch (e) {
        return `[blocked: ${e.message}]`
      }
      // Block redirects to prevent SSRF via HTTP redirect to internal URL
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Aether/0.1' }, redirect: 'error' })
        if (!res.ok) return `[fetch failed: HTTP ${res.status}]`
        const ct = res.headers.get('content-type') || ''
        const raw = await res.text()
        // Plain-text extraction: the full tag-strip below already removes
        // script/style elements, so dedicated regexes for them are redundant.
        const text = ct.includes('html') ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : raw
        const marked = `<!-- EXTERNAL_WEB_FETCH -->\n${text.slice(0, 16384)}${text.length > 16384 ? '\n[truncated]' : ''}`
        return marked
      } catch (e) {
        return `[fetch error: ${e.message}]`
      } finally {
        clearTimeout(timeout)
      }
    },
  },
  {
    name: 'write_file',
    description: 'Write text content to a file at the given absolute path. Creates the file if it does not exist, overwrites if it does. DANGEROUS — mutates the filesystem.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to write.' },
        content: { type: 'string', description: 'The full text content to write.' },
      },
      required: ['path', 'content'],
    },
    run: async (args, ctx) => {
      const p = String(args.path || '')
      const content = String(args.content ?? '')
      if (!p) throw new Error('path is required')
      // Sandbox: refuse writes outside the workspace root — unless 'yolo' mode
      // (full permission, user explicitly accepted the risk).
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(p, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      await fs.promises.mkdir(path.dirname(p), { recursive: true })
      await fs.promises.writeFile(p, content, 'utf-8')
      return `wrote ${content.length} chars to ${p}`
    },
  },
  {
    name: 'edit_file',
    description: 'Replace the first occurrence of old_string with new_string in a file. Fails if old_string is not found or appears more than once (ambiguous). DANGEROUS — mutates a file.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to edit.' },
        old_string: { type: 'string', description: 'The exact text to replace (must be unique in the file).' },
        new_string: { type: 'string', description: 'The replacement text.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    run: async (args, ctx) => {
      const p = String(args.path || '')
      const oldS = String(args.old_string ?? '')
      const newS = String(args.new_string ?? '')
      if (!p || !oldS) throw new Error('path and old_string are required')
      // Sandbox: refuse edits outside the workspace root — unless 'yolo' mode.
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(p, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const orig = await fs.promises.readFile(p, 'utf-8')
      const idx = orig.indexOf(oldS)
      if (idx === -1) throw new Error('old_string not found')
      if (orig.indexOf(oldS, idx + 1) !== -1) throw new Error('old_string is not unique — make it more specific')
      const updated = orig.slice(0, idx) + newS + orig.slice(idx + oldS.length)
      await fs.promises.writeFile(p, updated, 'utf-8')
      return `edited ${p}: replaced ${oldS.length} chars with ${newS.length} chars`
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command and return its stdout+stderr (up to 8KB). DANGEROUS — executes arbitrary code. Use only when the user explicitly asks for it. ALWAYS supply a `description` in active voice explaining the intent (e.g. "List files in the project root") so the user sees what the command claims to do, not just raw shell.',
    risk: 'dangerous',
    executionMode: 'sequential', // commands may mutate shared state
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
        description: { type: 'string', description: 'A short, active-voice summary of what this command does and why (shown to the user). Required.' },
        cwd: { type: 'string', description: 'Working directory (optional, defaults to user home).' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (optional, default 30000).' },
        env: { type: 'object', description: 'Extra environment variables (optional).' },
      },
      required: ['command', 'description'],
    },
    run: (args, ctx) => {
      const cmd = String(args.command || '')
      if (!cmd) throw new Error('command is required')
      // Sandbox（P0-C2 白名单默认拒绝）: checkCommand 对 `&`/`|`/`;` 拼接的
      // 多段命令逐段校验——未全部命中白名单即整体拒绝，因此下方 needsShell
      // 的 shell:true 整串执行路径不再放行未审段的命令。yolo 模式（用户已
      // 接受风险）跳过该校验。
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkCommand(cmd)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const cwd = args.cwd ? String(args.cwd) : undefined
      const timeoutMs = Number(args.timeout) || 30000
      const extraEnv = args.env && typeof args.env === 'object' ? args.env : undefined

      // Whitelist env keys the model is allowed to set — prevents PATH/PYTHONPATH
      // manipulation via crafted tool arguments.
      const SAFE_ENV_KEYS = new Set(['LANG', 'LC_ALL', 'NODE_ENV', 'TERM', 'DEBUG', 'CI', 'VERBOSE'])
      const filteredEnv = extraEnv
        ? Object.fromEntries(Object.entries(extraEnv).filter(([k]) => SAFE_ENV_KEYS.has(k)))
        : undefined

      // If the caller provides onStream, use the streaming path for real-time
      // output (like Claude Code's live command output).
      if (ctx?.onStream) {
        return streamCommand(cmd, {
          cwd, timeoutMs, env: filteredEnv, sessionId: ctx?.sessionId,
        }).then((result) => {
          const text = formatStreamResult(result)
          ctx.onStream({ type: 'done', text, exitCode: result.exitCode })
          return text
        })
      }

      // Standard non-streaming path — use spawn() for safety.
      // For Windows, git commands and simple commands don't need a shell.
      // For commands that need shell features (pipes, redirects, &&), we
      // detect them and fall back to shell execution.
      const needsShell = /[|&;`$(){}!\\]/.test(cmd)
      return (needsShell
        ? runCommand('cmd.exe', ['/c', cmd], {
            cwd, env: filteredEnv, timeout: timeoutMs,
            maxBuffer: 32 * 1024, shell: true,
          })
        : runCommand(cmd, [], {
            cwd, env: filteredEnv, timeout: timeoutMs,
            maxBuffer: 32 * 1024,
          })
      ).then(({ stdout, stderr, exitCode, timedOut }) => {
        const out = stdout?.trim() || ''
        const errOut = stderr?.trim() || ''
        const parts = []
        if (out) parts.push('[stdout]\n' + out.slice(0, 4096))
        if (errOut) parts.push('[stderr]\n' + errOut.slice(0, 4096))
        const result = parts.join('\n\n') || '(no output)'
        if (timedOut) return `[timed out] ${result}`
        if (exitCode !== 0) return `[exit code: ${exitCode}]\n${result}`
        return result
      })
    },
  },
  {
    // Skills activation (Claude-Code-style progressive disclosure). Returns the
    // full SKILL.md body so the model can follow the skill's instructions. The
    // skill list is injected as a system-prompt block separately; this tool only
    // loads the body when the model decides a skill is relevant. Safe risk so
    // it's available even in plan mode.
    name: 'use_skill',
    description: 'Load the full instructions of a skill by name. Call this when the user\'s request matches a skill listed in <available_skills>, then follow the returned instructions. Returns the skill\'s markdown body.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'The skill name (as listed in <available_skills>).' },
      },
      required: ['skill_name'],
    },
    run: (args) => {
      const name = String(args.skill_name || '')
      if (!name) throw new Error('skill_name is required')
      // Lazy require to avoid a load-time cycle (skills.js requires nothing here,
      // but registry is required early; this keeps the dependency one-directional).
      const skills = require('../llm/skills')
      const skill = skills.getSkill(name)
      if (!skill) throw new Error(`unknown skill: ${name} (call only skills listed in <available_skills>)`)
      // Desktop polish #8: surface the skill's declared permissions (frontmatter
      // `permissions:` block, e.g. filesystem: project / network: github.com) so
      // the model knows what the skill may touch before executing its steps.
      const perms = skill.metadata && skill.metadata.permissions
        ? `\n\n[skill permissions]\n${String(skill.metadata.permissions)}`
        : ''
      // Track usage for the skills management UI.
      try { skills.recordSkillUse(name) } catch {}
      return skill.body + perms
    },
  },
  {
    // Structured clarification (Claude-Code-style AskUserQuestion). The agent
    // asks the user to pick from options instead of guessing. ctx.onAskUser
    // surfaces a tappable dialog; the chosen option label(s) come back as the
    // tool result. Safe risk (no side effects — just a question).
    name: 'ask_user',
    description: 'Ask the user a structured clarifying question with options. Use when the request is ambiguous and a wrong guess would waste effort. The user picks option(s); their choice is returned as the result. Do not overuse — only when genuinely unsure.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: '1-4 questions. Each has 2-4 options.',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The question text.' },
              header: { type: 'string', description: 'A short label (≤12 chars) shown as a chip above the question.' },
              options: {
                type: 'array',
                description: '2-4 options. An "Other" option is auto-added so the user can type a custom answer.',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Short option label.' },
                    description: { type: 'string', description: 'Optional longer explanation shown under the label.' },
                  },
                  required: ['label'],
                },
              },
            },
            required: ['question', 'options'],
          },
        },
      },
      required: ['questions'],
    },
    run: (args, ctx) => {
      const questions = Array.isArray(args.questions) ? args.questions.slice(0, 4).map(q => ({
        question: String(q.question || ''),
        header: q.header ? String(q.header).slice(0, 12) : undefined,
        options: Array.isArray(q.options) ? q.options.slice(0, 4).map(o => ({ label: String(o.label || ''), description: o.description ? String(o.description) : undefined })) : [],
      })).filter(q => q.options.length >= 2) : []
      if (questions.length === 0) throw new Error('ask_user needs 1-4 questions, each with ≥2 options')
      if (typeof ctx?.onAskUser !== 'function') {
        // headless/无对话框上下文: 不抛错卡死 agent——引导直接以文本提问
        return '[ask_user 无交互对话框 — 请直接在回复正文中向用户提问, 并等待用户回答后再继续]'
      }
      return ctx.onAskUser(questions)
    },
  },
  {
    // Structured task list (Claude-Code-style TodoWrite). The agent maintains a
    // checklist so the user can see what's done / in-progress / pending during a
    // multi-step task. The list is NOT returned as a tool result for the model to
    // re-read — instead ctx.onTodoUpdate streams it to the UI, and the tool just
    // acknowledges. Safe risk (no side effects beyond the UI).
    name: 'todo_write',
    description: 'Update the visible task checklist for a multi-step task. Call this at the start (to lay out steps), and again whenever a step starts or completes. The list renders live in the UI with a spinner on the in_progress item. Pass the FULL list each time (replace, not append).',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full task list (replaces the previous one).',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'What this step is.' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'pending = not started, in_progress = working on it now (shows a spinner), completed = done.' },
              activeForm: { type: 'string', description: 'Present-continuous label shown while in_progress (e.g. "Reading config file"). Optional.' },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
    run: (args, ctx) => {
      const todos = Array.isArray(args.todos) ? args.todos.map(t => ({
        content: String(t.content || ''),
        status: ['pending', 'in_progress', 'completed'].includes(t.status) ? t.status : 'pending',
        activeForm: t.activeForm ? String(t.activeForm) : undefined,
      })) : []
      if (typeof ctx?.onTodoUpdate === 'function') ctx.onTodoUpdate(todos)
      return `updated ${todos.length} todos`
    },
  },
  {
    name: 'git_status',
    description: 'Run `git status --short` in a directory and return the output. Read-only.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
      },
      required: ['cwd'],
    },
    run: (args) => {
      const cwd = String(args.cwd || '')
      return runCommand('git', ['status', '--short'], {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 15000,
      }).then(({ stdout, stderr, exitCode }) => {
        if (exitCode !== 0) throw new Error(stderr || `exit code ${exitCode}`)
        return stdout?.trim() || '(clean)'
      })
    },
  },
  {
    name: 'git_diff',
    description: 'Run `git diff` in a directory and return the output (up to 16KB). Read-only.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        staged: { type: 'boolean', description: 'If true, show staged diff (--cached).' },
      },
      required: ['cwd'],
    },
    run: (args) => {
      const cwd = String(args.cwd || '')
      const flag = args.staged ? ['--cached'] : []
      return runCommand('git', ['diff', ...flag], {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 15000,
      }).then(({ stdout }) => (stdout || '(no changes)').slice(0, 16384))
    },
  },
  {
    name: 'git_log',
    description: 'Show recent git commit history. Returns one line per commit. Read-only.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        count: { type: 'number', description: 'Number of commits to show (default 10, max 50).' },
        format: { type: 'string', description: 'Format style: "oneline" (default), "detailed", or "short".' },
      },
      required: ['cwd'],
    },
    run: (args) => {
      const cwd = String(args.cwd || '')
      const count = Math.min(Number(args.count) || 10, 50)
      const fmt = args.format === 'detailed' ? 'full' : args.format === 'short' ? 'short' : 'oneline'
      return runCommand('git', ['log', `--${fmt}`, '-n', String(count), '--no-decorate'], {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 15000,
      }).then(({ stdout }) => stdout || '(no commits)')
    },
  },
  {
    // Git commit — reads the diff, lets the model (optionally) generate a message,
    // then commits. Inspired by Aider's /commit and Claude Code's git integration.
    name: 'git_commit',
    description: 'Stage all changes and create a git commit. If no message is provided, the model should first read the diff with git_diff and compose a concise commit message following conventional commits style (feat/fix/docs/refactor/chore). DANGEROUS — creates a commit.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        message: { type: 'string', description: 'Commit message. If empty, the model should call git_diff first to compose one.' },
        all: { type: 'boolean', description: 'If true, stage all changes including deletions (git add -A). Default true.' },
      },
      required: ['cwd'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      const msg = String(args.message || '').trim()
      if (!msg) throw new Error('commit message is required — read the diff first and compose one')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      // Use spawn with separate git add + git commit for safety (no shell string).
      const addArgs = args.all !== false ? ['add', '-A'] : ['add', '.']
      const addResult = await runCommand('git', addArgs, {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 30000,
      })
      if (addResult.exitCode !== 0) {
        const out = addResult.stdout + addResult.stderr
        if (/nothing (to commit|added)/i.test(out)) return 'nothing to commit (working tree clean)'
        throw new Error(addResult.stderr || `git add failed (exit ${addResult.exitCode})`)
      }
      const commitResult = await runCommand('git', ['commit', '-m', msg], {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 30000,
      })
      if (commitResult.exitCode !== 0) {
        const out = commitResult.stdout + commitResult.stderr
        if (/nothing (to commit|added)/i.test(out)) return 'nothing to commit (working tree clean)'
        throw new Error(commitResult.stderr || `git commit failed (exit ${commitResult.exitCode})`)
      }
      // Background review: flag the commit for the async review queue (gated by
      // the agent.backgroundReview feature flag). Never blocks the tool loop.
      try {
        if (ctx?.db) {
          const { enqueueReview } = require('../llm/backgroundReview')
          enqueueReview({ db: ctx.db, cwd, sessionId: ctx.sessionId || null, titleSuffix: `@${cwd}` })
        }
      } catch (e) {
        // background review must never break the commit tool
      }
      return commitResult.stdout?.trim() || commitResult.stderr?.trim() || 'committed'
    },
  },
  {
    name: 'git_push',
    description: 'Push local commits to the remote repository. DANGEROUS — pushes to remote. Requires the repo to have a configured remote. Uses `git push` (no --force).',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        remote: { type: 'string', description: 'Remote name (default "origin").' },
        branch: { type: 'string', description: 'Branch to push. If omitted, uses current branch with upstream tracking.' },
      },
      required: ['cwd'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const remote = String(args.remote || 'origin')
      const branch = args.branch ? [String(args.branch)] : []
      const { stdout, stderr, exitCode } = await runCommand('git', ['push', remote, ...branch], {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 60000,
      })
      if (exitCode !== 0) {
        const out = (stdout || '') + (stderr || '')
        if (/Everything up-to-date/i.test(out)) return 'Everything up-to-date (no pushes needed)'
        throw new Error(stderr || `git push failed (exit ${exitCode})`)
      }
      return (stdout || stderr || 'pushed').trim()
    },
  },
  {
    name: 'git_create_branch',
    description: 'Create and checkout a new git branch. DANGEROUS — modifies repo state.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        name: { type: 'string', description: 'New branch name (e.g. "feat/auth").' },
        base: { type: 'string', description: 'Base branch to branch from (default: current HEAD).' },
      },
      required: ['cwd', 'name'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const name = String(args.name || '').trim()
      if (!name) throw new Error('name is required')
      const baseArgs = args.base ? [String(args.base)] : []
      const { stdout, stderr, exitCode } = await runCommand('git', ['checkout', '-b', name, ...baseArgs], {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 15000,
      })
      if (exitCode !== 0) throw new Error(stderr || `git checkout -b failed (exit ${exitCode})`)
      return (stdout || stderr || `created branch ${name}`).trim()
    },
  },
  // ─── GitHub CLI (gh) integration ────────────────────────────────────────
  // These tools wrap `gh` commands, enabling the agent to manage PRs, Issues,
  // Releases, and Actions. Requires the user to have `gh` CLI installed and
  // authenticated (`gh auth login`). All gh tools are `risk: dangerous` except
  // read-only ones.
  {
    name: 'github_pr_create',
    description: 'Create a GitHub Pull Request using `gh pr create`. Requires gh CLI. DANGEROUS — creates a PR on the remote repo.',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo (must have a GitHub remote).' },
        title: { type: 'string', description: 'PR title.' },
        body: { type: 'string', description: 'PR description (markdown). Optional.' },
        base: { type: 'string', description: 'Base branch (default: repo default, usually "master" or "main").' },
        head: { type: 'string', description: 'Head branch (default: current branch).' },
        draft: { type: 'boolean', description: 'Create as draft PR. Default false.' },
      },
      required: ['cwd', 'title'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const ghArgs = ['pr', 'create', '--title', String(args.title)]
      if (args.body) ghArgs.push('--body', String(args.body))
      if (args.base) ghArgs.push('--base', String(args.base))
      if (args.head) ghArgs.push('--head', String(args.head))
      if (args.draft) ghArgs.push('--draft')
      const { stdout, stderr, exitCode } = await runCommand('gh', ghArgs, {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 60000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh pr create failed (exit ${exitCode})`)
      return (stdout || 'PR created').trim()
    },
  },
  {
    name: 'github_pr_list',
    description: 'List open Pull Requests in the repo using `gh pr list`. Read-only. Requires gh CLI.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        limit: { type: 'number', description: 'Max PRs to return (default 10, max 30).' },
        state: { type: 'string', description: 'PR state: "open" (default), "closed", "merged", "all".' },
      },
      required: ['cwd'],
    },
    run: async (args) => {
      const cwd = String(args.cwd || '')
      const limit = Math.min(Number(args.limit) || 10, 30)
      const state = ['open', 'closed', 'merged', 'all'].includes(args.state) ? args.state : 'open'
      const { stdout, stderr, exitCode } = await runCommand('gh', ['pr', 'list', '--state', state, '--limit', String(limit)], {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 30000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh pr list failed (exit ${exitCode})`)
      return (stdout || '(no PRs)').trim()
    },
  },
  {
    name: 'github_pr_merge',
    description: 'Merge a Pull Request using `gh pr merge`. DANGEROUS — merges the PR, modifying the base branch.',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        number: { type: 'number', description: 'PR number to merge.' },
        method: { type: 'string', description: 'Merge method: "merge", "squash", or "rebase". Default "squash".' },
        delete_branch: { type: 'boolean', description: 'Delete the head branch after merge. Default false.' },
      },
      required: ['cwd', 'number'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const method = ['merge', 'squash', 'rebase'].includes(args.method) ? args.method : 'squash'
      const ghArgs = ['pr', 'merge', String(args.number), '--' + method]
      if (args.delete_branch) ghArgs.push('--delete-branch')
      const { stdout, stderr, exitCode } = await runCommand('gh', ghArgs, {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 60000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh pr merge failed (exit ${exitCode})`)
      return (stdout || `PR #${args.number} merged`).trim()
    },
  },
  {
    name: 'github_issue_create',
    description: 'Create a GitHub Issue using `gh issue create`. DANGEROUS — creates an issue. Requires gh CLI.',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        title: { type: 'string', description: 'Issue title.' },
        body: { type: 'string', description: 'Issue body (markdown). Optional.' },
        labels: { type: 'string', description: 'Comma-separated labels (e.g. "bug,enhancement"). Optional.' },
        assignee: { type: 'string', description: 'GitHub username to assign. Optional.' },
      },
      required: ['cwd', 'title'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const ghArgs = ['issue', 'create', '--title', String(args.title)]
      if (args.body) ghArgs.push('--body', String(args.body))
      if (args.labels) ghArgs.push('--label', String(args.labels))
      if (args.assignee) ghArgs.push('--assignee', String(args.assignee))
      const { stdout, stderr, exitCode } = await runCommand('gh', ghArgs, {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 30000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh issue create failed (exit ${exitCode})`)
      return (stdout || 'Issue created').trim()
    },
  },
  {
    name: 'github_issue_list',
    description: 'List Issues in the repo using `gh issue list`. Read-only. Requires gh CLI.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        limit: { type: 'number', description: 'Max issues (default 10, max 30).' },
        state: { type: 'string', description: 'State: "open" (default), "closed", "all".' },
        labels: { type: 'string', description: 'Filter by comma-separated labels.' },
      },
      required: ['cwd'],
    },
    run: async (args) => {
      const cwd = String(args.cwd || '')
      const limit = Math.min(Number(args.limit) || 10, 30)
      const state = ['open', 'closed', 'all'].includes(args.state) ? args.state : 'open'
      const ghArgs = ['issue', 'list', '--state', state, '--limit', String(limit)]
      if (args.labels) ghArgs.push('--label', String(args.labels))
      const { stdout, stderr, exitCode } = await runCommand('gh', ghArgs, {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 30000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh issue list failed (exit ${exitCode})`)
      return (stdout || '(no issues)').trim()
    },
  },
  {
    name: 'github_release_create',
    description: 'Create a GitHub Release using `gh release create`. DANGEROUS — creates a release (and tag if missing). Requires gh CLI.',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        tag: { type: 'string', description: 'Tag name (e.g. "v1.0.0"). Created if missing.' },
        title: { type: 'string', description: 'Release title. Optional.' },
        notes: { type: 'string', description: 'Release notes (markdown). Optional — auto-generated if omitted.' },
        draft: { type: 'boolean', description: 'Create as draft. Default false.' },
        prerelease: { type: 'boolean', description: 'Mark as prerelease. Default false.' },
      },
      required: ['cwd', 'tag'],
    },
    run: async (args, ctx) => {
      const cwd = String(args.cwd || '')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(cwd, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const ghArgs = ['release', 'create', String(args.tag)]
      if (args.title) ghArgs.push('--title', String(args.title))
      if (args.notes) ghArgs.push('--notes', String(args.notes))
      if (args.draft) ghArgs.push('--draft')
      if (args.prerelease) ghArgs.push('--prerelease')
      const { stdout, stderr, exitCode } = await runCommand('gh', ghArgs, {
        cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 60000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh release create failed (exit ${exitCode})`)
      return (stdout || `Release ${args.tag} created`).trim()
    },
  },
  {
    name: 'github_actions_status',
    description: 'Check GitHub Actions workflow run status using `gh run list`. Read-only. Requires gh CLI.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        limit: { type: 'number', description: 'Max runs (default 5, max 20).' },
        workflow: { type: 'string', description: 'Filter by workflow name (e.g. "release.yml").' },
      },
      required: ['cwd'],
    },
    run: async (args) => {
      const cwd = String(args.cwd || '')
      const limit = Math.min(Number(args.limit) || 5, 20)
      const ghArgs = ['run', 'list', '--limit', String(limit)]
      if (args.workflow) ghArgs.push('--workflow', String(args.workflow))
      const { stdout, stderr, exitCode } = await runCommand('gh', ghArgs, {
        cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 30000,
      })
      if (exitCode !== 0) throw new Error(stderr || `gh run list failed (exit ${exitCode})`)
      return (stdout || '(no runs)').trim()
    },
  },
  {
    name: 'github_pr_review',
    description: 'View PR review comments and CI checks using `gh pr view` + `gh pr checks`. Read-only. Requires gh CLI.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the git repo.' },
        number: { type: 'number', description: 'PR number.' },
      },
      required: ['cwd', 'number'],
    },
    run: async (args) => {
      const cwd = String(args.cwd || '')
      // Combined: PR info + checks status
      const [viewRes, checksRes] = await Promise.all([
        runCommand('gh', ['pr', 'view', String(args.number), '--json', 'title,state,mergeable,reviewDecision,additions,deletions,changedFiles'], {
          cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 30000,
        }),
        runCommand('gh', ['pr', 'checks', String(args.number)], {
          cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 30000,
        }).catch(() => ({ stdout: '(checks unavailable)', stderr: '' })),
      ])
      if (viewRes.exitCode !== 0) throw new Error(viewRes.stderr || `gh pr view failed (exit ${viewRes.exitCode})`)
      return `PR #${args.number}:\n${viewRes.stdout}\n\nChecks:\n${checksRes.stdout}`
    },
  },
  {
    name: 'memory_save',
    description: 'Save a note to the app\'s persistent memory store. Use for facts the user wants remembered across conversations.',
    risk: 'dangerous', // P2-M9：记忆可被外部内容污染并在后续会话回灌（H5 防线之一），ask 模式需确认
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The text to remember.' },
      },
      required: ['content'],
    },
    run: (args, ctx) => {
      const content = String(args.content || '')
      if (!content) throw new Error('content is required')
      const db = require('../database')
      const sourceSessionId = ctx?.sessionId || null
      db.addMemoryWithProvenance(content, 'fact', sourceSessionId)
      // Record skill usage if this was triggered via a skill
      try { if (ctx?.skillName) require('../llm/skills').recordSkillUse(ctx.skillName) } catch {}
      return `saved to memory (${content.length} chars)`
    },
  },
  {
    name: 'memory_list',
    description: 'List all saved memory notes. Read-only.',
    risk: 'safe',
    parameters: { type: 'object', properties: {} },
    run: () => {
      const db = require('../database')
      const mems = db.getMemories()
      if (!mems.length) return '(no memories)'
      return mems.map((m, i) => `[${i + 1}] ${m.content}`).join('\n')
    },
  },
  {
    name: 'memory_search',
    description: 'Search saved memory notes by keyword or topic. Returns the most relevant matches. Use this when you need context from past conversations.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keywords or topic).' },
        limit: { type: 'number', description: 'Max results (default 10).' },
      },
      required: ['query'],
    },
    run: (args) => {
      const q = String(args.query || '')
      const limit = Number(args.limit) || 10
      if (!q) throw new Error('query is required')
      const mem = require('../llm/autoMemory')
      const db = require('../database')
      const results = mem.search(db, q, limit)
      if (!results.length) return '(no matching memories)'
      return results.map((m, i) => `[${i + 1}] ${m.content}`).join('\n')
    },
  },
  {
    // ─── Project Context Graph ───────────────────────────────────────────────
    // Returns the project-level code map: file listing, import/export
    // relationships, and symbol index. Use this before modifying large projects
    // to avoid re-searching files on every step. Safe because it's read-only.
    // ──────────────────────────────────────────────────────────────────────────
    name: 'get_project_context',
    description: 'Get a project-level code map for the current workspace. Returns the dependency graph, file listing, and symbol index. Use this to understand project structure before making changes. Call with query="symbol_name" to find references to a specific function/class, or query="" for the full overview.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional: a symbol name, file path, or keyword to find related code. Leave empty for full project overview.' },
        maxFiles: { type: 'number', description: 'Max files to include in the response (default 50).' },
      },
      required: [],
    },
    run: async (args, ctx) => {
      const { projectIndexer, dependencyGraph } = require('../context')
      const { getWorkspaceRoot } = require('./sandbox')
      const root = getWorkspaceRoot(ctx?.sessionId)
      if (!root) return 'no workspace configured'
      const graph = await projectIndexer.indexWorkspace(root)
      const query = String(args.query || '').trim()
      const maxFiles = Number(args.maxFiles) || 50

      if (query) {
        const related = dependencyGraph.query(graph, query)
        if (!related.length) return `no files reference "${query}"`
        return related.slice(0, maxFiles).map(r => `[${r.relation}] ${r.path}`).join('\n')
      }

      const stats = dependencyGraph.getStats(graph)
      const files = Array.from(graph.files.values()).slice(0, maxFiles)
      const lines = [
        `Project: ${stats.totalFiles} files, ${stats.totalEdges} dependencies`,
        `Languages: ${stats.languages.join(', ')}`,
        '',
        ...files.map(f => {
          const imp = f.imports.length ? ` → ${f.imports.slice(0, 5).join(', ')}` : ''
          const sym = f.symbols.length ? ` {${f.symbols.slice(0, 8).join(', ')}}` : ''
          return `${f.path}${imp}${sym}`
        }),
      ]
      return lines.join('\n')
    },
  },
  {
    // ─── Symbol lookup (LSP-first, LSP-lite fallback) ────────────────────────
    // Dedicated, focused lookup of where a symbol (function/class/const) is
    // defined across the workspace, with line numbers. Read-only. Uses a local
    // LSP server (workspace/symbol) for precise locations when one is
    // available; otherwise degrades to the regex-based symbol indexer.
    // ──────────────────────────────────────────────────────────────────────────
    name: 'find_symbol',
    description: 'Find where a symbol (function/class/const) is defined and used across the workspace. Returns file paths with line numbers.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The symbol name to find (a function, class, or const).' },
        language: { type: 'string', description: 'Optional: filter results to a single language (e.g. javascript, python, rust, go, java).' },
      },
      required: ['name'],
    },
    run: async (args, ctx) => {
      const { getWorkspaceRoot } = require('./sandbox')
      const root = getWorkspaceRoot(ctx?.sessionId)
      if (!root) return 'no workspace configured'
      const target = String(args.name || '').trim()
      if (!target) return '(no symbol name provided)'
      const langFilter = String(args.language || '').trim().toLowerCase()

      // LSP first: precise workspace/symbol lookup. searchWorkspace returns
      // null when no server is available/healthy or the language has none —
      // only then fall back to the regex indexer below.
      const lsp = require('../context/lspClient')
      const lspHits = await lsp.searchWorkspace(root, target, { language: langFilter || 'javascript' })
      if (lspHits !== null) {
        if (!lspHits.length) return `(no matches for "${target}")`
        return lspHits.slice(0, 50).map(h => `${h.file}:${h.line}  ${h.name}`).join('\n')
      }

      const projectIndexer = require('../context/projectIndexer')
      const graph = await projectIndexer.indexWorkspace(root)
      const results = []
      for (const node of graph.files.values()) {
        if (langFilter && String(node.language || '').toLowerCase() !== langFilter) continue
        const syms = node.symbols || []
        const locs = node.symbolLocs || []
        for (let i = 0; i < syms.length; i++) {
          if (syms[i] !== target) continue
          const loc = locs[i]
          const line = loc && loc.locStart ? loc.locStart : 1
          results.push(`${node.path}:${line}  ${syms[i]}`)
        }
      }

      if (!results.length) return `(no matches for "${target}")`
      return results.slice(0, 50).join('\n')
    },
  },
  {
    // ─── Full LSP tool set (behind the `lsp.full` feature flag) ─────────────
    // Definition / references / code actions / diagnostics via a real LSP
    // server, plus a permission-gated rename that APPLIES a WorkspaceEdit.
    // Every read-only variant returns [] on LSP unavailability (never throws).
    // lsp_rename mutates files → risk 'dangerous' (blocked in plan mode).
    // ─────────────────────────────────────────────────────────────────────────
    name: 'lsp_definition',
    description: 'Go to the definition of the symbol at a position. Given a file path and line, returns the definition location(s) (file:line:character). Requires a local LSP server (typescript-language-server) — returns empty when unavailable.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the file containing the symbol.' },
        line: { type: 'number', description: '1-based line number of the symbol occurrence.' },
        character: { type: 'number', description: '1-based column of the symbol occurrence (default 1).' },
      },
      required: ['file', 'line'],
    },
    run: async (args, ctx) => {
      if (!lspFullEnabled(ctx)) return '(LSP feature disabled — enable "Full LSP feature set" in Settings)'
      const lsp = require('../context/lspClient')
      const { getWorkspaceRoot } = require('./sandbox')
      const hits = await lsp.definitionWorkspace(getWorkspaceRoot(ctx?.sessionId), String(args.file), {
        line: Number(args.line) || 1, character: Number(args.character) || 1,
      })
      if (!hits || !hits.length) return '(no definition found)'
      return hits.slice(0, 20).map(h => `${h.file}:${h.line + 1}:${h.character + 1}`).join('\n')
    },
  },
  {
    name: 'lsp_references',
    description: 'Find all references to the symbol at a position. Returns file:line:character locations across the workspace. Requires a local LSP server — empty when unavailable.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the file containing the symbol.' },
        line: { type: 'number', description: '1-based line number of the symbol occurrence.' },
        character: { type: 'number', description: '1-based column of the symbol occurrence (default 1).' },
      },
      required: ['file', 'line'],
    },
    run: async (args, ctx) => {
      if (!lspFullEnabled(ctx)) return '(LSP feature disabled — enable "Full LSP feature set" in Settings)'
      const lsp = require('../context/lspClient')
      const { getWorkspaceRoot } = require('./sandbox')
      const hits = await lsp.referencesWorkspace(getWorkspaceRoot(ctx?.sessionId), String(args.file), {
        line: Number(args.line) || 1, character: Number(args.character) || 1,
      })
      if (!hits || !hits.length) return '(no references found)'
      return hits.slice(0, 50).map(h => `${h.file}:${h.line + 1}:${h.character + 1}`).join('\n')
    },
  },
  {
    name: 'lsp_diagnostics',
    description: 'Get compiler/linter diagnostics (errors and warnings) for a file from a local LSP server. Returns severity, message and line per issue. Empty when the file is clean or LSP is unavailable.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the file to check.' },
      },
      required: ['file'],
    },
    run: async (args, ctx) => {
      if (!lspFullEnabled(ctx)) return '(LSP feature disabled — enable "Full LSP feature set" in Settings)'
      const lsp = require('../context/lspClient')
      const { getWorkspaceRoot } = require('./sandbox')
      const diags = await lsp.diagnosticsWorkspace(getWorkspaceRoot(ctx?.sessionId), String(args.file))
      if (!diags || !diags.length) return '(no diagnostics)'
      const sev = { 1: 'ERROR', 2: 'WARNING', 3: 'INFO', 4: 'HINT' }
      return diags.slice(0, 40).map(d => `[${sev[d.severity] || '?'}] line ${d.line + 1}: ${d.message}`).join('\n')
    },
  },
  {
    name: 'lsp_code_actions',
    description: 'List available code actions (quick fixes / refactorings) for the symbol at a position. Read-only: returns action titles only, nothing is applied. Use lsp_rename for renames.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to the file.' },
        line: { type: 'number', description: '1-based line number where the action applies.' },
      },
      required: ['file', 'line'],
    },
    run: async (args, ctx) => {
      if (!lspFullEnabled(ctx)) return '(LSP feature disabled — enable "Full LSP feature set" in Settings)'
      const lsp = require('../context/lspClient')
      const { getWorkspaceRoot } = require('./sandbox')
      const actions = await lsp.codeActionsWorkspace(getWorkspaceRoot(ctx?.sessionId), String(args.file), { line: Number(args.line) || 1 })
      if (!actions || !actions.length) return '(no code actions available)'
      return actions.slice(0, 20).map(a => `- ${a.title}${a.kind ? ` [${a.kind}]` : ''}`).join('\n')
    },
  },
  {
    name: 'lsp_rename',
    description: 'Rename a symbol across the whole project via a local LSP server. Applies the rename to every affected file. DANGEROUS: mutates multiple files at once — confirm before calling.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path to a file containing the symbol.' },
        line: { type: 'number', description: '1-based line of the symbol occurrence.' },
        character: { type: 'number', description: '1-based column of the symbol occurrence (default 1).' },
        newName: { type: 'string', description: 'The new symbol name.' },
      },
      required: ['file', 'line', 'newName'],
    },
    run: async (args, ctx) => {
      if (!lspFullEnabled(ctx)) return '(LSP feature disabled — enable "Full LSP feature set" in Settings)'
      const lsp = require('../context/lspClient')
      const { getWorkspaceRoot, checkWritePath } = require('./sandbox')
      const root = getWorkspaceRoot(ctx?.sessionId)
      const edits = await lsp.renameWorkspace(root, String(args.file), String(args.newName), {
        line: Number(args.line) || 1, character: Number(args.character) || 1,
      })
      if (!edits || !edits.changes.length) return '(rename produced no edits — symbol not found?)'
      // Apply each file's edits (multi-file mutation — the danger that gated this).
      const applied = []
      for (const change of edits.changes) {
        const p = change.file
        // Every touched file must live inside the workspace sandbox.
        const guard = checkWritePath(p, ctx?.sessionId)
        if (!guard.ok) return `rename aborted: ${p} is outside the workspace`
        const orig = fs.readFileSync(p, 'utf8')
        const lines = orig.split('\n')
        // Apply edits bottom-up so earlier line numbers stay valid.
        const sorted = [...change.edits].sort((a, b) => (b.line - a.line) || (b.character - a.character))
        for (const e of sorted) {
          const line = lines[e.line] ?? ''
          lines[e.line] = line.slice(0, e.character) + e.newText + line.slice(e.endCharacter)
        }
        fs.writeFileSync(p, lines.join('\n'))
        applied.push(p)
      }
      return `renamed ${args.newName} in ${applied.length} file(s):\n${applied.join('\n')}`
    },
  },
  {
    name: 'delegate_task',
    description: 'Delegate one or more independent sub-tasks to sub-agents that run in parallel, each with its own tool loop and iteration budget. Use for: researching multiple files/topics at once, or any set of independent gather/analyze steps. Each sub-task returns a concise result. Dangerous: sub-agents can run tools (read/write/command), so this is permission-gated. Provide focused, self-contained task descriptions.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Independent sub-task descriptions to run in parallel.',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 5,
        },
      },
      required: ['tasks'],
    },
    run: async (args, ctx) => {
      const tasks = Array.isArray(args.tasks) ? args.tasks.filter(Boolean) : []
      if (!tasks.length) throw new Error('tasks must be a non-empty array')
      const SubAgent = require('../llm/subAgent')
      // Sub-agents inherit the parent's provider/model/agentMode so permission
      // policy is consistent (in 'ask' the user already approved delegate_task;
      // the sub-agents run in 'auto' to avoid re-prompting for every internal
      // call — the outer gate is the trust boundary).
      const shared = {
        db: ctx.db, provider: ctx.provider, model: ctx.model,
        signal: ctx.signal, options: ctx.options || {}, agentMode: 'auto',
      }
      const results = await SubAgent.runParallel(tasks, shared)
      return results.map((r, i) => {
        const head = `### Sub-task ${i + 1}: ${tasks[i].slice(0, 80)}`
        if (r.success) return `${head}\n${r.output}`
        return `${head}\n[failed: ${r.error || 'no output'}] (used ${r.iterations} iterations)`
      }).join('\n\n')
    },
  },
  {
    // Automated code review (Claude Code / Aider / Copilot-inspired). Reviews
    // the provided files for bugs, security issues, performance problems, and
    // style violations. Safe — read-only, no side effects.
    name: 'review_code',
    description: 'Review code for bugs, security issues, performance problems, and style violations. Call this after writing or editing files to get feedback. Returns a structured review with severity levels and fix suggestions.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Optional: specific file paths to review. If empty, reviews recent git changes.',
          items: { type: 'string' },
        },
      },
      required: [],
    },
    run: async (args, ctx) => {
      const { reviewFiles } = require('../../electron/llm/reviewer')
      const requestedFiles = Array.isArray(args.files) ? args.files : []
      const fs = require('fs')

      let filesToReview = []
      if (requestedFiles.length > 0) {
        for (const f of requestedFiles.slice(0, 5)) {
          try {
            const content = fs.readFileSync(f, 'utf-8')
            filesToReview.push({ path: f, content })
          } catch {}
        }
      }

      const result = await reviewFiles({
        provider: ctx.provider,
        model: ctx.model,
        files: filesToReview,
        signal: ctx.signal,
      })

      return result.summary
    },
  },
  {
    // Unified diff patch application (Codex/OpenClaw-inspired). More precise than
    // edit_file for multi-line changes: the model generates a proper unified diff
    // and this tool applies it with conflict detection. Falls back to the full
    // file content on failure so the model can retry.
    name: 'apply_patch',
    description: 'Apply a unified diff patch to a file. Use this instead of edit_file when making multiple or complex edits — a patch preserves context across lines and detects conflicts. Provide the file path and the full unified diff. DANGEROUS — writes to the filesystem.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to patch.' },
        patch: { type: 'string', description: 'A unified diff (--- a/+++ b/ format) to apply.' },
      },
      required: ['path', 'patch'],
    },
    run: async (args, ctx) => {
      const p = String(args.path || '')
      const patchText = String(args.patch || '')
      if (!p) throw new Error('path is required')
      if (!patchText) throw new Error('patch is required')
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(p, ctx?.sessionId)
        if (!guard.ok) throw new Error(guard.reason)
      }
      if (!await fs.promises.access(p).then(() => true).catch(() => false)) throw new Error(`file not found: ${p}`)
      const original = await fs.promises.readFile(p, 'utf-8')
      const lines = original.split('\n')
      const hunks = parseUnifiedDiff(patchText, lines.length)
      if (!hunks.length) return 'patch had no valid hunks — file unchanged'
      const result = applyHunks(lines, hunks)
      if (result.conflicts.length > 0) {
        return `patch conflicts detected:\n${result.conflicts.map(c => `  - ${c}`).join('\n')}\nFile NOT modified. Retry with a corrected patch.`
      }
      await fs.promises.writeFile(p, result.content, 'utf-8')
      return `patch applied: ${result.applied} hunk(s), ${result.content.length} chars written to ${p}`
    },
  },
  {
    // Debug-fix cycle (Claude-Code-inspired). Automatically runs the project's test
    // command, captures errors, asks the model to analyze them, and surfaces a fix
    // suggestion. The tool loop can then apply the fix and re-test in the next cycle.
    name: 'debug_loop',
    description: 'Run an automatic debug-fix cycle for the current workspace. Runs the project\'s test command, captures errors, analyzes them, and suggests fixes. Use this after writing/modifying code to verify it works. Max 5 cycles. Dangerous: executes test commands in the workspace.',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        testCommand: { type: 'string', description: 'Override the auto-detected test command (e.g. "npm run test", "pytest").' },
        maxCycles: { type: 'number', description: 'Max debug-fix cycles (default 5, max 10).' },
      },
      required: [],
    },
    run: async (args, ctx) => {
      const { runDebugLoop, MAX_CYCLES } = require('../../electron/llm/debugAgent')
      const maxCycles = Math.min(Number(args.maxCycles) || MAX_CYCLES, 10)
      const result = await runDebugLoop({
        provider: ctx.provider,
        model: ctx.model,
        signal: ctx.signal,
        sessionId: ctx.sessionId,
        onStatus: ctx.onStatus,
        onFix: ctx.onStatus,
      })
      if (result.success) {
        return `✅ 调试完成: ${result.summary} (${result.cycles} 轮)`
      }
      const lines = [`❌ 调试未完全成功 (${result.cycles}/${maxCycles} 轮)`]
      if (result.cycleResults) {
        for (const r of result.cycleResults) {
          lines.push(`  轮 ${r.cycle}: 退出码 ${r.exitCode}`)
          lines.push(`  ${r.errorSnippet.slice(0, 200)}`)
        }
      }
      if (result.analysis) {
        lines.push(`\n分析: ${result.analysis.description}`)
        lines.push(`根因: ${result.analysis.rootCause}`)
        lines.push(`修复: ${result.analysis.fix}`)
        lines.push(`文件: ${(result.analysis.files || []).join(', ')}`)
      }
      if (result.error) {
        lines.unshift(`错误: ${result.error}`)
      }
      return lines.join('\n')
    },
  },
  {
    // Test-first workflow (RED→GREEN). Orchestrates a model-driven test-first
    // loop: writes a failing test for the goal, then asks the model for the
    // implementation to make it pass, re-running the test up to MAX_FIX_CYCLES.
    // Preferred over debug_loop when the goal is to implement a feature. If the
    // project has no test framework, it returns skipped and the model naturally
    // falls back to debug_loop for post-write verification.
    name: 'test_first',
    description: 'Run a test-first (RED→GREEN) workflow for the current workspace. Writes a failing test targeting the goal, then asks the model for the implementation to make it pass, re-running the project\'s test command up to 3 cycles. Dangerous: writes test/implementation files and executes the test command. Use when the goal is to implement a feature.',
    risk: 'dangerous',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'The feature or behavior to implement (the user\'s goal).' },
      },
      required: ['goal'],
    },
    run: async (args, ctx) => {
      const { runTestFirst } = require('../../electron/llm/testFirst')
      const goal = String(args.goal || '').trim()
      const result = await runTestFirst({
        provider: ctx.provider,
        model: ctx.model,
        signal: ctx.signal,
        sessionId: ctx.sessionId,
        db: ctx.db,
        onStatus: ctx.onStatus,
        goal,
      })
      if (result.skipped) {
        return `⚠ test_first 已跳过: ${result.reason || 'no test framework'}。请改用 debug_loop 进行常规验证。`
      }
      if (result.success) {
        return `✅ test-first 完成: ${result.summary} (${result.cycles} 轮)`
      }
      const lines = [`❌ test-first 未完成 (${result.cycles} 轮)`]
      if (result.error) lines.push(`错误: ${result.error}`)
      lines.push('可改用 debug_loop 继续调试。')
      return lines.join('\n')
    },
  },
  // ─── Subagent delegation (OpenCode/Hermes-inspired) ──────────────────────
  // Spawn an isolated child session for complex multi-step tasks. The sub-agent
  // runs in plan mode (read-only) with its own context and returns a text summary.
  // Prevents main-context bloat on long investigation tasks.
  {
    name: 'task',
    description: 'Delegate a complex sub-task to an isolated sub-agent with its own context. The sub-agent can use read-only tools (read_file, glob, grep, web_search) to investigate, then returns a concise summary. Use this for multi-step research or exploration that would bloat the main conversation. Do NOT use for simple single-file reads — use read_file directly for those.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'A short label for the delegated task (e.g. "Explore auth module structure").' },
        prompt: { type: 'string', description: 'The full task prompt for the sub-agent. Be specific about what to investigate or do.' },
      },
      required: ['prompt'],
    },
    risk: 'dangerous', // spawns a child agent with tool access
    executionMode: 'sequential',
    run: async (args, ctx) => {
      const { prompt } = args
      if (!prompt) throw new Error('prompt is required')
      const { runSubagent } = require('../llm/subagent')
      const result = await runSubagent({
        db: ctx.db,
        parentSessionId: ctx.sessionId,
        provider: ctx.provider,
        model: ctx.model,
        prompt,
        signal: ctx.signal,
        agentMode: ctx.agentMode,
      })
      return result
    },
  },
]

// Pull <a class="result__snippet"> text out of DDG's HTML results. Best-effort;
// DDG markup changes occasionally, so we degrade to raw-text stripping.
// Note: entities are intentionally left as-is — this text feeds the model via
// the tool-loop, never the DOM, so decoding (&amp; → &) would only risk
// re-introducing markup sequences.
function extractDdgSnippets(html, q) {
  const snippets = []
  const re = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html)) && snippets.length < 5) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) snippets.push(`- ${text}`)
  }
  if (snippets.length === 0) return `No snippets extracted for "${q}".`
  return snippets.join('\n')
}

// Look up a tool by name. Returns undefined if not found.
function getTool(name) {
  return TOOLS.find(t => t.name === name)
}

// The OpenAI tools array to send in a chat request: [{type:'function', function:{...}}].
// In `plan` mode we only expose safe tools (no writes/commands), so the model
// cannot even attempt a dangerous action.
function toolsPayload(mode) {
  const list = mode === 'plan' ? TOOLS.filter(t => t.risk === 'safe') : TOOLS
  return list.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

// ─── apply_patch helpers ───────────────────────────────────────────────────────
// Parse a unified diff into hunk descriptors. Each hunk has:
//   { oldStart, oldCount, newStart, newCount, lines: [{type, content}] }
// where type is 'context', 'add', or 'remove'.
// Returns [] on parse failure (caller should treat as "no valid hunks").
function parseUnifiedDiff(diffText) {
  const hunks = []
  const lines = diffText.split('\n')
  let i = 0
  while (i < lines.length) {
    // Look for a hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!m) { i++; continue }
    const oldStart = parseInt(m[1])
    const oldCount = parseInt(m[2] || '1')
    const newStart = parseInt(m[3])
    const newCount = parseInt(m[4] || '1')
    i++
    const hunkLines = []
    while (i < lines.length && !lines[i].startsWith('@@')) {
      const line = lines[i]
      if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
        hunkLines.push({ type: line[0] === '+' ? 'add' : line[0] === '-' ? 'remove' : 'context', content: line.slice(1) })
      } else if (line.startsWith('\\') && line.includes('No newline')) {
        // \ No newline at end of file marker — record and skip
        hunkLines.push({ type: 'noeol', content: '' })
      }
      i++
    }
    if (hunkLines.length > 0) hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines })
  }
  return hunks
}

// Apply parsed hunks to an array of file lines. Returns { content, applied, conflicts }.
// Each hunk's oldStart references the ORIGINAL file line numbers. We accumulate
// line-offset deltas so later hunks account for earlier insertions/deletions.
function applyHunks(fileLines, hunks) {
  const conflicts = []
  let result = [...fileLines]
  let applied = 0
  let lineDelta = 0 // cumulative shift from prior hunk applications

  for (const hunk of hunks) {
    const idx = hunk.oldStart - 1 + lineDelta // adjusted for prior shifts
    // Validate context lines match at the expected position.
    const ctxLines = hunk.lines.filter(l => l.type === 'context')
    let matchOffset = -1
    // Search for the context block in result starting from idx.
    const searchStart = Math.max(0, idx - 2)
    for (let start = searchStart; start <= Math.max(searchStart, result.length - ctxLines.length); start++) {
      let ok = true
      for (let ci = 0; ci < ctxLines.length; ci++) {
        if (start + ci >= result.length || result[start + ci] !== ctxLines[ci].content) { ok = false; break }
      }
      if (ok) { matchOffset = start; break }
    }
    if (matchOffset < 0) {
      conflicts.push(`hunk at line ${hunk.oldStart}: context did not match (file may have changed)`)
      continue
    }
    // Build replacement: context lines + added lines (skip removed lines).
    const adds = hunk.lines.filter(l => l.type === 'add')
    const oldSpan = hunk.oldCount
    const replacement = adds.map(l => l.content)
    result = [...result.slice(0, matchOffset), ...replacement, ...result.slice(matchOffset + oldSpan)]
    lineDelta += replacement.length - oldSpan
    applied++
  }
  return { content: result.join('\n'), applied, conflicts }
}

module.exports = { TOOLS, getTool, toolsPayload, parseUnifiedDiff, applyHunks }