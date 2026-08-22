// ───────────────────────────────────────────────────────────────────────────
// strategyStore.js — 有界策展的策略记忆（Hermes 式真学习核心）。
//
// 与旧 GEP 的区别：
//   - 条目由 LLM 反思真实会话轨迹提炼（中文），不是硬编码英文罐头基因；
//   - 写入时拒绝重复（复用 memoryText 的精确匹配 + Jaccard 近重复检测），
//     重复观察走"确认已有条目"而不是无限累积副本；
//   - 容量有界（默认 ~2200 字符），满了向反思器报 needsMerge，
//     强制下一轮反思输出合并/删减操作而不是继续新增；
//   - 持久化为 userData 下的 STRATEGY.md，用户可直接查看/手改，
//     重启不丢、跨会话共享（旧 guidance 是内存 Map，重启失忆）。
//
// 注入路径：toolLoop.js 每轮把 freeze() 快照拼进 system prompt。
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { normalizeContent, keywords, jaccard, SIMILAR_JACCARD, SIMILAR_MIN_HITS } = require('../memoryText')

// Hermes MEMORY.md 同量级的有界预算：够放 ~30 条一句话策略，
// 又保证注入 system prompt 的 token 开销可忽略。
const MAX_CHARS = 2200
// 改写级判重阈值：与 memory 去重同一套标准（≥0.7 视为同一策略的复述）。
const STRATEGY_SIMILAR_JACCARD = SIMILAR_JACCARD

let storeDir = null

function setStoreDir(dir) { storeDir = String(dir || '') || null }

function getStoreDir() {
  if (storeDir) return storeDir
  try {
    // 主进程运行时才有 electron.app；测试/纯 Node 环境走 fallback。
    const { app } = require('electron')
    storeDir = path.join(app.getPath('userData'), 'evolution')
  } catch {
    storeDir = path.join(__dirname, '..', '..', 'evolution-skills')
  }
  return storeDir
}

function getStoreFile() { return path.join(getStoreDir(), 'STRATEGY.md') }

// ─── 解析 ──────────────────────────────────────────────────────────────────
// 文件格式（人类可读可手改）：
//   # Aether 策略记忆（自进化）
//   - [S1] 一句话策略…
//   - [S2] …
function parseStore(text) {
  const entries = []
  const re = /^-\s*\[S(\d+)\]\s*(.+)$/gm
  let m
  while ((m = re.exec(String(text || ''))) !== null) {
    const id = Number(m[1])
    const content = m[2].trim()
    if (Number.isFinite(id) && content) entries.push({ id, text: content })
  }
  return entries
}

function serialize(entries) {
  const header = '# Aether 策略记忆（自进化）\n\n<!-- 由反思引擎维护，可手动编辑；容量超限时引擎会强制合并重叠条目 -->\n'
  if (!entries.length) return header
  return header + entries.map(e => `- [S${e.id}] ${e.text}`).join('\n') + '\n'
}

function load() {
  try {
    const text = fs.readFileSync(getStoreFile(), 'utf8')
    const entries = parseStore(text)
    const chars = entries.reduce((n, e) => n + e.text.length, 0)
    return { entries, chars }
  } catch {
    return { entries: [], chars: 0 }
  }
}

function save(entries) {
  const dir = getStoreDir()
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  fs.writeFileSync(getStoreFile(), serialize(entries), 'utf8')
}

// ─── 判重 ──────────────────────────────────────────────────────────────────
// 返回与 text 最相似的已有条目（精确 > 改写），无命中返回 null。
function findSimilar(existing, text) {
  const norm = normalizeContent(text)
  if (!norm) return null
  for (const e of existing) {
    if (normalizeContent(e.text) === norm) return e
  }
  const kw = keywords(text)
  if (kw.size === 0) return null
  for (const e of existing) {
    const ekw = keywords(e.text)
    let inter = 0
    for (const k of kw) if (ekw.has(k)) inter++
    if (inter >= SIMILAR_MIN_HITS && jaccard(kw, ekw) >= STRATEGY_SIMILAR_JACCARD) return e
  }
  return null
}

function totalChars(entries) { return entries.reduce((n, e) => n + e.text.length, 0) }

// ─── 增删改 ────────────────────────────────────────────────────────────────
// 新增一条策略。重复（精确或改写级）直接拒绝——策展优于累积。
// 容量是硬约束：投影超限直接拒绝不落盘（此前只标 needsMerge 仍保存，
// 超容内容会持续膨胀）。行开销 ≈8 字符（"- [Sn] " + 换行）。
const LINE_OVERHEAD = 8

function addEntry(text) {
  const t = String(text || '').trim()
  if (!t) return { ok: false, reason: 'empty' }
  const { entries } = load()
  const dup = findSimilar(entries, t)
  if (dup) return { ok: false, reason: 'duplicate', duplicateOf: dup.id }
  if (t.length > MAX_CHARS) return { ok: false, reason: 'over-capacity', needsMerge: true }
  const projected = totalChars(entries) + t.length + LINE_OVERHEAD
  if (entries.length > 0 && projected > MAX_CHARS) return { ok: false, reason: 'over-capacity', needsMerge: true }
  let nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1
  entries.push({ id: nextId, text: t })
  save(entries)
  return { ok: true, id: nextId, chars: totalChars(entries), needsMerge: totalChars(entries) > MAX_CHARS }
}

function replaceEntry(id, newText) {
  const t = String(newText || '').trim()
  if (!t) return { ok: false, reason: 'empty' }
  const { entries } = load()
  const target = entries.find(e => e.id === Number(id))
  if (!target) return { ok: false, reason: 'not-found' }
  // 替换后的内容不得与"其他"条目重复。
  const others = entries.filter(e => e.id !== target.id)
  const dup = findSimilar(others, t)
  if (dup) return { ok: false, reason: 'duplicate', duplicateOf: dup.id }
  // 投影容量检查：替换不得让库更超限（超容时只允许换得更短）。
  if (t.length > MAX_CHARS) return { ok: false, reason: 'over-capacity', needsMerge: true }
  const projected = totalChars(others) + t.length + LINE_OVERHEAD
  if (others.length > 0 && projected > MAX_CHARS) return { ok: false, reason: 'over-capacity', needsMerge: true }
  target.text = t
  save(entries)
  return { ok: true, id: target.id, chars: totalChars(entries), needsMerge: totalChars(entries) > MAX_CHARS }
}

function removeEntry(id) {
  const { entries } = load()
  const kept = entries.filter(e => e.id !== Number(id))
  if (kept.length === entries.length) return { ok: false, reason: 'not-found' }
  save(kept)
  return { ok: true, removed: Number(id), chars: totalChars(kept), needsMerge: totalChars(kept) > MAX_CHARS }
}

// ─── 注入与状态 ────────────────────────────────────────────────────────────
// 冻结快照：给 system prompt 用。空库返回 null（不注入空块浪费 token）。
// 预算感知装填：即使库已超容（needsMerge 待合并），注入也永不超 MAX_CHARS
// ——按序贪心装填，装不下的条目留给下次反思合并。
function freeze() {
  const { entries } = load()
  if (!entries.length) return null
  const HEADER = '<learned_strategies>\n以下是从既往会话中提炼的有效工作策略，优先遵循：\n'
  const FOOTER = '\n</learned_strategies>'
  let budget = MAX_CHARS - HEADER.length - FOOTER.length
  const lines = []
  for (const e of entries) {
    const line = `- [S${e.id}] ${e.text}`
    if (line.length > budget) break
    lines.push(line)
    budget -= line.length + 1
  }
  if (!lines.length) return null
  return HEADER + lines.join('\n') + FOOTER
}

function stats() {
  const { entries, chars } = load()
  return { count: entries.length, chars, maxChars: MAX_CHARS, needsMerge: chars > MAX_CHARS }
}

module.exports = {
  MAX_CHARS,
  setStoreDir,
  getStoreDir,
  getStoreFile,
  load,
  parseStore,
  serialize,
  findSimilar,
  addEntry,
  replaceEntry,
  removeEntry,
  freeze,
  stats,
}
