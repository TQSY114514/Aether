'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// FindingsLedger — Disk-verified citation ledger for read-only subagents
// (inspired by PersonaCLI/Herta FindingsLedger / report_finding).
//
// Electron-Free Boundary: Plain CommonJS module. Zero 'electron' imports.
//
// Every finding is a concise one-sentence claim backed by workspace citations
// (`path`, `path:line`, or `path:start-end`). Each citation is verified
// against real files on disk (including symlink-resolved workspace
// containment and line bounds) before acceptance, rejecting fabricated lines
// at tool boundaries.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const MAX_FINDINGS = 12
const MAX_CITES_PER_FINDING = 6
const MAX_CLAIM_CHARS = 400
const MAX_VERIFY_BYTES = 2 * 1024 * 1024 // 2 MB cap for line-count verification

/**
 * Parse a citation string into `{ filePath, startLine, endLine }`.
 * Handles Windows drive letters (e.g. `D:\repo\a.js:12-20`) cleanly by only
 * matching trailing `:line` or `:start-end` suffixes.
 *
 * @param {string} rawCite
 * @returns {{ filePath: string, startLine: number|null, endLine: number|null }|null}
 */
function parseCitation(rawCite) {
  const s = String(rawCite || '').trim()
  if (!s) return null

  const match = s.match(/^(.*?):(\d+)(?:-(\d+))?$/)
  if (!match) {
    return { filePath: s, startLine: null, endLine: null }
  }

  const filePath = match[1].trim()
  if (!filePath) return null
  const startLine = Number(match[2])
  const endLine = match[3] != null ? Number(match[3]) : startLine
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return null

  return { filePath, startLine, endLine }
}

function isContainedPath(realTarget, realRoot) {
  const normTarget = process.platform === 'win32' ? realTarget.toLowerCase() : realTarget
  const normRoot = process.platform === 'win32' ? realRoot.toLowerCase() : realRoot
  if (normTarget === normRoot) return true
  const prefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep
  return normTarget.startsWith(prefix)
}

/**
 * Verify a citation exists on disk inside `workspaceRoot` and (if line-pinned)
 * lies within the file's actual line count.
 *
 * @param {string} rawCite
 * @param {string} workspaceRoot
 * @returns {{ ok: boolean, normalizedCite?: string, reason?: string }}
 */
function verifyCitation(rawCite, workspaceRoot) {
  const parsed = parseCitation(rawCite)
  if (!parsed) {
    return { ok: false, reason: `invalid citation format: "${String(rawCite || '')}"` }
  }
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    return { ok: false, reason: 'workspaceRoot is required to verify citations' }
  }

  let realRoot
  try {
    realRoot = fs.realpathSync(path.resolve(workspaceRoot))
  } catch {
    return { ok: false, reason: `workspace root does not exist: ${workspaceRoot}` }
  }

  const candidate = path.isAbsolute(parsed.filePath)
    ? path.resolve(parsed.filePath)
    : path.resolve(realRoot, parsed.filePath)

  if (!fs.existsSync(candidate)) {
    return { ok: false, reason: `cited file does not exist: ${parsed.filePath}` }
  }

  let realTarget
  try {
    realTarget = fs.realpathSync(candidate)
  } catch (e) {
    return { ok: false, reason: `failed to resolve citation path ${parsed.filePath}: ${e.message}` }
  }

  if (!isContainedPath(realTarget, realRoot)) {
    return { ok: false, reason: `citation escapes workspace boundary: ${parsed.filePath}` }
  }

  let stat
  try {
    stat = fs.statSync(realTarget)
  } catch (e) {
    return { ok: false, reason: `failed to stat cited file ${parsed.filePath}: ${e.message}` }
  }
  if (!stat.isFile()) {
    return { ok: false, reason: `cited path is not a regular file: ${parsed.filePath}` }
  }

  const relPath = path.relative(realRoot, realTarget).replace(/\\/g, '/')

  if (parsed.startLine !== null) {
    if (parsed.startLine < 1 || parsed.endLine < parsed.startLine) {
      return {
        ok: false,
        reason: `invalid line range ${parsed.startLine}-${parsed.endLine} in ${relPath}`,
      }
    }
    if (stat.size > MAX_VERIFY_BYTES) {
      return {
        ok: false,
        reason: `cited file ${relPath} exceeds ${MAX_VERIFY_BYTES} bytes for line verification`,
      }
    }
    const content = fs.readFileSync(realTarget, 'utf8')
    const lineCount = content === '' ? 0 : content.split(/\r?\n/).length
    if (parsed.endLine > lineCount) {
      return {
        ok: false,
        reason: `line ${parsed.endLine} out of range for ${relPath} (file has ${lineCount} lines)`,
      }
    }
    const lineSuffix = parsed.startLine === parsed.endLine
      ? `:${parsed.startLine}`
      : `:${parsed.startLine}-${parsed.endLine}`
    return { ok: true, normalizedCite: `${relPath}${lineSuffix}` }
  }

  return { ok: true, normalizedCite: relPath }
}

class FindingsLedger {
  /**
   * @param {{ workspaceRoot: string, maxFindings?: number }} opts
   */
  constructor(opts = {}) {
    this.workspaceRoot = opts.workspaceRoot || ''
    this.maxFindings = Number.isFinite(opts.maxFindings) && opts.maxFindings > 0
      ? Math.floor(opts.maxFindings)
      : MAX_FINDINGS
    this.items = []
  }

  /**
   * @param {{ claim: string, cites: string[] }} input
   * @returns {{ ok: boolean, index?: number, finding?: { index: number, claim: string, cites: string[] }, reason?: string }}
   */
  add(input = {}) {
    if (this.items.length >= this.maxFindings) {
      return {
        ok: false,
        reason: `findings ledger full (max ${this.maxFindings}); consolidate related findings instead of adding more`,
      }
    }

    const claim = String(input.claim || '').replace(/\s+/g, ' ').trim()
    if (!claim) {
      return { ok: false, reason: 'claim must be a non-empty string' }
    }
    if (claim.length > MAX_CLAIM_CHARS) {
      return { ok: false, reason: `claim too long (${claim.length} > ${MAX_CLAIM_CHARS} chars)` }
    }

    const rawCites = Array.isArray(input.cites) ? input.cites : []
    if (rawCites.length === 0) {
      return { ok: false, reason: 'at least one file citation is required in cites' }
    }
    if (rawCites.length > MAX_CITES_PER_FINDING) {
      return { ok: false, reason: `too many cites (${rawCites.length} > ${MAX_CITES_PER_FINDING})` }
    }

    const verifiedCites = []
    for (const raw of rawCites) {
      const check = verifyCitation(raw, this.workspaceRoot)
      if (!check.ok) {
        return { ok: false, reason: check.reason }
      }
      verifiedCites.push(check.normalizedCite)
    }

    const finding = {
      index: this.items.length + 1,
      claim,
      cites: verifiedCites,
    }
    this.items.push(finding)
    return { ok: true, index: finding.index, finding }
  }

  all() {
    return this.items.map((f) => ({
      index: f.index,
      claim: f.claim,
      cites: [...f.cites],
    }))
  }

  get size() {
    return this.items.length
  }

  formatMarkdown() {
    if (this.items.length === 0) return ''
    const lines = ['## Verified Findings']
    for (const f of this.items) {
      lines.push(`${f.index}. ${f.claim} (${f.cites.map((c) => `\`${c}\``).join(', ')})`)
    }
    return lines.join('\n')
  }
}

module.exports = {
  FindingsLedger,
  MAX_FINDINGS,
  MAX_CITES_PER_FINDING,
  MAX_CLAIM_CHARS,
  parseCitation,
  verifyCitation,
}
