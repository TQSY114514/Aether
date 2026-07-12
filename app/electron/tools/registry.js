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
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const MAX_READ_BYTES = 64 * 1024 // cap read_file output so a huge file doesn't blow the context

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the text content of a file at the given absolute path. Returns up to 64KB of UTF-8 text. Use for inspecting local code/config files the user references.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to read.' },
      },
      required: ['path'],
    },
    run: (args) => {
      const p = String(args.path || '')
      if (!p) throw new Error('path is required')
      const buf = fs.readFileSync(p)
      const text = buf.slice(0, MAX_READ_BYTES).toString('utf-8')
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
    run: (args) => {
      const p = String(args.path || '')
      const content = String(args.content ?? '')
      if (!p) throw new Error('path is required')
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, content, 'utf-8')
      return `wrote ${content.length} chars to ${p}`
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command and return its stdout+stderr (up to 8KB). DANGEROUS — executes arbitrary code. Use only when the user explicitly asks for it.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
        cwd: { type: 'string', description: 'Working directory (optional, defaults to user home).' },
      },
      required: ['command'],
    },
    run: (args) => {
      const cmd = String(args.command || '')
      if (!cmd) throw new Error('command is required')
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
