#!/usr/bin/env node
// Regenerates THIRD-PARTY-NOTICES.md in the repo root and in app/ from the production
// dependency closure recorded in app/package-lock.json.
//
// Why both copies: app/ is the packaging root for the npm package and for electron-builder,
// and neither tool can reach files outside the app directory. The two files must stay
// byte-identical, so always regenerate them together with this script.
//
// Usage:
//   node app/scripts/gen-third-party-notices.mjs
//   node app/scripts/gen-third-party-notices.mjs --modules-root ../somewhere-with-node_modules
//   node app/scripts/gen-third-party-notices.mjs --lock /path/to/package-lock.json

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
// Root that *contains* node_modules/. Lockfile keys are already "node_modules/..." paths,
// so this must not point at node_modules itself.
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

const missingDirs = []

// Real attribution lines look like "Copyright (c) 2024 Name" / "Copyright 2011-2022 Name and
// Contributors" / "Copyright © Name". Licence prose also contains sentences that start with
// the word "copyright" ("copyright notice that is included in or attached to the work"), so
// matching every line that begins with it is not enough:
//   * only scan the head of the file, where attribution lives,
//   * require a notice shape (year, "(c)"/"(C)"/"©", or a capitalised name right after),
//   * reject lines carrying licence-prose markers.
const PROSE_MARKERS = [
  'notice', 'permission', 'appear', 'copies', 'terms', 'conditions', 'hereby', 'granted',
  'license', 'licence', 'reproduce', 'derivative', 'rights', 'subject to', 'without limitation',
  'liable', 'warranty', 'software', 'the work', 'in it', 'party', 'parties', 'holder',
  'holders', 'damages', 'and/or'
]
// Words that legitimately appear lower-case inside a holder name ("…and other contributors").
const NAME_ALLOWLIST = new Set([
  'and', 'of', 'the', 'other', 'contributors', 'authors', 'affiliates', 'inc.', 'llc',
  'ltd.', 'gmbh', 'sa', 'as', 'co.', 'limited', 'team', 'project', 'community'
])
const MARKER = /[([{]c[)\]]|©/i

// A notice names a holder; licence prose merely mentions the word "copyright". Three tests,
// in order:
//   1. a (c)/©/(C) marker followed by more text — the canonical notice shape,
//   2. a leading year with no prose vocabulary ("Copyright 2024 Name"),
//   3. a short name-like string: 2-10 tokens, no prose vocabulary, every token either
//      capitalised (or camelCase, e.g. "jQuery"), containing a digit/url/punctuation, or a
//      linking word from NAME_ALLOWLIST.
// Attribution is often not in the licence file's first lines (argparse's CWI/CNRI notices sit
// further down), so the whole file is scanned — the prose filter is what keeps it honest.
function looksLikeNotice(line) {
  if (!/^copyright\b/i.test(line)) return false
  const rest = line.replace(/^copyright\b/i, '').trim()
  const lower = line.toLowerCase()
  if (MARKER.test(rest) && rest.replace(MARKER, '').trim().length > 1) return true
  if (/^(19|20)\d{2}\b/.test(rest) && !PROSE_MARKERS.some((m) => lower.includes(m))) return true
  if (PROSE_MARKERS.some((m) => lower.includes(m))) return false
  if (!/^[A-Za-z]/.test(rest)) return false
  const tokens = rest.split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || tokens.length > 10) return false
  return tokens.every((token) =>
    /^[a-z]+[A-Z]/.test(token) ||                 // camelCase: jQuery, iPhone
    /[A-Z]/.test(token[0]) ||                     // Capitalised
    /[\d.<>@()\[\]{}\-&,]/.test(token) ||      // year, url, punctuation
    NAME_ALLOWLIST.has(token.toLowerCase())
  )
}

function extractCopyright(text) {
  const lines = text.split('\n').map((raw) => raw.replace(/^[\s*#>\-/]+/, '').trim())
  for (let i = 0; i < lines.length; i++) {
    if (!looksLikeNotice(lines[i])) continue
    let notice = lines[i]
    // Notices are wrapped in some licence files, e.g. argparse's
    // "Copyright (c) 1991 - 1995, Stichting Mathematisch Centrum Amsterdam," +
    // "The Netherlands.  All rights reserved." — pull the continuation back in, but never
    // swallow the prose that follows the notice.
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      if (!/(,|&|\band)$/.test(notice.trimEnd())) break
      const next = lines[j]
      if (!next || next.length > 90) break
      if (/(permission|granted|hereby|licen[cs]e|notice|warranty|liable)/i.test(next)) break
      notice = `${notice.trimEnd()} ${next}`
      if (notice.length > 180) break
    }
    return notice.slice(0, 160)
  }
  return null
}

function readPackageLicence(pkgPath) {
  const dir = path.join(modulesRoot, pkgPath)
  if (!fs.existsSync(dir)) {
    // The package is not installed: refuse to regenerate rather than silently writing a
    // notices file that lists components without their licence texts.
    return { text: null, copyright: null, missing: true }
  }
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
  return { text, copyright: extractCopyright(text) }
}

const missingDirsGuard = () => {
  if (missingDirs.length > 0) {
    throw new Error(
      `${missingDirs.length} package director${missingDirs.length === 1 ? 'y is' : 'ies are'} missing under ` +
      `${modulesRoot} (run \`npm install\` first, or pass --modules-root): ` +
      missingDirs.slice(0, 5).join(', ') + (missingDirs.length > 5 ? ', …' : '')
    )
  }
}

const norm = (t) => t
  .replace(/^\s*copyright.*$/gim, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

missingDirsGuard()

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const packages = lock.packages || {}

// Production closure = everything npm installs at runtime. dev and devOptional entries
// (type-only peers such as @types/react) are NOT bundled and must not be listed.
const components = []
for (const [pkgPath, meta] of Object.entries(packages)) {
  if (pkgPath === '') continue
  if (meta.dev === true || meta.devOptional === true) continue
  const name = meta.name || pkgPath.split('node_modules/').pop()
  const licence = typeof meta.license === 'string' ? meta.license : 'UNKNOWN'
  components.push({ name, version: meta.version || '?', licence, pkgPath, optional: meta.optional === true })
}
components.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

const groups = new Map()      // licence id -> Map(normalised body -> { body, keys: [] })
const copyrightOf = new Map() // key -> copyright line
const withoutText = []
const skippedOptional = []

for (const c of components) {
  const key = `${c.name}@${c.version}`
  const { text, copyright, missing } = readPackageLicence(c.pkgPath)
  if (missing) {
    // Installed without optional dependencies (`npm ci --omit=optional`): an optional package
    // simply is not part of this installation, so it is skipped instead of aborting the run.
    if (c.optional) { skippedOptional.push(key); continue }
    missingDirs.push(c.pkgPath)
    continue
  }
  copyrightOf.set(key, copyright)
  if (!text) { withoutText.push(key); continue }
  const body = c.licence === 'MIT' ? MIT_BODY : text
  const byBody = groups.get(c.licence) || new Map()
  const existing = byBody.get(norm(body)) || { body, keys: [] }
  existing.keys.push(key)
  byBody.set(norm(body), existing)
  groups.set(c.licence, byBody)
}

missingDirsGuard()

// Packages skipped above are not installed, hence not distributed: keep them out of the index.
const published = components.filter((c) => !skippedOptional.includes(`${c.name}@${c.version}`))

const out = []
out.push('# Third-Party Notices / 第三方组件声明')
out.push('')
out.push('本文件列出随 Aether 一同分发的第三方组件及其许可条款。')
out.push('Aether 自身的许可见 [`LICENSE`](./LICENSE)，版权归属声明见 [`NOTICE`](./NOTICE)。')
out.push('')
out.push(`清单由 \`app/package-lock.json\` 的生产依赖闭包生成（共 **${published.length}** 个组件），按许可分组。`)
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
for (const c of published) {
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
  for (const c of published.filter((x) => x.licence === 'MIT' && !keys.includes(`${x.name}@${x.version}`))) {
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
  const extra = published
    .filter((c) => c.licence === licence && !listed.has(`${c.name}@${c.version}`))
    .map((c) => `${c.name}@${c.version}`)
  if (extra.length) variants.push({ body: null, keys: extra })

  for (const v of variants) {
    const sorted = [...v.keys].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    if (v.body === null) {
      out.push(`适用组件：${sorted.map((k) => '`' + k + '`').join(', ')}`)
      out.push('')
      out.push('（这些组件包内未附带独立许可文件；许可声明见其 `package.json`。）')
      out.push('')
      continue
    }
    if (v.body.length < 150) {
      throw new Error(`licence body for ${v.keys.join(', ')} looks truncated (${v.body.length} chars)`)
    }
    out.push(`适用组件：${sorted.map((k) => '`' + k + '`').join(', ')}`)
    out.push('')
    if (variants.length > 1) out.push(`（本组正文，来自 \`${v.keys[0]}\`）`)
    out.push('```')
    out.push(v.body)
    out.push('```')
    out.push('')
    // Copyright lines differ even when the licence body is identical (e.g. ISC), so each
    // component's own line is reproduced next to the shared body.
    for (const key of sorted) {
      const c = copyrightOf.get(key)
      out.push(`- \`${key}\` — ${c || '包内未附带独立版权行（许可声明见其 `package.json`）'}`)
    }
    out.push('')
  }
}

const content = out.join('\n')

// Self-checks: never write a notices file that silently lost licence text or attribution.
if (/\[truncated\]/i.test(content)) throw new Error('refusing to write: found a truncation marker')
const flat = norm(content)
for (const [licence, byBody] of groups) {
  for (const { body, keys } of byBody.values()) {
    if (body.length < 150) {
      throw new Error(`refusing to write: ${licence} body for ${keys.join(', ')} is only ${body.length} chars`)
    }
    if (!flat.includes(norm(body))) {
      throw new Error(`refusing to write: ${licence} body for ${keys.join(', ')} was not reproduced verbatim`)
    }
  }
}
for (const [key, line] of copyrightOf) {
  if (line && !flat.includes(norm(line))) {
    throw new Error(`refusing to write: copyright line for ${key} is missing`)
  }
}

const targets = [path.join(repoRoot, 'THIRD-PARTY-NOTICES.md'), path.join(appDir, 'THIRD-PARTY-NOTICES.md')]
for (const target of targets) fs.writeFileSync(target, content, 'utf8')

console.log(`components: ${components.length}`)
console.log(`licence groups: ${[...groups.keys()].sort().join(', ')}`)
console.log(`without an in-package licence file: ${withoutText.join(', ') || '(none)'}`)
if (skippedOptional.length) console.log(`skipped (optional, not installed): ${skippedOptional.join(', ')}`)
console.log(`wrote ${targets.map((t) => path.relative(repoRoot, t)).join(' + ')} (${content.length} chars)`)
