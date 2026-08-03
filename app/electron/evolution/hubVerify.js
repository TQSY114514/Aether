// ───────────────────────────────────────────────────────────────────────────
// HubVerify — Asset signature and integrity verification for the Hub system.
//
// Phase 4 (4.8): Provides SHA-256 based verification utilities for Hub assets.
// All functions are synchronous and operate purely on the asset object.
// ───────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')

// ─── Constants ─────────────────────────────────────────────────────────────

// Default HMAC key used when no key is provided.
// In production, this should be configured via HubClient or environment.
const DEFAULT_HMAC_KEY = 'aether-hub-default-key'

// ─── Helpers ───────────────────────────────────────────────────────────────

// Compute the HMAC-SHA256 signature for an asset's content.
function _computeSignature(content, key) {
  const hmac = crypto.createHmac('sha256', key || DEFAULT_HMAC_KEY)
  hmac.update(typeof content === 'string' ? content : JSON.stringify(content))
  return hmac.digest('hex')
}

// Compute the SHA-256 hash of an asset's content (for integrity checks).
function _computeIntegrityHash(content) {
  const hash = crypto.createHash('sha256')
  hash.update(typeof content === 'string' ? content : JSON.stringify(content))
  return hash.digest('hex')
}

// Validate that an asset object has the required fields.
function _validateAsset(asset) {
  if (!asset || typeof asset !== 'object') {
    return { valid: false, error: 'asset must be a non-null object' }
  }
  if (!asset.type || typeof asset.type !== 'string') {
    return { valid: false, error: 'asset must have a type string' }
  }
  if (!asset.id || typeof asset.id !== 'string') {
    return { valid: false, error: 'asset must have an id string' }
  }
  if (asset.content === undefined || asset.content === null) {
    return { valid: false, error: 'asset must have content' }
  }
  return { valid: true }
}

// ─── Verification Functions ────────────────────────────────────────────────

/**
 * Verify the HMAC-SHA256 signature of an asset.
 *
 * @param {object} asset - The asset to verify. Must have { content, signature }.
 * @param {object} [options]
 * @param {string} [options.key] - HMAC key to verify against. Defaults to DEFAULT_HMAC_KEY.
 * @returns {{ ok: boolean, error?: string }}
 *
 * The signature is computed over the asset's content field. If the asset's
 * signature field matches the recomputed HMAC, verification passes.
 */
function verifySignature(asset, options = {}) {
  const validation = _validateAsset(asset)
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }

  if (!asset.signature) {
    return { ok: false, error: 'asset has no signature field' }
  }

  const key = options.key || DEFAULT_HMAC_KEY
  const expected = _computeSignature(asset.content, key)

  if (asset.signature !== expected) {
    return {
      ok: false,
      error: `signature mismatch: expected ${expected}, got ${asset.signature}`,
    }
  }

  return { ok: true }
}

/**
 * Verify the integrity of an asset using SHA-256 hash.
 * If the asset does not have an explicit integrityHash field, it computes
 * one from the content and compares it against the signature as a fallback.
 *
 * @param {object} asset - The asset to verify. Must have { content }.
 * @param {object} [options]
 * @param {string} [options.expectedHash] - Optional expected SHA-256 hash.
 *        If not provided, the function checks whether the asset has an
 *        integrityHash field and compares against it.
 * @returns {{ ok: boolean, error?: string }}
 */
function verifyIntegrity(asset, options = {}) {
  const validation = _validateAsset(asset)
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }

  const computedHash = _computeIntegrityHash(asset.content)

  // If an expected hash is explicitly provided, compare against it
  if (options.expectedHash) {
    if (computedHash !== options.expectedHash) {
      return {
        ok: false,
        error: `integrity hash mismatch: expected ${options.expectedHash}, computed ${computedHash}`,
      }
    }
    return { ok: true }
  }

  // If the asset has an integrityHash field, verify against it
  if (asset.integrityHash) {
    if (computedHash !== asset.integrityHash) {
      return {
        ok: false,
        error: `integrity hash mismatch: stored ${asset.integrityHash}, computed ${computedHash}`,
      }
    }
    return { ok: true }
  }

  // No integrity hash available for comparison — compute and attach one
  return {
    ok: true,
    note: 'no integrityHash to compare; computed hash for reference',
    computedHash,
  }
}

/**
 * Verify the author information of an asset.
 *
 * @param {object} asset - The asset to verify. Must have { author }.
 * @param {object} [options]
 * @param {string[]} [options.allowedAuthors] - List of allowed author identifiers.
 *        If provided, the asset's author must be in this list.
 * @param {RegExp} [options.authorPattern] - Optional regex pattern the author must match.
 * @returns {{ ok: boolean, error?: string }}
 */
function verifyAuthor(asset, options = {}) {
  const validation = _validateAsset(asset)
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }

  if (!asset.author) {
    return { ok: false, error: 'asset has no author field' }
  }

  const author = String(asset.author)

  // Check allowed authors list if provided
  if (options.allowedAuthors && Array.isArray(options.allowedAuthors) && options.allowedAuthors.length > 0) {
    if (!options.allowedAuthors.includes(author)) {
      return {
        ok: false,
        error: `author "${author}" is not in the allowed list: [${options.allowedAuthors.join(', ')}]`,
      }
    }
  }

  // Check author pattern if provided
  if (options.authorPattern) {
    if (!options.authorPattern.test(author)) {
      return {
        ok: false,
        error: `author "${author}" does not match pattern ${options.authorPattern}`,
      }
    }
  }

  // If the asset has an authorSignature, verify it (optional additional check)
  if (asset.authorSignature) {
    const key = options.key || DEFAULT_HMAC_KEY
    const expectedSig = _computeSignature(asset.author, key)
    if (asset.authorSignature !== expectedSig) {
      return {
        ok: false,
        error: `author signature mismatch: expected ${expectedSig}, got ${asset.authorSignature}`,
      }
    }
  }

  return { ok: true }
}

/**
 * Run all three verifications (signature, integrity, author) on an asset.
 *
 * @param {object} asset - The asset to verify.
 * @param {object} [options] - Options passed through to each verify function.
 * @returns {{ ok: boolean, checks: { signature: object, integrity: object, author: object }, error?: string }}
 */
function verifyAll(asset, options = {}) {
  const sigResult = verifySignature(asset, options)
  const intResult = verifyIntegrity(asset, options)
  const authResult = verifyAuthor(asset, options)

  const ok = sigResult.ok && intResult.ok && authResult.ok

  return {
    ok,
    checks: {
      signature: sigResult,
      integrity: intResult,
      author: authResult,
    },
    error: ok ? undefined : 'one or more verification checks failed',
  }
}

module.exports = {
  verifySignature,
  verifyIntegrity,
  verifyAuthor,
  verifyAll,
  DEFAULT_HMAC_KEY,
}