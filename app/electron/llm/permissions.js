// ───────────────────────────────────────────────────────────────────────────
// Aether Agent — Phase 4.1: Permission Model Upgrade (5-tier + hook override)
//
// Permission levels assigned to a tool invocation or runtime session.
// ReadOnly < WorkspaceWrite < DangerFullAccess < Allow form the permissive
// ladder compared with >= semantics. Prompt is NOT on the ladder — it is
// "confirm each call" semantics: it never satisfies a >= escalation check
// (ReadOnly requirements are the exception — safe tools run in every mode)
// and instead routes the request to the prompt branch (audit P0-C1).
// ───────────────────────────────────────────────────────────────────────────

// ── PermissionMode (ordered 0-4, least to most permissive) ────────────────

const PermissionMode = Object.freeze({
  ReadOnly:         0,
  WorkspaceWrite:   1,
  DangerFullAccess: 2,
  Prompt:           3,
  Allow:            4,
})

const PermissionModeLabel = Object.freeze({
  [PermissionMode.ReadOnly]:         'read-only',
  [PermissionMode.WorkspaceWrite]:   'workspace-write',
  [PermissionMode.DangerFullAccess]: 'danger-full-access',
  [PermissionMode.Prompt]:           'prompt',
  [PermissionMode.Allow]:            'allow',
})

function permissionModeToString(mode) {
  return PermissionModeLabel[mode] ?? 'unknown'
}

// ── PermissionOverride ────────────────────────────────────────────────────

const PermissionOverride = Object.freeze({
  Allow: 'allow',
  Deny:  'deny',
  Ask:   'ask',
})

// ── PermissionRequest ─────────────────────────────────────────────────────

class PermissionRequest {
  constructor({ tool_name, input, current_mode, required_mode, reason = null }) {
    this.tool_name = tool_name
    this.input = input
    this.current_mode = current_mode
    this.required_mode = required_mode
    this.reason = reason
  }
}

// ── PermissionOutcome ─────────────────────────────────────────────────────

class PermissionOutcome {
  constructor({ allowed, reason = null, via = null }) {
    this.allowed = allowed
    this.reason = reason
    this.via = via
  }

  static allow() {
    return new PermissionOutcome({ allowed: true })
  }

  static allowVia(via) {
    return new PermissionOutcome({ allowed: true, via })
  }

  static deny(reason) {
    return new PermissionOutcome({ allowed: false, reason })
  }
}

// ── PermissionPrompter (interface) ────────────────────────────────────────
//
// Subclasses override decide(request) to return PermissionPromptDecision.

class PermissionPrompter {
  decide(_request) {
    throw new Error('PermissionPrompter.decide() must be overridden')
  }
}

const PermissionPromptDecision = Object.freeze({
  Allow:       'allow',
  AllowAlways: 'allow_always', // P0: 本会话内总是允许（session-scoped）
  Deny:        'deny',
})

// ── PermissionRule (internal) ─────────────────────────────────────────────

const _RuleMatcher = Object.freeze({
  Any:   0,
  Exact: 1,
  Prefix: 2,
})

class _PermissionRule {
  constructor(raw, toolName, matcher, matcherValue) {
    this.raw = raw
    this.toolName = toolName
    this.matcher = matcher
    this.matcherValue = matcherValue
  }

  matches(toolName, input) {
    if (this.toolName !== toolName) return false
    if (this.matcher === _RuleMatcher.Any) return true
    const subject = _extractPermissionSubject(input)
    if (subject === undefined) return false
    if (this.matcher === _RuleMatcher.Exact) return subject === this.matcherValue
    if (this.matcher === _RuleMatcher.Prefix) return subject.startsWith(this.matcherValue)
    return false
  }

  static parse(raw) {
    const trimmed = raw.trim()
    const open = _findFirstUnescaped(trimmed, '(')
    const close = _findLastUnescaped(trimmed, ')')

    if (open !== -1 && close !== -1 && close === trimmed.length - 1 && open < close) {
      const toolName = trimmed.slice(0, open).trim().toLowerCase()
      const content = trimmed.slice(open + 1, close)
      if (toolName.length > 0) {
        return new _PermissionRule(
          trimmed,
          toolName,
          ..._parseRuleMatcher(content)
        )
      }
    }

    return new _PermissionRule(trimmed, trimmed.toLowerCase(), _RuleMatcher.Any, null)
  }
}

function _parseRuleMatcher(content) {
  const trimmed = content.trim()
  // 通配判定在反转义之前：只有裸 '*'（或空）才是 Any；转义过的 '\*'
  // 反转义为字面 '*'，落 Exact —— 否则 subject 恰为 "*" 时 approveAlways
  // 会生成过宽的全匹配规则。
  if (trimmed.length === 0 || trimmed === '*') {
    return [_RuleMatcher.Any, null]
  }
  const unescaped = _unescapeRuleContent(trimmed)
  if (unescaped.endsWith(':*')) {
    return [_RuleMatcher.Prefix, unescaped.slice(0, -2)]
  }
  return [_RuleMatcher.Exact, unescaped]
}

function _unescapeRuleContent(content) {
  return content.replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\*/g, '*').replace(/\\\\/g, '\\')
}

function _findFirstUnescaped(value, needle) {
  let escaped = false
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') { escaped = !escaped; continue }
    if (value[i] === needle && !escaped) return i
    escaped = false
  }
  return -1
}

function _findLastUnescaped(value, needle) {
  let i = value.length
  while (i-- > 0) {
    if (value[i] !== needle) continue
    let backslashes = 0
    for (let j = i - 1; j >= 0 && value[j] === '\\'; j--) backslashes++
    if (backslashes % 2 === 0) return i
  }
  return -1
}

function _extractPermissionSubject(input) {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const key of ['command', 'path', 'file_path', 'filePath', 'notebook_path', 'notebookPath', 'url', 'pattern', 'code', 'message']) {
        if (typeof parsed[key] === 'string') return parsed[key]
      }
    }
  } catch { /* not JSON */ }
  return input.trim().length > 0 ? input : undefined
}

// ── PermissionPolicy — rule engine ────────────────────────────────────────

class PermissionPolicy {
  constructor(activeMode) {
    this.activeMode = activeMode
    this.toolRequirements = new Map()   // tool_name -> PermissionMode
    this.allowRules = []                // _PermissionRule[]
    this.denyRules = []                 // _PermissionRule[]
    this.askRules = []                  // _PermissionRule[]
    this.sessionApproved = []           // P0: 本会话"总是允许"规则（_PermissionRule[]，随实例消亡不持久化）
    this.deniedTools = []               // unconditional deny list
    this.axisPolicies = null            // { filesystem|shell|network: 'allow'|'ask'|'deny' }
  }

  /**
   * Set the permission mode required for a specific tool.
   */
  withToolRequirement(toolName, requiredMode) {
    this.toolRequirements.set(toolName, requiredMode)
    return this
  }

  /**
   * Enable capability axis policies (review P0-2).
   *   policies = { filesystem: 'allow'|'ask'|'deny', shell: ..., network: ... }
   * Only valid axes/policies are kept; unknown keys ignored.
   */
  withAxisPolicies(policies) {
    const { normalizeAxisPolicies } = require('./capabilityPolicy')
    this.axisPolicies = normalizeAxisPolicies(policies)
    return this
  }

  /**
   * Load allow/deny/ask/denied_tools rules from a config object.
   *   config = { allow: [...], deny: [...], ask: [...], denied_tools: [...] }
   */
  withPermissionRules(config) {
    this.allowRules = (config.allow || []).map(r => _PermissionRule.parse(r))
    this.denyRules = (config.deny || []).map(r => _PermissionRule.parse(r))
    this.askRules = (config.ask || []).map(r => _PermissionRule.parse(r))
    this.deniedTools = (config.denied_tools || []).map(t => t.toLowerCase())
    return this
  }

  /**
   * P0: 记录"本会话内总是允许"。规则进 sessionApproved 而非 allowRules ——
   * 决策链里它排在 deny 规则之后（永不覆盖 deny），且随 policy 实例消亡，
   * 不写配置不持久化。幂等：同一规则串只记一次。
   */
  approveAlways(ruleSpec) {
    const rule = typeof ruleSpec === 'string' ? _PermissionRule.parse(ruleSpec) : ruleSpec
    if (!this.sessionApproved.some(r => r.raw === rule.raw)) {
      this.sessionApproved.push(rule)
    }
    return this
  }

  /**
   * Returns the required PermissionMode for a tool (defaults to DangerFullAccess).
   */
  requiredModeFor(toolName) {
    return this.toolRequirements.has(toolName)
      ? this.toolRequirements.get(toolName)
      : PermissionMode.DangerFullAccess
  }

  /**
   * Evaluate authorization: (toolName, input, optional prompter) -> PermissionOutcome.
   */
  authorize(toolName, input, prompter = null) {
    return this.authorizeWithContext(toolName, input, null, prompter)
  }

  /**
   * Evaluate authorization with optional PermissionOverride from hooks.
   *   context = { permissionOverride, overrideReason } or null
   */
  authorizeWithContext(toolName, input, context = null, prompter = null) {
    const override = context ? context.permissionOverride : null
    const overrideReason = context ? context.overrideReason : null

    // Unconditional deny by denied_tools config
    if (this.deniedTools.includes(toolName)) {
      return PermissionOutcome.deny(`tool '${toolName}' has been denied by denied_tools configuration`)
    }

    // Deny rules checked first
    if (_findMatchingRule(this.denyRules, toolName, input)) {
      return PermissionOutcome.deny(`Permission to use ${toolName} has been denied by rule`)
    }

    const currentMode = this.activeMode
    const requiredMode = this.requiredModeFor(toolName)
    const askRule = _findMatchingRule(this.askRules, toolName, input)
    const allowRule = _findMatchingRule(this.allowRules, toolName, input)

    // Process hook override
    if (override === PermissionOverride.Deny) {
      return PermissionOutcome.deny(overrideReason || `tool '${toolName}' denied by hook`)
    }

    // P0: session-scoped always-allow —— 用户本会话内显式批准过。排在全部
    // 确定性拒绝（deniedTools / denyRules / hook Deny）之后：永不覆盖任何
    // 拒绝通道，但压过 ask 规则、能力轴询问与模式升档确认（这正是它的
    // 存在意义——"本会话内不再问"）。
    if (_findMatchingRule(this.sessionApproved, toolName, input)) {
      return PermissionOutcome.allowVia('session_approved')
    }

    if (override === PermissionOverride.Ask) {
      const reason = overrideReason || `tool '${toolName}' requires approval due to hook guidance`
      return _promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter, this)
    }

    if (override === PermissionOverride.Allow) {
      if (askRule) {
        const reason = `tool '${toolName}' requires approval due to ask rule`
        return _promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter, this)
      }
      if (allowRule || _modeSatisfiesRequirement(currentMode, requiredMode)) {
        return PermissionOutcome.allow()
      }
    }

    // No override — evaluate rules
    if (askRule) {
      const reason = `tool '${toolName}' requires approval due to ask rule`
      return _promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter, this)
    }

    // ── Capability axis policy（外部评审 P0-2）───────────────────────────
    // 规则引擎未命中时, 按轴级策略决策: filesystem/shell/network 三轴各
    // allow|ask|deny, 作为显式政策覆盖 —— deny 轴压过 Allow 模式,
    // allow 轴放行 ReadOnly 模式; 未注入/未知工具轴 → 回落既有 5 档判断。
    if (this.axisPolicies) {
      try {
        const { decideAxisPolicy } = require('./capabilityPolicy')
        const ax = decideAxisPolicy(toolName, this.axisPolicies)
        if (ax.matched) {
          if (ax.policy === 'allow') return PermissionOutcome.allow()
          if (ax.policy === 'deny') return PermissionOutcome.deny(`capability policy: ${ax.axis} axis denies ${toolName}`)
          if (ax.policy === 'ask') {
            return _promptOrDeny(toolName, input, currentMode, requiredMode, `capability policy: ${ax.axis} axis requires approval`, prompter, this)
          }
        }
      } catch {}
    }

    if (allowRule || _modeSatisfiesRequirement(currentMode, requiredMode)) {
      return PermissionOutcome.allow()
    }

    // WorkspaceWrite -> DangerFullAccess escalation -> prompt
    if (currentMode === PermissionMode.Prompt ||
        (currentMode === PermissionMode.WorkspaceWrite && requiredMode === PermissionMode.DangerFullAccess)) {
      const reason = `tool '${toolName}' requires approval to escalate from ${permissionModeToString(currentMode)} to ${permissionModeToString(requiredMode)}`
      return _promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter, this)
    }

    // Default deny
    return PermissionOutcome.deny(
      `tool '${toolName}' requires ${permissionModeToString(requiredMode)} permission; current mode is ${permissionModeToString(currentMode)}`
    )
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────

// Whether currentMode satisfies requiredMode on the permissive ladder.
// Prompt（逐次询问）不是权限等级：它从不满足 >= 升档比较 —— ReadOnly 需求
// 除外（safe 工具任何模式都直接放行）。修复：此前 Prompt(3) >=
// DangerFullAccess(2) 让 ask 模式的 dangerous 工具绕过确认直接放行，
// 同时使下方 Prompt 分支成为不可达死代码（审计 P0-C1）。
function _modeSatisfiesRequirement(currentMode, requiredMode) {
  if (currentMode === PermissionMode.Allow) return true
  if (currentMode === PermissionMode.Prompt) return requiredMode === PermissionMode.ReadOnly
  return currentMode >= requiredMode
}

function _findMatchingRule(rules, toolName, input) {
  return rules.find(rule => rule.matches(toolName, input)) || null
}

function _promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter, policy = null) {
  const request = new PermissionRequest({ tool_name: toolName, input, current_mode: currentMode, required_mode: requiredMode, reason })

  if (prompter && typeof prompter.decide === 'function') {
    const decision = prompter.decide(request)
    if (decision === PermissionPromptDecision.AllowAlways) {
      // P0: "本会话内总是允许" —— 用与 ask 规则匹配相同的 subject 提取
      // 逻辑生成规则串（不发明第二套粒度），记入 sessionApproved。
      if (policy) policy.approveAlways(_sessionRuleSpec(toolName, input))
      return PermissionOutcome.allowVia('session_approved')
    }
    if (decision === PermissionPromptDecision.Allow) return PermissionOutcome.allow()
    return PermissionOutcome.deny(decision.reason || 'denied by user')
  }

  // No prompter available — treat as deny
  return PermissionOutcome.deny(reason || `tool '${toolName}' requires approval to run while mode is ${permissionModeToString(currentMode)}`)
}

// P0: 从 toolName+input 生成 sessionApproved 规则串。有 subject → Exact
// 匹配（同一命令/路径才免问），提取不到 → Any（该工具全部放行）。
// 转义与 _parseRuleMatcher/_unescapeRuleContent 约定一致。
function _escapeRuleContent(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\*/g, '\\*')
}

function _sessionRuleSpec(toolName, input) {
  const subject = _extractPermissionSubject(input)
  if (subject === undefined || String(subject).length === 0) return `${toolName}(*)`
  return `${toolName}(${_escapeRuleContent(subject)})`
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  PermissionMode,
  PermissionModeLabel,
  permissionModeToString,
  PermissionOverride,
  PermissionRequest,
  PermissionOutcome,
  PermissionPrompter,
  PermissionPromptDecision,
  PermissionPolicy,
}