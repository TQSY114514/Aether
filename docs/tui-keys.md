# TUI 键位表（aether tui）

交互式终端 UI（Ink v5）的键盘操作与斜杠命令一览。**实现即真相**：全部键位在
`app/tui/keyHandlers.js` 中定义（`normalizeKey` 按键归一 → `resolveMode` 解析当前
模式 → `modeHandlers` 模式命令表 → `dispatchKey` 调度），斜杠命令在
`app/tui/sessionCommands.js`（`SLASH_COMMANDS` + `parseSessionCommand`）。

本表使用与 `keybindings.json` 重绑一致的关键字（见下文「键位重绑」）：如 `alt-m`、
`ctrl-p`、`char:?`、`shift-tab`、`pageup`。

`node app/cli.js tui --smoke` 可在无 TTY 下驱动预设键序并打印状态机 JSON 序列
（CI 安全，退出码 0）。

> 帮助屏（`char:?`）只展示常用子集，本文件为完整参考。

## 总览

- 大多数键位仅在**空输入框**时生效（避免吞掉输入框打字）——表中以「空输入」标注。
- 模态（面板/选择器/权限门等）打开时优先于 base 态；模态内未认出的键被静默吞掉。
- `Ctrl+C` 语义分场景：运行中打断进入 follow-up（steering），空闲时退出。

## base — 基础模式（可输入）

| 键 | 行为 |
|---|---|
| `alt-m` | 循环切换模式 ask → plan → auto（空输入） |
| `shift-tab` | 循环审批模式 manual → auto-edits → plan（空输入） |
| `ctrl-t` | 开关 todo 任务清单面板（空输入） |
| `ctrl-p` | 打开命令面板（空输入） |
| `char:x` | 打开命令面板（空输入，lazygit x 菜单式） |
| `char:?` | 打开帮助屏（空输入） |
| `ctrl-x` | leader 键待命：随后按 `m`/`n`/`l`/`g`/`r`/`q`/`e`（见 leader 模态） |
| `ctrl-c` | 运行中：打断进入 follow-up（steering）；空闲：退出 |
| `ctrl-f` | 收藏/取消当前模型（空输入，持久化到 settings） |
| `f2` | 循环最近使用模型（空输入，最近 ≤5 个） |
| `alt-up` / `alt-down` | 选中/取消选中上一条/下一条消息（空输入） |
| `pageup` / `pagedown` | 消息区逐行滚动 ±1（空输入） |
| `up` | 斜杠补全候选上移（输入以 `/` 开头时）；否则空输入回填上一条历史 |
| `down` | 斜杠补全候选下移；否则空输入前进到下一条历史 |
| `tab` | 运行中 + 有输入：排队下一条 follow-up（不打断 agent）；斜杠态：填入候选 |
| `enter` | 提交；选中消息 + 空输入：展开/折叠长消息；无选中 + 空输入 + 有思考块：切换思考块折叠；斜杠候选确认 |
| `alt-v` | 展开最近一张工具卡的 diff 视图（非运行、空输入、有工具调用） |
| `esc` | 有输入：清空输入（≥20 字符草稿入历史）；空输入：第一次 armed，1.5 秒内再按退出 |
| `left` / `right` | 输入框光标左/右移（输入非空） |
| `home` / `end` | 输入框光标移到行首/行尾（输入非空） |
| `ctrl-w` | 删除光标前一个词（输入非空） |
| `ctrl-u` | 清空光标前整行（输入非空） |
| `ctrl-k` | 删除光标到行尾（输入非空） |
| `ctrl-a` / `ctrl-e` | 光标移到行首/行尾（输入非空，等效 home/end） |
| `shift-enter` | 输入框内换行（多行输入，不提交） |
| `char` | 可打印字符：在光标处插入（含粘贴）并同步 `@` 候选 |
| `backspace` | 删除光标前字符 |

> 输入框非空时，除 `esc`/`enter`/`char`/`backspace` 及编辑键外，多数功能键不响应
> ——用 `esc` 清空输入后再操作。

## filePick — @ 文件候选

输入框词首 `@` 触发；候选随输入实时重算（`syncFilePick`）。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` / `shift-tab` | 候选上移 |
| `down` / `ctrl-n` / `tab` | 候选下移 |
| `enter` | 接受当前候选，插入完整 `@path`（继续编辑，不提交） |
| `esc` | 关闭候选面板 |
| `backspace` | 删除光标前字符并重算候选 |
| `char` | 继续输入过滤（重算候选） |

## modelPicker — 模型选择器

`ctrl-x` 然后 `m`（或命令面板 Model）打开；输入过滤，`enter` 确认后切换模型。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 模型列表上移 |
| `down` / `ctrl-n` | 模型列表下移 |
| `pageup` / `pagedown` | 模型列表快移 ±10 |
| `enter` | 选中当前（过滤后）模型并应用 |
| `esc` | 关闭选择器（不切换） |
| `backspace` | 删除过滤字符 |
| `char` | 追加过滤字符 |

## leader — leader 待命

`ctrl-x` 后进入；任意键解除待命，仅可打印字符有动作（小写化后查表）：

| 键 | 行为 |
|---|---|
| `char` | `m` 模型选择器 / `n` 新会话 / `l` 会话列表 / `g` 时间线 / `r` rewind 检查点 / `q` 退出 / `e` 外部编辑器（$EDITOR / $VISUAL，回退 notepad.exe） |

## palette — 命令面板

`ctrl-p` 或 `x` 打开。条目：New chat / Model / History (sessions) / Timeline /
Export JSONL / Help / Quit。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 候选上移 |
| `down` / `ctrl-n` | 候选下移 |
| `enter` | 执行当前候选 |
| `esc` | 关闭面板 |
| `backspace` | 删除过滤字符 |
| `char` | 追加过滤字符 |

## timeline — 时间线

`ctrl-x` 然后 `g` 打开（祖先链会话列表）。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 会话上移 |
| `down` / `ctrl-n` | 会话下移 |
| `enter` | 切换并加载所选会话 |
| `esc` | 关闭 |

## permission — 权限审批

工具请求权限时弹出（工具权限门）。三态决策会写入会话规则（`allow always` 持久化）。

| 键 | 行为 |
|---|---|
| `char:y` | 允许本次（once） |
| `char:a` | 总是允许（记入规则） |
| `char:n` | 拒绝本次 |
| `left` / `char:h` | 选项左移 |
| `right` / `char:l` | 选项右移 |
| `enter` | 确认当前选项（allow / always / deny） |
| `esc` / `ctrl-c` | 拒绝并关闭 |

## permDialog — /permissions 对话框

`/permissions` 打开：列出会话级 + 持久化级规则，可过滤、可删除。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 规则列表上移（按过滤后列表） |
| `down` / `ctrl-n` | 规则列表下移 |
| `char:d` | 删除选中规则 |
| `esc` | 关闭对话框 |
| `backspace` | 删除过滤字符 |
| `char` | 追加过滤字符（palette 式） |

## diff — 工具卡 diff 视图

`alt-v`（或工具卡展开）进入：单次工具调用的写前快照 diff。

| 键 | 行为 |
|---|---|
| `enter` | 接受并关闭 diff 视图 |
| `esc` | 接受并关闭 diff 视图 |
| `char:r` | 回滚该工具变更（写前快照还原优先；git 仓库缺失快照时才 git restore） |

## diffView — /diff 聚合查看器

`/diff` 打开：git 未提交变更聚合（非 git 目录用工具写前快照对比）。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 切换文件（上） |
| `down` / `ctrl-n` | 切换文件（下） |
| `left` / `right` | 切换「全部 / 当前文件」视图 |
| `esc` | 关闭查看器 |

## askUser — 结构化提问

agent 的 `ask_user` 工具（Claude Code 式选项提问），可能连续多问。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 选项上移 |
| `down` / `ctrl-n` | 选项下移 |
| `enter` | 确认当前选项（最后一问时把答案交还 agent） |
| `esc` | 取消提问（交还 null） |

## planDone — 计划完成三选项

plan 模式规划完成后的抉择（自动接受并实施 / 手动接受并实施 / 继续规划）。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 选项上移 |
| `down` / `ctrl-n` | 选项下移 |
| `enter` | 确认当前选项 |
| `esc` / `char:c` | 取消（留在 plan 模式继续规划） |

## rewind — 检查点恢复

`ctrl-x` 然后 `r`（或双击 `esc` 提示）打开：恢复快照 + 截断对话。

| 键 | 行为 |
|---|---|
| `up` / `ctrl-p` | 检查点上移 |
| `down` / `ctrl-n` | 检查点下移 |
| `enter` | 恢复所选检查点并截断 |
| `esc` | 关闭 |

## help — 帮助屏

`char:?` 打开。任意键关闭，不吞后续输入。

| 键 | 行为 |
|---|---|
| `esc` / `enter` / `char` / `up` / `down` | 关闭帮助屏 |

## todo — 任务清单面板

`ctrl-t` 切换（只读展示 agent 的 todo 清单；任意键关闭）。

| 键 | 行为 |
|---|---|
| `esc` / `enter` / `char` / `ctrl-t` | 关闭面板 |

## steering — follow-up 输入（运行中打断后）

`ctrl-c`（运行中）进入；把下一条指令注入运行中的 agent 循环，队列显示 `steer:n`。

| 键 | 行为 |
|---|---|
| `enter` | 提交 follow-up 并入队（`injectSteering`） |
| `ctrl-c` | 取消打断态（回到原循环） |
| `backspace` | 删除输入字符 |
| `char` | 追加输入（光标先置行尾） |

> 运行中在 base 态按 `tab` 也可直接排队下一条消息（不打断 agent）。

## 斜杠命令（输入框以 `/` 开头 + Enter）

输入 `/` 时 `up`/`down` 或 `tab` 在补全候选间导航/填入。完整命令表：

| 命令 | 参数 | 行为 |
|---|---|---|
| `/sessions` | — | 列出最近会话（含 fork 父指针） |
| `/use <id>` | `<id>` | 切换活动会话 |
| `/fork [title]` | `[title]` | 以当前会话为父创建子会话 |
| `/rename <title>` | `<title>` | 重命名当前会话 |
| `/delete` | — | 删除当前会话（需 `y` 确认，级联删消息） |
| `/memory <关键词>` | `<关键词>` | 记忆检索 |
| `/persona <id>` | `<id>` | 切换人设（注入 persona + 记忆前缀） |
| `/model [name]` | `[name]` | 切换模型（无参列出/提示） |
| `/mode [mode]` | `[mode]` | 切换模式（ask / plan / auto） |
| `/effort <level>` | `low|medium|high` | 设置思考力度 |
| `/status` | — | 显示状态 |
| `/skills` | — | 列出 habitLearner 技能提案 |
| `/skill accept <key>` | `<key>` | 接受技能提案 |
| `/skill dismiss <key>` | `<key>` | 忽略技能提案 |
| `/apikey [provider] <key>` | `[provider]` `key` | 保存 API key（无参查看已存；两参存指定 provider） |
| `/permissions` | — | 打开权限规则对话框 |
| `/permissions add <name> <ruleKey> <allow/deny/ask>` | 3 参 | 添加权限规则 |
| `/approval-mode [mode]` | `manual|auto-edits|plan|dontask` | 查询/设置审批模式 |
| `/provider add <name> <base-url> [api-format]` | `name` `base-url` `[openai\|anthropic]` | 添加 provider |
| `/provider list` | — | 列出 provider |
| `/provider` | — | 用法提示（`/provider add` / `/provider list`） |
| `/export [path]` | `[path]` | 导出当前会话 JSONL |
| `/compact` | — | AI 摘要压缩当前会话历史 |
| `/compress-fast` | — | 无 AI 纯裁剪旧工具输出 |
| `/context` | — | 上下文占用（消息数 / 估算 token / 模型上限） |
| `/clear` | — | 新会话语义（保留记忆与 DB 历史） |
| `/undo` | — | 撤销最后一轮（DB 截断 + 写文件快照恢复） |
| `/recap` | — | 一行会话摘要（弱模型生成，失败回退拼接） |
| `/diff` | — | 未提交变更查看器 |
| `/help` | — | 帮助屏 |
| `/quit` | — | 退出（等效双击 `esc`） |

> 另：base 态直接输入 `exit` / `quit` / `:q` 回车也可退出；`!命令` 前缀（非 `!!`）
> 走 sandbox 拦截执行 shell 命令并把输出注入上下文。

## 键位重绑

用户键位重绑（对齐 Claude Code / Codex 的 keybindings 机制）：

- 配置文件：`~/.config/aether/keybindings.json`；可用环境变量
  `$AETHER_KEYBINDINGS` 指定替代路径（优先级高于默认路径）。
- 格式：`{ "默认keyId": "新keyId" | null }`——`null` 禁用该键。
- 示例：`{ "shift-tab": "ctrl-t", "char:?": null }`（Shift+Tab 改到 Ctrl+T，
  禁用 `?` 帮助键）。
- keyId 与 `normalizeKey` 输出一致：`up` `down` `left` `right` `pageup` `pagedown`
  `enter` `esc` `tab` `shift-tab` `backspace` `ctrl-c` `ctrl-x` `ctrl-p` `ctrl-n`
  `ctrl-t` `ctrl-f` `alt-m` `alt-v` `alt-up` `alt-down` `f2` `home` `end` `char`
  `char:?` `char:y` 等（单字符键用 `char:<字符>` 具体映射，通用 `char` 不参与）。
- 修改后重启 TUI 生效（启动时读取一次）。

## --smoke 状态机冒烟

`node app/cli.js tui --smoke`：无 TTY 下按预设键序驱动同一 reducer + keymap 路径，
逐步打印状态机 JSON 快照（输入编辑、多行、长消息展开/折叠、todo、thinking、
RESET、退出），退出码 0 表示通过——CI 与开发回归用。
