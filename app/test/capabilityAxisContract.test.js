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

  it('toolLoop reads capability.* via db.getSetting inside its axis loop at runtime', () => {
    // 剥掉行注释，让"只在注释里出现"无法满足任何断言。
    const codeOnly = toolLoopSrc.replace(/^\s*\/\/.*$/gm, '')
    // 从 for-of 语句提取轴清单（运行时代码）：
    //   for (const axis of ['filesystem', 'shell', 'network']) {
    const loopMatch = codeOnly.match(/for\s*\(\s*const\s+axis\s+of\s+\[([^\]]*)\]\s*\)\s*\{/)
    expect(loopMatch).toBeTruthy()
    const listedAxes = [...loopMatch[1].matchAll(/'([a-z_-]+)'/g)].map(m => m[1])
    expect(listedAxes.sort()).toEqual([...ENFORCED_AXES].sort())
    // 断言范围限定在循环的可执行体：括号配平解析出完整循环体
    // （`${axis}` 的花括号成对出现，不影响深度计数），
    // 读取表达式必须存在于体内——循环之后的代码不算数。
    let i = loopMatch.index + loopMatch[0].length
    let depth = 1
    while (i < codeOnly.length && depth > 0) {
      if (codeOnly[i] === '{') depth++
      else if (codeOnly[i] === '}') depth--
      i++
    }
    const loopBody = codeOnly.slice(loopMatch.index + loopMatch[0].length, i - 1)
    expect(loopBody).toContain('db.getSetting(`capability.${axis}`)')
  })

  it('every tool known to TOOL_AXIS maps to an enforced axis', () => {
    for (const axis of Object.values(TOOL_AXIS)) {
      expect(ENFORCED_AXES).toContain(axis)
    }
  })
})
