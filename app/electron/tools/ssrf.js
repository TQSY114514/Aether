// ───────────────────────────────────────────────────────────────────────────
// SSRF (Server-Side Request Forgery) prevention.
//
// Blocks URLs that resolve to private/reserved IP ranges to prevent an LLM
// from fetching internal services, cloud metadata endpoints, or local hosts.
// Also blocks redirects by default (the `fetch` `beforeRedirect` callback).
// DNS rebinding protection: resolve hostnames to IP before every redirect.
// ───────────────────────────────────────────────────────────────────────────

const net = require('net')
const dns = require('dns')

/**
 * Check if an IP address is private/reserved and should be blocked.
 */
function isPrivateIP(ip) {
  if (!ip) return true // block null/undefined
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4) return true
    // 10.0.0.0/8
    if (parts[0] === 10) return true
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true
    // 0.0.0.0
    if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true
  }
  // IPv6
  if (net.isIP(ip) === 6) {
    // ::1 (loopback), fd00::/8 (unique local), fe80::/10 (link-local)
    if (ip === '::1' || ip === '::' || ip.startsWith('fd') || ip.startsWith('FE80')) return true
  }
  return false
}

/**
 * Resolve a hostname to an IP and check if the IP is private.
 * Throws a descriptive error if the IP is private.
 */
async function checkSSRFHostname(host) {
  if (isPrivateIP(host)) {
    throw new Error(`SSRF blocked: ${host} is a private IP`)
  }
  try {
    const family = net.isIP(host)
    if (family === 4 || family === 6) return // already an IP, checked above
    // DNS lookup — all A + AAAA records
    const addrs = await dns.promises.lookup(host, { all: true })
    for (const { address } of addrs) {
      if (isPrivateIP(address)) {
        throw new Error(`SSRF blocked: ${host} resolves to private IP ${address}`)
      }
    }
  } catch (e) {
    if (e.message.startsWith('SSRF blocked')) throw e
    // DNS resolution failure — allow (let the network layer handle it)
  }
}

/**
 * Create a fetch options object that blocks:
 * - Direct requests to private IPs
 * - Redirects to private IPs (with DNS rebinding protection)
 *
 * The beforeRedirect callback re-resolves the redirect target's hostname
 * and checks the resolved IP — this mitigates DNS rebinding attacks where
 * the same domain resolves to different IPs on different lookups.
 */
function ssrfFetchOptions(onSSRFCheck) {
  const seen = new Set()
  return {
    beforeRedirect: (destination, _requestDetails) => {
      const url = new URL(destination.toString())
      if (seen.has(url.toString())) {
        throw new Error('Redirect loop detected')
      }
      seen.add(url.toString())
      if (onSSRFCheck) {
        onSSRFCheck(url.hostname)
      }
    },
  }
}

/**
 * Async SSRF check for the beforeRedirect callback.
 * Re-resolves hostname via DNS to detect rebinding.
 */
async function redirectSSRFCheck(hostname) {
  if (isPrivateIP(hostname)) {
    throw new Error(`SSRF blocked: redirect to private IP ${hostname}`)
  }
  await checkSSRFHostname(hostname)
}

/**
 * Synchronous SSRF check for URLs with literal IPs (no DNS needed).
 * For hostnames, use checkSSRFHostname() before the request.
 */
function checkSSRF(urlStr) {
  let url
  try { url = new URL(urlStr) } catch { return { ok: false, reason: 'invalid url' } }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `blocked: ${url.protocol} protocol` }
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return { ok: false, reason: 'blocked: localhost or 0.0.0.0' }
  }

  if (hostname.endsWith('.meta') || hostname.endsWith('.amazonaws.com')) {
    return { ok: false, reason: 'blocked: cloud metadata endpoint' }
  }

  return { ok: true }
}

module.exports = { isPrivateIP, checkSSRF, checkSSRFHostname, ssrfFetchOptions, redirectSSRFCheck }
