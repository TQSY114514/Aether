// Lazy-load highlight.js: deferred until a code block is first encountered.
// Import from `lib/core` + selective languages so Rollup can tree-shake the
// 360 unused languages out of the bundle.

import hljsCore from 'highlight.js/lib/core'
import js from 'highlight.js/lib/languages/javascript'
import ts from 'highlight.js/lib/languages/typescript'
import py from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import md from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import php from 'highlight.js/lib/languages/php'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import diff from 'highlight.js/lib/languages/diff'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import proto from 'highlight.js/lib/languages/protobuf'
import lua from 'highlight.js/lib/languages/lua'

// Register ~25 languages so Rollup includes only those + core.
hljsCore.registerLanguage('javascript', js)
hljsCore.registerLanguage('typescript', ts)
hljsCore.registerLanguage('python', py)
hljsCore.registerLanguage('bash', bash)
hljsCore.registerLanguage('json', json)
hljsCore.registerLanguage('yaml', yaml)
hljsCore.registerLanguage('xml', xml)
hljsCore.registerLanguage('css', css)
hljsCore.registerLanguage('markdown', md)
hljsCore.registerLanguage('sql', sql)
hljsCore.registerLanguage('rust', rust)
hljsCore.registerLanguage('go', go)
hljsCore.registerLanguage('java', java)
hljsCore.registerLanguage('cpp', cpp)
hljsCore.registerLanguage('csharp', csharp)
hljsCore.registerLanguage('ruby', ruby)
hljsCore.registerLanguage('php', php)
hljsCore.registerLanguage('dockerfile', dockerfile)
hljsCore.registerLanguage('diff', diff)
hljsCore.registerLanguage('graphql', graphql)
hljsCore.registerLanguage('ini', ini)
hljsCore.registerLanguage('protobuf', proto)
hljsCore.registerLanguage('lua', lua)

let _hljs: typeof hljsCore | null = null
let _hljsLoading: Promise<void> | null = null
let _highlightVersion = 0
let _hljsCssLoaded = false

async function loadHljsCss() {
  if (_hljsCssLoaded) return
  await import('highlight.js/styles/atom-one-dark.css')
  _hljsCssLoaded = true
}

function loadHljs() {
  if (_hljs) return Promise.resolve()
  if (_hljsLoading) return _hljsLoading
  _hljsLoading = Promise.resolve().then(() => {
    _hljs = hljsCore
    _highlightVersion++
    return loadHljsCss()
  }).catch(() => { _hljsLoading = null })
  return _hljsLoading
}

// ─── Single-slot memoization ────────────────────────────────────────────────
let _cacheText: string | null = null
let _cacheVersion = -1
let _cacheHtml: string | null = null

export function renderMarkdown(text: string): string {
  if (!text) return ''
  if (text === _cacheText && _cacheVersion === _highlightVersion && _cacheHtml !== null) return _cacheHtml
  if (_hljs) {
    const t = renderInner(text, _hljs)
    _cacheText = text
    _cacheVersion = _highlightVersion
    _cacheHtml = t
    return t
  }
  const t = renderInner(text, null)
  _cacheText = text
  _cacheVersion = _highlightVersion
  _cacheHtml = t
  loadHljs()
  return t
}

// Map common shorthand language names to hljs language IDs.
const HL_LANGS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  cpp: 'cpp', c: 'c', cs: 'csharp', php: 'php', swift: 'swift',
  kt: 'kotlin', sh: 'bash', shell: 'bash', bash: 'bash', zsh: 'bash',
  yaml: 'yaml', yml: 'yaml', json: 'json', xml: 'xml', html: 'xml',
  css: 'css', scss: 'css', sql: 'sql', lua: 'lua', r: 'r',
  dockerfile: 'dockerfile', md: 'markdown', git: 'git', diff: 'diff',
  ini: 'ini', env: 'bash', proto: 'protobuf',
  graphql: 'graphql', wasm: 'wasm', shellscript: 'bash',
}

// Strip event handler attributes from HTML to prevent XSS via malicious markdown.
const EVENT_HANDLER_RE = /\s(on[a-z]\s*=\s*["'][^"']*["']|on[a-z]\s*=\s*[^\s>]+)/gi

function sanitizeHtml(html: string): string {
  return html
    .replace(EVENT_HANDLER_RE, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
}

// Pre-compiled regexes (created once, reused on every call).
const RE_CODE_BLOCK = /```(\w*)\n([\s\S]*?)```/g
const RE_INLINE_CODE = /`([^`]+)`/g
const RE_TABLE = /\n?^\|(.+)\|\n\|[-| :]+\|\n((?:^\|.+\|\n?)*)/gm
const RE_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g
const RE_H5 = /^#### (.+)$/gm
const RE_H4 = /^### (.+)$/gm
const RE_H3 = /^## (.+)$/gm
const RE_H2 = /^# (.+)$/gm
const RE_BLOCKQUOTE = /^>\s?(.+)$/gm
const RE_TASK_DONE = /^(\s*)-\s\[x\]\s(.+)$/gm
const RE_TASK_PENDING = /^(\s*)-\s\[\s\]\s(.+)$/gm
const RE_UL = /^- (.+)$/gm
const RE_OL = /^(\d+)\. (.+)$/gm
const RE_LI_WRAP = /(<li[^>]*>[\s\S]*?<\/li>)(\s*<li[^>]*>)/g
const RE_LI_CLOSE = /(<li[^>]*>[\s\S]*?<\/li>)(?=[^<]|$)/g
const RE_DOUBLE_UL = /<\/ul>\s+<ul>/g
const RE_BLOCK_MATH = /\$\$([\s\S]*?)\$\$/g
const RE_INLINE_MATH = /\$([^\s$][^$]*[^\s$])\$/g
const RE_BOLD_ITALIC = /\*\*\*(.+?)\*\*\*/g
const RE_BOLD = /\*\*(.+?)\*\*/g
const RE_STRIKE = /~~(.+?)~~/g
const RE_ITALIC = /\*(.+?)\*/g
const RE_LINK = /\[(.+?)\]\((.+?)\)/g
const RE_AUTO_URL = /(?<![="'>])(https?:\/\/[^\s<]+)/g
const RE_HR = /^---$/gm
const RE_BLOCK = /<(table|pre|blockquote|hr|h[2-5]|ul|ol)[^>]*>[\s\S]*?<\/(table|pre|blockquote|hr|h[2-5]|ul|ol)>/g
const RE_P_DOUBLE = /\n\n/g
const RE_P_SINGLE = /\n/g

function renderInner(raw: string, hljs: typeof hljsCore | null): string {
  let t = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const safeUrl = (u: string) => {
    const s = u.trim()
    if (/^(https?:\/\/|data:image\/|\/|\.\/|\.\.\/|#)/i.test(s)) return s
    if (/^(javascript:|vbscript:)/i.test(s)) return ''
    return ''
  }

  // Code blocks with syntax highlighting via hljs.
  t = t.replace(RE_CODE_BLOCK, (_, lang, code) => {
    const trimmed = code.trim()
    const esc = trimmed.replace(/"/g, '&quot;')
    const label = lang || 'text'
    const lineCount = trimmed.split('\n').length
    const canFold = lineCount >= 15
    const chevron = canFold ? `<button class="code-fold" data-lines="${lineCount}">&#9662;</button>` : ''
    let highlighted = trimmed
    if (hljs) {
      const hlLang = HL_LANGS[lang.toLowerCase()] || lang
      try {
        const result = hljs.highlight(trimmed, { language: hlLang, ignoreIllegals: true })
        highlighted = result.value
      } catch {
        try { highlighted = hljs.highlightAuto(trimmed).value } catch { /* plain */ }
      }
    }
    const lines = highlighted.split('\n')
    const numbered = lines.map((line, i) =>
      `<span class="ln"><span class="ln-i" data-l="${i + 1}"></span></span>${line}`
    ).join('\n')
    const lineClass = lineCount > 1 ? ' lines' : ''
    return `<pre class="code-block${lineClass}"><div class="code-head"><span class="code-lang">${label}</span>${chevron}<button class="code-copy" data-code="${esc}">Copy</button></div><code class="language-${lang} hljs">${numbered}</code></pre>`
  })

  t = t.replace(RE_INLINE_CODE, '<code>$1</code>')
  t = t.replace(RE_TABLE, (match, headerLine, bodyLines) => {
    const headers = headerLine.split('|').map(s => s.trim()).filter(Boolean)
    const rows = bodyLines.trim().split('\n').map(line =>
      line.split('|').map(s => s.trim()).filter(Boolean)
    )
    let html = '<table><thead><tr>'
    headers.forEach(h => { html += `<th>${h}</th>` })
    html += '</tr></thead><tbody>'
    rows.forEach(row => { html += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>' })
    html += '</tbody></table>'
    return html
  })
  t = t.replace(RE_IMAGE, (_, alt, url) => {
    const s = safeUrl(url)
    return s ? `<img src="${s}" alt="${alt}" style="max-width:100%;max-height:400px;object-fit:contain">` : '<span>[image blocked]</span>'
  })
  t = t.replace(RE_H5, '<h5>$1</h5>')
  t = t.replace(RE_H4, '<h4>$1</h4>')
  t = t.replace(RE_H3, '<h3>$1</h3>')
  t = t.replace(RE_H2, '<h2>$1</h2>')
  t = t.replace(RE_BLOCKQUOTE, '<blockquote>$1</blockquote>')
  t = t.replace(RE_TASK_DONE, (_, indent, text) => `${indent}<li class="task-item completed"><input type="checkbox" checked disabled>${text}</li>`)
  t = t.replace(RE_TASK_PENDING, (_, indent, text) => `${indent}<li class="task-item"><input type="checkbox" disabled>${text}</li>`)
  t = t.replace(RE_UL, (match, text) => match.includes('[x]') || match.includes('[ ]') ? match : `<li>${text}</li>`)
  t = t.replace(RE_OL, '<li>$2</li>')
  t = t.replace(RE_LI_WRAP, '$1</li>$2')
  t = t.replace(RE_LI_CLOSE, (match) => match.startsWith('<li') && !match.startsWith('<ul') ? '<ul>' + match + '</ul>' : match)
  t = t.replace(RE_DOUBLE_UL, '')
  t = t.replace(RE_BLOCK_MATH, (_, math) => `<div class="math">${math.trim()}</div>`)
  t = t.replace(RE_INLINE_MATH, '<span class="math-inline">$1</span>')
  t = t.replace(RE_BOLD_ITALIC, '<b><i>$1</i></b>')
  t = t.replace(RE_BOLD, '<b>$1</b>')
  t = t.replace(RE_STRIKE, '<del>$1</del>')
  t = t.replace(RE_ITALIC, '<i>$1</i>')

  const linkTokens: string[] = []
  t = t.replace(RE_LINK, (_, label, url) => {
    const s = safeUrl(url)
    const html = s ? `<a href="${s}" target="_blank" rel="noreferrer noopener">${label}</a>` : label
    const ph = `\x00L${linkTokens.length}\x00`
    linkTokens.push(html)
    return ph
  })
  t = t.replace(RE_AUTO_URL, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>')
  t = t.replace(/\x00L(\d+)\x00/g, (_, i) => linkTokens[Number(i)] || '')

  t = t.replace(RE_HR, '<hr>')

  const blocks: { ph: string; orig: string }[] = []
  let bidx = 0
  t = t.replace(RE_BLOCK, (m) => {
    const ph = `\x00B${bidx}\x00`
    blocks.push({ ph, orig: m }); bidx++
    return ph
  })
  t = t.replace(RE_P_DOUBLE, '</p><p>')
  t = t.replace(RE_P_SINGLE, '<br>')
  t = blocks.length > 0 ? t : '<p>' + t + '</p>'
  blocks.forEach(({ ph, orig }) => { t = t.replace(ph, orig) })

  return sanitizeHtml(t)
}
