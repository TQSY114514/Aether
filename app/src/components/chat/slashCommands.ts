// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/slashCommands.ts — Slash commands registry & actions
//
// Aligned with Hermes, Claude Code, Cursor, and OpenHands command architecture.
// Categorized into Agent & Control, Dev & Verification, and Session & Workflow.
// ─────────────────────────────────────────────────────────────────────────────

import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { getFeatureFlagFresh, setFeatureFlag } from '@/utils/featureFlags'
import type { AgentMode, EffortLevel } from '@/store/types'

export type { AgentMode }

export interface SlashCommand {
  id: string
  name: string
  description: string
  category: 'agent' | 'dev' | 'session'
  paramHint?: string
  prompt?: string
  action?: (arg?: string) => Promise<void> | void
  requiresArg?: boolean
}

/**
 * Developer-centric slash commands catalog.
 * Categorized and actionable: commands with action execute directly;
 * commands with requiresArg auto-fill '/{id} ' so the user can supply parameters.
 */
export const DEFAULT_COMMANDS: SlashCommand[] = [
  // ── Agent & Control ────────────────────────────────────────────────────────
  {
    id: 'mode',
    name: t('slash.mode', '运行模式'),
    description: t('slash.mode_desc', '切换 Agent 权限模式（explore 只读、workspace 受控、auto_review TDD、unrestricted 完全）'),
    category: 'agent',
    paramHint: '[explore|workspace|auto_review|unrestricted]',
    requiresArg: true,
    action: (arg) => {
      if (!arg) return
      const validModes: AgentMode[] = ['explore', 'workspace', 'auto_review', 'unrestricted', 'plan', 'ask', 'auto', 'yolo', 'off', 'auto_confirm', 'custom']
      const lower = arg.toLowerCase().trim() as AgentMode
      if (validModes.includes(lower)) {
        useStore.getState().setAgentMode(lower)
        useStore.getState().triggerToast(t('cmd.set_mode') + ' ' + lower, 'success')
      }
    },
  },
  {
    id: 'effort',
    name: t('slash.effort', '思考预算'),
    description: t('slash.effort_desc', '调整思考深度预算（minimal 极简, low 浅思, medium 标准, high 深度, max 满血, off 关闭）'),
    category: 'agent',
    paramHint: '[minimal|low|medium|high|max|off]',
    requiresArg: true,
    action: (arg) => {
      if (!arg) return
      const lower = arg.toLowerCase().trim()
      const store = useStore.getState()
      if (lower === 'off') {
        store.setThinkingEnabled(false)
        store.triggerToast(t('effort.off'), 'info')
      } else if (['minimal', 'low', 'medium', 'high', 'max'].includes(lower)) {
        store.setThinkingEnabled(true)
        store.setEffortLevel(lower as EffortLevel)
        store.triggerToast(t('cmd.set_effort') + ' ' + lower, 'success')
      }
    },
  },
  {
    id: 'model',
    name: t('slash.model', '切换模型'),
    description: t('slash.model_desc', '按名称或关键词快速切换当前会话模型'),
    category: 'agent',
    paramHint: '[name]',
    requiresArg: true,
    action: (arg) => {
      if (!arg) return
      const store = useStore.getState()
      const sid = store.currentSessionId
      const lowerArg = arg.toLowerCase().trim()
      const match = store.allModels.find(
        (m) => m.model_name.toLowerCase().includes(lowerArg) || m.display_name?.toLowerCase().includes(lowerArg)
      )
      if (match && sid) {
        store.saveSessionConfig(sid, { providerId: match.provider_id, modelId: match.id })
        store.triggerToast(match.display_name || match.model_name, 'success')
      }
    },
  },
  {
    id: 'project',
    name: t('slash.project', '切换项目'),
    description: t('slash.project_desc', '切换或打开独立项目工作区'),
    category: 'agent',
    paramHint: '[name]',
    requiresArg: true,
    action: async (arg) => {
      const store = useStore.getState()
      if (!arg) {
        // Open project selection
        return
      }
      const lower = arg.toLowerCase().trim()
      const match = store.projects.find(p => p.name.toLowerCase().includes(lower) || p.root_path.toLowerCase().includes(lower))
      if (match) {
        await store.openProject(match.id)
        store.triggerToast(match.name, 'success')
      }
    },
  },
  {
    id: 'poor',
    name: t('slash.poor', '穷鬼省流模式'),
    description: t('slash.poor_desc', '切换穷鬼省流模式：严格压制思考轮数至 8 轮，激进压缩上下文节省 Token'),
    category: 'agent',
    action: async () => {
      try {
        const current = await getFeatureFlagFresh('agent.poorMode', false)
        const next = !current
        const ok = await setFeatureFlag('agent.poorMode', next)
        if (!ok) {
          useStore.getState().triggerToast(t('slash.poor_failed', '切换穷鬼省流模式失败，请重试'), 'error')
          return
        }
        useStore.getState().triggerToast(
          next ? t('slash.poor_enabled', '穷鬼省流模式已开启：最大循环限制为 8 轮，激进压缩 Token') : t('slash.poor_disabled', '穷鬼省流模式已关闭：恢复标准预算'),
          next ? 'info' : 'success'
        )
      } catch {
        useStore.getState().triggerToast(t('slash.poor_failed', '切换穷鬼省流模式失败，请重试'), 'error')
      }
    },
  },

  // ── Dev & Verification ─────────────────────────────────────────────────────
  {
    id: 'doctor',
    name: t('slash.doctor', '系统自检'),
    description: t('slash.doctor_desc', '全面诊断系统运行环境、数据库、开发工具链与网络健康'),
    category: 'dev',
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
    id: 'review',
    name: t('slash.review', '代码审查'),
    description: t('slash.review_desc', '对工作区改动或指定提交进行资深工程架构与安全审查'),
    category: 'dev',
    paramHint: '[focus]',
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
    id: 'test',
    name: t('slash.test', '运行测试'),
    description: t('slash.test_desc', '自动检测并执行项目测试套件，失败时可一键智能修复'),
    category: 'dev',
    paramHint: '[args]',
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
    category: 'dev',
    paramHint: '[args]',
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
    id: 'commit',
    name: t('slash.commit', '提交改动'),
    description: t('slash.commit_desc', '基于当前修改生成语义化信息并提交 Git'),
    category: 'dev',
    paramHint: '[msg]',
    action: async (arg?: string) => {
      const sid = useStore.getState().currentSessionId
      try {
        if (arg && arg.trim()) {
          const commitRes = await window.electronAPI.git.commit({ message: arg.trim(), sessionId: sid || undefined })
          if (commitRes.success) {
            useStore.getState().triggerToast(t('slash.commit_success', commitRes.commitHash || '', commitRes.message || ''), 'success')
          } else {
            useStore.getState().triggerToast(t('slash.commit_failed', commitRes.error || '未知错误'), 'error')
          }
          return
        }
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
    id: 'undo',
    name: t('slash.undo', '撤销操作'),
    description: t('slash.undo_desc', '按最近一次检查点恢复文件并生成撤销提交'),
    category: 'dev',
    action: async () => {
      try {
        const res = await useStore.getState().undoLastAction()
        if (!res.ok) window.alert(t('chat.undo_failed', res.error || t('chat.unknown_error')))
      } catch {
        window.alert(t('chat.undo_failed', t('chat.unknown_error')))
      }
    },
  },

  // ── Session & Workflow ─────────────────────────────────────────────────────
  {
    id: 'compact',
    name: t('slash.compact', '压缩上下文'),
    description: t('slash.compact_desc', '智能压缩对话历史以节省 Token 预算'),
    category: 'session',
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
    id: 'clear',
    name: t('slash.clear', '清空历史'),
    description: t('slash.clear_desc', '清空当前会话的所有历史消息'),
    category: 'session',
    action: async () => {
      const sid = useStore.getState().currentSessionId
      if (sid) {
        await window.electronAPI.message.deleteAfter(sid, 0).catch(() => {})
        useStore.getState().loadMessages(sid)
      }
    },
  },
  {
    id: 'fork',
    name: t('slash.fork', '分叉会话'),
    description: t('slash.fork_desc', '从当前节点分叉出独立会话分支'),
    category: 'session',
    action: async () => {
      const store = useStore.getState()
      const sid = store.currentSessionId
      if (!sid) return
      const newSid = await store.forkSession()
      if (newSid) {
        store.triggerToast(t('context_meter.fork_success', '会话分叉成功'), 'success')
      }
    },
  },
  {
    id: 'tasks',
    name: t('slash.tasks', '后台任务'),
    description: t('slash.tasks_desc', '打开后台任务与子代理监控驾驶舱'),
    category: 'session',
    action: () => {
      useStore.getState().setTasksOpen(true)
    },
  },
  {
    id: 'checkpoints',
    name: t('slash.checkpoints', '历史快照'),
    description: t('slash.checkpoints_desc', '打开历史回滚快照与检查点抽屉'),
    category: 'session',
    action: () => {
      useStore.getState().setCheckpointsOpen(true)
    },
  },
  {
    id: 'history',
    name: t('slash.checkpoints', '历史快照'),
    description: t('slash.checkpoints_desc', '打开历史回滚快照与检查点抽屉'),
    category: 'session',
    action: () => {
      useStore.getState().setCheckpointsOpen(true)
    },
  },
  {
    id: 'btw',
    name: t('slash.btw', '旁支提问'),
    description: t('slash.btw_desc', '打开只读旁支提问抽屉，不污染会话主历史'),
    category: 'session',
    action: () => {
      useStore.getState().toggleBtw()
    },
  },
  {
    id: 'regenerate',
    name: t('slash.regenerate', '重新生成'),
    description: t('slash.regenerate_desc', '撤销最后一条回复并重新生成'),
    category: 'session',
    action: () => {
      useStore.getState().regenerate()
    },
  },
  {
    id: 'help',
    name: t('slash.help', '指令帮助'),
    description: t('slash.help_desc', '列出所有支持的斜杠命令与快捷键说明'),
    category: 'session',
    action: () => {
      const msg = [
        '### Aether 快捷指令指南',
        '',
        '#### 智能体与控制 (Agent & Control)',
        '- `/mode [explore|workspace|auto_review|unrestricted]` — 切换 Agent 运行权限模式',
        '- `/effort [minimal|low|medium|high|max|off]` — 调整模型思考深度预算',
        '- `/model [name]` — 快速切换模型',
        '- `/project [name]` — 快速切换或打开项目工作区',
        '- `/poor` — 开关穷鬼省流模式',
        '',
        '#### 开发与验证 (Dev & Verification)',
        '- `/doctor` — 运行系统运行环境与工具链全面自检',
        '- `/review` — 审查工作区 Git Diff 代码修改',
        '- `/test [args]` — 执行项目测试套件',
        '- `/lint [args]` — 执行代码规范与类型检查',
        '- `/commit [msg]` — 智能语义化 Git Commit',
        '- `/undo` — 撤销上一步操作并恢复检查点',
        '',
        '#### 会话与工作流 (Session & Workflow)',
        '- `/compact` — 智能压缩上下文历史以节省 Token',
        '- `/clear` — 清空当前会话历史',
        '- `/fork` — 分叉当前会话到新分支',
        '- `/tasks` — 打开后台任务与子代理监控抽屉',
        '- `/checkpoints` — 打开时间旅行历史快照抽屉',
        '- `/history` — 打开时间旅行历史快照抽屉',
        '- `/btw` — 打开只读旁支提问抽屉 (Alt+B)',
        '- `/help` — 查看本帮助',
      ].join('\n')

      const sid = useStore.getState().currentSessionId
      if (sid) {
        window.electronAPI.message.addNormal({
          session_id: sid,
          role: 'assistant',
          content: msg,
          model_used: 'system:help',
        }).then(() => {
          useStore.getState().loadMessages(sid)
        })
      }
    },
  },
]

/**
 * Intercept and execute typed slash commands from composer input.
 */
export async function executeTypedSlashCommand(
  rawInput: string,
  setInput: (v: string) => void
): Promise<boolean> {
  const trimmed = rawInput.trim()
  if (!trimmed.startsWith('/')) return false

  const parts = trimmed.split(/\s+/)
  const cmdId = parts[0].slice(1).toLowerCase()
  const arg = parts.slice(1).join(' ').trim()

  const cmd = DEFAULT_COMMANDS.find((c) => c.id.toLowerCase() === cmdId)
  if (cmd && cmd.action) {
    setInput('')
    await cmd.action(arg)
    return true
  }

  return false
}
