// ───────────────────────────────────────────────────────────────────────────
// Agent Roles — specialized sub-agent personas (.aether/agents/*.md).
//
// P1-4: Sub-agent role definitions externalized to `.aether/agents/*.md`
// with YAML frontmatter (`name`, `label`, `description`, `model`, `effort`,
// `read-only`, `tools`), reusing `skills.parseFrontmatter`.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { parseFrontmatter } = require('./skills')

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent spawned by the parent agent to handle a delegated task.
You have your own isolated context — previous conversation history is not available.
Focus solely on the task described. Use available tools as needed.
When done, provide a clear, concise summary of your findings or actions as your final response.
Do NOT call the task tool — nested sub-agents are not allowed.`

const DEFAULT_ROLES = {
  explore: {
    label: 'Explore',
    description: 'Read-only codebase exploration. Searches files, symbols, and patterns. Cannot modify anything.',
    model: 'fast',
    effort: 'low',
    readOnly: true,
    systemPrompt: `${SUBAGENT_SYSTEM_PROMPT}

You are an EXPLORATION agent. Your job is to understand codebases:
- Find files by pattern, symbol, or content
- Trace imports and dependencies
- Map architecture and data flow
- Answer "where is X defined?" and "what does Y depend on?"

RULES:
- READ-ONLY: never write, edit, or run commands
- Be thorough: check multiple locations before reporting "not found"
- Report exact file paths and line numbers
- If something is ambiguous, list all possibilities`,
    defaultMode: 'plan',
    allowTools: ['read_file', 'list_dir', 'glob_find', 'grep_search', 'find_symbol', 'codebase_graph', 'web_search', 'web_fetch'],
  },
  build: {
    label: 'Build',
    description: 'Implementation agent. Writes code, edits files, runs tests. Full tool access.',
    model: 'inherit',
    effort: 'medium',
    readOnly: false,
    systemPrompt: `${SUBAGENT_SYSTEM_PROMPT}

You are a BUILD agent. Your job is to implement features and fix bugs:
- Write and edit files
- Run tests and fix failures
- Apply patches
- Verify your changes work

RULES:
- Make focused, minimal changes — don't refactor unrelated code
- After making changes, run tests or type checks to verify
- If a test fails, analyze the failure before making more changes
- Report what you changed and why`,
    defaultMode: 'auto',
    allowTools: null, // null = all tools
  },
  review: {
    label: 'Review',
    description: 'Code review agent. Analyzes code for bugs, security, performance, and style.',
    model: 'inherit',
    effort: 'high',
    readOnly: true,
    systemPrompt: `${SUBAGENT_SYSTEM_PROMPT}

You are a REVIEW agent. Your job is to analyze code quality:
- Find bugs and logic errors
- Identify security vulnerabilities (injection, XSS, etc.)
- Spot performance issues
- Check code style and consistency

RULES:
- READ-ONLY: never modify files
- Cite specific file paths and line numbers
- Prioritize findings: Critical > High > Medium > Low
- For each issue, explain the impact and suggest a fix`,
    defaultMode: 'plan',
    allowTools: ['read_file', 'list_dir', 'glob_find', 'grep_search', 'find_symbol', 'codebase_graph', 'web_search', 'web_fetch'],
  },
  research: {
    label: 'Research',
    description: 'External research agent. Searches docs, APIs, and the web for information.',
    model: 'fast',
    effort: 'low',
    readOnly: true,
    systemPrompt: `${SUBAGENT_SYSTEM_PROMPT}

You are a RESEARCH agent. Your job is to gather information from external sources:
- Search the web for documentation, API references, and examples
- Look up package docs and version compatibility
- Find solutions to specific error messages or edge cases

RULES:
- Focus on external information (web_search, web_fetch)
- Don't read local files unless the parent agent specifically asks
- Provide URLs and sources for all findings
- If you can't find a definitive answer, say so and explain what you tried`,
    defaultMode: 'plan',
    allowTools: ['web_search', 'web_fetch'],
  },
  debug: {
    label: 'Debug',
    description: 'Debugging agent. Analyzes failures, traces root causes, proposes fixes.',
    model: 'inherit',
    effort: 'high',
    readOnly: true,
    systemPrompt: `${SUBAGENT_SYSTEM_PROMPT}

You are a DEBUG agent. Your job is to find and fix bugs:
- Read error messages and stack traces
- Locate the relevant source code
- Identify the root cause
- Propose a fix (but don't apply it — the parent agent will decide)

RULES:
- Be systematic: form a hypothesis, test it, narrow down
- Read the actual code — don't guess based on error messages alone
- Check edge cases and error handling
- If the fix isn't obvious, explain what you've ruled out`,
    defaultMode: 'plan',
    allowTools: ['read_file', 'list_dir', 'glob_find', 'grep_search', 'find_symbol', 'codebase_graph', 'run_command'],
  },
}

/**
 * Parse a single `.aether/agents/*.md` file into a normalized role descriptor.
 * @param {string} rawMarkdown
 * @param {string} fallbackName
 * @param {string} [sourcePath]
 */
function parseRoleMarkdown(rawMarkdown, fallbackName, sourcePath = null) {
  const { meta, body } = parseFrontmatter(rawMarkdown || '')
  const name = String(meta.name || fallbackName || '').trim().toLowerCase()
  if (!name) return null
  const label = meta.label || (name.charAt(0).toUpperCase() + name.slice(1))
  const readOnlyRaw = meta['read-only'] !== undefined ? meta['read-only'] : meta.read_only
  const readOnly = readOnlyRaw === true || String(readOnlyRaw).toLowerCase() === 'true'
  const defaultMode = meta.mode || (readOnly ? 'plan' : 'auto')

  let allowTools = null
  if (Array.isArray(meta.tools)) {
    allowTools = meta.tools.map(t => String(t).trim()).filter(Boolean)
  } else if (typeof meta.tools === 'string' && meta.tools.trim() && meta.tools.trim().toLowerCase() !== 'all') {
    allowTools = meta.tools
      .trim()
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }

  return {
    name,
    label,
    description: meta.description || '',
    model: meta.model || 'inherit',
    effort: meta.effort || 'medium',
    readOnly,
    defaultMode,
    allowTools,
    systemPrompt: `${SUBAGENT_SYSTEM_PROMPT}\n\n${(body || '').trim()}`,
    source: sourcePath,
  }
}

/**
 * Load `.aether/agents/*.md` role definitions from repo root and optional workspace root.
 * @param {string} [workspaceRoot]
 * @returns {Record<string, object>}
 */
function loadRolesFromDisk(workspaceRoot) {
  const loaded = {}
  const candidateDirs = [
    path.resolve(__dirname, '..', '..', '..', '.aether', 'agents'),
    path.resolve(__dirname, '..', '..', '.aether', 'agents'),
  ]
  if (workspaceRoot && typeof workspaceRoot === 'string') {
    candidateDirs.push(path.join(workspaceRoot, '.aether', 'agents'))
  }

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue
      const files = fs.readdirSync(dir)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
        try {
          const full = path.join(dir, file)
          const raw = fs.readFileSync(full, 'utf8')
          const fallbackName = path.basename(file, '.md')
          const parsed = parseRoleMarkdown(raw, fallbackName, full)
          if (parsed && parsed.name) {
            const { name, ...rest } = parsed
            loaded[name] = rest
          }
        } catch { /* ignore broken role file */ }
      }
    } catch { /* ignore unreadable directory */ }
  }
  return loaded
}

const ROLES = {
  ...DEFAULT_ROLES,
  ...loadRolesFromDisk(),
}

const ROLE_NAMES = Object.keys(ROLES)

function getRole(name, workspaceRoot) {
  if (workspaceRoot) {
    const custom = loadRolesFromDisk(workspaceRoot)
    if (custom[name]) return custom[name]
  }
  return ROLES[name] || null
}

function listRoles(workspaceRoot) {
  const merged = workspaceRoot
    ? { ...ROLES, ...loadRolesFromDisk(workspaceRoot) }
    : ROLES
  return Object.keys(merged).map(n => ({ name: n, ...merged[n] }))
}

/**
 * Build a system prompt for a role.
 */
function buildRolePrompt(roleName, taskDescription, workspaceRoot) {
  const role = getRole(roleName, workspaceRoot)
  if (!role) return null
  return `${role.systemPrompt}

─── YOUR TASK ───
${taskDescription}`
}

/**
 * Build a tool list filter for a role.
 * Returns an array of tool names to include, or null for all tools.
 */
function buildToolFilter(roleName, workspaceRoot) {
  const role = getRole(roleName, workspaceRoot)
  return role ? role.allowTools : null
}

/**
 * Get the default agent mode for a role.
 */
function getRoleDefaultMode(roleName, workspaceRoot) {
  const role = getRole(roleName, workspaceRoot)
  return role ? role.defaultMode : 'plan'
}

module.exports = {
  SUBAGENT_SYSTEM_PROMPT,
  ROLES,
  ROLE_NAMES,
  parseRoleMarkdown,
  loadRolesFromDisk,
  getRole,
  listRoles,
  buildRolePrompt,
  buildToolFilter,
  getRoleDefaultMode,
}
