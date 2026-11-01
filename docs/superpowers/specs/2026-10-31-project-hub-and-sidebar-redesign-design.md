# Design Doc: 现代项目中心 (Project Hub) 与侧边栏清爽重构

- **日期**：2026-10-31
- **状态**：Pending Approval (已完成审查与决策对齐)
- **目标**：彻底解决 Aether 侧边栏层级杂乱、非主流部件堆叠的问题，并将「项目（Project / Workspace）」提升为第一公民级的独立工作空间中心，对齐 Claude Projects / Linear 的主流交互体验。

---

## 一、背景与动机 (Intent & The Why)

当前 Aether 侧边栏存在严重的**信息架构失衡**与**部件堆砌**问题：
1. **多层异构部件串联挤压**：在 `app/src/components/sidebar/Sidebar.tsx`（宽度仅 250px）的单列空间内，纵向堆叠了 `WorkspaceHeader`（带 4 个微操作按钮的小卡片）、新建按钮、搜索输入框、`FileTree` 折叠面板、分组会话列表、`AgentHistory` 审计日志折叠面板、`QuickControlDeck` 诊断卡片、以及底部 5 个导航项。当用户展开文件树或审计日志时，会话流被完全挤出屏幕。
2. **「项目」概念被严重矮化**：Aether 后端早已具备完善的多工作区（Project）生命周期与数据库表支持（`project` 表、`session.project_id`、工作区沙盒边界绑定、`AGENTS.md` 项目规则感知），但在前端界面中，「项目」仅作为一个顶部小弹窗存在。相比拥有独立视图的「模型」、「角色」、「竞技场」、「长期记忆」，用户无法在一个清晰的面板中总览项目状态、管理项目指令、查看上下文文件或切换项目。
3. **主流产品对齐**：主流 AI Workbench（如 Claude Projects、ChatGPT Workspaces、Linear）普遍采用「纯粹沉浸的会话侧栏 + 结构化项目空间中心」的模式，本项目旨在彻底去除 AI 味小部件堆砌，回归干净高效的主流工作台体验。

---

## 二、目标与非目标 (Goals, Non-goals, Anti-goals)

### 1. Goals (目标)
1. **侧边栏 (Sidebar) 减负与清爽化**：
   - **顶部 Workspace 切换器**：重构为紧凑、优雅的下拉菜单（仅显示当前工作区名称、路径提示与 Git 分支/干净状态，点击展开清晰的最近项目列表、打开文件夹操作与「进入项目中心」入口；移除第二行 4 个杂乱的微型图标）。
   - **项目聚焦会话流（用户拍板：选项 A）**：激活项目后，侧边栏会话列表**自动仅展示当前项目的会话**，提供沉浸无干扰的上下文体验；同时在顶部工作区下拉菜单中提供一键切换至“全部会话”的开关。
   - **纯粹会话流**：彻底移除插在会话流中的 `FileTree` 和 `AgentHistory` 折叠面板，侧栏主体完全服务于「快速检索会话」与「浏览会话历史」。
   - **底部导航升级**：增加「项目」入口（`FolderKanban` 图标），使导航结构与系统能力保持对齐：项目、模型、角色、竞技场、记忆、设置。
2. **构建第一公民级「项目中心」(`app/src/pages/ProjectPage.tsx`)**：
   - 作为独立一级视图（`currentView === 'projects'`），提供完整的工作区看板：
     - **当前项目概览区**：项目名称、物理根路径、Git 实时状态（分支、dirty 文件数、干净状态）、一键在系统文件管理器中打开、一键在终端中打开（或复制 cd 命令）。
     - **项目规则与指令 (Project Instructions)**：检测并直观展示项目根目录下的规则文件（`AGENTS.md` / `AETHER.md` / `CLAUDE.md` 等），支持查看与就地快速编辑保存，打通项目大脑记忆。
     - **项目文件浏览器 (Workspace File Explorer)**：将原本局促挤在侧边栏的文件树（`FileTree`）迁移至项目中心，给用户提供舒适的代码/文档文件树浏览体验，支持点击快速参考。
     - **项目默认预设 (Project Defaults)**：可视化配置该项目的默认模型（Default Model）与默认权限模式（`explore` / `workspace` / `auto_review` / `unrestricted`），新建会话时自动继承。
     - **专属会话聚合 (Project Sessions)**：列表展示属于该项目的所有历史对话，支持「+ 在此项目中新建对话」。
     - **所有项目管理 (All Projects Matrix)**：支持多工作区矩阵切换、星标置顶（Favorite）、新建/导入外部文件夹、以及从工作台列表中移除项目。
     - **无项目时的空态 (Empty/Welcome State)**：当未选择任何项目（`activeProject === null`）时，呈现清爽的欢迎引导卡片，引导用户打开已有文件夹或从最近项目快速开启。
3. **保持状态与会话过滤逻辑清晰**：
   - 切换项目时，平滑更新 `activeProject`，侧边栏会话列表与主会话区即时响应。

### 2. Non-goals (明确不做)
1. **不做重型代码编辑器**：不追随 VS Code / Cursor 引入复杂的多标签代码编辑、分栏代码 diff、语法高亮调试器等（遵守 `docs/roadmap.md`“Aether 定位是 Workspace + Agent，不是 Editor”的约束）。
2. **不变更底层 SQLite 核心 DDL**：复用现有的 `project`、`session` 表及核心字段（`project_id`、`default_model_id`、`default_agent_mode` 等均已就绪）。

### 3. Anti-goals (反目标与设计禁忌)
1. **严格遵守 `docs/ui-design.md` 反 AI 味规范**：
   - 绝对禁止渐变紫/靛蓝强调色、禁止渐变文字标题（`bg-clip-text`）。
   - 禁止在侧栏和卡片中滥用无意义的毛玻璃（`backdrop-blur`）；普通面板使用 `--content-bg` 或 `--bg-secondary` 不透明底色。
   - 禁止大圆角 + 大阴影（卡片一律 `rounded-[8px]` ~ `rounded-[10px]`，弹窗最大 `rounded-[12px]`）。
   - 禁止 emoji 当图标、禁止在文案中粘连 `→` 字符。
   - 所有颜色严格使用 `var(--bg-primary)`、`var(--content-bg)`、`var(--border)`、`var(--accent)`、`var(--text-primary)` 等 CSS 变量。
   - 所有按钮和交互卡片必须具有完整的 `:hover`、`:focus-visible`、`:active`、`:disabled` 状态。

---

## 三、方案对比与选型 (Approaches & Decision)

在前期构思中对比了两个主流方案：
- **方案一：沉浸式项目空间 + 会话极简流（Claude / Linear 风格）**【已选定】
  - *特点*：侧边栏专心做纯净的对话历史与极简工作区切换；全功能的项目管理、文件树、项目指令与项目专属配置移至专属的「项目中心」页面。
  - *权衡*：最契合 Aether 作为“开发者 AI 工作台”的核心定位，日常对话体验丝滑，需要管理工作区时有一目了然的大脑看板。
- **方案二：Cursor / VS Code 式双栏 Activity Bar 架构**【未采纳】
  - *特点*：最左侧设立 48px 图标栏，二级侧边栏按点击切换会话、文件树、项目列表。
  - *权衡*：横向吃掉过多宽度，且频繁在图标间切换会打断对话沉浸感，偏重型编辑器而非轻盈的对话/Agent工作台。

**用户拍板**：采纳**方案一**；激活项目后，侧边栏**自动聚焦当前项目会话（选项 A）**。

---

## 四、技术审查确认项 (Builder Check Decisions)

在审查中确立的技术与实现决策如下：
1. **IPC 契约扩展（三文件法则）**：
   - 严格遵循 `AGENTS.md`“IPC contract is three files”硬规则（`app/electron/ipc/project.handler.js`、`app/electron/preload.js`、`app/src/env.d.ts` 同步更新）：
     - `project:getInstructions(projectId?)`：安全读取该项目根目录下的 `AGENTS.md` / `AETHER.md` / `CLAUDE.md`，返回 `{ fileName, path, content, exists }`。
     - `project:saveInstructions({ projectId?, content })`：带沙盒路径防穿透校验，安全写入指令内容并调用 `invalidateCache()` 使 Agent 实时感知。
2. **项目默认预设生效时机**：
   - `default_model_id` 与 `default_agent_mode` 仅在**新建会话**（`createSession`）时作为初始值应用，绝不中断或强行重写当前正在进行的历史会话或流式任务。若配置的模型无效，平滑降级至全局默认模型。
3. **空态设计**：
   - 当 `activeProject === null` 时，`ProjectPage` 呈现干净的 Welcome Guide，隐藏依赖物理路径的 Git/文件树组件，引导用户打开新文件夹或从全部项目卡片中选择。
4. **AgentHistory 处置**：
   - 从 `Sidebar.tsx` 中彻底下线并清理相关冗余代码，解决垂直堆叠拥挤；审计追踪统一收口在既有的 TaskPanel 或调试流中。

---

## 五、具体架构设计 (Detailed Technical Design)

### 1. 侧边栏重构 (`Sidebar.tsx` & `WorkspaceHeader.tsx`)
- **顶部 Workspace 区域 (`WorkspaceHeader.tsx`)**：
  - 外观收敛为一条干净的下拉触发器（高度约 34px）：
    - 左侧：工作区图标（若为 Git 仓库则显示 `FolderGit2`，普通目录显示 `FolderKanban`） + 项目名称（加粗单行截断） + 若有未提交修改显示微型状态点。
    - 右侧：精致的 `ChevronDown` 箭头。
    - 移除卡片下方的微型操作图标行。
  - 下拉 Popover 内容优化：
    - 当前过滤模式切换（「当前项目会话」 vs 「查看全部会话」一键切换）。
    - 最近工作区列表（带当前活动项 Check 标记、星标置顶按钮）。
    - 快捷动作组：
      - 「进入项目工作区中心 ↗」（触发 `setCurrentView('projects')`，关闭弹窗）。
      - 「+ 打开新项目文件夹…」（触发 `pickDirectory`）。
      - 「在文件管理器中显示」/「复制路径」。
- **侧栏中间区域**：
  - 保留「+ 新建对话」按钮（支持 `Ctrl/Cmd+N` 快捷键提示）。
  - 保留会话搜索框（带快捷清空与结果计数）。
  - **彻底移除 `<FileTree />` 折叠面板**。
  - 会话历史列表：
    - 当有活动项目且未手动切换为“全部会话”时，严格过滤显示 `s.project_id === activeProject.id` 的会话。
    - 保持原有的标题滚动、时间标签、右键菜单（置顶/重命名/导出/在TUI中继续/删除）。
  - **彻底移除 `<AgentHistory />` 折叠面板**。
- **侧栏底部导航区域**：
  - 导航项更新为：
    1. **项目 (Projects)** -> `currentView = 'projects'` (`FolderKanban` 图标)
    2. 模型服务 (Models) -> `currentView = 'models'`
    3. 角色预设 (Personas) -> `currentView = 'agents'`
    4. 模型竞技 (Arena) -> `currentView = 'scores'`
    5. 长期记忆 (Memory) -> `currentView = 'memory'`
    6. 系统设置 (Settings) -> `currentView = 'settings'`
  - 收起态（Icon Rail 44px）同步此顺序，点击直接切换。

### 2. 独立项目中心 (`app/src/pages/ProjectPage.tsx`)
作为一级路由页面，采用双栏响应式布局（左侧为全部项目卡片/列表矩阵，右侧为主工作区看板）：

#### A. 顶部工作区操作条 (Header Toolbar)
- 标题：项目工作区 (Projects Hub)
- 副标题：管理本地工作区、配置项目上下文指令 (`AGENTS.md`) 与项目专属会话
- 操作按钮：
  - 「+ 打开本地文件夹」
  - 「在文件管理器中打开当前项目」
  - 「在终端中打开 (复制 cd)」

#### B. 主工作区：当前活动项目管理看板 (Active Project Workspace)
当有活动项目时，分为四大功能区：
1. **工作区基础信息与运行时预设 (Identity & Runtime Defaults)**：
   - 项目名称与物理路径（支持一键复制路径）。
   - Git 仓库状态：分支名、未提交改动文件数、状态徽章。
   - 默认模型绑定：下拉选择当前项目偏好的 LLM 模型。
   - 默认 Agent 权限模式：切换 `workspace`（受控改动，默认）、`auto_review`（TDD 自愈）、`explore`（只读探查）。
2. **项目智能与上下文指令 (Project Intelligence & Rules)**：
   - 自动检测并读取该项目根目录下的指令文件（优先级：`AGENTS.md` -> `AETHER.md` -> `CLAUDE.md`）。
   - 若存在：以代码/文本卡片展示当前规则内容，提供「就地编辑」与「保存更新」按钮。
   - 若不存在：提供「一键生成 AGENTS.md 模板」按钮，帮助用户快速沉淀项目架构规则，赋能 Agent 记忆。
3. **项目文件浏览器 (Workspace File Explorer)**：
   - 嵌入优雅的 `FileTree` 组件，提供舒适的代码与文档目录浏览。
4. **项目专属会话列表 (Project Sessions)**：
   - 展示所有 `session.project_id === activeProject.id` 的会话。
   - 提供「在此项目新建会话」快捷入口。
   - 会话支持点击直接切回聊天界面并打开对应会话。

#### C. 全部项目矩阵 (All Projects Library)
- 卡片/列表展示所有已注册的项目。
- 显示项目名称、路径、最后打开时间、星标状态。
- 一键点击切换当前活动项目（调用 `openProject(p.id)`）。
- 支持移除项目（调用 `deleteProject(p.id)`，附二次确认，不影响磁盘文件）。

### 3. 应用路由与 Store 联动 (`App.tsx` & `store/index.ts`)
1. 在 `VIEW_TITLES` 中注册 `projects: 'sidebar.nav.projects'`。
2. 在 `App.tsx` 的 `renderPage()` 中挂载 `<ProjectPage />`：
   ```tsx
   case 'projects': return <ProjectPage />
   ```
3. 在 `app/src/utils/i18n-en-base.json` 中补充项目中心所需的本地化键（如 `sidebar.nav.projects`、`projects.hub.title`、`projects.rules.title` 等），并执行 `node app/scripts/gen-i18n.js` 确保多语言自动生成。

---

## 六、实现约束与验证步骤 (Constraints & Verification)

### 1. 约束
- 必须严格遵循 `AGENTS.md` 规范：
  - 绝不硬编码十六进制颜色，全部走 `theme.ts` 的 CSS 变量。
  - 所有按钮有完整的 hover / focus-visible / active / disabled 交互状态。
  - 运行 `cd app && npm run check`（`check-ipc` + `check-deps` + `check-architecture` + `check-ui-tokens` + `tsc --noEmit`），必须 100% 绿色通过。

### 2. 验收清单
1. 侧边栏：
   - 顶部 WorkspaceHeader 是否干净利落？是否去除了杂乱的小图标？
   - 会话流中是否彻底移除了干扰性的 FileTree 和 AgentHistory 折叠面板？
   - 激活项目后，侧边栏会话是否自动过滤仅显示该项目会话？是否可以在顶部菜单切回全局？
   - 底部是否出现「项目 (Projects)」导航项，且收起/展开态均能正确点击？
2. 项目中心：
   - 点击导航中的「项目」是否能够顺利进入 `ProjectPage`？
   - 当前项目的名称、路径、Git 状态、默认模型设置是否正确加载并可交互？
   - 项目规则（`AGENTS.md` 等）是否可检测、可查看、可就地保存？
   - 文件树是否在项目中心中清晰舒展地呈现？
   - 切换项目后，侧边栏与聊天区是否立即响应切换？
3. 静态检查：
   - `npm run check` 零报错通过。
