# 酒譜APP 部署與安全預覽手冊（DEPLOY）

> 目標：任何前台微調都能「先在測試環境給 Molly 預覽 → 確認無誤 → 一鍵升正式 / 一鍵回滾」，且**測試永遠碰不到正式資料**，可反覆使用。

## 架構：兩個獨立 Apps Script 專案（關鍵）

⚠️ **為何不能用「單一 script + 第二個部署 + Script Property」**：Apps Script 的 `getScriptProperties()` 是**整個 script 專案共用**，同專案所有部署/版本共讀同一份屬性。無法讓屬性只對某部署生效，故單專案在「正式已升級成讀屬性的新版」後必然污染。→ 改用兩個獨立專案。

| 環境 | Apps Script 專案 | 主表 | Script Property `SHEET_ID` | 前台 |
|---|---|---|---|---|
| 正式 | scriptId `1rZVFLOW4lYPQCRGZZYDqdMLAOEP5fzX_fpe--62lC3gFASBGEe7p1gH5` | 正式主表 `1rXmA0ACRwy4jo3XEkXHZzNjJw8uZzX1jzVle-6k0V40` | **不設**（fallback 硬編碼正式表） | 根 `index.html`/`order.html` → 正式 /exec |
| 測試 | **待建**（新 scriptId） | 沙盒 `14mSXm19OyQFXaVOxvUVWZI5O3SVhFG0yCvVDidG8M7I` | `= 14mSXm19OyQFXaVOxvUVWZI5O3SVhFG0yCvVDidG8M7I` | `preview/index.html`/`preview/order.html` → 測試 /exec |

程式碼（`gas/程式碼.gs`）兩專案完全相同；`MAIN_SHEET_ID` 讀 `SHEET_ID` 屬性、找不到 fallback 正式表，因此同一份 code 在兩專案各自表現正確。

**沙盒邊界**：只隔離主表（訂單主表＋成品庫存異動）。`getClientRecipeList` 仍唯讀各客戶真實酒譜表（讀取不寫入）。

## 一次性建置（測試專案）

前置：本機已裝 clasp 3.3.0。主公先授權一次：
```bash
clasp login        # 瀏覽器授權（只需一次）
```
之後（Code 可代勞）：
```bash
cd recipe/gas
# 1) 建測試專案（standalone）
clasp create --type standalone --title "酒譜APP-測試" --rootDir .
#    → 產生新的 .clasp.json（測試 scriptId）。建議改存為 .clasp.test.json，正式的存為 .clasp.prod.json，切換時複製對應檔為 .clasp.json
# 2) 推程式碼
clasp push -f
# 3) 部署 Web App（executeAs=USER_DEPLOYING, access=ANYONE_ANONYMOUS 見 appsscript.json）
clasp deploy -d "test webapp"
#    取得測試 /exec 網址（clasp deployments / Apps Script 部署管理）
```
設定測試專案的 Script Property：
- Apps Script 編輯器 → 專案設定（齒輪）→ 指令碼屬性 → 新增 `SHEET_ID = 14mSXm19OyQFXaVOxvUVWZI5O3SVhFG0yCvVDidG8M7I`
- 或執行一次性函式（如加了 `setTestSheetId()`）。

最後把測試 /exec 填進 preview：
```bash
# 把 __TEST_EXEC_URL__ 換成測試 /exec
sed -i "s|const API='[^']*';|const API='<測試EXEC網址>';|" recipe/preview/index.html recipe/preview/order.html
```

## 日常循環

1. 改前台 → 只改 `preview/index.html`（正式 `index.html` 不動）。
2. `clasp push -f`（測試專案）更新測試後端（若有動 `gas/程式碼.gs`）。
3. Molly 開 `https://mollylin-coding.github.io/recipe/preview/` 驗收（只動沙盒）。
4. 確認 OK → `bash promote.sh v1.1 "說明"`（複製 preview→正式、API 換回正式、commit+tag；**不自動 push**）。
5. 人工 `git push origin HEAD --tags` → 正式站更新。
6. 正式後端：切到正式專案 `clasp push -f` + `clasp deploy`（或重新部署正式 Web App 到最新版本）。
7. 出事 → `bash rollback.sh`（回前一 tag）+ 人工 push；後端重新部署上一版本號。
