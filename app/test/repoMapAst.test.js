import { describe, it, expect } from 'vitest'
import { extractFile } from '../electron/context/symbolExtractor.js'
import { buildGraph, computePageRank } from '../electron/context/dependencyGraph.js'
import { buildRepoMapText } from '../electron/context/repoMap.js'

describe('AST Symbol Extraction & PageRank Repo Map', () => {
  it('extracts TypeScript interfaces, types, enums, classes, and functions', () => {
    const tsCode = `
export interface UserConfig {
  id: string
  name: string
}

export type StatusType = 'active' | 'inactive'

export enum UserRole {
  Admin = 'admin',
  User = 'user'
}

export class UserManager {
  getUser() {}
}

export async function fetchUser(id: string): Promise<UserConfig> {
  return { id, name: 'Alice' }
}

export const formatUser = (u: UserConfig) => u.name
`
    const extracted = extractFile('/workspace/user.ts', tsCode)
    expect(extracted).not.toBeNull()
    expect(extracted.symbols).toContain('UserConfig')
    expect(extracted.symbols).toContain('StatusType')
    expect(extracted.symbols).toContain('UserRole')
    expect(extracted.symbols).toContain('UserManager')
    expect(extracted.symbols).toContain('fetchUser')
    expect(extracted.symbols).toContain('formatUser')
  })

  it('extracts Python async def and class declarations', () => {
    const pyCode = `
class DataPipeline:
    def __init__(self):
        pass

async def process_batch(items):
    return [i * 2 for i in items]
`
    const extracted = extractFile('/workspace/pipeline.py', pyCode)
    expect(extracted).not.toBeNull()
    expect(extracted.symbols).toContain('DataPipeline')
    expect(extracted.symbols).toContain('process_batch')
  })

  it('computes PageRank centrality giving higher scores to hub dependencies', () => {
    const files = [
      { path: '/app/index.js', imports: ['utils', 'database'] },
      { path: '/app/api.js', imports: ['database', 'utils'] },
      { path: '/app/worker.js', imports: ['database'] },
      { path: '/app/utils.js', imports: [] },
      { path: '/app/database.js', imports: [] },
    ]

    const graph = buildGraph(files)
    const pageRank = computePageRank(graph, 25, 0.85)

    expect(pageRank.size).toBe(5)

    // database is imported by index.js, api.js, and worker.js (3 times)
    // utils is imported by index.js, api.js (2 times)
    // index.js, api.js, worker.js are not imported by anyone
    const dbRank = pageRank.get('/app/database.js') || 0
    const utilsRank = pageRank.get('/app/utils.js') || 0
    const indexRank = pageRank.get('/app/index.js') || 0

    expect(dbRank).toBeGreaterThan(indexRank)
    expect(utilsRank).toBeGreaterThan(indexRank)
    expect(dbRank).toBeGreaterThan(utilsRank)
  })

  it('enforces strict < 1024 token budget on repo map rendering', () => {
    // Generate a mock repo map with 40 files
    const mockFiles = []
    const children = []
    for (let i = 0; i < 40; i++) {
      const p = `/app/module_${i}.ts`
      mockFiles.push({
        path: p,
        imports: ['/app/core.ts'],
        exports: [`func_${i}`, `Class_${i}`],
        symbols: [`func_${i}`, `Class_${i}`, `Type_${i}`],
      })
      children.push({
        type: 'file',
        name: `module_${i}.ts`,
        path: p,
        symbols: [`func_${i}`, `Class_${i}`, `Type_${i}`],
        exports: [`func_${i}`, `Class_${i}`],
      })
    }

    const mockMap = {
      rootDir: '/app',
      tree: {
        type: 'dir',
        name: 'app',
        path: '/app',
        children,
      },
      files: mockFiles,
      stats: { totalFiles: 40, indexedFiles: 40 },
    }

    const text = buildRepoMapText(mockMap, { maxTokens: 1024 })
    expect(text).toContain('# Repo Map')
    expect(text.length).toBeGreaterThan(100)

    // Estimate token count (chars / 3.5)
    const tokenEst = Math.ceil(text.length / 3.5)
    expect(tokenEst).toBeLessThanOrEqual(1024)
  })
})
