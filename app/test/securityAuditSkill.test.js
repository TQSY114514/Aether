// ─────────────────────────────────────────────────────────────────────────────
// securityAuditSkill.test.js — P0-3 Security-Audit Skill & Finder != Verifier Tests
//
// 验收覆盖：
// 1. GitHub / URL 技能导入（resolveSkillSourceUrl + importSkillFromUrl）。
// 2. 内置精选包 app/skills/security-audit（22 文件：SKILL.md + 2 schemas + 2 validators + 17 references）。
// 3. Guidance 默认模式 vs Full 显式模式。
// 4. Hunter 与 Verifier 上下文隔离（finder_id !== verifier_id，剥离 hunter_notes）。
// 5. 无 OS/Docker 沙盒时禁止把 verification_method='execution' 写成 confirmed（强制降级为 needs_validation）。
// 6. 对 app/evals/fixtures/mini-vuln-repo 跑端到端产出 findings.json 并通过 validate-findings.cjs 与 validate-coverage-ledger.cjs。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'

const require = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  return origLoad.apply(this, arguments)
}

const skills = require('../electron/llm/skills')
const { runSecurityAudit } = require('../electron/llm/securityAudit')
const { validateFindingsObject } = require('../skills/security-audit/scripts/validate-findings.cjs')
const { validateCoverageLedgerObject } = require('../skills/security-audit/scripts/validate-coverage-ledger.cjs')

afterAll(() => {
  Module._load = origLoad
})

describe('P0-3: GitHub / URL Skill Importer & Built-in security-audit Bundle', () => {
  it('discovers built-in security-audit skill with all 22 curated files', () => {
    skills.scanSkills()
    const s = skills.getSkill('security-audit')
    expect(s).toBeTruthy()
    expect(s.name).toBe('security-audit')
    expect(s.permissions).toEqual(expect.arrayContaining(['read', 'write', 'execute', 'git']))

    const base = s.baseDir
    const refs = fs.readdirSync(path.join(base, 'references'))
    const schemas = fs.readdirSync(path.join(base, 'schemas'))
    const scripts = fs.readdirSync(path.join(base, 'scripts'))
    expect(1 + refs.length + schemas.length + scripts.length).toBe(22)
  })

  it('resolves and imports skills from GitHub shorthand and HTTPS URLs', async () => {
    const gh = skills.resolveSkillSourceUrl('cloudflare/security-audit-skill')
    expect(gh.kind).toBe('github')
    expect(gh.rawSkillUrl).toBe('https://raw.githubusercontent.com/cloudflare/security-audit-skill/main/SKILL.md')

    const tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-skill-import-'))
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '---\nname: custom-remote-audit\ndescription: Remote imported security skill\npermissions: read\n---\n# Remote Skill Body\n',
    })

    const res = await skills.importSkillFromUrl('cloudflare/security-audit-skill', {
      fetch: fakeFetch,
      targetRoot: tmpTarget,
    })
    expect(res.ok).toBe(true)
    expect(res.name).toBe('custom-remote-audit')
    expect(fs.existsSync(res.filePath)).toBe(true)
  })
})

describe('P0-3: End-to-End Security Audit on app/evals/fixtures/mini-vuln-repo', () => {
  const fixtureDir = path.resolve(__dirname, '../evals/fixtures/mini-vuln-repo')
  const validateFindingsScript = path.resolve(__dirname, '../skills/security-audit/scripts/validate-findings.cjs')
  const validateLedgerScript = path.resolve(__dirname, '../skills/security-audit/scripts/validate-coverage-ledger.cjs')

  it('defaults to Guidance mode without claiming confirmed findings', async () => {
    const res = await runSecurityAudit({ workspaceDir: fixtureDir })
    expect(res.ok).toBe(true)
    expect(res.mode).toBe('guidance')
    expect(res.report.findings).toEqual([])
    expect(res.ledger.summary.total_scanned).toBeGreaterThanOrEqual(2)
  })

  it('runs Full audit mode (no OS sandbox), enforces finder != verifier and downgrades execution findings to needs_validation, and passes validate-findings.cjs CLI', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-audit-out-'))
    const res = await runSecurityAudit({
      workspaceDir: fixtureDir,
      mode: 'full',
      dockerAvailable: false,
      outputDir: outDir,
    })

    expect(res.ok).toBe(true)
    expect(fs.existsSync(res.findingsPath)).toBe(true)
    expect(fs.existsSync(res.ledgerPath)).toBe(true)

    const findingsDoc = JSON.parse(fs.readFileSync(res.findingsPath, 'utf8'))
    const ledgerDoc = JSON.parse(fs.readFileSync(res.ledgerPath, 'utf8'))

    // 1. Validate with programmatic validator
    expect(validateFindingsObject(findingsDoc).ok).toBe(true)
    expect(validateCoverageLedgerObject(ledgerDoc).ok).toBe(true)

    // 2. Validate by executing the standalone .cjs validator scripts
    const cliFindingsOut = execFileSync(process.execPath, [validateFindingsScript, res.findingsPath], { encoding: 'utf8' })
    const cliLedgerOut = execFileSync(process.execPath, [validateLedgerScript, res.ledgerPath], { encoding: 'utf8' })
    expect(cliFindingsOut).toContain('OK: findings.json passed')
    expect(cliLedgerOut).toContain('OK: coverage-ledger.json passed')

    // 3. Verify protocol invariants on the findings
    expect(findingsDoc.findings.length).toBe(3)
    for (const f of findingsDoc.findings) {
      expect(f.finder_id).toBeTruthy()
      expect(f.verifier_id).toBeTruthy()
      expect(f.finder_id).not.toBe(f.verifier_id)
      expect(f.hunter_notes).toBeUndefined() // Context isolation: stripped before Verifier
      expect(f.source_trace.length).toBeGreaterThan(0)
    }

    // Static trace findings -> confirmed
    const cmdInj = findingsDoc.findings.find(f => f.category === 'command_injection')
    const sqlInj = findingsDoc.findings.find(f => f.category === 'sql_injection')
    expect(cmdInj.status).toBe('confirmed')
    expect(sqlInj.status).toBe('confirmed')

    // Dynamic execution finding without OS/Docker sandbox -> MUST be needs_validation, NEVER confirmed
    const dynExec = findingsDoc.findings.find(f => f.category === 'dynamic_code_execution')
    expect(dynExec.verification_method).toBe('execution')
    expect(dynExec.status).toBe('needs_validation')
    expect(dynExec.validation_reason).toBe('no_os_sandbox_available')
    expect(dynExec.sandbox_verified).toBe(false)
  })

  it('allows execution finding to reach confirmed ONLY when Docker sandbox is available', async () => {
    const res = await runSecurityAudit({
      workspaceDir: fixtureDir,
      mode: 'full',
      dockerAvailable: true,
    })
    const dynExec = res.report.findings.find(f => f.category === 'dynamic_code_execution')
    expect(dynExec.status).toBe('confirmed')
    expect(dynExec.sandbox_verified).toBe(true)
    expect(validateFindingsObject(res.report).ok).toBe(true)
  })

  it('rejects identical hunterId and verifierId (finder != verifier enforcement)', async () => {
    await expect(
      runSecurityAudit({
        workspaceDir: fixtureDir,
        mode: 'full',
        hunterId: 'same_agent',
        verifierId: 'same_agent',
      })
    ).rejects.toThrow(/must be distinct/i)
  })
})
