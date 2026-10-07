import { describe, it, expect } from 'vitest'
import Module from 'node:module'

const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === 'electron') {
    return { app: { getPath: () => 'C:/Users/test/AppData/Aether' } }
  }
  return origLoad.apply(this, [request, ...args])
}

describe('evolution reflection provider resolution', () => {
  it('resolves persisted provider id + model name to full database records', async () => {
    const mod = await import('../electron/evolution/reflect')
    const provider = { id: 7, name: 'DeepSeek', api_url: 'https://example.invalid', api_key: 'test', api_format: 'openai' }
    const model = { id: 9, provider_id: 7, model_name: 'deepseek-test' }
    const db = {
      getSetting: (key) => key === 'llm.lastProvider' ? '7' : key === 'llm.lastModel' ? 'deepseek-test' : null,
      getProvider: (id) => id === 7 ? provider : null,
      getModel: () => null,
      prepare: () => ({ get: (name) => name === 'deepseek-test' ? model : null }),
    }

    const resolved = await mod.resolveProvider(db)
    expect(resolved.provider).toEqual(provider)
    expect(resolved.model).toEqual(model)
  })

  it('uses the model provider relation when lastProvider is stale', async () => {
    const mod = await import('../electron/evolution/reflect')
    const provider = { id: 11, name: 'OpenRouter', api_url: 'https://example.invalid', api_key: 'test', api_format: 'openai' }
    const model = { id: 12, provider_id: 11, model_name: 'qwen-test' }
    const db = {
      getSetting: (key) => key === 'llm.lastProvider' ? '999' : key === 'llm.lastModel' ? '12' : null,
      getProvider: (id) => id === 11 ? provider : null,
      getModel: (id) => id === 12 ? model : null,
      prepare: () => ({ get: () => null }),
    }

    const resolved = await mod.resolveProvider(db)
    expect(resolved.provider).toEqual(provider)
    expect(resolved.model).toEqual(model)
  })
})
