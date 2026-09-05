import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  loadProjectConfig,
  invalidateProjectConfigCache,
  isToolAllowed,
  isPathIgnored,
  getProjectRules,
} from '../electron/config/projectConfig.js'
import { setWorkspaceRoot, checkWritePath } from '../electron/tools/sandbox.js'

describe('Config-as-Code .aether/config.json (P1-10)', () => {
  let tmpDir = null

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-cfg-test-'))
    invalidateProjectConfigCache()
    setWorkspaceRoot(tmpDir)
  })

  afterEach(() => {
    invalidateProjectConfigCache()
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns default empty config when no config file exists', () => {
    const cfg = loadProjectConfig(tmpDir)
    expect(cfg.defaultModel).toBeNull()
    expect(cfg.mode).toBeNull()
    expect(cfg.shadowWorkspace).toBeNull()
    expect(cfg.tools.deny).toEqual([])
    expect(cfg.tools.allow).toEqual([])
    expect(cfg.ignorePatterns).toEqual([])
    expect(cfg.rules).toEqual([])
  })

  it('loads .aether/config.json correctly', () => {
    const aetherDir = path.join(tmpDir, '.aether')
    fs.mkdirSync(aetherDir, { recursive: true })
    const configData = {
      defaultModel: 'claude-3-7-sonnet',
      mode: 'auto',
      shadowWorkspace: true,
      tools: {
        deny: ['run_command'],
        allow: ['read_file', 'edit_file'],
      },
      ignorePatterns: ['*.pem', 'confidential/**'],
      rules: ['Always write unit tests', 'Do not modify lockfiles'],
    }
    fs.writeFileSync(path.join(aetherDir, 'config.json'), JSON.stringify(configData), 'utf8')
    invalidateProjectConfigCache(tmpDir)

    const cfg = loadProjectConfig(tmpDir)
    expect(cfg.defaultModel).toBe('claude-3-7-sonnet')
    expect(cfg.mode).toBe('auto')
    expect(cfg.shadowWorkspace).toBe(true)
    expect(cfg.tools.deny).toContain('run_command')
    expect(cfg.tools.allow).toContain('read_file')
    expect(cfg.ignorePatterns).toContain('*.pem')
    expect(cfg.rules.length).toBe(2)
  })

  it('enforces tool deny and allow lists', () => {
    const aetherDir = path.join(tmpDir, '.aether')
    fs.mkdirSync(aetherDir, { recursive: true })
    const configData = {
      tools: {
        deny: ['run_command', 'git_push'],
        allow: ['read_file', 'edit_file'],
      },
    }
    fs.writeFileSync(path.join(aetherDir, 'config.json'), JSON.stringify(configData), 'utf8')
    invalidateProjectConfigCache(tmpDir)

    // Denied tool
    const check1 = isToolAllowed('run_command', tmpDir)
    expect(check1.allowed).toBe(false)
    expect(check1.reason).toContain('deny list')

    // Allowed tool
    const check2 = isToolAllowed('read_file', tmpDir)
    expect(check2.allowed).toBe(true)

    // Not in allow list
    const check3 = isToolAllowed('web_search', tmpDir)
    expect(check3.allowed).toBe(false)
    expect(check3.reason).toContain('allow list')
  })

  it('matches ignore patterns for file paths', () => {
    const aetherDir = path.join(tmpDir, '.aether')
    fs.mkdirSync(aetherDir, { recursive: true })
    const configData = {
      ignorePatterns: ['*.key', 'secrets/*', 'private/**'],
    }
    fs.writeFileSync(path.join(aetherDir, 'config.json'), JSON.stringify(configData), 'utf8')
    invalidateProjectConfigCache(tmpDir)

    expect(isPathIgnored(path.join(tmpDir, 'server.key'), tmpDir)).toBe(true)
    expect(isPathIgnored(path.join(tmpDir, 'secrets', 'db.json'), tmpDir)).toBe(true)
    expect(isPathIgnored(path.join(tmpDir, 'src', 'index.ts'), tmpDir)).toBe(false)
  })

  it('resolves rule files when rule specifies a markdown path', () => {
    const aetherDir = path.join(tmpDir, '.aether')
    fs.mkdirSync(aetherDir, { recursive: true })
    const docsDir = path.join(tmpDir, 'docs')
    fs.mkdirSync(docsDir, { recursive: true })

    fs.writeFileSync(path.join(docsDir, 'coding-standards.md'), 'Use functional React components only', 'utf8')

    const configData = {
      rules: [
        'Inline rule 1',
        'docs/coding-standards.md',
      ],
    }
    fs.writeFileSync(path.join(aetherDir, 'config.json'), JSON.stringify(configData), 'utf8')
    invalidateProjectConfigCache(tmpDir)

    const rules = getProjectRules(tmpDir)
    expect(rules).toContain('Inline rule 1')
    expect(rules).toContain('Use functional React components only')
  })

  it('integrates with sandbox checkWritePath to block ignored files', () => {
    const aetherDir = path.join(tmpDir, '.aether')
    fs.mkdirSync(aetherDir, { recursive: true })
    const configData = {
      ignorePatterns: ['production.env', 'private/**'],
    }
    fs.writeFileSync(path.join(aetherDir, 'config.json'), JSON.stringify(configData), 'utf8')
    invalidateProjectConfigCache(tmpDir)

    const check1 = checkWritePath(path.join(tmpDir, 'production.env'))
    expect(check1.ok).toBe(false)
    expect(check1.reason).toContain('ignorePatterns')

    const check2 = checkWritePath(path.join(tmpDir, 'normal.txt'))
    expect(check2.ok).toBe(true)
  })
})
