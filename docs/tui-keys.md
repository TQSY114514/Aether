# TUI 键位表（aether tui）

交互式终端 UI（Ink v5）的键盘操作一览。全部键位在 `app/tui/keymap.js`（纯函数
`keyToAction`）与 `app/tui/App.mjs`（组件层）实现，`node app/cli.js tui --smoke`
可在无 TTY 下驱动预设键序并打印状态机 JSON 序列。

## 普通态（可输入）

| 键 | 行为 |
|---|---|
| 字符 | 追加到输入框 |
| `Backspace` | 删除输入框最后一个字符 |
| `Enter` | 提交（空输入/运行中忽略） |
| `m` | 循环切换模式 ask → plan → auto → ask |
| `v` | 展开最近一张完成工具卡的 diff 视图 |
| `Ctrl+C` | 空闲时退出；**运行中打断**进入 follow-up 输入态 |

## 权限等待态（awaitingPermission 面板）

| 键 | 行为 |
|---|---|
| `y` | 允许本次工具调用 |
| `n` | 拒绝本次工具调用 |
| `a` | 总是允许（记入会话 allowRules，同规则下次免问） |
| `Ctrl+C` | 中止（= 拒绝） |

## Diff 视图（工具卡展开）

| 键 | 行为 |
|---|---|
| `Enter` / `Esc` | 接受并关闭 diff 视图 |
| `r` | 回滚该工具变更（写前快照还原优先；git 仓库缺失快照时才 git restore） |

## Steering（运行中 Ctrl+C 打断后）

| 键 | 行为 |
|---|---|
| 输入 + `Enter` | 把下一条消息注入运行中的 agent 循环（队列渲染 +1） |
| `Ctrl+C` | 取消打断态 |

## 斜杠命令（输入框以 `/` 开头 + Enter）

| 命令 | 行为 |
|---|---|
| `/sessions` | 列出最近会话（含 fork 父指针） |
| `/use <id>` | 切换活动会话 |
| `/fork [title]` | 以当前会话为父创建子会话（写 `session.parent_session_id`） |
| `/memory <关键词>` | 记忆检索（命中卡片含类型/时间） |
| `/persona <id>` | 切换人设（后续会话注入 persona + 记忆前缀） |
| `/skills` | 列出 habitLearner 技能提案 |
| `/skill accept <key>` | 接受技能提案（promote 闭环） |
| `/skill dismiss <key>` | 忽略技能提案 |

## 退出

空闲态 `Ctrl+C` → `quitRequested` → 退出。非 TTY 下必须用 `--smoke` 才能运行。
