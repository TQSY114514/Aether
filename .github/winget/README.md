# winget 发布清单（模板）
#
# 用途: 提交到 microsoft/winget-pkgs 后, 用户可 `winget install Aether.Aether`。
# winget 官方源本身就是信任背书——降低"未签名 exe 下载"的恐惧。
#
# 提交流程:
#   1. 构建并发布 GitHub Release(v0.x.y), 拿到安装包直链:
#      https://github.com/TQSY114514/Aether/releases/download/v0.x.y/aetherai-setup-0.x.y.exe
#   2. 用 wingetcreate 生成 manifest(推荐, 自动算哈希):
#        wingetcreate update Aether.Aether -u <installer-url> -v 0.x.y
#   3. 复制生成的 YAML 到本目录(替换占位), 提交到 microsoft/winget-pkgs:
#        git clone https://github.com/microsoft/winget-pkgs
#        (把 manifests/a/Aether/Aether/<version>/ 下的文件复制过去)
#   4. 提 PR, 等社区审核合并(通常 1-3 天)
#
# 注意: 每次发版都要更新哈希(SHA256)与版本号。

# ─── 本文件是模板, 实际 manifest 需按 wingetcreate 输出替换 ───
PackageIdentifier: Aether.Aether
PackageVersion: 0.8.0
PackageLocale: en-US
Publisher: TQSY114514
PackageName: Aether
License: MIT
ShortDescription: Local-first multi-model AI workbench - chat with any model, run a safe coding agent, compare models side-by-side
InstallerType: exe
Installers:
  - Architecture: x64
    InstallerUrl: https://github.com/TQSY114514/Aether/releases/download/v0.8.0/aetherai-setup-0.8.0.exe
    InstallerSha256: REPLACE_WITH_REAL_SHA256
    InstallerSwitches:
      Silent: /S
      SilentWithProgress: /S
ManifestType: singleton
ManifestVersion: 1.6.0
