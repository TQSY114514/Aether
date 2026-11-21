import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FindingsLedger, MAX_FINDINGS, parseCitation, verifyCitation } from '../electron/llm/findingsLedger'
import { toolsPayload, getTool } from '../electron/tools/registry'
import { buildToolFilter } from '../electron/llm/agentRoles'

describe('FindingsLedger & report_finding', () => {
  let tmpRoot

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-findings-'))
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'src', 'index.js'), 'line1\nline2\nline3\nline4\n', 'utf8')
  })

  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
  })

  it('parses Windows drive paths and line ranges without misreading drive colons', () => {
    expect(parseCitation('src/index.js:2-4')).toEqual({
      filePath: 'src/index.js',
      startLine: 2,
      endLine: 4,
    })
    expect(parseCitation('D:\\Aether\\src\\index.js:3')).toEqual({
      filePath: 'D:\\Aether\\src\\index.js',
      startLine: 3,
      endLine: 3,
    })
    expect(parseCitation('D:\\Aether\\src\\index.js')).toEqual({
      filePath: 'D:\\Aether\\src\\index.js',
      startLine: null,
      endLine: null,
    })
  })

  it('verifies valid file & line citations and rejects missing files, out-of-range lines, and traversal', () => {
    expect(verifyCitation('src/index.js:1-3', tmpRoot)).toEqual({
      ok: true,
      normalizedCite: 'src/index.js:1-3',
    })

    const missing = verifyCitation('src/nope.js:1', tmpRoot)
    expect(missing.ok).toBe(false)
    expect(missing.reason).toContain('does not exist')

    const oob = verifyCitation('src/index.js:99', tmpRoot)
    expect(oob.ok).toBe(false)
    expect(oob.reason).toContain('out of range')

    const escape = verifyCitation('../outside.txt', tmpRoot)
    expect(escape.ok).toBe(false)
  })

  it('caps findings at MAX_FINDINGS', () => {
    const ledger = new FindingsLedger({ workspaceRoot: tmpRoot })
    for (let i = 0; i < MAX_FINDINGS; i++) {
      const r = ledger.add({ claim: `Finding ${i + 1}`, cites: ['src/index.js:1'] })
      expect(r.ok).toBe(true)
    }
    const overflow = ledger.add({ claim: 'One too many', cites: ['src/index.js:1'] })
    expect(overflow.ok).toBe(false)
    expect(overflow.reason).toContain('full')
  })

  it('keeps report_finding out of top-level toolsPayload unless includeExtendedLedger is set', () => {
    const topLevelNames = toolsPayload('act').map((t) => t.function.name)
    expect(topLevelNames).not.toContain('report_finding')

    const subagentNames = toolsPayload('plan', { includeExtendedLedger: true }).map((t) => t.function.name)
    expect(subagentNames).toContain('report_finding')

    expect(getTool('report_finding')?.risk).toBe('safe')
    expect(buildToolFilter('explore')).toContain('report_finding')
    expect(buildToolFilter('explorer')).toContain('report_finding')
    expect(buildToolFilter('review')).toContain('report_finding')
  })

  it('handles trailing newlines accurately without off-by-one line counts', () => {
    const fourLineDir = path.join(tmpRoot, 'src')
    fs.writeFileSync(path.join(fourLineDir, 'four.js'), 'a\nb\nc\nd\n', 'utf8')
    const ledger = new FindingsLedger({ workspaceRoot: tmpRoot })
    expect(ledger.add({ claim: 'Line 4 valid', cites: ['src/four.js:4'] }).ok).toBe(true)
    const over = ledger.add({ claim: 'Line 5 invalid', cites: ['src/four.js:5'] })
    expect(over.ok).toBe(false)

    fs.writeFileSync(path.join(fourLineDir, 'blank.js'), 'a\n\nb\n', 'utf8')
    expect(ledger.add({ claim: 'Line 3 blank trailing', cites: ['src/blank.js:3'] }).ok).toBe(true)
    expect(ledger.add({ claim: 'Line 4 invalid', cites: ['src/blank.js:4'] }).ok).toBe(false)
  })

  it('rejects report_finding when called outside subagent findingsLedger context', async () => {
    const tool = getTool('report_finding')
    await expect(tool.run({ claim: 'x', cites: ['src/index.js:1'] })).rejects.toThrow(/findingsLedger/i)
    await expect(tool.run({ claim: 'x', cites: ['src/index.js:1'] }, {})).rejects.toThrow(/findingsLedger/i)
  })
})
