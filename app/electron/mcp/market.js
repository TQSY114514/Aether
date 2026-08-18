// ───────────────────────────────────────────────────────────────────────────
// MCP Market module.
//
// Pulls the community MCP server index from the official MCP Registry API and
// translates registry entries into installable configs ({ name, command, args,
// env }) that the existing MCP manager / db layer can consume directly. It also
// ships a small curated list of known-good "popular" servers (filesystem,
// github, postgres, puppeteer) so the market is useful even when the registry
// is unreachable.
//
// Reference: https://registry.modelcontextprotocol.io  (v0.1 servers API).
// Response shape: { servers: [{ server: { name, title, description, version,
// packages: [{ registryType, runtimeHint, identifier, runtimeArguments,
// environmentVariables, transport: { type } }] }, _meta }] }
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers'
const FETCH_TIMEOUT = 8000 // a slow registry must not hang the UI

// Curated popular servers. These are pinned, known-good configs for the stdio
// client — the same shape the manager consumes. The registry is the source of
// truth for the full community list; this set is a stable fallback / featured.
const POPULAR = [
  {
    name: 'filesystem',
    title: 'Filesystem',
    description: 'Read, write, and manage files with full access to the local filesystem.',
    version: '0.1.0',
    repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    tags: ['files', 'storage'],
    config: { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/'], env: {} },
  },
  {
    name: 'github',
    title: 'GitHub',
    description: 'Access GitHub repositories, issues, pull requests and code search.',
    version: '0.1.0',
    repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    tags: ['github', 'code'],
    config: { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } },
  },
  {
    name: 'postgres',
    title: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases via SQL.',
    version: '0.1.0',
    repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    tags: ['database', 'sql'],
    config: { name: 'postgres', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost:5432/mydb'], env: {} },
  },
  {
    name: 'puppeteer',
    title: 'Puppeteer',
    description: 'Browser automation and web scraping via headless Chrome.',
    version: '0.1.0',
    repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    tags: ['browser', 'automation'],
    config: { name: 'puppeteer', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'], env: {} },
  },
]

// Default runtime command for a package registry when no runtimeHint is given.
function defaultRuntime(registryType) {
  switch (registryType) {
    case 'python': case 'pypi': return 'uvx'
    case 'go': return 'go'
    case 'dotnet': case 'nuget': return 'dotnet'
    case 'npm': default: return 'npx'
  }
}

// ── Install hardening (spec P0-C3) ─────────────────────────────────────────
// The registry manifest is remote, attacker-controlled data. `runtimeHint` is
// NOT a trusted command: only these runtimes may become `command` — anything
// else (cmd, powershell, absolute paths, …) is a structured rejection, never a
// default-allow.
const ALLOWED_RUNTIMES = new Set(['npx', 'uvx', 'dotnet', 'go', 'node', 'python'])

// Package identifier shape: scoped (`@scope/name`, scope+name lowercase
// alphanumerics + hyphens) or bare (`[a-z0-9-]` head, then lowercase
// alphanumerics + `._-`). Rejects shell metacharacters, path traversal
// (`../x`), empty strings and uppercase names (`A_B_C`) before they ever
// reach argv or the DB.
const PACKAGE_IDENTIFIER_RE = /^@[a-z0-9-]+\/[a-z0-9-]+$|^[a-z0-9-][a-z0-9._-]*$/

function isValidPackageIdentifier(id) {
  return typeof id === 'string' && PACKAGE_IDENTIFIER_RE.test(id)
}

// Validate a config object coming back from the renderer for the market
// install flow. Defense in depth: the renderer posts back the entry it was
// shown, but that data round-tripped through untrusted surfaces, so the main
// process re-checks command + package identifier before anything is persisted
// or spawned. npx/uvx fetch-and-execute arbitrary packages, so their first
// non-flag argument must be a well-formed identifier.
function validateInstallConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'invalid config' }
  if (!cfg.name || typeof cfg.name !== 'string') return { ok: false, error: 'invalid config: missing name' }
  const command = String(cfg.command || '')
  if (!ALLOWED_RUNTIMES.has(command)) {
    return { ok: false, error: `runtime "${command || '(empty)'}" is not allowed (whitelist: ${[...ALLOWED_RUNTIMES].join('/')})` }
  }
  if (command === 'npx' || command === 'uvx') {
    const args = Array.isArray(cfg.args) ? cfg.args : []
    const ident = args.find(a => typeof a === 'string' && a && !a.startsWith('-'))
    if (!isValidPackageIdentifier(ident)) {
      return { ok: false, error: `invalid package identifier "${ident || '(missing)'}"` }
    }
  }
  return { ok: true }
}

// Pick the first stdio package for a server (npx/uvx/dotnet style local run).
// Remote-only servers (streamable-http/sse) can't be launched as stdio, so we
// skip them for the local install flow.
function pickStdioPackage(packages) {
  if (!Array.isArray(packages)) return null
  return packages.find(p => p && p.transport && p.transport.type === 'stdio') || null
}

// Build a deployable { name, command, args, env } config from a stdio package.
// Returns { ok: true, config } or { ok: false, error } — a hostile manifest
// (runtimeHint=cmd, identifier="evil; rm -rf", …) yields a structured
// rejection instead of a spawnable config.
function buildConfig(name, pkg) {
  const runtime = pkg.runtimeHint || defaultRuntime(pkg.registryType)
  if (!ALLOWED_RUNTIMES.has(runtime)) {
    return { ok: false, error: `runtime "${runtime}" is not allowed (whitelist: ${[...ALLOWED_RUNTIMES].join('/')})` }
  }
  if (!isValidPackageIdentifier(pkg.identifier)) {
    return { ok: false, error: `package identifier "${pkg.identifier}" is invalid` }
  }
  const positional = (pkg.runtimeArguments || [])
    .filter(a => a && a.type !== 'named')
    .map(a => a.value)
  const named = (pkg.runtimeArguments || [])
    .filter(a => a && a.type === 'named')
    .map(a => `--${a.name}=${a.value != null ? a.value : ''}`)
  const args = [...positional, pkg.identifier, ...named].filter(v => v != null)
  const env = {}
  for (const ev of pkg.environmentVariables || []) {
    if (ev && ev.name) env[ev.name] = ev.value != null ? String(ev.value) : ''
  }
  return { ok: true, config: { name, command: runtime, args, env } }
}

// Translate a raw registry server object into a catalog entry.
function toCatalogEntry(server) {
  const pkg = pickStdioPackage(server.packages)
  const built = pkg ? buildConfig(server.name, pkg) : null
  return {
    name: server.name,
    title: server.title || server.name,
    description: server.description || '',
    version: server.version,
    repositoryUrl: (server.repository && server.repository.url) || null,
    installable: !!(built && built.ok),
    config: built && built.ok ? built.config : null,
  }
}

function parseVersion(v) {
  return String(v || '').split('.').map(n => parseInt(n, 10) || 0)
}

function isNewer(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y
  }
  return false
}

function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Fetch the registry, dedupe by name (keep the latest version), map to entries.
async function fetchRegistry(search) {
  const url = search ? `${REGISTRY_URL}?search=${encodeURIComponent(search)}` : REGISTRY_URL
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`registry request failed: ${res.status}`)
  const data = await res.json()
  const servers = ((data && data.servers) || []).map(e => e && e.server).filter(Boolean)
  const byName = new Map()
  for (const s of servers) {
    const existing = byName.get(s.name)
    if (!existing || isNewer(s.version, existing.version)) byName.set(s.name, s)
  }
  return [...byName.values()].map(toCatalogEntry)
}

// Community server list pulled from the registry. Never throws — on failure it
// logs and returns an empty list so the UI can show a friendly empty state.
async function list() {
  try {
    return await fetchRegistry()
  } catch (e) {
    log.warn('MCP market list failed:', e.message)
    return []
  }
}

// Search the registry by query. Falls back to a local filter over the curated
// popular list when the registry is unreachable.
async function search(query) {
  const q = String(query || '').trim()
  if (!q) return list()
  try {
    return await fetchRegistry(q)
  } catch (e) {
    log.warn('MCP market search failed:', e.message)
    const needle = q.toLowerCase()
    return POPULAR.filter(p => (p.title + ' ' + p.description + ' ' + p.name).toLowerCase().includes(needle))
  }
}

// The curated popular list.
function popular() {
  return POPULAR.slice()
}

module.exports = { list, search, popular, buildConfig, validateInstallConfig, ALLOWED_RUNTIMES, isValidPackageIdentifier }