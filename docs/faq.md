# 常见问题 FAQ

## 1. 为什么下载后 Windows SmartScreen 拦截？或杀毒软件报毒？
Aether 是一个独立的开源项目，未购买昂贵的企业代码签名证书。
- **SmartScreen**：点击“更多信息” -> “仍要运行”。
- **Windows Defender / 杀毒软件**：由于 Aether 集成了原生系统调用与 SQLite，可能被误报为风险程序。请将 `aetherai.exe` 或安装目录加入白名单。
- **自行编译**：推荐使用 `npm run build` 自行构建源码。

## 2. 如何安装 MCP 服务器？
Aether 兼容标准的 MCP 协议。
在 Settings -> MCP 面板中，配置外部 MCP 服务器的 `command` 与 `args`，Aether 将自动解析其暴露的 tools 并注入到 Agent 上下文中。

## 3. 聊天记录去哪了？如何重置？
所有数据存储在 `%APPDATA%/aetherai/aetherai.db`。可以通过 SQLite 客户端打开，或通过系统托盘直接选择 `Reset Database`。
