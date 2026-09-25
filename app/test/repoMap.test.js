// ─── Repo Map unit tests ────────────────────────────────────────────────────
// Tests for electron/context/repoMap.js: repo map generation, file tree,
// symbol extraction, and incremental re-parse (only changed files re-parsed).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { generateRepoMap, buildRepoMapText, invalidateCache, getCachedMap, computeBudgetForRequest } from '../electron/context/repoMap'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-test-'))
  // A small JS project whose files the regex extractor understands.
  fs.mkdirSync(path.join(tmpDir, 'src'))
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'export { add } from "./math"\nconst add = (a, b) => a + b\nexport default add\n')
  fs.writeFileSync(path.join(tmpDir, 'src', 'math.js'), 'export function add(a, b) { return a + b }\nexport function sub(a, b) { return a - b }\n')
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# notes\n')
})

afterEach(() => {
  invalidateCache(tmpDir)
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('generateRepoMap', () => {
  it('builds a file tree with top-level symbols', async () => {
    const map = await generateRepoMap(tmpDir)
    expect(map.stats.totalFiles).toBe(3)
    expect(map.stats.indexedFiles).toBe(2) // README.md is not a supported language

    // Tree contains nested dirs and files.
    const srcDir = map.tree.children.find(c => c.name === 'src' && c.type === 'dir')
    expect(srcDir).toBeTruthy()
    const names = srcDir.children.map(c => c.name).sort()
    expect(names).toEqual(['index.js', 'math.js'])

    // math.js exposes its functions.
    const math = srcDir.children.find(c => c.name === 'math.js')
    expect(math.symbols).toContain('add')
    expect(math.symbols).toContain('sub')
  })

  it('caches the map and returns the same instance on repeated calls', async () => {
    const first = await generateRepoMap(tmpDir)
    const second = await generateRepoMap(tmpDir)
    expect(second).toBe(first)
    expect(getCachedMap(tmpDir)).toBe(first)
  })

  it('re-parses only changed files (incremental update)', async () => {
    const before = await generateRepoMap(tmpDir)
    const mathFile = path.join(tmpDir, 'src', 'math.js')
    const oldMtime = fs.statSync(mathFile).mtimeMs

    // Add a new symbol to an existing file and bump its mtime.
    fs.appendFileSync(mathFile, '\nexport function mul(a, b) { return a * b }\n')
    const now = Date.now() + 2000
    fs.utimesSync(mathFile, now / 1000, now / 1000)

    const after = await generateRepoMap(tmpDir)
    // New instance (cache invalidated by the mtime change).
    expect(after).not.toBe(before)

    // The changed file now includes the new symbol.
    const math = after.tree.children.find(c => c.name === 'src').children.find(c => c.name === 'math.js')
    expect(math.symbols).toContain('mul')
    expect(oldMtime).toBeGreaterThan(0)
  }, 20000)
})

describe('buildRepoMapText', () => {
  it('renders a compact text block with symbols', async () => {
    const map = await generateRepoMap(tmpDir)
    const text = buildRepoMapText(map)
    expect(text).toContain('# Repo Map')
    expect(text).toContain('src/')
    expect(text).toContain('math.js')
    expect(text).toContain('defs: add')
  })

  it('adapts token budget dynamically based on task prompt', async () => {
    const map = await generateRepoMap(tmpDir)
    const shortText = buildRepoMapText(map, { userMessage: '修复 math.js 里的一个小问题' })
    const refactorText = buildRepoMapText(map, { userMessage: '对整个项目进行全面架构重构与迁移' })
    expect(shortText).toContain('# Repo Map')
    expect(refactorText).toContain('# Repo Map')
  })
})

describe('computeBudgetForRequest', () => {
  it('assigns 1280 tokens for short bug fixes or commands', () => {
    expect(computeBudgetForRequest('修复加法函数返回值')).toBe(1280)
    expect(computeBudgetForRequest('check typo in index.js')).toBe(1280)
  })

  it('assigns 2048 tokens for medium prompts', () => {
    const mediumPrompt = '请帮我编写一个完整的状态机组件，用于管理异步任务状态，支持待处理、执行中、已完成与错误重试，并且需要记录每一步的状态转移日志以供调试使用。'
    expect(computeBudgetForRequest(mediumPrompt)).toBe(2048)
  })

  it('assigns 4096 tokens for long prompts (>500 chars)', () => {
    const longPrompt = 'A'.repeat(520)
    expect(computeBudgetForRequest(longPrompt)).toBe(4096)
  })

  it('assigns 8192 tokens for refactor/architecture tasks', () => {
    expect(computeBudgetForRequest('重构整个项目的状态管理模块')).toBe(8192)
    expect(computeBudgetForRequest('refactor codebase to microservices')).toBe(8192)
    expect(computeBudgetForRequest('对全工程进行架构治理与迁移')).toBe(8192)
  })
})