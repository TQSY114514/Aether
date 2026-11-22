import { describe, it, expect } from 'vitest'
import { aggregateSessionFileChanges, splitPath, normalizePathKey } from './sessionReview'
import type { Message } from '@/types'
import type { TurnFileSummary } from '@/store/types'

describe('sessionReview utils', () => {
  it('splits paths correctly', () => {
    expect(splitPath('src/components/chat/ChatPage.tsx')).toEqual({
      dir: 'src/components/chat/',
      fileName: 'ChatPage.tsx',
    })
    expect(splitPath('README.md')).toEqual({
      dir: '',
      fileName: 'README.md',
    })
    expect(splitPath('app\\electron\\main.js')).toEqual({
      dir: 'app/electron/',
      fileName: 'main.js',
    })
  })

  it('normalizes path keys uniformly', () => {
    const p1 = normalizePathKey('src\\utils\\test.ts')
    const p2 = normalizePathKey('src/utils/test.ts')
    expect(p1.toLowerCase()).toBe(p2.toLowerCase())
  })

  it('aggregates file changes across multiple turns', () => {
    const messages: Message[] = [
      { id: 1, role: 'assistant', content: 'Turn 1' } as any,
      { id: 2, role: 'assistant', content: 'Turn 2' } as any,
    ]
    const fileSummariesByMessage: Record<number, TurnFileSummary> = {
      1: {
        fileCount: 2,
        totalAdded: 15,
        totalRemoved: 2,
        files: [
          { path: 'src/index.ts', added: 10, removed: 2, status: 'modified', diff: '@@ -1 +1 @@\n-a\n+b' },
          { path: 'src/new.ts', added: 5, removed: 0, status: 'created', diff: '@@ -0,0 +1,5 @@\n+line' },
        ],
      },
      2: {
        fileCount: 1,
        totalAdded: 3,
        totalRemoved: 1,
        files: [
          { path: 'src/index.ts', added: 3, removed: 1, status: 'modified', diff: '@@ -5 +5 @@\n-c\n+d' },
        ],
      },
    }

    const summary = aggregateSessionFileChanges(messages, fileSummariesByMessage)
    expect(summary.fileCount).toBe(2)
    expect(summary.totalAdded).toBe(18)
    expect(summary.totalRemoved).toBe(3)

    const indexFile = summary.files.find((f) => f.path === 'src/index.ts')
    expect(indexFile).toBeDefined()
    expect(indexFile?.added).toBe(13)
    expect(indexFile?.removed).toBe(3)
    expect(indexFile?.turnsCount).toBe(2)
    expect(indexFile?.diffs).toHaveLength(2)

    const newFile = summary.files.find((f) => f.path === 'src/new.ts')
    expect(newFile?.status).toBe('created')
  })
})
