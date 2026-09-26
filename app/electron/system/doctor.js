// ─────────────────────────────────────────────────────────────────────────────
// app/electron/system/doctor.js — System & Workspace Diagnostics
//
// Aligns Aether with Claude Code (/doctor) and OpenHands diagnostic engines.
// Performs deep health checks across:
//   1. Host & Runtime (Node, Electron, Chrome, OS, CPU, RAM)
//   2. Developer Toolchain (Git, Node, NPM, PNPM, Python, Docker, Cargo)
//   3. SQLite WAL Health (Integrity check, Journal mode, File size, Row counts)
//   4. Workspace & Git Repository (Writable check, Git branch, dirty status, config files)
//   5. Network & LLM Provider Connectivity (Probe HTTP reachability & latency)
//
// Follows AGENTS.md: Plain CommonJS, parameterized queries, non-blocking probes.
// ─────────────────────────────────────────────────────────────────────────────

const os = require('os')
const fs = require('fs')
const path = require('path')
const { runCommandSync } = require('../tools/exec')
const { nearestGitRoot } = require('../llm/checkpoints')
const { getWorkspaceRoot } = require('../tools/sandbox')

/**
 * Probe a command-line tool with a short timeout.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {{ found: boolean, version: string | null }}
 */
function probeCliTool(cmd, args = ['--version']) {
  try {
    let res = runCommandSync(cmd, args, { timeout: 2500 })
    if (!res || res.exitCode !== 0) {
      if (process.platform === 'win32') {
        res = runCommandSync('cmd.exe', ['/c', `${cmd} ${args.join(' ')}`], { timeout: 2500 })
      }
    }
    if (res && res.exitCode === 0) {
      const line = (res.stdout || '').split('\n')[0].trim()
      return { found: true, version: line || 'installed' }
    }
  } catch {}
  return { found: false, version: null }
}

/**
 * Format bytes into human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

/**
 * Probe an HTTP endpoint reachability and latency.
 * Treats any HTTP status (200, 401, 403, 404, 405) as reachable network connection.
 * @param {string} urlStr
 * @returns {Promise<{ reachable: boolean, latencyMs: number, status: number | string, error?: string }>}
 */
async function probeEndpoint(urlStr) {
  const start = Date.now()
  try {
    const parsed = new URL(urlStr)
    const probeUrl = `${parsed.protocol}//${parsed.host}`
    const probe = async (method) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      try {
        return await fetch(probeUrl, { method, signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      const res = await probe('HEAD')
      return {
        reachable: true,
        latencyMs: Date.now() - start,
        status: res.status,
      }
    } catch (headErr) {
      // Some servers reject HEAD with 405/403 or socket hangup, retry with GET
      const getRes = await probe('GET')
      return {
        reachable: true,
        latencyMs: Date.now() - start,
        status: getRes.status,
      }
    }
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      status: 'error',
      error: err && err.message ? err.message : String(err),
    }
  }
}

/**
 * Run full system, environment, DB, workspace, and provider diagnostics.
 * @param {any} db - better-sqlite3 database instance
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string|number} [options.sessionId]
 * @returns {Promise<object>} Diagnostic report
 */
async function diagnoseSystem(db, { cwd, sessionId } = {}) {
  const timestamp = new Date().toISOString()
  const checks = []

  // 1. Runtime & OS
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const memPercent = Math.round((usedMem / totalMem) * 100)

  const runtime = {
    node: process.versions.node || 'unknown',
    electron: process.versions.electron || 'headless',
    chrome: process.versions.chrome || 'N/A',
    v8: process.versions.v8 || 'N/A',
    platform: `${process.platform} (${os.type()} ${os.release()})`,
    arch: process.arch,
    cpus: `${os.cpus()?.length || 1} Cores (${os.cpus()?.[0]?.model || 'Generic'})`,
    memory: {
      total: formatBytes(totalMem),
      free: formatBytes(freeMem),
      used: formatBytes(usedMem),
      percent: memPercent,
    },
  }

  checks.push({
    category: 'runtime',
    name: 'Node & Electron Runtime',
    status: 'pass',
    message: `Node v${runtime.node}, Electron v${runtime.electron}, Arch ${runtime.arch}`,
  })

  if (memPercent > 92) {
    checks.push({
      category: 'runtime',
      name: 'Host Memory Usage',
      status: 'warn',
      message: `Memory pressure high: ${runtime.memory.used} / ${runtime.memory.total} (${memPercent}% used)`,
    })
  } else {
    checks.push({
      category: 'runtime',
      name: 'Host Memory Usage',
      status: 'pass',
      message: `${runtime.memory.used} / ${runtime.memory.total} (${memPercent}% used, ${runtime.memory.free} free)`,
    })
  }

  // 2. Developer Toolchain
  const tools = {
    git: probeCliTool('git', ['--version']),
    node: probeCliTool('node', ['--version']),
    npm: probeCliTool('npm', ['--version']),
    pnpm: probeCliTool('pnpm', ['--version']),
    python: probeCliTool('python', ['--version']),
    docker: probeCliTool('docker', ['--version']),
    cargo: probeCliTool('cargo', ['--version']),
  }

  if (!tools.python.found) {
    const py3 = probeCliTool('python3', ['--version'])
    if (py3.found) tools.python = py3
  }

  if (tools.git.found) {
    checks.push({
      category: 'tools',
      name: 'Git Version Control',
      status: 'pass',
      message: tools.git.version,
    })
  } else {
    checks.push({
      category: 'tools',
      name: 'Git Version Control',
      status: 'fail',
      message: 'Git CLI not found in PATH — checkpoint undo and auto-commit disabled',
    })
  }

  if (tools.node.found) {
    checks.push({
      category: 'tools',
      name: 'Node.js Toolchain',
      status: 'pass',
      message: `${tools.node.version} (npm: ${tools.npm.found ? tools.npm.version : 'not found'})`,
    })
  }

  if (tools.python.found) {
    checks.push({
      category: 'tools',
      name: 'Python Environment',
      status: 'pass',
      message: tools.python.version,
    })
  }

  if (tools.docker.found) {
    checks.push({
      category: 'tools',
      name: 'Docker Daemon CLI',
      status: 'pass',
      message: tools.docker.version,
    })
  }

  // 3. Database Health
  const dbHealth = {
    path: db && db.name ? db.name : ':memory:',
    size: 'unknown',
    journalMode: 'unknown',
    integrityCheck: 'unknown',
    sessionsCount: 0,
    messagesCount: 0,
    providersCount: 0,
    modelsCount: 0,
    tasksCount: 0,
    memoriesCount: 0,
  }

  if (db) {
    try {
      const dbFile = (typeof db.getDatabasePath === 'function' ? db.getDatabasePath() : null) || db.name
      if (dbFile && fs.existsSync(dbFile)) {
        dbHealth.size = formatBytes(fs.statSync(dbFile).size)
      }
      const getPragma = (param) => {
        try {
          if (typeof db.pragma === 'function') {
            const v = db.pragma(param, { simple: true })
            if (v != null) return String(v).toLowerCase()
          }
          const row = db.prepare ? db.prepare(`PRAGMA ${param}`).get() : null
          return row ? String(Object.values(row)[0] || '').toLowerCase() : 'unknown'
        } catch {
          return 'unknown'
        }
      }
      dbHealth.journalMode = getPragma('journal_mode')
      dbHealth.integrityCheck = getPragma('integrity_check')

      if (typeof db.prepare === 'function') {
        dbHealth.sessionsCount = db.prepare('SELECT count(*) as c FROM session').get()?.c || 0
        dbHealth.messagesCount = db.prepare('SELECT count(*) as c FROM message').get()?.c || 0
        dbHealth.providersCount = db.prepare('SELECT count(*) as c FROM provider WHERE enabled = 1').get()?.c || 0
        dbHealth.modelsCount = db.prepare('SELECT count(*) as c FROM model').get()?.c || 0

        try {
          dbHealth.tasksCount = db.prepare('SELECT count(*) as c FROM agent_task').get()?.c || 0
        } catch {}
        try {
          dbHealth.memoriesCount = db.prepare('SELECT count(*) as c FROM memory').get()?.c || 0
        } catch {}
      }
    } catch (e) {
      dbHealth.error = e.message
    }
  }

  if (!db) {
    checks.push({
      category: 'database',
      name: 'SQLite Database',
      status: 'pass',
      message: 'Standalone test mode (no live database attached)',
    })
  } else if (dbHealth.integrityCheck === 'ok') {
    checks.push({
      category: 'database',
      name: 'SQLite Database Integrity',
      status: 'pass',
      message: `Integrity check passed (Mode: ${dbHealth.journalMode.toUpperCase()}, Size: ${dbHealth.size})`,
    })
  } else {
    checks.push({
      category: 'database',
      name: 'SQLite Database Integrity',
      status: 'fail',
      message: `Database integrity issue detected: ${dbHealth.integrityCheck}`,
    })
  }

  if (db && dbHealth.journalMode !== 'wal') {
    checks.push({
      category: 'database',
      name: 'SQLite Journal Mode',
      status: 'warn',
      message: `Current mode is ${dbHealth.journalMode}; WAL mode recommended for concurrency`,
    })
  }

  // 4. Workspace & Git Repository
  const targetDir = cwd || (typeof getWorkspaceRoot === 'function' ? getWorkspaceRoot(sessionId) : process.cwd())
  const resolvedDir = path.resolve(targetDir)
  const dirExists = fs.existsSync(resolvedDir)

  let writable = false
  if (dirExists) {
    const testFile = path.join(resolvedDir, `.aether_doctor_test_${Date.now()}.tmp`)
    try {
      fs.writeFileSync(testFile, 'aether-doctor-probe', 'utf8')
      fs.unlinkSync(testFile)
      writable = true
    } catch {}
  }

  const gitRoot = nearestGitRoot(resolvedDir)
  let gitBranch = 'N/A'
  let gitDirtyCount = 0
  let isGit = false

  if (gitRoot) {
    isGit = true
    try {
      const bRes = runCommandSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: gitRoot })
      gitBranch = (bRes.stdout || '').trim() || 'HEAD'
      const sRes = runCommandSync('git', ['status', '--porcelain'], { cwd: gitRoot })
      gitDirtyCount = (sRes.stdout || '').trim().split('\n').filter(Boolean).length
    } catch {}
  }

  // Instruction files detection
  const detectedInstructions = []
  const instructionCandidates = [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursorrules',
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
  ]
  for (const f of instructionCandidates) {
    if (fs.existsSync(path.join(resolvedDir, f))) {
      detectedInstructions.push(f)
    }
  }

  const workspace = {
    path: resolvedDir,
    exists: dirExists,
    writable,
    isGit,
    gitRoot,
    gitBranch,
    gitDirtyCount,
    instructionFiles: detectedInstructions,
  }

  if (dirExists && writable) {
    checks.push({
      category: 'workspace',
      name: 'Workspace Access & Permissions',
      status: 'pass',
      message: `Directory accessible and writable: ${resolvedDir}`,
    })
  } else {
    checks.push({
      category: 'workspace',
      name: 'Workspace Access & Permissions',
      status: 'fail',
      message: `Workspace directory not writable or missing: ${resolvedDir}`,
    })
  }

  if (isGit) {
    checks.push({
      category: 'workspace',
      name: 'Git Repository Status',
      status: 'pass',
      message: `Branch: ${gitBranch}, Uncommitted changes: ${gitDirtyCount} files`,
    })
  } else {
    checks.push({
      category: 'workspace',
      name: 'Git Repository Status',
      status: 'warn',
      message: 'Workspace is not inside a Git repository',
    })
  }

  if (detectedInstructions.length > 0) {
    checks.push({
      category: 'workspace',
      name: 'Project Manifests & Rules',
      status: 'pass',
      message: `Detected: ${detectedInstructions.join(', ')}`,
    })
  }

  // 5. Network & LLM Provider Connectivity
  const providers = []
  if (db) {
    try {
      const rows = db.prepare('SELECT id, name, api_url, api_format FROM provider WHERE enabled = 1').all()
      for (const row of rows) {
        const probe = await probeEndpoint(row.api_url)
        providers.push({
          id: row.id,
          name: row.name,
          apiUrl: row.api_url,
          apiFormat: row.api_format,
          reachable: probe.reachable,
          latencyMs: probe.latencyMs,
          status: probe.status,
          error: probe.error,
        })
      }
    } catch {}
  }

  if (providers.length === 0) {
    checks.push({
      category: 'network',
      name: 'LLM Providers Configured',
      status: 'warn',
      message: 'No active LLM providers found in settings',
    })
  } else {
    const unreachable = providers.filter(p => !p.reachable)
    if (unreachable.length === 0) {
      const avgLatency = Math.round(providers.reduce((sum, p) => sum + p.latencyMs, 0) / providers.length)
      checks.push({
        category: 'network',
        name: 'LLM Provider Connectivity',
        status: 'pass',
        message: `${providers.length} provider(s) active & responsive (avg ping: ${avgLatency}ms)`,
      })
    } else {
      checks.push({
        category: 'network',
        name: 'LLM Provider Connectivity',
        status: 'warn',
        message: `${unreachable.length}/${providers.length} provider(s) unreachable: ${unreachable.map(p => p.name).join(', ')}`,
      })
    }
  }

  // Summary counts
  const failures = checks.filter(c => c.status === 'fail').length
  const warnings = checks.filter(c => c.status === 'warn').length
  const passes = checks.filter(c => c.status === 'pass').length
  const overallStatus = failures > 0 ? 'degraded' : warnings > 0 ? 'warning' : 'healthy'

  const report = {
    timestamp,
    overallStatus,
    summary: { total: checks.length, passes, warnings, failures },
    runtime,
    tools,
    database: dbHealth,
    workspace,
    providers,
    checks,
  }

  report.markdownReport = generateDoctorMarkdown(report)
  return report
}

/**
 * Format a diagnostic report into Markdown.
 * @param {object} report
 * @returns {string}
 */
function generateDoctorMarkdown(report) {
  const { summary, overallStatus, runtime, database, workspace, providers, checks } = report
  const statusBadge = overallStatus === 'healthy' ? '🟢 状态健康 (Healthy)' : overallStatus === 'warning' ? '🟡 存在警告 (Warning)' : '🔴 发现异常 (Degraded)'

  const lines = []
  lines.push(`### 🩺 Aether 系统与工作区体检报告 (System Doctor)`)
  lines.push(`> **诊断结果**: ${statusBadge} | 检查项: ${summary.total} (通过: ${summary.passes} | 警告: ${summary.warnings} | 失败: ${summary.failures})`)
  lines.push('')
  lines.push(`| 维度 | 检查项 | 状态 | 详情 |`)
  lines.push(`| :--- | :--- | :---: | :--- |`)

  for (const c of checks) {
    const icon = c.status === 'pass' ? '✅ 正常' : c.status === 'warn' ? '⚠️ 警告' : '❌ 失败'
    lines.push(`| ${c.category} | ${c.name} | ${icon} | ${c.message} |`)
  }

  lines.push('')
  lines.push(`#### 📊 环境指标摘要`)
  lines.push(`- **宿主环境**: ${runtime.platform} | CPU: ${runtime.cpus}`)
  lines.push(`- **运行时**: Node v${runtime.node} | Electron v${runtime.electron} | Chrome v${runtime.chrome}`)
  lines.push(`- **内存使用**: ${runtime.memory.used} / ${runtime.memory.total} (${runtime.memory.percent}% 已用, ${runtime.memory.free} 空闲)`)
  lines.push(`- **SQLite 存储**: WAL模式 (${database.journalMode.toUpperCase()}) | 文件大小: ${database.size} | 会话: ${database.sessionsCount} | 消息: ${database.messagesCount}`)
  lines.push(`- **工作区**: \`${workspace.path}\` (${workspace.isGit ? `Git 分支: ${workspace.gitBranch}, 未提交: ${workspace.gitDirtyCount} 处` : '非 Git 仓库'})`)

  if (providers.length > 0) {
    lines.push('')
    lines.push(`#### 🌐 模型服务联通性`)
    for (const p of providers) {
      const pStatus = p.reachable ? `🟢 可达 (${p.latencyMs}ms)` : `🔴 不可达 (${p.error || '连接超时'})`
      lines.push(`- **${p.name}** (\`${p.apiFormat}\`): ${pStatus}`)
    }
  }

  if (summary.failures > 0 || summary.warnings > 0) {
    lines.push('')
    lines.push(`#### 💡 调优建议`)
    if (!report.tools.git.found) {
      lines.push(`- ⚠️ 安装并配置 Git 环境变量，以便启用自动版本控制与检查点撤销功能。`)
    }
    if (database.journalMode !== 'wal') {
      lines.push(`- ⚠️ 建议将数据库切换至 WAL 模式以提升并发读写吞吐量。`)
    }
    if (!workspace.isGit) {
      lines.push(`- 💡 建议在工作区执行 \`git init\` 初始化代码版本仓库，以便支持完整的 \`/review\`、\`/commit\` 与差异审查。`)
    }
  }

  return lines.join('\n')
}

/**
 * Runner helper for IPC handler.
 * @param {any} db
 * @param {object} options
 */
async function runDoctorDiagnostics(db, options = {}) {
  return await diagnoseSystem(db, options)
}

module.exports = {
  probeCliTool,
  formatBytes,
  probeEndpoint,
  diagnoseSystem,
  generateDoctorMarkdown,
  runDoctorDiagnostics,
}
