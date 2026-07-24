// ───────────────────────────────────────────────────────────────────────────
// Tool Impact Preview — generates human-readable descriptions of what a tool
// call will do, for the permission dialog.
//
// Each function returns a structured object matching the PermissionDialog's
// expected shape: { summary, severity, affectedFiles, riskTags, rollback, alternatives }
// ───────────────────────────────────────────────────────────────────────────

function toolImpact(name, args) {
  const a = (args && typeof args === 'object' ? args : {})

  switch (name) {
    case 'write_file': {
      const p = String(a.path || '')
      const len = String(a.content ?? '').length
      const riskTags: string[] = len > 0 ? ['writes_files'] : []
      return {
        summary: `写入文件: ${p}\n大小: ${len} 字符`,
        severity: len > 100000 ? 'high' : 'medium',
        affectedFiles: [p],
        riskTags,
        rollback: '可通过 git checkout 恢复（工作区已纳入版本控制）',
        alternatives: '可先使用 read_file 预览目标路径的现有内容',
      }
    }
    case 'edit_file': {
      const p = String(a.path || '')
      const oldLen = String(a.old_string ?? '').length
      const newLen = String(a.new_string ?? '').length
      const riskTags: string[] = ['writes_files']
      return {
        summary: `编辑: ${p}\n替换 ${oldLen} → ${newLen} 字符`,
        severity: 'medium',
        affectedFiles: [p],
        riskTags,
        rollback: '可通过 git checkout 恢复（工作区已纳入版本控制）',
        alternatives: '可先使用 read_file 确认编辑位置',
      }
    }
    case 'run_command': {
      const cmd = String(a.command || '')
      const desc = String(a.description || '')
      const cwd = a.cwd ? String(a.cwd) : ''
      const riskTags: string[] = []
      if (/write|>|\/c\s+echo\s|tee\b|cat\s*>/i.test(cmd)) riskTags.push('writes_files')
      if (/curl\b|wget\b|http|https|fetch\b|npm\s+install|pip\s+install|go\s+get|cargo\s+add/i.test(cmd)) riskTags.push('network_or_install')
      if (/npm\s+install|pip\s+install|pnpm\s+add|yarn\s+add|go\s+get|cargo\s+add|apt\s+install|brew\s+install/i.test(cmd)) riskTags.push('installs_deps')
      if (/rm\s+-rf|del\s+\/f|drop\s+table|truncate\b|>\/dev\/null|format/i.test(cmd)) riskTags.push('deletes_files')
      if (/server\b|watch\b|dev\b|start\b|nodemon|vite\b|next\b|react-scripts|python\s+\w+|node\s+\w+/i.test(cmd)) riskTags.push('long_process')
      if (riskTags.length === 0) riskTags.push('read_only')
      const dangerous = /rm\s+-rf|del\s+\/|format\s|c:|shutdown|reboot|curl.*\||wget.*\|/i.test(cmd)
      const severity = dangerous ? 'high' : riskTags.some(t => t === 'deletes_files' || t === 'installs_deps') ? 'medium' : 'low'
      return {
        summary: desc || cmd.slice(0, 120),
        severity,
        affectedFiles: cwd ? [cwd] : [],
        riskTags,
        rollback: riskTags.includes('writes_files') || riskTags.includes('deletes_files')
          ? '可通过 git checkout 恢复（工作区已纳入版本控制）'
          : riskTags.includes('installs_deps')
          ? '可以通过删除 node_modules / .venv 恢复'
          : '命令执行后通常不可直接回滚',
        alternatives: riskTags.includes('writes_files')
          ? '可先使用 write_file 以 dry-run 模式预览'
          : '',
      }
    }
    case 'git_commit': {
      const p = String(a.cwd || '')
      const msg = String(a.message || '').slice(0, 60)
      return {
        summary: `Git 提交: "${msg}"\n目录: ${p || '(当前)'}`,
        severity: 'medium',
        affectedFiles: [p],
        riskTags: ['writes_files'],
        rollback: '可通过 git reset --soft HEAD~1 撤销',
        alternatives: '可先使用 git_diff 确认变更内容',
      }
    }
    case 'apply_patch': {
      const p = String(a.path || '')
      const patchLen = String(a.patch ?? '').length
      return {
        summary: `应用补丁到: ${p}\n补丁大小: ${patchLen} 字符`,
        severity: 'medium',
        affectedFiles: [p],
        riskTags: ['writes_files'],
        rollback: '可通过 git checkout 恢复（工作区已纳入版本控制）',
        alternatives: '可先使用 git_diff 预览差异',
      }
    }
    case 'debug_loop': {
      return {
        summary: '运行自动调试循环（最多 5 轮测试 → 分析 → 修复建议）',
        severity: 'medium',
        affectedFiles: [],
        riskTags: ['long_process'],
        rollback: '调试不修改文件，仅执行测试命令 — 可随时停止',
        alternatives: '',
      }
    }
    case 'delegate_task': {
      const count = Array.isArray(a.tasks) ? a.tasks.length : 0
      return {
        summary: `委派 ${count} 个子任务给并行子代理\n每个子代理有自己的工具调用权限`,
        severity: 'medium',
        affectedFiles: [],
        riskTags: ['long_process'],
        rollback: '子代理仅读取信息，不修改文件（除非你的任务描述明确要求）',
        alternatives: '可直接在当前对话中逐步完成，但速度较慢',
      }
    }
    case 'memory_save': {
      const len = String(a.content ?? '').length
      return {
        summary: `保存记忆（${len} 字符）`,
        severity: 'low',
        affectedFiles: [],
        riskTags: [],
      }
    }
    default:
      return { summary: JSON.stringify(a).slice(0, 200), severity: 'low', affectedFiles: [] }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Diff Preview — generates unified diffs for write_file and edit_file so
// the user can review exact file changes in the ToolCallBlock before
// confirming (Claude Code-style diff blocks).
// ───────────────────────────────────────────────────────────────────────────

const MAX_DIFF_CHARS = 8000
const { readFileSync } = require('fs')

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '\n\n[… diff truncated …]'
}

// Build a simple line-by-line unified diff.
function buildUnifiedDiff(oldLines: string[], newLines: string[]): string {
  const parts: string[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)
  let oi = 0, ni = 0
  while (oi < oldLines.length || ni < newLines.length) {
    const ol = oi < oldLines.length ? oldLines[oi] : null
    const nl = ni < newLines.length ? newLines[ni] : null
    if (ol === null) { parts.push(`+${nl}`); ni++ }
    else if (nl === null) { parts.push(`-${ol}`); oi++ }
    else if (ol === nl) { parts.push(` ${ol}`); oi++; ni++ }
    else {
      const newIdx = nl !== null ? newLines.slice(ni).indexOf(ol) : -1
      const oldIdx = ol !== null ? oldLines.slice(oi).indexOf(nl) : -1
      if (newIdx >= 0 && (oldIdx < 0 || newIdx <= oldIdx)) {
        for (let k = 0; k < newIdx; k++) { parts.push(`+${newLines[ni + k]}`); ni++ }
      } else if (oldIdx >= 0) {
        for (let k = 0; k < oldIdx; k++) { parts.push(`-${oldLines[oi + k]}`); oi++ }
      } else {
        parts.push(`-${ol}`); parts.push(`+${nl}`); oi++; ni++
      }
    }
  }
  return parts.join('\n')
}

export function generateDiff(name: string, args: any): { diff: string; oldPath: string; newPath: string } | null {
  if (name === 'write_file') {
    const filePath = String(args?.path || '')
    const content = String(args?.content ?? '')
    if (!filePath || !content) return null
    const lines = content.split('\n')
    const body = lines.map(l => `+${l}`).join('\n')
    return { diff: truncate(body, MAX_DIFF_CHARS), oldPath: '/dev/null', newPath: filePath }
  }
  if (name === 'edit_file') {
    const filePath = String(args?.path || '')
    const oldS = String(args?.old_string ?? '')
    const newS = String(args?.new_string ?? '')
    if (!filePath || !oldS) return null
    const oldLines = oldS.split('\n')
    const newLines = newS.split('\n')
    const body = buildUnifiedDiff(oldLines, newLines)
    const diff = `--- ${filePath}\n+++ ${filePath}\n${body}`
    return { diff: truncate(diff, MAX_DIFF_CHARS), oldPath: filePath, newPath: filePath }
  }
  return null
}

// Generate a "before vs after" snapshot for any file-touching tool by reading
// the current file state after execution. Returns null if the file doesn't
// exist (new file) or can't be read.
export function generateAfterSnapshot(name: string, args: any): { path: string; content: string; truncated: boolean } | null {
  if (!['write_file', 'edit_file', 'apply_patch'].includes(name)) return null
  const filePath = String(args?.path || '')
  if (!filePath) return null
  try {
    const stat = require('fs').statSync(filePath)
    if (!stat.isFile()) return null
    const buf = readFileSync(filePath)
    const content = buf.toString('utf-8')
    return { path: filePath, content, truncated: content.length > 4000 }
  } catch {
    return null // file may not exist yet (write_file creates it)
  }
}

module.exports = { toolImpact, generateDiff, generateAfterSnapshot, TOOL_LABELS }
