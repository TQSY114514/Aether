import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'
import path from 'path'
import fs from 'fs'

// memorySkillBridge lives in the Electron main tree but only touches
// `app.getPath` indirectly (via ../logger); stub both heavy deps so the module
// loads headless under vitest.
const require = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  if (request === './providerAdapter') {
    return { completeChat: async () => ({ text: '' }) }
  }
  return origLoad.apply(this, arguments)
}
const bridge = require('../electron/llm/memorySkillBridge.js')

afterAll(() => {
  Module._load = origLoad
})

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'msb-test-'))
}

describe('saveDraftSkill name extraction (ReDoS-hardened)', () => {
  it('extracts a normal frontmatter name', () => {
    const dir = makeTmpDir()
    const content = '---\nname: My Cool Skill\n---\nBody text.'
    const res = bridge.saveDraftSkill(content, dir)
    expect(res.name).toBe('my-cool-skill')
    expect(res.path).toBe(path.join(dir, 'auto-drafted', 'my-cool-skill', 'SKILL.md'))
    expect(fs.readFileSync(res.path, 'utf8')).toBe(content)
  })

  it('accepts tab separators between key and value', () => {
    const dir = makeTmpDir()
    const res = bridge.saveDraftSkill('name:\tTabbed Name\nBody', dir)
    expect(res.name).toBe('tabbed-name')
  })

  it('handles CRLF line endings (trailing \\r trimmed)', () => {
    const dir = makeTmpDir()
    const res = bridge.saveDraftSkill('name: Windows Name\r\nrest', dir)
    expect(res.name).toBe('windows-name')
  })

  it('returns quickly for pathological input (many spaces, no newline)', () => {
    const dir = makeTmpDir()
    const content = 'name:' + ' '.repeat(50000)
    const t0 = Date.now()
    const res = bridge.saveDraftSkill(content, dir)
    const elapsed = Date.now() - t0
    expect(/^draft-\d+$/.test(res.name)).toBe(true)
    // Linear behavior should finish near-instantly; generous ceiling guards CI.
    expect(elapsed).toBeLessThan(2000)
  })

  it('does not match an indented name line', () => {
    const dir = makeTmpDir()
    const res = bridge.saveDraftSkill('intro\n  name: Fake Name\nmore', dir)
    expect(/^draft-\d+$/.test(res.name)).toBe(true)
  })

  it('falls back when there is no name line', () => {
    const dir = makeTmpDir()
    const res = bridge.saveDraftSkill('just some text\nwithout frontmatter', dir)
    expect(/^draft-\d+$/.test(res.name)).toBe(true)
  })

  it('uses the first name line when several exist', () => {
    const dir = makeTmpDir()
    const res = bridge.saveDraftSkill('name: First One\nname: Second One\n', dir)
    expect(res.name).toBe('first-one')
  })

  it('returns null for empty input or missing dir', () => {
    expect(bridge.saveDraftSkill('', makeTmpDir())).toBeNull()
    expect(bridge.saveDraftSkill(null, null)).toBeNull()
  })
})
