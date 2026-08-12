// ─────────────────────────────────────────────────────────────────────────────
// fileRef.js — W3-t18: @文件引用纯助手（Electron-free, 无新依赖）
//   resolveFileRefs(prompt, cwd): 解析 prompt 中"词首 @path" token →
//     存在且 ≤50KB 读内容 → 上下文块前置注入; >50KB → 仅截断标注;
//     缺失/不可读 → token 原样保留（不崩溃）。
//   globCandidates(partial, cwd, limit): 递归 lite 遍历 workspace,
//     前缀匹配相对路径 → 候选列表（目录标记, 供候选面板渲染）。
// 标记格式（文档写入 AGENTS/README 语义）:
//   [file: @path]\n<content>\n[/file]    — 注入模型上下文的块
//   [file: @path] (truncated: N bytes)   — 超大文件占位标注
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

// 单文件注入上限: 50KB（超出只标注不注入内容）
export const FILE_REF_LIMIT = 50 * 1024

// glob 遍历护栏: 跳过的大目录（性能; 用户引用这些目录内文件的机会极低）
const SKIP_DIRS = new Set(['.git', 'node_modules', '.aether-workspace', 'dist', '.cache'])
// 遍历深度上限 + 访问条目总数上限（防止超大工作区挂起）
const MAX_DEPTH = 6
const MAX_VISITED = 3000

// Windows 风格路径比较: 统一小写 + 正斜杠（平台无关的字符串判定）
const norm = (s) => String(s).replace(/\\/g, '/').toLowerCase()

/**
 * 词首 '@' token 正则（要求 @ 在行首或紧跟空白, 不匹配词中 @; 到下一个
 * 空白/引号/@ 为止）。分两步匹配, 便于精确计算 token 起始下标。
 */
const AT_TOKEN_RE = /(?:^|\s)@([^\s@"']+)/g

/**
 * 解析 prompt 中的 @path 引用并构造注入块。
 * @param {string} prompt
 * @param {string} cwd
 * @returns {{ prompt: string, refs: Array<{token: string, path: string, ok: boolean, size: number|null, content: string|null}> }}
 *   refs: 每个 @token 的解析结果（ok=false 表示缺失/不可读/非文件）;
 *   prompt: 重写后的文本（成功/截断引用被块替换, 失败引用原样保留）。
 */
export function resolveFileRefs(prompt, cwd) {
  const text = String(prompt || '')
  const refs = []
  let out = ''
  let last = 0
  AT_TOKEN_RE.lastIndex = 0
  let m
  while ((m = AT_TOKEN_RE.exec(text)) !== null) {
    const token = m[0].slice(m[0].lastIndexOf('@')) // '@path'
    const partial = m[1]
    // 正则已保证 @ 在行首或紧跟空白（词中 @ 不匹配）; 防御性跳过空 token
    if (!partial) continue
    const resolved = resolveOneRef(token, partial, cwd)
    refs.push(resolved)
    // 保留匹配前的空白（m[0] 可能以 ' ' 开头）, 其余原文照抄
    const lead = m[0][0] === ' ' ? 1 : 0
    out += text.slice(last, m.index + lead)
    // 成功/截断 → 块替换 token; 失败 → token 原样保留
    out += resolved.block != null ? resolved.block : token
    last = m.index + m[0].length
  }
  out += text.slice(last)
  return { prompt: out, refs }
}

function resolveOneRef(token, partial, cwd) {
  const path = join(String(cwd || process.cwd()), partial)
  const base = { token, path, ok: false, size: null, content: null, block: null }
  try {
    const st = statSync(path)
    if (!st.isFile()) return base // 目录引用: 留 token, 不注入
    base.size = st.size
    if (st.size > FILE_REF_LIMIT) {
      base.block = `[file: ${token}] (truncated: ${st.size} bytes)`
      return base
    }
    const content = readFileSync(path, 'utf8')
    base.ok = true
    base.content = content
    base.block = `\n\n[file: ${token}]\n${content}\n[/file]\n`
    return base
  } catch {
    return base // 不存在/不可读 → 原样保留
  }
}

/**
 * 递归收集 workspace 下与 partial 前缀匹配的相对路径候选。
 * @param {string} partial  '@' 后的部分（可为空 → 全部）
 * @param {string} cwd
 * @param {number} [limit]
 * @returns {Array<{path: string, isDir: boolean}>}  相对路径用正斜杠
 */
export function globCandidates(partial, cwd, limit = 30) {
  const needle = norm(partial || '')
  const out = []
  let visited = 0
  const walk = (dir, depth) => {
    if (out.length >= limit || visited >= MAX_VISITED || depth > MAX_DEPTH) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    visited += entries.length
    const names = entries.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1))
    for (const e of names) {
      if (out.length >= limit) return
      const rel = join(dir, e.name).slice(String(cwd).length).replace(/^[\\/]+/, '').replace(/\\/g, '/')
      const isDir = e.isDirectory()
      if (isDir && SKIP_DIRS.has(e.name)) continue
      if (norm(rel).startsWith(needle)) {
        out.push({ path: rel, isDir })
      }
      if (isDir) walk(join(dir, e.name), depth + 1)
    }
  }
  try { walk(String(cwd || process.cwd()), 0) } catch {}
  return out.slice(0, limit)
}
