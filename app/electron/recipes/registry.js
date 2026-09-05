// ─────────────────────────────────────────────────────────────────────────────
// registry.js — P1-07 官方与项目配方注册表 (Goose 战术)
//
// 资产化 8 大核心官方配方：修测试、写提交、审 PR、多语言翻译、依赖升级、
// 安全扫描、代码重构、单测生成。支持读取项目根目录 `.aether/recipes/*.json` 扩展。
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const OFFICIAL_RECIPES = [
  {
    id: 'fix-failing-tests',
    category: 'testing',
    title: '修测试 (Fix Failing Tests)',
    description: '定位并修复当前项目中报错或超时的单元测试，改动后自动重跑验证',
    prompt: '请执行项目测试命令（如 npm test / pytest），定位所有失败或异常的用例。阅读相关代码与堆栈信息，做出最小化修复，并重新运行测试直到全部通过。最后总结修复原因。',
    suggestedMode: 'auto',
    permissions: ['run_command', 'read_file', 'edit_file'],
    icon: 'wrench',
  },
  {
    id: 'git-commit-craft',
    category: 'git',
    title: '写提交 (Craft Conventional Commit)',
    description: '检查暂存区或未暂存代码差异，生成符合 Conventional Commits 规范的语义化 Commit Message',
    prompt: '请运行 git diff 检查当前所有未暂存和暂存的代码变更。分析改动的核心意图、影响范围，按照 Conventional Commits 规范（如 feat:, fix:, refactor:, chore:）生成清晰规范的提交信息。若用户确认则完成 commit。',
    suggestedMode: 'ask',
    permissions: ['run_command', 'read_file'],
    icon: 'git-commit',
  },
  {
    id: 'pr-review-audit',
    category: 'review',
    title: '审 PR (PR & Codebase Architecture Review)',
    description: '对比当前工作分支与主分支差异，检查架构坏味道、内存泄漏、安全注入风险与编码规范',
    prompt: '请检查当前分支与基准分支（如 main/master）之间的差异文件列表与 diff。逐一审查：1. 潜在空指针、边界异常与未捕获错误；2. 安全隐患（敏感凭据、注入攻击）；3. 架构规范与坏味道；4. 性能瓶颈。输出条理清晰的评审报告。',
    suggestedMode: 'ask',
    permissions: ['run_command', 'read_file', 'grep_search'],
    icon: 'shield-check',
  },
  {
    id: 'doc-sync-translate',
    category: 'docs',
    title: '文档与多语言同步 (Doc Sync & i18n)',
    description: '提取近期代码接口变化，同步更新 README / API 文档与 i18n 语言文件',
    prompt: '检查最近的代码改动或新增的公共 API/IPC 接口，找出需要同步更新的技术文档或 i18n 语言包（如 i18n-en-base.json）。保持中英文术语准确一致，更新并验证占位符格式。',
    suggestedMode: 'ask',
    permissions: ['read_file', 'edit_file', 'glob_find'],
    icon: 'languages',
  },
  {
    id: 'dependency-upgrade-check',
    category: 'maintenance',
    title: '依赖升级检查 (Dependency Upgrade Audit)',
    description: '检查 package.json 依赖更新情况，检测废弃 API、安全告警与重大破坏性变更',
    prompt: '检查当前项目的依赖清单（如 package.json），识别过时或有安全警告的依赖包。检查新版本的破坏性变更（Breaking Changes），对受影响的代码进行兼容性评估并提供升级方案。',
    suggestedMode: 'ask',
    permissions: ['read_file', 'run_command', 'web_search'],
    icon: 'package-search',
  },
  {
    id: 'security-vulnerability-scan',
    category: 'security',
    title: '安全漏洞扫描 (Security & Secret Scan)',
    description: '全面排查代码库中的硬编码 API 密钥、私钥文件、命令注入与越界路径隐患',
    prompt: '全面扫描代码库：检查是否存在硬编码的 API Key、私钥文件（.pem, id_rsa）、不安全的动态执行（eval / child_process 无校验拼接）、未做边界检查的路径操作。输出详细的安全评估报告并给出加固建议。',
    suggestedMode: 'ask',
    permissions: ['read_file', 'grep_search', 'glob_find'],
    icon: 'lock',
  },
  {
    id: 'refactor-extract-component',
    category: 'refactor',
    title: '组件拆分重构 (Extract Component & Modularize)',
    description: '对单文件超长逻辑、庞大组件或复杂函数进行高内聚低耦合的模块化拆分',
    prompt: '识别当前项目中行数过多或职责不单一的文件/函数/组件。在保证功能完全等价、不破坏现有调用方的前提下，提取出独立的子组件或辅助函数。重构后运行单测验证。',
    suggestedMode: 'ask',
    permissions: ['read_file', 'edit_file', 'run_command'],
    icon: 'puzzle',
  },
  {
    id: 'generate-unit-tests',
    category: 'testing',
    title: '补齐单测 (Generate Comprehensive Unit Tests)',
    description: '为未覆盖的核心逻辑与边界情况编写高质量单元测试用例',
    prompt: '检查目标模块的实现代码与现有测试覆盖情况。识别未被覆盖的核心分支、异常处理与边缘边界场景，编写符合项目测试框架（如 vitest / jest）的单元测试并运行验证其通过率。',
    suggestedMode: 'auto',
    permissions: ['read_file', 'write_file', 'run_command'],
    icon: 'file-check',
  },
]

function listCustomRecipes(workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') return []
  const customDir = path.join(workspaceRoot, '.aether', 'recipes')
  if (!fs.existsSync(customDir)) return []
  const res = []
  try {
    const files = fs.readdirSync(customDir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const full = path.join(customDir, file)
        const raw = fs.readFileSync(full, 'utf8')
        const parsed = JSON.parse(raw)
        if (parsed && parsed.id && parsed.title && parsed.prompt) {
          res.push({ ...parsed, custom: true, filePath: full })
        }
      } catch {}
    }
  } catch {}
  return res
}

function listRecipes(workspaceRoot) {
  const custom = listCustomRecipes(workspaceRoot)
  const customMap = new Map(custom.map(r => [r.id, r]))
  const merged = OFFICIAL_RECIPES.map(r => customMap.get(r.id) || r)
  for (const c of custom) {
    if (!OFFICIAL_RECIPES.some(r => r.id === c.id)) {
      merged.push(c)
    }
  }
  return merged
}

function getRecipe(id, workspaceRoot) {
  if (!id) return null
  const all = listRecipes(workspaceRoot)
  return all.find(r => r.id === id) || null
}

module.exports = {
  OFFICIAL_RECIPES,
  listRecipes,
  getRecipe,
}
