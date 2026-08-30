# Agent 安全与权限最佳实践

Aether 的 Agent 运行时设计以**本地安全与权限控制**为核心。本指南帮助你安全地使用和配置 Agent。

## 权限模型分级

Aether 提供五层权限阶梯：
1. **Read-Only**: 仅搜索与读取。
2. **Workspace-Write**: 可修改当前工作区代码。
3. **Danger-Full-Access**: 允许危险操作。
4. **Prompt**: 每次调用需用户确认。
5. **Allow**: 全部放行。

## 最佳实践
1. **工作区隔离**：尽量在明确的目录运行 Agent，避免全局读写。
2. **按需配置**：使用 `app/electron/featureFlags.js` 禁用无需的能力。
3. **API Key 管理**：依赖系统原生的 safeStorage 加密，勿手动修改 DB 记录。
4. **人工在环**：复杂重构时采用 `ask` 模式，确保敏感修改前有明确确认。
