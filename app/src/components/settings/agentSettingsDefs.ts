export interface FlagItem {
  key: string
  label: string
  desc: string
  badge?: string
}

export const EXEC_SELF_HEAL_FLAGS: FlagItem[] = [
  {
    key: 'agent.shadowWorkspace',
    label: '影子工作区隔离预演 (Shadow Git Worktree)',
    desc: 'Auto 模式下在独立 Git Worktree 沙箱中执行修改并通过测试验证，无报错后再合并回主工作区，失败自动销毁回滚',
    badge: 'Git Sandbox',
  },
  {
    key: 'agent.visualVerification',
    label: '前端修改离屏视觉自愈 (Visual Self-Healing)',
    desc: '修改 React / CSS 前端文件后自动启动离屏渲染与控制台异常捕获，发现白屏或报错时自动将堆栈注入下一轮修复',
    badge: 'UI Loop',
  },
  {
    key: 'agent.runnerUpReview',
    label: '亚军模型双盲交叉审查 (Runner-Up Diff Review)',
    desc: '针对高风险破坏性变更，自动调用 Arena ELO 排名第二的独立模型对 Diff 进行安全与逻辑复核',
    badge: 'Dual-Model',
  },
  {
    key: 'agent.shrinkRetry',
    label: '预算耗尽自动缩围续命 (Scope-Reduction Retry)',
    desc: '循环触达最大轮次或语义死循环守卫时，不直接中断，自动收敛为最小可交付增量并追加 4 轮完成收尾总结',
    badge: '+4 Rounds',
  },
  {
    key: 'agent.backgroundReview',
    label: '后台增量代码审计 (Background Code Review)',
    desc: '每次执行文件写入或补丁工具后，在后台静默运行静态质量与安全扫描',
    badge: 'Async Audit',
  },
]

export const CONTEXT_CACHE_FLAGS: FlagItem[] = [
  {
    key: 'agent.cachePrefixStability',
    label: 'Prompt Cache 前缀严格单调对齐 (KV-Cache Prefix Invariant)',
    desc: '固定常驻工具桶顺序、将静态 System/AGENTS.md 指令前置、动态记忆后置，使多轮工具调用保持 ~100% 缓存命中率',
    badge: 'KV Cache',
  },
  {
    key: 'agent.toolRouter',
    label: '前缀缓存安全双层工具路由 (Prefix-Cache-Safe Tool Router)',
    desc: '主 Agent 顶层固定 10 个常驻工具 Schema 保持 KV-Cache 100% 稳定；非核心工具经 call_extended_tool 网关转发，子代理按角色阶段挂载专属工具池',
    badge: 'Prefix-Safe',
  },
  {
    key: 'llm.tokenCompression',
    label: '工具输出高密度结构压缩 (Tool Output Structural Compression)',
    desc: '对超长终端输出与日志执行多级空白折叠、重复堆栈去重与高信息密度截断',
    badge: 'Token Saver',
  },
]

export const INTEL_EVOLUTION_FLAGS: FlagItem[] = [
  {
    key: 'repoMap.enabled',
    label: 'AST 仓库符号拓扑图注入 (RepoMap Symbol Topology)',
    desc: '自动扫描工程核心符号签名与引用权重，注入 Agent 上下文视野以减少盲目 grep 搜索',
    badge: 'Code Intel',
  },
  {
    key: 'lsp.full',
    label: '全量 LSP 语言服务桥接 (Full LSP Navigation)',
    desc: '启用符号定义跳转 (goToDefinition)、全工程引用查找 (findReferences) 与精确符号重命名',
    badge: 'LSP',
  },
  {
    key: 'memory.experienceReplay',
    label: '成功轨迹经验池回放 (Trajectory Experience Replay)',
    desc: '将成功解决复杂任务的完整工具调用序列入池，遇到相似任务签名时自动召回历史最优执行路径',
    badge: 'Self-Learn',
  },
  {
    key: 'memory.codeUnderstanding',
    label: '知识图谱代码拓扑持久化 (Knowledge Graph Code Index)',
    desc: '将项目模块依赖与核心架构实体自动沉淀至 SQLite kg_nodes / kg_edges 图谱表',
    badge: 'Graph DB',
  },
  {
    key: 'skills.selfEvolution',
    label: 'Agent 技能自主草拟与演进 (Autonomous Skill Evolution)',
    desc: '当 Agent 完成多步高复用工作流后，允许自动提炼生成可复用的本地 Skill 模板草稿',
    badge: 'Auto-Skill',
  },
  {
    key: 'llm.autoFallback',
    label: '429 / 5xx 跨供应商透明容灾转移 (Auto Provider Fallback)',
    desc: '主模型遭遇速率限制或网关超时时，自动无缝切换至备用供应商同级模型继续当前工具循环',
    badge: 'Resilience',
  },
]
