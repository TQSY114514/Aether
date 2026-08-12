// ─────────────────────────────────────────────────────────────────────────────
// diffParse.js — W3-t23: /diff 查看器纯解析助手（Electron-free, 无新依赖）
//   parseDiffStat(output)    'git diff --stat' 输出 → [{path, added, removed}]
//   splitDiffFiles(output)   'git diff' 输出按 'diff --git a/' 切文件 → [{path, content}]
//   renderDiffLine(line)     diff 行分类着色（纯函数）: add/del/ctx/meta
// 渲染样式与 toolCards 的 DiffView 一致（+ 绿 / - 红 / 上下文灰）。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析 git diff --stat 输出（'file | N ++--' 格式, 含 Bin 与重命名行）。
 * @param {string} output
 * @returns {Array<{path: string, added: number, removed: number}>}
 *   Bin 行 added/removed 为 null; 无法解析的行跳过。
 */
export function parseDiffStat(output) {
  const lines = String(output || '').split(/\r?\n/)
  const files = []
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    // 常规: ' src/main.ts | 12 +++++-----'（重命名: 'a => b | 5 ++--'）
    let m = line.match(/^(.+?)\s*\|\s*(\d+)\s*([+\-]+)$/)
    if (m) {
      const path = m[1].trim().split(/\s+=>\s+/).pop()
      files.push({
        path,
        added: (m[3].match(/\+/g) || []).length,
        removed: (m[3].match(/-/g) || []).length,
      })
      continue
    }
    // 二进制: ' a.bin | Bin 0 -> 20 bytes'
    m = line.match(/^(.+?)\s*\|\s*Bin\b/)
    if (m) {
      files.push({ path: m[1].trim().split(/\s+=>\s+/).pop(), added: null, removed: null })
    }
  }
  return files
}

/**
 * 按 'diff --git a/... b/...' 头部切分完整 git diff 输出。
 * @param {string} output
 * @returns {Array<{path: string, content: string}>}  content 为去头后的行文本
 */
export function splitDiffFiles(output) {
  const text = String(output || '')
  if (!text.trim()) return []
  const lines = text.split(/\r?\n/)
  const files = []
  let current = null
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    const head = line.match(/^diff --git a\/(.+?) b\//)
    if (head) {
      if (current) files.push(current)
      current = { path: head[1].replace(/^"|"$/g, ''), content: [] }
      continue
    }
    if (current) current.content.push(line)
  }
  if (current) files.push(current)
  return files.map((f) => ({ path: f.path, content: f.content.join('\n') }))
}

/**
 * diff 行分类（着色用; 与 toolCards DiffView 的 add/del/ctx 同语义, 增加 meta）。
 * @param {string} line
 * @returns {{type: 'add'|'del'|'ctx'|'meta', text: string}}
 *   add: 内容 + 行（含 +++ 之外的 +）; del: 内容 - 行; meta: 头部/@@/---/+++; ctx: 其余
 */
export function renderDiffLine(line) {
  const s = String(line || '')
  if (s.startsWith('+++') || s.startsWith('---') || s.startsWith('@@') ||
      s.startsWith('diff --git') || s.startsWith('index ') ||
      s.startsWith('new file') || s.startsWith('deleted file') || s.startsWith('Binary files')) {
    return { type: 'meta', text: s }
  }
  if (s.startsWith('+')) return { type: 'add', text: s }
  if (s.startsWith('-')) return { type: 'del', text: s }
  return { type: 'ctx', text: s }
}

/**
 * 把 diff 文本转成 DiffView 渲染数组（toolCards 同形状 {type, line}）。
 * @param {string} content  git diff 单文件内容 或 snapshot diff 行文本
 * @returns {Array<{type: string, line: string}>}
 */
export function diffToViewLines(content) {
  return String(content || '').split(/\r?\n/).map(renderDiffLine).map((d) => ({ type: d.type, line: d.text }))
}
