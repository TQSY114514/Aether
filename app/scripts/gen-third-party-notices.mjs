#!/usr/bin/env node
// Regenerates THIRD-PARTY-NOTICES.md in the repo root and in app/ from the production
// dependency closure recorded in app/package-lock.json.
//
// Why both copies: app/ is the packaging root for the npm package and for
// electron-builder, and neither tool can reach files outside the app directory. The two
// files must stay byte-identical, so always regenerate them together with this script.
//
// Usage:
//   node app/scripts/gen-third-party-notices.mjs
//   node app/scripts/gen-third-party-notices.mjs --modules-root ../somewhere-with-node_modules

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '..')
const repoRoot = path.resolve(appDir, '..')

const argv = process.argv.slice(2)
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const lockPath = path.resolve(argOf('--lock', path.join(appDir, 'package-lock.json')))
// Root that contains node_modules/. Lockfile keys are already "node_modules/..." paths,
// so this must NOT point at node_modules itself.
const modulesRoot = path.resolve(argOf('--modules-root', appDir))

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?(\.(md|txt|markdown|rst))?$/i

function readPackageLicence(pkgPath) {
  const dir = path.join(modulesRoot, pkgPath)
  if (!fs.existsSync(dir)) return { text: null, copyright: null }
  let best = null
  for (const entry of fs.readdirSync(dir)) {
    if (!LICENCE_FILE.test(entry)) continue
    const full = path.join(dir, entry)
    let stat
    try { stat = fs.statSync(full) } catch { continue }
    if (!stat.isFile() || stat.size > 400_000) continue
    if (!best || entry.length < best.length) best = entry
  }
  if (!best) return { text: null, copyright: null }
  const text = fs.readFileSync(path.join(dir, best), 'utf8').replace(/\r\n/g, '\n').trim()
  const m = text.match(/^\s*(copyright[^\n]{0,160})$/im)
  return { text, copyright: m ? m[1].trim() : null }
}

const norm = (t) => t
  .replace(/^\s*copyright.*$/gim, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const packages = lock.packages || {}

// Production closure = everything npm installs at runtime. devOnly and devOptional
// entries (type-only peers such as @types/react) are NOT shipped and must not be listed.
const components = []
for (const [pkgPath, meta] of Object.entries(packages)) {
  if (pkgPath === '') continue
  if (meta.dev === true || meta.devOptional === true) continue
  const name = meta.name || pkgPath.split('node_modules/').pop()
  const licence = typeof meta.license === 'string' ? meta.license : 'UNKNOWN'
  components.push({ name, version: meta.version || '?', licence, pkgPath })
}
components.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

const groups = new Map()      // licence id -> Map(normalised body -> { body, keys: [] })
const copyrightOf = new Map() // key -> copyright line
const withoutText = []

for (const c of components) {
  const key = `${c.name}@${c.version}`
  const { text, copyright } = readPackageLicence(c.pkgPath)
  copyrightOf.set(key, copyright)
  if (!text) { withoutText.push(key); continue }
  const body = c.licence === 'MIT' ? MIT_BODY : text
  const byBody = groups.get(c.licence) || new Map()
  const existing = byBody.get(norm(body)) || { body, keys: [] }
  existing.keys.push(key)
  byBody.set(norm(body), existing)
  groups.set(c.licence, byBody)
}

const out = []
out.push('# Third-Party Notices / 第三方组件声明')
out.push('')
out.push('本文件列出随 Aether 一同分发的第三方组件及其许可条款。')
out.push('Aether 自身的许可见 [`LICENSE`](./LICENSE)，版权归属声明见 [`NOTICE`](./NOTICE)。')
out.push('')
out.push(`清单由 \`app/package-lock.json\` 的生产依赖闭包生成（共 **${components.length}** 个组件），按许可分组。`)
out.push('')
out.push('> **适用范围**：本清单描述仓库在生成时锁定的生产依赖闭包，也就是随桌面安装包一同打包的组件版本。')
out.push('> 通过 npm 安装 `aetherai` 时依赖由你的包管理器就地解析安装（`dependencies` 使用 `^` 区间），实际安装的版本可能不同 ——')
out.push('> 那种情况下请以 `node_modules` 中各组件自带的 LICENSE 文件为准。')
out.push('>')
out.push('> 重新生成：`node app/scripts/gen-third-party-notices.mjs`（根目录与本目录两份必须完全一致）。')
out.push('')
out.push('## 组件清单 / Component Index')
out.push('')
out.push('| 组件 / Component | 版本 | 许可 / License |')
out.push('| :--- | :--- | :--- |')
for (const c of components) {
  out.push(`| \`${c.name}\` | ${c.version} | ${c.licence} |`)
}
out.push('')

const mit = groups.get('MIT')
if (mit) {
  out.push('## MIT')
  out.push('')
  out.push('以下组件以 MIT 许可分发。共用许可正文（各组件版权行随其后）：')
  out.push('')
  out.push('```')
  out.push(MIT_BODY)
  out.push('```')
  out.push('')
  const keys = []
  for (const { keys: k } of mit.values()) keys.push(...k)
  for (const c of components.filter((x) => x.licence === 'MIT' && !keys.includes(`${x.name}@${x.version}`))) {
    keys.push(`${c.name}@${c.version}`)
  }
  for (const key of keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) {
    const c = copyrightOf.get(key)
    out.push(`- \`${key}\` — ${c || '包内未附带独立版权行（许可声明见其 `package.json`）'}`)
  }
  out.push('')
}

for (const licence of [...groups.keys()].filter((k) => k !== 'MIT').sort()) {
  out.push(`## ${licence}`)
  out.push('')
  const variants = [...groups.get(licence).values()].sort((a, b) => b.keys.length - a.keys.length)
  const listed = new Set(variants.flatMap((v) => v.keys))
  const extra = components.filter((c) => c.licence === licence && !listed.has(`${c.name}@${c.version}`)).map((c) => `${c.name}@${c.version}`)
  if (extra.length) {
    variants.push({ body: null, keys: extra })
  }
  for (const v of variants) {
    if (v.body === null) {
      out.push(`适用组件：${v.keys.sort().map((k) => '`' + k + '`').join(', ')}`)
      out.push('')
      out.push('（这些组件包内未附带独立许可文件；许可声明见其 `package.json`。）')
      out.push('')
      continue
    }
    if (v.body.length < 150) {
      throw new Error(`licence body for ${v.keys.join(', ')} looks truncated (${v.body.length} chars)`)
    }
    out.push(`适用组件：${v.keys.sort().map((k) => '`' + k + '`').join(', ')}`)
    out.push('')
    if (variants.length > 1) out.push(`（本组正文，来自 \`${v.keys[0]}\`）`)
    out.push('```')
    out.push(v.body)
    out.push('```')
    out.push('')
  }
}

const content = out.join('\n')

// Self-checks: refuse to write a notice file that silently lost any licence text.
if (/\[truncated\]/i.test(content)) throw new Error('refusing to write: found a truncation marker')
const flat = norm(content)
for (const [licence, byBody] of groups) {
  for (const { body, keys } of byBody.values()) {
    if (body.length < 150) throw new Error(`refusing to write: ${licence} body for ${keys.join(', ')} is only ${body.length} chars`)
    if (!flat.includes(norm(body))) throw new Error(`refusing to write: ${licence} body for ${keys.join(', ')} was not reproduced verbatim`)
  }
}
if (withoutText.length) {
  console.warn(`warning: no in-package licence file for: ${withoutText.join(', ')}`)
}

const targets = [path.join(repoRoot, 'THIRD-PARTY-NOTICES.md'), path.join(appDir, 'THIRD-PARTY-NOTICES.md')]
for (const target of targets) fs.writeFileSync(target, content, 'utf8')

console.log(`components: ${components.length}`)
console.log(`licence groups: ${[...groups.keys()].sort().join(', ')}`)
console.log(`without an in-package licence file: ${withoutText.join(', ') || '(none)'}`)
console.log(`wrote ${targets.map((t) => path.relative(repoRoot, t)).join(' + ')} (${content.length} chars)`)
