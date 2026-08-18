// ─── SSRF guard unit tests ───────────────────────────────────────────────────
// 覆盖 P2-M7：::ffff: IPv4-mapped 解包复查、0.0.0.0/8 整段封禁、URL hostname
// 的 [IPv6] 括号形态归一化。既有私网/环回/链路本地段为回归基线。

import { describe, it, expect } from 'vitest'
import { isPrivateIP, checkSSRF, checkSSRFHostname } from '../electron/tools/ssrf'

describe('isPrivateIP（P2-M7：IPv4-mapped 与 0/8）', () => {
  it.each([
    '::ffff:127.0.0.1',            // mapped loopback
    '::ffff:169.254.169.254',      // mapped 云 metadata
    '::ffff:10.0.0.5',             // mapped 私网
    '::ffff:172.16.0.1',           // mapped 私网
    '::ffff:192.168.1.1',          // mapped 私网
    '::ffff:0.0.0.1',              // mapped 0/8
    '::ffff:7f00:1',               // mapped（十六进制形式）loopback
    '[::ffff:127.0.0.1]',          // URL.hostname 括号形态
    '[::1]',                       // 括号形态 loopback
  ])('拦截 IPv4-mapped / 括号形态: %s', (ip) => {
    expect(isPrivateIP(ip)).toBe(true)
  })

  it.each([
    '0.0.0.0',
    '0.0.0.1',                     // 0.0.0.0/8 整段（此前只封精确 0.0.0.0）
    '0.1.2.3',
  ])('拦截 0.0.0.0/8 保留段: %s', (ip) => {
    expect(isPrivateIP(ip)).toBe(true)
  })

  it.each([
    '127.0.0.1', '10.1.2.3', '172.31.255.255', '192.168.0.1', '169.254.169.254',
    '::1', '::', 'fd12::1', 'fe80::1', 'FE80::1',
  ])('既有私网/环回/ULA/链路本地仍拦截: %s', (ip) => {
    expect(isPrivateIP(ip)).toBe(true)
  })

  it.each([
    '::ffff:8.8.8.8',              // mapped 公网 IP 不误伤
    '8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111',
    'example.com',                 // 非 IP 字符串交给 DNS 路径
  ])('公网 IP / 主机名放行: %s', (ip) => {
    expect(isPrivateIP(ip)).toBe(false)
  })
})

describe('checkSSRF（URL 级）', () => {
  it.each([
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://0.0.0.0/',
    'http://0.0.0.1/x',
    'http://127.0.0.1:8080/',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:3000/',
  ])('拦截私网/保留段 URL: %s', (url) => {
    expect(checkSSRF(url).ok).toBe(false)
  })

  it.each([
    'http://8.8.8.8/',
    'https://example.com/',
  ])('放行公网 URL: %s', (url) => {
    expect(checkSSRF(url).ok).toBe(true)
  })
})

describe('checkSSRFHostname（DNS 入口）', () => {
  it.each([
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '[::ffff:10.0.0.1]',
    '0.0.0.1',
  ])('字面 IP 直接拒绝（无需 DNS）: %s', async (host) => {
    await expect(checkSSRFHostname(host)).rejects.toThrow('SSRF blocked')
  })
})
