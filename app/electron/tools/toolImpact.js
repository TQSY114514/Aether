// ───────────────────────────────────────────────────────────────────────────
// Tool Impact Preview — generates human-readable descriptions of what a tool
// call will do, for the permission dialog.
//
// Each function returns a structured object matching the PermissionDialog's
// expected shape: { summary, severity, affectedFiles, riskTags, rollback, alternatives }
// ───────────────────────────────────────────────────────────────────────────

function toolImpact(name, args) {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>

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

module.exports = { toolImpact }
