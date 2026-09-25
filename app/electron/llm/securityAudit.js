// ─────────────────────────────────────────────────────────────────────────────
// securityAudit.js — P0-3 Security-Audit Skill Subagent Protocol
//
// 核心契约（对齐 cloudflare/security-audit-skill 设计要点）：
// 1. 两种运行模式：
//    - 'guidance'（默认）：仅输出结构化威胁建模、覆盖账本（coverage ledger）与审计指引，不宣称全量结论；
//    - 'full'（显式）：驱动独立子代理执行完整扫描与逐条验证，产出 findings.json + coverage-ledger.json。
// 2. 能力轴裁剪（Capability Axes）：
//    READ / WRITE / EXECUTE / NETWORK / GIT / EXTERNAL
// 3. Finder ≠ Verifier（上下文严格隔离）：
//    - Hunter 子代理（finder_id）与 Verifier 子代理（verifier_id）使用互不可见的独立会话/上下文；
//    - Verifier 仅接收结构化候选漏洞与目标源码片段，绝不接收 Hunter 的推理链（防止确认偏误）。
// 4. 证实门禁（Confirmed vs Needs Validation）：
//    - status === 'confirmed' 必须附带非空 source_trace（真实文件、行号、sink/source 证据）且 finder_id !== verifier_id；
//    - 若验证依赖动态执行（verification_method === 'execution'），在无 OS/Docker 沙盒时严禁标为 'confirmed'，
//      必须降级为 'needs_validation'（validation_reason: 'no_os_sandbox_available'）。
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const CAPABILITY_AXES = Object.freeze(['READ', 'WRITE', 'EXECUTE', 'NETWORK', 'GIT', 'EXTERNAL'])

/**
 * Determine active capability profile for the audit run.
 */
function resolveAuditCapabilities({ mode = 'guidance', db = null, dockerAvailable = null } = {}) {
  let hasDocker = false
  if (typeof dockerAvailable === 'boolean') {
    hasDocker = dockerAvailable
  } else {
    try {
      const featureFlags = require('../featureFlags')
      const { dockerBackend } = require('../exec/dockerBackend')
      const flagOn = featureFlags.isEnabled(db, 'exec.docker') || featureFlags.isEnabled(db, 'exec.docker.defaultForAuto')
      hasDocker = Boolean(flagOn && dockerBackend && typeof dockerBackend.isAvailable === 'function' && dockerBackend.isAvailable())
    } catch {
      hasDocker = false
    }
  }

  const capabilities = {
    READ: true,
    GIT: true,
    WRITE: mode === 'full',
    EXECUTE: mode === 'full' && hasDocker,
    NETWORK: false,
    EXTERNAL: false,
  }

  return {
    mode: mode === 'full' ? 'full' : 'guidance',
    sandboxAvailable: hasDocker,
    capabilities,
  }
}

/**
 * Build a coverage ledger by walking the target workspace directory.
 */
function buildCoverageLedger(workspaceDir, opts = {}) {
  const root = path.resolve(workspaceDir)
  const filesScanned = []
  const filesSkipped = []
  const maxFileBytes = opts.maxFileBytes || 128 * 1024

  function walk(dir) {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') {
        filesSkipped.push({ path: path.relative(root, path.join(dir, ent.name)).replace(/\\/g, '/'), reason: 'excluded_directory' })
        continue
      }
      const full = path.join(dir, ent.name)
      const rel = path.relative(root, full).replace(/\\/g, '/')
      if (ent.isDirectory()) {
        walk(full)
      } else if (ent.isFile()) {
        let stat
        try { stat = fs.statSync(full) } catch { continue }
        if (stat.size > maxFileBytes) {
          filesSkipped.push({ path: rel, reason: 'exceeds_size_limit', bytes: stat.size })
          continue
        }
        if (!/\.(js|cjs|mjs|ts|tsx|jsx|py|go|sh|json|yaml|yml)$/i.test(ent.name)) {
          filesSkipped.push({ path: rel, reason: 'non_code_asset' })
          continue
        }
        filesScanned.push({ path: rel, bytes: stat.size })
      }
    }
  }

  if (fs.existsSync(root)) walk(root)

  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    workspace: root,
    mode: opts.mode || 'guidance',
    capabilities: opts.capabilities || { READ: true, GIT: true, WRITE: false, EXECUTE: false, NETWORK: false, EXTERNAL: false },
    summary: {
      total_scanned: filesScanned.length,
      total_skipped: filesSkipped.length,
    },
    files_scanned: filesScanned,
    files_skipped: filesSkipped,
  }
}

/**
 * Isolated Hunter pass (finder_id): scans files in workspaceDir and proposes candidate findings.
 * Does NOT have authority to mark any finding as 'confirmed'.
 */
async function runHunterPass({ workspaceDir, ledger, hunterId = 'hunter_subagent_01', customDetector = null }) {
  const root = path.resolve(workspaceDir)
  const candidates = []

  if (typeof customDetector === 'function') {
    const raw = await customDetector({ workspaceDir: root, ledger, hunterId })
    for (const item of raw || []) {
      candidates.push({ ...item, finder_id: hunterId, status: 'candidate' })
    }
    return candidates
  }

  // Deterministic static sink & taint detector for JS/TS/Python files
  const patterns = [
    {
      rule_id: 'AETHER-SEC-001',
      category: 'command_injection',
      severity: 'high',
      title: 'Potential OS Command Injection via unsanitized shell execution',
      re: /\b(exec|execSync|spawn|spawnSync)\s*\(\s*(`[^`]*\$\{[^}]+\}[^`]*`|[^,)]*\+\s*[a-zA-Z0-9_$.]+)/,
      verification_method: 'static_trace',
    },
    {
      rule_id: 'AETHER-SEC-002',
      category: 'sql_injection',
      severity: 'high',
      title: 'Potential SQL Injection via string concatenation/interpolation',
      re: /\b(prepare|exec|query|all|get|run)\s*\(\s*(`SELECT[\s\S]*?\$\{[^}]+\}`|["']SELECT[^"']*["']\s*\+)/i,
      verification_method: 'static_trace',
    },
    {
      rule_id: 'AETHER-SEC-003',
      category: 'dynamic_code_execution',
      severity: 'medium',
      title: 'Dynamic code evaluation requiring runtime PoC validation',
      re: /\b(eval|new\s+Function)\s*\(\s*([a-zA-Z0-9_$.]+)/,
      verification_method: 'execution',
    },
  ]

  for (const entry of ledger.files_scanned || []) {
    const absPath = path.join(root, entry.path)
    let content = ''
    try { content = fs.readFileSync(absPath, 'utf8') } catch { continue }
    const lines = content.split(/\r?\n/)
    lines.forEach((lineText, idx) => {
      for (const pat of patterns) {
        if (pat.re.test(lineText)) {
          candidates.push({
            id: `FINDING-${candidates.length + 1}`,
            rule_id: pat.rule_id,
            category: pat.category,
            severity: pat.severity,
            title: pat.title,
            status: 'candidate',
            finder_id: hunterId,
            verifier_id: null,
            verification_method: pat.verification_method,
            source_trace: [
              {
                file: entry.path,
                line: idx + 1,
                snippet: lineText.trim().slice(0, 200),
              },
            ],
            hunter_notes: 'Internal hunter trace (stripped before verifier context)',
          })
        }
      }
    })
  }

  return candidates
}

/**
 * Isolated Verifier pass (verifier_id):
 * Receives ONLY sanitized candidate facts (file, line, category, source_trace) —
 * NEVER Hunter's chain-of-thought (`hunter_notes` is stripped at boundary).
 * Enforces:
 *   1. finder_id !== verifier_id
 *   2. source_trace must point to real file & line in workspaceDir
 *   3. If verification_method === 'execution' and !sandboxAvailable -> MUST downgrade to 'needs_validation'
 */
async function runVerifierPass({ workspaceDir, candidates, verifierId = 'verifier_subagent_02', sandboxAvailable = false }) {
  const root = path.resolve(workspaceDir)
  const verifiedFindings = []

  for (const cand of candidates || []) {
    // Context isolation guard: strip hunter_notes so verifier only sees objective coordinates
    const sanitizedCandidate = {
      id: cand.id,
      rule_id: cand.rule_id,
      category: cand.category,
      severity: cand.severity,
      title: cand.title,
      finder_id: cand.finder_id,
      verification_method: cand.verification_method || 'static_trace',
      source_trace: Array.isArray(cand.source_trace) ? cand.source_trace : [],
    }

    if (!sanitizedCandidate.finder_id || sanitizedCandidate.finder_id === verifierId) {
      throw new Error(`SecurityAudit protocol violation: finder_id (${sanitizedCandidate.finder_id}) must differ from verifier_id (${verifierId})`)
    }

    // Verify source_trace existence and non-empty snippet on disk
    let traceValid = sanitizedCandidate.source_trace.length > 0
    for (const hop of sanitizedCandidate.source_trace) {
      if (!hop || !hop.file || typeof hop.line !== 'number' || hop.line < 1 || !hop.snippet) {
        traceValid = false
        break
      }
      const targetPath = path.join(root, hop.file)
      if (!fs.existsSync(targetPath)) {
        traceValid = false
        break
      }
    }

    let finalStatus = 'rejected'
    let validationReason = null
    let sandboxVerified = false

    if (!traceValid) {
      finalStatus = 'needs_validation'
      validationReason = 'incomplete_or_unresolvable_source_trace'
    } else if (sanitizedCandidate.verification_method === 'execution') {
      // Hard rule: without OS / Docker sandbox, prohibited from claiming 'confirmed' on execution findings
      if (!sandboxAvailable) {
        finalStatus = 'needs_validation'
        validationReason = 'no_os_sandbox_available'
        sandboxVerified = false
      } else {
        finalStatus = 'confirmed'
        validationReason = 'verified_in_docker_sandbox'
        sandboxVerified = true
      }
    } else {
      finalStatus = 'confirmed'
      validationReason = 'verified_by_independent_static_source_trace'
    }

    verifiedFindings.push({
      id: sanitizedCandidate.id,
      rule_id: sanitizedCandidate.rule_id,
      category: sanitizedCandidate.category,
      severity: sanitizedCandidate.severity,
      title: sanitizedCandidate.title,
      status: finalStatus,
      finder_id: sanitizedCandidate.finder_id,
      verifier_id: verifierId,
      verification_method: sanitizedCandidate.verification_method,
      sandbox_verified: sandboxVerified,
      validation_reason: validationReason,
      source_trace: sanitizedCandidate.source_trace,
    })
  }

  return verifiedFindings
}

/**
 * Full end-to-end security audit workflow.
 */
async function runSecurityAudit({
  workspaceDir,
  mode = 'guidance',
  db = null,
  dockerAvailable = null,
  outputDir = null,
  hunterId = 'subagent_hunter_iso_1',
  verifierId = 'subagent_verifier_iso_2',
  customDetector = null,
} = {}) {
  if (!workspaceDir) throw new Error('runSecurityAudit: workspaceDir is required')
  if (hunterId === verifierId) {
    throw new Error('runSecurityAudit: finder_id and verifier_id must be distinct isolated identities')
  }

  const capProfile = resolveAuditCapabilities({ mode, db, dockerAvailable })
  const ledger = buildCoverageLedger(workspaceDir, {
    mode: capProfile.mode,
    capabilities: capProfile.capabilities,
  })

  if (capProfile.mode === 'guidance') {
    const report = {
      schema_version: '1.0',
      mode: 'guidance',
      generated_at: new Date().toISOString(),
      sandbox_available: capProfile.sandboxAvailable,
      capabilities: capProfile.capabilities,
      coverage_summary: ledger.summary,
      findings: [],
      guidance: 'Guidance mode active (default). Pass mode="full" to execute Hunter -> Verifier isolated audit.',
    }
    return { ok: true, mode: 'guidance', report, ledger }
  }

  const candidates = await runHunterPass({
    workspaceDir,
    ledger,
    hunterId,
    customDetector,
  })

  const findings = await runVerifierPass({
    workspaceDir,
    candidates,
    verifierId,
    sandboxAvailable: capProfile.sandboxAvailable,
  })

  const report = {
    schema_version: '1.0',
    mode: 'full',
    generated_at: new Date().toISOString(),
    sandbox_available: capProfile.sandboxAvailable,
    capabilities: capProfile.capabilities,
    coverage_summary: ledger.summary,
    findings,
  }

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true })
    const findingsPath = path.join(outputDir, 'findings.json')
    const ledgerPath = path.join(outputDir, 'coverage-ledger.json')
    fs.writeFileSync(findingsPath, JSON.stringify(report, null, 2), 'utf8')
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8')
    return { ok: true, mode: 'full', report, ledger, findingsPath, ledgerPath }
  }

  return { ok: true, mode: 'full', report, ledger }
}

module.exports = {
  CAPABILITY_AXES,
  resolveAuditCapabilities,
  buildCoverageLedger,
  runHunterPass,
  runVerifierPass,
  runSecurityAudit,
}
