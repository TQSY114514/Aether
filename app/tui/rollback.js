// ─────────────────────────────────────────────────────────────────────────────
// rollback.js — 工具变更回滚（todo 4，M2 双路径）
// 写前快照还原优先（与桌面 toolResultMiddleware 快照语义一致，非 git 工作区
// 也成功）；快照缺失时才回退 git restore（仅当在 git 仓库内）。
// Electron-free：只用 node:fs / node:child_process。
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join, isAbsolute, resolve } from 'node:path'

/**
 * 读取目标文件写前快照。文件不存在也记录（便于回滚时删除）。
 * @param {string} [filePath]
 * @param {string} [cwd]  相对路径解析基准（默认 process.cwd()）
 * @returns {{ path: string, existed: boolean, content: string|null } | null}
 */
export function captureFileSnapshot(filePath, cwd = process.cwd()) {
  if (!filePath) return null
  const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
  if (!existsSync(abs)) return { path: abs, existed: false, content: null }
  try {
    return { path: abs, existed: true, content: readFileSync(abs, 'utf8') }
  } catch {
    return null
  }
}

/**
 * 还原写前快照（M2 主路径）。文件原来存在 → 写回原内容；原来不存在 → 删除。
 * @param {{ path: string, existed: boolean, content: string|null } | null} snap
 * @returns {{ ok: boolean, error?: string }}
 */
export function restoreSnapshot(snap) {
  if (!snap || !snap.path) return { ok: false, error: 'no snapshot' }
  try {
    if (snap.existed) {
      mkdirSync(dirname(snap.path), { recursive: true })
      writeFileSync(snap.path, snap.content ?? '')
    } else if (existsSync(snap.path)) {
      rmSync(snap.path, { force: true })
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

/** 目录是否处于 git 仓库内（.git 存在，含 worktree .git 文件）。 */
export function isGitRepo(dir = process.cwd()) {
  try {
    return existsSync(join(dir, '.git'))
  } catch {
    return false
  }
}

/**
 * git restore 兜底路径（仅快照缺失且 git 仓库时调用）。
 * @param {string} filePath
 * @param {string} [cwd]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function gitRestore(filePath, cwd = process.cwd()) {
  const { execFile } = await import('node:child_process')
  return new Promise((resolve) => {
    execFile('git', ['restore', '--', filePath], { cwd }, (err) => {
      resolve(err ? { ok: false, error: err.message } : { ok: true })
    })
  })
}

/**
 * 回滚统一入口（M2 双路径）：快照还原优先，缺失时 git restore 兜底。
 * @param {object} opts
 * @param {{path:string,existed:boolean,content:string|null}|null} opts.snapshot
 * @param {string} opts.filePath
 * @param {string} [opts.cwd]
 * @returns {Promise<{ ok: boolean, error?: string, via: 'snapshot'|'git' }>}
 */
export async function rollbackChange({ snapshot, filePath, cwd = process.cwd() }) {
  if (snapshot) {
    const r = restoreSnapshot(snapshot)
    return { ...r, via: 'snapshot' }
  }
  if (isGitRepo(cwd)) {
    const r = await gitRestore(filePath, cwd)
    return { ...r, via: 'git' }
  }
  return { ok: false, error: 'no snapshot and not a git repo', via: 'snapshot' }
}

/**
 * 简单的按行 LCS diff（无依赖）。返回补丁行序列。
 * @param {string} original
 * @param {string} current
 * @returns {Array<{ type: 'ctx'|'add'|'del', line: string }>}
 */
export function buildDiff(original, current) {
  const a = String(original ?? '').split('\n')
  const b = String(current ?? '').split('\n')
  const n = a.length
  const m = b.length
  // 大文件防爆：超过阈值走简化 diff（全删+全增）。
  if (n * m > 4_000_000) {
    return [
      ...a.map((line) => ({ type: 'del', line })),
      ...b.map((line) => ({ type: 'add', line })),
    ]
  }
  // LCS 回溯（DP 存长度表）
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'ctx', line: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', line: a[i] }); i++ }
    else { out.push({ type: 'add', line: b[j] }); j++ }
  }
  while (i < n) { out.push({ type: 'del', line: a[i] }); i++ }
  while (j < m) { out.push({ type: 'add', line: b[j] }); j++ }
  return out
}
