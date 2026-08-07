#!/usr/bin/env bash
# ============================================================
# 一鍵升版：preview → 正式前台，打版本標籤（不自動 push，安全把關）
# 用法：bash promote.sh v1.1 "成品庫存頁上線"
#   參數1 = 版本標籤（必填，如 v1.1）
#   參數2 = 說明（選填）
# 做的事：① 複製 preview 前台覆蓋正式 ② 正式前台 API 指回正式 /exec
#         ③ 驗證置換成功 ④ git commit + 打 tag ⑤ 印出 push 指令請人工確認
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

# 正式後端 /exec（公開網址，非機密；已在正式站 index.html 內）
PROD_API='https://script.google.com/macros/s/AKfycbzAfsGzzbg3FV6d8-x2sWFPO1o5N4uT9RBaqAHiqWBPseCrSvKV3QnC9NK9S2MGnHQvJg/exec'

TAG="${1:-}"
MSG="${2:-promote preview to production}"
if [ -z "$TAG" ]; then
  echo "❌ 請提供版本標籤，例如：bash promote.sh v1.1 \"成品庫存頁上線\""
  exit 1
fi

echo "① 複製 preview → 正式前台（index.html / order.html）"
cp preview/index.html index.html
cp preview/order.html order.html

echo "② 正式前台 API 指回正式 /exec（把預覽的測試 URL 換成正式）"
sed -i "s|const API='[^']*';|const API='${PROD_API}';|" index.html order.html

echo "②b 版本號自動蓋上 ${TAG}（登入頁 #appVer 顯示用）"
sed -i "s|const APP_VERSION='[^']*';|const APP_VERSION='${TAG}';|" index.html
grep -q "const APP_VERSION='${TAG}';" index.html || { echo "❌ 版本號置換失敗，已中止（未 commit）"; exit 1; }

echo "②c 版本號同步蓋進 preview（v3.5 P0-4：防 preview 版號過期造成審查誤判）"
sed -i "s|const APP_VERSION='[^']*';|const APP_VERSION='${TAG}';|" preview/index.html

echo "③ 驗證：正式前台確實指向正式後端"
grep -q "const API='${PROD_API}';" index.html || { echo "❌ index.html API 置換失敗，已中止（未 commit）"; exit 1; }
# v3.7 起 order.html 為停用告示頁（無 API 行）；僅在檔內確實有 API 行時才驗證
if grep -q "const API=" order.html; then
  grep -q "const API='${PROD_API}';" order.html || { echo "❌ order.html API 置換失敗，已中止（未 commit）"; exit 1; }
else
  echo "   （order.html 為停用告示頁、無 API 行，略過檢查）"
fi
echo "   ✅ index.html / order.html 皆指向正式 /exec"

echo "④ git commit + 打版本標籤 ${TAG}"
git add index.html order.html preview/
git commit -m "promote: ${MSG} (${TAG})" || echo "   （無變更可提交，沿用現有內容）"
git tag -a "${TAG}" -m "${MSG}"

echo ""
echo "✅ 升版準備完成：正式前台已更新為預覽版並打上標籤 ${TAG}"
echo "────────────────────────────────────────────"
echo "⚠️  最後一步要人工確認（這會真的更新 Molly 正式站）："
echo "     git push origin HEAD --tags"
echo ""
echo "   後端提醒（雙專案架構，見 DEPLOY.md）：切到『正式』Apps Script 專案"
echo "            clasp push -f + clasp deploy（或重新部署正式 Web App 到最新版本），"
echo "            正式專案不設 SHEET_ID 屬性＝fallback 走正式主表。測試專案獨立、零污染。"
echo "────────────────────────────────────────────"
