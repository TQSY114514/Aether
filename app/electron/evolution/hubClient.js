// ───────────────────────────────────────────────────────────────────────────
// HubClient — local file-system-based Hub asset manager.
//
// Phase 4 (4.8): Hub system for publishing, searching, downloading, and
// listing Hub assets. Operates on the local file system only (no remote
// server dependency).
//
// Hub asset format:
//   { type, id, content, signature, author, version }
//
// Local cache directory: <userData>/skills/hub/
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')

// ─── Helpers ───────────────────────────────────────────────────────────────

// Resolve the local hub cache directory.
// Falls back to a system temp directory if userData is not provided.
function _getHubDir(userData) {
  if (userData) {
    return path.join(userData, 'skills', 'hub')
  }
  // Fallback: use a predictable temp directory
  return path.join(os.tmpdir(), 'aether-hub', 'skills', 'hub')
}

// Ensure the hub directory exists, creating it recursively if needed.
function _ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Generate a deterministic file name for a cached asset.
function _assetFileName(asset) {
  const safeName = `${asset.type}-${asset.id}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${safeName}.json`
}

// Generate a simple SHA-256 signature for an asset's content.
function _signContent(content, secret) {
  const hmac = crypto.createHmac('sha256', secret || 'aether-hub-default-key')
  hmac.update(typeof content === 'string' ? content : JSON.stringify(content))
  return hmac.digest('hex')
}

// ─── HubClient Class ───────────────────────────────────────────────────────

class HubClient {
  /**
   * @param {object} [options]
   * @param {string} [options.userData] - Path to user data directory for cache.
   * @param {string} [options.hubSecret] - Secret key for signing assets.
   */
  constructor(options = {}) {
    this._userData = options.userData || null
    this._hubSecret = options.hubSecret || 'aether-hub-default-key'
    this._hubDir = _getHubDir(this._userData)
    _ensureDir(this._hubDir)
  }

  /**
   * Get the hub directory path.
   * @returns {string}
   */
  getHubDir() {
    return this._hubDir
  }

  /**
   * Publish an asset to the local hub cache.
   * If the asset does not have a signature, one is generated automatically.
   *
   * @param {object} asset - The asset to publish.
   * @param {string} asset.type - Asset type (e.g., 'skill', 'recipe', 'model').
   * @param {string} asset.id - Unique asset identifier.
   * @param {*} asset.content - Asset payload.
   * @param {string} [asset.signature] - HMAC-SHA256 signature of the content.
   * @param {string} [asset.author] - Author identifier.
   * @param {string} [asset.version] - Semantic version string.
   * @returns {Promise<{ ok: boolean, error?: string, asset?: object }>}
   */
  async publish(asset) {
    if (!asset || !asset.type || !asset.id) {
      return { ok: false, error: 'asset must have type and id' }
    }

    // Normalize asset
    const normalized = {
      type: asset.type,
      id: asset.id,
      content: asset.content !== undefined ? asset.content : null,
      signature: asset.signature || _signContent(asset.content, this._hubSecret),
      author: asset.author || 'anonymous',
      version: asset.version || '1.0.0',
      publishedAt: new Date().toISOString(),
    }

    const fileName = _assetFileName(normalized)
    const filePath = path.join(this._hubDir, fileName)

    try {
      // Check if asset already exists and compare versions
      if (fs.existsSync(filePath)) {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (existing.version === normalized.version) {
          return { ok: false, error: `asset ${normalized.type}:${normalized.id} version ${normalized.version} already exists` }
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8')
      return { ok: true, asset: normalized }
    } catch (err) {
      return { ok: false, error: `publish failed: ${err.message}` }
    }
  }

  /**
   * Search for assets in the local hub cache.
   * Supports filtering by type, author, and simple text matching on id/type.
   *
   * @param {object|string} query - Search query string or object with filters.
   * @param {string} [query.type] - Filter by asset type.
   * @param {string} [query.author] - Filter by author.
   * @param {string} [query.text] - Text search across id and type fields.
   * @returns {Promise<{ ok: boolean, results: object[], error?: string }>}
   */
  async search(query) {
    const results = []
    const q = typeof query === 'string' ? { text: query } : (query || {})

    try {
      const files = fs.readdirSync(this._hubDir)

      for (const file of files) {
        if (!file.endsWith('.json')) continue

        const filePath = path.join(this._hubDir, file)
        try {
          const asset = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

          // Apply filters
          if (q.type && asset.type !== q.type) continue
          if (q.author && asset.author !== q.author) continue
          if (q.text) {
            const lowerText = q.text.toLowerCase()
            const idMatch = asset.id.toLowerCase().includes(lowerText)
            const typeMatch = asset.type.toLowerCase().includes(lowerText)
            const authorMatch = asset.author.toLowerCase().includes(lowerText)
            if (!idMatch && !typeMatch && !authorMatch) continue
          }

          results.push(asset)
        } catch {
          // Skip malformed files
          continue
        }
      }

      return { ok: true, results }
    } catch (err) {
      return { ok: false, results: [], error: `search failed: ${err.message}` }
    }
  }

  /**
   * Download an asset by its type and id from the local cache.
   *
   * @param {string} assetId - The asset id to download.
   * @param {object} [options]
   * @param {string} [options.type] - Optional type filter.
   * @returns {Promise<{ ok: boolean, asset?: object, error?: string }>}
   */
  async download(assetId, options = {}) {
    if (!assetId) {
      return { ok: false, error: 'assetId is required' }
    }

    try {
      const files = fs.readdirSync(this._hubDir)

      for (const file of files) {
        if (!file.endsWith('.json')) continue

        const filePath = path.join(this._hubDir, file)
        try {
          const asset = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          if (asset.id === assetId) {
            if (options.type && asset.type !== options.type) continue
            return { ok: true, asset }
          }
        } catch {
          continue
        }
      }

      return { ok: false, error: `asset not found: ${assetId}` }
    } catch (err) {
      return { ok: false, error: `download failed: ${err.message}` }
    }
  }

  /**
   * List all locally cached Hub assets.
   *
   * @param {object} [options]
   * @param {string} [options.type] - Optional type filter.
   * @returns {Promise<{ ok: boolean, assets: object[], error?: string }>}
   */
  async listLocal(options = {}) {
    const assets = []

    try {
      const files = fs.readdirSync(this._hubDir)

      for (const file of files) {
        if (!file.endsWith('.json')) continue

        const filePath = path.join(this._hubDir, file)
        try {
          const asset = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          if (options.type && asset.type !== options.type) continue
          assets.push(asset)
        } catch {
          continue
        }
      }

      return { ok: true, assets }
    } catch (err) {
      return { ok: false, assets: [], error: `listLocal failed: ${err.message}` }
    }
  }

  /**
   * Remove an asset from the local cache by its type and id.
   *
   * @param {string} assetId - The asset id to remove.
   * @param {object} [options]
   * @param {string} [options.type] - Optional type filter.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async remove(assetId, options = {}) {
    if (!assetId) {
      return { ok: false, error: 'assetId is required' }
    }

    try {
      const files = fs.readdirSync(this._hubDir)

      for (const file of files) {
        if (!file.endsWith('.json')) continue

        const filePath = path.join(this._hubDir, file)
        try {
          const asset = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          if (asset.id === assetId) {
            if (options.type && asset.type !== options.type) continue
            fs.unlinkSync(filePath)
            return { ok: true }
          }
        } catch {
          continue
        }
      }

      return { ok: false, error: `asset not found: ${assetId}` }
    } catch (err) {
      return { ok: false, error: `remove failed: ${err.message}` }
    }
  }
}

module.exports = { HubClient }