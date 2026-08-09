// ─────────────────────────────────────────────────────────────────────────────
// modeClassifier.js — 共享 agentMode 分类器（ask / plan / auto）
//
// 纯函数、Electron-free：桌面 TaskPanel / CLI / TUI / SDK 四方共用（计划 todo 7）。
// 语义与 toolLoop.js:211-219 的 agentModeToPermissionMode 对齐：
//   ask  → Prompt（危险操作逐次确认）
//   plan → ReadOnly（先只读调查、出计划，批准后才执行）
//   auto → WorkspaceWrite
//
// 判定优先级：风险词（ask）→ 写类工具在列（ask）→ 只读意图（plan）
//            → 只读工具在列（plan）→ auto
//
// 中文匹配刻意用「动词+对象短语」结构，避免「删除了我的担忧」这类裸动词
// 误判为风险（审查 B-系列要求词边界/精确匹配）。
// ─────────────────────────────────────────────────────────────────────────────

// 高风险词（中英）。EN 用词边界（\b）避免命中 longer 词内片段；
// ZH 用带宾短语（对象在 6 字内）或句尾裸动词。
const RISK_PATTERNS = [
  /\bdelete\b/i, /\bmodify\b/i, /\boverwrite\b/i, /\bremove\b/i,
  /\bformat\b/i, /\bdownload\b/i, /\bupload\b/i, /\binstall\b/i,
  /\bexecute\b/i, /\brun\b/i, /\bwrite\b/i, /\bupdate\b/i,
  /\bnetwork\b/i, /\bmove\b/i, /\brename\b/i, /\bkill\b/i,
  // 中文：动词 + 对象（对象在 6 字内）
  /(删除|移除|删掉).{0,6}(文件|目录|文件夹|项目|代码|配置|数据|环境|依赖|分支|记录|消息|缓存)/,
  /(修改|编辑|改动).{0,6}(文件|目录|文件夹|项目|代码|配置|数据|环境|依赖|分支|记录|消息)/,
  /写入/, /覆盖/, /格式化/, /下载/, /上传/, /安装/, /卸载/,
  /执行(命令|脚本|程序|测试)?/, /运行(命令|脚本|程序|测试)?/,
  /网络(请求|调用|访问|连接)/, /重启/, /终止/, /杀掉/,
  // 句尾裸动词（「把那个文件删除」）
  /删除$/, /移除$/, /删掉$/,
]

// 只读意图词（中英）——只调查不动手
const READONLY_PATTERNS = [
  /\bread\b/i, /\bview\b/i, /\bsearch\b/i, /\bfind\b/i, /\bexplain\b/i,
  /\blist\b/i, /\bshow\b/i, /\bcompare\b/i, /\bsummarize\b/i, /\bdescribe\b/i,
  /\banalyze\b/i, /\binspect\b/i, /\bcheck\b/i, /\blookup\b/i, /\breview\b/i,
  /阅读/, /查看/, /读取/, /搜索/, /查找/, /解释/, /总结/, /列出/, /展示/, /比较/,
  /介绍/, /分析/, /检查/, /浏览/, /调研/, /看看/, /告诉我/,
]

// 写类工具名（toolNames 信号 → 倾向 ask）
const WRITE_TOOL_HINTS = /(write|edit|delete|remove|rm|mv|cp|mkdir|touch|patch|apply|exec|run|bash|install|format|move|rename)/i

// 只读工具名（toolNames 信号 → 倾向 plan）
const READ_TOOL_HINTS = /(read|grep|search|find|list|ls|view|show|lookup|explain|inspect|log|stat|cat)/i

/**
 * 分类输入 prompt 的 agentMode。
 * @param {{prompt?: string, toolNames?: string[], history?: unknown[]}} [input]
 * @returns {{mode: 'ask'|'plan'|'auto', reason: string}}
 */
function classifyAgentMode({ prompt = '', toolNames = [], history = [] } = {}) {
  const text = String(prompt ?? '')
  const tools = Array.isArray(toolNames) ? toolNames : []

  // 1) 风险词 → ask
  for (const re of RISK_PATTERNS) {
    if (re.test(text)) {
      return { mode: 'ask', reason: `detected risk pattern: ${re.source}` }
    }
  }
  // 2) 写类工具在列 → ask
  const writeTools = tools.filter((t) => WRITE_TOOL_HINTS.test(String(t)))
  if (writeTools.length > 0) {
    return { mode: 'ask', reason: `write-capable tools in scope: ${writeTools.join(', ')}` }
  }
  // 3) 只读意图词 → plan
  for (const re of READONLY_PATTERNS) {
    if (re.test(text)) {
      return { mode: 'plan', reason: `read-only intent: ${re.source}` }
    }
  }
  // 4) 只读工具在列 → plan
  const readTools = tools.filter((t) => READ_TOOL_HINTS.test(String(t)))
  if (readTools.length > 0) {
    return { mode: 'plan', reason: `read-only tools in scope: ${readTools.join(', ')}` }
  }
  // 5) 无信号 → auto
  return { mode: 'auto', reason: 'no risk or read-only signal; default auto' }
}

module.exports = { classifyAgentMode }
