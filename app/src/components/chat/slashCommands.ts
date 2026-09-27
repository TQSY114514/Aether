// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/slashCommands.ts — Slash commands registry & actions
//
// Aligns with Claude Code (/doctor, /compact, /review), Aider (/commit, /undo),
// OpenHands (system diagnostics), and Cursor shortcuts.
// ─────────────────────────────────────────────────────────────────────────────

import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export type AgentMode = 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' | 'custom'

export interface SlashCommand {
  id: string
  name: string
  description: string
  prompt?: string
  action?: (arg?: string) => Promise<void> | void
}

/**
 * Built-in slash commands — used when no custom CMD.md files are discovered.
 * Commands with `action` execute directly without inserting a static prompt.
 */
export const DEFAULT_COMMANDS: SlashCommand[] = [
  { id: 'summarize', name: t('slash.summarize', '总结对话'), description: '详细总结以上对话的要点', prompt: '请详细总结以上对话的要点，用中文回复。' },
  { id: 'translate', name: t('slash.translate', '翻译'), description: '将以上内容翻译成中文', prompt: '请将以上内容翻译成中文。' },
  { id: 'polish', name: t('slash.polish', '润色'), description: '润色文字，使其更流畅专业', prompt: '请润色以上文字，使其更加流畅、专业、简洁。' },
  { id: 'explain', name: t('slash.explain', '解释'), description: '用简单语言解释内容', prompt: '请用简单的语言解释以上内容，让初学者也能理解。' },
  { id: 'continue', name: t('slash.continue', '续写'), description: '基于内容自然续写', prompt: '请基于以上内容自然地继续写作。' },
  { id: 'code', name: t('slash.code', '生成代码'), description: '根据需求生成实现代码', prompt: '请生成实现以上需求的代码。' },
  {
    id: 'doctor',
    name: t('slash.doctor', '系统自检'),
    description: t('slash.doctor_desc', '全面诊断系统运行环境、数据库、开发工具链与网络健康'),
    action: async () => {
      const sid = useStore.getState().currentSessionId
      useStore.getState().triggerToast(t('slash.doctor_running', '正在执行系统与工作区自检...'), 'info')
      try {
        const rep = await window.electronAPI.system.doctor({ sessionId: sid || undefined })
        if (sid) {
          await window.electronAPI.message.addNormal({
            session_id: sid,
            role: 'assistant',
            content: rep.markdownReport,
            model_used: 'system:doctor',
          })
          await useStore.getState().loadMessages(sid)
          useStore.getState().triggerToast(t('slash.doctor_done', rep.summary.passes, rep.summary.warnings, rep.summary.failures), rep.overallStatus === 'healthy' ? 'success' : 'info')
        } else {
          window.alert(rep.markdownReport)
        }
      } catch (e: any) {
        useStore.getState().triggerToast(t('slash.doctor_failed', e.message || e), 'error')
      }
    },
  },
  {
    id: 'test',
    name: t('slash.test', '运行测试'),
    description: t('slash.test_desc', '自动检测并执行项目测试套件，失败时可一键智能修复'),
    action: async (arg?: string) => {
      const sid = useStore.getState().currentSessionId
      useStore.getState().triggerToast(t('slash.test_running', '正在执行项目测试套件...'), 'info')
      try {
        const rep = await window.electronAPI.chat.test({ args: arg, sessionId: sid || undefined })
        if (rep.ok || rep.passed) {
          useStore.getState().triggerToast(t('slash.test_passed', rep.command || '', rep.durationMs ?? 0), 'success')
          if (sid) {
            await window.electronAPI.message.addNormal({
              session_id: sid,
              role: 'assistant',
              content: `### 测试运行通过\n\n- **命令**: \`${rep.command || ''}\`\n- **耗时**: ${rep.durationMs || 0}ms\n\n\`\`\`\n${(rep.output || '').slice(-1000)}\n\`\`\``,
              model_used: 'system:test',
            })
            await useStore.getState().loadMessages(sid)
          }
        } else {
          if (rep.error && !rep.command) {
            useStore.getState().triggerToast(rep.error, 'info')
            return
          }
          useStore.getState().triggerToast(t('slash.test_failed', rep.command || ''), 'error')
          if (sid && rep.suggestedRepairPrompt) {
            useStore.getState().sendMessage(rep.suggestedRepairPrompt)
          }
        }
      } catch (e: any) {
        useStore.getState().triggerToast(t('slash.test_error', e?.message || String(e)), 'error')
      }
    },
  },
  {
    id: 'lint',
    name: t('slash.lint', '代码检查'),
    description: t('slash.lint_desc', '运行代码规范与类型检查器，失败时构建自动修复任务'),
    action: async (arg?: string) => {
      const sid = useStore.getState().currentSessionId
      useStore.getState().triggerToast(t('slash.lint_running', '正在运行项目代码与类型检查...'), 'info')
      try {
        const rep = await window.electronAPI.chat.lint({ args: arg, sessionId: sid || undefined })
        if (rep.ok || rep.clean) {
          useStore.getState().triggerToast(t('slash.lint_passed', rep.command || '', rep.durationMs ?? 0), 'success')
          if (sid) {
            await window.electronAPI.message.addNormal({
              session_id: sid,
              role: 'assistant',
              content: `### 代码规范检查通过\n\n- **命令**: \`${rep.command}\`\n- **耗时**: ${rep.durationMs}ms\n\n未发现语法或类型错误。`,
              model_used: 'system:lint',
            })
            await useStore.getState().loadMessages(sid)
          }
        } else {
          if (rep.error && !rep.command) {
            useStore.getState().triggerToast(rep.error, 'info')
            return
          }
          useStore.getState().triggerToast(t('slash.lint_failed', '发现代码规范或类型告警，准备调用 Agent 修复...'), 'warning')
          if (sid && rep.suggestedRepairPrompt) {
            useStore.getState().sendMessage(rep.suggestedRepairPrompt)
          }
        }
      } catch (e: any) {
        useStore.getState().triggerToast(t('slash.lint_error', e.message || e), 'error')
      }
    },
  },
  {
    id: 'checkpoints',
    name: t('slash.checkpoints', '时间旅行检查点'),
    description: t('slash.checkpoints_desc', '打开时间旅行抽屉，查看并回滚文件修改历史快照'),
    action: () => {
      useStore.getState().setCheckpointsOpen(true)
    },
  },
  {
    id: 'review',
    name: t('slash.review', '代码审查'),
    description: t('slash.review_desc', '对工作区改动或指定提交进行资深工程架构与安全审查'),
    action: async (arg?: string) => {
      const sid = useStore.getState().currentSessionId
      try {
        useStore.getState().triggerToast(t('slash.review_extracting', '正在提取 Git 差异并构建审查提示词...'), 'info')
        const res = await window.electronAPI.git.getDiffForReview({ focus: arg, sessionId: sid || undefined })
        if (!res.success) {
          useStore.getState().triggerToast(`提示：${res.error || '无法获取 Git 审查差异'}`, 'info')
          return
        }
        if (sid && res.suggestedReviewPrompt) {
          useStore.getState().sendMessage(res.suggestedReviewPrompt)
        } else {
          window.alert(t('slash.review_no_session', '请先选择或新建一个会话以发起代码审查'))
        }
      } catch (e: any) {
        useStore.getState().triggerToast(t('slash.review_failed', e.message || e), 'error')
      }
    },
  },
  {
    id: 'commit',
    name: t('slash.commit', '提交改动'),
    description: t('slash.commit_desc', '基于当前修改生成语义化信息并提交 Git'),
    action: async () => {
      const sid = useStore.getState().currentSessionId
      try {
        const res = await window.electronAPI.git.craftCommitMessage({ sessionId: sid || undefined })
        if (!res.success) {
          window.alert(t('slash.commit_no_changes', '工作区没有待提交的改动'))
          return
        }
        const msg = window.prompt(t('slash.commit_prompt', '确认提交信息 (可修改)：'), res.suggestedMessage)
        if (msg && msg.trim()) {
          const commitRes = await window.electronAPI.git.commit({ message: msg.trim(), sessionId: sid || undefined })
          if (commitRes.success) {
            useStore.getState().triggerToast(t('slash.commit_success', commitRes.commitHash || '', commitRes.message || ''), 'success')
          } else {
            useStore.getState().triggerToast(t('slash.commit_failed', commitRes.error || '未知错误'), 'error')
          }
        }
      } catch (e: any) {
        useStore.getState().triggerToast(t('slash.commit_failed', e.message || e), 'error')
      }
    },
  },
  {
    id: 'compact',
    name: t('slash.compact_cmd', '压缩上下文'),
    description: t('slash.compact_cmd_desc', '智能压缩对话历史节省 token'),
    action: async () => {
      const sid = useStore.getState().currentSessionId
      if (!sid) return
      try {
        const res = await window.electronAPI.chat.compact(sid)
        if (res.ok) {
          await useStore.getState().loadMessages(sid)
          useStore.getState().triggerToast(t('chat.compact_success', res.beforeCount ?? 0, res.afterCount ?? 0), 'success')
        } else {
          useStore.getState().triggerToast(res.error || t('chat.compact_unnecessary', '无需压缩或压缩失败'), 'info')
        }
      } catch (e: any) {
        useStore.getState().triggerToast(`压缩失败：${e.message || e}`, 'error')
      }
    },
  },
  {
    id: 'undo',
    name: t('slash.undo', '撤销修改'),
    description: t('slash.undo_desc', '按最近一次检查点恢复文件并生成撤销提交'),
    action: async () => {
      try {
        const res = await useStore.getState().undoLastAction()
        if (!res.ok) window.alert(`撤销失败：${res.error || '未知错误'}`)
      } catch {
        window.alert('撤销失败')
      }
    },
  },
  {
    id: 'clear',
    name: '清空对话',
    description: '清空当前对话历史',
    action: async () => {
      const sid = useStore.getState().currentSessionId
      if (sid) {
        await window.electronAPI.message.deleteAfter(sid, 0).catch(() => {})
        useStore.getState().loadMessages(sid)
      }
    },
  },
  {
    id: 'regenerate',
    name: '重新生成',
    description: '撤销最后一条回复并重新生成',
    action: () => {
      useStore.getState().regenerate()
    },
  },
]

/**
 * Intercept and execute typed slash commands from composer input.
 * Supports /doctor, /review, /commit, /compact, /undo, /clear, /mode, /effort, /model.
 * @returns true if intercepted and handled, false otherwise.
 */
export async function executeTypedSlashCommand(
  rawInput: string,
  setInput: (v: string) => void
): Promise<boolean> {
  const trimmed = rawInput.trim()
  if (!trimmed.startsWith('/')) return false

  const parts = trimmed.split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const arg = parts.slice(1).join(' ').trim()

  const store = useStore.getState()
  const sid = store.currentSessionId

  if (cmd === '/undo') {
    setInput('')
    try { localStorage.removeItem(`draft:${sid ?? 'new'}`) } catch {}
    await store.undoLastAction()
    return true
  }

  if (cmd === '/clear') {
    setInput('')
    if (sid) {
      await window.electronAPI.message.deleteAfter(sid, 0).catch(() => {})
      store.loadMessages(sid)
    }
    return true
  }

  if (cmd === '/doctor') {
    setInput('')
    const match = DEFAULT_COMMANDS.find(c => c.id === 'doctor')
    if (match && match.action) await match.action(arg)
    return true
  }

  if (cmd === '/test') {
    setInput('')
    const match = DEFAULT_COMMANDS.find(c => c.id === 'test')
    if (match && match.action) await match.action(arg)
    return true
  }

  if (cmd === '/lint') {
    setInput('')
    const match = DEFAULT_COMMANDS.find(c => c.id === 'lint')
    if (match && match.action) await match.action(arg)
    return true
  }

  if (cmd === '/checkpoints' || cmd === '/history') {
    setInput('')
    store.setCheckpointsOpen(true)
    return true
  }

  if (cmd === '/review') {
    setInput('')
    const match = DEFAULT_COMMANDS.find(c => c.id === 'review')
    if (match && match.action) await match.action(arg)
    return true
  }

  if (cmd === '/commit') {
    setInput('')
    const match = DEFAULT_COMMANDS.find(c => c.id === 'commit')
    if (match && match.action) await match.action(arg)
    return true
  }

  if (cmd === '/compact') {
    setInput('')
    const match = DEFAULT_COMMANDS.find(c => c.id === 'compact')
    if (match && match.action) await match.action(arg)
    return true
  }

  if (cmd === '/mode' && arg) {
    if (['off', 'plan', 'ask', 'auto_confirm', 'auto', 'yolo', 'custom'].includes(arg)) {
      store.setAgentMode(arg as AgentMode)
      setInput('')
      return true
    }
  }

  if (cmd === '/effort' && arg) {
    if (['low', 'medium', 'high'].includes(arg)) {
      store.setThinkingEnabled(true)
      store.setEffortLevel(arg as any)
      setInput('')
      return true
    }
  }

  if (cmd === '/model' && arg) {
    const lowerArg = arg.toLowerCase()
    const all = store.allModels
    const match = all.find(m => m.model_name.toLowerCase().includes(lowerArg) || m.display_name?.toLowerCase().includes(lowerArg))
    if (match && sid) {
      store.saveSessionConfig(sid, { providerId: match.provider_id, modelId: match.id })
      setInput('')
      return true
    }
  }

  return false
}
