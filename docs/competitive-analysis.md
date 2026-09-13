# Aether 竞品调研：主流 Agent 工具雷达图对比（2026-09 最新版）

> 本文为**产品与架构竞品调研报告**。基于 2026-09 最新行业产品演化、安全评测（腾讯朱雀实验室、奇安信 QVD 报告、Uncle城网安拆解）及 Aether v0.8.2+ 架构验收数据进行全面更新。
> 评分为定性主观评分（1–5 分制；README 雷达图使用 8 轴 10 分制，两者的对应关系与逐轴依据见第 4 节），方法与时效声明见文末第 7 节。
> 2026-09 修订：Aether 一行按**已发布的 v0.8.2 实际交付**重新打分，不再计入 roadmap 与 Experimental 功能的预期价值。

---

## 1. 对比范围与评分维度

**对比工具（29 个，覆盖三大主流形态；2026-09-12 生态扩展调研补充，详见第 7 节）**：
- **终端与混合编程类 Agent**：Claude Code、Codex CLI、Amp (ampagent)、OpenCode、Aider、Gemini CLI、Kimi CLI、Qwen Code（阿里）、Goose（Block / Linux Foundation）、Pi（Zehner+Ronacher）、Crush (Charmbracelet)、Continue CLI、Warp、Plandex、Open Interpreter（现为 Codex fork）、agentty
- **IDE 插件、云端 Review 与桌面编辑 Agent**：Cursor（SpaceX 收购）、Gemini Code Assist (GitHub App/Bot)、Devin Desktop（原 Windsurf，Cognition 收购后更名）、Trae (字节跳动)、Cline / Kilo Code（Roo Code 已于 2026-05 停维护归档）、GitHub Copilot、Antigravity (Google)
- **全自主平台与开源框架**：OpenHands、Devin、Manus（2025-12 被 Meta 以 $2B+ 收购）、OpenClaw (AI 龙虾)、DeepSeek Harness (DSH)、Hermes Agent

**评分维度（9 个，1–5 分）**：

| 维度 | 雷达图轴标签 | 含义 |
|------|-------------|------|
| Agent 自主性 | Autonomy | 无需人工干预完成长链任务的能力（工具循环、迭代预算、子任务派生、故障自愈） |
| 多模型灵活性 | Multi-model | 可接入的 provider / 模型广度，含本地模型（Ollama）与 BYOK 自定义端点 |
| 安全与权限 | Safety | 权限门阶梯、三层沙箱、影子工作区、环境变量脱敏、路径 Jail、Taint 追踪、Diff 审查 |
| 可扩展性 | Extensibility | 官方工程配方、`.aether/config.json`、MCP stdio/HTTP、SKILL.md、生命周期 hooks |
| 本地优先隐私 | Local-first | 数据是否完全留于本机 SQLite、是否脱离云端可用、零遥测、密钥系统级隔离 |
| 评估与基准工具 | Evaluation | 内置模型对比评测、SWE-bench 本地测试验证、Arena 盲测投票、ELO 排行榜 |
| 终端体验 | Terminal UX | 终端交互质量（CLI / 原生 TUI、按键响应、流式输出、撤销回滚） |
| IDE·桌面体验 | IDE/Desktop UX | GUI 交互完整度（时光机抽屉、Diff 代码预览、主题透明度、模型切换体验） |
| 生态成熟度 | Ecosystem | 开源社区规模、文档生态、多语言支持、三方 Skill/MCP/Recipe 市场规模 |

---

## 2. 2026-09 最新评分总表

| 工具 | 分类 | Autonomy | Multi-model | Safety | Extensibility | Local-first | Evaluation | Terminal UX | IDE/Desktop UX | Ecosystem |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Aether (v0.8.2)** | **桌面+终端双形态** | **3.5** | **4.5** | **3.5** | **3.5** | **4.5** | **3.5** | **3.0** | **3.5** | **2.0** |
| Claude Code | 终端 Agent | 5.0 | 1.0 | 4.0 | 4.5 | 3.0 | 2.0 | 5.0 | 3.0 | 5.0 |
| Codex CLI | 终端 Agent | 4.0 | 2.0 | 4.5 | 3.5 | 2.0 | 2.0 | 4.5 | 3.0 | 4.0 |
| Amp | 终端/混合 Agent | 4.0 | 3.5 | 4.0 | 4.0 | 2.0 | 3.5 | 4.5 | 4.5 | 4.0 |
| OpenCode | 终端 Agent | 4.0 | 5.0 | 3.0 | 4.0 | 3.0 | 2.0 | 5.0 | 2.0 | 4.0 |
| Aider | 终端 Agent | 3.5 | 4.5 | 3.0 | 2.5 | 3.5 | 3.0 | 4.0 | 1.0 | 4.0 |
| Gemini CLI | 终端 Agent | 4.0 | 2.0 | 3.5 | 4.0 | 2.0 | 2.0 | 4.0 | 2.0 | 4.0 |
| Kimi CLI | 终端 Agent | 4.0 | 1.0 | 3.0 | 3.0 | 2.0 | 2.0 | 4.0 | 1.0 | 2.5 |
| Cursor | IDE / 桌面 | 4.0 | 4.0 | 3.0 | 3.5 | 2.0 | 3.0 | 2.0 | 5.0 | 5.0 |
| Gemini Code Assist | IDE/PR 审查 | 4.0 | 2.0 | 4.0 | 4.0 | 1.5 | 3.0 | 2.0 | 4.5 | 4.5 |
| Devin Desktop (原 Windsurf) | IDE / 桌面 | 4.5 | 4.0 | 3.5 | 3.5 | 1.5 | 3.0 | 2.0 | 4.5 | 4.0 |
| Trae | IDE / 桌面 | 4.0 | 3.5 | 3.5 | 3.5 | 2.0 | 2.0 | 2.0 | 4.5 | 3.5 |
| Cline / Kilo Code (Roo 停维护) | VSCode 插件 | 4.0 | 4.5 | 3.5 | 4.5 | 2.5 | 2.0 | 1.0 | 4.5 | 4.0 |
| Roo Code | VSCode 插件 | 4.5 | 4.5 | 3.5 | 4.5 | 3.0 | 2.5 | 1.5 | 4.5 | 4.5 |
| Continue | VSCode 插件 | 4.0 | 4.5 | 3.5 | 4.0 | 3.5 | 2.5 | 2.0 | 4.0 | 4.5 |
| GitHub Copilot | IDE / 桌面 | 3.5 | 3.0 | 3.5 | 3.5 | 1.0 | 2.0 | 3.0 | 5.0 | 5.0 |
| OpenHands | 全自主平台 | 5.0 | 4.0 | 4.0 | 4.0 | 3.0 | 4.0 | 3.0 | 3.0 | 4.0 |
| Devin | 全自主平台 | 5.0 | 1.0 | 3.5 | 3.5 | 1.0 | 3.0 | 1.0 | 3.5 | 3.5 |
| OpenClaw | 全自主平台 | 4.5 | 4.0 | 2.0 | 4.0 | 3.5 | 2.0 | 3.5 | 2.5 | 3.0 |
| DeepSeek Harness | 开源框架 | 4.0 | 3.0 | 2.0 | 3.5 | 3.0 | 2.0 | 3.0 | 2.0 | 3.5 |
| Hermes Agent | 开源框架 | 4.5 | 4.0 | 3.5 | 4.5 | 3.5 | 2.5 | 3.5 | 2.0 | 3.5 |

---

## 3. 分组雷达图对比

### 图 A：终端与混合编程 Agent 对比 (Aether vs Claude Code / Codex / Amp / OpenCode / Aider / Gemini CLI)

```mermaid
radar-beta
  title Terminal & Hybrid Coding Agents (2026-09)
  axis aut["Autonomy"], mm["Multi-model"], saf["Safety"], ext["Extensibility"], loc["Local-first"], eva["Evaluation"], tux["Terminal UX"], dux["Desktop UX"], eco["Ecosystem"]
  curve aether["Aether"]{3.5, 4.5, 3.5, 3.5, 4.5, 3.5, 3.0, 3.5, 2.0}
  curve claude["Claude Code"]{5.0, 1.0, 4.0, 4.5, 3.0, 2.0, 5.0, 3.0, 5.0}
  curve codex["Codex CLI"]{4.0, 2.0, 4.5, 3.5, 2.0, 2.0, 4.5, 3.0, 4.0}
  curve amp["Amp"]{4.0, 3.5, 4.0, 4.0, 2.0, 3.5, 4.5, 4.5, 4.0}
  curve opencode["OpenCode"]{4.0, 5.0, 3.0, 4.0, 3.0, 2.0, 5.0, 2.0, 4.0}
  curve aider["Aider"]{3.5, 4.5, 3.0, 2.5, 3.5, 3.0, 4.0, 1.0, 4.0}
  max 5
  min 0
```

### 图 B：IDE、云端 Review 与桌面编程 Agent 对比 (Aether vs Cursor / Gemini Code Assist / Devin Desktop / Trae / Cline / Copilot)

```mermaid
radar-beta
  title IDE & Desktop Agents (2026-09)
  axis aut["Autonomy"], mm["Multi-model"], saf["Safety"], ext["Extensibility"], loc["Local-first"], eva["Evaluation"], tux["Terminal UX"], dux["Desktop UX"], eco["Ecosystem"]
  curve aether["Aether"]{3.5, 4.5, 3.5, 3.5, 4.5, 3.5, 3.0, 3.5, 2.0}
  curve cursor["Cursor"]{4.0, 4.0, 3.0, 3.5, 2.0, 3.0, 2.0, 5.0, 5.0}
  curve gemini["Gemini Code Assist"]{4.0, 2.0, 4.0, 4.0, 1.5, 3.0, 2.0, 4.5, 4.5}
  curve devin_desktop["Devin Desktop"]{4.0, 4.0, 3.0, 3.5, 2.0, 3.0, 2.0, 4.5, 4.0}
  curve trae["Trae"]{4.0, 3.5, 3.5, 3.5, 2.0, 2.0, 2.0, 4.5, 3.5}
  curve cline["Cline"]{4.0, 4.5, 3.5, 4.5, 2.5, 2.0, 1.0, 4.5, 4.0}
  max 5
  min 0
```

### 图 C：全自主自治与平台型 Agent 对比 (Aether vs OpenHands / Devin / OpenClaw / DSH / Hermes)

```mermaid
radar-beta
  title Autonomous Platform Agents (2026-09)
  axis aut["Autonomy"], mm["Multi-model"], saf["Safety"], ext["Extensibility"], loc["Local-first"], eva["Evaluation"], tux["Terminal UX"], dux["Desktop UX"], eco["Ecosystem"]
  curve aether["Aether"]{3.5, 4.5, 3.5, 3.5, 4.5, 3.5, 3.0, 3.5, 2.0}
  curve openhands["OpenHands"]{5.0, 4.0, 4.0, 4.0, 3.0, 4.0, 3.0, 3.0, 4.0}
  curve devin["Devin"]{5.0, 1.0, 3.5, 3.5, 1.0, 3.0, 1.0, 3.5, 3.5}
  curve openclaw["OpenClaw"]{4.5, 4.0, 2.0, 4.0, 3.5, 2.0, 3.5, 2.5, 3.0}
  curve dsh["DeepSeek Harness"]{4.0, 3.0, 2.0, 3.5, 3.0, 2.0, 3.0, 2.0, 3.5}
  curve hermes["Hermes Agent"]{4.5, 4.0, 3.5, 4.5, 3.5, 2.5, 3.5, 2.0, 3.5}
  max 5
  min 0
```

### 全景自评雷达矢量图（20款对照生成）

<p align="center">
  <img src="../assets/agent-radar-2026.svg" width="760" alt="Aether 自评雷达: 20款主流 Agent 工具全景对比" />
</p>

> 由 `app/scripts/gen-radar.cjs` 生成；20 款竞品分值全部内嵌在脚本中，`node app/scripts/gen-radar.cjs` 可复现。虚线为 20 款竞品的逐轴峰值（同类最佳包络）。

---

## 4. Aether v0.8.2 逐轴自评依据（雷达图 8 轴，0–10 分）

雷达图分值与本表 9 维分的对应：Coding/General ≈ Autonomy + Evaluation；Multi-provider = Multi-model；Ecosystem ≈ Extensibility + Ecosystem；Multi-agent ⊂ Autonomy；Safety = Safety；Local = Local-first；UX = Terminal UX + IDE/Desktop UX。打分原则：**只看 v0.8.2 已发布、README 能力表标为 Stable 的功能**；标为 Experimental 的功能计入方向，不计入分值。

| 轴 | Aether | 同类峰值 | 依据（优势 / 差距） |
|:---|:---:|:---:|:---|
| Coding | 7.0 | 9.8 (Claude Code / Cursor) | 优势：42 个内置工具、LSP、repo map、Runner-Up Review、`git:undo` 回滚。差距：Aether 没有自有模型，编程上限 = 接入模型 + harness；`evals/coding` 自述为 tiny benchmark，仓库内**没有**可引用的 SWE-bench / Pass@1 数字。 |
| General | 7.0 | 9.8 | 同一 harness 用于非编程任务；无浏览器 / computer-use 能力，长链任务依赖 Experimental 的层次化规划。 |
| Multi-provider | 9.0 | 9.7 (OpenCode) | OpenAI 兼容 / Claude / DeepSeek / Ollama / 本地 Gateway，Model Arena 盲测 + ELO 路由。OpenCode / Aider / Cline 同样 BYOK，因此不高于同类峰值。 |
| Ecosystem | 4.0 | 9.8 (Claude Code) | MCP stdio / SKILL.md / hooks / `.aether/config.json` 均已实现但标为 Experimental；无第三方市场，社区规模为单人维护（仓库 4 star）。与 Claude Code / Cursor 的差距是量级而非小数点。 |
| Multi-agent | 6.0 | 9.5 (OpenHands) | 后台任务队列（`backgroundTasks.js`）稳定；层次化规划 / 子任务派生为 Experimental；Arena 是多模型投票，不是多 Agent 编排。 |
| Safety | 7.0 | 9.8 (Codex) | 优势：命令白名单 + shell 元字符拦截（`sandboxExecutor.js`）、realpath 路径 Jail 与敏感路径保护（`sandbox.js`）、环境变量脱敏、Shadow Workspace、Taint 追踪、Diff 前置审查、可选 Docker 后端。差距：**全部为应用层策略**，没有 OS 级沙箱（seatbelt / Landlock / seccomp），且仅支持 Windows；Codex 的 OS 沙箱模型仍是标杆。 |
| Local & private | 9.0 | 9.0 | 全量 SQLite WAL 本地落盘，无账号、无遥测、无云端中转。OpenCode 等同样完全本地，故为同档（±0）而非领先。 |
| Desktop & TUI UX | 6.5 | 9.8 (Cursor) | 桌面聊天与 Agent 工作台 Stable；TUI / CLI / RPC / SDK 均为 Experimental；仅 Windows、安装包未签名（SmartScreen 提示）。 |

**结论**：Aether 真正站得住的差异化只有两点——**模型可随时更换**与**数据 100% 留在本机**，并在此基础上叠加一套较完整的应用层安全策略。其余各轴的目标是「够用且诚实」，不是「同类最佳」。

---

## 5. 向 20 款竞品学到了什么（吸收与演进）

| 竞品 | 代表形态 | Aether 吸收的精髓 |
|:---|:---|:---|
| **Claude Code** | 终端标杆 | 吸收其进程级权限提示与收据卡设计；反向防御其曾曝光的 Unicode 变体撇号隐写机制。 |
| **Codex CLI** | 终端沙箱 | 吸收 OS 级沙箱清晰心智模型（只读/询问/完全访问）；严格约束非交互模式。 |
| **Amp** | 终端/云端混合 | 吸收其云端/终端双轨协同（`amp sync`）、Orbs 隔离沙箱与主动意图转向（Steer, Don't Queue）哲学。 |
| **Cursor** | IDE 顶流 | 吸收前置 Diff 审查与语法高亮心智；坚持拒绝臃肿全量 IDE，保持轻量工作台。 |
| **Gemini Code Assist** | IDE / GitHub PR 审查 | 吸收其 GitHub PR Review 自动化审查、Commit 级建议与大上下文仓库全景理解心智。 |
| **Devin Desktop (原 Windsurf Cascade)** | 流式感知 | 吸收其长程任务实时流式进展反馈，落地 `AgentRunTimeline` 时光机抽屉。 |
| **Trae** | 字节跳动 IDE | 吸收网安一体化 Agent（如 DeepSec）实战思路，将渗透防御内建为常驻中间件。 |
| **DeepSeek Harness** | 开源自主框架 | 深刻吸取其 QVD-2026-57410 漏洞教训：绝不信任 HTTP Host 头，本地监听强制回环绑定与时序防侧信道。 |
| **Hermes Agent** | 进化框架 | 吸收声明式技能生态与自迭代经验；完善 `SKILL.md` 的能力边界。 |
| **Aider** | Git-first | 吸收 git 自动 commit 互补机制，确保工具调用天然可回滚（`git:undo`）。 |
| **OpenHands** | 评测 Harness | 吸收其测试用例严格沙箱隔离与环境复现性思路。 |
| **Devin** | 云端 Autonomous | 吸收长任务进度状态机与崩溃恢复（`restorePendingTasks`）。 |

---

## 6. 结语与客观定位

Aether 不宣称“全方位超越第一梯队”。在纯代码生成深度上，Claude Code 与 Cursor 处于绝对顶峰（Coding 9.8 vs Aether 7.0）；在生态、多 Agent 编排、OS 级沙箱与产品打磨上，Aether 同样落后于各轴的领先者，第 4 节已逐轴列出差距。

Aether 提供的定位价值是明确而有限的：**把模型当作可随时更换的计算后端，把数据 100% 留在自己的硬盘上，并用一套应用层的权限阶梯与沙箱策略让 Agent 在桌面环境可控地运转。** 雷达图的不对称形状是对这一取舍的如实记录，而不是勋章。

---

## 7. 2026-09-12 生态扩展调研补充（18→29 款）

> 本节为 2026-09-12 全景扩展调研增量，冲掉第 1-2 节中已过时的事实（Roo Code 停维护、Windsurf 更名）。新进工具未评 9 维分，原因是发布期过短评分无意义；本文件后续新一轮评分时再并入总表。**因此 29 款是调研范围，20 款是实际评分与雷达图对照范围**，README 与雷达图统一使用 20。完整调研见知识库 `03-开发日志/2026-09-12-Agent工具全景扩展调研与生态动态盘点.md`。

### 新增工具速览

| 工具 | 形态 | 一句话定位 | 对 Aether 的参考价值 |
|:---|:---|:---|:---|
| **DSH (DeepSeek Harness)** | 开源引擎 | 「一切皆插件」Cordis 内核、PTC 程序化工具调用、append-only trajectory 自压缩，system prompt ~6k；发布 12h 50k stars / 4 天 126k | **同赛道唯一真对手**：本地/多模型/引擎化。Aether 的答案=安全纵深+双形态+评估体系，并需开源运营对冲其社区加速度 |
| **Pi** | 终端 harness | 极简 system prompt（~2-3k），Zehner+Ronacher | harness 效率命题：prompt 每省 1k token 都是成本与表现双赢 |
| **Crush** | TUI | Charm 出品，LSP-aware agentic TUI | TUI 美学与 LSP 感知值得借鉴 |
| **Goose** | 终端/DevOps | 围绕 MCP 设计，捐给 Linux Foundation | Recipe/MCP 生态运营样本 |
| **Qwen Code** | CLI | 阿里开源 coder CLI | 中国生态对 CLI 形态的回归 |
| **Kilo Code** | VSCode 插件 | Cline 家族现役主力（Roo 停维护后）；Orchestrator + 可见子步骤 to-do | 任务透明化的 to-do 列表心智 |
| **Continue CLI** | 终端/CI | 转型 Continuous AI：agent 上 PR 当 CI status checks | 验证闭环上 CI 的方向 |
| **Open Interpreter** | 桌面/CLI | 重构为 Codex fork；OS 沙箱 + model-specific harness emulation | 按模型塑 agent loop 的多模型心智 |
| **Manus** | 云端 | Meta $2B+ 收购的通用任务 agent | 云端通用任务天花板参考 |

### 生态关键动态（评分表外）

- Cursor 被 SpaceX 全资收购（2026-08），内置 Cursor Router 智能模型路由——Aether Arena ELO 路由的竞品对应物。
- Claude Code 2026-03 源码泄露事件；AGENTS.md 已成跨工具互操作事实标准。
- Windsurf 2025-07 被 Cognition 收购后更名 Devin Desktop，自有模型 SWE-1.5（SWE-bench ~78%）+ Turbo Mode。
- OpenHands 完成 $23.8M Series A；Manus 被 Meta 收购（2025-12-30）。
- 中国市场：四大厂（阿里 Qoder / 腾讯 CodeBuddy / 百度 Comate / 字节 TRAE）全部 IDE+CLI+云三端覆盖；月活渗透率 >85%。
- **Aether 应对北极星不变**：把新增 26 款对手当作「可吸收的心智」而非「可抄袭的表面」，护城河仍是安全×本地×多模型评估三位一体。
