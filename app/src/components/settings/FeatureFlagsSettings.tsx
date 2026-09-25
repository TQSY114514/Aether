import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, ShieldCheck, Search, Sparkles } from 'lucide-react'
import { useUI } from '@/components/ui/feedback'

const CATEGORY_LABELS: Record<string, string> = {
  agent: 'Agent 执行与路由内核 (Agent Runtime)',
  'code-intel': '代码情报与语义分析 (Code Intelligence)',
  exec: '沙箱与远程执行后端 (Execution Backends)',
  learning: '自进化记忆与技能提炼 (Self-Evolving Memory)',
  ecosystem: '本地网关与生态扩展 (Ecosystem & Gateway)',
  debug: '可观测性与诊断日志 (Observability & Debug)',
  ux: '交互体验与引导 (User Experience)',
}

const FLAG_ZH_NAMES: Record<string, string> = {
  'debug.fileLog': '持久化主进程日志 (aetherai.log)',
  'debug.logForward': '实时转发主进程日志至前端诊断面板',
  'repoMap.enabled': '注入 AST 仓库符号拓扑图 (RepoMap)',
  'lsp.full': '启用全量 LSP 语言服务 (定义/引用/重命名)',
  'exec.docker': 'Docker 容器隔离沙箱执行后端',
  'exec.ssh': 'SSH 远程主机命令执行后端',
  'exec.cloud': '云端安全沙箱执行后端',
  'exec.docker.defaultForAuto': 'Auto 模式优先使用 Docker 沙箱执行 Shell',
  'scheduler.queue': '后台优先级任务队列与崩溃恢复',
  'agent.worktreeIsolation': '多子代理独立 Git Worktree 隔离',
  'agent.shadowWorkspace': 'Auto 模式影子工作区预演与测试验证',
  'agent.runnerUpReview': 'Arena ELO 亚军模型双盲 Diff 交叉审查',
  'agent.visualVerification': '前端修改后离屏渲染与视觉报错自愈循环',
  'agent.backgroundReview': '文件修改后后台静默代码安全与质量审计',
  'agent.toolRouter': '意图感知按需工具子集路由',
  'agent.toolRouter.staged': '四阶段 (Explore/Build/Verify/Deliver) 增量工具路由',
  'agent.cachePrefixStability': 'Prompt Cache 前缀严格单调排序与系统指令前置',
  'agent.shrinkRetry': '预算耗尽自动缩围收敛并追加 4 轮收尾重试',
  'memory.codeUnderstanding': '代码结构与模块拓扑持久化至 SQLite 知识图谱',
  'agent.orchestrator': 'Manager 多子代理并行拆解与汇总编排',
  'network.policy': 'Agent 联网工具域名白名单策略门禁',
  'memory.experienceReplay': '成功任务轨迹经验池召回与回放',
  'skills.selfEvolution': 'Agent 自主草拟与演进可复用技能模板',
  'llm.autoFallback': '429 / 5xx 跨供应商透明故障转移',
  'llm.smartPool': '多免费额度供应商智能负载均衡池',
  'llm.tokenCompression': '工具超长输出多级空白与结构压缩',
  'gateway.enabled': '本地 OpenAI 兼容 HTTP 网关服务',
  'agent.a2aProtocol': 'Agent-to-Agent (A2A) 跨代理标准通信帧协议',
  'plugin.sdk': '第三方插件 SDK 注册支持',
  'ux.firstRunWizard': '首次启动供应商与权限安全配置向导',
  'arena.objectiveArena': 'Objective Arena 自动化沙箱可验证评测与 ELO 定级',
}

export default function FeatureFlagsSettings() {
  const { toast } = useUI()
  const [flags, setFlags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const loadFlags = async () => {
    try {
      const list = await window.electronAPI.flags.list()
      setFlags(list || [])
    } catch (e) {
      console.error('Failed to load flags:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFlags()
    const unsubs = [
      window.electronAPI.flags.onChanged(() => {
        loadFlags()
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const toggleFlag = async (key: string, value: boolean) => {
    try {
      await window.electronAPI.flags.set(key, value)
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: value } : f)))
    } catch (e) {
      console.error('Failed to toggle flag:', e)
      toast('切换特性开关失败', { type: 'error' })
    }
  }

  const applySafeMode = async () => {
    try {
      const res = await window.electronAPI.flags.safeMode()
      if (res.ok) {
        toast('已应用安全模式（关闭所有实验性开关，保留核心稳定特性）', { type: 'success' })
        loadFlags()
      }
    } catch (e) {
      console.error('Failed to apply safe mode:', e)
      toast('应用安全模式失败', { type: 'error' })
    }
  }

  const applyFullMode = async () => {
    if (!confirm('开启全部内核特性将解锁完整实验能力（如影子工作区、视觉自愈、双模型复审等）。是否继续？')) return
    try {
      let count = 0
      for (const f of flags) {
        if (!f.enabled) {
          await window.electronAPI.flags.set(f.key, true)
          count++
        }
      }
      if (count > 0) {
        toast(`已开启全部完整模式（新激活 ${count} 项内核能力）`, { type: 'success' })
        loadFlags()
      } else {
        toast('全部特性已处于开启状态', { type: 'info' })
      }
    } catch (e) {
      console.error('Failed to apply full mode:', e)
      toast('开启完整模式失败', { type: 'error' })
    }
  }

  const filteredFlags = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return flags
    return flags.filter((f) => {
      const zh = FLAG_ZH_NAMES[f.key] || ''
      return (
        f.key.toLowerCase().includes(q) ||
        String(f.description || '').toLowerCase().includes(q) ||
        zh.toLowerCase().includes(q) ||
        String(f.category || '').toLowerCase().includes(q)
      )
    })
  }, [flags, query])

  if (loading) return null

  const enabledCount = flags.filter((f) => f.enabled).length

  const grouped: Record<string, any[]> = {}
  for (const f of filteredFlags) {
    if (!grouped[f.category]) grouped[f.category] = []
    grouped[f.category].push(f)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                内核特性开关矩阵 (Feature Flags Registry)
              </h2>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
              >
                {enabledCount} / {flags.length} 已启用
              </span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              集中管控 Aether 全部 24 项底层引擎开关，所有配置实时持久化至本地 SQLite settings 表。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyFullMode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border hover:bg-[var(--bg-secondary)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              完整全开模式
            </button>
            <button
              type="button"
              onClick={applySafeMode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border hover:bg-[var(--bg-secondary)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <ShieldCheck size={14} className="text-green-600" />
              一键安全模式
            </button>
          </div>
        </div>

        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索特性键名、中文名称或功能描述 (如 cache, docker, worktree, lsp)..."
            className="w-full bg-transparent outline-none text-xs"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="rounded-lg p-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>
                {CATEGORY_LABELS[cat] || cat.toUpperCase()}
              </h3>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {list.filter((x) => x.enabled).length}/{list.length} active
              </span>
            </div>
            <div className="space-y-3">
              {list.map((f) => {
                const zhTitle = FLAG_ZH_NAMES[f.key]
                return (
                  <div
                    key={f.key}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg border transition-colors"
                    style={{
                      borderColor: f.enabled ? 'var(--accent)' : 'var(--border)',
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    <div className="pr-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {zhTitle && (
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {zhTitle}
                          </span>
                        )}
                        <span
                          className="text-[11px] font-mono px-1.5 py-0.5 rounded border"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          {f.key}
                        </span>
                      </div>
                      <span className="text-[11px] block mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {f.description}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={f.enabled}
                      onClick={() => toggleFlag(f.key, !f.enabled)}
                      className="relative w-10 h-5 rounded-full transition-colors shrink-0 mt-0.5 cursor-pointer"
                      style={{ backgroundColor: f.enabled ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                        style={{ left: f.enabled ? '20px' : '2px' }}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
