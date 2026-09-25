#!/usr/bin/env node
// Zero-dependency validator for coverage-ledger.json (cloudflare/security-audit-skill contract)
const fs = require('fs')

function validateCoverageLedgerObject(doc) {
  const errors = []
  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: ['Ledger must be a JSON object'] }
  }
  const axes = ['READ', 'WRITE', 'EXECUTE', 'NETWORK', 'GIT', 'EXTERNAL']
  if (!doc.capabilities || typeof doc.capabilities !== 'object') {
    errors.push('Missing capabilities object')
  } else {
    for (const ax of axes) {
      if (typeof doc.capabilities[ax] !== 'boolean') {
        errors.push(`Missing boolean capability axis: ${ax}`)
      }
    }
  }
  if (!Array.isArray(doc.files_scanned)) errors.push('files_scanned must be an array')
  if (!Array.isArray(doc.files_skipped)) errors.push('files_skipped must be an array')
  return { ok: errors.length === 0, errors }
}

if (require.main === module) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: validate-coverage-ledger.cjs [path-to-coverage-ledger.json]')
    process.exit(1)
  }
  const doc = JSON.parse(fs.readFileSync(target, 'utf8'))
  const res = validateCoverageLedgerObject(doc)
  if (!res.ok) {
    console.error('INVALID coverage-ledger.json:\n' + res.errors.join('\n'))
    process.exit(1)
  }
  console.log('OK: coverage-ledger.json passed all schema checks.')
}

module.exports = { validateCoverageLedgerObject }
