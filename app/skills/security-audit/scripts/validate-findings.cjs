#!/usr/bin/env node
// Zero-dependency validator for findings.json (cloudflare/security-audit-skill contract)
const fs = require('fs')

function validateFindingsObject(doc) {
  const errors = []
  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: ['Document must be a JSON object'] }
  }
  if (!Array.isArray(doc.findings)) {
    errors.push('findings must be an array')
  }
  if (!doc.capabilities || typeof doc.capabilities !== 'object') {
    errors.push('capabilities axis map is required')
  }

  for (const [idx, f] of (doc.findings || []).entries()) {
    const p = `findings[${idx}](${f.id || idx})`
    if (!f.finder_id || !f.verifier_id) {
      errors.push(`${p}: finder_id and verifier_id are required`)
    }
    if (f.finder_id && f.verifier_id && f.finder_id === f.verifier_id) {
      errors.push(`${p}: protocol violation: finder_id must not equal verifier_id`)
    }
    if (f.status === 'confirmed') {
      if (!Array.isArray(f.source_trace) || f.source_trace.length === 0) {
        errors.push(`${p}: confirmed finding requires non-empty source_trace`)
      }
      for (const hop of f.source_trace || []) {
        if (!hop.file || typeof hop.line !== 'number' || !hop.snippet) {
          errors.push(`${p}: each source_trace hop requires file, line, and snippet`)
        }
      }
      if (f.verification_method === 'execution' && (doc.sandbox_available !== true || f.sandbox_verified !== true)) {
        errors.push(`${p}: execution finding cannot be confirmed without OS/Docker sandbox (must be needs_validation)`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

if (require.main === module) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: validate-findings.cjs [path-to-findings.json]')
    process.exit(1)
  }
  const doc = JSON.parse(fs.readFileSync(target, 'utf8'))
  const res = validateFindingsObject(doc)
  if (!res.ok) {
    console.error('INVALID findings.json:\n' + res.errors.join('\n'))
    process.exit(1)
  }
  console.log('OK: findings.json passed all security-audit protocol invariants.')
}

module.exports = { validateFindingsObject }
