#!/usr/bin/env node
// MCP stdio echo server fixture（todo 14 interop 测试用）。
// 说 JSON-RPC 2.0 over stdio：initialize → notifications/initialized →
// tools/list（暴露 get_echo 工具，名称含 get → adaptTool 判 risk 'safe'，
// 走权限门时无需确认）→ tools/call（原样回显 text 参数）。
const readline = require('node:readline')

const rl = readline.createInterface({ input: process.stdin })
const send = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)

rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'echo', version: '1.0.0' },
      },
    })
  } else if (msg.method === 'notifications/initialized') {
    // 无响应
  } else if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id, result: {
        tools: [{
          name: 'get_echo',
          description: 'echo back the text argument',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
        }],
      },
    })
  } else if (msg.method === 'tools/call') {
    const args = (msg.params && msg.params.arguments) || {}
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `echo:${args.text ?? ''}` }] } })
  } else if (msg.id != null) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } })
  }
})
