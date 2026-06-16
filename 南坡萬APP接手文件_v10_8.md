# 南坡萬酒廠 APP 開發接手文件 v10.8（Phase C 訂單系統 完整上線）
> 建立日期:2026-06-15　適用版本:前端 v10.0 / GAS v9.9（Actions 自動部署，實機驗證通過）
> v10.7 更新:**實際操作 5 項修正 — Bug 23 毛利食材成本欄移除+整數顯示、Bug 24 研發試算複合子料占比輸入、Bug 25 製作記錄刪除功能、Bug 26 複合原料 batchVol 成本計算（103×誤差根治）、Bug 27 桌機版面響應式修正。**
> v10.6:QC 全功能掃描五項。v10.5:Batch 3 createRecipeSheet。v10.4:Batch 2 研發申請。v10.3:Batch 1 複合原料展開。v10.2:UX 五項。v10.1:程式品質三項。v10.0:客戶設定集中化。

---

## 零、開發最高原則(永遠保留,不可刪除)

1. **每次改動都用資深程式設計師角度做全面設計,不做局部補丁。** 找到根因、一次根治、消除整類錯誤。
2. **改版完成後,交付前必須先自我審查 + 實機驗證有無 BUG**(用 Claude in Chrome 走完下方「改版後驗證清單」),確認無誤才回報;不可讓使用者反覆確認同一問題。Chrome 隨時開著可用。
3. **所有錯誤必須記錄於本文件,每筆固定五段:現象 → 根因 → 錯誤寫法 → 正確寫法(code snippet)→ 驗證方式。** 只寫「已修正」三字視同沒記錄。
4. **所有設計邏輯、判讀方式、欄位映射都必須寫入本文件**,修正完成後同步把正確 code snippet 貼進對應段落。
5. **不確定事項必須先問使用者**,不擅自決定;確認邏輯與設計後才寫 code。

### 改版後驗證清單(每次改動依影響範圍勾選執行)
| 改動範圍 | 必驗項目 | 方法 |
|---|---|---|
| 任何前端/GAS 改動 | JS 語法 0 errors | node `new Function()` 檢查後才推送 |
| 原料庫相關 | 容量=F欄真值、價格個位數、固體標籤、每ml成本 | Chrome 開原料庫頁;API `?action=getInventory` |
| 研發試算相關 | 試算金額=手算理論值、ABV、占比✓100%、無爆栈 | Chrome JS 注入 rdPick/rdCalc 對照 |
| 酒譜頁相關 | 載入一款 ABV/成本/占比/備註正常(迴歸) | Chrome 載入 FB 第一款 |
| 毛利相關 | FB 與 NO1 各看一家,毛利率為百分比(55.1非0.55)、**warn 筆有 ⚠️** | API `?action=getProfitData&client=...`;**部署前先跑 `runSelfTest`(GAS編輯器)** |
| GAS 部署 | Actions run=success,打 API 確認新行為生效(快取5分) | GitHub API 查 run + Chrome 打端點 |
| 寫入功能 | 按鈕 lockRun 防連點、成功 toast、cache 清除 | Chrome 實際操作一次 |

> **新增建議:任何 GAS 改動,部署後在 GAS 編輯器手動跑一次 `runSelfTest()`(見第十五節),五分鐘擋掉大半回歸。**

---

## 一、系統基本資訊

| 項目 | 內容 |
|---|---|
| 前端網址 | https://mollylin-coding.github.io/recipe/ |
| GitHub Repo | MollyLin-coding/recipe(index.html + gas/程式碼.gs) |
| GAS 專案 ID | 1rZVFLOW4lYPQCRGZZYDqdMLAOEP5fzX_fpe--62lC3gFASBGEe7p1gH5 |
| API URL | https://script.google.com/macros/s/AKfycbzAfsGzzbg3FV6d8-x2sWFPO1o5N4uT9RBaqAHiqWBPseCrSvKV3QnC9NK9S2MGnHQvJg/exec |
| GitHub Token | ghp_[REDACTED_SEE_SECRETS](repo+workflow)⚠️ 列入安全性待處理 |
| GAS 擁有者 | wklin18@gmail.com |
| clasp 工作目錄 | C:\nanpow-gas(Molly 電腦,Actions 故障時備援用) |
| clasp Deployment ID | AKfycbzAfsGzzbg3FV6d8-x2sWFPO1o5N4uT9RBaqAHiqWBPseCrSvKV3QnC9NK9S2MGnHQvJg |

---

## 二、Sheet IDs

| 用途 | Google Sheet ID |
|---|---|
| 南坡萬主資料庫 | 1rXmA0ACRwy4jo3XEkXHZzNjJw8uZzX1jzVle-6k0V40 |
| Feeling Bar(FB) | 1WwCsC2SvLqWmGFPrwzM8pYLx3DpF3VM_3srfksWfza4 |
| 南坡萬公版(NO1) | 1X6euYjrRz72Fms8B3lvWjAhcJ81AlLp9BgnB_7zW1pU |
| Feeling Bar Cafe(FBC) | 14vso62AkYRubqKVsgWBMpHS79KkEgbXFkdnPdrodckE |
| 南坡萬v.2 | 1816K_4KJ-YTX3102TMw58po5QVrUFzy3tGhQPFjQLdE |
| 進料價格表 | 1uadQOdbLBmbNFfPKaiqy_QFQ0Lcw79nmojmvis66kKE |

四家客戶設定(CLIENTS/PROFIT_COLS)集中化結構與 v10.0 第十四節相同,未變動。

---

## 三、使用者帳號

| 帳號 | 密碼 | 角色 |
|---|---|---|
| Kevin | 888888 | admin |
| Molly | 666666 | admin |
| 阿軒 | 861105 | user |
| 小捲 | 333333 | user |
| Vic | 845698 | user |

非 admin 首次登入強制換密碼。⚠️ 密碼明碼儲存列入安全性待處理。

---

## 四、⚠️ 安全性待處理清單(暫緩執行,不可從文件移除)

> 2026-06-13 Molly 決議:此清單**列為待處理,本輪優先處理程式問題**。Token+Session 待後續排程。

| 項目 | 風險 | 建議方案 |
|---|---|---|
| GitHub Token 明碼存於文件/repo | 任何取得者可改前端與部署管線 | 改存 GitHub Secrets/環境變數;舊 token revoke 換新(對 Molly 幾乎無不便,Claude 推送方式不變) |
| 使用者密碼明碼存 Sheet 與本文件 | 取得文件即可 admin 登入 | GAS 端 Utilities.computeDigest SHA-256+salt,Sheet 只存雜湊 |
| GAS API 無 session 驗證 | 知道 API URL 即可直接呼叫 reviewApply 等寫入 action | login 成功發時效 token(CacheService 上限 6 小時);**前端須配合做「token 過期→重新登入」提示 + 自動延展,否則製酒師會被天天卡登入** |

---

## 五、彙整價格表欄位映射(2026-06-12 實機確認,共254筆)

進料價格表 →「彙整價格表」分頁,**Row 6 起為資料**,A 欄含「▌」者為大分類標題列。

| 欄 | 內容 | GAS 讀取 |
|---|---|---|
| A | 分類/品項識別 | `row[0]` |
| B | 品牌 | `row[1]` |
| C | 品名 | `row[2]` |
| D | ABV% | `row[3]` |
| E | 進貨價 | `row[4]` → `price` |
| F | **容量 ml** | `row[5]` → `vol` |
| G | **每 ml 單價**(Sheet 公式=E÷F) | `row[6]` → `unitCost` |
| H | 平台 | `row[7]` |
| K | 固體標記 | `row[10]` → 兩層判讀 |

固體兩層判讀(detectSolid)、getInventory 核心、16 筆待補容量清單 — 全部與 v10.0 第五節相同,未變動。

---

## 六、研發試算成本計算 / 七、防連點 lockRun / 八、毛利分析統一規則

未變動,沿用 v10.0 第六~八節。**第八節補充:getProfitData 新增欄位健檢,見第十五節與 Bug 21。**

---

## 九、其餘業務規則(未變動,沿用 v9.6)

酒稅、FB_DEFAULT_ABV、食材總成本(含稅)`(totalCost×1.15+tax)×1.05`、毛利含稅規則、BSPEC(含山形瓶/雷神瓶)、複合耗損÷0.8、SOLID_WATER_COMPOUNDS、申請審核寫回÷100、getRecipe 讀取邏輯、製程備註下一列 — 全部與 v9.6 相同。

**getRecipe pct≤1 邊界已補完整防呆說明,見 Bug 22。**

---

## 十、歷史重大 Bug 記錄(已修正,不可重犯)

Bug 1–20 與 v10.0 第十節相同。本輪新增 21、22:

### Bug 21:毛利欄位健檢 — 售價/成本讀不到時靜默丟棄(v10.1 根治)
- **現象:**Sheet 若插欄導致 PROFIT_COLS 欄位映射跑掉,getProfitData 讀到的 price/cost 變 0,舊邏輯用 `if(!price) continue;` **直接靜默丟棄該筆**,前端只是少顯示幾款,沒有任何錯誤提示,難以察覺(Bug 16「NO1 欄位三次錯誤」即此類症狀)。
- **根因:**讀不到值就 continue,把「資料缺失」當成「沒這筆」。
- **錯誤寫法:**
```js
// two-bottle
if (!cap || !price) continue;
list.push({ ...沒有 warn });
// 4L
if (!price) continue;
list.push({ ...沒有 warn });
return { ok:true, client, list }; // 無 warnCount
```
- **正確寫法(照常回傳 + 每筆 warn 旗標 + 整體 warnCount;前端該筆顯示 ⚠️ + 紅框):**
```js
// two-bottle 分支:只跳「真正無容量」的 padding 列
if (!cap) continue;
const price        = parseFloat(row[pc.price]) || 0;
const totalCostTax = parseFloat(row[pc.cost]) || 0;
const warn = !(price > 0) || !(totalCostTax > 0);  // 有容量卻讀不到售價/成本 → 標記
list.push({ recipeName:nm, bottle:capStr, price, abv, totalCostTax, profit, profitRate, warn });

// 4L 分支:只跳「整列無數據」的非酒款列
if (!price && !totalCostTax && !cap) continue;
const warn = !(price > 0) || !(totalCostTax > 0);
list.push({ recipeName:nm, bottle:'4L桶', price, cap, totalCostTax, profit, profitRate, warn });

// 函式結尾:
const warnCount = list.filter(function(x){ return x.warn; }).length;
return { ok:true, client, list, warnCount };
```
- **前端(renderProfitData,4L 與 two-bottle 兩種卡片都加):**
```js
// 卡片外層 class 與名稱旁 ⚠️
`<div class="pc${d.warn?' warn-row':''}">
   <div class="pn">${nm}${d.warn?' <span title="售價或成本讀取為 0，疑似毛利分頁欄位跑掉，請檢查 Sheet" style="cursor:help;">⚠️</span>':''}</div>`
// CSS:
.warn-row{border-color:var(--red)!important;background:rgba(220,38,38,.06)!important;}
```
- **驗證方式(2026-06-13 Chrome 實機):**
  - 四家 API `getProfitData` 皆回傳 `warn`(每筆)+`warnCount`(整體);目前資料健康 → warnCount=0,profitRate 基準不變(FB 55.1/53.6/51.6)。
  - 注入假資料(一筆 price=0,warn=true)→ 4L 與 two-bottle 卡片各正確顯示 1 個 ⚠️ + 1 個 warn-row 紅框,正常筆不受影響。

### Bug 21-b(自測抓到的自身 bug):selfTest 把「負毛利率」誤判 FAIL
- **現象:**首版 runSelfTest 斷言 `profitRate >= 0 && <= 100`,但 FB 實際有賣價低於成本的虧損品項(profitRate=-24.7),會被誤報異常 FAIL。
- **根因:**誤以為毛利率不可為負。實際 profit=price−cost 可為負,毛利率合法可為負;唯一數學上限是 ≤100%(因 profit≤price)。
- **正確寫法:**
```js
// 上限 ≤100.5(含四捨五入);下限放寬允許虧損;另加小數退化偵測
const bad = (r.list||[]).filter(x => !(x.profitRate <= 100.5 && x.profitRate >= -1000));
const maxAbs = (r.list||[]).reduce((m,x)=>Math.max(m,Math.abs(x.profitRate||0)),0);
if ((r.list||[]).length>0 && maxAbs < 1.5) warnMsg('毛利率全<1.5%,疑似回成小數格式(Bug 20 回歸)');
```
- **驗證方式:**改後四家 profitRate 最大值 FB55.1/NO168.9/FBC91.1 皆 ≤100;FB -24.7 不再誤判。**此 bug 正是「改版後實機驗證(原則#2)」攔下的,證明驗證流程有效。**

### Bug 22:getRecipe pct≤1 邊界歧義(v10.1 補防呆說明,行為不變)
- **現象:**`pct = rawPct <= 1 ? rawPct*100 : rawPct`,外部 review 擔心「100% 被當 1%」。
- **釐清(重要):**B欄存小數(Bug 1 約定:0.1=10%、1=100%),故值=1 → 1×100=100 → **正確顯示 100%,並非 1%**,review 方向描述有誤。唯一真正歧義:有人把「1%」誤填成整數 1(違反約定)→ 會被當 100%,屬資料輸入錯誤。
- **處置:****不在此處臆測修正**(若強加 guard,反而會把正確的 100% 砍成 1%,製造新回歸,違反原則#1)。改加完整註解說明約定與邊界;真正攔截手段應是酒譜頁「占比總和檢查」(未來 UX 待辦)。
- **正確寫法(僅補註解,邏輯保留):**
```js
const rawPct = parseFloat(row[1]) || 0;
// 占比格式約定(Bug 1):B欄存小數(0.1=10%、1=100%),≤1 一律 ×100;>1 視為已是百分比整數。
// ⚠️ 值剛好=1 在約定下即 100%(本式回傳 100,正確)。唯一歧義是把「1%」誤填成整數 1,
//    屬資料輸入錯誤,應由「占比總和檢查」攔截,不在此臆測(避免把正確 100% 砍成 1% 製造回歸)。
const pct = rawPct <= 1 ? rawPct * 100 : rawPct;
```

---

## 十一、部署流程(v9.8 起全自動,沿用 v10.0 第十一節)

GAS:Claude 改 GitHub `gas/程式碼.gs` → push main → Actions(`deploy-gas.yml`)自動 clasp push+deploy。前端:Claude 透過 GitHub API 推 index.html,Pages 約 1 分鐘生效。本機指令僅 Actions 故障備援,**`clasp pull` 永久禁止**。

> 2026-06-13 本輪兩次 GAS 部署皆 Actions success;前端推送後以 `?v=` cache-bust 載入驗證。

---

## 十二、Cache 策略(沿用 v10.0)

| 資料 | Cache | 清除時機 |
|---|---|---|
| 原料庫 | GAS CacheService 5分(`inventory_v2`)+前端 C.inv | 前端↻;改結構升 key 版號 |
| 酒譜清單 | GAS CacheService 5分(`recipeList_v1`)| 自動過期 |
| 毛利分析 | **無 GAS 快取**(getProfitData 即時)+ 前端 C.profit[client] | 點↻刷新 |
| 酒譜/製作記錄 | 前端 | 同 v9.6 |

> 註:getProfitData 無 GAS 快取,部署後 warn 行為即時生效,不受 5 分鐘快取影響。

---

## 十三、Sheet 資料待補清單(Molly 待辦)

1. 第五節 **16 筆品項補 F 欄容量**(否則試算成本=0)。
2. (選擇性)「沖泡粉類」6 筆若應視為固體,K 欄填 1。

---

## 十四、客戶設定集中化(已上線,沿用 v10.0)

CLIENTS / PROFIT_COLS 為唯一資料來源;新增第 5 家客戶 SOP:①Sheet 必須 Google 試算表格式(Bug 17)②CLIENTS 加一筆 ③新毛利格式才需在 PROFIT_COLS 加映射 ④部署後走驗證清單。**禁止在 CLIENTS 之外硬編碼客戶名。** 結構詳見 v10.0 第十四節。

---

## 十五、runSelfTest() 部署前自測(v10.1 新增)

**用途:**每次改 GAS、部署後,在 **GAS 編輯器手動執行 `runSelfTest`**(下拉選 runSelfTest → 執行),看 Logger(檢視 → 紀錄)。五分鐘擋下大半回歸。**不對外開放(doGet 未掛此 action),純內部測試。**

**測試內容:**
- `getRecipeList`:ok、非空、四家客戶都有酒譜
- 各客戶第一款 `getRecipe`:ok、原料非空、ABV 0–100、總體積>0;占比總和偏離 100% 超過 2% → warn(不 fail)
- 各客戶 `getProfitData`:ok、清單非空、**profitRate ≤100.5 且允許負值(虧損品項合法)**、毛利率全 <1.5% → warn(疑似小數回歸)、warnCount>0 → warn(欄位健檢)

**回傳:**`{ pass:bool, report:[...] }`,report 第一行 `===== SELF TEST: PASS/FAIL =====`。

**完整 code snippet 已在 `gas/程式碼.gs` 檔尾,如需重貼見該檔 `function runSelfTest()`。** profitRate 區間採數學不變式 ≤100(profit≤price),下限放寬允許負毛利(見 Bug 21-b)。

---

## 十六、使用者體驗五項(v10.2 新增,前端 v9.7,全部實機驗證通過)

> ⚠️ 重要教訓:動工前先看 code。本輪原列 7 項 UX 待辦,實查發現 **3 項早已存在**,只是文件未同步:
> - **占比總和顯示**:酒譜頁 `updateTotalPct()`/`recalcSummary()` + 研發頁 `rdCalc()`→`rd_pctw`,皆已顯示 `✓ 100%`/`⚠ X%(差Y%)`。
> - **審核「舊值→新值」對比**:`loadApplies()` 已顯示 `10% → 12%`(新值金色)。
> - **核准/拒絕二次確認**:`doReview()` 已有 `confirm()`。
> - **不可逆「刪除記錄」**:前端目前無持久記錄刪除 UI(`rdDel` 僅移除試算中的原料,非持久),故無額外保護需求。
> 因此本輪只新增下列 5 項:

### 16.1 占比≠100% 送出二次確認(B)
- 攔截「占比總和失真卻照樣送出」。**僅二次確認,不硬擋**(保留刻意微調彈性,如蒸發補償)。
- **申請更改(`showApplyModal`):**套用後總和 = 有填新值用新值,其餘維持原 pct:
```js
const chg = {}; items.forEach(it => { chg[it.name] = it.newVal; });
const sumPct = rdata.ingredients.reduce((s,ing)=> s + (chg[ing.name]!==undefined?chg[ing.name]:(ing.pct||0)), 0);
if (Math.abs(sumPct-100) >= 0.1 && !confirm(`套用後占比總和為 ${sumPct.toFixed(1)}%(與 100% 不符)…確定仍要送出申請？`)) return;
```
- **研發試算(`rdSave`):**`rdCalc()` 把總和存 `window._rdPctSum`,儲存前檢查:
```js
const sp = window._rdPctSum;
if (sp!==undefined && Math.abs(sp-100)>=0.1 && !confirm(`目前占比總和 ${sp.toFixed(1)}%…確定仍要儲存？`)) return;
```

### 16.2 讀取 loading 進度條
- GAS 冷啟動 2–4 秒,讀取型 API 過去無視覺回饋。`api()` 非 silent 時顯示頂部進度條,多筆併發以計數管理:
```js
async function api(params, silent){
  if(!silent) apiLoadStart();
  try{ const res=await fetch(url); return await res.json(); }
  catch(e){ if(!silent) toast('網路錯誤'); return {ok:false,error:e.message,_offline:true}; }
  finally{ if(!silent) apiLoadEnd(); }
}
// _apiLoadN 計數;#apiLoadBar.on 寬度動畫到 92%,歸零時收掉(CSS 見第十二節下方)
```
- 寫入型仍由 `lockRun` 做按鈕級防連點(既有),進度條為附加。

### 16.3 審核占比變動 ≥10% 標紅(`loadApplies`)
- 門檻 Molly 定 **≥10%**(絕對變動量)。新值由金色改紅色 + 顯示差額 badge:
```js
const ov=it.oldVal||0, nv=it.newVal||0, big=Math.abs(nv-ov)>=10;
// 新值 color:${big?'var(--red)':'var(--gold-dk)'} ; big 時加 <span class="badge bg-red">差${nt(nv-ov,1)}%</span>
```

### 16.4 製作記錄日期區間 + 客戶篩選(`renderBatchList`)
- 篩選狀態 `let _bf={client:'',from:'',to:''}`(全域,放 `batchRecs` 旁)。`batchRecs` 為完整資料,**僅顯示層過濾**,onclick 用 `batchRecs.indexOf(r)` 取**原始索引**(避免篩選後編輯到錯誤記錄 — 已實測 0/2 索引正確)。
- 日期用字串比較(input type=date 給 `YYYY-MM-DD`,字典序=時序)。顯示「共 N 筆(全部 M 筆)」與清除鈕。

### 16.5 離線/弱網 localStorage 快取
- **範圍界定(誠實說明):**此為**資料層快取** — 已在 APP 內、網路中途不穩時,讀取失敗自動 fallback 到最後一次快取的酒譜(廠房/冷藏室常見情境),不再只顯示「網路錯誤」空白。**並非完整 PWA/Service Worker 離線**:首次載入頁面、首次登入仍需連線(且因安全考量未做 session 持久化)。寫入排隊(離線編輯後補送)亦未做,列未來。
- 機制:`api()` catch 時回傳 `_offline:true`;`lsSet/lsGet` 包 try/catch;`setOffline(on)` 切換底部離線 banner。
  - `getRecipeList` 成功 → `lsSet('np_recipeList',list)`;`_offline` → 讀 `np_recipeList` 快取(login + doRefresh 都做)。
  - `loadRecipe` 成功 → `lsSet('np_recipe_'+key,res)`;`_offline` → 讀 `np_recipe_'+key` 快取顯示,無快取則提示「請連線後再開啟一次」。

---

## 十七、下一步排程與未來規劃

### ✅ 已完成
- **v10.1 程式品質三項:**毛利欄位健檢(Bug 21)、runSelfTest(第十五節)、pct≤1 防呆(Bug 22)
- **v10.2 使用者體驗五項:**見第十六節(占比送出確認、loading、審核標紅、製作記錄篩選、離線快取)

### 程式品質剩餘項
- ~~`parseCompoundFormula` 係數在前(`2.5*H5`)無法解析~~ — **已釐清:v9.6 第十七節舊規格錯誤(係數實際在後 `H13*2`,且需支援多子料相加+耗損)。完整正確規格見第十八章,Phase 2 Feature A 依該章實作。**

### 安全性(Molly 決議暫緩,見第四節)
- Token+Session 待後續排程。下一個低成本項:GitHub Token 改存 Secrets 並 revoke 舊 token。

### 使用者體驗剩餘(待處理)
- **Email 通知(MailApp)** — Molly 決議**本輪先不做,列待處理**。阻礙點:系統目前只存帳號+密碼+角色,**沒有使用者 email**,「通知申請人」需先補 email 欄位;單向「通知 admin」可先用固定信箱實作。
- 離線**寫入排隊**(離線編輯後補送)— 範圍大,列未來。
- 完整 PWA/Service Worker 離線(連頁面本身都可離線開)— 範圍大,列未來。

### Phase 2-5
複合原料酒譜頁展開、研發試算→送審→建分頁、財務/倉管/儀表板(同 v9.6)

**Phase 2 進度(2026-06-15 完成):**
- ✅ **複合原料 Sheet 結構已完整釐清並實機驗證**(第十八章)。
- ✅ **設計決議(Molly):** ①直接展開②子原料可調整③納入申請記錄④複製現有樣板⑤審核頁獨立區塊⑥試算頁+記錄列表送審按鈕⑦型態B公式寫入。
- ✅ **Batch 1 完成(2026-06-14):** 複合原料展開(見第二十一節)。
- ✅ **研發申請記錄分頁已建好(gid=1839254296):** A=id(RA+ts) B=createdAt C=creator D=client E=name F=volume G=bottle H=abv I=ingredients(JSON,含子料明細) J=results(JSON) K=status L=reviewer M=reviewedAt N=newSheet，實機確認 14 欄正確。
- ✅ **Batch 2 完成(2026-06-15):** 研發申請送審+審核(見第二十二節)。
- ✅ **Batch 3 完成(2026-06-15):** reviewRdApply 核准 → createRecipeSheet → 新分頁建立+回填 N 欄(見第二十三節)。
- ⏳ **A-3 子料調整納入申請(待實作):** 酒譜頁複合料調整後送審，把子料明細(coef)打包進申請記錄。

---

## 十八、複合原料 Sheet 結構完整解析(2026-06-14 實機驗證,5 案例跨 3 Sheet)

> ⚠️ **本章取代 v9.6 第十七節的舊規格。** v9.6 第十七節描述的 `parseCompoundFormula` 來自
> v5.x 舊版、且標註「待實作」,其 regex `/H(\d+)\*?(\d+\.?\d*)?/g` **無法處理多子料相加與耗損**,
> 不可再沿用。以下為 Molly 指認 + Claude 實機逐格讀公式確認的真實結構。

### 18.1 ⚠️ 釐清:F 欄是「進貨單價」,不是公式欄(修正先前記憶錯誤)

**酒譜分頁(FB_/NO1_/FBC_ 等)真實欄位映射(實機確認):**

| 欄 | index | 標頭 | 內容 | 範例 |
|---|---|---|---|---|
| A | 0 | 原料(複合原料食材分別填寫黃格) | 原料名稱 | 櫻花香料水(1:200) |
| B | 1 | 體積占比 | 占比%(0.25=25%) | 25% |
| C | 2 | 實際體積 | ml | 1000 |
| D | 3 | ABV.計算 | 原料 ABV | 40 |
| E | 4 | 比例備註 | 稀釋/配方比例(給人看) | (1:200) / (1+2:100酒) |
| **F** | **5** | **進貨單價** | **單價(複合母料此欄放公式)** | 3.6 / `=H12` |
| G | 6 | 單價體積/包裝容量(ml/g) | 該單價對應容量 | 201 |
| H | 7 | 每單位/單位體積成本 | 每 ml 成本 `=IFERROR(F/G,"")` | 0.018 |
| I | 8 | 總體積成本 | 該料總成本 `=IFERROR(H*C,"")` | 18 |

- **錯誤寫法(先前憑 v9.6 記憶):** 「F 欄是複合原料公式欄」→ 錯。F 欄標頭就是「進貨單價」。
- **正確理解:** F 欄是進貨單價;**一般原料** F 欄填純數字,**複合母料** F 欄放公式 `=H{子料列}...`,
  公式算出的值即「該複合料的等效每ml成本當作其進貨單價」。

### 18.2 三層結構與子料區邊界

以 FB_紫芋茉莉奶酒為例:

```
原料區(母料 + 一般料)         ← Row4 起
  Row4  40%糖蜜酒      (一般料,F=純值)
  Row5  一海香茉莉茶湯  (複合母料,F=H13*2)  ← E欄(2:100)
  Row6  芋頭香料水      (複合母料,F=H14)    ← E欄(1:150)
  ...
總體積                        ← 占比100% 那列(分界)
─────────── 子料區開始 ───────────
  Row13 一海香精選茉莉綠茶 (子料,F/G純值,H=F/G)
  Row14 芋頭香精          (子料)
  Row15 金牌芋香奶茶粉    (子料)
─────────── 子料區結束 ───────────
{n}ml版總食材成本             ← 子料區下邊界(綠色列)
製程備註 / 代工費用區
```

- **子料區 = 「總體積」列下方 ~ 「{n}ml版總食材成本」列上方。**(Molly 指認 + 實機確認)
- 子料的 A=名稱、F=進貨單價(純值)、G=包裝容量(純值)、H=`=IFERROR(F/G,"")`、C/I 多為空。

### 18.3 ⭐ F 欄公式的所有形式(5 案例實機驗證,GAS 解析必須全支援)

| # | Sheet / 酒款 | 母料 | F 欄公式 | 形式 |
|---|---|---|---|---|
| 1 | FBC_櫻花斑斕美式 | 櫻花香料水 | `=H12` | 單子料,無係數無耗損 |
| 2 | FB_紫芋茉莉奶酒 | 一海香茉莉香片茶湯 | `=H13*2` | 單子料 + 係數(在後) |
| 3 | NO1.V2_蜜香紅茶荔枝琴酒 | 一海香紅玉紅茶 | `=H12*2` | 單子料 + 係數 |
| 4 | **FB_島嶼鳳梨冰茶** | 全祥/一海香鐵觀音 | **`=(H14*1+H17*2+H15*100)/0.8`** | **多子料 + 各係數 + 耗損** |
| 5 | **NO1.V2_包種茶青梅甜酒** | 全祥包種茶酒 | **`=(H14*3+H13*100)/0.8`** | **多子料 + 各係數 + 耗損** |
| 6 | NO1.V2_包種茶青梅甜酒 | 包種茶湯 | `=H14*3` | 單子料 + 係數(與#5共用 H14) |

**通用文法:**
```
F母料 = [ ( H{列}*係數 + H{列}*係數 + ... ) / 0.8 ]
  · 一個以上 H{列}*係數 項,以 + 號相加
  · 係數可省略(=H12 等同 =H12*1)
  · 外層括號 + /0.8 為選配,有 /0.8 = 計耗損
  · 係數 = 配方比例(如 1g:2g:100ml → *1 + *2 + *100),對應 E欄/A欄文字備註
  · 同一子料列可被多個母料共用(#5、#6 都參照 H14)
```

### 18.4 ✅ 複合原料判讀規則(以 F 欄公式為主,名稱/備註為輔)

符合任一點即可能是複合原料,但**判據強度不同**:

| 判據 | 強度 | 說明 |
|---|---|---|
| **① F 欄是公式且參照「總體積下方」的 H 欄** | **★最可靠** | 計算結構,騙不了人。`getFormulas()` 取 F 欄,以 `=` 開頭且含 `H\d+` 即是 |
| ② 名稱含「茶湯/茶酒/稀釋/香料水」或含兩項以上原料 | 輔助 | 人工填寫,可能漏 |
| ③ E 欄有比例備註(如 (1:200)、(1+2:100)) | 輔助 | 人工填寫,可能漏 |

> **GAS 實作鐵則:以 ① 為唯一硬判據,②③ 只作額外 flag 顯示。**
> 即使有人忘了在名稱寫關鍵字或漏填 E 欄,只要 F 欄公式結構在,就能正確辨識。

### 18.5 GAS 解析演算法(Phase 2 Feature A 實作用)

```js
// 1. ws.getDataRange().getFormulas() 取全表公式(getValues 只有計算值,看不到 =H12)
// 2. 先定位「總體積」列 與「{n}ml版總食材成本」列,框出子料區 [subStart, subEnd)
// 3. 建子料 Map: { 列號(1-based): {name, unitPrice(F), packVol(G), unitCost(H值)} }
// 4. 對原料區每列,讀 F 欄公式字串 formula:
function parseCompoundFormula(formula, subMap) {
  if (!formula || formula.charAt(0) !== '=') return { isCompound: false };
  // 耗損:公式含 /0.8(允許空白 / 0.8)
  const hasLoss = /\/\s*0\.8/.test(formula);
  // 抓所有 H{列}[*係數] 項;係數預設 1;係數可在後(H14*3)
  const terms = [];
  const re = /H(\d+)\s*(?:\*\s*(\d+\.?\d*))?/g;
  let m;
  while ((m = re.exec(formula)) !== null) {
    const row = parseInt(m[1]);
    const coef = m[2] ? parseFloat(m[2]) : 1;
    if (subMap[row]) terms.push({ row, coef, sub: subMap[row] });
  }
  if (terms.length === 0) return { isCompound: false };
  // 子料明細:用量(相對)= 係數;單位成本 = H;貢獻成本 = 係數 × H
  const subMaterials = terms.map(t => ({
    name: t.sub.name, coef: t.coef, unitCost: t.sub.unitCost,
    contrib: t.coef * t.sub.unitCost
  }));
  return { isCompound: true, hasLoss, subMaterials };
}
// 5. 回傳 ingredient 加欄位: isCompound, hasLoss, subMaterials[]
// ⚠️ 注意:#2/#3 的 *2 係數在「後」(H13*2),v9.6 舊 regex 係數在前(2.5*H5)的假設是錯的。
//    本 regex 係數在 H 之後,符合 5 個實機案例。若未來出現係數在前,需再擴充。
```

### 18.6 反向寫入酒譜 Sheet(Phase 2 Feature B,Molly 決議:型態 B 公式寫入)

**Molly 決議(2026-06-14):新增/更改酒譜核准後,以「型態 B — 公式寫入,100% 比照原結構」反向寫回 Sheet。**
原因:Sheet 維持單一真實來源,Molly 仍會在 Sheet 端手改子料,需毛利自動連動重算。

寫入規格(建分頁時必須重現以下公式,非純值):
```
子料列:   F=進貨單價(值)  G=包裝容量(值)  H==IFERROR(F{列}/G{列},"")
複合母料: F==(H{子料列}*係數 + ...)[/0.8]   ← 依配方比例與耗損組裝
          H==IFERROR(F{列}/G{列},"")          C=實際體積(值)
          I==IFERROR(H{列}*C{列},"")
一般原料: F=進貨單價(值)  G H I 同上公式結構
```
> ⚠️ **動態列號是最大難點:** 建分頁時子料實際落在第幾列,取決於母料數量。
> 寫入前需先排版(算出每列最終 row),再組母料 F 欄公式的 `H{子料列}` 參照,避免錯位。
> 此為 Feature B 最易出錯處,實作時務必先寫排版函式、單元測試列號對應,再寫公式。


---

## 十九、判讀邏輯複檢報告(2026-06-14,v9.6→v10.2 全面實機複檢)

> 目的:抓出「Claude 憑記憶/臆測自行判讀、未經實機驗證」的地方,避免新對話重犯。
> 方法:三方比對(文件聲稱 vs GAS 程式碼 vs 實機 Sheet/API)。

### 19.1 ❌ 已發現並修正:複合原料 F 欄公式(見第十八章)
v9.6 第十七節舊規格錯誤,已用 5 案例實機推翻,正確規格見第十八章。

### 19.2 ⚠️ 脆弱點(碰巧正確,Phase 2 Feature A 須一併加固):getRecipe 子料區邊界

- **現況:** getRecipe(GAS 約行 205-241)迴圈從 Row4 讀原料,遇「總體積」只 `continue` 不 break,
  會**繼續往下掃到子料區**。子料因 B(占比)/C(實際體積)欄為空 → `pct=0 && vol=0` →
  被 `if (pct>0 || vol>0)` 過濾掉,**所以目前結果正確**。
- **實機證據(2026-06-14 API):**
  - FB_島嶼鳳梨冰茶:8 原料,占比加總 100%,4 個子料(全祥鐵觀音/玉山高粱/一海香鐵觀音/開元柳橙汁)正確排除。
  - NO1.V2_包種茶青梅甜酒:7 原料,占比加總 100%,3 個子料(全祥包種茶/桂花香精/40度糖蜜酒)正確排除。
- **風險:** 若未來某子料填了 C 欄體積,會誤入原料清單、占比爆掉。屬「碰巧正確」非「明確排除」。
- **加固方向(Phase 2 Feature A 實作子料解析時務必做):** 在「總體積」列後主動標記
  `inSubArea=true`,子料區只供 parseCompoundFormula 抓 H 欄,**不進 ingredients**;
  遇「{n}ml版總食材成本」或「製程備註」才視為子料區結束。明確邊界,不靠空欄碰巧。

### 19.3 ✅ 複檢通過(判讀正確,實機驗證)

| 項目 | 驗證 | 結果 |
|---|---|---|
| 酒譜分頁欄位 A名/B占比/C體積/D ABV/F進貨單價/G容量/H每ml成本/I總成本 | 實機+API | ✓ |
| 占比 pct≤1 ×100 還原(FB 存小數 0.1=10%) | API 島嶼鳳梨 pct 正確 | ✓ |
| 子料排除(複合料不混入清單) | API 2 款占比皆 100% | ✓ |
| 彙整價格表 F容量/G每ml單價 | v9.9 實機254筆 | ✓ |
| 固體兩層判讀 detectSolid | v9.4 實機 | ✓ |
| 四客戶毛利 PROFIT_COLS | API warnCount 全0、毛利率合理(55.1/68.9/91.1/84.7) | ✓ |
| 前端自算 ABV Σ(abv×pct/100) | v9.6 確認 | ✓ |

**結論:v9.6 之後唯一判讀錯誤=複合原料公式(已修正)。子料區邊界脆弱點列入 Phase 2 Feature A 根治。**


---

## 二十、Batch 1 複合原料展開 — 互動設計定案(2026-06-14 Molly 確認)

### 20.1 酒譜頁複合原料展開 UI(設計決議)
- **直接展開**(無 toggle),所有複合原料預設展開顯示子料明細。
- 每個子料一列:子料名稱 + 用量輸入框 + 該子料貢獻成本;母料下方顯示 ÷0.8 耗損標記(若有)。

### 20.2 ⭐ 子料調整的數學連動(關鍵,勿做錯)
- **改子料用量 → 只重算「複合料成本」→ 更新總成本,占比不動。**
- **占比是獨立動作:** 母料占比沿用既有占比輸入框(recalcFromPct),調酒師要改占比是另一個獨立操作,與子料調整互不干擾。
- **為何占比不連動子料:** 複合母料的占比單位是「成品 ml 佔整批」,子料單位是「子料 ml」,兩者單位不同;
  若硬讓改子料回頭動占比,會打亂占比總和(不再 100%)且數學失真。故**子料只影響成本,不影響占比**。

### 20.3 複合料成本重算公式(前端)
```
複合料成本 = ( Σ 子料用量 × 子料每ml成本 × 係數 ) / (hasLoss ? 0.8 : 1)
  → 更新該母料 ing._curCost
  → recalcSummary() 重算總成本/報價/含稅總成本(占比不變)
```
> 注意:酒譜頁的複合料成本,GAS 已從 Sheet I 欄(母料總成本)讀到 ing.cost;
> 子料可調是「讓使用者試算改子料後成本怎麼變」,改完不寫回 Sheet(本地試算)。
> 若要送申請,才打包進申請記錄(A-3:納入申請記錄,子料明細一起存)。

### 20.4 GAS getRecipe 改動範圍(Batch 1)
1. 加取 `getFormulas()` 拿 F 欄公式(getValues 看不到 =H12)。
2. 明確子料區邊界(根治第 19.2 脆弱點):「總體積」列後 inSubArea=true,建 subMap{列號:{name,unitCost(H值)}},
   遇「{n}ml版總食材成本」或「製程備註」結束;子料**不進 ingredients**(維持現有正確行為)。
3. 對複合母料(F 欄是公式)呼叫 parseCompoundFormula(第 18.5),附加 isCompound/hasLoss/subMaterials[] 到 ingredient。
4. 向後相容:複合母料仍照常進 ingredients(讀 I 欄總成本不變),只「多附加」欄位;舊前端不讀新欄位也不會壞。


---

## 二十一、Batch 1 複合原料展開 — 實作完成記錄(2026-06-14 已上線+實機驗證)

### 21.1 完成狀態
- **GAS:** commit 2174706,Actions「Deploy GAS」success 部署完成。
- **前端:** commit 9e8ca36,Pages success 部署完成。
- **驗證:** parseCompoundFormula 本地單元測試 7/7 通過;API 實機 2 款酒譜(島嶼鳳梨/包種茶青梅)
  複合料解析正確;前端注入渲染展開畫面正確;改子料係數即時重算成本、占比不動、占比總和維持 100%。

### 21.2 GAS 端正確 code(getRecipe 兩階段 + parseCompoundFormula)
```js
// getRecipe 內:取公式
const range = ws.getDataRange();
const data = range.getValues();
const formulas = range.getFormulas(); // F 欄公式字串(getValues 看不到 =H12)

// 階段一:定位子料區邊界 + 建 subMap(根治 19.2 脆弱點)
let totalVolRow = -1, subEndRow = -1;
for (let i = 3; i < data.length; i++) {
  const a = String(data[i][0] || '').trim();
  if (totalVolRow < 0 && a === '總體積') { totalVolRow = i; continue; }
  if (totalVolRow >= 0 && (/ml版總食材成本/.test(a) || a === '製程備註')) { subEndRow = i; break; }
}
const subMap = {};
if (totalVolRow >= 0) {
  const end = subEndRow >= 0 ? subEndRow : data.length;
  for (let i = totalVolRow + 1; i < end; i++) {
    const a = String(data[i][0] || '').trim();
    if (!a || a === '基礎原料') continue;
    let unitCost = parseFloat(data[i][7]) || 0;            // H 欄=每ml成本
    const fVal = parseFloat(data[i][5]) || 0, gVal = parseFloat(data[i][6]) || 0;
    if (!unitCost && fVal > 0 && gVal > 0) unitCost = fVal / gVal;
    subMap[i + 1] = { name: a, unitPrice: fVal, packVol: gVal, unitCost: unitCost };
  }
}

// 階段二:讀原料區(Row4 ~ 總體積列上方),複合母料附加 subMaterials
const ingEnd = totalVolRow >= 0 ? totalVolRow : data.length;
for (let i = 3; i < ingEnd; i++) {
  // ...(占比/體積/成本讀取同前)...
  const ing = { name, pct, vol, abv: ingAbv, cost };
  const fFormula = (formulas[i] && formulas[i][5]) ? String(formulas[i][5]) : '';
  const cpd = parseCompoundFormula(fFormula, subMap);
  if (cpd.isCompound) { ing.isCompound = true; ing.hasLoss = cpd.hasLoss; ing.subMaterials = cpd.subMaterials; }
  ingredients.push(ing);
}

// parseCompoundFormula:支援 =H12 / =H13*2 / =(H14*1+H17*2+H15*100)/0.8
function parseCompoundFormula(formula, subMap) {
  if (!formula || formula.charAt(0) !== '=') return { isCompound: false };
  const hasLoss = /\/\s*0\.8/.test(formula);
  const subMaterials = [];
  const re = /H(\d+)\s*(?:\*\s*(\d+\.?\d*))?/g;
  let m;
  while ((m = re.exec(formula)) !== null) {
    const row = parseInt(m[1]);
    const coef = m[2] ? parseFloat(m[2]) : 1;
    if (subMap[row]) subMaterials.push({
      name: subMap[row].name, coef: coef,
      unitCost: subMap[row].unitCost, contrib: coef * subMap[row].unitCost
    });
  }
  if (subMaterials.length === 0) return { isCompound: false };
  return { isCompound: true, hasLoss: hasLoss, subMaterials: subMaterials };
}
```

### 21.3 前端正確 code(recalcCompound:子料調整,占比不動)
```js
// 複合原料子料調整 → 重算複合料成本(占比不動,僅成本連動)
function recalcCompound(idx) {
  const ing = rdata?.ingredients?.[idx];
  if (!ing || !ing.isCompound) return;
  let perMl = 0;
  (ing.subMaterials || []).forEach((s, si) => {
    const coef = parseFloat(document.getElementById('cs_'+idx+'_'+si)?.value) || 0;
    s.coef = coef; s.contrib = coef * (s.unitCost || 0);
    perMl += s.contrib;
    const ce = document.getElementById('csc_'+idx+'_'+si);
    if (ce) ce.textContent = '= $' + nt(s.contrib, 2);
  });
  if (ing.hasLoss) perMl = perMl / 0.8;
  const vol = parseFloat(document.getElementById('rv_'+idx)?.value) || ing.vol || 0;
  ing._curCost = perMl * vol;
  const cc = document.getElementById('rc_'+idx); if (cc) cc.textContent = fm(ing._curCost);
  recalcSummary(); // 占比總和不變
}
```
> 前端原料列渲染:複合料加 `cpd-badge` 標記、`ing-compound` 樣式(金色左邊框);
> 第二行下方插入 `.cpd-expand` 子料區,每子料一列(名稱 + 係數輸入框 cs_{idx}_{si} + 每ml成本 + 貢獻 csc_{idx}_{si});
> hasLoss 顯示「÷0.8 耗損」紅標。

### 21.4 Batch 2/3 完成，下一個待辦
- ✅ **Batch 2 已完成**，見第二十二節。
- ✅ **Batch 3 已完成**，見第二十三節。
- **A-3 子料調整納入申請(待實作):** 酒譜頁複合料調整後若要送審，把子料明細(coef)一起打包進申請記錄，核准後 createRecipeSheet 可還原複合結構。


---

## 二十二、Batch 2 研發申請送審+審核 — 實作完成記錄（2026-06-15 已上線+實機驗證）

### 22.1 完成狀態
- **GAS:** commit 3a7435470f，Actions「Deploy GAS」success 部署完成。
- **前端:** commit 2c1eaaadda，Pages success 部署完成。
- **驗證:** 四個 GAS action 實機 API 逐一驗證；前端送審表單/審核頁研發區塊實機截圖確認；rdLoadOne bug 修正確認。

### 22.2 GAS 端正確 code（submitRdApply / getRdApplies / reviewRdApply / getRdHistory）

```js
// doGet switch 新增（deleteRdRecord 之後）：
case 'submitRdApply':  result = submitRdApply(p); break;
case 'getRdApplies':   result = getRdApplies(); break;
case 'reviewRdApply':  result = reviewRdApply(p); break;
case 'getRdHistory':   result = getRdHistory(); break;

// ── 研發申請 ─────────────────────────────────────────────────
// 分頁「研發申請記錄」欄位（gid=1839254296，實機確認 14 欄）：
// A=id(RA+ts) B=createdAt C=creator D=client E=name F=volume G=bottle
// H=abv I=ingredients(JSON,含子料明細) J=results(JSON) K=status
// L=reviewer M=reviewedAt N=newSheet(核准後回填分頁名,Batch 3 寫)
function submitRdApply(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發申請記錄');
  if (!ws) return { ok: false, error: '找不到研發申請記錄分頁' };
  const id = 'RA' + Date.now();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  ws.appendRow([id, now, p.creator, p.client, p.name,
    parseFloat(p.volume) || 0, p.bottle || '',
    parseFloat(p.abv) || 0,
    p.ingredients || '[]', p.results || '{}',
    '待審核', '', '', '']);
  return { ok: true, id };
}

function getRdApplies() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發申請記錄');
  if (!ws) return { ok: true, list: [] };
  const rows = ws.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || String(r[10]) !== '待審核') continue;
    list.push({ id:String(r[0]), createdAt:String(r[1]), creator:String(r[2]),
      client:String(r[3]), name:String(r[4]), volume:r[5], bottle:String(r[6]),
      abv:r[7], ingredients:String(r[8]), results:String(r[9]) });
  }
  return { ok: true, list };
}

function reviewRdApply(p) {
  const approve = p.approve === 'true';
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發申請記錄');
  if (!ws) return { ok: false, error: '找不到研發申請記錄分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(p.id)) continue;
    const status = approve ? '已核准' : '已拒絕';
    ws.getRange(i + 1, 11).setValue(status);   // K=status
    ws.getRange(i + 1, 12).setValue(p.reviewer || '');  // L=reviewer
    ws.getRange(i + 1, 13).setValue(new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })); // M=reviewedAt
    // ⏳ Batch 3：if (approve) { try { createRecipeSheet(rows[i]); } catch(e) {} }
    return { ok: true };
  }
  return { ok: false, error: '找不到申請 id' };
}

function getRdHistory() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發申請記錄');
  if (!ws) return { ok: true, list: [] };
  const rows = ws.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || String(r[10]) === '待審核') continue;
    list.push({ id:String(r[0]), createdAt:String(r[1]), creator:String(r[2]),
      client:String(r[3]), name:String(r[4]), volume:r[5], bottle:String(r[6]),
      abv:r[7], status:String(r[10]), reviewer:String(r[11]), reviewedAt:String(r[12]),
      newSheet:String(r[13] || '') });
  }
  return { ok: true, list };
}
```

### 22.3 前端正確 code

**① 試算頁送審按鈕（在 ⬇ CSV 旁邊）：**
```html
<button class="btn btn-primary btn-sm" onclick="lockRun(this, rdSubmitApply)">📤 送出申請</button>
```

**② 送審表單 modal + rdSubmitApply + rdApplyFromRecord：**
```js
// 送審表單 modal（name/client 任一為空時強制填寫）
function showRdApplyModal(defaults, onSubmit) {
  const clients = clientList.length ? clientList.map(c=>c.name) : ['Feeling Bar','南坡萬公版','Feeling Bar Cafe','南坡萬v.2'];
  const clientOpts = clients.map(c=>`<option value="${c}"${defaults.client===c?' selected':''}>${c}</option>`).join('');
  const modal = makeModal(`
    <div class="modal-title">📤 送出研發申請</div>
    <div class="fg" style="margin-bottom:10px;"><label class="lb">酒款名稱</label>
      <input class="inp" id="_rdaName" value="${(defaults.name||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}" placeholder="請填寫酒款名稱" style="margin-top:4px;"></div>
    <div class="fg"><label class="lb">客戶</label>
      <select class="inp" id="_rdaClient" style="margin-top:4px;">${clientOpts}</select></div>
    <div class="fe mt8" style="gap:6px;margin-top:16px;">
      <button class="btn btn-ghost btn-sm" onclick="this.closest('.modal-bg').remove()">取消</button>
      <button class="btn btn-primary btn-sm" id="_rdaOk">確認送出</button>
    </div>`);
  const btn = document.getElementById('_rdaOk');
  btn.addEventListener('click', () => lockRun(btn, async () => {
    const n = document.getElementById('_rdaName')?.value.trim();
    const c = document.getElementById('_rdaClient')?.value;
    if (!n) { toast('請填寫酒款名稱'); return; }
    if (!c) { toast('請選擇客戶'); return; }
    modal.remove();
    await onSubmit(n, c);
  }));
}

// 試算頁「📤 送出申請」
async function rdSubmitApply() {
  if (!rdState.ings.length) { toast('請先加入原料'); return; }
  showRdApplyModal({ name: rdState.title||'', client: rdState.client||'' }, async (name, client) => {
    const res = await api({ action:'submitRdApply', creator:curUser.username, client, name,
      volume:rdState.tv, bottle:rdState.bt, abv:(window._rdRes?.abv||0),
      ingredients:JSON.stringify(rdState.ings), results:JSON.stringify(window._rdRes||{}) });
    if (res.ok) toast('研發申請已送出！');
    else toast('送出失敗：'+(res.error||''));
  });
}

// 記錄列表「📤」— 直接用儲存記錄的資料送審
async function rdApplyFromRecord(r) {
  if (!r) return;
  let parsedResults = {};
  try { parsedResults = JSON.parse(r.results||'{}'); } catch(e) {}
  showRdApplyModal({ name: r.name||'', client: r.client||'' }, async (name, client) => {
    const res = await api({ action:'submitRdApply', creator:curUser.username, client, name,
      volume:r.volume||0, bottle:r.bottle||'', abv:parsedResults.abv||0,
      ingredients:r.ingredients||'[]', results:r.results||'{}' });
    if (res.ok) toast('研發申請已送出！');
    else toast('送出失敗：'+(res.error||''));
  });
}
```

**③ rdLoadList 每條記錄加 📤 按鈕（完整替換）：**
```js
async function rdLoadList() {
  const res = await api({ action:'getRdRecords' });
  if (!res.ok) { toast('載入失敗'); return; }
  const records = res.records || [];
  if (!records.length) { toast('無儲存記錄'); return; }
  const modal = makeModal(`<div class="modal-title">試算記錄</div>
    <div style="max-height:300px;overflow-y:auto;">${records.map((r,i)=>`<div class="rd-rec-item" style="display:flex;align-items:center;gap:6px;cursor:default;padding-right:6px;">
      <div style="flex:1;cursor:pointer;" onclick="rdLoadOne(${i},this.closest('.modal-bg'))">
        <div style="font-weight:500;font-size:13px;">${r.name||'未命名'}</div>
        <div class="sub">${r.client||'—'} · ${r.creator} · ${String(r.createdAt).substring(0,10)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:12px;padding:5px 8px;" title="送出申請" onclick="rdApplyFromRecord(this.closest('.modal-bg')._records[${i}])">📤</button>
    </div>`).join('')}</div>
    <div class="fe" style="margin-top:10px;"><button class="btn btn-ghost btn-sm" onclick="this.closest('.modal-bg').remove()">取消</button></div>`);
  modal._records = records;
}
```

**④ renderApplyPage 加研發申請區塊：**
```js
async function renderApplyPage(mc) {
  mc.innerHTML = `
  <div class="card" style="margin-bottom:10px;">
    <div class="sec-hd"><div class="card-title" style="margin:0">待審核申請</div>
      <button class="btn btn-ghost btn-sm" onclick="renderApplyPage(document.getElementById('mainContent'))">↻</button></div>
    <div id="applyArea"><div style="text-align:center;color:var(--ink3);padding:18px;font-size:13px;">載入中…</div></div>
  </div>
  <div class="card" style="margin-bottom:10px;"><div class="card-title">審核歷史</div>
    <div id="histArea"><div style="text-align:center;color:var(--ink3);padding:18px;font-size:13px;">載入中…</div></div></div>
  <div class="card" style="margin-bottom:10px;">
    <div class="sec-hd"><div class="card-title" style="margin:0">🔬 研發申請 — 待審核</div></div>
    <div id="rdApplyArea"><div style="text-align:center;color:var(--ink3);padding:18px;font-size:13px;">載入中…</div></div>
  </div>
  <div class="card"><div class="card-title">🔬 研發申請 — 歷史</div>
    <div id="rdHistArea"><div style="text-align:center;color:var(--ink3);padding:18px;font-size:13px;">載入中…</div></div></div>`;
  loadApplies(); loadHistory(); loadRdApplies(); loadRdHistory();
}

async function loadRdApplies() {
  const res = await api({ action:'getRdApplies' });
  const area = document.getElementById('rdApplyArea'); if (!area) return;
  if (!res.ok) { area.innerHTML=`<div class="warn" style="padding:10px;">${res.error}</div>`; return; }
  const list = res.list || [];
  if (!list.length) { area.innerHTML='<div style="text-align:center;color:var(--ink3);padding:18px;font-size:13px;">目前無待審核</div>'; return; }
  area.innerHTML = list.map(a => {
    let ings=[]; try { ings=JSON.parse(a.ingredients||'[]'); } catch(e){}
    let rr={}; try { rr=JSON.parse(a.results||'{}'); } catch(e){}
    const ingPreview = ings.slice(0,4).map(g=>`<span style="margin-right:5px;">• ${g.name||''}${g.type==='compound'?'<span class="cpd-badge" style="vertical-align:middle;margin-left:2px;">複合</span>':''}</span>`).join('') + (ings.length>4?`<span class="sub">…共${ings.length}項</span>`:'');
    return `<div class="card" style="margin-bottom:8px;border-color:var(--yellow);">
      <div class="fb">
        <div><span style="font-weight:600;font-size:13px;">${a.name}</span><span class="badge bg-brown" style="margin-left:5px;">${a.client}</span></div>
        <div class="sub">${a.creator} · ${String(a.createdAt).substring(0,10)}</div>
      </div>
      <div style="margin-top:6px;font-size:12px;color:var(--ink2);">ABV ${nt(rr.abv||0,1)}% · 食材成本 ${fm(rr.totalCost||0)} · 總成本 ${fm(rr.totalAll||0)}</div>
      <div style="margin-top:5px;font-size:12px;line-height:1.8;">${ingPreview}</div>
      ${curUser?.role==='admin'?`<div class="fe mt8" style="gap:6px;">
        <button class="btn btn-success btn-sm" onclick="lockRun(this,()=>doRdReview('${a.id}',true))">✓ 核准</button>
        <button class="btn btn-danger btn-sm" onclick="lockRun(this,()=>doRdReview('${a.id}',false))">✕ 拒絕</button>
      </div>`:''}
    </div>`;
  }).join('');
}

async function loadRdHistory() {
  const res = await api({ action:'getRdHistory' });
  const area = document.getElementById('rdHistArea'); if (!area) return;
  if (!res.ok) { area.innerHTML=`<div class="warn" style="padding:10px;">${res.error}</div>`; return; }
  const list = res.list || [];
  if (!list.length) { area.innerHTML='<div style="text-align:center;color:var(--ink3);padding:18px;font-size:13px;">尚無歷史</div>'; return; }
  area.innerHTML = list.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
    <div class="fb">
      <div>
        <span style="font-weight:500;font-size:13px;">${r.name}</span>
        <span class="badge ${r.status==='已核准'?'bg-green':'bg-red'}" style="margin-left:5px;">${r.status}</span>
        <span class="badge bg-brown" style="margin-left:3px;">${r.client}</span>
      </div>
      <div class="sub">${r.reviewer||''} · ${String(r.reviewedAt||'').substring(0,10)}</div>
    </div>
    ${r.newSheet?`<div class="sub" style="margin-top:3px;">📄 已建分頁：${r.newSheet}</div>`:r.status==='已核准'?`<div class="sub" style="margin-top:3px;color:var(--ink3);">分頁待建（Batch 3）</div>`:''}
  </div>`).join('');
}

async function doRdReview(id, approved) {
  if (!confirm(`確認${approved?'核准此研發申請？（分頁自動建立功能 Batch 3 實作，目前只更新狀態）':'拒絕此研發申請'}？`)) return;
  const res = await api({ action:'reviewRdApply', id, approve:String(approved), reviewer:curUser.username });
  if (res.ok) { toast(approved?'已核准':'已拒絕'); renderApplyPage(document.getElementById('mainContent')); }
  else toast('操作失敗：'+res.error);
}
```

### 22.4 Bug 23：rdLoadOne ingredients JSON string → array（2026-06-15 修正）
- **現象:** 研發試算「📋 載入」功能，載入後原料列表空白或報錯。
- **根因:** `saveRdRecord` 存 `JSON.stringify(rdState.ings)`（字串），`getRdRecords` 回傳也是字串，但 `rdLoadOne` 直接 `rdState.ings = r.ingredients`，未 parse，導致 `rdState.ings.forEach` 報 `TypeError`。
- **錯誤寫法:**
```js
rdState = { ings: r.ingredients||[], ... };  // r.ingredients 是字串，不是 array
```
- **正確寫法:**
```js
let ings = r.ingredients || [];
if (typeof ings === 'string') { try { ings = JSON.parse(ings); } catch(e) { ings = []; } }
rdState = { ings, tv:r.volume||4000, bt:r.bottle||'4L桶', title:r.name||'', client:r.client||'' };
if (!rdState.matSel) rdState.matSel = {};
```
- **驗證方式:** 儲存試算記錄 → 載入 → 原料列表正常顯示，rdCalc 無報錯。

### 22.5 ⏳ Batch 3 接續指引
- **目標:** `reviewRdApply` 核准 → 呼叫 `createRecipeSheet(row)`，複製現有酒譜分頁當樣板，以型態 B 公式寫入原料。
- **最大難點:** 動態列號（母料/子料實際落在第幾列取決於原料數量），需先排版算好所有列號，再組 F 欄公式的 `H{子料列}` 參照。
- **完整規格:** 見第十八章 18.6 + 第二十章 20.3。
- **Batch 3 開始前必讀:** 第十八章（複合原料 Sheet 結構）+ 第二十章（設計決議）+ 第二十一章 21.2（現有 getRecipe 程式碼）。

---

## 二十三、Batch 3 createRecipeSheet — 實作完成記錄（2026-06-15 已上線+實機驗證）

### 23.1 完成狀態
- **GAS:** commit 52ec0c56e9，Actions「Deploy GAS」success 部署完成。
- **驗證:** 送一筆含「一般料+複合料」的研發申請 → 核准 → FB Sheet 新增分頁「FB_Batch3測試酒款」→ getRecipe 回傳原料/成本正確 → getRdHistory 確認 newSheet 欄位回填 ✅。
- **驗證後清理:** 手動刪除測試分頁「FB_Batch3測試酒款」（避免出現在酒譜清單）。

### 23.2 reviewRdApply 修改（啟用 Batch 3 呼叫）

```js
// reviewRdApply 內，原本 // ⏳ Batch 3 佔位處，改為：
if (approve) {
  try {
    var newSheetName = createRecipeSheet(rows[i]);
    ws.getRange(i + 1, 14).setValue(newSheetName);  // N=newSheet 回填
  } catch(e) {
    // 建分頁失敗不影響審核狀態，回傳 warn 讓前端顯示
    return { ok: true, warn: '核准成功但建立分頁失敗: ' + e.message };
  }
}
return { ok: true };
```

前端 `doRdReview` 補接 `warn` 顯示（已在 v10.4 寫好，此處補充）：
```js
async function doRdReview(id, approved) {
  if (!confirm(`確認${approved?'核准此研發申請？（分頁自動建立功能 Batch 3 實作，目前只更新狀態）':'拒絕此研發申請'}？`)) return;
  const res = await api({ action:'reviewRdApply', id, approve:String(approved), reviewer:curUser.username });
  if (res.ok) {
    toast(res.warn ? '已核准（⚠️ ' + res.warn + '）' : (approved?'已核准':'已拒絕'));
    renderApplyPage(document.getElementById('mainContent'));
  } else toast('操作失敗：'+res.error);
}
```

### 23.3 createRecipeSheet 完整 code

```js
// ── Batch 3：建立新酒譜分頁 ──────────────────────────────────
// 從研發申請記錄 row（array）建立新酒譜分頁。
// 流程：複製同客戶第一個酒譜分頁為樣板 → 清除 Row4+ 舊資料
//       → 依「型態 B 公式寫入」規格寫入原料與子料 → 回傳新分頁名稱。
// ⚠️ 動態列號是最大難點：先算好每列最終 row number，再組 H{列} 公式，避免錯位。
function createRecipeSheet(row) {
  var client     = String(row[3]);
  var recipeName = String(row[4]);
  var totalVol   = parseFloat(row[5]) || 4000;
  var abv        = parseFloat(row[7]) || 0;
  var rawIngs    = [];
  try { rawIngs = JSON.parse(String(row[8])); } catch(e) {}

  var ings = normalizeRdIngs(rawIngs, totalVol);
  var cfg  = getClientCfg(client);
  var ss   = SpreadsheetApp.openById(cfg.id);
  var sheets = ss.getSheets();

  // 找樣板（同客戶第一個酒譜分頁）
  var tmpl = null;
  for (var wi = 0; wi < sheets.length; wi++) {
    if (isRecipeSheet(sheets[wi].getName())) { tmpl = sheets[wi]; break; }
  }
  if (!tmpl) throw new Error('找不到可用樣板酒譜分頁（' + client + '）');

  // 推導分頁前綴（從樣板名稱去掉 strip regex）
  var tn      = tmpl.getName();
  var stripped = tn.replace(cfg.strip, '');
  var prefix  = (stripped !== tn) ? tn.slice(0, tn.length - stripped.length) : '';
  var newSheetName = prefix + recipeName;

  // 防重名
  for (var si = 0; si < sheets.length; si++) {
    if (sheets[si].getName() === newSheetName) throw new Error('分頁名稱已存在: ' + newSheetName);
  }

  var ns = tmpl.copyTo(ss);
  ns.setName(newSheetName);

  // ── 動態版面計算（先排版，才能組正確的 H{列} 公式）──
  var N = ings.length;
  var allSubs = collectSubs(ings);
  var S = allSubs.length;
  var hasCompound = S > 0;

  var ING_START      = 4;
  var TOTAL_VOL_ROW  = ING_START + N;
  var SUB_LABEL_ROW  = hasCompound ? TOTAL_VOL_ROW + 1 : -1;
  var SUB_START_ROW  = hasCompound ? TOTAL_VOL_ROW + 2 : -1;
  var TOTAL_COST_ROW = hasCompound ? SUB_START_ROW + S : TOTAL_VOL_ROW + 1;
  var PROC_NOTE_ROW  = TOTAL_COST_ROW + 1;

  // 子料列號 map：決定 H{列} 公式的正確列號
  var subRowMap = {};
  allSubs.forEach(function(sub, i){ subRowMap[sub.name] = SUB_START_ROW + i; });

  // 清除 Row4+ 舊資料（保留 Row1-3 格式）
  var lastRow = ns.getMaxRows();
  if (lastRow >= ING_START) {
    ns.getRange(ING_START, 1, lastRow - ING_START + 1, ns.getMaxColumns()).clearContent();
  }

  // Row2：更新酒款名稱(E2) 與 ABV(I2)
  ns.getRange(2, 5).setValue(recipeName);
  ns.getRange(2, 9).setValue(abv + '%');

  // 母料列（Row4 ~ Row(3+N)）
  ings.forEach(function(ing, idx) {
    var r = ING_START + idx;
    ns.getRange(r, 1).setValue(ing.name);
    ns.getRange(r, 2).setValue(ing.pct / 100);   // B：小數（0.1=10%）
    ns.getRange(r, 3).setValue(ing.vol);
    ns.getRange(r, 4).setValue(ing.abv || 0);

    if (ing.isCompound) {
      // F：=IFERROR((H{r1}*{v1}+H{r2}*{v2})/{totalSubVol}[/0.8],"")
      var terms = (ing.subs || []).map(function(s){
        return 'H' + subRowMap[s.name] + '*' + s.vol;
      });
      var sumPart = terms.length > 1 ? '(' + terms.join('+') + ')' : terms[0];
      ns.getRange(r, 6).setFormula(
        '=IFERROR(' + sumPart + '/' + ing.totalSubVol + (ing.hasLoss ? '/0.8' : '') + ',"")');
      ns.getRange(r, 7).setValue(1);             // G = 1（H = F/1 = per-ml cost）
    } else {
      ns.getRange(r, 6).setValue(ing.price   || 0);
      ns.getRange(r, 7).setValue(ing.unitVol || 0);
    }
    ns.getRange(r, 8).setFormula('=IFERROR(F' + r + '/G' + r + ',"")');  // H
    ns.getRange(r, 9).setFormula('=IFERROR(H' + r + '*C' + r + ',"")');  // I
  });

  // 總體積列
  ns.getRange(TOTAL_VOL_ROW, 1).setValue('總體積');
  ns.getRange(TOTAL_VOL_ROW, 3).setValue(totalVol);
  ns.getRange(TOTAL_VOL_ROW, 4).setValue(abv);

  // 子料區（有複合原料才建）
  if (hasCompound) {
    ns.getRange(SUB_LABEL_ROW, 1).setValue('基礎原料');
    allSubs.forEach(function(sub, i) {
      var r = SUB_START_ROW + i;
      ns.getRange(r, 1).setValue(sub.name);
      ns.getRange(r, 6).setValue(sub.price   || 0);
      ns.getRange(r, 7).setValue(sub.unitVol || 0);
      ns.getRange(r, 8).setFormula('=IFERROR(F' + r + '/G' + r + ',"")');
    });
  }

  ns.getRange(TOTAL_COST_ROW, 1).setValue(totalVol + 'ml版總食材成本');
  ns.getRange(PROC_NOTE_ROW, 1).setValue('製程備註');
  ns.getRange(PROC_NOTE_ROW + 1, 1).setValue('');

  CacheService.getScriptCache().remove('recipeList_v1');
  return newSheetName;
}

// 原料標準化：R&D 試算格式（type='compound'）和酒譜頁格式（isCompound=true）→ 統一格式
function normalizeRdIngs(rawIngs, totalVol) {
  return rawIngs.map(function(ing) {
    if (ing.type === 'compound') {
      var subVol = (ing.subs || []).reduce(function(s, x){ return s + (parseFloat(x.volume)||0); }, 0);
      return {
        name: String(ing.name||''), pct: totalVol>0 ? subVol/totalVol*100 : 0,
        vol: subVol, abv: parseFloat(ing.abv)||0,
        isCompound: true, hasLoss: !!ing.hasLoss, totalSubVol: subVol,
        subs: (ing.subs||[]).map(function(s){
          return { name: String(s.name||''), price: parseFloat(s.price)||0,
                   unitVol: parseFloat(s.unitVol)||0, vol: parseFloat(s.volume)||0 };
        })
      };
    }
    if (ing.isCompound && ing.subMaterials) {
      var ingVol = parseFloat(ing.vol)||parseFloat(ing.volume)||0;
      return {
        name: String(ing.name||''), pct: parseFloat(ing.pct)||parseFloat(ing.ratio)||0,
        vol: ingVol, abv: parseFloat(ing.abv)||0,
        isCompound: true, hasLoss: !!ing.hasLoss, totalSubVol: ingVol,
        subs: (ing.subMaterials||[]).map(function(s){
          var pv = parseFloat(s.packVol)||1;
          return { name: String(s.name||''), price: (parseFloat(s.unitCost)||0)*pv,
                   unitVol: pv, vol: (parseFloat(s.coef)||0)*ingVol };
        })
      };
    }
    return {
      name: String(ing.name||''), pct: parseFloat(ing.ratio)||parseFloat(ing.pct)||0,
      vol: parseFloat(ing.volume)||parseFloat(ing.vol)||0,
      abv: parseFloat(ing.abv)||0,
      isCompound: false, hasLoss: !!ing.hasLoss,
      price: parseFloat(ing.price)||0, unitVol: parseFloat(ing.unitVol)||0, subs: []
    };
  });
}

// 從所有複合母料收集子料，依名稱去重（先出現者優先）
function collectSubs(normalizedIngs) {
  var seen = {}, result = [];
  normalizedIngs.forEach(function(ing) {
    if (!ing.isCompound) return;
    (ing.subs||[]).forEach(function(s) {
      if (!seen[s.name]) { seen[s.name]=true; result.push({name:s.name,price:s.price,unitVol:s.unitVol}); }
    });
  });
  return result;
}
```

### 23.4 版面計算公式（關鍵，不可搞錯列號）

```
母料起始行:      ING_START = 4
母料 idx=0:      Row 4
母料 idx=N-1:    Row 3+N
總體積:          Row 4+N
基礎原料標題:    Row 5+N  (只有有複合料才存在)
子料 idx=0:      Row 6+N
子料 idx=S-1:    Row 5+N+S
總食材成本:      Row 6+N+S  (有複合) / Row 5+N (無複合)
製程備註:        總食材成本+1
```

> ⚠️ **複合母料 F 欄公式格式（2026-06-15 實機驗證）：**
> `=IFERROR((H{subRow1}*{vol1}+H{subRow2}*{vol2})/{totalSubVol}[/0.8],"")`
> 用絕對子料體積當係數、除以子料總體積 → 等效每ml成本。
> getRecipe 解析時 coef 值 = 子料體積（非每ml比例），但成本計算結果正確（已實機驗證）。

### 23.5 已知設計限制（下一輪可改進）
- **同名子料去重（collectSubs）:** 不同複合母料的同名子料共用一列，若 price/unitVol 不同時以「先出現者」為準。屬邊界情況，實際酒譜不常見。
- **G=1 for 複合母料:** 母料 G 欄固定填 1（使 H=F=per-ml cost）。與現有 Sheet 格式略有差異（現有 Sheet 可能 G 欄為空），但 getRecipe 計算結果正確。
- **A-3 子料調整納入申請:** 尚未實作；酒譜頁複合料調整後送審，子料 coef 打包進申請記錄，核准後 createRecipeSheet 可精確還原複合結構。


---

## 二十四、QC 全功能掃描報告 + 修正記錄（2026-06-15）

### 24.1 掃描方法
三層：靜態程式碼審查（GAS 980 行 + 前端 1622 行）→ GAS API 實機打值 → Chrome UI 互動驗證。

### 24.2 驗證通過功能（無問題）
四家客戶酒譜清單 60 款、getRecipe 含複合料（pct 加總 100%）、四家毛利分析（warnCount=0）、原料庫 254 筆、製作記錄 CRUD 欄位 18 欄對齊、研發申請四個 action、rdLoadOne JSON parse 修正、離線快取、lockRun 防連點、占比送出二次確認、毛利欄位健檢。

### 24.3 已修正的程式碼 Bug（commit 39c2603a52，前端 v9.9）

**Bug QC-1：doRdReview — res.warn 未顯示 [HIGH]**
- 現象：createRecipeSheet 失敗時 GAS 回傳 `{ok:true, warn:'...'}` 但前端完全不處理 warn，用戶看到「已核准」實際分頁沒建成。
- 錯誤寫法：`if (res.ok) { toast(approved?'已核准':'已拒絕'); ... }`
- 正確寫法：`if (res.warn) toast('⚠️ 已核准，但建立分頁失敗：' + res.warn); else toast(approved?'已核准，新分頁已建立':'已拒絕');`

**Bug QC-2：rdApplyFromRecord — 雙 modal 堆疊 [MEDIUM]**
- 現象：rdLoadList modal 開著點 📤 → showRdApplyModal 再疊一個 modal，關掉送審表單後 rdLoadList 仍在背景。
- 正確寫法：`rdApplyFromRecord` 開頭加 `document.querySelector('.modal-bg')?.remove();`

**Bug QC-3：loadRdApplies — compound badge 漏認酒譜頁格式 [LOW]**
- 現象：從酒譜頁送的研發申請（isCompound=true 格式），審核頁的「複合」badge 不顯示。
- 錯誤寫法：`g.type==='compound'`
- 正確寫法：`(g.type==='compound'||g.isCompound)`

**Bug QC-4：doRdReview — confirm 對話框文字過時 [LOW]**
- 現象：確認框仍顯示「分頁自動建立功能 Batch 3 實作，目前只更新狀態」，Batch 3 已上線。
- 正確寫法：`'核准此研發申請？核准後將自動建立新酒譜分頁。'`

**Bug QC-5：doRdReview — 核准後前端 recipeList 不自動更新 [MEDIUM]**
- 現象：GAS cache 已清，但前端 recipeList 未重整，新酒款不出現在下拉選單，需手動 ↻。
- 正確寫法：`if (approved && !res.warn) doRefresh();`

### 24.4 完整修正後的 doRdReview + rdApplyFromRecord code

```js
async function doRdReview(id, approved) {
  if (!confirm(`確認${approved?'核准此研發申請？核准後將自動建立新酒譜分頁。':'拒絕此研發申請？'}？`)) return;
  const res = await api({ action:'reviewRdApply', id, approve:String(approved), reviewer:curUser.username });
  if (res.ok) {
    if (res.warn) toast('⚠️ 已核准，但建立分頁失敗：' + res.warn);
    else toast(approved ? '已核准，新分頁已建立' : '已拒絕');
    renderApplyPage(document.getElementById('mainContent'));
    if (approved && !res.warn) doRefresh();  // 核准後重整酒譜清單
  } else toast('操作失敗：'+res.error);
}

async function rdApplyFromRecord(r) {
  if (!r) return;
  document.querySelector('.modal-bg')?.remove();  // 關閉 rdLoadList modal
  let parsedResults = {};
  try { parsedResults = JSON.parse(r.results||'{}'); } catch(e) {}
  showRdApplyModal({ name: r.name||'', client: r.client||'' }, async (name, client) => {
    const res = await api({ action:'submitRdApply', creator:curUser.username, client, name,
      volume:r.volume||0, bottle:r.bottle||'', abv:parsedResults.abv||0,
      ingredients:r.ingredients||'[]', results:r.results||'{}' });
    if (res.ok) toast('研發申請已送出！');
    else toast('送出失敗：'+(res.error||''));
  });
}
```

### 24.5 待清理資料問題（Molly 手動）

**QC-D1：`FB_` 空名分頁 = 炭焙栗子奶酒重複（高優先）**
- FB Sheet 有 tab 名為 `FB_`（含炭焙栗子奶酒資料），加上正確的 `FB_炭焙栗子奶酒` tab，導致酒譜下拉出現**兩個「炭焙栗子奶酒」**。
- 處理：在 FB_酒譜資料庫 Google Sheet 中刪除名為 `FB_` 的分頁（保留 `FB_炭焙栗子奶酒`）。

**QC-D2：`FB_Batch3測試酒款` 未清除（低優先）**
- 處理：在 FB_酒譜資料庫 Google Sheet 中刪除 `FB_Batch3測試酒款` 分頁。

---

## 第二十五章：實際操作 5 項修正（v10.7）

> 本章記錄 Molly 實際使用時發現的問題，全部已於 2026-06-15 修正並實機驗證。

### 25.1 待清理資料（延續 v10.6 QC-D1/D2，Molly 手動）

同 24.5 — FB_ 空名分頁、FB_Batch3測試酒款 尚未清理，持續待辦。

---

### Bug 23：毛利分析「食材成本」永遠顯示 NT$0 + 總成本有小數

**現象：**
毛利分析卡片顯示「食材成本 NT$0」，且總成本/毛利顯示到小數（NT$740.7、NT$909.3）。

**根因：**
FB 毛利分析 Sheet 欄位只有 A=酒款、B=售價、C=容量、D=4L總成本，**沒有「食材成本」獨立欄位**。GAS `getProfitData` 只回傳 `totalCostTax`，前端卻渲染 `d.ingredientCost`（undefined → NT$0）。總成本有小數是因為 `fm()` 保留兩位小數。

**錯誤寫法：**
```js
// GAS 從未回傳 ingredientCost
<div class="pm-row"><span>食材成本</span><span>${fm(d.ingredientCost)}</span></div>
<div class="pm-row"><span>總成本(含稅)</span><span>${fm(d.totalCostTax)}</span></div>
<div class="pm-row"><span>毛利</span><span class="pv">${fm(d.profit)}</span></div>
```

**正確寫法：**
```js
// 移除「食材成本」列（Sheet 無此欄），總成本/毛利整數顯示
<div class="pm-row"><span>總成本</span><span>NT$${Math.round(d.totalCostTax)}</span></div>
<div class="pm-row"><span>毛利</span><span class="pv">NT$${Math.round(d.profit)}</span></div>
<div class="pm-row"><span>毛利率</span><span style="font-weight:600;">${nt(rate,1)}%</span></div>
```

**驗證方式：**
進入毛利分析頁 → Feeling Bar → 確認無「食材成本」列，總成本顯示整數（NT$741 非 NT$740.7）。

---

### Bug 24：研發試算複合材料缺子料占比輸入欄位

**現象：**
研發試算頁的複合材料子料列只有「用量ml」輸入，沒有「占比%」欄位。釀酒師無法直接看到/修改各子料比例，只能靠 ml 輸入。Batch 1 只做了酒譜頁的子料調整，R&D 頁未同步。

**根因：**
`rdRender` 的複合子料模板只有 `rsv_{i}_{pi}`（用量ml）輸入，無占比%欄。

**錯誤寫法：**
```js
const subsHtml = (ing.subs||[]).map((s,pi) => {
  const sr = `rdState.ings[${i}].subs[${pi}]`;
  return `<div class="sub-row">
    <div class="sd-name">${s.name}</div>
    <div class="if"><label>用量ml</label><input ... id="rsv_${i}_${pi}" oninput="${sr}.volume=...;rdCalc()"></div>
    <div>${fm(rdCpm(s)*(s.volume||0))}</div>
    <button ...>✕</button>
  </div>`;
}).join('');
```

**正確寫法：**
```js
const _csvTot = (ing.subs||[]).reduce((t,s)=>t+(s.volume||0),0);
const subsHtml = (ing.subs||[]).map((s,pi) => {
  const sr = `rdState.ings[${i}].subs[${pi}]`;
  const _pct = _csvTot>0 ? ((s.volume||0)/_csvTot*100).toFixed(1) : '0.0';
  return `<div class="sub-row">
    <div class="sd-name">${s.name}</div>
    <div class="if"><label>占比%</label><input type="number" value="${_pct}" id="rsr_${i}_${pi}"
      oninput="rdSubRatio(${i},${pi},parseFloat(this.value)||0)" style="width:55px;"></div>
    <div class="if"><label>用量ml</label><input type="number" value="${s.volume||''}" id="rsv_${i}_${pi}"
      oninput="${sr}.volume=parseFloat(this.value)||0;rdSubVolUpdate(${i});rdCalc()" style="width:65px;"></div>
    <div id="rsvc_${i}_${pi}">${fm(rdCpm(s)*(s.volume||0))}</div>
    <button ...>✕</button>
  </div>`;
}).join('');

// 新增輔助函數（占比% → ml 互轉）
function rdSubRatio(ii, pi, ratio) {
  const subs = rdState.ings[ii]?.subs; if (!subs) return;
  const otherVol = subs.reduce((t,s,i)=>t+(i!==pi?(s.volume||0):0),0);
  let newVol = ratio<=0 ? 0 : ratio>=100 ? otherVol*99 : ratio/(100-ratio)*otherVol;
  newVol = Math.round(newVol);
  if (subs[pi]) subs[pi].volume = newVol;
  const ve = document.getElementById('rsv_'+ii+'_'+pi);
  if (ve) ve.value = newVol;
  rdSubVolUpdate(ii); rdCalc();
}
function rdSubVolUpdate(ii) {
  const subs = rdState.ings[ii]?.subs; if (!subs) return;
  const tot = subs.reduce((t,s)=>t+(s.volume||0),0);
  subs.forEach((s,pi)=>{
    const re = document.getElementById('rsr_'+ii+'_'+pi);
    if (re) re.value = tot>0 ? ((s.volume||0)/tot*100).toFixed(1) : '0.0';
  });
}
```

**驗證方式：**
研發試算 → + 複合原料 → 加入兩個子料 → 設 ml（例如 300 / 700） → 占比% 自動顯示 30.0 / 70.0。修改占比% → ml 自動更新，成本即時重算。

---

### Bug 25：製作記錄無刪除功能

**現象：**
製作記錄列表只能新增、編輯，admin 無法刪除錯誤記錄。

**根因：**
`renderBatchList` 的行模板無刪除按鈕，GAS 也沒有 `deleteBatchRecord` action。

**錯誤寫法：**
```js
// GAS doGet：無 deleteBatchRecord
// 前端：無刪除按鈕，表頭無第三欄
```

**正確寫法（GAS）：**
```js
// doGet case 新增：
case 'deleteBatchRecord': result = deleteBatchRecord(p); break;

// 函數：
function deleteBatchRecord(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('製作記錄');
  if (!ws) return { ok: false, error: '找不到製作記錄分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(p.id)) {
      ws.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到記錄 id: ' + p.id };
}
```

**正確寫法（前端）：**
```js
// 行模板中加刪除按鈕（admin only）
${curUser?.role==='admin'?`<td style="width:36px;padding:4px;">
  <button class="del-btn" title="刪除" onclick="event.stopPropagation();batchDel('${r.id}')">🗑</button>
</td>`:'<td></td>'}

// batchDel 函數：
async function batchDel(id) {
  if (!confirm('確定要刪除這筆製作記錄？此動作無法復原。')) return;
  const res = await api({ action:'deleteBatchRecord', id });
  if (res.ok) { toast('已刪除'); C.batch=null; renderBatchPage(); }
  else toast('刪除失敗：'+(res.error||''));
}
```

**驗證方式：**
以 admin（Molly/Kevin）登入 → 製作記錄 → 確認每行右側有 🗑 按鈕 → 點擊後出現確認對話框 → 確認後記錄消失並重整列表。

---

### Bug 26：酒譜頁複合原料成本計算差 batchVol 倍（最嚴重）⚠️

**現象：**
在酒譜頁修改複合原料的子料係數後，子料的個別成本顯示正確，但母料的總成本**嚴重偏高**（實測差 103× 或 60×）。

| 複合料 | 正確成本 | 錯誤計算 | 倍差 |
|---|---|---|---|
| 全祥/一海香鐵觀音58%高粱 | NT$243 | NT$25,000 | 103× |
| 開元濃縮柳橙汁 | NT$45 | NT$2,688 | 60× |

**根因：**
複合原料的 F 欄公式 `=IFERROR((H14*1+H17*2+H15*100)/0.8,"")` 算出的是「每 G_parent ml 批次的子料總成本」，而非「每 1ml 的成本」。要得到每 ml 成本，必須除以 G 欄（`batchVol`，即 Sheet 中複合母料的 G 欄值）。

`getRecipe` 未回傳 `batchVol`，`recalcCompound` 直接用 `perMl * vol`（`perMl` 實際是整批成本不是每ml），導致結果放大 batchVol 倍。

**G 欄推算驗算：**
- 複合料1 F值 = 62.5，G值 = 103（= totalSubVol = 1+2+100），H = 62.5/103 = 0.6068，I = 0.6068×400 = 243 ✓
- 複合料2 F值 = 4.479，G值 = 60，H = 4.479/60 = 0.07465，I = 0.07465×600 = 45 ✓

**錯誤寫法（前端 recalcCompound）：**
```js
let perMl = 0;
(ing.subMaterials || []).forEach((s, si) => {
  const coef = parseFloat(document.getElementById('cs_'+idx+'_'+si)?.value) || 0;
  s.coef = coef;
  s.contrib = coef * (s.unitCost || 0);
  perMl += s.contrib;
});
if (ing.hasLoss) perMl = perMl / 0.8;
const vol = parseFloat(document.getElementById('rv_'+idx)?.value) || ing.vol || 0;
const cost = perMl * vol;  // ❌ perMl 是批次總成本，不是每ml成本
```

**正確寫法（GAS getRecipe + 前端 recalcCompound）：**
```js
// GAS getRecipe：複合母料多回傳 batchVol（G 欄 index 6）
if (cpd.isCompound) {
  ing.isCompound = true;
  ing.hasLoss = cpd.hasLoss;
  ing.subMaterials = cpd.subMaterials;
  ing.batchVol = parseFloat(data[i][6]) || 1; // ← 新增：G欄批次容量
}

// 前端 recalcCompound：除以 batchVol
if (ing.hasLoss) perMl = perMl / 0.8;
const batchVol = ing.batchVol || 1;  // ← 新增
const vol = parseFloat(document.getElementById('rv_'+idx)?.value) || ing.vol || 0;
const cost = (perMl / batchVol) * vol;  // ← 修正：先除以 batchVol
```

**⚠️ 邊界情況：**
- `batchVol = 1`：`createRecipeSheet` 建立的新酒譜，G 欄 = 1（F 欄公式直接等於 per-ml 成本），除以 1 無影響。
- `recalcFromTv` 和 `recalcRecipe` 使用 `origCost/origVol` 推算每ml成本，不受此 bug 影響（已從 Sheet I/C 欄推導，始終正確）。

**驗證方式：**
API 呼叫 `getRecipe` 取島嶼鳳梨冰茶 → 確認 ingredients[*].batchVol 有值（103/60） → `calcCost = Σ(coef×unitCost)/0.8/batchVol×vol` 計算結果 = Sheet I 欄值（243/45）。

---

### Bug 27：桌機版面 #mainContent 寬度縮成內容寬（profit-grid 退化為 1 欄）

**現象：**
毛利分析頁在桌機（1525px 瀏覽器）顯示時，每行只顯示一張酒款卡片，嚴重浪費空間。實測 `mcWidth = 245px`（應為 1000px）、`profitGridWidth = 160px`（應為 936px+）。

**根因：**
`#mainContent` 是 `#app`（`flex-direction:column`）的 flex 子元素，有 `margin:0 auto`。在 flex column 容器中，若子元素不設 `width`，`align-items:normal`（等效 stretch）被 `margin:0 auto` 的 auto margin **覆蓋**，元素縮成其內容寬。`max-width:1000px` 只設上限，不設實際寬度。

計算確認：實測 `margin = 0px 639.621px`（左右各 639px），但應為 `(1525-1000)/2 = 262px`，因為元素實際寬度是 1525-639×2 = 246px（≠ 1000px）。

**錯誤寫法：**
```css
@media(min-width:768px){
  #mainContent{padding:18px;max-width:1000px;margin:0 auto;}  /* 缺少 width:100% */
}
```

**正確寫法：**
```css
@media(min-width:768px){
  body{font-size:14px;}
  #mainContent{padding:18px;max-width:1000px;margin:0 auto;width:100%;}  /* ← 加 width:100% */
  #navbar{justify-content:center;}
  .nav-tab{max-width:100px;}
  .profit-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}  /* ← 桌機加大卡片 */
}
```

`width:100%` 在 flex 子元素中 = parent width（1525px），`max-width:1000px` 截為 1000px，`margin:0 auto` 置中（左右各 262px）。

**驗證方式：**
桌機載入系統 → 進入毛利分析 → 確認每行顯示 4 張以上酒款卡片，`mcWidth = 1000`、`gridColumns` 包含 `221px` 欄寬。

---

### 25.2 本輪修正的部署記錄

- **commit（前端）**：fix: Issues 1-5 — profit display, R&D sub-ratio, batch delete, compound batchVol, responsive layout
- **commit（GAS）**：fix: GAS – batchVol for compound ingredients (Issue 4) + deleteBatchRecord (Issue 3)
- **Actions**：兩個 jobs 均 `completed success`，GitHub Pages 已更新

---

### 25.3 下一步待辦

1. **A-3**（原本排程）：酒譜頁複合子料調整後打包進申請記錄（前端+GAS 小改）
2. **Issue 3 補充**：確認 Molly「製作記錄功能」是否還有其他需求（刪除已實作，是否有其他？）
3. **安全性**：GitHub Token 改存 Secrets（暫緩，下一個好時間點）
4. **Phase 3**：等待客戶實際使用回饋後再規劃

---

## 第二十六章：Phase C 訂單系統 — 完整 as-built（v10.8，2026-06-16 全套上線+實機驗證）

> 前台網頁訂單系統 → 串接 APP，調酒師選訂單後直接看到酒譜製作。
> **全套已上線並實機驗證**：前台 order.html、後端 5 支 API、APP 調酒師「製作任務」頁。
> 設計起點見第二十五章前的 Phase C 規格；本章為實際完成記錄，程式碼可直接複製。

### 26.0 狀態總覽

| 元件 | 位置 | 狀態 |
|---|---|---|
| 前台訂單表單 | `order.html`（recipe repo 根目錄 → Pages） | ✅ 上線 https://mollylin-coding.github.io/recipe/order.html |
| 後端 5 支 API | `gas/程式碼.gs` | ✅ 上線 |
| 調酒師「製作任務」頁 | `index.html`（APP 第 7 個頁籤 🍸） | ✅ 上線 |
| 訂單主表 | 主資料庫 `1rXmA0…` | ✅ 已建（11 欄） |
| 製作記錄 | 主資料庫 `1rXmA0…` | ✅ 18 欄（F=orderId 即關聯訂單編號） |

部署 commit：
- GAS：`feat(Phase C): add getClientRecipeList + getRecipeForProduction`、`feat(Phase C): add createOrder + getOrders + completeOrderItem`
- 前台：`feat(Phase C): add order.html front-end`
- APP：`feat(Phase C): add 製作任務 bartender page`

### 26.1 設計決議（Molly 2026-06-15/16 拍板）

1. 前台客戶用**下拉**綁四家（FB/南坡萬公版/Feeling Bar Cafe/南坡萬v.2），不可自由打字。
2. 酒款下拉**連動客戶**，只顯示該客戶 Sheet 既有酒譜（`getClientRecipeList`）。
3. 調酒師選訂單 → **直接跳該客戶酒款酒譜製作**。
4. **成本欄 F/H/I 在 GAS 端就剔除**（cost/tax/ingredientCost/子料 unitCost·contrib），調酒師端拿不到。
5. 酒譜看**正式版**（Sheet 現值），不碰研發申請暫存。
6. 全客製酒款由管理員綁定酒譜分頁名；未綁定顯示「未綁酒譜」。
7. 製作狀態做在**每款酒 item 層級**（存於酒款明細 JSON 的 status）；訂單主表 I 欄為整單彙總。
8. **訂單完成回報 = 製作記錄建立入口（共用同一筆）**，不做平行完成記錄；製作記錄 F 欄=關聯訂單編號。
9. 整單用量**照原值等比放大，耗損 /0.8 不自動加**（hasLoss 僅作旗標顯示）。

### 26.2 兩張 Sheet Schema（實機確認）

**訂單主表（主資料庫，11 欄）**
```
A訂單編號 B客戶名稱 C訂單類型 D出貨日 E酒款明細(JSON) F總金額 G尾款 H訂金狀態 I製作狀態 J PM K建立時間
```
- 訂單編號格式 `NPW-YYYYMMDD-NNN`（依建立時間，見 `_genOrderNo`）。
- E 酒款明細 JSON：`[{product, sheet, volume, bottleType, qty, status, batchId}]`，status 預設「待製作」，完成時填 batchId。
- I 製作狀態：待製作 / 製作中 / 已完成（由 item 彙總）。

**製作記錄（主資料庫，18 欄 A–R，沿用既有 addBatchRecord 不變）**
```
A記錄ID B建立時間 C建立者 D客戶 E PM(製作人) F關聯訂單編號 G酒款 H製作日期 I出貨日 J製作體積ml K瓶型 L瓶蓋 M前標 N後標 O裝瓶數 P代工費含稅 Q食材報價每瓶 R備註
```
- ⚠️ **F 欄本來就是 orderId**，即「關聯訂單編號」；不需另加欄。完成回報寫此欄連回訂單。

### 26.3 整單用量換算公式（C 欄=批次實際體積）

```
批次總體積 = 酒譜「總體積」列 C 欄值
訂單成品總量 = 規格(ml) × 訂單瓶數
放大倍率 = 訂單成品總量 ÷ 批次總體積
整單某原料用量 = 該原料 C 欄 × 放大倍率   （複合料子料同倍率；固體單位保留 g）
```

### 26.4 後端 5 支 API 完整程式碼（gas/程式碼.gs，可直接複製）

doGet 路由 case：
```js
case 'getClientRecipeList':    result = getClientRecipeList(p); break;
case 'getRecipeForProduction': result = getRecipeForProduction(p); break;
case 'createOrder':            result = createOrder(p); break;
case 'getOrders':              result = getOrders(p); break;
case 'completeOrderItem':      result = completeOrderItem(p); break;
```

函式本體：
```js
// ── Phase C 訂單系統：調酒師酒譜製作 API（唯讀，成本欄一律過濾）──────
// 規格起點見接手文件第二十五章。決議：
//   #2 酒款下拉連動該客戶 Sheet 既有酒譜
//   #3 調酒師選訂單→跳該客戶酒譜製作
//   #4 成本欄 F/H/I 在 GAS 端就剔除（cost / tax / ingredientCost / 子料 unitCost·contrib），前端拿不到
//   #5 看正式版（Sheet 現值），不碰研發申請暫存
//   #9 整單用量照原值等比放大，耗損 /0.8 不自動加（hasLoss 僅作旗標顯示）
function _round(n, d) { const m = Math.pow(10, d || 0); return Math.round((Number(n) || 0) * m) / m; }

// 決議 #2：選客戶後，酒款下拉只列該客戶 Sheet 既有酒譜分頁
function getClientRecipeList(p) {
  const client = p.client;
  if (!client) return { ok: false, error: '缺少 client' };
  getClientCfg(client); // 未知客戶直接擋下
  const all = getRecipeList(); // 沿用既有快取（recipeList_v1）
  const list = (all.list || []).filter(function(r) { return r.client === client; });
  return { ok: true, client: client, list: list };
}

// 決議 #3#4#9：調酒師選訂單後，取該款酒譜製作（過濾成本、整單放大、子料展開為配方比例）
//   參數：client(客戶) sheet(酒譜分頁名) volume(規格 ml，如 "100ml") qty(訂單瓶數)
function getRecipeForProduction(p) {
  const client = p.client, sheet = p.sheet;
  const volume = parseFloat(String(p.volume || '').replace(/[^\d.]/g, '')) || 0;
  const qty = parseInt(p.qty, 10) || 0;
  if (!client || !sheet) return { ok: false, error: '缺少 client 或 sheet' };
  if (volume <= 0 || qty <= 0) return { ok: false, error: '規格或瓶數無效' };

  // 沿用既有 getRecipe（已正確解析複合料子料，第十八章），再做成本過濾與放大
  const r = getRecipe({ client: client, sheet: sheet });
  if (!r.ok) return r;
  if (!r.totalVol || r.totalVol <= 0) {
    return { ok: false, error: '此酒譜未設定「總體積」，無法換算整單用量' };
  }

  const orderTotalMl = volume * qty;     // 訂單成品總量
  const scale = orderTotalMl / r.totalVol; // 放大倍率（決議 25.3 公式）

  const ingredients = (r.ingredients || []).map(function(ing) {
    const o = {
      name: ing.name,
      abv: ing.abv,
      perBatchVol: _round(ing.vol, 1),       // 單批用量(參考)
      orderVol: _round(ing.vol * scale, 1)   // 整單用量
    };
    if (ing.isCompound) {
      o.isCompound = true;
      o.hasLoss = ing.hasLoss;               // 旗標顯示用，用量不自動加耗損(決議 #9)
      // 子料只給「配方比例」coef（=預調比例，調酒師要的）；剔除 unitCost / contrib 成本
      o.subMaterials = (ing.subMaterials || []).map(function(s) {
        return { name: s.name, ratio: s.coef };
      });
    }
    return o;
  });

  return {
    ok: true,
    recipeName: r.recipeName,
    client: client,
    sheet: sheet,
    abv: r.abv,                 // ABV 非成本，可顯示(供調酒師判斷酒體)
    batchTotalVol: r.totalVol,  // 批次總體積
    orderTotalMl: orderTotalMl, // 整單成品總量
    bottles: qty,
    bottleVol: volume,
    scaleFactor: _round(scale, 3),
    processNote: r.processNote, // 製程備註(製作說明，調酒師需要)
    ingredients: ingredients
    // ⚠️ 刻意不回傳：ingredientCost / tax / 各原料 cost / 子料 unitCost·contrib
    //    成本機密只在 admin 酒譜/毛利頁顯示(決議 #4)
  };
}

// ── Phase C 訂單系統：訂單寫入 / 讀取 / 完成回報 ──────────────────
// 訂單主表(主資料庫)11 欄：
//   A訂單編號 B客戶名稱 C訂單類型 D出貨日 E酒款明細(JSON) F總金額 G尾款 H訂金狀態 I製作狀態 J PM K建立時間
// 製作狀態：per-item 存於 E 的 JSON(status)，I 欄為整單彙總(全完成→已完成，否則製作中)。

function _genOrderNo(ws) {
  const now = new Date();
  const datePart = '' + now.getFullYear()
    + ('0' + (now.getMonth() + 1)).slice(-2)
    + ('0' + now.getDate()).slice(-2);
  const prefix = 'NPW-' + datePart + '-';
  const data = ws.getDataRange().getValues();
  let maxSeq = 0;
  for (let i = 1; i < data.length; i++) {
    const no = String(data[i][0] || '');
    if (no.indexOf(prefix) === 0) {
      const seq = parseInt(no.slice(prefix.length), 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return prefix + ('00' + (maxSeq + 1)).slice(-3);
}

// 前台送單
function createOrder(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  if (!p.client) return { ok: false, error: '缺少客戶' };
  getClientCfg(p.client); // 未知客戶擋下(對應酒譜 Sheet)
  let items;
  try { items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []); }
  catch (e) { return { ok: false, error: '酒款明細 JSON 解析失敗' }; }
  if (!items || !items.length) return { ok: false, error: '訂單至少要有一款酒' };
  items = items.map(function (it) {
    return {
      product: it.product || '', sheet: it.sheet || '', volume: it.volume || '',
      bottleType: it.bottleType || '', qty: Number(it.qty) || 0,
      status: it.status || '待製作'
    };
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const orderNo = _genOrderNo(ws);
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    ws.appendRow([orderNo, p.client, p.orderType || '', p.deliveryDate || '',
      JSON.stringify(items), Number(p.total) || 0, Number(p.balance) || 0,
      p.depositStatus || '', '待製作', p.pm || '', now]);
    return { ok: true, orderNo: orderNo };
  } finally { lock.releaseLock(); }
}

// 讀訂單；view='bartender' → 過濾金額/訂金、只回未完成、依出貨日排序
function getOrders(p) {
  const view = p && p.view;
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: true, orders: [] };
  const data = ws.getDataRange().getValues();
  const orders = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    let items = [];
    try { items = r[4] ? JSON.parse(r[4]) : []; } catch (e) { items = []; }
    const base = {
      orderNo: String(r[0]), client: String(r[1]), orderType: String(r[2]),
      deliveryDate: String(r[3]), items: items, status: String(r[8] || '').trim(),
      pm: String(r[9] || ''), createdAt: String(r[10] || '')
    };
    if (view === 'bartender') {
      if (base.status === '已完成') continue; // 不回完成單
      base.items = items.map(function (it) {
        return {
          product: it.product, sheet: it.sheet, volume: it.volume,
          bottleType: it.bottleType, qty: it.qty, status: it.status || '待製作'
        };
      });
      orders.push(base); // 刻意不含 total/balance/depositStatus(決議：調酒師不看金額)
    } else {
      base.total = Number(r[5]) || 0;
      base.balance = Number(r[6]) || 0;
      base.depositStatus = String(r[7] || '');
      orders.push(base);
    }
  }
  if (view === 'bartender') {
    orders.sort(function (a, b) { return (a.deliveryDate || '').localeCompare(b.deliveryDate || ''); });
  }
  return { ok: true, orders: orders };
}

// 完成回報：共用 addBatchRecord 寫一筆製作記錄(F欄=關聯訂單編號)，再更新訂單主表 item 狀態
function completeOrderItem(p) {
  const orderNo = p.orderNo;
  const idx = parseInt(p.itemIndex, 10);
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  if (isNaN(idx)) return { ok: false, error: '缺少 itemIndex' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = ws.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(orderNo)) { rowIdx = i; break; }
    }
    if (rowIdx < 0) return { ok: false, error: '找不到訂單: ' + orderNo };
    const r = data[rowIdx];
    const client = String(r[1]), deliveryDate = String(r[3]);
    let items;
    try { items = JSON.parse(r[4] || '[]'); } catch (e) { return { ok: false, error: '酒款明細解析失敗' }; }
    if (idx < 0 || idx >= items.length) return { ok: false, error: 'itemIndex 超出範圍' };
    const item = items[idx];
    // 1) 寫製作記錄(共用同一筆；addBatchRecord 不變，18 欄、F=orderId)
    const today = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }).split(' ')[0];
    const batch = addBatchRecord({
      creator: p.creator || p.pm || '', client: client, pm: p.pm || p.creator || '',
      orderId: orderNo, recipe: item.product, date: today, deliveryDate: deliveryDate,
      volume: (parseFloat(item.volume) || item.volume),
      bottle: (p.bottle || item.bottleType || ''),
      cap: p.cap || '', frontLabel: p.frontLabel || '', backLabel: p.backLabel || '',
      bottleCount: (Number(p.bottleCount) || item.qty || 0),
      laborCost: (p.laborCost != null && p.laborCost !== '' ? Number(p.laborCost) : ''),
      ingredientQuote: (p.ingredientQuote != null && p.ingredientQuote !== '' ? Number(p.ingredientQuote) : ''),
      note: p.note || ''
    });
    if (!batch.ok) return batch;
    // 2) 更新 item 狀態 + 整單彙總
    items[idx].status = '完成';
    items[idx].batchId = batch.id;
    const allDone = items.every(function (it) { return it.status === '完成'; });
    const orderStatus = allDone ? '已完成' : '製作中';
    ws.getRange(rowIdx + 1, 5).setValue(JSON.stringify(items)); // E 酒款明細
    ws.getRange(rowIdx + 1, 9).setValue(orderStatus);           // I 製作狀態
    return { ok: true, batchId: batch.id, orderStatus: orderStatus, item: item.product };
  } finally { lock.releaseLock(); }
}
```

### 26.5 前台 order.html（client→酒款 連動）

- API 用既有 `api()` GET 方式（與 APP 同源 https://mollylin-coding.github.io/recipe/，無 CORS）。
- 客戶下拉 change → `loadClientRecipes()` → 刷新所有酒款下拉（option value = sheet 名）。
- 送出 → `createOrder`（items 帶 sheet/bottleType/status:'待製作'）。

```js
async function loadClientRecipes(){
  const client=$("#custName").value;
  clientRecipes=[];
  if(client){
    const r=await api({action:"getClientRecipeList",client});
    if(r.ok) clientRecipes=(r.list||[]).map(x=>({recipeName:x.recipeName||x.sheet, sheet:x.sheet}));
    else toast("讀取酒譜失敗："+(r.error||""));
  }
  document.querySelectorAll(".item-row .it-prod").forEach(sel=>{
    const cur=sel.value;
    sel.innerHTML='<option value="">— 選擇酒款 —</option>'+prodOptions(cur);
  });
}
```

### 26.6 APP 調酒師「製作任務」頁（index.html）

- 導覽列第 7 頁籤 `data-tab="order"`（🍸 製作任務），switchTab map 加 `order:renderOrderPage`。
- `renderOrderPage` → `loadOrderTasks`（`getOrders view=bartender`，過濾金額、只回未完成、依出貨日排序）。
- 點 item → `openTaskRecipe`（`getRecipeForProduction`）→ 顯示整單放大用量+複合子料比例+製程備註，**無成本欄**。
- 「完成」→ `doCompleteTask`：算代工費 → `completeOrderItem`（共用 addBatchRecord 寫製作記錄）→ 刷新。

代工費公式（與既有 BSPEC 一致）：`代工費 = 裝瓶數 × (spec.labor + (前標?1.5:0) + (後標?1.5:0))`

```js
async function doCompleteTask(oi,ii){
  const o = window._orderTasks[oi]; const it = o.items[ii];
  const count = parseInt(document.getElementById('ot_cnt').value,10) || it.qty;
  const bt = document.getElementById('ot_bt').value;
  const front = document.getElementById('ot_front').checked;
  const back = document.getElementById('ot_back').checked;
  const note = document.getElementById('ot_note').value;
  const spec = BSPEC[bt] || {};
  const labor = count * ((spec.labor||0) + (front?1.5:0) + (back?1.5:0)); // 代工費=每瓶代工+選配標籤
  const res = await api({ action:'completeOrderItem', orderNo:o.orderNo, itemIndex:ii,
    bottleCount:count, bottle:bt, cap:'✓', frontLabel:front?'✓':'', backLabel:back?'✓':'',
    laborCost:labor, pm:(curUser&&curUser.username)||'', creator:(curUser&&curUser.username)||'', note });
  if(res.ok){ toast(`已完成：${it.product}（訂單${res.orderStatus}）`); loadOrderTasks(); }
  else toast('回報失敗：'+(res.error||''));
}
```

### 26.7 實機驗證結果（2026-06-16，Chrome 打正式環境）

- `getRecipeForProduction`：FB 島嶼鳳梨冰茶 100ml×100 → 批次4000→10000、倍率2.5、8 項用量全對；NO1.V2 包種茶青梅甜酒 500ml×50 全精度驗算全對；**兩案例 cost/tax/ingredientCost/unitCost/contrib 全部不回傳**。
- 完整流程：建單(NPW)→ 調酒師頁顯示 → 點開酒譜（放大+複合料比例+製程備註，無成本）→ 完成第1款（訂單→製作中）→ 完成第2款（→已完成）；每款寫一筆製作記錄，**F 欄=關聯訂單編號**，各欄位精準對齊。
- 前台 cascade：選 FB 出 27 款 FB 酒譜、改選南坡萬v.2 換成 NO1.V2_ 酒譜。

### 26.8 Phase C 待辦 / backlog

1. **訂單編輯 / 刪除**未做（前台清單目前唯讀；需補 `updateOrder`/`deleteOrder` GAS endpoint）。
2. **前台未存欄位**（訂單主表只有 11 欄）：聯繫人、電話、Key單日、運費、訂金/尾款付款日 → 留在表單但不送出；待決定加欄或移除。
3. **全客製酒款綁定酒譜分頁名**的管理員 UI 未做（目前 item 無 sheet 即顯示「未綁酒譜」）。
4. 前台 v1.1 原 Demo 的 seed/clear/編輯/刪除按鈕已停用。
5. 酒譜分頁補回「最後更新日期」欄位（跨 Phase backlog，調酒師頁可一併顯示避免做到舊版）。
6. 檔名筆誤：接手文件 `南坡落APP接手文件…` 的「落」應為「萬」。

