// ─── Visual Verifier unit tests ─────────────────────────────────────────────
// Tests for electron/llm/visualVerifier.js: frontend file detection,
// console error extraction, visual fix prompt construction, and verification run.

import { describe, it, expect, vi } from 'vitest'
import {
  hasFrontendChanges,
  extractConsoleErrors,
  buildVisualFixPrompt,
  runVisualVerification,
} from '../electron/llm/visualVerifier'

describe('hasFrontendChanges', () => {
  it('detects frontend file paths in write/patch tools', () => {
    const auditTrail = [
      { name: 'read_file', args: { path: 'src/index.ts' } },
      { name: 'replace_file_content', args: { TargetFile: 'app/src/components/Header.tsx' } },
    ]
    expect(hasFrontendChanges(auditTrail)).toBe(true)
  })

  it('detects vue and html files', () => {
    const auditTrail = [
      { name: 'write_to_file', args: { path: 'web/App.vue' } },
    ]
    expect(hasFrontendChanges(auditTrail)).toBe(true)
  })

  it('returns false when only backend or non-UI files are modified', () => {
    const auditTrail = [
      { name: 'write_to_file', args: { path: 'electron/database.js' } },
      { name: 'run_command', args: { command: 'git status' } },
      { name: 'replace_file_content', args: { path: 'server/api.py' } },
    ]
    expect(hasFrontendChanges(auditTrail)).toBe(false)
  })
})

describe('extractConsoleErrors', () => {
  it('extracts error lines from text or multimodal parts', () => {
    const sampleOutput = [
      'Screenshot saved to /tmp/screenshot.png',
      '',
      'Page console (warnings/errors):',
      'warning: React does not recognize the `customProp` prop on a DOM element.',
      'error: Uncaught TypeError: Cannot read properties of undefined (reading "map") (http://localhost:5173/src/App.tsx:42)',
      'info: Connected to dev server',
    ].join('\n')

    const errors = extractConsoleErrors(sampleOutput)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('Uncaught TypeError')
  })

  it('returns empty array when no errors exist', () => {
    const cleanOutput = 'Screenshot captured in-memory (1280x800)\n\nPage console:\ninfo: Vite v5.0 ready.'
    expect(extractConsoleErrors(cleanOutput)).toEqual([])
  })
})

describe('buildVisualFixPrompt', () => {
  it('builds a text prompt with error lines', () => {
    const vResult = {
      url: 'http://localhost:5173',
      errors: ['error: Uncaught ReferenceError: foo is not defined'],
      result: 'Screenshot saved',
    }
    const msg = buildVisualFixPrompt(vResult)
    expect(msg.role).toBe('user')
    expect(msg.content).toContain('[Visual Verification Alert]')
    expect(msg.content).toContain('foo is not defined')
  })

  it('preserves image part if multimodal output exists', () => {
    const vResult = {
      url: 'http://localhost:5173',
      errors: ['error: CSS layout broken'],
      result: [
        { type: 'text', text: 'Screenshot captured' },
        { type: 'image', data: 'base64imagedata', mimeType: 'image/png' },
      ],
    }
    const msg = buildVisualFixPrompt(vResult)
    expect(msg.role).toBe('user')
    expect(Array.isArray(msg.content)).toBe(true)
    const imgPart = msg.content.find(p => p.type === 'image')
    expect(imgPart).toBeDefined()
    expect(imgPart.data).toBe('base64imagedata')
  })
})

describe('runVisualVerification', () => {
  it('returns performed: false when dev server or URL is unavailable', async () => {
    const db = { getSetting: vi.fn().mockReturnValue(null) }
    const res = await runVisualVerification({ db, sessionId: 1, auditTrail: [] })
    expect(res.performed).toBe(false)
  })

  it('detects errors when web_visualize tool reports console errors', async () => {
    const mockWebViz = {
      run: vi.fn().mockResolvedValue('Page console:\nerror: Uncaught SyntaxError: Unexpected token'),
    }
    const res = await runVisualVerification({ previewUrl: 'http://localhost:3000', webViz: mockWebViz })
    expect(res.performed).toBe(true)
    expect(res.hasErrors).toBe(true)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.errors[0]).toContain('SyntaxError')
  })
})
