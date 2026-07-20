import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'

// Single-slot memoization: during streaming, renderMarkdown is called once per
// token on the SAME growing string — but each call has a different (longer) input,
// so a keyed cache wouldn't help. The single-slot cache only wins when the EXACT
// same text is re-rendered (e.g. a committed bubble re-rendered because a sibling
// updated). That case is common (zustand re-renders the whole list) and was the
// O(N²) jank source. Cost: one string comparison per call.
let _cacheText: string | null = null
let _cacheHtml: string | null = null

export function renderMarkdown(text: string): string {
  if (!text) return ''
  if (text === _cacheText && _cacheHtml !== null) return _cacheHtml

  const t = renderInner(text)
  _cacheText = text
  _cacheHtml = t
  return t
}

// Strip event handler attributes from HTML to prevent XSS via malicious markdown.
const EVENT_HANDLER_RE = /\s(on[a-z]\s*=\s*["'][^"']*["']|on[a-z]\s*=\s*[^\s>]+)/gi

function sanitizeHtml(html: string): string {
  return html
    .replace(EVENT_HANDLER_RE, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
}

// Map common shorthand language names to hljs language IDs.
const HL_LANGS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  cpp: 'cpp', c: 'c', cs: 'csharp', php: 'php', swift: 'swift',
  kt: 'kotlin', sh: 'bash', shell: 'bash', bash: 'bash', zsh: 'bash',
  yaml: 'yaml', yml: 'yaml', json: 'json', xml: 'xml', html: 'xml',
  css: 'css', scss: 'scss', sql: 'sql', lua: 'lua', r: 'r',
  dockerfile: 'dockerfile', md: 'markdown', git: 'git', diff: 'diff',
  ini: 'ini', toml: 'toml', env: 'bash', proto: 'protobuf',
  graphql: 'graphql', wasm: 'wasm', shellscript: 'bash',
}

function renderInner(raw: string): string {
  let t = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const safeUrl = (u: string) => {
    const s = u.trim()
    if (/^(https?:\/\/|data:image\/|\/|\.\/|\.\.\/|#)/i.test(s)) return s
    if (/^(javascript:|vbscript:)/i.test(s)) return ''
    return ''
  }

  // Code blocks with syntax highlighting via hljs.
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmed = code.trim()
    const esc = trimmed.replace(/"/g, '&quot;')
    const label = lang || 'text'
    const lineCount = trimmed.split('\n').length
    const canFold = lineCount >= 15
    const chevron = canFold ? `<button class="code-fold" data-lines="${lineCount}">▾</button>` : ''
    let highlighted = trimmed
    const hlLang = HL_LANGS[lang.toLowerCase()] || lang
    try {
      const result = hljs.highlight(trimmed, { language: hlLang, ignoreIllegals: true })
      highlighted = result.value
    } catch {
      try { highlighted = hljs.highlightAuto(trimmed).value } catch { /* plain */ }
    }
    return `<pre class="code-block${canFold ? ' foldable' : ''}"><div class="code-head"><span class="code-lang">${label}</span>${chevron}<button class="code-copy" data-code="${esc}">Copy</button></div><code class="language-${lang} hljs">${highlighted}</code></pre>`
  })

  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')

  t = t.replace(/\n?^\|(.+)\|\n\|[-| :]+\|\n((?:^\|.+\|\n?)*)/gm, (match, headerLine, bodyLines) => {
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

  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const s = safeUrl(url)
    return s ? `<img src="${s}" alt="${alt}" style="max-width:100%">` : `<span>[image blocked]</span>`
  })

  t = t.replace(/^#### (.+)$/gm, '<h5>$1</h5>')
  t = t.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  t = t.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  t = t.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  t = t.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>')

  // Task lists: - [ ] and - [x] → checkboxes (must run before generic li rule)
  t = t.replace(/^(\s*)-\s\[x\]\s(.+)$/gm, (_, indent, text) =>
    `${indent}<li class="task-item completed"><input type="checkbox" checked disabled>${text}</li>`)
  t = t.replace(/^(\s*)-\s\[\s\]\s(.+)$/gm, (_, indent, text) =>
    `${indent}<li class="task-item"><input type="checkbox" disabled>${text}</li>`)

  // Regular unordered lists (non-task)
  t = t.replace(/^- (.+)$/gm, (match, text) => {
    if (match.includes('[x]') || match.includes('[ ]')) return match
    return `<li>${text}</li>`
  })
  t = t.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')

  // Wrap consecutive <li> elements in <ul>
  t = t.replace(/(<li[^>]*>[\s\S]*?<\/li>)(\s*<li[^>]*>)/g, '$1</li>$2')
  t = t.replace(/(<li[^>]*>[\s\S]*?<\/li>)(?=[^<]|$)/g, (match) => {
    if (match.startsWith('<li') && !match.startsWith('<ul')) return '<ul>' + match + '</ul>'
    return match
  })
  t = t.replace(/<\/ul>\s+<ul>/g, '')

  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `<div class="math">${math.trim()}</div>`)
  t = t.replace(/\$([^\s$][^$]*[^\s$])\$/g, '<span class="math-inline">$1</span>')

  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>')
  t = t.replace(/\*(.+?)\*/g, '<i>$1</i>')

  const linkTokens: string[] = []
  t = t.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    const s = safeUrl(url)
    const html = s ? `<a href="${s}" target="_blank" rel="noreferrer noopener">${label}</a>` : label
    const ph = `\x00L${linkTokens.length}\x00`
    linkTokens.push(html)
    return ph
  })
  t = t.replace(/(?<![="'>])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>')
  t = t.replace(/\x00L(\d+)\x00/g, (_, i) => linkTokens[Number(i)] || '')

  t = t.replace(/^---$/gm, '<hr>')

  const blocks: { ph: string; orig: string }[] = []
  let bidx = 0
  t = t.replace(/<(table|pre|blockquote|hr|h[2-5]|ul|ol)[^>]*>[\s\S]*?<\/(table|pre|blockquote|hr|h[2-5]|ul|ol)>/g, (m) => {
    const ph = `\x00B${bidx}\x00`
    blocks.push({ ph, orig: m }); bidx++
    return ph
  })
  t = t.replace(/\n\n/g, '</p><p>')
  t = t.replace(/\n/g, '<br>')
  t = blocks.length > 0 ? t : '<p>' + t + '</p>'
  blocks.forEach(({ ph, orig }) => { t = t.replace(ph, orig) })

  return sanitizeHtml(t)
}
