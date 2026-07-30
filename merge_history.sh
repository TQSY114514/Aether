#!/bin/sh
# 用 fast-export/import 把 graft 变成真实 parent
# 先创建 graft
git replace --graft 501027d dcd7ae360ac33e91a9bc910b55bc6284d80b9e46

# fast-export 带 graft 信息，然后 import 到新分支
git fast-export --all --signed-tags=strip | git fast-import --force 2>&1

# 移除 graft
git replace -d 501027d

# 验证
echo "=== 拼接后历史长度 ==="
git log --oneline | wc -l
echo "=== 最早 5 条 ==="
git log --oneline --reverse | head -5
echo "=== 最晚 3 条 ==="
git log --oneline | head -3
