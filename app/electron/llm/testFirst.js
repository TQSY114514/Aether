// ───────────────────────────────────────────────────────────────────────────
// Test-first (RED→GREEN) workflow orchestrator.
//
// A standalone module that drives a model through a test-first loop:
//   1. Determine the workspace root + test framework (reuses lintTestRepair).
//      If there is NO test command, return { skipped: true, reason: ... } so
//      the caller can fall back to debug_loop (B2).
//   2. RED: ask the model to WRITE a minimal failing test file.
//   3. Run the test command and confirm it fails (RED).
//   4. GREEN: ask the model to write the implementation to make it pass,
//      feeding it the test content + the failing output.
//   5. Re-run the test command; repeat up to MAX_FIX_CYCLES on failure.
//
// testFirst is a plain orchestrator, NOT a tool — it talks to the model via
// providerAdapter.completeChatMessage and writes files directly (guarded by the
// sandbox write-path check). It never throws: every exit returns a structured
// result object so the caller can fall back gracefully.
//
// Safety: writes are sandbox-checked and scoped to the workspace root; commands
// run through lintTestRepair.runOne (which applies the sandbox command guard).
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot, checkWritePath } = require('../tools/sandbox')
const lintTestRepair = require('./lintTestRepair')
const { completeChatMessage } = require('./providerAdapter')

const MAX_FIX_CYCLES = 3
const RUN_TIMEOUT_MS = 60000
const MAX_OUTPUT = 6000

// Suggest a sensible test path for a project type. The model may override it.
function suggestTestPath(root, projectType) {
  switch (projectType) {
    case 'node': {
      // TypeScript projects conventionally use .test.ts; detect via tsconfig.json.
      const isTS = fs.existsSync(path.join(root, 'tsconfig.json'))
      return path.join(root, 'test', isTS ? 'test_first_tmp.test.ts' : 'test_first_tmp.test.js')
    }
    case 'python': return path.join(root, 'test', 'test_first_tmp.py')
    case 'rust': return path.join(root, 'tests', 'test_first_tmp.rs')
    case 'go': return path.join(root, 'test_first_tmp_test.go')
    case 'java': return path.join(root, 'src', 'test', 'java', 'TestFirstTmp.java')
    default: return path.join(root, 'test', 'test_first_tmp')
  }
}

// Parse a model response into a list of { path, content }. Accepts a JSON array
// of files, optionally wrapped in a markdown fence, an object with a `files`
// key, or a bare { path, content } object. Returns [] on any parse failure.
function parseFileList(text) {
  const s = String(text || '')
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fence ? fence[1] : s).trim()
  if (!candidate) return []
  // Isolate the outermost JSON array or object.
  const isArr = candidate.startsWith('[')
  const blob = isArr
    ? (candidate.match(/\[[\s\S]*\]/) || [''])[0]
    : (candidate.match(/\{[\s\S]*\}/) || [''])[0]
  if (!blob) return []
  try {
    const parsed = JSON.parse(blob)
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.files) ? parsed.files : [parsed])
    return arr.filter(f => f && typeof f.path === 'string' && typeof f.content === 'string')
  } catch {
    return []
  }
}

// Ask the model for a set of files. Returns { files } or { error }.
async function askModelForFiles({ provider, model, signal, systemPrompt, userPrompt }) {
  let res
  try {
    res = await completeChatMessage({
      provider, model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      signal,
      options: { max_tokens: 8192, temperature: 0.2 },
    })
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) }
  }
  const content = (res && (res.content || res.text)) || ''
  const files = parseFileList(content)
  if (!files.length) return { error: 'model returned no parseable files' }
  return { files }
}

// Write files into the workspace, sandbox-checked. `skip` is a set of absolute
// paths to leave untouched (e.g. the RED test file must not be overwritten
// during GREEN). Returns the list of written entries.
function writeFiles(root, files, sessionId, skip) {
  const written = []
  for (const f of files) {
    const target = path.isAbsolute(f.path) ? f.path : path.join(root, f.path)
    if (skip && skip.has(path.normalize(target))) {
      written.push({ path: f.path, skipped: true })
      continue
    }
    const guard = checkWritePath(target, sessionId)
    if (!guard.ok) {
      written.push({ path: f.path, error: guard.reason })
      continue
    }
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, f.content, 'utf-8')
      written.push({ path: f.path, ok: true })
    } catch (e) {
      written.push({ path: f.path, error: e && e.message ? e.message : String(e) })
    }
  }
  return written
}

function describeFiles(files) {
  return files.map(f => `### ${f.path}\n\`\`\`\n${String(f.content).slice(0, 4000)}\n\`\`\``).join('\n\n')
}

// Main entry: run the RED→GREEN test-first loop. Never throws.
// Returns: { skipped?, success, cycles, summary, reason?, error? }
async function runTestFirst({ provider, model, signal, sessionId, db, onStatus, goal }) {
  const status = (text) => { try { onStatus?.({ kind: 'test_first', text }) } catch {} }

  try {
    const root = getWorkspaceRoot(sessionId)
    if (!root) return { skipped: true, success: false, cycles: 0, summary: '', reason: 'no workspace root' }

    const projectType = lintTestRepair.detectProjectType(root)
    const testCmd = lintTestRepair.resolveTestCommand(db, root, projectType)
    if (!testCmd) return { skipped: true, success: false, cycles: 0, summary: '', reason: 'no test framework' }

    const testPath = suggestTestPath(root, projectType)
    const skipPaths = new Set()

    // ── RED: write a failing test ───────────────────────────────────────────
    status(`🔴 RED: 让模型编写失败测试 (${path.relative(root, testPath) || path.basename(testPath)})...`)
    const red = await askModelForFiles({
      provider, model, signal,
      systemPrompt: 'You are a test-first software engineer. Write a minimal, focused FAILING test for the requested feature. The test must currently fail (RED) because the implementation does not exist yet. Return ONLY a JSON array of files: [{"path": "<relative path>", "content": "<file source>"}]. No markdown outside the JSON.',
      userPrompt: `Workspace root: ${root}\nProject type: ${projectType}\nTest run command: ${testCmd}\n\nSuggested test file path (you may use it or choose your own): ${testPath}\n\nGoal: ${goal}\n\nWrite the failing test file(s) now. They should fail when run.`,
    })
    if (red.error) return { skipped: false, success: false, cycles: 0, summary: '', error: `RED failed: ${red.error}` }
    const redWritten = writeFiles(root, red.files, sessionId)
    for (const w of redWritten) if (w.ok || w.error) skipPaths.add(path.normalize(path.isAbsolute(w.path) ? w.path : path.join(root, w.path)))

    let lastRun
    try { lastRun = await lintTestRepair.runOne(testCmd, root, RUN_TIMEOUT_MS) }
    catch (e) { return { skipped: false, success: false, cycles: 0, summary: '', error: `test command failed to run: ${e.message}` } }
    // RED stage passed unexpectedly (implementation likely already exists) — no
    // point forcing a GREEN round against an already-green project.
    if (lastRun.ok) return { skipped: false, success: true, cycles: 0, summary: '测试已在 RED 阶段通过（实现可能已存在）' }

    // ── GREEN: implement until the test passes ──────────────────────────────
    let cycles = 0
    let lastError = lastRun.output || '(no output)'
    while (cycles < MAX_FIX_CYCLES) {
      cycles++
      status(`🟢 GREEN (${cycles}/${MAX_FIX_CYCLES}): 让模型编写实现...`)
      const green = await askModelForFiles({
        provider, model, signal,
        systemPrompt: 'You are a test-first software engineer. Implement the feature so the given failing test passes. You may add or modify implementation files but must NOT change the test file(s). Return ONLY a JSON array of files: [{"path": "<relative path>", "content": "<file source>"}]. No markdown outside the JSON.',
        userPrompt: `Workspace root: ${root}\nProject type: ${projectType}\nTest command: ${testCmd}\n\nGoal: ${goal}\n\nTest file(s) (already written):\n${describeFiles(red.files)}\n\nLatest test output:\n\`\`\`\n${String(lastError).slice(0, MAX_OUTPUT)}\n\`\`\`\n\nWrite the implementation files to make the test pass. Do not modify the test file(s).`,
      })
      if (green.error) return { skipped: false, success: false, cycles, summary: '', error: `GREEN failed: ${green.error}` }
      writeFiles(root, green.files, sessionId, skipPaths)
      try { lastRun = await lintTestRepair.runOne(testCmd, root, RUN_TIMEOUT_MS) }
      catch (e) { return { skipped: false, success: false, cycles, summary: '', error: `test command failed to run: ${e.message}` } }
      if (lastRun.ok) return { skipped: false, success: true, cycles, summary: `测试通过 (${cycles} 轮)` }
      lastError = lastRun.output || '(no output)'
      status(`🔁 测试仍失败 (${cycles}/${MAX_FIX_CYCLES})`)
    }

    return { skipped: false, success: false, cycles, summary: `达到最大修复轮数 (${MAX_FIX_CYCLES})`, error: String(lastError).slice(0, 500) }
  } catch (e) {
    return { skipped: false, success: false, cycles: 0, summary: '', error: e && e.message ? e.message : String(e) }
  }
}

module.exports = {
  runTestFirst,
  MAX_FIX_CYCLES,
  suggestTestPath,
  parseFileList,
  writeFiles,
}