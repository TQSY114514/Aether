import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const sandbox = req('../electron/tools/sandbox')
const projectInstructions = req('../electron/llm/projectInstructions')
const projectConfig = req('../electron/config/projectConfig')

const tmpDirs = []
function makeTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'rule-cache-test-'))
  tmpDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }) } catch {}
  }
})

describe('Feature 3: Workspace Rule & Config Cache Invalidation', () => {
  it('invalidates project instructions cache when invalidateCache is called', () => {
    const ws = makeTempWorkspace()
    const sessionId = 7711
    sandbox.setWorkspaceRoot(ws)
    sandbox.setWorkspaceRootForSession(sessionId, ws)

    const agentsMdPath = join(ws, 'AGENTS.md')
    writeFileSync(agentsMdPath, '# Rule v1: Always write tests', 'utf-8')

    // Initial load
    const firstLoad = projectInstructions.loadProjectInstructions(sessionId)
    expect(firstLoad).toBeDefined()
    expect(firstLoad.content).toContain('Rule v1')

    // Modify file on disk without invalidating cache
    writeFileSync(agentsMdPath, '# Rule v2: Always write clean tests and verify', 'utf-8')

    // Because TTL is 30s, reading immediately returns cached v1
    const cachedLoad = projectInstructions.loadProjectInstructions(sessionId)
    expect(cachedLoad.content).toContain('Rule v1')

    // Invalidate cache
    projectInstructions.invalidateCache()

    // Now reading returns fresh v2 from disk
    const freshLoad = projectInstructions.loadProjectInstructions(sessionId)
    expect(freshLoad.content).toContain('Rule v2')
  })

  it('invalidates project config cache when invalidateProjectConfigCache is called', () => {
    const ws = makeTempWorkspace()
    const configPath = join(ws, '.aether.json')
    writeFileSync(configPath, JSON.stringify({ mode: 'ask', defaultModel: 'model-a' }), 'utf-8')

    const firstConfig = projectConfig.loadProjectConfig(ws)
    expect(firstConfig.mode).toBe('ask')
    expect(firstConfig.defaultModel).toBe('model-a')

    // Update config on disk
    writeFileSync(configPath, JSON.stringify({ mode: 'auto', defaultModel: 'model-b' }), 'utf-8')

    // Without invalidation, returns cached config
    const cachedConfig = projectConfig.loadProjectConfig(ws)
    expect(cachedConfig.mode).toBe('ask')

    // Invalidate cache for this workspace
    projectConfig.invalidateProjectConfigCache(ws)

    // Now returns updated config
    const freshConfig = projectConfig.loadProjectConfig(ws)
    expect(freshConfig.mode).toBe('auto')
    expect(freshConfig.defaultModel).toBe('model-b')
  })
})
