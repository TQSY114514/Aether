// ───────────────────────────────────────────────────────────────────────────
// Codebase Analyzer — high-level repository understanding.
//
// Builds on codeUnderstanding.js (structural graph) and lspClient.js (LSP) to
// produce architecture-level insights: frameworks, entry points, data flow,
// impact analysis, and task-scoped file relevance.
//
// Persists results in the `code_analysis` table (created on demand).
// Fire-and-forget: indexAnalysis() is safe to call from any IPC handler.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const log = require('../logger')

// ─── Framework / project type detection ────────────────────────────────────

const FRAMEWORK_SIGNATURES = {
  nextjs: {
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    dependencies: ['next'],
    indicators: ['pages/', 'app/', 'src/pages/', 'src/app/'],
  },
  react: {
    dependencies: ['react', 'react-dom'],
    indicators: ['src/App.jsx', 'src/App.tsx', 'src/main.jsx', 'src/main.tsx'],
  },
  vue: {
    dependencies: ['vue'],
    indicators: ['src/App.vue', 'src/main.js'],
  },
  svelte: {
    dependencies: ['svelte'],
    indicators: ['src/App.svelte', 'svelte.config.js'],
  },
  express: {
    dependencies: ['express'],
    indicators: ['app.js', 'server.js', 'index.js'],
  },
  fastify: {
    dependencies: ['fastify'],
    indicators: ['app.js', 'server.js'],
  },
  django: {
    dependencies: ['django'],
    indicators: ['manage.py', 'settings.py', 'wsgi.py'],
  },
  flask: {
    dependencies: ['flask'],
    indicators: ['app.py', 'wsgi.py', 'application.py'],
  },
  spring: {
    dependencies: ['spring-boot-starter'],
    indicators: ['Application.java', 'Application.kt', 'application.yml'],
  },
  electron: {
    dependencies: ['electron'],
    indicators: ['electron/main.js', 'electron/main.ts', 'package.json'],
  },
  tauri: {
    dependencies: ['tauri'],
    indicators: ['tauri.conf.json', 'src-tauri/'],
  },
  vite: {
    files: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
    dependencies: ['vite'],
  },
  astro: {
    dependencies: ['astro'],
    indicators: ['astro.config.mjs', 'astro.config.ts'],
  },
}

function detectFrameworks(rootDir) {
  const results = []
  try {
    const pkgPath = path.join(rootDir, 'package.json')
    let pkg = null
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch {}
    const allDeps = new Set([
      ...Object.keys(pkg?.dependencies || {}),
      ...Object.keys(pkg?.devDependencies || {}),
      ...Object.keys(pkg?.peerDependencies || {}),
    ])

    for (const [fw, sig] of Object.entries(FRAMEWORK_SIGNATURES)) {
      let score = 0
      if (sig.dependencies?.some((d) => allDeps.has(d))) score += 2
      if (sig.files?.some((f) => fs.existsSync(path.join(rootDir, f)))) score += 3
      if (sig.indicators?.some((i) => fs.existsSync(path.join(rootDir, i)))) score += 1
      if (score >= 2) results.push({ framework: fw, confidence: Math.min(score / 4, 1) })
    }
  } catch {}
  return results.sort((a, b) => b.confidence - a.confidence)
}

// ─── Entry point detection ─────────────────────────────────────────────────

function detectEntryPoints(rootDir, frameworks) {
  const entries = []
  const isNext = frameworks.some((f) => f.framework === 'nextjs')
  const isExpress = frameworks.some((f) => f.framework === 'express')
  const isElectron = frameworks.some((f) => f.framework === 'electron')

  // Next.js entries
  if (isNext) {
    for (const p of ['app/layout.tsx', 'app/layout.jsx', 'pages/_app.tsx', 'pages/_app.jsx', 'src/app/layout.tsx']) {
      if (fs.existsSync(path.join(rootDir, p))) entries.push({ type: 'nextjs-layout', file: p })
    }
  }

  // Electron entries
  if (isElectron) {
    for (const p of ['electron/main.js', 'electron/main.ts', 'electron/index.js', 'electron/index.ts']) {
      if (fs.existsSync(path.join(rootDir, p))) entries.push({ type: 'electron-main', file: p })
    }
  }

  // Express entries
  if (isExpress) {
    for (const p of ['app.js', 'server.js', 'index.js', 'src/app.js', 'src/server.js']) {
      if (fs.existsSync(path.join(rootDir, p))) entries.push({ type: 'express-entry', file: p })
    }
  }

  // Generic: look for main/index/app files
  for (const p of ['src/main.ts', 'src/main.js', 'src/index.ts', 'src/index.js', 'src/app.ts', 'src/app.js']) {
    if (fs.existsSync(path.join(rootDir, p))) entries.push({ type: 'generic-entry', file: p })
  }

  return entries
}

// ─── API route detection ───────────────────────────────────────────────────

function detectApiRoutes(rootDir, frameworks) {
  const routes = []
  const isNext = frameworks.some((f) => f.framework === 'nextjs')
  const isExpress = frameworks.some((f) => f.framework === 'express')
  const isFastify = frameworks.some((f) => f.framework === 'fastify')

  if (isNext) {
    // Next.js app router: app/api/**/route.ts
    const apiDir = path.join(rootDir, 'app', 'api')
    if (fs.existsSync(apiDir)) {
      try {
        const walk = (dir) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) walk(full)
            else if (e.name === 'route.ts' || e.name === 'route.js') {
              const rel = path.relative(rootDir, full).replace(/\\/g, '/')
              const routePath = rel.replace(/^app\/api\//, '').replace(/\/route\.(ts|js)$/, '')
              routes.push({ type: 'nextjs-api', path: `/${routePath}`, file: rel })
            }
          }
        }
        walk(apiDir)
      } catch {}
    }
  }

  if (isExpress || isFastify) {
    // Look for router files
    for (const p of ['src/routes.js', 'src/routes.ts', 'routes/index.js', 'src/controllers']) {
      const full = path.join(rootDir, p)
      if (fs.existsSync(full)) {
        routes.push({ type: 'express-router', file: p })
      }
    }
  }

  return routes
}

// ─── Data model detection ──────────────────────────────────────────────────

function detectDataModels(rootDir, frameworks) {
  const models = []
  const isNext = frameworks.some((f) => f.framework === 'nextjs')

  // Prisma
  const prismaDir = path.join(rootDir, 'prisma')
  if (fs.existsSync(prismaDir)) {
    for (const e of fs.readdirSync(prismaDir)) {
      if (e.endsWith('.schema')) models.push({ type: 'prisma', file: `prisma/${e}` })
    }
  }

  // Drizzle
  const drizzleDir = path.join(rootDir, 'drizzle')
  if (fs.existsSync(drizzleDir)) {
    models.push({ type: 'drizzle', file: 'drizzle/' })
  }

  // TypeORM / Sequelize / MikroORM
  for (const p of ['src/entities', 'src/models', 'src/database/models']) {
    if (fs.existsSync(path.join(rootDir, p))) {
      models.push({ type: 'orm-models', file: p })
    }
  }

  return models
}

// ─── Config file detection ─────────────────────────────────────────────────

function detectConfigFiles(rootDir) {
  const configs = []
  const configFiles = [
    { file: 'tsconfig.json', type: 'typescript' },
    { file: 'tailwind.config.js', type: 'tailwind' },
    { file: 'tailwind.config.ts', type: 'tailwind' },
    { file: '.env', type: 'env' },
    { file: '.env.example', type: 'env' },
    { file: 'docker-compose.yml', type: 'docker' },
    { file: 'Dockerfile', type: 'docker' },
    { file: '.github/workflows', type: 'ci' },
    { file: 'vite.config.ts', type: 'vite' },
    { file: 'vite.config.js', type: 'vite' },
    { file: 'webpack.config.js', type: 'webpack' },
    { file: 'babel.config.js', type: 'babel' },
    { file: '.eslintrc.js', type: 'eslint' },
    { file: '.prettierrc', type: 'prettier' },
  ]
  for (const { file, type } of configFiles) {
    if (fs.existsSync(path.join(rootDir, file))) configs.push({ type, file })
  }
  return configs
}

// ─── Impact analysis ───────────────────────────────────────────────────────

/**
 * Given a symbol name, find all files that depend on it (transitively).
 * Uses the structural graph from codeUnderstanding.js.
 * Returns { direct: string[], transitive: string[], total: number }.
 */
function analyzeImpact(graph, symbolName) {
  if (!graph || !symbolName) return { direct: [], transitive: [], total: 0 }
  const target = String(symbolName).toLowerCase()

  // Direct: files that reference this symbol
  const direct = new Set()
  for (const [file, info] of graph.files || []) {
    if (info.symbols?.includes(target)) direct.add(file)
  }

  // Transitive: files that import files which reference the symbol
  const transitive = new Set()
  const visited = new Set()
  const queue = [...direct]
  while (queue.length) {
    const current = queue.shift()
    if (visited.has(current)) continue
    visited.add(current)
    // Find files that import `current`
    for (const [file, info] of graph.files || []) {
      if (direct.has(file)) continue // already counted
      if (info.imports?.some((imp) => imp.toLowerCase().includes(current.toLowerCase()))) {
        transitive.add(file)
        queue.push(file)
      }
    }
  }

  return {
    direct: [...direct],
    transitive: [...transitive],
    total: direct.size + transitive.size,
  }
}

// ─── Task-scoped relevance ────────────────────────────────────────────────

/**
 * Given a task description (natural language), score each file by relevance.
 * Simple keyword overlap + structural importance (entry points, API routes
 * get a boost). Returns top N files with scores.
 */
function scoreRelevance(graph, taskDesc, topN = 20) {
  if (!graph || !taskDesc) return []
  const keywords = String(taskDesc).toLowerCase()
    .split(/[^a-z0-9_]+/).filter((w) => w.length >= 3)

  const scores = []
  for (const [file, info] of graph.files || []) {
    let score = 0
    const fileLower = file.toLowerCase()
    const content = (info.symbols || []).join(' ').toLowerCase()

    // Keyword match in file path
    for (const kw of keywords) {
      if (fileLower.includes(kw)) score += 2
      if (content.includes(kw)) score += 1
    }

    // Boost entry points and API routes
    if (fileLower.includes('route') || fileLower.includes('controller')) score *= 1.5
    if (fileLower.includes('index') || fileLower.includes('main') || fileLower.includes('app')) score *= 1.3
    if (fileLower.includes('test') || fileLower.includes('spec')) score *= 0.5

    if (score > 0) scores.push({ file, score: Math.round(score * 100) / 100 })
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, topN)
}

// ─── Analysis orchestration ────────────────────────────────────────────────

/**
 * Run full analysis on a workspace. Returns a structured summary.
 * Persists key findings into the `code_analysis` table.
 */
function analyzeCodebase(db, rootDir, options = {}) {
  if (!db || !rootDir) return null

  const frameworks = detectFrameworks(rootDir)
  const entryPoints = detectEntryPoints(rootDir, frameworks)
  const apiRoutes = detectApiRoutes(rootDir, frameworks)
  const dataModels = detectDataModels(rootDir, frameworks)
  const configs = detectConfigFiles(rootDir)

  // Build structural graph (reuse codeUnderstanding)
  let graph = null
  try {
    const cu = require('./codeUnderstanding')
    graph = cu.buildGraphUnderstanding(db, rootDir, { maxFiles: options.maxFiles || 3000 })
  } catch {}

  const analysis = {
    rootDir,
    scannedAt: new Date().toISOISOString(),
    frameworks,
    entryPoints,
    apiRoutes,
    dataModels,
    configs,
    fileCount: graph?.fileCount || 0,
    graphNodes: graph?.nodes?.length || 0,
    graphEdges: graph?.edges?.length || 0,
  }

  // Persist summary (best-effort)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS code_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_dir TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      frameworks_json TEXT,
      entry_points_json TEXT,
      api_routes_json TEXT,
      data_models_json TEXT,
      configs_json TEXT,
      file_count INTEGER DEFAULT 0,
      graph_nodes INTEGER DEFAULT 0,
      graph_edges INTEGER DEFAULT 0
    )`)
    db.prepare(`INSERT INTO code_analysis (root_dir, scanned_at, frameworks_json, entry_points_json, api_routes_json, data_models_json, configs_json, file_count, graph_nodes, graph_edges)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      rootDir,
      analysis.scannedAt,
      JSON.stringify(frameworks),
      JSON.stringify(entryPoints),
      JSON.stringify(apiRoutes),
      JSON.stringify(dataModels),
      JSON.stringify(configs),
      analysis.fileCount,
      analysis.graphNodes,
      analysis.graphEdges,
    )
  } catch (e) {
    log.warn('codebaseAnalyzer: persist failed:', e && e.message)
  }

  return analysis
}

module.exports = {
  detectFrameworks,
  detectEntryPoints,
  detectApiRoutes,
  detectDataModels,
  detectConfigFiles,
  analyzeImpact,
  scoreRelevance,
  analyzeCodebase,
}
