#!/usr/bin/env node
/**
 * test-win-job-sandbox.js
 *
 * Verification suite for the Windows Native Kernel Job Object Sandbox:
 * - electron/exec/winJobObject.js
 * - electron/exec/jobSupervisor.ps1
 *
 * Verifies:
 * 1. Platform support check (isSupported on Win32).
 * 2. Supervisor initialization & 'READY' handshake via STDIN/STDOUT.
 * 3. Process assignment to Win32 Job Object sandbox (`ASSIGN <pid> -> OK <pid>`).
 * 4. Automatic kernel-level tree termination on supervisor shutdown (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE).
 * 5. Direct process tree termination via `terminateProcess(pid)`.
 * 6. Hard-crash resilience: Killing the supervisor process abruptly triggers kernel cleanup of orphans.
 *
 * Usage: node scripts/test-win-job-sandbox.js
 */

const { spawn, execSync } = require('child_process')
const path = require('path')
const {
  isSupported,
  ensureSupervisor,
  assignProcess,
  terminateProcess,
  getSupervisorProcess,
  shutdown,
} = require('../electron/exec/winJobObject')

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return false
  }
}

function findChildPids(parentPid) {
  if (!parentPid) return []
  const allDescendants = new Set()
  const queue = [parentPid]
  while (queue.length > 0) {
    const current = queue.shift()
    try {
      const stdout = execSync(
        `powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${current}').ProcessId"`,
        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
      )
      const pids = stdout
        .trim()
        .split(/\r?\n/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
      for (const pid of pids) {
        if (!allDescendants.has(pid)) {
          allDescendants.add(pid)
          queue.push(pid)
        }
      }
    } catch {}
  }
  return Array.from(allDescendants)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log('=== Win32 Job Object Sandbox Verification Suite ===\n')

  // ───────────────────────────────────────────────────────────────────────────
  // Test 1: Platform Support Check
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Test 1] Checking Windows platform support...')
  if (process.platform !== 'win32') {
    console.log(`[Test 1] Skipped: process.platform is "${process.platform}" (expected "win32")`)
    if (isSupported() !== false) {
      throw new Error(`Expected isSupported() to be false on ${process.platform}`)
    }
    console.log('PASSED: Non-Windows platform correctly handled.\n')
    return
  }

  if (!isSupported()) {
    throw new Error('Expected winJobObject.isSupported() to return true on win32')
  }
  console.log('  -> isSupported(): true')
  console.log('PASSED: Windows platform verified.\n')

  // ───────────────────────────────────────────────────────────────────────────
  // Test 2: Supervisor Initialization & READY Handshake
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Test 2] Testing ensureSupervisor() initialization and READY handshake...')
  const ready = await ensureSupervisor()
  if (!ready) {
    throw new Error('Supervisor failed to initialize or did not emit READY')
  }
  const supProc = getSupervisorProcess()
  if (!supProc || supProc.killed || !supProc.pid) {
    throw new Error('Supervisor process not running or missing PID')
  }
  console.log(`  -> Supervisor online (PID: ${supProc.pid}), READY signal received.`)
  console.log('PASSED: Supervisor initialization and handshake verified.\n')

  // ───────────────────────────────────────────────────────────────────────────
  // Test 3: Process Tree Spawn & Job Object Assignment
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Test 3] Spawning child process tree (cmd.exe -> powershell.exe)...')
  const child = spawn('cmd.exe', ['/c', 'powershell.exe -NoProfile -Command Start-Sleep -Seconds 30'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (!child.pid) {
    throw new Error('Failed to spawn child process')
  }
  console.log(`  -> Spawned root child (cmd.exe, PID: ${child.pid})`)

  console.log(`  -> Assigning PID ${child.pid} to Job Object...`)
  const assignRes = await assignProcess(child.pid)
  console.log(`  -> assignProcess result:`, assignRes)
  if (!assignRes || !assignRes.ok || assignRes.pid !== child.pid) {
    try { child.kill() } catch {}
    throw new Error(`assignProcess failed: ${JSON.stringify(assignRes)}`)
  }

  // Allow cmd.exe time to launch the powershell grandchild
  await sleep(1000)
  const descendants = findChildPids(child.pid)
  console.log(`  -> Discovered child process tree: cmd.exe [${child.pid}] -> descendants [${descendants.join(', ')}]`)

  if (!isPidAlive(child.pid)) {
    throw new Error(`Child process ${child.pid} exited prematurely`)
  }
  for (const pid of descendants) {
    if (!isPidAlive(pid)) {
      throw new Error(`Descendant process ${pid} not alive before test`)
    }
  }
  console.log('PASSED: Process tree spawned, assigned to Job Object, and running.\n')

  // ───────────────────────────────────────────────────────────────────────────
  // Test 4: Graceful Supervisor Termination (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Test 4] Testing supervisor shutdown (QUIT -> Job Handle Close -> Kernel Kill)...')
  shutdown()

  // Give kernel time to enforce termination
  await sleep(1500)

  const parentAlive = isPidAlive(child.pid)
  const lingeringDescendants = descendants.filter((pid) => isPidAlive(pid))

  console.log(`  -> cmd.exe (PID ${child.pid}) alive: ${parentAlive}`)
  console.log(`  -> Descendants lingering: ${lingeringDescendants.length ? lingeringDescendants.join(', ') : 'none'}`)

  if (parentAlive || lingeringDescendants.length > 0) {
    // Force cleanup if test failed
    try { child.kill() } catch {}
    for (const p of lingeringDescendants) {
      try { process.kill(p, 'SIGKILL') } catch {}
    }
    throw new Error(`Kernel failed to terminate processes on Job Object close! Lingering PIDs: ${lingeringDescendants.join(', ')}`)
  }
  console.log('PASSED: Windows OS kernel terminated entire process tree on Job close.\n')

  // ───────────────────────────────────────────────────────────────────────────
  // Test 5: Direct terminateProcess Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Test 5] Testing direct terminateProcess(pid)...')
  const child2 = spawn('cmd.exe', ['/c', 'powershell.exe -NoProfile -Command Start-Sleep -Seconds 30'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(`  -> Spawned child 2 (cmd.exe, PID: ${child2.pid})`)
  await sleep(1000)
  const descendants2 = findChildPids(child2.pid)
  console.log(`  -> Descendants of child 2: [${descendants2.join(', ')}]`)

  const termRes = await terminateProcess(child2.pid)
  console.log(`  -> terminateProcess result:`, termRes)
  if (!termRes || !termRes.ok) {
    try { child2.kill() } catch {}
    for (const p of descendants2) {
      try { process.kill(p, 'SIGKILL') } catch {}
    }
    throw new Error(`terminateProcess returned error: ${JSON.stringify(termRes)}`)
  }

  await sleep(1000)
  const child2Alive = isPidAlive(child2.pid)
  const lingering2 = descendants2.filter((pid) => isPidAlive(pid))

  console.log(`  -> child 2 (PID ${child2.pid}) alive: ${child2Alive}`)
  console.log(`  -> child 2 descendants lingering: ${lingering2.length ? lingering2.join(', ') : 'none'}`)

  if (child2Alive || lingering2.length > 0) {
    try { child2.kill() } catch {}
    for (const p of lingering2) {
      try { process.kill(p, 'SIGKILL') } catch {}
    }
    throw new Error('terminateProcess failed to terminate child process tree!')
  }
  console.log('PASSED: terminateProcess killed the process tree.\n')

  // ───────────────────────────────────────────────────────────────────────────
  // Test 6: Hard Crash Simulation (OS Kernel Automatic Cleanup)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Test 6] Testing hard crash simulation (killing supervisor without QUIT)...')
  const readyAgain = await ensureSupervisor()
  if (!readyAgain) {
    throw new Error('Failed to restart supervisor for crash test')
  }
  const sup2 = getSupervisorProcess()
  console.log(`  -> New supervisor online (PID: ${sup2.pid})`)

  const child3 = spawn('cmd.exe', ['/c', 'powershell.exe -NoProfile -Command Start-Sleep -Seconds 30'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(`  -> Spawned child 3 (cmd.exe, PID: ${child3.pid})`)
  const assignRes3 = await assignProcess(child3.pid)
  if (!assignRes3 || !assignRes3.ok) {
    try { child3.kill() } catch {}
    throw new Error(`assignProcess failed for child 3: ${JSON.stringify(assignRes3)}`)
  }

  await sleep(1000)
  const descendants3 = findChildPids(child3.pid)
  console.log(`  -> Descendants of child 3: [${descendants3.join(', ')}]`)

  // Abruptly kill the supervisor process directly (simulating sudden crash or taskkill)
  console.log(`  -> Killing supervisor process (PID: ${sup2.pid}) with taskkill /F...`)
  execSync(`taskkill /pid ${sup2.pid} /F`, { windowsHide: true })

  // Wait for OS kernel to detect process death and close handles
  await sleep(1500)

  const child3Alive = isPidAlive(child3.pid)
  const lingering3 = descendants3.filter((pid) => isPidAlive(pid))

  console.log(`  -> child 3 (PID ${child3.pid}) alive after supervisor crash: ${child3Alive}`)
  console.log(`  -> child 3 descendants lingering: ${lingering3.length ? lingering3.join(', ') : 'none'}`)

  if (child3Alive || lingering3.length > 0) {
    try { child3.kill() } catch {}
    for (const p of lingering3) {
      try { process.kill(p, 'SIGKILL') } catch {}
    }
    throw new Error(`Kernel failed to clean up sandboxed process tree on supervisor crash!`)
  }
  console.log('PASSED: Windows OS kernel automatically terminated sandboxed tree upon supervisor crash.\n')

  shutdown()
  console.log('=== All Win32 Job Object Sandbox Tests PASSED Successfully! ===')
}

main().catch((err) => {
  console.error('\n*** TEST SUITE FAILED ***\n', err)
  try { shutdown() } catch {}
  process.exit(1)
})
