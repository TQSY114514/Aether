import { describe, it, expect } from 'vitest'
import {
  stripMarkdownToPlainText,
  formatSessionAsMarkdown,
  parseInlineTextAttachments,
  composePromptWithSnippets,
  messageMatchesSearch,
} from './exportMarkdown'
import type { Message, Session } from '@/types'

describe('exportMarkdown utilities', () => {
  it('strips Markdown syntax cleanly while preserving readable code and links', () => {
    const md = [
      '# Heading Title',
      '',
      '> Quoted text with **bold** and *italic*.',
      '',
      'See [Docs](https://example.com) and ![shot](https://a/b.png).',
      '',
      '```ts',
      'const x = 1',
      '```',
    ].join('\n')

    const plain = stripMarkdownToPlainText(md)
    expect(plain).toContain('Heading Title')
    expect(plain).toContain('Quoted text with bold and italic.')
    expect(plain).toContain('Docs (https://example.com)')
    expect(plain).toContain('[Image: shot]')
    expect(plain).toContain('const x = 1')
    expect(plain).not.toContain('```')
    expect(plain).not.toContain('**')
  })

  it('formats a session transcript into structured Markdown with tool call summaries', () => {
    const session: Session = {
      id: 7,
      title: 'Fix Search',
      cwd: 'd:\\Aether',
      persona_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:05:00Z',
      pinned: 0,
    }
    const messages: Message[] = [
      {
        id: 1,
        session_id: 7,
        role: 'user',
        content: 'Check bugs',
        created_at: '2026-01-01T00:01:00Z',
        model_used: null,
        provider_used: null,
        token_count: null,
        latency_ms: null,
        status: 'success',
        error_message: null,
      },
      {
        id: 2,
        session_id: 7,
        role: 'assistant',
        content: 'Found one issue.',
        thinking_content: 'Inspecting files...',
        created_at: '2026-01-01T00:02:00Z',
        model_used: 'claude-sonnet',
        provider_used: 1,
        token_count: 120,
        latency_ms: 900,
        status: 'success',
        error_message: null,
      },
    ]

    const md = formatSessionAsMarkdown(session, messages, {
      2: [{ name: 'read_file', result: 'ok', error: null }],
    })

    expect(md).toContain('# Fix Search')
    expect(md).toContain('`d:\\Aether`')
    expect(md).toContain('## User')
    expect(md).toContain('## Assistant _(claude-sonnet · 2026-01-01T00:02:00Z)_')
    expect(md).toContain('<summary>Thinking</summary>')
    expect(md).toContain('`read_file` (ok)')
  })

  it('parses both new and legacy inline text attachments into collapsible blocks', () => {
    const content = [
      '[File: notes.txt]:',
      '```',
      'line 1',
      'line 2',
      '```',
      '',
      'Explain this file',
      '',
      '📎 legacy.log:',
      '```',
      'ERR 500',
      '```',
    ].join('\n')

    const parsed = parseInlineTextAttachments(content)
    expect(parsed.attachments).toHaveLength(2)
    expect(parsed.attachments[0]).toEqual({ label: 'notes.txt', lang: '', body: 'line 1\nline 2' })
    expect(parsed.attachments[1]).toEqual({ label: 'legacy.log', lang: '', body: 'ERR 500' })
    expect(parsed.rest).toBe('Explain this file')
  })

  it('composes prompt text with snippet blocks cleanly', () => {
    const out = composePromptWithSnippets('Check this:', [{ content: 'let a = 1' }], (i) => `Snippet ${i}`)
    expect(out).toBe('Check this:\n\n[Snippet 1]:\n```\nlet a = 1\n```')
  })

  it('safely matches multimodal array tool results and thinking content in messageMatchesSearch', () => {
    const msg = { content: 'See screenshot below', thinking_content: 'Checking browser page' }
    const multimodalCalls = [
      {
        name: 'browser_screenshot',
        args: { url: 'https://example.com' },
        result: [
          { type: 'text', text: 'Captured viewport' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        ],
        error: null,
      },
    ]

    expect(messageMatchesSearch(msg, 'captured viewport', undefined, multimodalCalls)).toBe(true)
    expect(messageMatchesSearch(msg, 'checking browser', undefined, multimodalCalls)).toBe(true)
    expect(messageMatchesSearch(msg, 'example.com', undefined, multimodalCalls)).toBe(true)
    expect(messageMatchesSearch(msg, 'nonexistent-needle', undefined, multimodalCalls)).toBe(false)
  })
})
