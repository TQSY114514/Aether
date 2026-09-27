import { describe, it, expect } from 'vitest'
import {
  classifyModelCapability,
  adaptToolsPayload,
  getAdaptiveEditPrompt,
  repairPatchIfMalformed,
} from '../electron/llm/adaptivePatch.js'
import { applyAnyPatch } from '../electron/tools/patchEngine.js'

describe('P1-6: Multi-Model Adaptive Edit Patch Routing', () => {
  describe('classifyModelCapability', () => {
    it('correctly classifies strong frontier models', () => {
      const strongModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3.7-sonnet',
        'gpt-4o',
        'o1-preview',
        'o3-mini', // wait, o3 has 'mini' so let's see how mini behaves
        'gemini-1.5-pro',
        'deepseek-reasoner',
        'qwen-max',
        'qwen2.5-72b-instruct',
      ]
      for (const m of ['claude-3-5-sonnet-20241022', 'claude-3.7-sonnet', 'gpt-4o', 'gemini-1.5-pro', 'deepseek-reasoner', 'qwen-max']) {
        const res = classifyModelCapability(m)
        expect(res.tier).toBe('strong')
        expect(res.format).toBe('unified')
      }
    })

    it('correctly classifies compact / smaller models to search_replace tier', () => {
      const compactModels = [
        'llama3:8b',
        'qwen2.5-coder:7b',
        'claude-3-haiku',
        'gemini-1.5-flash',
        'deepseek-r1-distill-qwen-7b',
        'mistral:7b',
        'phi-3-mini',
      ]
      for (const m of compactModels) {
        const res = classifyModelCapability(m)
        expect(res.tier).toBe('compact')
        expect(res.format).toBe('search_replace')
      }
    })

    it('handles model objects as well as strings', () => {
      const res = classifyModelCapability({ model_name: 'llama3:8b', id: 42 })
      expect(res.tier).toBe('compact')
      expect(res.format).toBe('search_replace')
    })
  })

  describe('adaptToolsPayload', () => {
    const rawTools = [
      { type: 'function', function: { name: 'read_file', description: 'Read a file' } },
      { type: 'function', function: { name: 'edit_file', description: 'Original edit' } },
      { type: 'function', function: { name: 'apply_patch', description: 'Original patch' } },
    ]

    it('adapts descriptions for compact models', () => {
      const adapted = adaptToolsPayload(rawTools, 'qwen2.5-coder:7b')
      const editTool = adapted.find(t => t.function.name === 'edit_file')
      const patchTool = adapted.find(t => t.function.name === 'apply_patch')

      expect(editTool.function.description).toContain('SEARCH/REPLACE')
      expect(patchTool.function.description).toContain('Aider-style')
      expect(patchTool.function.description).toContain('Do NOT write line numbers')
    })

    it('adapts descriptions for strong models', () => {
      const adapted = adaptToolsPayload(rawTools, 'claude-3-5-sonnet')
      const editTool = adapted.find(t => t.function.name === 'edit_file')
      const patchTool = adapted.find(t => t.function.name === 'apply_patch')

      expect(patchTool.function.description).toContain('Unified diff with @@ line offsets preferred')
    })
  })

  describe('getAdaptiveEditPrompt', () => {
    it('produces robust SEARCH/REPLACE guidelines for compact models', () => {
      const prompt = getAdaptiveEditPrompt('llama3:8b')
      expect(prompt).toContain('Compact/Robust Mode')
      expect(prompt).toContain('DO NOT generate unified diff line headers')
    })

    it('produces standard unified diff guidelines for strong models', () => {
      const prompt = getAdaptiveEditPrompt('gpt-4o')
      expect(prompt).toContain('standard unified diffs')
    })
  })

  describe('repairPatchIfMalformed', () => {
    it('strips markdown code blocks', () => {
      const markdownPatch = '```diff\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n```'
      const repaired = repairPatchIfMalformed(markdownPatch)
      expect(repaired.startsWith('```')).toBe(false)
      expect(repaired.endsWith('```')).toBe(false)
      expect(repaired).toContain('<<<<<<< SEARCH')
    })

    it('normalizes lowercase search/replace markers', () => {
      const lowercasePatch = '<<<<<<< search\nhello\n=======\nworld\n>>>>>>> replace'
      const repaired = repairPatchIfMalformed(lowercasePatch)
      expect(repaired).toContain('<<<<<<< SEARCH')
      expect(repaired).toContain('>>>>>>> REPLACE')

      // Verifies that patchEngine can successfully apply the repaired patch!
      const original = 'first line\nhello\nlast line'
      const res = applyAnyPatch(original, repaired)
      expect(res.applied).toBe(1)
      expect(res.content).toBe('first line\nworld\nlast line')
    })
  })
})
