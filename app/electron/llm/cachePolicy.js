// ───────────────────────────────────────────────────────────────────────────
// Prompt Cache Policy — 自动为支持的 provider 注入缓存断点。
//
// 借鉴自 OpenCode 的 cache-policy 层。在请求 body 编译期自动标记缓存
// 断点，让多轮 tool loop（每轮重发 system + 历史 + tools）能命中前缀
// 缓存，显著降低重复前缀的成本与延迟。
//
// 策略:
//   - Anthropic: 显式 cache_control: {type:'ephemeral'} 断点
//     · system 字段转数组,末块标记
//     · 最后一条 user 消息的末个 content block 标记
//     · (如有)最后一个 tool 定义标记
//   - OpenAI / DeepSeek / Gemini: 隐式 prefix cache,无需显式断点,跳过
//
// Anthropic 限制:最多 4 个 cache_control 断点;前缀需 ≥1024 tokens 才命中
// (Sonnet/Opus) 或 ≥2048 (Haiku)。低于阈值不会报错,只是不命中。
// ───────────────────────────────────────────────────────────────────────────

const ANTHROPIC_CACHE_MIN_SYSTEM_CHARS = 500 // 太短的 system 不值得加断点

// 给 Anthropic 请求 body 注入 cache_control 断点。原地修改并返回 body。
function applyAnthropicCache(body) {
  if (!body || typeof body !== 'object') return body

  // 1. system → 数组形式,末块加 cache_control
  if (body.system) {
    if (typeof body.system === 'string') {
      if (body.system.length >= ANTHROPIC_CACHE_MIN_SYSTEM_CHARS) {
        body.system = [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }]
      }
    } else if (Array.isArray(body.system) && body.system.length > 0) {
      const last = body.system[body.system.length - 1]
      if (last && !last.cache_control) last.cache_control = { type: 'ephemeral' }
    }
  }

  // 2. 最后一条 user 消息的末个 content block 加 cache_control
  //    (tool loop 中这可能是 tool_result 转成的 user 消息 —— 缓存到工具结果为止,
  //     下一轮重发时前缀命中,这正是多轮降本的关键)
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const msg = body.messages[i]
      if (msg && msg.role === 'user') {
        if (typeof msg.content === 'string') {
          msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
        } else if (Array.isArray(msg.content) && msg.content.length > 0) {
          const last = msg.content[msg.content.length - 1]
          if (last && !last.cache_control) last.cache_control = { type: 'ephemeral' }
        }
        break
      }
    }
  }

  // 3. 最后一个 tool 定义加 cache_control (anthropicAdapter 当前未传 tools,
  //    但预留 —— 未来补 tools 字段时自动生效)
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    const last = body.tools[body.tools.length - 1]
    if (last && !last.cache_control) last.cache_control = { type: 'ephemeral' }
  }

  return body
}

// 按 api_format 分发。非 Anthropic 原样返回 (隐式 prefix cache)。
function applyCachePolicy(body, apiFormat) {
  if (apiFormat === 'anthropic') return applyAnthropicCache(body)
  return body
}

module.exports = { applyCachePolicy, applyAnthropicCache }
