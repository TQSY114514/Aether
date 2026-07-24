// Lazy-load i18n: English (~6KB) stays inline for instant startup.
// Other locales are fetched from /locales/<code>.json on first use.

export type LangCode = 'en' | 'en-upside' | 'zh-CN' | 'zh-TW' | 'zh-WEN' | 'ja' | 'es' | 'fr' | 'de' | 'pt' | 'ru' | 'uk' | 'ar' | 'hi' | 'ko'

export const LANGS = [
  { code: 'en', label: 'English', native: 'English', dir: 'ltr' },
  { code: 'en-upside', label: 'English (uʍoᗁ ǝpᴉsd∩)', native: 'English', dir: 'ltr' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', native: '简体中文', dir: 'ltr' },
  { code: 'zh-TW', label: 'Chinese (Traditional)', native: '繁體中文', dir: 'ltr' },
  { code: 'zh-WEN', label: 'Chinese (Classical)', native: '文言文', dir: 'ltr' },
  { code: 'ja', label: 'Japanese', native: '日本語', dir: 'ltr' },
  { code: 'es', label: 'Spanish', native: 'español', dir: 'ltr' },
  { code: 'fr', label: 'French', native: 'français', dir: 'ltr' },
  { code: 'de', label: 'German', native: 'Deutsch', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese', native: 'português', dir: 'ltr' },
  { code: 'ru', label: 'Russian', native: 'русский', dir: 'ltr' },
  { code: 'uk', label: 'Ukrainian', native: 'українська', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', native: 'العربية', dir: 'rtl' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', dir: 'ltr' },
  { code: 'ko', label: 'Korean', native: '한국어', dir: 'ltr' },
] as const

// --- Inline: English + upside-down (both generated, always available) ---
const en: Record<string, string> = {
  "app.name": "AetherAI", "chat.new": "New Chat", "chat.placeholder": "Type a message... (Shift+Enter for newline)",
  "chat.arena.placeholder": "Enter a question, multiple models answer at once...", "chat.empty": "Send a message to start",
  "chat.no_session": "Select or create a conversation to start", "empty.welcome": "How can I help you?",
  "empty.subtitle": "Pick an example, or type your question below", "empty.effort": "thinking",
  "empty.example.explain": "Explain a concept", "empty.example.write": "Help me write",
  "empty.example.code": "Write code", "empty.example.translate": "Translate & polish",
  "empty.example.brainstorm": "Brainstorm ideas", "empty.example.summarize": "Summarize long text",
  "empty.example.debug": "Debug code", "empty.example.teach": "Teach me something",
  "chat.setup_api": "Please configure an API in the Models page first",
  "chat.create": "New conversation", "chat.send": "Send", "chat.stop": "Stop", "chat.no_persona": "No persona",
  "chat.model_switch": "Switch model", "chat.arena_model_sel": "Select arena models", "chat.arena.result": "Arena results",
  "chat.arena.vote": "Best answer", "chat.mode.normal": "Chat", "chat.mode.arena": "Arena", "chat.context_warn": "Compress",
  "chat.error.detail": "Error details", "chat.fallback_label": "Answered by {0} (primary model unavailable)",
  "sidebar.search": "Search conversations...", "sidebar.no_match": "No matching conversations",
  "sidebar.no_sessions": "No conversations yet", "sidebar.new_chat_tip": "Ctrl+N new · double-click to rename",
  "sidebar.group.pinned": "Pinned", "sidebar.group.today": "Today", "sidebar.group.yesterday": "Yesterday",
  "sidebar.group.week": "Last 7 days", "sidebar.group.older": "Older",
  "sidebar.nav.models": "Models", "sidebar.nav.chat": "Chat", "sidebar.nav.personas": "Personas",
  "sidebar.nav.arena": "Arena", "sidebar.nav.settings": "Settings", "models.title": "Model Management",
  "models.subtitle": "Configure API providers and models", "models.add_provider": "Add provider",
  "models.add_provider_name": "Provider name (e.g. OpenAI)", "models.add_provider_url": "API URL (e.g. https://api.openai.com/v1)",
  "models.add_provider_key": "API Key", "models.save": "Save", "models.cancel": "Cancel",
  "models.no_providers": "No providers yet — click above to add", "models.no_models": "No models",
  "models.test": "Test connection", "models.fetch": "Fetch models", "models.add_model": "Add model",
  "models.add_model_name": "Model name (e.g. gpt-4o)", "models.edit": "Edit", "models.delete": "Delete",
  "models.success": "Connected", "models.fail": "Connection failed", "models.default": "Default", "models.fallback": "Fallback",
  "models.api_url": "API URL", "models.api_key": "API Key", "models.api_format": "API format",
  "models.testing": "Testing...", "models.fetching": "Fetching...", "persona.title": "Persona Management",
  "persona.subtitle": "Create and manage AI personas", "persona.add": "Add persona", "persona.import": "Import",
  "persona.export": "Export", "persona.name": "Persona name (e.g. Coding expert)", "persona.prompt": "System Prompt...",
  "persona.no_personas": "No personas yet — click above to add", "persona.no_prompt": "No prompt",
  "persona.use": "Use", "persona.selected": "Selected", "scores.title": "Arena ELO Scores",
  "scores.subtitle": "Updated when you vote in Arena mode", "scores.empty": "No scores yet — use Arena mode and vote",
  "scores.model": "Model", "scores.score": "Score", "scores.wins": "Wins", "scores.total": "Total",
  "scores.intent.coding": "Coding", "scores.intent.math": "Math", "scores.intent.translation": "Translation",
  "scores.intent.summary": "Summary", "scores.intent.general": "General", "settings.title": "Settings",
  "settings.language": "Language", "settings.theme": "Theme", "settings.theme.light": "Light",
  "settings.theme.auto": "Auto (system)", "settings.theme.dark": "Dark", "settings.theme.blue": "Blue",
  "settings.theme.glass": "Glass", "settings.theme.retro": "Retro", "settings.advanced": "Advanced",
  "settings.advanced.timeout": "Fallback timeout (ms)", "settings.advanced.timeout_desc": "How long before switching to a fallback model",
  "settings.advanced.save": "Save", "settings.advanced.saved": "Saved", "settings.data": "Data Storage",
  "settings.data_desc": "All data is stored in a local SQLite database. Nothing is uploaded.",
  "settings.features": "Features", "settings.feature.providers": "Multi-provider", "settings.feature.chat": "Streaming chat",
  "settings.feature.persona": "Personas", "settings.feature.arena": "Arena compare", "settings.feature.route": "Smart routing",
  "tooltip.model_test": "Send a test request to verify API URL and key",
  "tooltip.model_fetch": "Automatically fetch available models from the API",
  "tooltip.arena_mode": "Send one prompt to multiple models and compare",
  "tooltip.fallback": "When the primary model fails, try backup models in order",
  "tooltip.persona": "Set AI role and tone; injected as a system message",
  "tooltip.slash": "Type / for quick commands", "tooltip.model_badge": "Current model and provider",
  "tooltip.persona_select": "Set AI role and tone", "chat.attach": "Attach file", "chat.upload": "Upload file",
  "chat.delete_confirm_title": "Delete conversation", "chat.delete_confirm_desc": "Delete this conversation? All messages will be permanently removed.",
  "chat.delete": "Delete", "agent.mode.off": "Off", "agent.mode.off.desc": "Off — no tools. Plain chat only.",
  "agent.mode.plan": "Plan", "agent.mode.plan.desc": "Plan — read-only tools. Safe for exploration.",
  "agent.mode.ask": "Ask", "agent.mode.ask.desc": "Ask — confirm risky actions (recommended).",
  "agent.mode.auto": "Auto", "agent.mode.auto.desc": "Auto — run everything, no confirms. Sandboxed.",
  "agent.mode.yolo": "Yolo", "agent.mode.yolo.desc": "Yolo — FULL permission, NO sandbox. High risk.",
  "agent.mode.auto_confirm": "Semi-auto", "agent.mode.auto_confirm.desc": "Semi-auto — safe tools run freely, dangerous ones ask.",
  "agent.mode.yolo_warn": "⚠ HIGH RISK: Yolo mode grants FULL permission. Only use with trusted models.",
  "agent.tooltip": "Agent mode (risk ascending): Off · Plan (read-only) · Ask (confirm risky) · Auto (sandboxed) · Yolo (full, no sandbox)",
  "agent.permission.title": "Agent requests to run an action", "agent.permission.allow_once": "Allow once",
  "agent.permission.allow_remember": "Allow & remember", "agent.permission.deny": "Deny",
  "agent.permission.desc": "Once allowed, the model will run this immediately. Deny if unsure.",
  "agent.question.title": "Agent needs clarification", "agent.question.other": "Other",
  "agent.question.type_answer": "Type your answer…", "agent.question.cancel": "Cancel", "agent.question.submit": "Submit",
  "cmd.placeholder": "Type a command or search…", "cmd.empty": "No matches",
  "cmd.group.navigate": "Navigate", "cmd.group.agent": "Agent mode", "cmd.group.sessions": "Sessions",
  "cmd.group.models": "Models", "cmd.set_mode": "Set mode:", "cmd.switch_session": "Switch", "cmd.use_model": "Use",
  "effort.tooltip": "Thinking effort: controls reasoning depth (reasoning models only)",
  "effort.off": "off", "effort.low": "low", "effort.medium": "med", "effort.high": "high", "paste.snippet": "Snippet",
  "empty.hint.new": "Ctrl+N new", "empty.hint.newline": "Shift+Enter newline", "empty.hint.slash": "Type / for commands",
  "tool.status.failed": "failed", "tool.status.done": "done", "tool.status.running": "running",
  "tool.risk.dangerous": "dangerous", "tool.args": "Arguments", "tool.result": "Result", "tool.error": "Error",
  "tool.chars": "chars", "tool.risk.high": "Risk: high", "tool.read_file": "Read file",
  "tool.list_dir": "List directory", "tool.glob_find": "Find files (glob)", "tool.grep_search": "Search contents (grep)",
  "tool.web_search": "Web search", "tool.web_fetch": "Fetch URL", "tool.write_file": "Write file",
  "tool.edit_file": "Edit file", "tool.run_command": "Run command", "tool.git_status": "Git status",
  "tool.git_diff": "Git diff", "tool.memory_save": "Save memory", "tool.memory_list": "List memory",
  "tool.unknown": "Unknown tool", "slash.summarize": "Summarize", "slash.translate": "Translate",
  "slash.polish": "Polish", "slash.explain": "Explain", "slash.continue": "Continue", "slash.code": "Code",
  "paste.snippet_n": "Snippet {0}", "chat.file_too_large": "{0} exceeds the 10MB limit",
  "chat.file_read_failed": "Failed to read {0}", "chat.select_model": "Select model",
  "chat.search_placeholder": "Search current conversation...", "chat.search_count_unit": "matches",
  "chat.search_prev": "Previous match", "chat.search_next": "Next match",
  "chat.search_no_match": "No matching messages found", "chat.empty.start": "Send a message to start the conversation",
  "chat.arena.voted": "Selected as best answer, score updated", "chat.arena.aggregate": "Synthesized best answer",
  "chat.copied": "Copied", "habit.proposed.prefix": "I noticed you keep asking me to",
  "habit.proposed.accept": "Always do this", "habit.proposed.dismiss": "Not now",
  "usage.title": "Usage statistics", "usage.subtitle": "View AI model usage and cost statistics",
  "usage.real_tokens": "Real tokens", "usage.total_requests": "Total requests", "usage.total_cost": "Total cost",
  "usage.cache_hit_rate": "Cache hit rate", "usage.cache_read": "read", "usage.input_tokens": "Input tokens",
  "usage.output_tokens": "Output tokens", "usage.cache_creation": "Cache creation",
  "usage.avg_latency": "Avg latency", "usage.trend": "Usage trend",
  "usage.by_provider": "Provider statistics", "usage.by_model": "Model statistics",
  "usage.request_log": "Request log", "usage.all_sources": "All sources", "usage.all_models": "All models",
  "usage.col.time": "Time", "usage.col.provider": "Provider", "usage.col.model": "Billed model",
  "usage.col.input": "Input", "usage.col.output": "Output", "usage.col.cost": "Total cost",
  "usage.col.latency": "Latency/first byte", "usage.col.status": "Status", "usage.col.source": "Source",
  "usage.unpriced": "unpriced", "usage.no_data": "No data",
  "memory.add_placeholder": "Add a memory... (e.g. user prefers Python)",
  "chat.error_short": "Error", "chat.aborted": "Aborted", "chat.copy": "Copy", "chat.edit": "Edit",
  "chat.edit.submit": "Send", "chat.queue": "Queued ({0})", "hint.got_it": "Got it",
  "hint.first_tool": "The agent is running a tool — expand the block to see what it did. Tools are gated by your permission mode (Settings → Agent).",
  "hint.first_queue": "You sent while it was still replying — your message is queued and will send automatically when this turn finishes. Click ✕ to cancel.",
  "chat.regenerate": "Regenerate", "chat.retry": "Retry", "sidebar.nav.tokens": "Token Usage",
  "sidebar.nav.learning": "Learning graph", "sidebar.nav.memory": "Memory",
  "learning_graph.desc": "Knowledge graph — memories, skills, and sessions linked by keyword overlap",
  "learning_graph.empty": "No nodes found — add memories or load skills to populate the graph.",
  "learning_graph.filter": "Filter nodes…", "learning_graph.click_hint": "Click a node to see connections",
  "learning_graph.connections": "Connections", "learning_graph.memory": "Memory", "learning_graph.skill": "Skill",
  "learning_graph.session": "Session", "learning_graph.tool": "Tool",
  "chat.arena.min_models": "Select at least 2 models", "agent.trace.title": "Agent reasoning",
  "agent.todos": "Tasks", "agent.trace.steps": "steps", "agent.trace.plan": "Plan",
  "mcp.title": "MCP Servers", "mcp.add": "Add server",
  "mcp.desc": "Connect external tool servers (stdio). Their tools merge with the built-in agent tools.",
  "mcp.name_ph": "Server name (e.g. filesystem)", "mcp.command_ph": "Command (e.g. npx)",
  "mcp.args_ph": "Args JSON array", "mcp.env_ph": "Env JSON object (optional)", "mcp.add_btn": "Add",
  "mcp.empty": "No MCP servers configured", "mcp.online": "connected", "mcp.offline": "offline",
  "mcp.reconnect": "Reconnect", "mcp.added": "Server added", "mcp.deleted": "Server removed",
  "mcp.connected": "Connected — {0} tools", "mcp.connect_failed": "Connection failed",
  "mcp.need_name_command": "Name and command are required", "mcp.args_json_error": "Args must be a JSON array",
  "mcp.env_json_error": "Env must be a JSON object", "settings.generation": "Generation",
  "settings.generation.desc": "Advanced sampling defaults for new messages. 0 = use provider default.",
  "settings.max_tokens": "Max tokens", "settings.temperature": "Temperature", "settings.top_p": "Top P",
  "settings.system_prefix": "Custom system prefix", "settings.system_prefix_desc": "Prepended to the system prompt of every message.",
  "settings.titles": "Session titles", "settings.auto_title": "Auto-generate summary title",
  "settings.title_language": "Title language", "settings.title_language.auto": "Follow UI",
  "settings.appearance": "Appearance", "settings.font_scale": "Font scale", "settings.bubble_width": "Bubble width",
  "settings.bg_image": "Background image", "settings.bg_opacity": "Opacity", "settings.bg_blur": "Blur",
  "settings.bg_clear": "Clear", "settings.about": "About",
  "settings.about_desc": "AetherAI is a local-first multi-model desktop AI chat client. All data stays on your device.",
  "settings.update.title": "Updates", "settings.update.idle": "Check for new versions on launch automatically.",
  "settings.update.check": "Check now", "settings.update.checking": "Checking…", "settings.update.restart": "Restart to update",
  "settings.background": "Background image", "settings.background.desc": "Upload an image as the chat background.",
  "settings.background.upload": "Upload image", "settings.background.clear": "Clear",
  "settings.background.opacity": "Opacity", "settings.background.blur": "Blur",
  "settings.background.none": "No background image set", "settings.display": "Display",
  "settings.default_effort": "Default thinking effort",
  "settings.default_effort_desc": "Used for new sessions (slider in the chat bar can override).",
  "settings.agent.title": "Agent & Safety", "settings.agent.desc": "Contain the agent's file operations to a workspace.",
  "settings.agent.workspace": "Workspace root", "settings.agent.workspace_placeholder": "Select a folder…",
  "settings.agent.workspace_hint": "write_file / edit_file are refused outside this folder.",
  "settings.agent.workspace_saved": "Workspace updated", "settings.agent.browse": "Browse", "settings.agent.reset": "Reset",
  "settings.agent.blocklist": "Destructive command blocklist: on",
  "settings.agent.blocklist_hint": "run_command refuses disk format, recursive force-delete, shutdown, etc.",
  "settings.agent.max_iterations": "Max agent iterations", "settings.agent.max_iterations_hint": "Hard ceiling on tool-call rounds. Default 25.",
  "settings.agent.auto_memory": "Auto long-term memory",
  "settings.agent.auto_memory_hint": "Relevant memories from past chats are injected before each turn.",
  "settings.skills.title": "Skills", "settings.skills.desc": "Claude-Code-format SKILL.md skills.",
  "settings.skills.rescan": "Rescan", "settings.skills.rescanned": "Scanned — {0} skills loaded",
  "settings.skills.empty": "No skills found. Drop <skill>/SKILL.md into .claude/skills/.",
  "settings.skills.hint": "Scan dirs: <workspace>/.claude/skills, <workspace>/.aetherai/skills, <userData>/skills, built-in.",
  "error.title": "Something went wrong", "error.unknown": "An unexpected error occurred", "error.retry": "Try again",
  "chat.drag_drop_hint": "Drop files here", "chat.tokens": "tokens", "chat.tokens_estimate": "~{0} tokens",
  "status.thinking": "Thinking…", "status.using_tools": "Using tools…", "status.compacting": "Compressing context…"
}

// Upside-down English: reverse and swap letters.
const F: Record<string, string> = { a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z' }
const enUpside: Record<string, string> = {}
for (const k in en) enUpside[k] = en[k].split('').map(c => F[c.toLowerCase()] || c).reverse().join('')

// Cache for lazy-loaded locales.
const lazyCache: Record<string, Record<string, string>> = {}

let currentLang: LangCode = 'en'

// --- Preload: fetch a locale into cache without switching ---
export function prefetchLocale(code: LangCode): void {
  if (code === 'en' || code === 'en-upside') return
  if (lazyCache[code]) return
  fetch('/locales/' + code + '.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) lazyCache[code] = (data && data.strings) ? data.strings : data })
    .catch(() => {})
}

// --- Preload all non-English locales (in parallel, low priority) ---
export function prefetchAll(): void {
  for (const l of LANGS) {
    if (l.code !== 'en' && l.code !== 'en-upside') prefetchLocale(l.code)
  }
}

// --- Get translations for a code (inline cache or fetch) ---
async function getTranslations(code: LangCode): Promise<Record<string, string>> {
  if (code === 'en') return en
  if (code === 'en-upside') return enUpside
  if (lazyCache[code]) return lazyCache[code]
  try {
    const res = await fetch('/locales/' + code + '.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    const table = (data && data.strings) ? data.strings : data
    lazyCache[code] = table
    return table
  } catch (e) {
    console.error('[i18n] fetch failed for', code, e)
    return en
  }
}

// --- Set language (async — preloads then switches) ---
export async function setLangAsync(code: LangCode): Promise<void> {
  try {
    await getTranslations(code)   // ensure it's loaded before switching
    currentLang = code
  } catch (e) {
    console.error('[i18n] setLangAsync failed for', code, e)
  }
}

// --- Set language synchronously (fast, may show English briefly for uncached locales) ---
export function setLang(code: LangCode): void {
  if (code !== currentLang) {
    currentLang = code
    prefetchLocale(code)  // background load for next time
  }
}

export function getLang(): LangCode { return currentLang }

export function detectLang(): LangCode {
  const n = (navigator.language || "en").toLowerCase()
  if (n.startsWith("zh")) {
    if (n.includes("tw") || n.includes("hant") || n.includes("hk")) return "zh-TW"
    return "zh-CN"
  }
  for (const l of LANGS) {
    if (n.startsWith(l.code.toLowerCase())) return l.code as LangCode
  }
  return "en"
}

// --- Synchronous t() — uses cache or English. For render paths. ---
export function t(key: string, ...args: (string | number)[]): string {
  const table = lazyCache[currentLang] ?? (currentLang === 'en-upside' ? enUpside : en)
  let s = table[key] ?? en[key] ?? key
  if (args.length) s = s.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ""))
  return s
}

export function getLangDir(code: string): "ltr" | "rtl" {
  return (LANGS.find((l) => l.code === code)?.dir as "ltr" | "rtl") || "ltr"
}
