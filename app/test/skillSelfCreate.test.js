// ─── skillSelfCreate unit tests ─────────────────────────────────────────────
// Tests for the Task 4.2 argument-template learning: extractArgTemplate /
// generalizeArgValue generalize raw tool calls into parameterized templates,
// generateSkillBody renders a parameterized SKILL.md, recordPattern accumulates
// per-step templates, and promoteToLiveFromHabit bridges habitLearner.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Module from 'module'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'

// skillSelfCreate requires electron transitively (via ../tools/sandbox and
// ../logger), so we mock the 'electron' module before importing it.
const origLoad = Module._load
const fakeApp = { getPath: () => 'C:/Users/test/AppData/Aether' }
const req = createRequire(import.meta.url)

let WS
beforeAll(() => {
  Module._load = function (request, ...args) {
    if (request === 'electron') return { app: fakeApp }
    return origLoad.apply(this, [request, ...args])
  }
  WS = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-skill-'))
})

let ssc
let sb
beforeEach(async () => {
  delete require.cache[require.resolve('../electron/tools/sandbox')]
  delete require.cache[require.resolve('../electron/llm/skillSelfCreate')]
  // Set the workspace root on the sandbox instance skillSelfCreate actually
  // requires (via createRequire so it shares the same CJS cache), so path
  // templates are deterministic and the live-dir writes land in a temp dir.
  sb = req('../electron/tools/sandbox')
  sb.setWorkspaceRoot(WS)
  ssc = await import('../electron/llm/skillSelfCreate')
  ssc.resetPatterns()
})

describe('generalizeArgValue', () => {
  it('keeps short literal strings quoted', () => {
    expect(ssc.generalizeArgValue('edition', 'extended')).toBe('"extended"')
  })
  it('collapses long strings to a placeholder', () => {
    expect(ssc.generalizeArgValue('content', 'x'.repeat(100))).toBe('<string>')
  })
  it('keeps numbers and booleans as-is', () => {
    expect(ssc.generalizeArgValue('limit', 5)).toBe('5')
    expect(ssc.generalizeArgValue('recursive', true)).toBe('true')
  })
  it('drops null/empty values', () => {
    expect(ssc.generalizeArgValue('path', null)).toBeUndefined()
    expect(ssc.generalizeArgValue('path', '  ')).toBeUndefined()
  })
})

describe('extractArgTemplate', () => {
  it('generalizes a workspace path to <project>/&#39;', () => {
    const t = ssc.extractArgTemplate('read_file', { path: path.join(WS, 'src', '**', '*.ts') })
    expect(t).toBe('read_file({path: "<project>/src/**/*.ts"})')
  })
  it('keeps glob patterns and non-path literals', () => {
    const t = ssc.extractArgTemplate('search_files', { pattern: '**.ts', root: path.join(WS, 'src') })
    expect(t).toBe('search_files({pattern: "**.ts", root: "<project>/src"})')
  })
  it('renders the tool even with empty args', () => {
    expect(ssc.extractArgTemplate('list_dir', {})).toBe('list_dir({})')
  })
})

describe('recordPattern + generateSkillBody', () => {
  it('accumulates the most common argument template per step', () => {
    const calls = [
      [{ name: 'read_file', args: { path: path.join(WS, 'src', 'a.ts') } }, { name: 'edit_file', args: { path: path.join(WS, 'src', 'a.ts') } }],
      [{ name: 'read_file', args: { path: path.join(WS, 'src', 'a.ts') } }, { name: 'edit_file', args: { path: path.join(WS, 'src', 'a.ts') } }],
      [{ name: 'read_file', args: { path: path.join(WS, 'src', 'b.ts') } }, { name: 'edit_file', args: { path: path.join(WS, 'src', 'b.ts') } }],
    ]
    for (const c of calls) ssc.recordPattern(c)
    const pats = ssc.getPatterns()
    expect(pats).toHaveLength(1)
    expect(pats[0].count).toBe(3)
    // The most common template (a.ts, seen twice) wins over b.ts.
    expect(ssc.pickBestTemplate(pats[0].params[0])).toBe('read_file({path: "<project>/src/a.ts"})')
  })

  it('renders a parameterized SKILL.md when params are present', () => {
    const tools = ['read_file', 'edit_file']
    const params = [
      { templates: [{ template: 'read_file({path: "<project>/src/**/*.ts"})', count: 3 }] },
      { templates: [{ template: 'edit_file({path: "<project>/src/**/*.ts"})', count: 3 }] },
    ]
    const body = ssc.generateSkillBody('auto-read-edit', tools, params)
    expect(body).toContain('## Parameter template')
    expect(body).toContain('read_file({path: "<project>/src/**/*.ts"})')
    expect(body).toContain('edit_file({path: "<project>/src/**/*.ts"})')
    // Steps use the parameterized template, not a placeholder.
    expect(body).toContain('1. Call `read_file({path: "<project>/src/**/*.ts"})`')
  })

  it('falls back to a bare sequence when params are absent', () => {
    const body = ssc.generateSkillBody('x', ['read_file', 'edit_file'], null)
    expect(body).not.toContain('## Parameter template')
    expect(body).toContain('1. Call `read_file` with appropriate arguments')
  })
})

describe('promoteToLiveFromHabit', () => {
  it('promotes a matching drafted pattern and auto-applies it to the live skills dir', () => {
    ssc.recordPattern([
      { name: 'read_file', args: { path: path.join(WS, 'src', 'a.ts') } },
      { name: 'edit_file', args: { path: path.join(WS, 'src', 'a.ts') } },
    ])
    const fakeDb = { run: () => {}, allRows: () => [] }
    const promoted = ssc.promoteToLiveFromHabit(fakeDb, 'always edit carefully')
    // Tool names contain "edit" → matches token "edit".
    expect(promoted.length).toBe(1)
    const livePath = path.join(WS, '.aetherai', 'skills', promoted[0], 'SKILL.md')
    expect(fs.existsSync(livePath)).toBe(true)
  })

  it('no-ops when no habit matches', () => {
    ssc.recordPattern([
      { name: 'read_file', args: { path: path.join(WS, 'src', 'a.ts') } },
      { name: 'edit_file', args: { path: path.join(WS, 'src', 'a.ts') } },
    ])
    const fakeDb = { run: () => {}, allRows: () => [] }
    expect(ssc.promoteToLiveFromHabit(fakeDb, '完全无关')).toEqual([])
  })
})