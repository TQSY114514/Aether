// ─────────────────────────────────────────────────────────────────────────────
// processTap.js — Structured Crash & Failure Signal Extractor (Phase 3)
//
// Electron-free module used by run_command, localBackend, and lintTestRepair.
// Extracts high-signal error location, failure kind, and primary error line
// from noisy stdout/stderr tails so both the LLM and UI see the root cause.
// ─────────────────────────────────────────────────────────────────────────────

const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

function stripAnsi(str) {
  return String(str || '').replace(ANSI_RE, '')
}

function tailLines(text, maxLines = 40) {
  const clean = stripAnsi(text).replace(/\r\n/g, '\n')
  const lines = clean.split('\n')
  return lines.slice(-maxLines)
}

/**
 * Extract a structured crash/failure signal from a non-zero process exit.
 * @param {{ command?: string, exitCode?: number|null, stdout?: string, stderr?: string, cwd?: string }} opts
 * @returns {{ ok: boolean, exitCode: number|null, command: string, kind: string, primaryError: string, location: string|null, summary: string }}
 */
function extractCrashSignal({ command = '', exitCode = null, stdout = '', stderr = '', cwd = '' } = {}) {
  const ok = exitCode === 0
  const cmdStr = String(command || '').trim()
  if (ok) {
    return { ok: true, exitCode: 0, command: cmdStr, kind: 'ok', primaryError: '', location: null, summary: '' }
  }

  const combined = [stripAnsi(stderr), stripAnsi(stdout)].filter(Boolean).join('\n')
  const lines = combined.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0)

  let kind = 'generic'
  let primaryError = ''
  let location = null

  for (const line of lines) {
    // 1. TypeScript compiler error: src/foo.ts(42,10): error TS2345: ... or src/foo.ts:42:10 - error TS2345: ...
    const tsParen = line.match(/^([^\s(]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/)
    if (tsParen) {
      kind = 'typescript'
      location = `${tsParen[1]}:${tsParen[2]}:${tsParen[3]}`
      primaryError = `${tsParen[4]}: ${tsParen[5]}`
      break
    }
    const tsColon = line.match(/^([^\s:]+):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)$/)
    if (tsColon) {
      kind = 'typescript'
      location = `${tsColon[1]}:${tsColon[2]}:${tsColon[3]}`
      primaryError = `${tsColon[4]}: ${tsColon[5]}`
      break
    }

    // 2. Vitest / Jest failure line: FAIL  test/foo.test.js > ...
    const vitestFail = line.match(/^FAIL\s+(.+)$/)
    if (vitestFail) {
      kind = 'test'
      location = vitestFail[1].split(/\s+>/)[0].trim()
      primaryError = line
      continue
    }

    // 3. Node / JS Runtime Error: SyntaxError: ..., TypeError: ..., AssertionError: ...
    const jsErr = line.match(/^(SyntaxError|TypeError|ReferenceError|RangeError|AssertionError|Error):\s*(.+)$/)
    if (jsErr) {
      if (kind === 'generic') kind = jsErr[1] === 'SyntaxError' ? 'syntax' : 'runtime'
      if (!primaryError || kind === 'test') primaryError = `${jsErr[1]}: ${jsErr[2]}`
      continue
    }

    // 4. Stack frame location: at fn (file:line:col) or ❯ file:line:col
    if (!location) {
      const stackLoc = line.match(/(?:at\s+.*?\(|❯\s+)([^()\s]+?\.[a-zA-Z0-9]+:\d+:\d+)/)
      if (stackLoc) {
        location = stackLoc[1]
        continue
      }
    }

    // 5. Rust / Cargo error: error[E0308]: ...
    const rustErr = line.match(/^error(?:\[(E\d+)\])?:\s*(.+)$/)
    if (rustErr) {
      kind = 'rust'
      primaryError = rustErr[1] ? `${rustErr[1]}: ${rustErr[2]}` : rustErr[2]
      continue
    }

    // 6. Python traceback file line: File "foo.py", line 12
    const pyLoc = line.match(/^File\s+"([^"]+)",\s+line\s+(\d+)/)
    if (pyLoc) {
      kind = 'python'
      location = `${pyLoc[1]}:${pyLoc[2]}`
      continue
    }
  }

  if (!primaryError) {
    // Fallback to last non-trivial error-looking line or tail line
    const tail = tailLines(combined, 12).map((l) => l.trim()).filter(Boolean)
    const errCandidate = [...tail].reverse().find((l) => /\b(error|failed|exception|fatal|enoent|eperm)\b/i.test(l))
    primaryError = (errCandidate || tail[tail.length - 1] || `Command exited with code ${exitCode ?? 'unknown'}`).slice(0, 240)
  }

  const locPart = location ? ` (${location})` : ''
  const summary = `${cmdStr ? `${cmdStr} ` : ''}failed [exit=${exitCode ?? '?'}]: ${primaryError.slice(0, 160)}${locPart}`

  return {
    ok: false,
    exitCode: exitCode ?? null,
    command: cmdStr,
    kind,
    primaryError: primaryError.slice(0, 300),
    location,
    cwd: cwd || '',
    summary,
  }
}

/**
 * Format a compact [Process Tap] banner for tool results.
 */
function formatCrashTapBanner(signal) {
  if (!signal || signal.ok) return ''
  const lines = [`[Process Tap] Command failed (exitCode=${signal.exitCode ?? '?'}, kind=${signal.kind})`]
  if (signal.location) lines.push(`Location: ${signal.location}`)
  if (signal.primaryError) lines.push(`Primary: ${signal.primaryError}`)
  return lines.join('\n')
}

module.exports = {
  stripAnsi,
  extractCrashSignal,
  formatCrashTapBanner,
}
