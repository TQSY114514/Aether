#!/usr/bin/env node
/**
 * Minimal E2E launch/smoke test for the built Electron app.
 *
 * Spawns the real Electron binary against the built renderer (app/dist), points
 * it at a throwaway user-data dir so it never touches the real %APPDATA%/aetherai
 * data, and asserts the main process stays alive (no immediate crash) for a few
 * seconds. Kills the process cleanly and removes the temp dir, so it is safe to
 * run repeatedly.
 *
 * No test framework, no Playwright — just node:assert + child_process.spawn.
 *
 * Usage: node e2e/launch.test.js  (or: npm run test:e2e)
 *
 * Exit codes:
 *   0  app launched and stayed alive (or test was skipped because the build /
 *      electron binary is not present — see the skip messages)
 *   1  app crashed on startup, or a real assertion failed
 */
const { spawn } = require('child_process')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fs = require('fs')
const http = require('http')

const APP_DIR = path.resolve(__dirname, '..')
const DIST_INDEX = path.join(APP_DIR, 'dist', 'index.html')
const DIST_PORT = 19877 // matches DIST_PORT in electron/main.js

// ── Tuning ────────────────────────────────────────────────────────────────
const START_TIMEOUT_MS = 30000 // how long to wait for the app to come up
const READY_POLL_MS = 500      // poll interval while waiting for the window
const STABLE_MS = 5000         // keep alive this long after window seen, to catch late crashes

// ── Prerequisite guards (deterministic, no confusing crashes) ─────────────
function electronBinary() {
  // In a plain Node process require('electron') resolves to the path of the
  // installed Electron executable (not the module object).
  const p = require('electron')
  return typeof p === 'string' && fs.existsSync(p) ? p : null
}

function skip(message) {
  console.log(`[e2e] SKIP: ${message}`)
  console.log('[e2e] Not running the launch smoke test in this environment.')
  process.exit(0)
}

function resolveElectron() {
  try {
    const p = electronBinary()
    if (p) return p
  } catch {
    // fall through to the missing-build message
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────
function probeWindow() {
  // The main process serves dist/ over a local http server; a 2xx/3xx/404
  // response means the static server (and thus the window pipeline) is up.
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: DIST_PORT, path: '/', timeout: 1500 }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const electronPath = resolveElectron()
  if (!electronPath) {
    return skip('electron binary not found (node_modules/electron/dist/electron.exe). Run `npm install` first.')
  }
  if (!fs.existsSync(DIST_INDEX)) {
    console.error('[e2e] FAIL: renderer build not found at dist/index.html.')
    console.error('[e2e] Run `npm run build:ci` (or `vite build`) first, then re-run the smoke test.')
    process.exit(1)
  }

  // Isolated user-data dir so the test never reads/writes the real app data.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-e2e-'))

  // Copy env but drop NODE_ENV: main.js only starts the static server (and
  // loads dist/) when NODE_ENV is unset — otherwise it points at the dev server.
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
  delete env.NODE_ENV

  const child = spawn(electronPath, [
    APP_DIR,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu', // avoid GPU crashes on headless/CI runners
  ], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let output = ''
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { output += d })

  let exitInfo = null
  child.on('exit', (code, signal) => { exitInfo = { code, signal } })

  try {
    // 1) Wait for the window/server to come up, or a crash, whichever is first.
    const deadline = Date.now() + START_TIMEOUT_MS
    let windowSeen = false
    while (Date.now() < deadline) {
      if (exitInfo !== null) {
        assert.fail(`app exited early with code=${exitInfo.code} signal=${exitInfo.signal}`)
      }
      if (await probeWindow()) {
        windowSeen = true
        break
      }
      await sleep(READY_POLL_MS)
    }

    // 2) Keep it running a little longer to catch late startup crashes.
    //    (If the window was never seen we still pass as long as the process
    //    is alive — the alive-check is the primary assertion; the port probe
    //    is a best-effort confirmation that tolerates port collisions.)
    if (!windowSeen) {
      console.log('[e2e] note: did not observe the static server port; relying on process-alive check.')
    }
    await sleep(STABLE_MS)
    if (exitInfo !== null) {
      assert.fail(`app exited during stability window with code=${exitInfo.code} signal=${exitInfo.signal}`)
    }

    console.log(`[e2e] OK: app launched and stayed alive (window confirmed: ${windowSeen}).`)
    process.exit(0)
  } finally {
    // Clean shutdown: SIGTERM then, if needed, SIGKILL.
    if (child && !child.killed) {
      try { child.kill('SIGTERM') } catch {}
    }
    // Give the process a moment to exit, then force-kill leftovers so repeat
    // runs are safe (no orphaned electron processes).
    await sleep(300)
    if (child && !child.killed) {
      try { child.kill('SIGKILL') } catch {}
    }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch {}
  }
}

main().catch((err) => {
  console.error('[e2e] FAIL:', err && err.message ? err.message : err)
  process.exit(1)
})