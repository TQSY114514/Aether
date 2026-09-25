// ─────────────────────────────────────────────────────────────────────────────
// cachePrefix.stability.test.js — P0-1 Step 1d / 1b / 1c Prefix Cache Effect Test
//
// 职责：
// 1. 静态断言与量化：比较 unsorted (legacy) 与 cache-stable 排序下，无 MCP 与有 MCP
//    两种情形在阶段路由追加类别（lsp / agent / git）时的首个插入点索引与前缀复用率。
// 2. 边界断言：通过 Module._load 拦截 providerAdapter.completeChatMessage，在真实
//    runToolLoop 的请求边界上断言连续多轮（跨越 FOLD_MIN_ROUNDS_AGO = 3）的：
//    - messages 已发送前缀字节 100% 相同（JSON.stringify 首个差异点 === 上一轮末尾）；
//    - 阶段路由新增类别时 opts.tools 的插入点严格位于数组末尾（index === prevTools.length）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'
import path from 'path'
import fs from 'fs'

const require = createRequire(import.meta.url)

// Captured requests at the providerAdapter boundary
const capturedRequests = []
let mockTurnHandler = null

const origLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  if (request.endsWith('providerAdapter') || request.endsWith('providerAdapter.js')) {
    return {
      completeChatMessage: async (req) => {
        // Deep-clone messages and tools at the exact moment of provider dispatch
        capturedRequests.push({
          messages: JSON.parse(JSON.stringify(req.messages || [])),
          tools: JSON.parse(JSON.stringify((req.options && req.options.tools) || [])),
        })
        if (typeof mockTurnHandler === 'function') {
          return mockTurnHandler(capturedRequests.length - 1, req)
        }
        return { role: 'assistant', content: 'done', usage: { prompt_tokens: 100, completion_tokens: 10 } }
      },
    }
  }
  return origLoad.apply(this, arguments)
}

const { routeTools, sortToolsForCacheStability, getToolPrefixBucket, _categories } = require('../electron/llm/toolRouter')
const mcpManager = require('../electron/mcp/manager')
const { runToolLoop } = require('../electron/llm/toolLoop')

afterAll(() => {
  Module._load = origLoad
})

/**
 * Helper: compute first differing index between two tool-name arrays and static prefix reuse ratio.
 */
function measureToolInsertion(beforeNames, afterNames) {
  let firstDiffIdx = 0
  while (
    firstDiffIdx < beforeNames.length &&
    firstDiffIdx < afterNames.length &&
    beforeNames[firstDiffIdx] === afterNames[firstDiffIdx]
  ) {
    firstDiffIdx++
  }
  return {
    insertionIndex: firstDiffIdx,
    beforeCount: beforeNames.length,
    afterCount: afterNames.length,
    reuseRatio: beforeNames.length > 0 ? Number((firstDiffIdx / beforeNames.length).toFixed(4)) : 1,
    isPureTailAppend: firstDiffIdx === beforeNames.length,
  }
}

/**
 * Helper: compute first differing character offset between two JSON strings.
 */
function firstByteDivergence(strA, strB) {
  const minLen = Math.min(strA.length, strB.length)
  for (let i = 0; i < minLen; i++) {
    if (strA.charCodeAt(i) !== strB.charCodeAt(i)) return i
  }
  return minLen
}

describe('P0-1 Step 1d & 1b: Static Tool Surface Ordering & Insertion Point Quantification', () => {
  it('places all CORE, unclassified built-in, and MCP tools strictly before category tools in getMergedToolsPayload()', () => {
    // Register 4 synthetic MCP tools
    const mcpTools = [
      { name: 'mcp_fs__read', description: 'mcp read', risk: 'safe', parameters: { type: 'object', properties: {} } },
      { name: 'mcp_fs__search', description: 'mcp search', risk: 'safe', parameters: { type: 'object', properties: {} } },
      { name: 'mcp_db__query', description: 'mcp query', risk: 'safe', parameters: { type: 'object', properties: {} } },
      { name: 'mcp_git__blame', description: 'mcp blame', risk: 'safe', parameters: { type: 'object', properties: {} } },
    ]
    mcpManager.registerTools(mcpTools)

    const sortedPayload = mcpManager.getMergedToolsPayload('auto', { cacheStable: true })
    const sortedNames = sortedPayload.map(t => t.function.name)

    const categoryToolSet = new Set(Object.values(_categories).flat())
    let firstCategoryIdx = -1
    let lastAlwaysOnIdx = -1

    sortedNames.forEach((name, idx) => {
      if (categoryToolSet.has(name)) {
        if (firstCategoryIdx === -1) firstCategoryIdx = idx
      } else {
        lastAlwaysOnIdx = idx
      }
    })

    // Every non-category tool (CORE + unclassified built-ins + MCP tools) must appear BEFORE the first category tool
    expect(firstCategoryIdx).toBeGreaterThan(0)
    expect(lastAlwaysOnIdx).toBeLessThan(firstCategoryIdx)
    for (const mcp of mcpTools) {
      const idx = sortedNames.indexOf(mcp.name)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(firstCategoryIdx)
      expect(getToolPrefixBucket(mcp.name)).toBe(1)
    }
  })

  it('quantifies insertion index with vs without MCP tools (legacy unsorted vs cache-stable sorted)', () => {
    // Cleanly compare legacy unsorted vs cache-stable sorted across:
    // Case A: No MCP tools (built-in registry only)
    // Case B: With 4 MCP tools registered
    const registry = require('../electron/tools/registry')
    const rawBuiltin = registry.toolsPayload('auto', { cacheStable: false })
    const sortedBuiltin = sortToolsForCacheStability(rawBuiltin)

    const filterByStage = (fullList, extraCategories) => {
      const allToolNames = fullList.map(p => p.function.name)
      const want = routeTools({
        prompt: '帮我修改这个函数并验证',
        allToolNames,
        extraCategories,
      })
      return fullList.filter(p => want.has(p.function.name)).map(p => p.function.name)
    }

    // 1. Legacy unsorted without MCP: Turn 1 (explore: []) -> Turn 2 (build: ['lsp'])
    const legacyNoMcpR1 = filterByStage(rawBuiltin, [])
    const legacyNoMcpR2 = filterByStage(rawBuiltin, ['lsp'])
    const legacyNoMcpMetrics = measureToolInsertion(legacyNoMcpR1, legacyNoMcpR2)

    // In legacy order, find_symbol is at index 4 in TOOLS (right after read_file, list_dir, glob_find, grep_search)
    expect(legacyNoMcpMetrics.insertionIndex).toBe(4)
    expect(legacyNoMcpMetrics.beforeCount).toBe(23)
    expect(legacyNoMcpMetrics.reuseRatio).toBeCloseTo(4 / 23, 3)

    // 2. Legacy unsorted with 4 MCP tools at tail: Turn 1 ([]) -> Turn 2 (['lsp'])
    const mcpEntries = [
      { type: 'function', function: { name: 'mcp_a__t1', description: '', parameters: {} } },
      { type: 'function', function: { name: 'mcp_a__t2', description: '', parameters: {} } },
      { type: 'function', function: { name: 'mcp_b__t1', description: '', parameters: {} } },
      { type: 'function', function: { name: 'mcp_b__t2', description: '', parameters: {} } },
    ]
    const rawWithMcp = [...rawBuiltin, ...mcpEntries]
    const legacyMcpR1 = filterByStage(rawWithMcp, [])
    const legacyMcpR2 = filterByStage(rawWithMcp, ['lsp'])
    const legacyMcpMetrics = measureToolInsertion(legacyMcpR1, legacyMcpR2)

    expect(legacyMcpMetrics.insertionIndex).toBe(4)
    expect(legacyMcpMetrics.beforeCount).toBe(27)
    expect(legacyMcpMetrics.reuseRatio).toBeCloseTo(4 / 27, 3)

    // 3. Cache-stable sorted without MCP: Turn 1 ([]) -> Turn 2 (['lsp']) -> Turn 3 (['lsp', 'agent']) -> Turn 4 (['lsp', 'agent', 'git'])
    const stableNoMcpR1 = filterByStage(sortedBuiltin, [])
    const stableNoMcpR2 = filterByStage(sortedBuiltin, ['lsp'])
    const stableNoMcpR3 = filterByStage(sortedBuiltin, ['lsp', 'agent'])
    const stableNoMcpR4 = filterByStage(sortedBuiltin, ['lsp', 'agent', 'git'])

    const mNoMcp12 = measureToolInsertion(stableNoMcpR1, stableNoMcpR2)
    const mNoMcp23 = measureToolInsertion(stableNoMcpR2, stableNoMcpR3)
    const mNoMcp34 = measureToolInsertion(stableNoMcpR3, stableNoMcpR4)

    expect(mNoMcp12.isPureTailAppend).toBe(true)
    expect(mNoMcp12.insertionIndex).toBe(23)
    expect(mNoMcp12.reuseRatio).toBe(1)

    expect(mNoMcp23.isPureTailAppend).toBe(true)
    expect(mNoMcp23.insertionIndex).toBe(29)
    expect(mNoMcp23.reuseRatio).toBe(1)

    expect(mNoMcp34.isPureTailAppend).toBe(true)
    expect(mNoMcp34.reuseRatio).toBe(1)

    // 4. Cache-stable sorted with 4 MCP tools: Turn 1 ([]) -> Turn 2 (['lsp']) -> Turn 3 (['lsp', 'agent'])
    const sortedWithMcp = sortToolsForCacheStability(rawWithMcp)
    const stableMcpR1 = filterByStage(sortedWithMcp, [])
    const stableMcpR2 = filterByStage(sortedWithMcp, ['lsp'])
    const stableMcpR3 = filterByStage(sortedWithMcp, ['lsp', 'agent'])

    const mMcp12 = measureToolInsertion(stableMcpR1, stableMcpR2)
    const mMcp23 = measureToolInsertion(stableMcpR2, stableMcpR3)

    expect(mMcp12.isPureTailAppend).toBe(true)
    expect(mMcp12.insertionIndex).toBe(27)
    expect(mMcp12.reuseRatio).toBe(1)

    expect(mMcp23.isPureTailAppend).toBe(true)
    expect(mMcp23.insertionIndex).toBe(33)
    expect(mMcp23.reuseRatio).toBe(1)
  })
})

describe('P0-1 Step 1d & 1c: End-to-End runToolLoop Provider Boundary Prefix Stability', () => {
  it('maintains 100% byte-identical messages prefix and pure tail-append tools across 5 rounds (crossing FOLD_MIN_ROUNDS_AGO=3)', async () => {
    capturedRequests.length = 0
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-cache-prefix-'))
    const sampleFile = path.join(tmpDir, 'sample.txt')
    // Make file > 200 chars so foldStaleToolOutputs would normally fold it at round >= 4
    fs.writeFileSync(sampleFile, Array.from({ length: 15 }, (_, i) => `line ${i + 1}: const value_${i} = ${i * 42}; // padding for fold threshold`).join('\n'), 'utf8')

    const fakeDb = {
      getSetting: (k) => {
        if (k === 'feature_flag.agent.toolRouter') return '1'
        if (k === 'feature_flag.agent.toolRouter.staged') return '1'
        if (k === 'feature_flag.agent.cachePrefixStability') return '1'
        return null
      },
    }

    // 5-turn script:
    // Turn 0 (explore): read_file (>200 chars)
    // Turn 1 (explore -> build via edit_file): write_file
    // Turn 2 (build stage unlocks lsp! -> verify via lsp_diagnostics): lsp_diagnostics
    // Turn 3 (verify stage unlocks agent!): read_file
    // Turn 4 (round 4 -> 5 crosses FOLD_MIN_ROUNDS_AGO=3 for Turn 0's read_file!): final answer
    mockTurnHandler = async (turnIdx) => {
      if (turnIdx === 0) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'tc_r1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: sampleFile }) } }],
        }
      }
      if (turnIdx === 1) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'tc_r2', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: path.join(tmpDir, 'out.txt'), content: 'hello world' }) } }],
        }
      }
      if (turnIdx === 2) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'tc_r3', type: 'function', function: { name: 'lsp_diagnostics', arguments: JSON.stringify({ path: sampleFile }) } }],
        }
      }
      if (turnIdx === 3) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'tc_r4', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: sampleFile }) } }],
        }
      }
      return { role: 'assistant', content: 'All 5 rounds completed with stable prefix.' }
    }

    const res = await runToolLoop({
      provider: { id: 'mock', api_format: 'openai' },
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: '请读取文件并完成修改' }],
      agentMode: 'auto',
      sessionId: 99001,
      db: fakeDb,
      maxIterations: 8,
    })

    expect(res).toContain('All 5 rounds completed')
    expect(capturedRequests.length).toBe(5)

    // Verify 1: Consecutive rounds have 100% byte-identical messages prefix!
    for (let i = 0; i < capturedRequests.length - 1; i++) {
      const prevMsgs = capturedRequests[i].messages
      const nextMsgs = capturedRequests[i + 1].messages
      expect(nextMsgs.length).toBeGreaterThan(prevMsgs.length)

      const prevJson = JSON.stringify(prevMsgs)
      const nextSliceJson = JSON.stringify(nextMsgs.slice(0, prevMsgs.length))
      const divOffset = firstByteDivergence(prevJson, nextSliceJson)

      // Byte divergence offset must equal the full length of prevJson (zero mutation of sent history!)
      expect(divOffset).toBe(prevJson.length)
      expect(nextSliceJson).toBe(prevJson)
    }

    // Verify 2: Tools array across all 5 rounds only grows by pure tail-append!
    for (let i = 0; i < capturedRequests.length - 1; i++) {
      const prevTools = capturedRequests[i].tools.map(t => t.function.name)
      const nextTools = capturedRequests[i + 1].tools.map(t => t.function.name)
      expect(nextTools.length).toBeGreaterThanOrEqual(prevTools.length)

      const metrics = measureToolInsertion(prevTools, nextTools)
      expect(metrics.isPureTailAppend).toBe(true)
      expect(metrics.insertionIndex).toBe(prevTools.length)
      expect(metrics.reuseRatio).toBe(1)
    }

    // Specifically confirm that stage transitions actually added tools at the tail:
    // Turn 0 -> Turn 2 (build stage added lsp) -> Turn 3 (verify stage added agent)
    const t0Len = capturedRequests[0].tools.length
    const t2Len = capturedRequests[2].tools.length
    const t3Len = capturedRequests[3].tools.length
    expect(t2Len).toBeGreaterThan(t0Len)
    expect(t3Len).toBeGreaterThan(t2Len)
  })
})
