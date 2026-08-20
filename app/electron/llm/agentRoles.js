// ───────────────────────────────────────────────────────────────────────────
// Agent Roles — specialized sub-agent personas.
//
// Inspired by OpenCode's role separation and Grok Build's specialized agents.
// Each role has:
//   - A system prompt that focuses the agent on its specialty
//   - Tool restrictions (read-only roles can't write)
//   - A default agentMode (plan for Explore, auto for Build, etc.)
//
// The `run_agent` tool spawns a sub-agent with a specific role, using the
// existing subAgent.js infrastructure.
// ───────────────────────────────────────────────────────────────────────────

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent spawned by the parent agent to handle a delegated task.
You have your own isolated context — previous conversation history is not available.
Focus solely on the task described. Use available tools as needed.
When done, provide a clear, concise summary of your findings or actions as your final response.
Do NOT call the task tool — nested sub-agents are not allowed.`

const ROLES = {
  explore: {
    label: 'Explore',
    description: 'Read-only codebase exploration. Searches files, symbols, and patterns. Cannot modify anything.',
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
    allowTools: ['web_search', 'web_fetch', 'web_search'],
  },
  debug: {
    label: 'Debug',
    description: 'Debugging agent. Analyzes failures, traces root causes, proposes fixes.',
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

const ROLE_NAMES = Object.keys(ROLES)

function getRole(name) {
  return ROLES[name] || null
}

function listRoles() {
  return ROLE_NAMES.map(n => ({ name: n, ...ROLES[n] }))
}

/**
 * Build a system prompt for a role.
 */
function buildRolePrompt(roleName, taskDescription) {
  const role = ROLES[roleName]
  if (!role) return null
  return `${role.systemPrompt}

─── YOUR TASK ───
${taskDescription}`
}

/**
 * Build a tool list filter for a role.
 * Returns an array of tool names to include, or null for all tools.
 */
function buildToolFilter(roleName) {
  const role = ROLES[roleName]
  return role ? role.allowTools : null
}

/**
 * Get the default agent mode for a role.
 */
function getRoleDefaultMode(roleName) {
  const role = ROLES[roleName]
  return role ? role.defaultMode : 'plan'
}

module.exports = {
  ROLES,
  ROLE_NAMES,
  getRole,
  listRoles,
  buildRolePrompt,
  buildToolFilter,
  getRoleDefaultMode,
}
