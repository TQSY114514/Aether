# 与 DeepSeek Harness (DSH) 的差异化对比

> 定位：Aether 与 DSH 同为「本地优先 · 多模型 · 引擎化」赛道，DSH 是 Aether 目前唯一的同赛道直接对手。本文基于 2026-09 公开资料（定性主观评分，方法同 [competitive-analysis.md](./competitive-analysis.md) 第 7 节），诚实地呈现两边的非对称形状——不搞营销话术，不回避 DSH 的强项。

---

## 1. 为什么单独写 DSH

在 [competitive-analysis.md](./competitive-analysis.md) 的 26 款工具里，多数竞品与 Aether 形态错位（IDE、云端、终端单一形态）。DSH 是唯一同时命中 Aether 四个核心命题的对手：

- **本地运行**（非云端托管）
- **多模型**（不绑定单一模型）
- **引擎化/可编程内核**（agent loop 可定制）
- **开源**（社区协议同场竞技）

且其社区加速度惊人：发布 **12 小时 50k stars、4 天 126k**。对 Aether 而言这是进攻信号而非威胁信号——说明「开源 + 本地 + 多模型」的市场需求真实且巨大，只是 Aether 需要用安全纵深与双形态体验来建立自己不可替代的一侧。

---

## 2. 快照对比（2026-09）

| 维度 | Aether | DeepSeek Harness (DSH) |
|:---|:---|:---|
| 定位 | 本地优先的 Agent 工作台：桌面 + 终端双形态 | 开源引擎：一切皆插件的 agent 内核 |
| 内核哲学 | 一体式 Agent Core，功能内建 + 扩展钩子 | Cordis 插件内核，能力全部插件化 |
| 工具调用 | 42 个内建工具 + 工具调用自修复 | PTC 程序化工具调用 |
| 上下文策略 | 上下文压缩（工具调用对保留）+ 预算上限 | append-only trajectory 自压缩 |
| System prompt | 常规体量（功能由系统 + 工具层协同承载） | 极简 ~6k，主打省 token |
| 形态 | Electron 桌面 GUI + Ink v5 终端 TUI + CLI/SDK | 引擎 / CLI（无桌面 GUI） |
| 评估体系 | 内置 Model Arena 盲测 + ELO + 本地 SWE-bench 评测套件 | 无内置评估体系 |
| 安全纵深 | 三层沙箱 + Shadow Workspace + Taint 追踪 + DNS Rebinding 物理拦截 + 环境变量脱敏 | （社区侧曾披露 QVD-2026-57410 本地监听 Host 头校验缺失漏洞） |
| 社区 | 个人项目，恒星数远低于 DSH | 现象级爆发（4 天 126k stars） |

### 九维雷达分（引自 competitive-analysis.md 图 C）

| 维度 | Aether | DSH |
|:---|---:|---:|
| Agent 自主性 Autonomy | 4.0 | 4.0 |
| 多模型灵活性 Multi-model | **5.0** | 3.0 |
| 安全与权限 Safety | **5.0** | 2.0 |
| 可扩展性 Extensibility | 5.0 | 3.5 |
| 本地优先隐私 Local-first | **5.0** | 3.0 |
| 评估与基准 Evaluation | **4.8** | 2.0 |
| 终端体验 Terminal UX | **4.5** | 3.0 |
| 桌面体验 Desktop UX | **4.5** | 2.0 |
| 生态成熟度 Ecosystem | 3.5 | 3.5 |

> 分数是定性主观评估，仅用于定位差异形状；DSH 发布窗口过短，生态分未计入其社区加速度（那部分在文化层面，见第 5 节）。

---

## 3. 安全：Aether 最硬的差异化（Safety 5.0 vs 2.0）

安全是 Aether 与 DSH 最大的分野。这不是嘴上差距，而是有真实事件对照：

- **DSH 侧**：QVD-2026-57410（2026 年披露）——本地服务监听对 HTTP Host 头校验缺失，存在 DNS Rebinding 攻击面。DSH 的社区增长也伴随安全团队的审计压力。
- **Aether 侧**：从该漏洞直接吸收教训并**物理化防御**：
  - 本地监听强制回环绑定 + Host 头校验，DNS Rebinding 从网络层被拦截（`securityRegression.test.js` 常态化巡检 52 项含 DNS 边界用例）；
  - 三层沙箱（策略能力轴门禁 / 环境变量正则脱敏 + 敏感路径 Jail / 可选容器化）；
  - Auto 模式 Shadow Workspace（Git Worktree 物理隔离执行目录，成功合并、失败回滚，绝不污染主工作区）；
  - 动态 Taint 追踪：外部非受信内容摄入即标记，阻断静默写穿；
  - 前置 Unified Diff 行级审查 + 审批收据卡（动词/目标/回滚）。

对把 agent 跑在**自己电脑的本地工作区**上的用户，「引擎再强、沙箱是筛子」是致命的。Aether 的选择：把 agent 的自主性装进银行级的防御纵深里。

---

## 4. 形态与体验：双形态 vs 纯引擎

DSH 卖的是引擎——强在可编程、可嵌入、极简 prompt。但它没有终端交互产品层（无桌面 GUI、TUI 体验分 3.0）。

Aether 卖的是**完整产品体验**：

- 桌面 Electron GUI：模型 Arena 盲测投票、ELO 排行榜、时光机抽屉、主题与 15 语言；
- 终端 TUI（`aether tui`）：键盘全流程、diff 审查/回滚、权限门、`@` 文件引用、`/fork` 会话树；
- 两形态共享同一 Agent Core + 同一 SQLite 会话库——桌面上开的会话在终端接着聊；
- CLI/SDK：headless 四种模式 + Electron-free SDK。

「引擎 + 产品」不是二选一，而是 Aether 坚持的完整闭环：你既要 agent 引擎的深度，也要开箱即用的体验。

---

## 5. 社区与开源运营：必须正视的差距

诚实地摆出来：**社区规模上 Aether 与 DSH 不在一个量级**。126k stars 是资本，是注意力，是插件集市的可能性。

Aether 的对冲策略不是比拼速度——个人项目比不过资本与组织加持的爆发。Aether 的答案：

1. **安全口碑成为硬通货**：当 DSH 类引擎被安全团队点名时，「本地优先 + 满分安全纵深」的 Aether 就是用户迁移的目的地；
2. **双形态 + 评估体系是迁移成本**：Arena ELO 智能路由与本地评测套件让用户黏着在「用证据选模型」的工作流里，而不是裸引擎；
3. **开源运营补短板**：Issue 模板/PR 规范/Discussions/对比文（本文件即是）逐项补齐，学 DSH 的开源节奏感。

---

## 6. 诚实的退让：DSH 值得学习的地方

不是所有差距都要靠防御抹平，有些要吸收：

- **极简 system prompt**（~6k）省 token 且加快首 token——Aether 的上下文策略可吸收其精炼度；
- **PTC 程序化工具调用**的确定性值得研究——比纯自然语言工具调用更可测；
- **append-only trajectory 自压缩**思路与 Aether 的 pair-preserving 压缩可以互相印证；
- **Cordis 插件心法**验证了「一切皆插件」对极客用户的吸引力——Aether 的 hooks/SKILL/MCP 生态需要更激进。

---

## 7. 一句话结论

**DSH 证明了「本地 + 多模型 + 开源引擎」有海量受众；Aether 证明了这个赛道还能长出「安全纵深 + 双形态体验 + 内置评估」的产品层。** 两者互为镜像：引擎的普惠靠社区加速度，产品的可信靠安全与体验。Aether 不抢 DSH 的恒星数，只做 DSH 做不了的那一层——让 agent 在你自己的电脑上，安全地替你干活。

---

*本文与 [competitive-analysis.md](./competitive-analysis.md)（26 款全景对比）配套阅读。评分为公开资料定性评估，非基准测试。*