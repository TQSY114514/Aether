# ─────────────────────────────────────────────────────────────────────────────
# aether.ps1 — Aether 终端引导脚本（todo 18）
# 用途：Windows Terminal profile 的启动命令 + 交互式 `aether tui` 常用别名/环境变量。
# 用法：
#   & "path\to\aether.ps1"            # 启动 aether tui
#   & "path\to\aether.ps1" -NoTui     # 只设别名/环境变量，不启动 TUI
# ─────────────────────────────────────────────────────────────────────────────
param(
  [switch]$NoTui
)

# 环境变量：aether 可执行入口（app/package.json bin）
$env:AETHER_CLI = Join-Path $PSScriptRoot "..\..\cli.js"
$env:AETHER_HOME = (Get-Location).Path

# 别名：`aether <prompt>` → node cli.js <prompt>（当前目录起）
function Invoke-Aether {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AetherArgs)
  & node $env:AETHER_CLI @AetherArgs
}
Set-Alias -Name aether -Value Invoke-Aether

if (-not $NoTui) {
  Write-Host "Aether TUI (Ctrl+C 打断 / m 切模式 / q 退出)"
  & node $env:AETHER_CLI tui
  exit $LASTEXITCODE
}
