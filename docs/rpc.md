# RPC 帧协议（aether --mode rpc）

stdin 逐行读 JSON 请求帧，stdout 逐行写 JSON 事件/结果/错误帧。**一行一帧**，
stdout 绝不混人类文本。退出码：`0` = 正常 EOF 收尾；`1` = 致命错误（无 db /
循环异常，仍先发 error 帧）。

## 帧形态

```jsonc
// 请求（入）—— reqId 由调用方生成，回调按 reqId 匹配
{"type":"request","reqId":"c1","method":"listModels","params":{}}

// 事件（出）—— run 的 STREAM 事件：text / tool:start / tool:end / status / plan
{"type":"event","reqId":"c1","event":"text","payload":{"delta":"hello","done":false}}

// 结果（出）
{"type":"result","reqId":"c1","ok":true,"result":{"models":[]}}

// 错误（出）
{"type":"error","reqId":"c1","message":"unknown method: foo"}
```

## 方法集（宿主见 `app/electron/llm/rpc/server.js` 文件头）

| 方法 | 说明 |
|---|---|
| `run` | 跑一轮 agent（STREAM 事件 + 最终 result） |
| `listModels` / `listProviders` | 模型/提供方列表 |
| `models.default` | 解析默认模型 → `{ provider, model }` |
| `listSessions` | 最近会话（含 `parentId`） |
| `session.load` | 会话 + 消息列表 |
| `session.fork` | 创建子会话（写 `parent_session_id`） |
| `task.derive` | 派生后台任务 → `{ taskId, sessionId }` |
| `task.status` | 任务状态（缺失 → `ok:false` result） |

## 示例（PowerShell）

```powershell
$req = '{"type":"request","reqId":"c1","method":"listModels","params":{}}'
$req | node app/cli.js --mode rpc --db "$env:APPDATA\Aether\aetherai.db"
```

## 冒烟

`npm run smoke:rpc`（`app/scripts/smoke-rpc.js`）自建临时 db，管道喂两个请求，
断言收到 ≥2 个 result 帧。
