$env:FILTER_BRANCH_SQUELCH_WARNING = '1'

# 重新创建 graft
git replace --graft 501027d dcd7ae360ac33e91a9bc910b55bc6284d80b9e46 2>&1
Write-Host "graft recreated"

# 用 filter-branch 把 graft 永久化
# --parent-filter 会对每个 commit 调用，传入原 parent 列表（-p sha1 -p sha2 ...），输出新的 parent 列表
# 我们要做的：对于 501027d，把它的 parent（原本无）改为 dcd7ae3
# 对于其他 commit，保持原样（直接 cat 输出）

$parentFilter = @'
if [ "$GIT_COMMIT" = "501027dc5b9b43f4e2f3072420b4bc15e0c2c171" ]; then
  echo "-p dcd7ae360ac33e91a9bc910b55bc6284d80b9e46"
else
  cat
fi
'@

# 用 cmd /c 执行 bash 风格的 filter-branch
# 实际上 git filter-branch 在 Windows 上用 sh.exe
# 直接传字符串给 --parent-filter
git filter-branch -f --parent-filter $parentFilter -- --all 2>&1 | Select-Object -Last 15
Write-Host "filter-branch exit: $LASTEXITCODE"

# 移除 replace ref
git replace -d 501027d 2>&1

# 验证
Write-Host "`n=== 拼接后历史长度 ==="
git log --oneline 2>&1 | Measure-Object -Line | Select-Object Lines
Write-Host "`n=== 最早 5 条 ==="
git log --oneline --reverse 2>&1 | Select-Object -First 5
Write-Host "`n=== 最晚 3 条 ==="
git log --oneline 2>&1 | Select-Object -First 3
