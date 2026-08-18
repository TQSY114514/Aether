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

// Strip the `[...]` brackets URL.hostname keeps around IPv6 literals —
// net.isIP('[::1]') is 0, so an unstripped literal would bypass every check.
function stripIpBrackets(ip) {
  const s = String(ip || '').trim()
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1)
  return s
}

// IPv4 private/reserved rules. `0.0.0.0/8`（P2-M7）整个 A 段封禁——0.x 是
// "本网络"保留段，部分栈会把它当作 127.0.0.1 的别名处理。
function isPrivateV4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
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
  // 0.0.0.0/8（P2-M7：整个 0/8 保留段）
  if (parts[0] === 0) return true
  return false
}

// Unwrap an IPv4-mapped IPv6 address（P2-M7）: `::ffff:a.b.c.d`（点分形式）
// 或 `::ffff:0:w1:w2` / `::ffff:w1:w2`（十六进制形式）→ 返回 IPv4 点分串，
// 非映射地址返回 null。
function unwrapIpv4Mapped(v6) {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v6)
  if (dotted) return dotted[1]
  const hex = /^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v6)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

/**
 * Check if an IP address is private/reserved and should be blocked.
 * IPv4-mapped IPv6 (`::ffff:127.0.0.1` etc.) is unwrapped and re-checked
 * against the IPv4 rules. Bracketed `[...]` literals (URL.hostname form)
 * are normalized first. Hostnames (non-IP strings) return false — the DNS
 * path in checkSSRFHostname handles them.
 */
function isPrivateIP(ip) {
  if (!ip) return true // block null/undefined
  const s = stripIpBrackets(ip)
  const family = net.isIP(s)
  if (family === 4) return isPrivateV4(s)
  if (family === 6) {
    const lower = s.toLowerCase()
    // ::1 (loopback), :: (unspecified), fd00::/8 (unique local), fe80::/10 (link-local)
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fd') || lower.startsWith('fe80')) return true
    // ::ffff:127.0.0.1 / ::ffff:169.254.169.254 …（P2-M7）
    const mapped = unwrapIpv4Mapped(lower)
    if (mapped && isPrivateV4(mapped)) return true
    return false
  }
  return false
}

/**
 * Resolve a hostname to an IP and check if the IP is private.
 * Throws a descriptive error if the IP is private.
 */
async function checkSSRFHostname(host) {
  const bare = stripIpBrackets(host)
  if (isPrivateIP(bare)) {
    throw new Error(`SSRF blocked: ${bare} is a private IP`)
  }
  try {
    const family = net.isIP(bare)
    if (family === 4 || family === 6) return // already an IP, checked above
    // DNS lookup — all A + AAAA records
    const addrs = await dns.promises.lookup(bare, { all: true })
    for (const { address } of addrs) {
      if (isPrivateIP(address)) {
        throw new Error(`SSRF blocked: ${bare} resolves to private IP ${address}`)
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

  const hostname = stripIpBrackets(url.hostname).toLowerCase()
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return { ok: false, reason: 'blocked: localhost or 0.0.0.0' }
  }

  // Literal IPs (v4 / v6 / IPv4-mapped v6 / 0.0.0.0-8) — full private-range
  // check, so `::ffff:127.0.0.1` and `0.0.0.1` cannot slip past the string
  // comparisons above.（P2-M7）
  if (net.isIP(hostname) && isPrivateIP(hostname)) {
    return { ok: false, reason: `blocked: private/reserved IP ${hostname}` }
  }

  if (hostname.endsWith('.meta') || hostname.endsWith('.amazonaws.com')) {
    return { ok: false, reason: 'blocked: cloud metadata endpoint' }
  }

  return { ok: true }
}

module.exports = { isPrivateIP, isPrivateV4, unwrapIpv4Mapped, stripIpBrackets, checkSSRF, checkSSRFHostname, ssrfFetchOptions, redirectSSRFCheck }
