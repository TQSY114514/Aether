// ─── Capability axis settings-key contract (TQS-7) ─────────────────────────
// CodeRabbit Security (TQS-7) asked: does a user-selected `deny` on
// SecurityPage actually block the operation at dispatch time? The runtime
// enforcement chain is cross-file:
//
//   SecurityPage.tsx  writes  settings key `capability.<axis>`
//        → toolLoop.js     reads  `capability.${axis}` each agent run
//                              (llm/toolLoop.js, capability-axis block)
//        → permissions.js  axis policy: deny rejects / ask prompts / allow passes
//
// None of that is visible from any single file, so this test locks the
// settings-key agreement between the three surfaces. If someone renames a key
// on one side only, CI fails here instead of a deny policy silently becoming
// a no-op.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// capabilityPolicy.js is a pure module (no electron) — safe to import directly.
const { AXES, TOOL_AXIS } = require('../electron/llm/capabilityPolicy.js')

const ENFORCED_AXES = Object.values(AXES).filter(a => a !== AXES.UNKNOWN)

describe('capability axis settings-key contract (TQS-7)', () => {
  const toolLoopSrc = readFileSync(join(__dirname, '../electron/llm/toolLoop.js'), 'utf8')
  const securityPageSrc = readFileSync(join(__dirname, '../src/pages/SecurityPage.tsx'), 'utf8')

  it('SecurityPage exposes exactly the enforced axes as capability.* settings keys', () => {
    const keys = [...securityPageSrc.matchAll(/key:\s*'(capability\.[a-z]+)'/g)].map(m => m[1])
    expect(keys.sort()).toEqual(ENFORCED_AXES.map(a => `capability.${a}`).sort())
  })

  it('toolLoop reads the same capability.* keys per enforced axis', () => {
    for (const axis of ENFORCED_AXES) {
      expect(toolLoopSrc).toContain(`capability.${axis}`)
    }
  })

  it('every tool known to TOOL_AXIS maps to an enforced axis', () => {
    for (const axis of Object.values(TOOL_AXIS)) {
      expect(ENFORCED_AXES).toContain(axis)
    }
  })
})
