# Security Policy / 安全策略与防护架构

[English](#english) · [简体中文](#简体中文)

---

<a id="english"></a>

## English

Aether is a **100% local-first AI workbench**. All user data — including encrypted API keys, sessions, long-term memories, Knowledge Graph nodes, and Arena evaluation records — is stored locally on your machine in `%APPDATA%/aetherai/aetherai.db`.

- **Zero Telemetry**: Aether operates no cloud relay, analytics tracker, or telemetry server.
- **Direct Outbound Connections**: Network requests are sent exclusively to the LLM API endpoints (`OpenAI`, `Anthropic`, `DeepSeek`, `OpenRouter`, local `Ollama`, etc.) and MCP servers that **you** explicitly configure.

### 1. Reporting a Vulnerability

If you discover a security vulnerability (such as a permission gate bypass, path traversal, command injection, or indirect prompt injection vector), please **do not open a public GitHub issue**.

Instead, report it privately via **GitHub Security Advisories**:
1. Navigate to the repository's [**Security** tab](https://github.com/TQSY114514/Aether/security/advisories) → **Report a vulnerability**.
2. Provide a clear description of the vulnerability, minimal reproduction steps, and the affected Aether version.

We acknowledge reports within **72 hours** and prioritize patches for sandbox or credential-exposure vulnerabilities.

---

### 2. Defense-in-Depth Agent Security Architecture

Because an AI agent capable of reading/writing files and running terminal commands carries inherent risk, Aether enforces **five layers of defense**:

#### Layer 1: 6-Axis Capability Permission System (`trustEngine.js`)
Every tool invocation is evaluated across six independent capability axes:
- `READ` (file & symbol inspection)
- `WRITE` (file creation, modification, deletion)
- `EXECUTE` (shell commands & process execution)
- `NETWORK` (HTTP requests & web fetching)
- `GIT` (version control mutations)
- `EXTERNAL` (third-party MCP server tools)

Paired with four operating modes (`Plan` → `Ask` → `Auto` → `Yolo`):
- **`Plan` Mode**: Physically disables all write and execution tools.
- **`Ask` Mode (Default)**: Requires explicit user approval with an inline syntax-highlighted Diff preview before any mutation lands on disk.
- **Dynamic Risk Escalation (`ALWAYS_ASK`)**: Even in `Auto` mode or when session-level allow rules are active, destructive operations (e.g., touching `.env` / credential files, deleting directories, running `npm install` or arbitrary scripts) dynamically bypass session allowlists and force an interactive approval prompt.

#### Layer 2: Pluggable Execution Isolation (`local` / `docker` / `ssh`)
Aether supports executing agent commands inside an isolated **Docker Container Sandbox (`dockerBackend.js`)** with resource budgets, preventing untrusted code or `Yolo` mode loops from mutating your host OS outside the mounted workspace.

#### Layer 3: Tool Result Sanitization (`toolResultMiddleware.js`)
Before any tool output or terminal log is returned to the LLM context or written to audit logs, `toolResultMiddleware` automatically scans and redacts secret patterns (API tokens, private keys, bearer credentials) and truncates oversized outputs.

#### Layer 4: Indirect Prompt Injection Defense (`<untrusted_memory>`)
Memories extracted from external sources (web fetches, third-party tool outputs) are tagged with `origin='external'` in SQLite. During context prefetch:
1. Workspace scoping (`getMemoriesScoped`) runs **fail-closed**, preventing memories from Repository A from leaking into Repository B.
2. External memories are capped in count, placed at the end of the context block, and isolated inside `<untrusted_memory>` delimiters instructing the model never to follow instructions contained within them.

#### Layer 5: Credential & Storage Protection
- **API Keys**: Encrypted at rest using OS-native credential storage (`Electron safeStorage` / Windows DPAPI) where supported, with explicit warnings when exporting portable configuration bundles.
- **Local Files**: Never share your `%APPDATA%/aetherai/aetherai.db` file publicly, as it contains your conversation history and workspace facts.

---

<a id="简体中文"></a>

## 简体中文

Aether 是一个**纯粹的本地优先（Local-first）AI 工作台**。你的所有数据——包括加密存储的 API 密钥、会话历史、长期记忆、知识图谱（`kg_nodes` / `kg_edges`）以及竞技场评测数据——均保存在本机 `%APPDATA%/aetherai/aetherai.db` 中。

- **零遥测与零云端中转**：Aether 不设任何官方中转服务器或行为统计后台。
- **直连受控接口**：所有出站网络请求仅发往**你自己配置**的模型提供商接口（如 DeepSeek、OpenRouter、OpenAI、Anthropic 或本地 Ollama）及你挂载的 MCP 服务。

### 1. 安全漏洞私密报告流程

如果你发现了潜在的安全漏洞（例如权限门绕过、目录穿越、高危命令拦截逃逸或间接提示词注入），请**切勿直接提交公开的 GitHub Issue**。

请通过 GitHub 原生私密通道提交：
1. 点击仓库顶部的 [**Security（安全）** 标签页](https://github.com/TQSY114514/Aether/security/advisories) → 点击 **Report a vulnerability（报告漏洞）**。
2. 附上漏洞原理描述、最小复现步骤及涉及的 Aether 版本号。

我们会在 **72 小时内**响应确认，并优先发布安全修复版本。

---

### 2. Aether 的五层纵深防御架构

赋予 AI Agent 读写文件与执行终端命令的能力天然伴随着安全风险。为此，Aether 在运行时构建了五道刚性防线：

#### 第一层：6 轴能力权限门与动态高危拦截 (`trustEngine.js`)
系统将工具权限拆分为六个正交能力维度进行独立校验：
- `READ`（代码与目录只读检索）
- `WRITE`（文件新建、修改与删除）
- `EXECUTE`（Shell 与子进程执行）
- `NETWORK`（外部网络请求与网页抓取）
- `GIT`（版本控制写入操作）
- `EXTERNAL`（第三方 MCP 扩展工具调用）

配合四档操作阶梯（`Plan` 只读规划 → `Ask` 逐次确认 → `Auto` 受控自动 → `Yolo` 沙箱全速）：
- **行内 Diff 预审**：在默认的 `Ask` 模式下，所有文件修改必须先展示红绿高亮的行内 Diff 卡片，经人工批准后才写入磁盘。
- **高危动作强制升级 (`ALWAYS_ASK`)**：即使在 `Auto` 模式或开启了会话级记住授权的情况下，一旦 Agent 尝试修改 `.env` 敏感配置、删除文件或执行 `npm install` 等高风险命令，权限引擎会强制绕过会话白名单并弹窗拦截。

#### 第二层：多执行后端与 Docker 容器沙箱 (`dockerBackend.js`)
除本地进程（`local`）与远程 SSH（`ssh`）外，Aether 内置了 **Docker 容器沙箱执行后端**。在运行不信任的代码或开启全自动调试循环时，可将执行环境隔离在受限容器内，避免污染宿主机系统。

#### 第三层：工具输出自动脱敏中间件 (`toolResultMiddleware.js`)
所有内置工具与 MCP 工具的返回结果在送入大模型上下文之前，均强制流经 `toolResultMiddleware`，自动识别并掩码脱敏输出中可能包含的 API 密钥、私钥与 Bearer Token，防止本地密钥意外外泄给远端模型。

#### 第四层：工作区作用域隔离与防间接提示词注入 (`<untrusted_memory>`)
1. **跨工作区零串味 (`getMemoriesScoped`)**：长期记忆严格按项目工作区（Workspace）隔离，采用 Fail-Closed 策略，防止不同代码仓库的上下文互相污染。
2. **外部记忆沙箱化**：来自网页抓取或外部工具的记忆会被强制标记为 `origin='external'`，在注入上下文时限制条数、置于末尾，并用 `<untrusted_memory>` 标签严密包裹，阻断通过网页内容实施的间接提示词注入（Indirect Prompt Injection）。

#### 第五层：本地凭证加密 (`safeStorage`)
- API 密钥通过系统原生安全存储（Windows DPAPI / `safeStorage`）加密保存；在导出或迁移配置时会自动检测并提醒跨设备加密状态差异。
- 请妥善保管本机 `%APPDATA%/aetherai/aetherai.db` 数据库文件，切勿在提交日志或公开分享时附带该文件。
