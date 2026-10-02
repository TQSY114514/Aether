import { describe, it, expect } from 'vitest'
import { stripAnsi, formatWarpBlock } from '../tui/toolCards.js'

describe('Warp Terminal Block Drawer & Card (P2-2)', () => {
  it('strips ANSI escape sequences cleanly', () => {
    const rawAnsi = '\u001b[32m✔ All tests passed\u001b[0m in \u001b[1m1.45s\u001b[0m'
    expect(stripAnsi(rawAnsi)).toBe('✔ All tests passed in 1.45s')

    const rawColorTable = '\u001b[31;1mError:\u001b[0m cannot find module \u001b[4m./foo\u001b[24m'
    expect(stripAnsi(rawColorTable)).toBe('Error: cannot find module ./foo')
  })

  it('ignores non-command tools in formatWarpBlock', () => {
    const res = formatWarpBlock({ name: 'read_file', args: { path: 'foo.ts' } })
    expect(res).toBeNull()
  })

  it('formats successful command into Warp block', () => {
    const entry = {
      name: 'run_command',
      args: { command: 'npm test', cwd: 'C:/workspace/app' },
      result: '\u001b[32mPASS\u001b[0m test/foo.test.js\nTests: 5 passed',
      latencyMs: 1250,
      exitCode: 0
    }
    const block = formatWarpBlock(entry)
    expect(block).toBeDefined()
    expect(block.isCommand).toBe(true)
    expect(block.command).toBe('npm test')
    expect(block.cwd).toBe('C:/workspace/app')
    expect(block.status).toBe('done')
    expect(block.exitCode).toBe(0)
    expect(block.latencyMs).toBe(1250)
    expect(block.cleanOutput).toBe('PASS test/foo.test.js\nTests: 5 passed')
  })

  it('formats failed command into Warp block with error exitCode', () => {
    const entry = {
      name: 'run_command',
      args: { command: 'node index.js' },
      error: '\u001b[31mTypeError: x is not a function\u001b[0m\n    at main.js:10:5',
      latencyMs: 300,
      exitCode: 1
    }
    const block = formatWarpBlock(entry)
    expect(block.status).toBe('error')
    expect(block.exitCode).toBe(1)
    expect(block.cleanOutput).toContain('TypeError: x is not a function')
    expect(block.cleanOutput).not.toContain('\u001b[')
  })

  it('handles in-flight running command', () => {
    const entry = {
      name: 'run_command',
      args: { command: 'cargo build --release' },
      startedAt: Date.now(),
      result: null,
      error: null
    }
    const block = formatWarpBlock(entry)
    expect(block.status).toBe('running')
    expect(block.exitCode).toBeNull()
  })
})
