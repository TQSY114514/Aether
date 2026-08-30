# 贡献指南 (CONTRIBUTING)

感谢你对 Aether 的关注！

## 最小可复现环境
- **Node.js**: >= 22
- **OS**: Windows 10/11 (仅支持 Windows)
- 执行以下步骤开启调试：
  ```bash
  cd app
  npm install
  npm run dev
  ```

## 单元测试
- Aether 分离了渲染层与主进程逻辑。
- 要测试单个模块（如 `toolLoop`），请运行：
  ```bash
  npm run test -- toolLoop.test.js
  ```
- 提交 PR 前必须确保 `npm run build` 和 `node cli.js tui --smoke` 测试通过。

## Feature Flag 约定
- 任何新增功能默认应以 Feature Flag 的形式提交，且默认关闭（保守原则）。
- Flag 定义位置：`app/electron/featureFlags.js`。
- 新增 Flag 须附带简要描述。
