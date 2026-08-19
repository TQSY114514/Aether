# Aether UX 竞品对照与优化建议（深度版）

> 研究范围：Claude Code、OpenAI Codex、OpenCode/Crush、Hermes Agent、Cursor、Windsurf、Aider、Cline、Continue  
> 方法：源码审计（Aether 全量 + OpenCode/Crush 全量）+ 公开文档 + changelog 抓取 + 社区讨论  
> 聚焦点：快捷键、命令面板、inline diff、撤销/重做、流式体验、错误恢复、权限 gate 等基础体验细节。

---

## 一、竞品 UX 模式摘要

### 1. OpenCode（已归档 → Crush）— 源码已审计

这是架构上与 Aether TUI 最接近的产品（Go + Bubble Tea, 模式化键盘, leader key, 权限面板）。

| 维度 | OpenCode/Crush 的做法 |
|---|---|
| **快捷键架构** | 全局 `key.Binding` 注册表, 每个 dialog/screen 独立 keymap, help 面板自动收集所有绑定 |
| **Leader key** | `Space` 待命（类似 Vim leader），超时 3s 解除；子键 `m`=模型, `n`=新会话, `l`=历史, `g`=时间线, `r`=rewind, `q`=quit, `e`=外部编辑器 |
| **命令面板** | `Ctrl+Space` 打开命令选择器, `↑↓/Enter/Esc`, 动态注册命令列表 |
| **权限 dialog** | ←→/Tab 切换, `a`=allow, `s`=allow_session, `d`=deny, Enter/Space 确认；显示 diff 预览；三按钮高亮选中态 |
| **会话切换** | `j`/`k` 导航 + Enter 选择, 最多显示 10 项并居中滚动 |
| **消息列表** | viewport + `Ctrl+U`/`Ctrl+D` 半页滚动, `PgUp`/`PgDown`, spinner 运行中 |
| **编辑器** | `Ctrl+E` 打开外部 `$EDITOR`, 最多 5 个附件, `Ctrl+R+{i}` 删除附件 |
| **流式输出** | spinner 运行指示, 实时流式 pubsub 事件驱动渲染 |
| **模型选择** | `Ctrl+Space`→`m` 打开模型选择器, ↑↓/输入过滤/Enter/Esc |

### 2. Aider — changelog + 文档研究

| 维度 | Aider 的做法 |
|---|---|
| **快捷键** | readline 编辑：`Ctrl-A`=行首, `Ctrl-B`=后退, `Ctrl-D`=删字符, `Ctrl-E`=行尾, `Ctrl-F`=前进, `Ctrl-K`=删到尾, `Ctrl-W`=删前词, `Ctrl-Y`=粘贴, `Ctrl-U`=清行 |
| **斜杠命令** | `/undo`=撤销上次编辑, `/diff`=显示变更, `/add`=加文件, `/drop`=移除文件, `/run`=执行命令, `/test`=运行测试, `/commit`=提交, `/git`=git 操作, `/model`=切模型, `/voice`=语音输入, `/?`=帮助 |
| **权限模型** | 无显式权限层（信任用户），自动接受文件编辑 |
| **自动提交** | 文件编辑后自动 git commit，带 AI 生成的 commit message |
| **会话管理** | 单会话为主，多文件上下文，`/add`/`drop` 管理工作区 |
| **错误恢复** | `/undo` 回滚错误编辑，git 兜底 |

### 3. Claude Code — changelog 抓取（52 万字符）+ 文档

| 维度 | Claude Code 的做法 |
|---|---|
| **快捷键** | `Ctrl+C`=中断/退出, `Ctrl+D`=退出(双击 800ms), `Esc`=取消/关闭, `Shift+Tab`=循环审批模式, `↑`=编辑上条, `Tab`=接受, `←/→`=权限选择 |
| **权限 dialog** | 三按钮：`a`=allow, `s`=allow for session, `d`=deny, ←→ 切换, Enter 确认, 显示 diff 预览 |
| **审批模式** | `Shift+Tab` 循环：`manual`→`auto-edits`→`plan`；`plan` 只读自动放行，写操作拒绝 |
| **spellcheck** | 2.1.235 新增：可选 `spellcheck` 设置，使用 `aspell`/`hunspell`/`ispell` 实时下划线拼写检查 |
| **流式输出** | 逐 token 流式，reasoning block 显示思考过程，停止后显示"Continued" |
| **会话管理** | 历史会话自动保存，标题 LLM 总结，多会话切换 |
| **错误恢复** | 失败消息红色展示，retry/regenerate 按钮，错误详情可展开 |

### 4. Cursor / Windsurf（桌面 IDE）

| 维度 | 做法 |
|---|---|
| **命令面板** | `Ctrl+K` 打开，可执行任何操作 |
| **文件树** | 侧边栏完整文件浏览器，右键菜单 |
| **Undo/Redo** | 标准 IDE `Ctrl+Z`/`Ctrl+Shift+Z` |
| **Inline diff** | 行内高亮 + Accept/Reject 按钮 |
| **多 tab** | 多会话并行 |
| **模型切换** | 下拉菜单 + 自动路由 |

### 5. Cline（VS Code + CLI）

| 维度 | 做法 |
|---|---|
| **模式切换** | Plan（只读）↔ Act（执行）模式 |
| **权限** | 多步确认，每一步工具调用需用户 approve |
| **Diff viewer** | 文件内 diff + accept/reject 按钮 |
| **快捷键** | `Esc` 停止生成 |
| **多 tab** | 多会话 tab |

### 6. Continue（IDE 扩展）

| 维度 | 做法 |
|---|---|
| **命令面板** | `Ctrl+K` 命令面板 + 斜杠命令 |
| **Inline edit** | IDE 内联编辑，流式高亮 |
| **多模型** | 模型下拉切换 |
| **全局搜索** | IDE 标准搜索 |

---

## 二、Aether 当前状态速览

### 桌面端已有
- ✅ `Ctrl+K` 命令面板
- ✅ `Esc` 停止生成 / 关闭对话框
- ✅ `Alt+←/→` 会话历史导航
- ✅ 消息 inline 编辑 + 重新生成 + 继续
- ✅ 拖放 / 粘贴片段 / `@` 引用
- ✅ 斜杠命令 + `/` 自动补全
- ✅ 统一搜索（消息 + 记忆 + 文件）+ CJK 分词 + 键盘导航
- ✅ 模型建议 badge（Elo / 任务 / 启发式）
- ✅ Streaming status bar + 多会话后台流
- ✅ 6 级 agent 模式（off/plan/ask/auto_confirm/auto/yolo）
- ✅ 15 语言 + 字体缩放 + 背景图
- ✅ Tool diff 预览 + 执行后快照
- ✅ 安全面板 + agent 历史 + 任务抽屉
- ✅ 虚拟滚动消息列表

### TUI 已有
- ✅ Leader key 架构（Space 待命）
- ✅ 模式化快捷键（base / palette / timeline / filePick / permission / diffView）
- ✅ `/undo` `/recap` `/compact` `/context` `/diff` 等会话命令
- ✅ 三态权限规则（allow/deny/ask）+ 持久化
- ✅ 工具卡展开 + rollback（snapshot + git restore 双路径）
- ✅ 会话树 + fork + `/use` + timeline
- ✅ `@file` 候选面板 + Tab 导航
- ✅ 审批模式循环（manual → auto-edits → plan）
- ✅ 思考过程块（thinking block）+ 展开/折叠
- ✅ 预算显示 + 当前工具状态栏

---

## 三、差距映射：Aether 缺失或可加强的 UX

| 优先级 | 缺口 | 说明 | 竞品参考 | Aether 现状 |
|---|---|---|---|---|
| **P0** | **桌面端全局 Undo/Redo** | 消息编辑后无法撤销；工具执行后无统一 undo | Cursor/Windsurf IDE undo/redo；Aider `/undo`；Claude Code 无显式 undo | TUI 有 `/undo`；桌面端无 |
| **P0** | **停止生成后的"继续"可见性** | 流式中断后 Continue 按钮只在 aborted 消息出现；用户可能找不到 | Claude Code 明确的"继续"提示；Codex 重试按钮 | 有，但可更显性 |
| **P0** | **桌面端 `Ctrl+E` 绑定** | ShortcutOverlay 写了，但未实际绑定到任何操作 | Aider `Ctrl+E`=行尾；OpenCode `Ctrl=E`=外部编辑器；全行业标准快捷键 | 仅声明未实现 |
| **P1** | **桌面端命令面板增强** | `Ctrl+K` 存在，但缺少最近会话、最近模型、草稿等快捷入口 | Cursor/Windsurf 命令面板可执行任何操作；OpenCode leader key | 基础可用，可扩展 |
| **P1** | **桌面端键盘快捷键完整覆盖** | 缺少 `Ctrl+Shift+C` 复制代码块、`Ctrl+/` 聚焦输入框等 | OpenCode 全绑定 help 面板；Aider readline 全快捷键；Claude Code 完整快捷键 | 有 ShortcutOverlay，但部分未实现 |
| **P1** | **流式输出停止 UX** | 停止按钮仅 red-500；缺少"生成已停止"的明确反馈 | Claude Code 明确停止提示；Aider 进度条停止 | 有按钮，缺状态反馈 |
| **P1** | **桌面端文件树 / 工作区视图** | 无内置文件浏览器；用户需手动拖放 | Cursor/Windsurf 侧边文件树；Continue 文件树 | 无 |
| **P2** | **桌面端草稿自动保存可见性** | `draft:${sessionId}` 已实现，但用户无感知 | Cursor 草稿恢复提示 | 静默保存，无提示 |
| **P2** | **桌面端消息搜索高亮持久化** | SearchPanel 仅当前会话高亮；关闭后丢失 | VS Code 搜索高亮保留 | 会话级高亮 |
| **P2** | **TUI 消息选择 + 展开** | TUI 有 `selectedMessage` + `expandedMessage`，但桌面端缺少类似"聚焦某条消息" | 无直接竞品 | TUI 领先 |
| **P2** | **桌面端模型自动路由开关** | `modelAutoRoute` 已存在，但缺省关闭且 UI 不显著 | Claude Code 手动指定；无自动路由 | 有设置，缺引导 |
| **P3** | **桌面端自动提交（Git）反馈** | `autoCommitOnTestPass` + `autoCommitAfterFileChange` 已实现，但无提交历史视图 | Aider 自动 commit + 日志 | 有逻辑，缺可视化 |
| **P3** | **TUI `@` 引用跨会话** | 当前 `@file` 仅当前工作区；缺绝对路径或最近文件 | OpenCode `@` 全局引用 | 工作区限定 |
| **P3** | **桌面端 Arena 投票体验** | 已有投票，但缺"查看所有结果"聚合视图 | 无直接竞品 | 基础投票 |
| **P3** | **桌面端空状态引导** | EmptyState 存在，但缺交互式 onboarding | Cursor 欢迎页；Claude Code 首次提示 | 静态空状态 |
| **P3** | **TUI 状态栏信息密度** | 已显示 usage / currentTool / budget，缺系统信息（CPU/内存） | OpenCode 状态栏较满 | 中等 |

---

## 四、优化优先级建议

### P0 — 必须做（影响日常使用）
1. **桌面端全局 Undo/Redo**  
   消息编辑、工具执行后提供 `Ctrl+Z` / `Ctrl+Shift+Z`，或至少消息级"恢复原状"按钮。参考 IDE 标准交互。

2. **停止生成后的明确反馈**  
   停止后显示"生成已停止，按 Continue 继续"提示条，降低用户困惑。

3. **桌面端 `Ctrl+E` 绑定到"编辑最后一条用户消息"**  
   当前 ShortcutOverlay 写了 `Ctrl+E`，但未实际绑定。

### P1 — 应该做（显著提升体验）
4. **扩展桌面端命令面板（`Ctrl+K`）**  
   加入：最近 5 会话、最近 5 模型、快速切换 agent mode、快速切换 effort、新建会话、导出会话。

5. **完善桌面端快捷键体系**  
   补全：`Ctrl+Shift+C` 复制代码块、`Ctrl+Shift+R` 重新生成并保留上下文、`Ctrl+/` 聚焦输入框。

6. **流式输出状态反馈增强**  
   停止按钮点击后，status bar 显示"Stopped by user"而非静默消失。

7. **桌面端侧边文件树（轻量）**  
   工作区文件浏览器，支持点击插入 `@` 引用，减少拖放依赖。

### P2 — 可以做（细节打磨）
8. **草稿保存提示**  
   刷新后恢复草稿时，显示"已恢复上次未发送的内容"toast。

9. **搜索高亮持久化**  
   关闭 SearchPanel 后保留关键词高亮，直到用户清空。

10. **桌面端消息聚焦锚点**  
    点击 MessageNav 或搜索跳转时，目标消息短暂高亮边框。

11. **模型自动路由引导**  
    设置页添加"推荐：开启自动路由以省去手动切换模型"的说明。

### P3 — 可以不做（锦上添花）
12. 桌面端自动提交可视化（Git 提交历史 mini 面板）
13. TUI `@` 引用支持最近文件历史
14. Arena 结果聚合对比视图
15. 桌面端交互式 onboarding tour
16. TUI 状态栏显示系统资源

---

## 五、可直接落地的 Quick Wins

以下改动可在 1-2 天内完成，且对用户体验提升明显：

| Quick Win | 预估工作量 | 影响 |
|---|---|---|
| 绑定 `Ctrl+E` 到编辑最后一条消息 | 30 分钟 | 高 |
| 停止生成后显示状态提示 | 20 分钟 | 中 |
| 草稿恢复 toast | 20 分钟 | 中 |
| 搜索高亮持久化 | 40 分钟 | 中 |
| 命令面板添加"最近会话" | 1 小时 | 高 |
| 消息聚焦高亮 | 30 分钟 | 低 |

---

## 六、架构层面的观察

从审计 OpenCode/Crush 源码中发现的几个值得借鉴的模式：

1. **集中式 key.Binding 注册表**：所有组件的快捷键都实现 `BindingKeys() []key.Binding` 接口，help 面板自动收集渲染。Aether 的快捷键散落在各组件中，缺少集中注册。

2. **dialog 包模块化**：`dialog/commands.go`、`dialog/session.go`、`dialog/permission.go` 等独立文件，每个 dialog 独立 keymap + Update + View。Aether TUI 的 `keyHandlers.js` 模式化架构已经对齐，但桌面端缺少类似的模块化快捷键管理。

3. **pubsub 事件驱动渲染**：OpenCode 用 `pubsub.Event[session.Session]` 和 `pubsub.Event[message.Message]` 驱动 UI 更新，Aether 的 Zustand store 已实现类似 pubsub 语义，但事件类型不够细粒度（没有按 message/toolCall/session 分 event type）。

4. **viewport 缓存**：OpenCode 的 messagesCmp 维护 `cachedContent map[string]cacheItem`，按 width 缓存渲染结果避免重复计算。Aether 桌面端的虚拟滚动已有类似优化。

5. **附件删除模式**：OpenCode 用 `Ctrl+R` 进入 delete mode + 数字键选择删除，比 Aether 的 `×` 按钮更键盘友好。

---

*分析基于代码审查 + 公开文档/changelog 研究。竞品功能可能随版本更新而变化，建议每季度复核一次。*
