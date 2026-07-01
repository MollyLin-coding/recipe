#!/usr/bin/env bash
# ============================================================
# 一鍵回滾：把正式前台(index.html / order.html)還原到指定(或前一個)版本標籤
# 用法：bash rollback.sh          # 自動回到「前一個」標籤
#      bash rollback.sh v1.0     # 回到指定標籤
# 做的事：① 列出現有標籤 ② 決定目標標籤 ③ checkout 前台檔 ④ commit
#         不自動 push，最後印出 push 指令請人工確認。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "① 目前版本標籤（新→舊）："
git tag --sort=-creatordate | head -10 || true
echo ""

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  # 未指定 → 取第 2 新的標籤（跳過最新的 = 前一個版本）
  TARGET=$(git tag --sort=-creatordate | sed -n '2p')
  if [ -z "$TARGET" ]; then
    echo "❌ 找不到可回滾的『前一個』標籤，請手動指定：bash rollback.sh <tag>"
    exit 1
  fi
  echo "② 未指定版本 → 自動選前一個標籤：${TARGET}"
else
  echo "② 指定回滾到：${TARGET}"
fi

git rev-parse "${TARGET}" >/dev/null 2>&1 || { echo "❌ 找不到標籤 ${TARGET}，請確認名稱"; exit 1; }

echo "③ 還原正式前台檔到 ${TARGET}"
git checkout "${TARGET}" -- index.html order.html

echo "④ commit 回滾"
git add index.html order.html
git commit -m "rollback: 正式前台回到 ${TARGET}" || echo "   （與現況相同，無需提交）"

echo ""
echo "✅ 已將正式前台還原到 ${TARGET}"
echo "────────────────────────────────────────────"
echo "⚠️  更新 Molly 正式站需人工確認："
echo "     git push origin HEAD"
echo ""
echo "   後端若也要回滾：Apps Script → 部署管理 → 重新部署上一個版本號。"
echo "────────────────────────────────────────────"
