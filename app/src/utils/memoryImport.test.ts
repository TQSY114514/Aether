import { describe, it, expect } from 'vitest'
import { parseMemoryImport } from './memoryImport'

describe('parseMemoryImport', () => {
  it('parses a bare array of memories', () => {
    const items = parseMemoryImport(JSON.stringify([
      { content: '  Prefers TypeScript  ', type: 'context' },
      { content: 'Uses pnpm', type: 'preference' },
    ]))
    expect(items).toEqual([
      { content: 'Prefers TypeScript', type: 'context' },
      { content: 'Uses pnpm', type: 'preference' },
    ])
  })

  it('parses the { memories: [...] } shape', () => {
    const items = parseMemoryImport(JSON.stringify({ memories: [{ content: 'hello' }] }))
    expect(items).toEqual([{ content: 'hello', type: 'fact' }])
  })

  it('defaults missing type to "fact"', () => {
    const items = parseMemoryImport(JSON.stringify([{ content: 'plain' }]))
    expect(items[0].type).toBe('fact')
  })

  it('drops entries with no non-empty content', () => {
    const items = parseMemoryImport(JSON.stringify([
      { content: '' },
      { content: '   ' },
      { content: 42 },
      { content: 'keep me' },
    ]))
    expect(items).toEqual([{ content: 'keep me', type: 'fact' }])
  })

  it('drops non-object entries and tolerates an empty array', () => {
    expect(parseMemoryImport('[]')).toEqual([])
    expect(parseMemoryImport(JSON.stringify([null, 7, 'x']))).toEqual([])
  })

  it('returns [] for a JSON object with no memories key', () => {
    expect(parseMemoryImport(JSON.stringify({ foo: 'bar' }))).toEqual([])
  })

  it('throws on corrupt JSON so the caller can surface a file error', () => {
    expect(() => parseMemoryImport('{ not valid json')).toThrow()
  })

  it('ignores unknown extra keys but preserves valid content', () => {
    const items = parseMemoryImport(JSON.stringify([{ content: 'a', junk: [1, 2], type: 'relation', other: null }]))
    expect(items).toEqual([{ content: 'a', type: 'relation' }])
  })

  it('preserves a valid workspace so project memories keep their scope', () => {
    const items = parseMemoryImport(JSON.stringify([
      { content: 'arch note', type: 'project', workspace: 'D:/work/api-server' },
    ]))
    expect(items).toEqual([
      { content: 'arch note', type: 'project', workspace: 'D:/work/api-server' },
    ])
  })

  it('omits the workspace key for global memories instead of writing null', () => {
    const items = parseMemoryImport(JSON.stringify([
      { content: 'global note', type: 'fact', workspace: '' },
      { content: 'also global', type: 'fact', workspace: 42 },
      { content: 'no field', type: 'fact' },
    ]))
    expect(items).toEqual([
      { content: 'global note', type: 'fact' },
      { content: 'also global', type: 'fact' },
      { content: 'no field', type: 'fact' },
    ])
    expect(Object.hasOwn(items[0], 'workspace')).toBe(false)
  })
})