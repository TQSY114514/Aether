// ─── Pure-function unit tests (no Electron or DB required) ────────────────
import { describe, it, expect } from 'vitest'

// ─── i18n keyword extractor (copied from autoMemory.js) ───────────────────
const STOP = new Set(['the','a','an','and','or','but','of','to','in','on','for','is','are','was','were','be','been','this','that','it','i','you','he','she','we','they','my','your','his','her','our','their','what','how','why','when','do','does','did','can','could','would','should'])

function keywords(text) {
  const t = String(text || '').toLowerCase()
  const set = new Set()
  for (const w of t.match(/[a-z][a-z0-9_-]{1,}/g) || []) {
    if (!STOP.has(w)) set.add(w)
  }
  const chars = [...t]
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i], b = chars[i + 1]
    if ((a >= '一' && a <= '鿿') && (b >= '一' && b <= '鿿')) {
      set.add(a + b)
      i++
    } else if (a >= '一' && a <= '鿿') {
      set.add(a)
    }
  }
  return set
}

function score(memoryText, qkw) {
  const mkw = keywords(memoryText)
  let hits = 0
  for (const k of qkw) if (mkw.has(k)) hits++
  return hits
}

describe('keywords extraction', () => {
  it('strips stop words', () => {
    const kw = keywords('the cat and the dog')
    expect(kw.has('the')).toBe(false)
    expect(kw.has('and')).toBe(false)
    expect(kw.has('cat')).toBe(true)
    expect(kw.has('dog')).toBe(true)
  })

  it('extracts CJK bigrams', () => {
    const kw = keywords('你好世界')
    // Bigrams: 你好, 世界
    expect(kw.has('你好')).toBe(true)
    expect(kw.has('世界')).toBe(true)
  })

  it('returns empty set for empty string', () => {
    expect(keywords('')).toEqual(new Set())
  })

  it('handles mixed CJK with ascii prefix', () => {
    const kw = keywords('a你好世界')
    // Single-char ascii doesn't match the keyword regex (needs ≥2 chars).
    // 你好 → bigram. 世界 → bigram.
    expect(kw.has('a')).toBe(false)
    expect(kw.has('你好')).toBe(true)
    expect(kw.has('世界')).toBe(true)
    expect(kw.has('好')).toBe(false) // consumed as part of bigram
    expect(kw.has('世')).toBe(false) // consumed as part of bigram
  })
})

describe('keyword scoring', () => {
  it('counts matching keywords', () => {
    const qkw = keywords('python coding project')
    expect(score('I use python for coding', qkw)).toBe(2)
    expect(score('This is about cats', qkw)).toBe(0)
  })
})
