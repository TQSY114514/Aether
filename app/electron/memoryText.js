// ───────────────────────────────────────────────────────────────────────────
// Memory text utilities — shared by the data layer (database.js write-time
// dedup) and the extraction pipeline (llm/autoMemory.js).
//
// Single source of truth for content normalization, keyword tokenization and
// Jaccard similarity so every dedup layer compares texts identically.
// Plain CommonJS, no Electron imports (SDK/database safe).
// ───────────────────────────────────────────────────────────────────────────

const STOP = new Set(['the','a','an','and','or','but','of','to','in','on','for','is','are','was','were','be','been','this','that','it','i','you','he','she','we','they','my','your','his','her','our','their','what','how','why','when','do','does','did','can','could','would','should'])

// 规范化记忆内容用于去重比较：小写 + 折叠空白 + 收尾。
// 历史 bug：去重 key 曾用「前 50 字符」而查找用「完整内容」，前后不一致
// 导致 >50 字符的重复记忆永远拦不住 —— 统一用规范化后的完整内容。
function normalizeContent(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// 关键词 Jaccard 相似度 —— 改写级语义去重用。提取 LLM 每轮对同一事实的措辞
// 略有不同（"user likes Python" vs "User prefers Python"），精确匹配拦不住；
// 高相似按重复处理：solidify 已有行而不是插入副本（Hermes 式合并）。
// 阈值取 0.7 有讲究：换值矛盾（"prefers Python" vs "prefers JavaScript"）
// 共享主题词、只换一个值词，Jaccard ≈0.5-0.67 —— 那是真冲突，必须放行给
// 冲突检测；而同一事实的改写（增删修饰词）通常 ≥0.7。
const SIMILAR_JACCARD = 0.7 // ≥ 此值视为同一事实的改写
const SIMILAR_MIN_HITS = 2  // 交集绝对下限，防短文本误判

function jaccard(a, b) {
  let inter = 0
  for (const k of a) if (b.has(k)) inter++
  const uni = a.size + b.size - inter
  return uni === 0 ? 0 : inter / uni
}

function keywords(text) {
  const t = String(text || '').toLowerCase()
  const set = new Set()
  for (const w of t.match(/[a-z][a-z0-9_-]{1,}/g) || []) {
    if (!STOP.has(w)) set.add(w)
  }
  // CJK bigrams: two consecutive CJK characters form a token instead of
  // single chars, which produces false-positive matches for any shared character.
  const chars = [...t]
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i], b = chars[i + 1]
    if ((a >= '一' && a <= '鿿') && (b >= '一' && b <= '鿿')) {
      set.add(a + b)
      i++ // skip next char (already consumed)
    } else if (a >= '一' && a <= '鿿') {
      set.add(a) // standalone CJK (adjacent to non-CJK)
    }
  }
  return set
}

module.exports = { STOP, normalizeContent, keywords, jaccard, SIMILAR_JACCARD, SIMILAR_MIN_HITS }
