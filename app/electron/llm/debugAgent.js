// ───────────────────────────────────────────────────────────────────────────
// Debug Agent — automatic fix loop for coding workflows.
//
// Inspired by Claude Code: after the model writes code, verify by running the
// project's test command, feed errors back for a fix attempt. Repeat until
// green or cycle limit.
//
// Flow: run test → exit 0? done → capture errors → analyze → suggest fix →
//       re-run tests → repeat (max 5 cycles)
//
// Safety: workspace-scoped, timeout per cycle, sandbox command check.
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')

const MAX_CYCLES = 5
const TEST_TIMEOUT_MS = 30000
const ANALYSIS_TIMEOUT_MS = 15000
const MAX_ERROR_OUTPUT = 8000

const TEST_COMMANDS = {
  node:    ['npm test', 'npm run test'],
  python:  ['pytest', 'python -m pytest', 'python -m unittest discover'],
  rust:    ['cargo test'],
  go:      ['go test ./...'],
  java:    ['mvn test', 'gradle test'],
}

function detectProjectType(rootDir) {
  try {
    const fs = require('fs'), path = require('path')
    if (fs.existsSync(path.join(rootDir, 'package.json'))) return 'node'
    if (fs.existsSync(path.join(rootDir, 'requirements.txt')) || fs.existsSync(path.join(rootDir, 'pyproject.toml'))) return 'python'
    if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) return 'rust'
    if (fs.existsSync(path.join(rootDir, 'go.mod'))) return 'go'
    if (fs.existsSync(path.join(rootDir, 'pom.xml')) || fs.existsSync(path.join(rootDir, 'build.gradle'))) return 'java'
  } catch {}
  return null
}

function findTestCommand(projectType, rootDir) {
  try {
    const fs = require('fs'), path = require('path')
    for (const cmd of (TEST_COMMANDS[projectType] || [])) {
      if (projectType === 'node') {
        const pkgPath = path.join(rootDir, 'package.json')
        if (fs.existsSync(pkgPath)) {
          if (!JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts?.test) continue
        }
      }
      try { require.resolve(cmd.split(/\s+/)[0]) } catch { continue }
      return cmd
    }
  } catch {}
  return null
}

function runCommand(cmd, cwd, timeoutMs) {
  const { exec } = require('child_process')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ exitCode: -1, stdout: '', stderr: 'timeout', timedOut: true }), timeoutMs)
    exec(cmd, { cwd, maxBuffer: 64 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      clearTimeout(timer)
      resolve({
        exitCode: err?.code ? err.code : 0,
        stdout: (stdout || '').slice(0, MAX_ERROR_OUTPUT),
        stderr: (stderr || '').slice(0, MAX_ERROR_OUTPUT),
        timedOut: false,
      })
    })
  })
}

// Main entry: run the debug loop.
// Args: { provider, model, signal, sessionId, userMessage?, onStatus, onFix }
// Returns: { success, cycles, finalError?, summary, cycleResults, analysis? }
async function runDebugLoop({ provider, model, signal, sessionId, userMessage, onStatus, onFix }) {
  const { getWorkspaceRoot, checkCommand } = require('../tools/sandbox')
  const root = getWorkspaceRoot(sessionId)
  if (!root) return { success: false, cycles: 0, error: 'no workspace configured' }

  const projectType = detectProjectType(root)
  if (!projectType) return { success: false, cycles: 0, error: 'no recognized project type (need package.json, requirements.txt, Cargo.toml, go.mod, or pom.xml)' }

  let testCmd = findTestCommand(projectType, root)
  if (!testCmd) return { success: false, cycles: 0, error: `no test command found for ${projectType} project` }
  const guard = checkCommand(testCmd)
  if (!guard.ok) return { success: false, cycles: 0, error: guard.reason }

  const cycleResults = []

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    try { onStatus?.({ kind: 'debug_cycle', text: `🔧 调试循环 ${cycle}/${MAX_CYCLES}: 运行 ${testCmd}...` }) } catch {}

    let result
    try { result = await runCommand(testCmd, root, TEST_TIMEOUT_MS) }
    catch (e) { return { success: false, cycles: cycle, error: `command failed: ${e.message}`, cycleResults } }

    if (result.exitCode === 0) return { success: true, cycles: cycle, summary: `测试通过 (${cycle} 轮)`, cycleResults }

    const errorOutput = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    if (!errorOutput) return { success: false, cycles: cycle, finalError: '测试失败但无输出', cycleResults }
    cycleResults.push({ cycle, exitCode: result.exitCode, errorSnippet: errorOutput.slice(0, 500) })

    let analysis
    try {
      onStatus?.({ kind: 'debug_analyze', text: '🔍 分析错误...' })
      analysis = await analyzeError({ provider, model, errorOutput, projectType, testCmd, cycle, maxCycles: MAX_CYCLES, signal })
    } catch (e) {
      analysis = { description: `analysis failed: ${e.message}`, fix: null }
    }
    if (!analysis.fix) return { success: false, cycles: cycle, finalError: errorOutput.slice(0, 200), cycleResults, analysis }
    try { onFix?.({ cycle, description: analysis.description, files: analysis.files }) } catch {}
  }

  return { success: false, cycles: MAX_CYCLES, finalError: `达到最大调试轮数 (${MAX_CYCLES})`, cycleResults }
}

async function analyzeError({ provider, model, errorOutput, projectType, testCmd, cycle, maxCycles, signal }) {
  const prompt = `You are debugging a ${projectType} project. The test command "${testCmd}" failed on cycle ${cycle}/${maxCycles}.

Error output:
\`\`\`
${errorOutput.slice(0, MAX_ERROR_OUTPUT)}
\`\`\`

Analyze the error and respond with ONLY a JSON object (no markdown fences):
{
  "description": "one-line summary",
  "rootCause": "brief explanation",
  "fix": "specific fix to apply (which file, what to change)",
  "files": ["list of files likely involved"],
  "confidence": "high/medium/low"
}`

  try {
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: 'You are an expert debugger. Analyze errors concisely and provide specific, actionable fixes. Always respond with valid JSON only — no markdown, no explanation outside the JSON.' },
        { role: 'user', content: prompt },
      ],
      signal,
      options: { max_tokens: 1024, temperature: 0.1 },
    })
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { description: 'parse error — model did not return JSON', fix: null }
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    return { description: `analysis failed: ${e.message}`, fix: null }
  }
}

module.exports = {
  runDebugLoop, MAX_CYCLES, TEST_TIMEOUT_MS,
  detectProjectType, findTestCommand, analyzeError,
}
