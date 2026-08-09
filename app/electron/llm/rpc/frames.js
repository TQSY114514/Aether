// ─────────────────────────────────────────────────────────────────────────────
// rpc/frames.js — JSONL RPC 帧构建/解析（todo 10，纯函数，Electron-free）
// 帧形态：
//   request { type:'request', reqId, method, params }
//   event   { type:'event',   reqId, event, payload? }        ← run 的 STREAM 事件
//   result  { type:'result',  reqId, ok, result? }
//   error   { type:'error',   reqId, message }
// 每帧一行 JSON（\n 分隔）；stdout 只写帧，不混人类文本。
// ─────────────────────────────────────────────────────────────────────────────

function pushFrame(obj) {
  return `${JSON.stringify(obj)}\n`
}

function consumeLine(line) {
  const s = String(line || '').trim()
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function requestFrame(reqId, method, params) {
  return { type: 'request', reqId, method, params: params || {} }
}

function eventFrame(reqId, event, payload) {
  const f = { type: 'event', reqId, event }
  if (payload !== undefined) f.payload = payload
  return f
}

function resultFrame(reqId, result, ok = true) {
  const f = { type: 'result', reqId, ok }
  if (result !== undefined) f.result = result
  return f
}

function errorFrame(reqId, message) {
  return { type: 'error', reqId, message: String(message || '') }
}

function isRequest(f) {
  return !!f && f.type === 'request' && typeof f.reqId === 'string' && f.reqId !== '' && typeof f.method === 'string'
}

module.exports = {
  pushFrame,
  consumeLine,
  requestFrame,
  eventFrame,
  resultFrame,
  errorFrame,
  isRequest,
}
