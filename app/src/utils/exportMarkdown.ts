import type { Message, Session } from '@/types'
import { stripChannelMarkers } from './markdown'

export interface InlineTextAttachment {
  label: string
  lang: string
  body: string
}

export interface ToolSummaryLike {
  name: string
  args?: unknown
  result?: unknown
  error?: unknown
  diff?: unknown
}

/**
 * Safely check whether an unknown runtime field (string, multimodal array, object)
 * contains a lowercased search query without throwing on non-string values.
 */
export function valueContainsQuery(val: unknown, lowerQ: string): boolean {
  if (val == null || !lowerQ) return false
  if (typeof val === 'string') return val.toLowerCase().includes(lowerQ)
  try {
    return JSON.stringify(val).toLowerCase().includes(lowerQ)
  } catch {
    return String(val).toLowerCase().includes(lowerQ)
  }
}

/**
 * Check whether a message matches an in-chat search query across content,
 * thinking trace, and tool call metadata/results (including multimodal arrays).
 */
export function messageMatchesSearch(
  m: Pick<Message, 'content' | 'thinking_content'>,
  lowerQ: string,
  thinkingOverride?: string,
  toolCalls?: ToolSummaryLike[]
): boolean {
  if (!lowerQ) return false
  if (valueContainsQuery(m.content, lowerQ)) return true
  if (valueContainsQuery(thinkingOverride || m.thinking_content, lowerQ)) return true
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false
  return toolCalls.some(
    (tc) =>
      valueContainsQuery(tc.name, lowerQ) ||
      valueContainsQuery(tc.error, lowerQ) ||
      valueContainsQuery(tc.result, lowerQ) ||
      valueContainsQuery(tc.diff, lowerQ) ||
      valueContainsQuery(tc.args, lowerQ)
  )
}

/**
 * Append pasted snippet blocks cleanly after user prompt text.
 */
export function composePromptWithSnippets(
  content: string,
  snippets: Array<{ content: string }> | undefined,
  labelFn: (oneBasedIndex: number) => string
): string {
  if (!snippets || snippets.length === 0) return content
  const snippetBlocks = snippets
    .map((s, i) => `[${labelFn(i + 1)}]:\n\`\`\`\n${s.content}\n\`\`\``)
    .join('\n\n')
  return content ? `${content}\n\n${snippetBlocks}` : snippetBlocks
}

/**
 * Extract collapsible inline text-file / paste-snippet blocks emitted by
 * `sendMessage` (`[File: name]:` / legacy `📎 name:`) or `ChatInput` (`[Snippet 1]:`).
 */
export function parseInlineTextAttachments(content: string): {
  attachments: InlineTextAttachment[]
  rest: string
} {
  if (!content) return { attachments: [], rest: '' }
  const lines = content.split(/\r?\n/)
  const attachments: InlineTextAttachment[] = []
  const kept: string[] = []
  let i = 0
  let outerFence: { ch: string; len: number } | null = null

  while (i < lines.length) {
    const line = lines[i]
    if (outerFence) {
      kept.push(line)
      const closeRe = new RegExp(`^\\s*${outerFence.ch}{${outerFence.len},}\\s*$`)
      if (closeRe.test(line)) outerFence = null
      i++
      continue
    }

    const headerMatch = /^(?:📎\s+(.+?)|\[(?:File|Attachment):\s*(.+?)\]|\[([^\]]+)\]):\s*$/.exec(line.trim())
    if (headerMatch && i + 1 < lines.length) {
      const fenceStart = /^(`{3,}|~{3,})(.*)$/.exec(lines[i + 1].trim())
      if (fenceStart) {
        const ch = fenceStart[1][0]
        const len = fenceStart[1].length
        const lang = fenceStart[2].trim()
        const closeRe = new RegExp(`^\\s*${ch}{${len},}\\s*$`)
        let j = i + 2
        let closed = false
        while (j < lines.length) {
          if (closeRe.test(lines[j])) {
            closed = true
            break
          }
          j++
        }
        if (closed) {
          const label = (headerMatch[1] || headerMatch[2] || headerMatch[3] || 'Attachment').trim()
          attachments.push({
            label,
            lang,
            body: lines.slice(i + 2, j).join('\n'),
          })
          i = j + 1
          continue
        }
      }
    }

    const anyFence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (anyFence) {
      outerFence = { ch: anyFence[1][0], len: anyFence[1].length }
    }
    kept.push(line)
    i++
  }

  const rest = kept.join('\n').replace(/^\n+|\n+$/g, '')
  return { attachments, rest }
}

/**
 * Strip common Markdown formatting into readable plain text for clipboard copy.
 */
export function stripMarkdownToPlainText(md: string): string {
  if (!md) return ''
  let text = stripChannelMarkers(md)
  // Unwrap fenced code blocks while preserving inner code lines
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm, '$2')
  // Images -> [Image: alt] or [Image]
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string) => (alt.trim() ? `[Image: ${alt.trim()}]` : '[Image]'))
  // Links -> label (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) =>
    label.trim() === url.trim() ? label : `${label} (${url})`
  )
  // Inline code
  text = text.replace(/`([^`\n]+)`/g, '$1')
  // ATX headings & blockquotes
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
  text = text.replace(/^[ \t]*>[ \t]?/gm, '')
  // Horizontal rules
  text = text.replace(/^[ \t]*([-*_])(?:\s*\1){2,}[ \t]*$/gm, '')
  // Emphasis / strike
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1$2$3')
  text = text.replace(/(^|[^\w_])_([^_\n]+)_([^\w_]|$)/g, '$1$2$3')
  text = text.replace(/~~([^~]+)~~/g, '$1')
  // Clean trailing spaces and collapse excessive blank lines
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Format a full conversation session and its messages as a clean Markdown transcript.
 */
export function formatSessionAsMarkdown(
  session: Pick<Session, 'id' | 'title' | 'cwd' | 'created_at' | 'updated_at'>,
  messages: Message[],
  toolCallsByMessage?: Record<number, ToolSummaryLike[]>
): string {
  const title = (session.title || `Session #${session.id}`).trim()
  const lines: string[] = [`# ${title}`, '']
  const exportedAt = new Date().toISOString()
  lines.push(`- **Exported**: ${exportedAt}`)
  if (session.cwd) lines.push(`- **Workspace**: \`${session.cwd}\``)
  lines.push(`- **Messages**: ${messages.length}`)
  lines.push('', '---', '')

  for (const m of messages) {
    const roleTitle = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'
    const metaParts: string[] = []
    if (m.model_used && m.role === 'assistant') metaParts.push(m.model_used)
    if (m.created_at) metaParts.push(m.created_at)
    const suffix = metaParts.length > 0 ? ` _(${metaParts.join(' · ')})_` : ''
    lines.push(`## ${roleTitle}${suffix}`, '')

    if (m.thinking_content && m.thinking_content.trim()) {
      lines.push('<details>', '<summary>Thinking</summary>', '', '```text', m.thinking_content.trim(), '```', '</details>', '')
    }

    const body = stripChannelMarkers(m.content || '').trim()
    if (body) {
      lines.push(body, '')
    }

    const calls = toolCallsByMessage?.[m.id]
    if (Array.isArray(calls) && calls.length > 0) {
      lines.push('### Tool Calls', '')
      for (const tc of calls) {
        const status = tc.error ? `error: ${tc.error}` : tc.result != null ? 'ok' : 'pending'
        lines.push(`- \`${tc.name}\` (${status})`)
      }
      lines.push('')
    }

    if (m.error_message) {
      lines.push(`> **Error**: ${m.error_message}`, '')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/**
 * Trigger a browser download for a Markdown file.
 */
export function downloadMarkdownFile(filename: string, content: string): void {
  const safeName = filename.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').slice(0, 80) || 'aether-chat.md'
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName.endsWith('.md') ? safeName : `${safeName}.md`
  a.click()
  URL.revokeObjectURL(url)
}
