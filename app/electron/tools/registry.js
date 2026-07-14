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
// Tool surface mirrors a coding agent (read/search/edit/git/web/memory) so the
// model can do real work — every mutating tool is gated by the permission model.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { glob } = require('glob')
const { checkWritePath, checkCommand } = require('./sandbox')

const MAX_READ_BYTES = 64 * 1024 // cap read_file output so a huge file doesn't blow the context
const MAX_GREP_BYTES = 32 * 1024

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
    run: (args) => {
      const p = String(args.path || '')
      if (!p) throw new Error('path is required')
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
    run: (args) => {
      const p = String(args.path || '')
      if (!p) throw new Error('path is required')
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
    run: async (args) => {
      const pattern = String(args.pattern || '')
      const cwd = String(args.cwd || '')
      if (!pattern) throw new Error('pattern is required')
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
    run: async (args) => {
      const pattern = String(args.pattern || '')
      const cwd = String(args.cwd || '')
      if (!pattern) throw new Error('pattern is required')
      let re
      try { re = new RegExp(pattern) } catch (e) { return `invalid regex: ${e.message}` }
      const files = await glob(args.glob || '**/*', { cwd: cwd || undefined, absolute: true, nodir: true })
      const hits = []
      outer: for (const f of files.slice(0, 500)) {
        try {
          const text = fs.readFileSync(f, 'utf-8')
          const lines = text.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              hits.push(`${path.relative(cwd || path.dirname(f), f)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
              if (hits.length >= 50) break outer
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
    run: async (args) => {
      const q = String(args.query || '')
      if (!q) throw new Error('query is required')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q)
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'AetherAI/0.1' } })
        if (!res.ok) return `[search failed: HTTP ${res.status}]`
        const html = await res.text()
        return extractDdgSnippets(html, q)
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
    run: async (args) => {
      const url = String(args.url || '')
      if (!url) throw new Error('url is required')
      // Reject non-http(s) schemes so a prompt-injected model can't read local
      // files via file:// (web_fetch is 'safe' and would otherwise bypass the
      // dangerous-tool permission gate).
      let parsed
      try { parsed = new URL(url) } catch { return '[invalid url]' }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '[blocked: non-http(s) url]'
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'AetherAI/0.1' } })
        if (!res.ok) return `[fetch failed: HTTP ${res.status}]`
        const ct = res.headers.get('content-type') || ''
        const raw = await res.text()
        const text = ct.includes('html') ? raw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : raw
        return text.slice(0, 16384) + (text.length > 16384 ? '\n[truncated]' : '')
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
    run: (args, ctx) => {
      const p = String(args.path || '')
      const content = String(args.content ?? '')
      if (!p) throw new Error('path is required')
      // Sandbox: refuse writes outside the workspace root — unless 'yolo' mode
      // (full permission, user explicitly accepted the risk).
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(p)
        if (!guard.ok) throw new Error(guard.reason)
      }
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, content, 'utf-8')
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
    run: (args, ctx) => {
      const p = String(args.path || '')
      const oldS = String(args.old_string ?? '')
      const newS = String(args.new_string ?? '')
      if (!p || !oldS) throw new Error('path and old_string are required')
      // Sandbox: refuse edits outside the workspace root — unless 'yolo' mode.
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkWritePath(p)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const orig = fs.readFileSync(p, 'utf-8')
      const idx = orig.indexOf(oldS)
      if (idx === -1) throw new Error('old_string not found')
      if (orig.indexOf(oldS, idx + 1) !== -1) throw new Error('old_string is not unique — make it more specific')
      const updated = orig.slice(0, idx) + newS + orig.slice(idx + oldS.length)
      fs.writeFileSync(p, updated, 'utf-8')
      return `edited ${p}: replaced ${oldS.length} chars with ${newS.length} chars`
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command and return its stdout+stderr (up to 8KB). DANGEROUS — executes arbitrary code. Use only when the user explicitly asks for it. ALWAYS supply a `description` in active voice explaining the intent (e.g. "List files in the project root") so the user sees what the command claims to do, not just raw shell.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
        description: { type: 'string', description: 'A short, active-voice summary of what this command does and why (shown to the user). Required.' },
        cwd: { type: 'string', description: 'Working directory (optional, defaults to user home).' },
      },
      required: ['command', 'description'],
    },
    run: (args, ctx) => {
      const cmd = String(args.command || '')
      if (!cmd) throw new Error('command is required')
      // Sandbox: refuse commands matching destructive patterns — unless 'yolo'
      // mode (full permission, user accepted the risk).
      if (ctx?.agentMode !== 'yolo') {
        const guard = checkCommand(cmd)
        if (!guard.ok) throw new Error(guard.reason)
      }
      const cwd = args.cwd ? String(args.cwd) : undefined
      return new Promise((resolve, reject) => {
        exec(cmd, { cwd, maxBuffer: 16 * 1024, timeout: 30000 }, (err, stdout, stderr) => {
          const out = ((stdout || '') + (stderr ? '\n[stderr]\n' + stderr : '')).slice(0, 8192)
          if (err && !stdout && !stderr) return reject(new Error(err.message))
          resolve(out || '(no output)')
        })
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
      const body = skills.getSkillBody(name)
      if (body == null) throw new Error(`unknown skill: ${name} (call only skills listed in <available_skills>)`)
      return body
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
      if (typeof ctx?.onAskUser !== 'function') throw new Error('ask_user not available in this context')
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
      return new Promise((resolve, reject) => {
        exec('git status --short', { cwd: cwd || undefined, maxBuffer: 16 * 1024, timeout: 15000 }, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message))
          resolve(stdout || '(clean)')
        })
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
      const flag = args.staged ? ' --cached' : ''
      return new Promise((resolve, reject) => {
        exec('git diff' + flag, { cwd: cwd || undefined, maxBuffer: 32 * 1024, timeout: 15000 }, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message))
          resolve((stdout || '(no changes)').slice(0, 16384))
        })
      })
    },
  },
  {
    name: 'memory_save',
    description: 'Save a note to the app\'s persistent memory store. Use for facts the user wants remembered across conversations.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The text to remember.' },
      },
      required: ['content'],
    },
    run: (args) => {
      const content = String(args.content || '')
      if (!content) throw new Error('content is required')
      const db = require('../database')
      db.addMemory({ content })
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
]

// Pull <a class="result__snippet"> text out of DDG's HTML results. Best-effort;
// DDG markup changes occasionally, so we degrade to raw-text stripping.
function extractDdgSnippets(html, q) {
  const snippets = []
  const re = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html)) && snippets.length < 5) {
    const text = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
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

module.exports = { TOOLS, getTool, toolsPayload }
