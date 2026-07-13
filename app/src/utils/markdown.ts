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
  let t = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Sanitize URLs before they land in href/src. Only allow http(s), data:image,
  // and relative URLs; drop anything else (javascript:, vbscript:, file:, etc.).
  const safeUrl = (u: string) => {
    const s = u.trim()
    if (/^(https?:\/\/|data:image\/|\/|\.\/|\.\.\/|#)/i.test(s)) return s
    return ''
  }

  // Code blocks — wrap in a container with a language label + a copy button
  // (data-code carries the raw text so the UI layer can attach a click handler).
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmed = code.trim()
    const esc = trimmed.replace(/"/g, '&quot;')
    const label = lang ? lang : 'text'
    return `<pre class="code-block"><div class="code-head"><span class="code-lang">${label}</span><button class="code-copy" data-code="${esc}">复制</button></div><code class="language-${lang}">${trimmed}</code></pre>`
  })

  // Inline code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Tables: | col1 | col2 | ...  (must be rendered before block-level rules)
  t = t.replace(/\n?^\|(.+)\|\n\|[-| :]+\|\n((?:^\|.+\|\n?)*)/gm, (match, headerLine, bodyLines) => {
    const headers = headerLine.split('|').map(s => s.trim()).filter(Boolean)
    const rows = bodyLines.trim().split('\n').map(line =>
      line.split('|').map(s => s.trim()).filter(Boolean)
    )
    let html = '<table><thead><tr>'
    headers.forEach(h => { html += `<th>${h}</th>` })
    html += '</tr></thead><tbody>'
    rows.forEach(row => {
      html += '<tr>'
      row.forEach(cell => { html += `<td>${cell}</td>` })
      html += '</tr>'
    })
    html += '</tbody></table>'
    return html
  })

  // Images
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const s = safeUrl(url)
    return s ? `<img src="${s}" alt="${alt}" style="max-width:100%">` : `<span>[image blocked]</span>`
  })

  // Headings (must be before bold/italic to avoid conflicts)
  t = t.replace(/^#### (.+)$/gm, '<h5>$1</h5>')
  t = t.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  t = t.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  t = t.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  // Blockquote
  t = t.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>')

  // Lists
  t = t.replace(/^- (.+)$/gm, '<li>$1</li>')
  t = t.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')

  // LaTeX (display: $$...$$)
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const escaped = math.trim()
    return `<div class="math">${escaped}</div>`
  })
  // LaTeX (inline: $...$)
  t = t.replace(/\$([^\s$][^$]*[^\s$])\$/g, (_, math) => {
    return `<span class="math-inline">${math}</span>`
  })

  // Bold and italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  t = t.replace(/\*(.+?)\*/g, '<i>$1</i>')

  // Links. Tokenize markdown links FIRST so the bare-URL autolinker below
  // doesn't re-match the URL inside the generated href attribute.
  const linkTokens: string[] = []
  t = t.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    const s = safeUrl(url)
    const html = s ? `<a href="${s}" target="_blank" rel="noreferrer noopener">${label}</a>` : label
    const ph = `\x00L${linkTokens.length}\x00`
    linkTokens.push(html)
    return ph
  })
  // Bare URLs (only those not already inside a link token).
  t = t.replace(/(?<![="'>])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>')
  // Restore markdown-link tokens.
  t = t.replace(/\x00L(\d+)\x00/g, (_, i) => linkTokens[Number(i)] || '')

  // Horizontal rule
  t = t.replace(/^---$/gm, '<hr>')

  // Paragraphs (wrap remaining text)
  // First protect block-level elements from being wrapped in <p>
  const blocks: { ph: string; orig: string }[] = []
  let bidx = 0
  t = t.replace(/<(table|pre|blockquote|hr|h[2-5])[^>]*>[\s\S]*?<\/(table|pre|blockquote|hr|h[2-5])>/g, (m) => {
    const ph = `\x00B${bidx}\x00`
    blocks.push({ ph, orig: m }); bidx++
    return ph
  })
  t = t.replace(/\n\n/g, '</p><p>')
  t = t.replace(/\n/g, '<br>')
  t = blocks.length > 0 ? t : '<p>' + t + '</p>'
  blocks.forEach(({ ph, orig }) => { t = t.replace(ph, orig) })
  _cacheText = text
  _cacheHtml = t
  return t
}
