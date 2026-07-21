// ============================================================
// 南坡萬酒廠 GAS API v9.5
// v9.5 架構重構：客戶設定集中化
//   - CLIENTS 為客戶設定唯一資料來源（新增客戶只改這一處）
//   - PROFIT_COLS 毛利欄位映射集中
//   - SHEETS/isRecipeSheet/getProfitSheetName/去前綴/isNO1 全部派生
//   - 函式簽名不變，前端無需改動
// ============================================================

// ── 客戶設定唯一資料來源（v9.5 集中化重構）──────────────────
// ⚠️ 新增客戶只改 CLIENTS 這一個物件，其他全部自動派生
const CLIENTS = {
  'Feeling Bar': {
    id: '1WwCsC2SvLqWmGFPrwzM8pYLx3DpF3VM_3srfksWfza4',
    prefix: /^(0?FB_)/i,                 // 酒譜分頁前綴（isRecipeSheet 用）
    strip:  /^0?FB_/i,                   // recipeName 去前綴
    profitSheet: 'FB_毛利報價分析',
    profitFmt: '4L',                     // 毛利格式：'4L' | 'two-bottle'
  },
  '南坡萬公版': {
    id: '1X6euYjrRz72Fms8B3lvWjAhcJ81AlLp9BgnB_7zW1pU',
    prefix: /^NO1_/i, strip: /^NO1_/i,
    profitSheet: 'NO1_報價毛利分析', profitFmt: 'two-bottle',
  },
  'Feeling Bar Cafe': {
    id: '14vso62AkYRubqKVsgWBMpHS79KkEgbXFkdnPdrodckE',
    prefix: /^FBC_/i, strip: /^FBC_/i,
    profitSheet: 'FBC_毛利報價分析', profitFmt: '4L',
  },
  '南坡萬v.2': {
    id: '1816K_4KJ-YTX3102TMw58po5QVrUFzy3tGhQPFjQLdE',
    prefix: /^NO1\.V2_/i, strip: /^NO1\.V2_/i,
    profitSheet: 'NO1.V2_報價', profitFmt: 'two-bottle',
  },
};
// 主表 ID：優先讀 Script Property 'SHEET_ID'（測試部署指向沙盒副本用），
// 找不到時 fallback 正式硬編碼 ID（向後相容：正式部署不設此屬性，行為與改版前完全一致）。
const MAIN_SHEET_ID = (function () {
  try {
    var pid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (pid) return pid;
  } catch (e) {}
  return '1rXmA0ACRwy4jo3XEkXHZzNjJw8uZzX1jzVle-6k0V40';
})();

// 毛利欄位映射集中（實機確認值，v9.6 第十六節 / v9.9 第八節）
// 4L：B欄=售價、D欄=總成本；two-bottle：D欄=含稅單價、E欄=成本、兩列式
const PROFIT_COLS = {
  '4L':         { price: 1, cost: 3 },
  'two-bottle': { price: 3, cost: 4, twoRow: true },
};

// 取得客戶設定（唯一入口，未知客戶直接擋下）
function getClientCfg(client) {
  const cfg = CLIENTS[client];
  if (!cfg) throw new Error('未知客戶: ' + client);
  return cfg;
}

// ── 以下全部從 CLIENTS 派生（函式簽名不變，前端不用動）──────
function getClientSS(client) {
  return SpreadsheetApp.openById(getClientCfg(client).id);
}

// 分頁篩選：符合任一客戶前綴，且排除毛利/報價分頁
function isRecipeSheet(name) {
  if (name.indexOf('毛利') >= 0 || name.indexOf('報價') >= 0) return false;
  return Object.keys(CLIENTS).some(function(c) {
    return CLIENTS[c].prefix.test(name);
  });
}

// 毛利分析分頁名稱
function getProfitSheetName(client) {
  return getClientCfg(client).profitSheet;
}

// 分頁名稱去前綴 → 酒款名稱
function stripRecipePrefix(name) {
  for (const c of Object.keys(CLIENTS)) {
    if (CLIENTS[c].strip.test(name)) return name.replace(CLIENTS[c].strip, '');
  }
  return name;
}

// ── 入口 ────────────────────────────────────────────────────
// v2.1 授權表：FB觀看 只允許這三個 action（後端為準，前端只是 UI）
var FBVIEW_ALLOWED_ACTIONS = ['getRecipeList', 'getRecipe', 'changePassword'];
function doGet(e) {
  const p = e.parameter || {};
  const action = p.action || '';
  let result;
  try {
    // v2.1 輕量 session token：除 login/getEnvInfo 外，所有 action 一律要求有效 token
    if (action !== 'login' && action !== 'getEnvInfo') {
      const sess = _getSession_(p.token);
      if (!sess) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'SESSION_EXPIRED' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      p._user = sess.username; p._role = sess.role;
      if (sess.role === 'FB觀看' && FBVIEW_ALLOWED_ACTIONS.indexOf(action) < 0) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '權限不足' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    switch(action) {
      case 'getEnvInfo':     result = getEnvInfo(); break;                        // 環境探針(確認打到哪份主表)
      case 'login':          result = login(p); break;
      case 'changePassword': result = changePassword(p); break;
      case 'checkUser':      result = checkUser(p); break;               // 帳號診斷(遮罩、不回密碼)
      case '__seedTestUsers': result = __seedTestUsers(); break;         // 沙盒限定：種驗收用測試帳號(PROD 直接拒絕)
      case '__readLoginLog':  result = __readLoginLog(); break;          // 沙盒限定：讀登入紀錄供自動驗收(PROD 直接拒絕)
      case 'getRecipeList':  result = getRecipeList(p); break;
      case 'getRecipe':      result = getRecipe(p); break;
      case 'getClientRecipeList':    result = getClientRecipeList(p); break;     // Phase C 訂單系統
      case 'getRecipeForProduction': result = getRecipeForProduction(p); break;  // Phase C 訂單系統
      case 'createOrder':            result = createOrder(p); break;             // Phase C 訂單系統
      case 'getOrders':              result = getOrders(p); break;               // Phase C 訂單系統
      case 'completeOrderItem':      result = completeOrderItem(p); break;       // Phase C 訂單系統
      case 'confirmShipDate':        result = confirmShipDate(p); break;         // 實際出貨日確認
      case 'updateOrderFinance':     result = updateOrderFinance(p); break;      // 金流紀錄 N~V 欄(v1.6)
      case 'updateOrderDelivery':    result = updateOrderDelivery(p); break;     // 配送資訊 W~AD 欄(v1.7)
      case 'getOrderHistory':        result = getOrderHistory(p); break;         // 訂單修改歷史(v1.8)
      case 'updateOrder':            result = updateOrder(p); break;             // 編輯整張訂單(v2.0)
      case 'deleteOrder':            result = deleteOrder(p); break;             // 刪除整張訂單(v2.5, admin 限定)
      case 'getFinanceSummary':      result = getFinanceSummary(p); break;       // 當月金流摘要(v1.6, 財務名單限定)
      case 'getStockOverview':       result = getStockOverview(p); break;        // 成品庫存
      case 'stockIn':                result = stockIn(p); break;                 // 成品庫存
      case 'stockOut':               result = stockOut(p); break;                // 成品庫存
      case 'getStockLedger':         result = getStockLedger(p); break;          // 成品庫存
      case 'shipOrder':              result = shipOrder(p); break;               // 成品庫存(出貨連動 hook)
      case 'getBottleOverview':      result = getBottleOverview(); break;        // 玻璃瓶庫存
      case 'bottleIn':               result = bottleIn(p); break;                // 玻璃瓶庫存
      case 'bottleOut':              result = bottleOut(p); break;               // 玻璃瓶庫存
      case 'getBottleLedger':        result = getBottleLedger(p); break;         // 玻璃瓶庫存
      case 'addBottleItem':          result = addBottleItem(p); break;           // 新增玻璃瓶品項(ledger 派生)
      case 'saveRunCard':            result = saveRunCard(p); break;             // Run Card(v2.6)
      case 'getRunCards':            result = getRunCards(p); break;             // Run Card(v2.6)
      case 'getRunCard':             result = getRunCard(p); break;              // Run Card(v2.6)
      case 'deleteRunCard':          result = deleteRunCard(p); break;           // Run Card(v2.6, admin 限定)
      case 'migrateOrderNos':        result = migrateOrderNos(p); break;         // 訂單編號遷移(v2.7, admin 限定, 冪等)
      case 'getSafetyLevels':        result = getSafetyLevels(); break;          // 安全水位
      case 'setSafetyLevel':         result = setSafetyLevel(p); break;          // 安全水位
      case 'getStockAlerts':         result = getStockAlerts(); break;           // 安全水位警告(登入用)
      case 'saveProcessNote':result = saveProcessNote(p); break;
      case 'getInventory':   result = getInventory(); break;
      case 'addBatchRecord': result = addBatchRecord(p); break;
      case 'updateBatchRecord': result = updateBatchRecord(p); break;
      case 'deleteBatchRecord': result = deleteBatchRecord(p); break;
      case 'getBatchRecords':result = getBatchRecords(); break;
      case 'submitApply':    result = submitApply(p); break;
      case 'getApplies':     result = getApplies(); break;
      case 'reviewApply':    result = reviewApply(p); break;
      case 'getHistory':     result = getHistory(); break;
      case 'getProfitData':  result = getProfitData(p); break;
      case 'saveRdRecord':   result = saveRdRecord(p); break;
      case 'getRdRecords':   result = getRdRecords(); break;
      case 'deleteRdRecord': result = deleteRdRecord(p); break;
      case 'submitRdApply':  result = submitRdApply(p); break;
      case 'getRdApplies':   result = getRdApplies(); break;
      case 'reviewRdApply':  result = reviewRdApply(p); break;
      case 'getRdHistory':   result = getRdHistory(); break;
      default: result = { ok: false, error: '未知 action: ' + action };
    }
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 登入 ─────────────────────────────────────────────────────
// v2.1 session：token 存 ScriptCache（key=sess_<uuid>，TTL 6h=CacheService 上限），過期即需重新登入
var SESSION_TTL_SEC = 21600;
function _getSession_(token) {
  if (!token) return null;
  try {
    const raw = CacheService.getScriptCache().get('sess_' + token);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
// v2.1 登入紀錄：成功/失敗全記（分頁自動建立；失敗紀錄不回洩帳號存在與否給前端）
var LOGIN_LOG_SHEET = '登入紀錄';
function _logLogin_(username, role, result) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
    let ws = ss.getSheetByName(LOGIN_LOG_SHEET);
    if (!ws) {
      ws = ss.insertSheet(LOGIN_LOG_SHEET);
      ws.getRange(1, 1, 1, 4).setValues([['時間', '帳號', '角色', '結果']]);
    }
    ws.appendRow([Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'),
      String(username || ''), String(role || ''), String(result || '')]);
  } catch (e) { /* 紀錄失敗不阻斷登入 */ }
}
function login(p) {
  const username = p.username, password = p.password;
  if (!username || !password) return { ok: false, error: '請提供帳號密碼' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('使用者資料') || ss.getSheetByName('帳號');
  if (!ws) return { ok: false, error: '找不到帳號分頁' };
  const rows = ws.getDataRange().getValues();
  let matchedAcc = null; // 帳號存在但密碼錯 → 記「密碼錯誤」
  for (let i = 1; i < rows.length; i++) {
    const [acc, pwd, role] = rows[i];
    // 容錯：欄位前後空白一律忽略；純數字密碼容忍 Sheet 吃掉開頭 0（存 50916、輸入 050916 也過）
    const accOk = String(acc == null ? '' : acc).trim() === String(username).trim();
    if (!accOk) continue;
    matchedAcc = { role: role || 'user' };
    const pwStr = String(pwd == null ? '' : pwd).trim();
    const inStr = String(password).trim();
    const pwOk = pwStr === inStr || (/^\d+$/.test(inStr) && pwStr === String(Number(inStr)));
    if (pwOk) {
      const finalRole = role || 'user';
      const token = Utilities.getUuid();
      CacheService.getScriptCache().put('sess_' + token,
        JSON.stringify({ username: String(username).trim(), role: finalRole }), SESSION_TTL_SEC);
      _logLogin_(username, finalRole, '成功');
      return { ok: true, role: finalRole, token: token };
    }
  }
  _logLogin_(username, matchedAcc ? matchedAcc.role : '', matchedAcc ? '密碼錯誤' : '帳號不存在');
  return { ok: false, error: '帳號或密碼錯誤' };
}

// 沙盒限定：種驗收用測試帳號（PROD 一律拒絕；正式帳號永遠人工加列）
function __seedTestUsers() {
  if (getEnvInfo().env === 'PROD') return { ok: false, error: '僅限測試環境' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('使用者資料') || ss.getSheetByName('帳號');
  if (!ws) return { ok: false, error: '找不到帳號分頁' };
  const rows = ws.getDataRange().getValues();
  const have = {};
  for (let i = 1; i < rows.length; i++) have[String(rows[i][0]).trim()] = true;
  const added = [];
  [['上海Jason', '111111', 'FB觀看'], ['testadmin', '999999', 'admin']].forEach(function (u) {
    if (!have[u[0]]) { ws.appendRow(u); added.push(u[0]); }
  });
  return { ok: true, added: added };
}

// 沙盒限定：讀登入紀錄末 20 筆（自動驗收用；PROD 一律拒絕）
function __readLoginLog() {
  if (getEnvInfo().env === 'PROD') return { ok: false, error: '僅限測試環境' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName(LOGIN_LOG_SHEET);
  if (!ws) return { ok: true, rows: [] };
  const data = ws.getDataRange().getValues();
  const rows = [];
  for (let i = Math.max(1, data.length - 20); i < data.length; i++) {
    rows.push({ time: _fmtDateTime_(data[i][0]), user: String(data[i][1] || ''),
      role: String(data[i][2] || ''), result: String(data[i][3] || '') });
  }
  return { ok: true, rows: rows };
}

// 帳號診斷（僅回存在性/角色/密碼遮罩特徵，不回密碼內容；排查登入問題用）
function checkUser(p) {
  const username = String((p && p.username) || '');
  if (!username) return { ok: false, error: '缺少 username' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('使用者資料') || ss.getSheetByName('帳號');
  if (!ws) return { ok: false, error: '找不到帳號分頁' };
  const rows = ws.getDataRange().getValues();
  const hits = [];
  for (let i = 1; i < rows.length; i++) {
    const acc = String(rows[i][0] == null ? '' : rows[i][0]);
    if (acc.trim().toLowerCase() === username.trim().toLowerCase()) {
      const pw = String(rows[i][1] == null ? '' : rows[i][1]);
      hits.push({
        row: i + 1, accExact: acc === username, accHasSpace: acc !== acc.trim(),
        role: String(rows[i][2] == null ? '' : rows[i][2]), pwLen: pw.length, pwTrimLen: pw.trim().length,
        pwIsNumeric: /^\d+$/.test(pw.trim()), pwStartsWithZero: pw.trim().charAt(0) === '0'
      });
    }
  }
  return { ok: true, count: hits.length, hits: hits, sheetName: ws.getName(), totalRows: rows.length - 1 };
}

// ── 改密碼 ───────────────────────────────────────────────────
function changePassword(p) {
  const { username, oldPassword, newPassword } = p;
  // v2.1：只能改自己的密碼（session 身分為準）
  if (p._user && String(username) !== String(p._user)) return { ok: false, error: '只能修改自己的密碼' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('使用者資料') || ss.getSheetByName('帳號');
  if (!ws) return { ok: false, error: '找不到帳號分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === username && String(rows[i][1]) === String(oldPassword)) {
      ws.getRange(i + 1, 2).setValue(newPassword);
      return { ok: true };
    }
  }
  return { ok: false, error: '帳號或舊密碼錯誤' };
}

// ── 酒譜清單 ─────────────────────────────────────────────────
function getRecipeList(p) {
  const role = p && p._role;
  const cache = CacheService.getScriptCache();
  const cached = cache.get('recipeList_v1');
  // v2.1 FB觀看：過濾一律在讀 cache「之後」做，且過濾結果絕不寫回共用 cache
  if (cached) return _filterRecipeListByRole_(JSON.parse(cached), role);
  const list = [];
  for (const client of Object.keys(CLIENTS)) {
    try {
      const ss = getClientSS(client);
      const sheets = ss.getSheets();
      for (const ws of sheets) {
        const name = ws.getName();
        if (!isRecipeSheet(name)) continue;
        // 取酒款名稱（Row2 E欄，或從分頁名稱推導）
        let recipeName = '';
        try {
          const row2 = ws.getRange(2, 1, 1, 8).getValues()[0];
          // Row2 通常 E欄是酒款名稱，或 D欄
          recipeName = String(row2[4] || row2[3] || '').trim();
        } catch(e) {}
        if (!recipeName) {
          // 從分頁名稱去掉前綴
          recipeName = stripRecipePrefix(name);
        }
        list.push({ client, sheet: name, recipeName });
      }
    } catch(e) {
      // 單一客戶錯誤不影響其他
    }
  }
  const result = { ok: true, list };
  cache.put('recipeList_v1', JSON.stringify(result), 300);
  return _filterRecipeListByRole_(result, role);
}
function _filterRecipeListByRole_(result, role) {
  if (role !== 'FB觀看') return result;
  return { ok: true, list: (result.list || []).filter(function (x) { return x.client === 'Feeling Bar'; }) };
}

// ── 單一酒譜 ─────────────────────────────────────────────────
function getRecipe(p) {
  const { client, sheet } = p;
  if (!client || !sheet) return { ok: false, error: '缺少 client 或 sheet' };
  // v2.1 FB觀看：只能看 Feeling Bar
  if (p._role === 'FB觀看' && client !== 'Feeling Bar') return { ok: false, error: '權限不足' };
  const ss = getClientSS(client);
  const ws = ss.getSheetByName(sheet);
  if (!ws) return { ok: false, error: '找不到分頁: ' + sheet };

  const range = ws.getDataRange();
  const data = range.getValues();
  const formulas = range.getFormulas(); // 取 F 欄公式字串(getValues 看不到 =H12),供複合原料解析
  // Row1=大標題 Row2=客戶/酒款名稱 Row3=欄位標頭 Row4+=原料
  let recipeName = '', totalVol = 0, abv = 0;
  const ingredients = [];
  let processNote = '';
  let ingredientCost = 0;

  // Row2: A=客戶名稱標頭, B=客戶值, D=酒款名稱標頭, E=酒款名稱, H=酒精濃度標頭, I=ABV值
  // 實際欄位: index 0=客戶名稱, 1=FeelingBar, 3=酒款名稱, 4=紫芋茉莉奶酒, 7=酒精濃度, 8=8%
  if (data.length > 1) {
    const r2 = data[1];
    recipeName = String(r2[4] || '').trim();
    // I欄(index 8)是 ABV 值，格式可能是 "8%" 或 8
    const abvRaw = String(r2[8] || '').replace('%','').trim();
    abv = parseFloat(abvRaw) || 0;
  }

  // ── 階段一：定位子料區邊界並建 subMap(根治 v10.3 第19.2 脆弱點) ──
  // 子料區 = 「總體積」列下方 ~ 「{n}ml版總食材成本」列上方(實機驗證,見第十八章)
  // subMap: { 列號(1-based) : { name, unitPrice(F), packVol(G), unitCost(H值) } }
  // 子料的每ml成本 unitCost 直接讀 H 欄計算值(Sheet 公式 =IFERROR(F/G,"") 已算好)
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
      if (!a || a === '基礎原料') continue; // 跳子料區標題列
      // 子料 H 欄(index 7)= 每ml成本;若 H 空,退而用 F/G 自算
      let unitCost = parseFloat(data[i][7]) || 0;
      const fVal = parseFloat(data[i][5]) || 0, gVal = parseFloat(data[i][6]) || 0;
      if (!unitCost && fVal > 0 && gVal > 0) unitCost = fVal / gVal;
      subMap[i + 1] = { name: a, unitPrice: fVal, packVol: gVal, unitCost: unitCost };
    }
  }

  // ── 階段二：讀原料區(Row4 ~ 總體積列上方),複合母料附加 subMaterials ──
  const ingEnd = totalVolRow >= 0 ? totalVolRow : data.length;
  for (let i = 3; i < ingEnd; i++) {
    const row = data[i];
    const cellA = String(row[0] || '').trim();
    if (cellA === '基礎原料') continue;

    // 一般原料行：A=名稱, B=占比(0.1=10%), C=體積, D=ABV, F=進貨單價, I=成本
    const name = cellA;
    if (!name || String(row[1]).indexOf('%') >= 0 && !parseFloat(row[1])) continue;
    const rawPct = parseFloat(row[1]) || 0;
    // 占比格式約定（Bug 1）：B欄存小數（0.1=10%、1=100%），故 ≤1 一律 ×100 還原成百分比；
    // >1 視為「已是百分比整數」（相容少數混填情況）。
    // ⚠️ 邊界：值剛好 =1 在此約定下即 100%，本式回傳 100（正確，非 1%）。
    //    唯一真正歧義是有人把「1%」誤填成整數 1（違反約定）→ 會被當成 100%。
    //    此屬資料輸入錯誤，應由酒譜頁「占比總和檢查」攔截；不在此處臆測修正，
    //    以免反把正確的 100% 砍成 1% 製造新回歸（開發最高原則 #1：不做有風險的局部補丁）。
    const pct = rawPct <= 1 ? rawPct * 100 : rawPct;
    const vol = parseFloat(row[2]) || 0;
    const ingAbv = parseFloat(row[3]) || 0;
    const cost = parseFloat(row[8]) || 0;
    if (name && (pct > 0 || vol > 0)) {
      const ing = { name, pct, vol, abv: ingAbv, cost };
      // 複合原料偵測：F 欄(index 5)是公式 → 解析子料(第十八章 18.5)
      const fFormula = (formulas[i] && formulas[i][5]) ? String(formulas[i][5]) : '';
      const cpd = parseCompoundFormula(fFormula, subMap);
      if (cpd.isCompound) {
        ing.isCompound = true;
        ing.hasLoss = cpd.hasLoss;
        ing.subMaterials = cpd.subMaterials;
        // G欄(index 6)=批次容量：F欄公式算出的是「每 batchVol ml 的子料總成本」
        // 必須除以此值才得每ml成本，recalcCompound 需要它（Issue 4 root cause）
        ing.batchVol = parseFloat(data[i][6]) || 1;
      }
      ingredients.push(ing);
      ingredientCost += cost;
    }
  }

  // totalVol / abv 從「總體積」列補讀(階段一已定位 totalVolRow)
  if (totalVolRow >= 0) {
    totalVol = parseFloat(data[totalVolRow][2]) || 0;
    abv = parseFloat(data[totalVolRow][3]) || abv;
  }
  // 製程備註：從 subEndRow(若是製程備註列)或往下找
  for (let i = (subEndRow >= 0 ? subEndRow : ingEnd); i < data.length; i++) {
    if (String(data[i][0] || '').trim() === '製程備註') {
      if (i + 1 < data.length) processNote = String(data[i + 1][0] || data[i + 1][1] || '').trim();
      break;
    }
  }

  // 酒稅
  const tax = calcTax(abv, totalVol);

  const result = {
    ok: true,
    recipeName,
    abv,
    totalVol,
    ingredientCost,
    tax,
    ingredients,
    processNote
  };
  // v2.1 FB觀看：回傳前深度剝除所有成本/價格欄位（後端為準，非前端隱藏）
  return (p._role === 'FB觀看') ? _stripRecipeCosts_(result) : result;
}

// FB觀看用：只留 名稱/ABV/占比/體積/總體積/製程備註/複合結構(比例)，去除 cost/unitCost/unitPrice/ingredientCost/tax
function _stripRecipeCosts_(r) {
  const out = { ok: true, recipeName: r.recipeName, abv: r.abv, totalVol: r.totalVol,
    ingredients: [], processNote: r.processNote };
  (r.ingredients || []).forEach(function (ing) {
    const c = { name: ing.name, pct: ing.pct, vol: ing.vol, abv: ing.abv };
    if (ing.isCompound) {
      c.isCompound = true;
      c.hasLoss = ing.hasLoss;
      c.batchVol = ing.batchVol;
      c.subMaterials = (ing.subMaterials || []).map(function (s) {
        return { name: s.name, coef: s.coef, packVol: s.packVol };
      });
    }
    out.ingredients.push(c);
  });
  return out;
}

function calcTax(abv, vol) {
  return (abv <= 20 ? abv * 7 / 1000 : 185 / 1000) * vol;
}

// ── 複合原料 F 欄公式解析(v10.3 第十八章,5 案例實機驗證)────────
// 支援的公式形式(母料 F 欄):
//   =H12                    單子料,無係數無耗損
//   =H13*2                  單子料 + 係數(在後)
//   =(H14*1+H17*2+H15*100)/0.8   多子料相加 + 各係數 + 耗損
// 規則:H{列} 參照「總體積下方子料」的 H 欄;係數=配方比例;/0.8=耗損旗標。
// 子料明細 contrib(貢獻成本) = 係數 × 子料每ml成本(unitCost)。
function parseCompoundFormula(formula, subMap) {
  if (!formula || formula.charAt(0) !== '=') return { isCompound: false };
  const hasLoss = /\/\s*0\.8/.test(formula); // /0.8 或 / 0.8
  const subMaterials = [];
  // 抓所有 H{列}[*係數] 項;係數選配且在 H 之後(實機 5 案例皆係數在後)
  const re = /H(\d+)\s*(?:\*\s*(\d+\.?\d*))?/g;
  let m;
  while ((m = re.exec(formula)) !== null) {
    const row = parseInt(m[1]);
    const coef = m[2] ? parseFloat(m[2]) : 1;
    if (subMap[row]) {
      subMaterials.push({
        name: subMap[row].name,
        coef: coef,                          // 配方比例係數
        unitCost: subMap[row].unitCost,      // 子料每ml成本(H值)
        contrib: coef * subMap[row].unitCost // 該子料貢獻成本
      });
    }
  }
  if (subMaterials.length === 0) return { isCompound: false };
  return { isCompound: true, hasLoss: hasLoss, subMaterials: subMaterials };
}

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
// 訂單主表(主資料庫)欄位：
//   A訂單編號 B客戶名稱 C訂單類型 D出貨日 E酒款明細(JSON) F總金額 G尾款 H訂金狀態 I製作狀態 J PM K建立時間
//   L實際出貨日 M實際出貨日已確認(v1.4)
//   N訂金金額 O訂金預計收取日 P訂金實際收取日 Q尾款金額 R尾款預計收取日 S尾款實際收取日
//   T尾款特殊調整(TRUE/空) U調整後尾款金額 V調整備註(v1.6 金流紀錄)
//   W~AD 配送資訊(v1.7)  AE Lot批號(整單一個，文字格式防吃0)
// 製作狀態：per-item 存於 E 的 JSON(status)，I 欄為整單彙總(全完成→已完成，否則製作中)。

// v1.6 金流紀錄欄（N~V）：舊列讀出為空字串，前後端皆以空=未填處理
var ORDER_FINANCE_HEADERS = ['訂金金額', '訂金預計收取日', '訂金實際收取日',
  '尾款金額', '尾款預計收取日', '尾款實際收取日', '尾款特殊調整', '調整後尾款金額', '調整備註'];
// v1.7 配送資訊欄（W~AD）
var ORDER_DELIVERY_HEADERS = ['配送方式', '運費金額', '收件人名稱', '收件人手機',
  '收件地址', '客戶統編', '發票驗收單已隨貨', '發票後五碼'];
function _ensureOrderFinanceHeaders_(ws) {
  if (String(ws.getRange(1, 14).getValue() || '') === '') {
    ws.getRange(1, 14, 1, ORDER_FINANCE_HEADERS.length).setValues([ORDER_FINANCE_HEADERS]);
  }
  if (String(ws.getRange(1, 23).getValue() || '') === '') {
    ws.getRange(1, 23, 1, ORDER_DELIVERY_HEADERS.length).setValues([ORDER_DELIVERY_HEADERS]);
    // 手機/統編/發票後五碼強制文字格式，防開頭 0 被 Sheet 吃掉（Z=26, AB=28, AD=30）
    var mr = ws.getMaxRows() - 1;
    if (mr > 0) {
      ws.getRange(2, 26, mr, 1).setNumberFormat('@');
      ws.getRange(2, 28, mr, 1).setNumberFormat('@');
      ws.getRange(2, 30, mr, 1).setNumberFormat('@');
    }
  }
  // v1.7.x Lot批號（AE=31 欄）：文字格式防開頭 0 被吃掉
  if (String(ws.getRange(1, 31).getValue() || '') === '') {
    ws.getRange(1, 31).setValue('Lot批號');
    var mrL = ws.getMaxRows() - 1;
    if (mrL > 0) ws.getRange(2, 31, mrL, 1).setNumberFormat('@');
  }
}
// 金額欄：空=未填(保留空字串)，有值才轉數字
function _numOrBlank_(v) { return (v == null || v === '') ? '' : (Number(v) || 0); }

// ── v1.8 訂單異動紀錄（不可變流水帳；每張訂單的修改歷史備查）──
var ORDER_LOG_SHEET = '訂單異動紀錄';
var ORDER_LOG_HEADERS = ['時間', '訂單編號', '操作人', '動作', '內容摘要'];
function _logOrderChange_(orderNo, user, action, summary) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
    let ws = ss.getSheetByName(ORDER_LOG_SHEET);
    if (!ws) {
      ws = ss.insertSheet(ORDER_LOG_SHEET);
      ws.getRange(1, 1, 1, ORDER_LOG_HEADERS.length).setValues([ORDER_LOG_HEADERS]);
    }
    const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    ws.appendRow([now, String(orderNo), String(user || ''), String(action || ''), String(summary || '')]);
  } catch (e) { /* 紀錄失敗不阻斷主流程 */ }
}
function _fmtDateTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
  return String(v == null ? '' : v);
}
function getOrderHistory(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName(ORDER_LOG_SHEET);
  if (!ws) return { ok: true, history: [] };
  const data = ws.getDataRange().getValues();
  const history = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(orderNo)) {
      history.push({ time: _fmtDateTime_(data[i][0]), user: String(data[i][2] || ''),
        action: String(data[i][3] || ''), summary: String(data[i][4] || '') });
    }
  }
  return { ok: true, history: history };
}

function _genOrderNo(ws) {
  // v2.7 編號規則（主公拍板）：「西元日期六碼-三碼流水」如 260721-001（同日依下單順序遞增）。
  // 同時掃描舊 NPW-YYYYMMDD-NNN 格式取當日最大流水，避免遷移空窗期撞號。
  const d6 = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyMMdd');
  const d8 = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const prefix = d6 + '-';
  const oldPrefix = 'NPW-' + d8 + '-';
  const data = ws.getDataRange().getValues();
  let maxSeq = 0;
  for (let i = 1; i < data.length; i++) {
    const no = String(data[i][0] || '');
    let seq = 0;
    if (no.indexOf(prefix) === 0) seq = parseInt(no.slice(prefix.length), 10) || 0;
    else if (no.indexOf(oldPrefix) === 0) seq = parseInt(no.slice(oldPrefix.length), 10) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return prefix + ('00' + (maxSeq + 1)).slice(-3);
}

// v2.7 一次性遷移（admin 限定、可重複執行=冪等）：舊 NPW-YYYYMMDD-NNN → 新 YYMMDD-NNN
// 連動五分頁：訂單主表A／訂單異動紀錄B／成品庫存異動H(關聯訂單)／製作記錄F(關聯訂單)／RunCard B
function migrateOrderNos(p) {
  if (p._role !== 'admin') return { ok: false, error: '僅管理員可執行編號遷移' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const re = /^NPW-\d{2}(\d{6})-(\d{3})$/;
  const conv = function (no) {
    const m = String(no == null ? '' : no).trim().match(re);
    return m ? (m[1] + '-' + m[2]) : null;
  };
  const targets = [
    { sheet: '訂單主表', col: 0 },
    { sheet: '訂單異動紀錄', col: 1 },
    { sheet: '成品庫存異動', col: 7 },
    { sheet: '製作記錄', col: 5 },
    { sheet: 'RunCard', col: 1 }
  ];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const changed = {}; const mapping = [];
    targets.forEach(function (t) {
      const ws = ss.getSheetByName(t.sheet);
      if (!ws || ws.getLastRow() < 2) { changed[t.sheet] = 0; return; }
      const rng = ws.getRange(2, t.col + 1, ws.getLastRow() - 1, 1);
      const vals = rng.getValues();
      let n = 0;
      for (let i = 0; i < vals.length; i++) {
        const nv = conv(vals[i][0]);
        if (nv) {
          if (t.sheet === '訂單主表') mapping.push(String(vals[i][0]).trim() + ' → ' + nv);
          vals[i][0] = nv; n++;
        }
      }
      if (n) rng.setValues(vals);
      changed[t.sheet] = n;
    });
    return { ok: true, changed: changed, mapping: mapping };
  } finally { lock.releaseLock(); }
}

// 前台送單
function createOrder(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  if (!p.client) return { ok: false, error: '缺少客戶' };
  // 允許自由客戶名（支援「新客戶」建單）；已知客戶照舊，未知客戶不再擋下（訂單只記名稱，不寫客戶酒譜表）
  let items;
  try { items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []); }
  catch (e) { return { ok: false, error: '酒款明細 JSON 解析失敗' }; }
  if (!items || !items.length) return { ok: false, error: '訂單至少要有一款酒' };
  items = items.map(function (it) {
    const o = {
      product: it.product || '', sheet: it.sheet || '', volume: it.volume || '',
      bottleType: it.bottleType || '', qty: Number(it.qty) || 0,
      status: it.status || '待製作'
    };
    if (it.srcClient) o.srcClient = it.srcClient; // 公版酒帶自有品牌配方來源
    return o;
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const orderNo = _genOrderNo(ws);
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    _ensureOrderFinanceHeaders_(ws);
    const finAdj = (String(p.finalAdjusted || '').toLowerCase() === 'true');
    // L實際出貨日(預設=表訂出貨日) M實際出貨日已確認(空=未確認) N~V金流紀錄(v1.6) W~AD配送資訊(v1.7)
    ws.appendRow([orderNo, p.client, p.orderType || '', p.deliveryDate || '',
      JSON.stringify(items), Number(p.total) || 0, Number(p.balance) || 0,
      p.depositStatus || '', '待製作', p.pm || '', now,
      p.actualDeliveryDate || p.deliveryDate || '', '',
      _numOrBlank_(p.depositAmount), p.depositDueDate || '', p.depositPaidDate || '',
      _numOrBlank_(p.finalAmount), p.finalDueDate || '', p.finalPaidDate || '',
      finAdj ? 'TRUE' : '', finAdj ? _numOrBlank_(p.finalAdjustedAmount) : '', p.finalAdjustNote || '',
      p.shipMethod || '', _numOrBlank_(p.shipFee), p.recvName || '', p.recvPhone || '',
      p.recvAddr || '', p.taxId || '',
      (String(p.invoiceSent || '').toLowerCase() === 'true') ? 'TRUE' : '', p.invoiceLast5 || '']);
    // AE Lot批號：字串+文字格式，防開頭 0 被吃掉
    if (p.lot != null && String(p.lot).trim() !== '') {
      ws.getRange(ws.getLastRow(), 31).setNumberFormat('@').setValue(String(p.lot).trim());
    }
    _logOrderChange_(orderNo, p.pm || p.user || '', '建立訂單',
      p.client + '／' + items.length + ' 款／總 NT$' + (Number(p.total) || 0) + (p.orderType ? '／' + p.orderType : '')
      + (String(p.lot || '').trim() ? '／Lot ' + String(p.lot).trim() : ''));
    return { ok: true, orderNo: orderNo };
  } finally { lock.releaseLock(); }
}

// 日期正規化：Sheets 可能把日期字串自動轉成 Date 物件，統一輸出 yyyy-MM-dd
function _fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v == null ? '' : v);
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
      deliveryDate: _fmtDate_(r[3]), items: items, status: String(r[8] || '').trim(),
      pm: String(r[9] || ''), createdAt: String(r[10] || ''),
      actualDeliveryDate: _fmtDate_(r[11]) || _fmtDate_(r[3]),
      shipDateConfirmed: (String(r[12]).toUpperCase() === 'TRUE' || r[12] === true),
      // v1.7 配送資訊（兩種 view 皆回；出貨作業需要，非金額）
      shipMethod: String(r[22] == null ? '' : r[22]),
      shipFee: _numOrBlank_(r[23]),
      recvName: String(r[24] == null ? '' : r[24]),
      recvPhone: String(r[25] == null ? '' : r[25]),
      recvAddr: String(r[26] == null ? '' : r[26]),
      taxId: String(r[27] == null ? '' : r[27]),
      invoiceSent: (String(r[28]).toUpperCase() === 'TRUE' || r[28] === true),
      invoiceLast5: String(r[29] == null ? '' : r[29]),
      lot: String(r[30] == null ? '' : r[30])
    };
    if (view === 'bartender') {
      if (base.status === '已完成') continue; // 不回完成單
      base.items = items.map(function (it) {
        const o = {
          product: it.product, sheet: it.sheet, volume: it.volume,
          bottleType: it.bottleType, qty: it.qty, status: it.status || '待製作'
        };
        if (it.srcClient) o.srcClient = it.srcClient; // 公版酒配方來源（Run Card 預填要用，非金額欄）
        return o;
      });
      orders.push(base); // 刻意不含 total/balance/depositStatus(決議：調酒師不看金額)
    } else {
      base.total = Number(r[5]) || 0;
      base.balance = Number(r[6]) || 0;
      base.depositStatus = String(r[7] || '');
      // v1.6 金流紀錄（舊列無 N~V → 一律回空字串=未填）
      base.depositAmount = _numOrBlank_(r[13]);
      base.depositDueDate = _fmtDate_(r[14]);
      base.depositPaidDate = _fmtDate_(r[15]);
      base.finalAmount = _numOrBlank_(r[16]);
      base.finalDueDate = _fmtDate_(r[17]);
      base.finalPaidDate = _fmtDate_(r[18]);
      base.finalAdjusted = (String(r[19]).toUpperCase() === 'TRUE' || r[19] === true);
      base.finalAdjustedAmount = _numOrBlank_(r[20]);
      base.finalAdjustNote = String(r[21] == null ? '' : r[21]);
      orders.push(base);
    }
  }
  if (view === 'bartender') {
    orders.sort(function (a, b) { return (a.deliveryDate || '').localeCompare(b.deliveryDate || ''); });
  }
  return { ok: true, orders: orders };
}

// 確認/修正實際出貨日（L 實際出貨日、M 已確認）
function confirmShipDate(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const actualDate = (p && p.actualDate) || '';
  if (!actualDate) return { ok: false, error: '缺少實際出貨日' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  const data = ws.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderNo)) {
      ws.getRange(i + 1, 12).setValue(actualDate); // L 實際出貨日
      ws.getRange(i + 1, 13).setValue('TRUE');      // M 已確認
      _logOrderChange_(orderNo, p.operator || p.user || '', '確認實際出貨日', '實際出貨日＝' + actualDate);
      return { ok: true, orderNo: orderNo, actualDate: actualDate };
    }
  }
  return { ok: false, error: '找不到訂單：' + orderNo };
}

// ── v2.0 編輯整張訂單 ─────────────────────────────
// 覆寫 B~J(I 製作狀態依 items 重算)、L 實際出貨日、N~V 金流、W~AD 配送。
// A訂單編號、K建立時間、M出貨日已確認 不動。支援「先建殼、後補資料」工作流。
function updateOrder(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  if (!p.client) return { ok: false, error: '缺少客戶' };
  let items;
  try { items = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []); }
  catch (e) { return { ok: false, error: '酒款明細 JSON 解析失敗' }; }
  if (!items || !items.length) return { ok: false, error: '訂單至少要有一款酒' };
  items = items.map(function (it) {
    const o = { product: it.product || '', sheet: it.sheet || '', volume: it.volume || '',
      bottleType: it.bottleType || '', qty: Number(it.qty) || 0, status: it.status || '待製作' };
    if (it.batchId) o.batchId = it.batchId;
    if (it.srcClient) o.srcClient = it.srcClient; // 公版酒帶自有品牌配方來源
    return o;
  });
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  _ensureOrderFinanceHeaders_(ws);
  const finAdj = (String(p.finalAdjusted || '').toLowerCase() === 'true');
  const sent = (String(p.invoiceSent || '').toLowerCase() === 'true');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = ws.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(orderNo)) continue;
      const allDone = items.every(function (it) { return it.status === '完成'; });
      const anyDone = items.some(function (it) { return it.status === '完成'; });
      const status = allDone ? '已完成' : (anyDone ? '製作中' : '待製作');
      ws.getRange(i + 1, 2, 1, 9).setValues([[
        p.client, p.orderType || '', p.deliveryDate || '', JSON.stringify(items),
        Number(p.total) || 0, Number(p.balance) || 0, p.depositStatus || '', status, p.pm || ''
      ]]);
      ws.getRange(i + 1, 12).setValue(p.actualDeliveryDate || p.deliveryDate || '');
      ws.getRange(i + 1, 14, 1, 9).setValues([[
        _numOrBlank_(p.depositAmount), p.depositDueDate || '', p.depositPaidDate || '',
        _numOrBlank_(p.finalAmount), p.finalDueDate || '', p.finalPaidDate || '',
        finAdj ? 'TRUE' : '', finAdj ? _numOrBlank_(p.finalAdjustedAmount) : '', p.finalAdjustNote || ''
      ]]);
      ws.getRange(i + 1, 23, 1, 8).setValues([[
        p.shipMethod || '', _numOrBlank_(p.shipFee), p.recvName || '', p.recvPhone || '',
        p.recvAddr || '', p.taxId || '', sent ? 'TRUE' : '', p.invoiceLast5 || ''
      ]]);
      // AE Lot批號（字串+文字格式，防開頭 0 被吃掉；空=清除）
      ws.getRange(i + 1, 31).setNumberFormat('@').setValue(p.lot == null ? '' : String(p.lot).trim());
      _logOrderChange_(orderNo, p.user || p.pm || '', '編輯訂單',
        p.client + '／' + items.length + ' 款／總 NT$' + (Number(p.total) || 0) + '／表訂 ' + (p.deliveryDate || '—')
        + (String(p.lot || '').trim() ? '／Lot ' + String(p.lot).trim() : ''));
      return { ok: true, orderNo: orderNo };
    }
    return { ok: false, error: '找不到訂單：' + orderNo };
  } finally { lock.releaseLock(); }
}

// ── v2.5 刪除訂單（admin 限定，不可復原；刪前記異動紀錄）──
function deleteOrder(p) {
  if (p._role !== 'admin') return { ok: false, error: '僅管理員可刪除訂單' };
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = ws.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(orderNo)) {
        const client = String(data[i][1] || '');
        ws.deleteRow(i + 1);
        _logOrderChange_(orderNo, p._user || '', '刪除訂單', client + '（整張刪除，不可復原）');
        return { ok: true, orderNo: orderNo };
      }
    }
    return { ok: false, error: '找不到訂單：' + orderNo };
  } finally { lock.releaseLock(); }
}

// ── v1.6 金流紀錄 ─────────────────────────────────
// 更新訂單金流欄（N~V，一次整組覆寫；前端 modal 送全部欄位）
function updateOrderFinance(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  _ensureOrderFinanceHeaders_(ws);
  const finAdj = (String(p.finalAdjusted || '').toLowerCase() === 'true');
  const data = ws.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderNo)) {
      ws.getRange(i + 1, 14, 1, 9).setValues([[
        _numOrBlank_(p.depositAmount), p.depositDueDate || '', p.depositPaidDate || '',
        _numOrBlank_(p.finalAmount), p.finalDueDate || '', p.finalPaidDate || '',
        finAdj ? 'TRUE' : '', finAdj ? _numOrBlank_(p.finalAdjustedAmount) : '', p.finalAdjustNote || ''
      ]]);
      _logOrderChange_(orderNo, p.user || '', '更新金流',
        '訂金 ' + (p.depositAmount || '—') + '（實收 ' + (p.depositPaidDate || '未') + '）／尾款 ' + (p.finalAmount || '—')
        + '（實收 ' + (p.finalPaidDate || '未') + '）' + (finAdj ? '／調整後 ' + (p.finalAdjustedAmount || '—') : ''));
      return { ok: true, orderNo: orderNo };
    }
  }
  return { ok: false, error: '找不到訂單：' + orderNo };
}

// ── v1.7 配送資訊 ─────────────────────────────────
// 更新訂單配送欄（W~AD，一次整組覆寫；前端 modal 送全部欄位）
function updateOrderDelivery(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: false, error: '找不到訂單主表分頁' };
  _ensureOrderFinanceHeaders_(ws);
  const sent = (String(p.invoiceSent || '').toLowerCase() === 'true');
  const data = ws.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderNo)) {
      ws.getRange(i + 1, 23, 1, 8).setValues([[
        p.shipMethod || '', _numOrBlank_(p.shipFee), p.recvName || '', p.recvPhone || '',
        p.recvAddr || '', p.taxId || '', sent ? 'TRUE' : '', p.invoiceLast5 || ''
      ]]);
      _logOrderChange_(orderNo, p.user || '', '更新配送',
        (p.shipMethod || '—') + '／' + (p.recvName || '—') + ' ' + (p.recvPhone || '') + '／' + (p.recvAddr || '—')
        + (sent ? '／發票驗收單已隨貨' : ''));
      return { ok: true, orderNo: orderNo };
    }
  }
  return { ok: false, error: '找不到訂單：' + orderNo };
}

// 當月金流摘要（僅財務名單）：
//   orderRevenue(損益)＝出貨日(實際L優先、否則表訂D)落在該月的訂單總金額；尾款有特殊調整時以差額修正
//   cashReceived(現金流)＝訂金實際收取日(P)在該月的訂金 ＋ 尾款實際收取日(S)在該月的實際尾款(調整後優先)
var FINANCE_USERS = ['Kevin', 'Molly', 'Lulu'];
function getFinanceSummary(p) {
  const user = String((p && p.user) || '');
  if (FINANCE_USERS.indexOf(user) < 0) return { ok: false, error: '無權限查看金流摘要' };
  const month = String((p && p.month) || '') || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: true, month: month, orderRevenue: 0, cashReceived: 0, orderCount: 0 };
  const data = ws.getDataRange().getValues();
  let revenue = 0, cash = 0, count = 0;
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    const total = Number(r[5]) || 0;
    const depositAmt = _numOrBlank_(r[13]);
    const finalAmt = _numOrBlank_(r[16]);
    const adjusted = (String(r[19]).toUpperCase() === 'TRUE' || r[19] === true);
    const adjAmt = _numOrBlank_(r[20]);
    // 實際尾款：有調整→調整後金額；否則 Q 尾款金額，再退回舊 G 尾款欄
    const effFinal = (adjusted && adjAmt !== '') ? adjAmt : (finalAmt !== '' ? finalAmt : (Number(r[6]) || 0));
    const shipMonth = (_fmtDate_(r[11]) || _fmtDate_(r[3])).slice(0, 7);
    if (shipMonth === month) {
      count++;
      let eff = total;
      if (adjusted && adjAmt !== '') {
        const origFinal = (finalAmt !== '') ? finalAmt : (Number(r[6]) || 0);
        eff = total - origFinal + adjAmt;
      }
      revenue += eff;
    }
    if (_fmtDate_(r[15]).slice(0, 7) === month && depositAmt !== '') cash += depositAmt;
    if (_fmtDate_(r[18]).slice(0, 7) === month) cash += effFinal;
  }
  return { ok: true, month: month, orderRevenue: revenue, cashReceived: cash, orderCount: count };
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
    _logOrderChange_(orderNo, p.creator || p.pm || '', '完成回報',
      '第 ' + (idx + 1) + ' 款「' + (item.product || '') + '」完成（裝瓶 ' + (Number(p.bottleCount) || item.qty || 0) + '）');
    const allDone = items.every(function (it) { return it.status === '完成'; });
    const orderStatus = allDone ? '已完成' : '製作中';
    ws.getRange(rowIdx + 1, 5).setValue(JSON.stringify(items)); // E 酒款明細
    ws.getRange(rowIdx + 1, 9).setValue(orderStatus);           // I 製作狀態
    return { ok: true, batchId: batch.id, orderStatus: orderStatus, item: item.product };
  } finally { lock.releaseLock(); }
}

// ── 儲存製程備註 ─────────────────────────────────────────────
function saveProcessNote(p) {
  const { client, sheet, note } = p;
  const ss = getClientSS(client);
  const ws = ss.getSheetByName(sheet);
  if (!ws) return { ok: false, error: '找不到分頁' };
  const data = ws.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === '製程備註') {
      ws.getRange(i + 1, 2).setValue(note);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到製程備註列' };
}

// ── 原料庫 ───────────────────────────────────────────────────
// ── 固體原料判讀（兩層）─────────────────────────────────────
// 第1層：K欄明確標記（1/true/是/✓/v/y → 固體；0/否/x/n → 非固體，可覆寫分類預設）
// 第2層：K欄空白時依大分類預設（2026-06-12 實機資料驗證，與既有54筆固體標記100%一致）
const SOLID_CATEGORIES = ['新鮮/乾燥花草','配料/蜜餞','香料','木頭','茶葉/茶包'];
function detectSolid(kCell, category) {
  if (kCell === true) return true; // checkbox 勾選
  const k = String(kCell == null ? '' : kCell).trim().toLowerCase();
  if (k === '1' || k === 'true' || k === '是' || k === '✓' || k === 'v' || k === 'y') return true;
  if (k === '0' || k === '否' || k === 'x' || k === 'n') return false;
  return SOLID_CATEGORIES.indexOf(category) >= 0;
}

function getInventory() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('inventory_v2');
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.openById('1uadQOdbLBmbNFfPKaiqy_QFQ0Lcw79nmojmvis66kKE');
  const ws = ss.getSheetByName('彙整價格表');
  if (!ws) return { ok: false, error: '找不到彙整價格表' };
  const rows = ws.getDataRange().getValues();
  const items = [];
  let curCat = '';
  for (let i = 5; i < rows.length; i++) { // Row6+ 才是資料
    const row = rows[i];
    const a = String(row[0] || '').trim();
    if (a.indexOf('▌') >= 0) { curCat = a.replace(/▌/g, '').trim(); continue; }
    if (!a) continue;
    const brand = String(row[1] || '').trim();
    const name = String(row[2] || '').trim();
    const abv = parseFloat(row[3]) || 0;
    const price = parseFloat(row[4]) || 0;
    const vol = parseFloat(row[5]) || 0;             // F欄：容量ml
    let unitCost = parseFloat(row[6]) || 0;          // G欄：每ml單價
    if (!unitCost && price > 0 && vol > 0) unitCost = price / vol; // G欄空白時自動補算
    const platform = String(row[7] || '').trim();
    if (!name) continue;
    const category = a !== name ? a : curCat;
    const isSolid = detectSolid(row[10], category);  // K欄 + 分類兩層判讀
    items.push({ category, brand, name, abv, price, vol, unitCost, unit: unitCost, platform, isSolid });
  }
  const result = { ok: true, items };
  cache.put('inventory_v2', JSON.stringify(result), 300);
  return result;
}

// ── 毛利分析 ─────────────────────────────────────────────────
function getProfitData(p) {
  const client = p.client;
  if (!client) return { ok: false, error: '缺少 client' };
  const ss = getClientSS(client);
  const profitSheetName = getProfitSheetName(client);
  const ws = ss.getSheetByName(profitSheetName);
  if (!ws) return { ok: false, error: '找不到' + profitSheetName + '分頁' };

  const rows = ws.getDataRange().getValues();
  const list = [];

  // 格式與欄位映射全部由 CLIENTS/PROFIT_COLS 派生，不再硬編碼客戶名
  const cfg = getClientCfg(client);
  const pc = PROFIT_COLS[cfg.profitFmt];

  if (pc.twoRow) {
    let lastNm = '';
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nm = String(row[0] || '').trim() || lastNm;
      if (!nm) continue;
      if (String(row[0]).trim()) lastNm = nm;
      const abv = parseFloat(row[1]) || 0;
      const capStr = String(row[2] || '').trim();
      const cap = parseInt(capStr) || 0;
      if (!cap) continue; // 無容量 = 空白/padding 列，跳過
      const price        = parseFloat(row[pc.price]) || 0; // 含稅單價 = 售價
      const totalCostTax = parseFloat(row[pc.cost]) || 0;  // 成本
      // 欄位健檢：有容量卻讀不到售價/成本 → 不再靜默丟棄，照常回傳並標記 warn
      // （最常見成因：Sheet 插欄導致 PROFIT_COLS 欄位映射跑掉，過去會整批顯示 0 卻無提示）
      const warn = !(price > 0) || !(totalCostTax > 0);
      const profit     = Math.round((price - totalCostTax) * 100) / 100;
      const profitRate = price > 0 ? Math.round(profit / price * 1000) / 10 : 0;
      list.push({ recipeName: nm, bottle: capStr, price, abv, totalCostTax, profit, profitRate, warn });
    }
  } else {
    // FB / FBC
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nm = String(row[0] || '').trim();
      if (!nm) continue;
      const price = parseFloat(row[pc.price]) || 0;
      const cap = parseFloat(row[2]) || 0;
      const totalCostTax = parseFloat(row[pc.cost]) || 0;
      if (!price && !totalCostTax && !cap) continue; // 整列無數據 = 非酒款列，跳過
      // 欄位健檢：有酒款名稱卻讀不到售價/成本 → 不再靜默丟棄，照常回傳並標記 warn
      const warn = !(price > 0) || !(totalCostTax > 0);
      const profit = Math.round((price - totalCostTax) * 100) / 100;
      const profitRate = price > 0 ? Math.round(profit / price * 1000) / 10 : 0; // 百分比整數（55.1），與NO1分支統一
      list.push({ recipeName: nm, bottle: '4L桶', price, cap, totalCostTax, profit, profitRate, warn });
    }
  }

  const warnCount = list.filter(function(x){ return x.warn; }).length;
  return { ok: true, client, list, warnCount };
}

// ── 製作記錄 ─────────────────────────────────────────────────
function getBatchRecords() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('製作記錄');
  if (!ws) return { ok: true, records: [] };
  const rows = ws.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    records.push({
      id: String(r[0]), createdAt: String(r[1]), creator: String(r[2]),
      client: String(r[3]), pm: String(r[4]), orderId: String(r[5]),
      recipe: String(r[6]), date: String(r[7]), deliveryDate: String(r[8]),
      volume: r[9], bottle: String(r[10]), cap: r[11]==='TRUE'||r[11]===true||r[11]===1,
      frontLabel: r[12]==='TRUE'||r[12]===true||r[12]===1,
      backLabel: r[13]==='TRUE'||r[13]===true||r[13]===1,
      bottleCount: r[14], laborCost: r[15], ingredientQuote: r[16], note: String(r[17]||'')
    });
  }
  return { ok: true, records };
}

function addBatchRecord(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('製作記錄');
  if (!ws) return { ok: false, error: '找不到製作記錄分頁' };
  const id = 'B' + Date.now();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  ws.appendRow([id, now, p.creator, p.client, p.pm, p.orderId, p.recipe, p.date, p.deliveryDate,
    p.volume, p.bottle, p.cap, p.frontLabel, p.backLabel, p.bottleCount, p.laborCost, p.ingredientQuote, p.note]);
  return { ok: true, id };
}

function updateBatchRecord(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('製作記錄');
  if (!ws) return { ok: false, error: '找不到製作記錄分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(p.id)) {
      const row = i + 1;
      ws.getRange(row, 4, 1, 15).setValues([[
        p.client, p.pm, p.orderId, p.recipe, p.date, p.deliveryDate,
        p.volume, p.bottle, p.cap, p.frontLabel, p.backLabel,
        p.bottleCount, p.laborCost, p.ingredientQuote, p.note
      ]]);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到記錄 id: ' + p.id };
}

// Issue 3: 刪除製作記錄（admin 操作，刪除 Sheet 整列）
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

// ── 酒譜更改申請 ─────────────────────────────────────────────
function submitApply(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('申請記錄') || ss.getSheetByName('酒譜更改申請');
  if (!ws) return { ok: false, error: '找不到申請記錄分頁' };
  const id = 'A' + Date.now();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  ws.appendRow([id, now, p.creator, p.client, p.sheet, p.recipe, p.items, '待審核', '', '']);
  return { ok: true, id };
}

function getApplies() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('申請記錄') || ss.getSheetByName('酒譜更改申請');
  if (!ws) return { ok: true, list: [] };
  const rows = ws.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    if (String(r[7]) === '待審核') {
      list.push({ id:String(r[0]), createdAt:String(r[1]), creator:String(r[2]),
        client:String(r[3]), sheet:String(r[4]), recipe:String(r[5]), items:String(r[6]) });
    }
  }
  return { ok: true, list };
}

function reviewApply(p) {
  const approve = p.approve === 'true';
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('申請記錄') || ss.getSheetByName('酒譜更改申請');
  if (!ws) return { ok: false, error: '找不到申請記錄分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(p.id)) {
      const status = approve ? '已核准' : '已拒絕';
      ws.getRange(i+1, 8).setValue(status);
      ws.getRange(i+1, 9).setValue(p.reviewer || '');
      ws.getRange(i+1, 10).setValue(new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));
      // 核准則寫入酒譜
      if (approve) {
        try { writeApproveToRecipe(rows[i]); } catch(e) {}
      }
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到申請 id' };
}

function writeApproveToRecipe(row) {
  const client = String(row[3]), sheet = String(row[4]);
  const items = JSON.parse(String(row[6]));
  const ss = getClientSS(client);
  const ws = ss.getSheetByName(sheet);
  if (!ws) return;
  const data = ws.getDataRange().getValues();
  for (const item of items) {
    for (let i = 3; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(item.name).trim()) {
        // newVal 是百分比整數如 10，需 ÷100 還原為 0.1
        ws.getRange(i+1, 2).setValue(parseFloat(item.newVal) / 100);
        break;
      }
    }
  }
}

function getHistory() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('申請記錄') || ss.getSheetByName('酒譜更改申請');
  if (!ws) return { ok: true, list: [] };
  const rows = ws.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    if (String(r[7]) !== '待審核') {
      list.push({ id:String(r[0]), createdAt:String(r[1]), creator:String(r[2]),
        client:String(r[3]), sheet:String(r[4]), recipe:String(r[5]), items:String(r[6]),
        status:String(r[7]), reviewer:String(r[8]), reviewedAt:String(r[9]) });
    }
  }
  return { ok: true, list };
}

// ── 研發試算記錄 ─────────────────────────────────────────────
function saveRdRecord(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發試算記錄');
  if (!ws) return { ok: false, error: '找不到研發試算記錄分頁' };
  const id = 'R' + Date.now();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  ws.appendRow([id, now, p.creator, p.client, p.name, p.volume, p.bottle, p.ingredients, p.results]);
  return { ok: true, id };
}

function getRdRecords() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發試算記錄');
  if (!ws) return { ok: true, records: [] };
  const rows = ws.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    records.push({ id:String(r[0]), createdAt:String(r[1]), creator:String(r[2]),
      client:String(r[3]), name:String(r[4]), volume:r[5], bottle:String(r[6]),
      ingredients:String(r[7]), results:String(r[8]) });
  }
  return { ok: true, records };
}

function deleteRdRecord(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發試算記錄');
  if (!ws) return { ok: false, error: '找不到研發試算記錄分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(p.id)) {
      ws.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到記錄 id' };
}

// ── 研發申請 ─────────────────────────────────────────────────
// 分頁「研發申請記錄」欄位（gid=1839254296，實機確認 13 欄）：
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
    // Batch 3：核准時建立新酒譜分頁
    if (approve) {
      try {
        var newSheetName = createRecipeSheet(rows[i]);
        ws.getRange(i + 1, 14).setValue(newSheetName);  // N=newSheet 回填
      } catch(e) {
        // 建分頁失敗不影響審核狀態，但回傳 warn
        return { ok: true, warn: '核准成功但建立分頁失敗: ' + e.message };
      }
    }
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

// ── Batch 3：建立新酒譜分頁 ──────────────────────────────────
// 從研發申請記錄 row（array）建立新酒譜分頁。
// 流程：複製同客戶第一個酒譜分頁為樣板 → 清除 Row4+ 舊資料
//       → 依「型態 B 公式寫入」規格寫入原料與子料 → 回傳新分頁名稱。
// ⚠️ 動態列號是最大難點：先算好每列最終 row number，再組 H{列} 公式，避免錯位。
function createRecipeSheet(row) {
  // ── 解析輸入 ──
  var client     = String(row[3]);
  var recipeName = String(row[4]);
  var totalVol   = parseFloat(row[5]) || 4000;
  var abv        = parseFloat(row[7]) || 0;
  var rawIngs    = [];
  try { rawIngs = JSON.parse(String(row[8])); } catch(e) {}

  // ── 標準化原料 ──
  var ings = normalizeRdIngs(rawIngs, totalVol);

  // ── 取客戶 Sheet ──
  var cfg  = getClientCfg(client);
  var ss   = SpreadsheetApp.openById(cfg.id);
  var sheets = ss.getSheets();

  // ── 找樣板（同客戶第一個酒譜分頁）──
  var tmpl = null;
  for (var wi = 0; wi < sheets.length; wi++) {
    if (isRecipeSheet(sheets[wi].getName())) { tmpl = sheets[wi]; break; }
  }
  if (!tmpl) throw new Error('找不到可用樣板酒譜分頁（' + client + '）');

  // ── 推導分頁前綴（從樣板名稱去掉 strip regex）──
  var tn      = tmpl.getName();
  var stripped = tn.replace(cfg.strip, '');
  var prefix  = (stripped !== tn) ? tn.slice(0, tn.length - stripped.length) : '';
  var newSheetName = prefix + recipeName;

  // ── 防重名 ──
  for (var si = 0; si < sheets.length; si++) {
    if (sheets[si].getName() === newSheetName) throw new Error('分頁名稱已存在: ' + newSheetName);
  }

  // ── 複製樣板並改名 ──
  var ns = tmpl.copyTo(ss);
  ns.setName(newSheetName);

  // ── 動態版面計算（先排版，才能組正確的 H{列} 公式）──
  var N = ings.length;
  var allSubs = collectSubs(ings);  // 子料去重清單（跨所有複合母料）
  var S = allSubs.length;
  var hasCompound = S > 0;

  var ING_START      = 4;               // 第一個母料：Row4（1-based）
  var TOTAL_VOL_ROW  = ING_START + N;   // 總體積
  var SUB_LABEL_ROW  = hasCompound ? TOTAL_VOL_ROW + 1 : -1;  // 基礎原料 標題列
  var SUB_START_ROW  = hasCompound ? TOTAL_VOL_ROW + 2 : -1;  // 第一個子料
  var TOTAL_COST_ROW = hasCompound ? SUB_START_ROW + S : TOTAL_VOL_ROW + 1;
  var PROC_NOTE_ROW  = TOTAL_COST_ROW + 1;

  // 子料列號 map：名稱 → 1-based 列號（決定 H{列} 參照的正確列號）
  var subRowMap = {};
  allSubs.forEach(function(sub, i){ subRowMap[sub.name] = SUB_START_ROW + i; });

  // ── 清除 Row4 以下舊資料（保留 Row1-3 樣板格式）──
  var lastRow = ns.getMaxRows();
  if (lastRow >= ING_START) {
    ns.getRange(ING_START, 1, lastRow - ING_START + 1, ns.getMaxColumns()).clearContent();
  }

  // ── Row 2：更新酒款名稱(E2) 與 ABV(I2)，客戶名稱不動 ──
  ns.getRange(2, 5).setValue(recipeName);
  ns.getRange(2, 9).setValue(abv + '%');

  // ── 寫入母料列（Row4 ~ Row(3+N)）──
  ings.forEach(function(ing, idx) {
    var r = ING_START + idx;                    // 當前列號（1-based）
    ns.getRange(r, 1).setValue(ing.name);       // A：名稱
    ns.getRange(r, 2).setValue(ing.pct / 100);  // B：占比（小數，0.1=10%）
    ns.getRange(r, 3).setValue(ing.vol);        // C：實際體積
    ns.getRange(r, 4).setValue(ing.abv || 0);  // D：ABV

    if (ing.isCompound) {
      // F：複合料公式。格式：=IFERROR((H{r1}*{v1}+H{r2}*{v2})/{totalSubVol}[/0.8],"")
      // 用「絕對體積/總體積」代表比例係數，與子料列號精確對應（型態 B 公式寫入）
      var terms = (ing.subs || []).map(function(s){
        return 'H' + subRowMap[s.name] + '*' + s.vol;
      });
      var sumPart = terms.length > 1 ? '(' + terms.join('+') + ')' : terms[0];
      var fFormula = '=IFERROR(' + sumPart + '/' + ing.totalSubVol
                   + (ing.hasLoss ? '/0.8' : '') + ',"")';
      ns.getRange(r, 6).setFormula(fFormula);   // F：公式
      ns.getRange(r, 7).setValue(1);            // G = 1（per-ml cost / 1 = per-ml cost）
    } else {
      ns.getRange(r, 6).setValue(ing.price   || 0);  // F：進貨單價
      ns.getRange(r, 7).setValue(ing.unitVol || 0);  // G：包裝容量
    }
    ns.getRange(r, 8).setFormula('=IFERROR(F' + r + '/G' + r + ',"")');  // H：每ml成本
    ns.getRange(r, 9).setFormula('=IFERROR(H' + r + '*C' + r + ',"")');  // I：總成本
  });

  // ── 總體積列 ──
  ns.getRange(TOTAL_VOL_ROW, 1).setValue('總體積');
  ns.getRange(TOTAL_VOL_ROW, 3).setValue(totalVol);
  ns.getRange(TOTAL_VOL_ROW, 4).setValue(abv);

  // ── 子料區（有複合原料才建）──
  if (hasCompound) {
    ns.getRange(SUB_LABEL_ROW, 1).setValue('基礎原料');
    allSubs.forEach(function(sub, i) {
      var r = SUB_START_ROW + i;
      ns.getRange(r, 1).setValue(sub.name);
      ns.getRange(r, 6).setValue(sub.price   || 0);  // F：進貨單價
      ns.getRange(r, 7).setValue(sub.unitVol || 0);  // G：包裝容量
      ns.getRange(r, 8).setFormula('=IFERROR(F' + r + '/G' + r + ',"")');  // H：每ml成本
      // I：子料不需總成本（C欄空，不填 I 公式）
    });
  }

  // ── 總食材成本列 ──
  ns.getRange(TOTAL_COST_ROW, 1).setValue(totalVol + 'ml版總食材成本');

  // ── 製程備註 ──
  ns.getRange(PROC_NOTE_ROW, 1).setValue('製程備註');
  ns.getRange(PROC_NOTE_ROW + 1, 1).setValue('');

  // ── 清除 recipeList 快取（新分頁須出現在酒譜清單）──
  CacheService.getScriptCache().remove('recipeList_v1');

  return newSheetName;
}

// 原料標準化：把 R&D 試算格式（type='compound'）和酒譜頁格式（isCompound=true）
// 統一轉換為 createRecipeSheet 所需格式：
// { name, pct(%), vol, abv, isCompound, hasLoss, price, unitVol, totalSubVol, subs:[] }
function normalizeRdIngs(rawIngs, totalVol) {
  return rawIngs.map(function(ing) {
    // ── R&D 試算複合格式（type='compound', subs=[]）──
    if (ing.type === 'compound') {
      var subVol = (ing.subs || []).reduce(function(s, x){ return s + (parseFloat(x.volume)||0); }, 0);
      return {
        name        : String(ing.name || ''),
        pct         : totalVol > 0 ? (subVol / totalVol * 100) : 0,
        vol         : subVol,
        abv         : parseFloat(ing.abv) || 0,
        isCompound  : true,
        hasLoss     : !!ing.hasLoss,
        totalSubVol : subVol,
        subs        : (ing.subs || []).map(function(s){
          return { name: String(s.name||''), price: parseFloat(s.price)||0,
                   unitVol: parseFloat(s.unitVol)||0, vol: parseFloat(s.volume)||0 };
        })
      };
    }
    // ── 酒譜頁複合格式（isCompound=true, subMaterials=[]）──
    if (ing.isCompound && ing.subMaterials) {
      var ingVol = parseFloat(ing.vol) || parseFloat(ing.volume) || 0;
      return {
        name        : String(ing.name || ''),
        pct         : parseFloat(ing.pct) || parseFloat(ing.ratio) || 0,
        vol         : ingVol,
        abv         : parseFloat(ing.abv) || 0,
        isCompound  : true,
        hasLoss     : !!ing.hasLoss,
        totalSubVol : ingVol,
        subs        : (ing.subMaterials || []).map(function(s){
          var pv = parseFloat(s.packVol) || 1;
          return { name: String(s.name||''), price: (parseFloat(s.unitCost)||0) * pv,
                   unitVol: pv, vol: (parseFloat(s.coef)||0) * ingVol };
        })
      };
    }
    // ── 一般原料（R&D 試算 或 酒譜頁 兩種格式均相容）──
    return {
      name       : String(ing.name || ''),
      pct        : parseFloat(ing.ratio) || parseFloat(ing.pct) || 0,
      vol        : parseFloat(ing.volume) || parseFloat(ing.vol) || 0,
      abv        : parseFloat(ing.abv) || 0,
      isCompound : false,
      hasLoss    : !!ing.hasLoss,
      price      : parseFloat(ing.price) || 0,
      unitVol    : parseFloat(ing.unitVol) || 0,
      subs       : []
    };
  });
}

// 從所有複合母料收集子料，依名稱去重（先出現者優先，保留 price/unitVol）
function collectSubs(normalizedIngs) {
  var seen = {}, result = [];
  normalizedIngs.forEach(function(ing) {
    if (!ing.isCompound) return;
    (ing.subs || []).forEach(function(s) {
      if (!seen[s.name]) {
        seen[s.name] = true;
        result.push({ name: s.name, price: s.price, unitVol: s.unitVol });
      }
    });
  });
  return result;
}

// ============================================================
// 部署前自我測試（GAS 編輯器手動執行 runSelfTest）
// 對每家客戶跑 getRecipeList / getRecipe / getProfitData，
// 驗證回傳非空、profitRate 在合理區間(0–100)、毛利欄位 warn 數，
// 結果以 Logger.log 輸出，最後回傳整體 pass/fail。
// 用途：每次改 GAS、部署前手動跑一次，五分鐘擋下大半回歸。
// ============================================================
function runSelfTest() {
  const report = [];
  let pass = true;
  function ok(cond, msg) { report.push((cond ? '✅ ' : '❌ ') + msg); if (!cond) pass = false; }
  function warnMsg(msg) { report.push('⚠️ ' + msg); }

  // 1) getRecipeList：一次取全部，確認四家齊全
  let recipeList = [];
  try {
    const r = getRecipeList();
    ok(r && r.ok, 'getRecipeList ok');
    recipeList = (r && r.list) || [];
    ok(recipeList.length > 0, 'getRecipeList 非空（共 ' + recipeList.length + ' 款）');
    Object.keys(CLIENTS).forEach(function(c) {
      const n = recipeList.filter(function(x){ return x.client === c; }).length;
      ok(n > 0, '客戶[' + c + '] 酒譜清單非空（' + n + ' 款）');
    });
  } catch (e) { ok(false, 'getRecipeList 例外: ' + e.message); }

  // 2) 各客戶取第一款跑 getRecipe
  Object.keys(CLIENTS).forEach(function(c) {
    try {
      const first = recipeList.filter(function(x){ return x.client === c; })[0];
      if (!first) { warnMsg('客戶[' + c + '] 無酒譜可測 getRecipe'); return; }
      const r = getRecipe({ client: c, sheet: first.sheet });
      ok(r && r.ok, 'getRecipe[' + c + '/' + first.sheet + '] ok');
      if (r && r.ok) {
        ok((r.ingredients || []).length > 0, '  └ 原料非空（' + (r.ingredients || []).length + ' 項）');
        ok(r.abv >= 0 && r.abv <= 100, '  └ ABV 合理（' + r.abv + '%）');
        ok(r.totalVol > 0, '  └ 總體積 > 0（' + r.totalVol + 'ml）');
        const sumPct = (r.ingredients || []).reduce(function(s, x){ return s + (x.pct || 0); }, 0);
        if (Math.abs(sumPct - 100) > 2) warnMsg('  └ 占比總和 ' + Math.round(sumPct * 10) / 10 + '%（偏離 100%，請查酒譜）');
      }
    } catch (e) { ok(false, 'getRecipe[' + c + '] 例外: ' + e.message); }
  });

  // 3) 各客戶跑 getProfitData
  Object.keys(CLIENTS).forEach(function(c) {
    try {
      const r = getProfitData({ client: c });
      ok(r && r.ok, 'getProfitData[' + c + '] ok');
      if (r && r.ok) {
        ok((r.list || []).length > 0, '  └ 毛利清單非空（' + (r.list || []).length + ' 筆）');
        // profitRate 數學不變式：profit=price-cost≤price → rate≤100%（容許四捨五入到 100.5）
        // 下限放寬（賣價低於成本的虧損品項是合法資料，rate 可為負，例如 -24.7）
        const bad = (r.list || []).filter(function(x){ return !(x.profitRate <= 100.5 && x.profitRate >= -1000); });
        ok(bad.length === 0, '  └ profitRate ≤100%（虧損負值合法）' + (bad.length ? '（異常 ' + bad.length + ' 筆）' : ''));
        // 小數退化偵測：若整批毛利率絕對值都 <1.5，疑似回成 0.55 小數格式（Bug 20 回歸）
        const maxAbs = (r.list || []).reduce(function(m, x){ return Math.max(m, Math.abs(x.profitRate || 0)); }, 0);
        if ((r.list || []).length > 0 && maxAbs < 1.5) warnMsg('  └ 毛利率全 <1.5%，疑似回成小數格式（Bug 20 回歸）');
        if (r.warnCount > 0) warnMsg('  └ 欄位健檢 warn ' + r.warnCount + ' 筆（售價/成本讀不到，疑似 Sheet 欄位跑掉）');
      }
    } catch (e) { ok(false, 'getProfitData[' + c + '] 例外: ' + e.message); }
  });

  report.unshift(pass ? '===== SELF TEST: PASS =====' : '===== SELF TEST: FAIL =====');
  Logger.log(report.join('\n'));
  return { pass: pass, report: report };
}



// ============================================================
// 成品庫存模組（南坡萬v2 起步；ledger 不可變流水帳）
//   分頁：成品庫存異動（於 MAIN_SHEET_ID）
//   欄位 A異動ID B日期 C客戶 D酒款 E異動類型 F數量 G Lot編號 H關聯訂單編號 I操作人 J建立時間 K備註
//   庫存 = Σ入庫 − Σ出庫（依 客戶＋酒款）。日期一律 Utilities.formatDate 台北時區。
// ============================================================
const STOCK_SHEET_NAME = '成品庫存異動';
const STOCK_HEADERS = ['異動ID', '日期', '客戶', '酒款', '異動類型', '數量',
  'Lot編號', '關聯訂單編號', '操作人', '建立時間', '備註'];
// 欄索引（0-based）
const SK = { id: 0, date: 1, client: 2, item: 3, type: 4, qty: 5,
  lot: 6, orderNo: 7, operator: 8, createdAt: 9, note: 10 };

function _stockNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
}
function _stockToday_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd');
}
function _stockGenId_() {
  return 'M' + (new Date()).getTime();
}

// 取得（或建立）成品庫存異動分頁，並保證表頭存在
function _stockSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName(STOCK_SHEET_NAME);
  if (!ws) {
    ws = ss.insertSheet(STOCK_SHEET_NAME);
    ws.getRange(1, 1, 1, STOCK_HEADERS.length).setValues([STOCK_HEADERS]);
    ws.setFrozenRows(1);
  } else if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, STOCK_HEADERS.length).setValues([STOCK_HEADERS]);
    ws.setFrozenRows(1);
  }
  return ws;
}

// 讀 ledger 資料列（去表頭）
function _stockRows_() {
  const ws = _stockSheet_();
  if (ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow() - 1, STOCK_HEADERS.length).getValues();
}

// 某客戶＋酒款目前庫存 = Σ入庫 − Σ出庫
function _stockOf_(rows, client, item) {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[SK.client]) !== String(client)) continue;
    if (String(r[SK.item]) !== String(item)) continue;
    const q = Number(r[SK.qty]) || 0;
    if (String(r[SK.type]) === '入庫') n += q;
    else if (String(r[SK.type]) === '出庫') n -= q;
  }
  return n;
}

// 取某客戶全款酒款名稱（不硬編碼；來源 getClientRecipeList）
function _stockClientItems_(client) {
  try {
    const res = getClientRecipeList({ client: client });
    if (res && res.ok) {
      return (res.list || []).map(function (r) { return r.recipeName; })
        .filter(function (n) { return !!n; });
    }
  } catch (e) {}
  return [];
}

// ── 庫存總覽：全款 + ledger 出現過的酒款，各自 入/出/庫存 ──
function getStockOverview(p) {
  const client = p && p.client;
  if (!client) return { ok: false, error: '缺少 client' };
  try { getClientCfg(client); } catch (e) { return { ok: false, error: e.message }; }
  const rows = _stockRows_();
  const smap = _safetyMap_();
  // 酒款宇集 = 全款清單 ∪ ledger 中該客戶出現過的酒款
  const names = {};
  _stockClientItems_(client).forEach(function (n) { names[n] = true; });
  rows.forEach(function (r) {
    if (String(r[SK.client]) === String(client) && r[SK.item]) names[String(r[SK.item])] = true;
  });
  const list = Object.keys(names).map(function (item) {
    let inQty = 0, outQty = 0;
    rows.forEach(function (r) {
      if (String(r[SK.client]) !== String(client) || String(r[SK.item]) !== item) return;
      const q = Number(r[SK.qty]) || 0;
      if (String(r[SK.type]) === '入庫') inQty += q;
      else if (String(r[SK.type]) === '出庫') outQty += q;
    });
    return { item: item, inQty: inQty, outQty: outQty, stock: inQty - outQty,
      safety: smap['成品|' + client + '|' + item] || 0 };
  });
  list.sort(function (a, b) { return a.item.localeCompare(b.item); });
  return { ok: true, client: client, list: list };
}

// ── 手動入庫 ──
function stockIn(p) {
  const client = p && p.client, item = p && p.item;
  const qty = Math.floor(Number(p && p.qty));
  if (!client || !item) return { ok: false, error: '缺少客戶或酒款' };
  if (!(qty > 0)) return { ok: false, error: '數量需為正整數' };
  try { getClientCfg(client); } catch (e) { return { ok: false, error: e.message }; }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ws = _stockSheet_();
    ws.appendRow([_stockGenId_(), p.date || _stockToday_(), client, item, '入庫', qty,
      p.lot || '', '', p.operator || '', _stockNow_(), p.note || '']);
    const stock = _stockOf_(_stockRows_(), client, item);
    return { ok: true, item: item, stock: stock };
  } finally { lock.releaseLock(); }
}

// ── 手動出庫（不足擋下，回目前庫存）──
function stockOut(p) {
  const client = p && p.client, item = p && p.item;
  const qty = Math.floor(Number(p && p.qty));
  if (!client || !item) return { ok: false, error: '缺少客戶或酒款' };
  if (!(qty > 0)) return { ok: false, error: '數量需為正整數' };
  try { getClientCfg(client); } catch (e) { return { ok: false, error: e.message }; }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cur = _stockOf_(_stockRows_(), client, item);
    if (qty > cur) {
      return { ok: false, error: '庫存不足：「' + item + '」目前 ' + cur + ' 瓶，無法出庫 ' + qty + ' 瓶', stock: cur };
    }
    const ws = _stockSheet_();
    ws.appendRow([_stockGenId_(), p.date || _stockToday_(), client, item, '出庫', qty,
      '', p.orderNo || '', p.operator || '', _stockNow_(), p.note || '']);
    return { ok: true, item: item, stock: cur - qty };
  } finally { lock.releaseLock(); }
}

// ── 異動歷史（新到舊，可依酒款篩選）──
function getStockLedger(p) {
  const client = p && p.client;
  if (!client) return { ok: false, error: '缺少 client' };
  const item = p && p.item;
  const rows = _stockRows_();
  const out = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (String(r[SK.client]) !== String(client)) continue;
    if (item && String(r[SK.item]) !== String(item)) continue;
    out.push({
      id: String(r[SK.id]), date: String(r[SK.date]), client: String(r[SK.client]),
      item: String(r[SK.item]), type: String(r[SK.type]), qty: Number(r[SK.qty]) || 0,
      lot: String(r[SK.lot] || ''), orderNo: String(r[SK.orderNo] || ''),
      operator: String(r[SK.operator] || ''), createdAt: String(r[SK.createdAt] || ''),
      note: String(r[SK.note] || '')
    });
  }
  return { ok: true, client: client, list: out };
}

// ── 出貨連動 hook：依訂單編號，對每款各寫一筆出庫；防重複出貨 ──
function shipOrder(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ows = ss.getSheetByName('訂單主表');
  if (!ows) return { ok: false, error: '找不到訂單主表分頁' };
  const data = ows.getDataRange().getValues();
  let row = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderNo)) { row = data[i]; break; }
  }
  if (!row) return { ok: false, error: '找不到訂單：' + orderNo };
  const client = String(row[1]);
  let items = [];
  try { items = row[4] ? JSON.parse(row[4]) : []; } catch (e) { return { ok: false, error: '訂單酒款明細 JSON 解析失敗' }; }
  if (!items.length) return { ok: false, error: '訂單無酒款明細' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 防重複出貨：ledger 已存在此 orderNo 的出庫列 → 擋
    const rows = _stockRows_();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][SK.type]) === '出庫' && String(rows[i][SK.orderNo]) === String(orderNo)) {
        return { ok: false, error: '此訂單已出貨（' + orderNo + '），不重複扣庫存' };
      }
    }
    // 擋負庫存：彙總每款需求量，任一款不足 → 整張訂單擋下（all-or-nothing）
    const need = {};
    items.forEach(function (it) {
      const q = Math.floor(Number(it.qty)) || 0;
      if (q > 0) need[it.product || ''] = (need[it.product || ''] || 0) + q;
    });
    const short = [];
    Object.keys(need).forEach(function (prod) {
      const cur = _stockOf_(rows, client, prod);
      if (need[prod] > cur) short.push('「' + prod + '」需 ' + need[prod] + '、現有 ' + cur);
    });
    if (short.length) {
      return { ok: false, error: '成品庫存不足，整張訂單未出貨：' + short.join('；'), shortages: short };
    }
    const ws = _stockSheet_();
    const now = _stockNow_();
    const today = _stockToday_();
    let shipped = 0;
    items.forEach(function (it) {
      const qty = Math.floor(Number(it.qty)) || 0;
      if (qty <= 0) return;
      ws.appendRow([_stockGenId_(), today, client, it.product || '', '出庫', qty,
        '', orderNo, p.operator || '', now, '訂單出貨']);
      shipped++;
    });
    _logOrderChange_(orderNo, p.operator || '', '確認出貨', '扣成品庫存 ' + shipped + ' 款');
    return { ok: true, orderNo: orderNo, client: client, shippedItems: shipped };
  } finally { lock.releaseLock(); }
}

// ── 環境探針：確認此部署解析到的主表是正式還是沙盒（不回完整 id，只回尾碼）──
function getEnvInfo() {
  var prod = '1rXmA0ACRwy4jo3XEkXHZzNjJw8uZzX1jzVle-6k0V40';
  var id = MAIN_SHEET_ID;
  var hasProp = false;
  try { hasProp = !!PropertiesService.getScriptProperties().getProperty('SHEET_ID'); } catch (e) {}
  return { ok: true, env: (id === prod ? 'PROD' : 'NON-PROD'),
    sheetIdTail: String(id).slice(-6), hasProp: hasProp };
}

// ============================================================
// 玻璃瓶庫存模組（數量統計邏輯同成品庫存；不可變流水帳）
//   分頁：玻璃瓶庫存異動（於 MAIN_SHEET_ID）
//   欄位 A異動ID B日期 C瓶品名 D異動類型 E數量 F操作人 G建立時間 H備註
//   庫存 = Σ入庫 − Σ出庫（依 瓶品名）。日期沿用 _stockNow_/_stockToday_ 台北時區。
// ============================================================
const BOTTLE_SHEET_NAME = '玻璃瓶庫存異動';
const BOTTLE_TYPES = ['100ml江小白', '100ml山形香水瓶', '100ml平底香水瓶', '500ml伏特加瓶', '500ml大香水瓶'];
const BOTTLE_HEADERS = ['異動ID', '日期', '瓶品名', '異動類型', '數量', '操作人', '建立時間', '備註'];
const BK = { id: 0, date: 1, item: 2, type: 3, qty: 4, operator: 5, createdAt: 6, note: 7 };

function _bottleSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName(BOTTLE_SHEET_NAME);
  if (!ws) {
    ws = ss.insertSheet(BOTTLE_SHEET_NAME);
    ws.getRange(1, 1, 1, BOTTLE_HEADERS.length).setValues([BOTTLE_HEADERS]);
    ws.setFrozenRows(1);
  } else if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, BOTTLE_HEADERS.length).setValues([BOTTLE_HEADERS]);
    ws.setFrozenRows(1);
  }
  return ws;
}

function _bottleRows_() {
  const ws = _bottleSheet_();
  if (ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow() - 1, BOTTLE_HEADERS.length).getValues();
}

function _bottleStockOf_(rows, item) {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][BK.item]) !== String(item)) continue;
    const q = Number(rows[i][BK.qty]) || 0;
    if (String(rows[i][BK.type]) === '入庫') n += q;
    else if (String(rows[i][BK.type]) === '出庫') n -= q;
  }
  return n;
}

// ── 玻璃瓶庫存總覽：固定 5 款 ∪ ledger 出現過的瓶型 ──
function getBottleOverview() {
  const rows = _bottleRows_();
  const smap = _safetyMap_();
  const names = {};
  BOTTLE_TYPES.forEach(function (n) { names[n] = true; });
  rows.forEach(function (r) { if (r[BK.item]) names[String(r[BK.item])] = true; });
  const ordered = BOTTLE_TYPES.slice();
  Object.keys(names).forEach(function (n) { if (ordered.indexOf(n) < 0) ordered.push(n); });
  const list = ordered.map(function (item) {
    let inQty = 0, outQty = 0;
    rows.forEach(function (r) {
      if (String(r[BK.item]) !== item) return;
      const q = Number(r[BK.qty]) || 0;
      if (String(r[BK.type]) === '入庫') inQty += q;
      else if (String(r[BK.type]) === '出庫') outQty += q;
    });
    return { item: item, inQty: inQty, outQty: outQty, stock: inQty - outQty,
      safety: smap['玻璃瓶||' + item] || 0 };
  });
  return { ok: true, list: list };
}

// ── 入庫 ──
function bottleIn(p) {
  const item = p && p.item;
  const qty = Math.floor(Number(p && p.qty));
  if (!item) return { ok: false, error: '缺少瓶品名' };
  if (!(qty > 0)) return { ok: false, error: '數量需為正整數' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ws = _bottleSheet_();
    ws.appendRow([_stockGenId_(), p.date || _stockToday_(), item, '入庫', qty,
      p.operator || '', _stockNow_(), p.note || '']);
    return { ok: true, item: item, stock: _bottleStockOf_(_bottleRows_(), item) };
  } finally { lock.releaseLock(); }
}

// ── 出庫（不足擋下，回目前庫存）──
function bottleOut(p) {
  const item = p && p.item;
  const qty = Math.floor(Number(p && p.qty));
  if (!item) return { ok: false, error: '缺少瓶品名' };
  if (!(qty > 0)) return { ok: false, error: '數量需為正整數' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cur = _bottleStockOf_(_bottleRows_(), item);
    if (qty > cur) {
      return { ok: false, error: '庫存不足：「' + item + '」目前 ' + cur + ' 個，無法出庫 ' + qty + ' 個', stock: cur };
    }
    const ws = _bottleSheet_();
    ws.appendRow([_stockGenId_(), p.date || _stockToday_(), item, '出庫', qty,
      p.operator || '', _stockNow_(), p.note || '']);
    return { ok: true, item: item, stock: cur - qty };
  } finally { lock.releaseLock(); }
}

// ── 異動歷史（新到舊，可依瓶型篩選）──
function getBottleLedger(p) {
  const item = p && p.item;
  const rows = _bottleRows_();
  const out = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (item && String(r[BK.item]) !== String(item)) continue;
    if (String(r[BK.type]) === '品項建立') continue; // 建立列不列入異動歷史
    out.push({
      id: String(r[BK.id]), date: String(r[BK.date]), item: String(r[BK.item]),
      type: String(r[BK.type]), qty: Number(r[BK.qty]) || 0,
      operator: String(r[BK.operator] || ''), createdAt: String(r[BK.createdAt] || ''),
      note: String(r[BK.note] || '')
    });
  }
  return { ok: true, list: out };
}

// ── 新增玻璃瓶品項（寫一筆 0 數量「品項建立」ledger 列；getBottleOverview 派生自動繼承全套邏輯）──
function addBottleItem(p) {
  const item = String((p && p.item) || '').trim();
  if (!item) return { ok: false, error: '缺少品項名稱' };
  if (BOTTLE_TYPES.indexOf(item) >= 0) return { ok: false, error: '品項已存在：' + item };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 鎖後重查，防併發重複
    if (_bottleRows_().some(function (r) { return String(r[BK.item]) === item; })) {
      return { ok: false, error: '品項已存在：' + item };
    }
    _bottleSheet_().appendRow([_stockGenId_(), _stockToday_(), item, '品項建立', 0,
      p.operator || '', _stockNow_(), '新增品項']);
    return { ok: true, item: item };
  } finally { lock.releaseLock(); }
}

// ============================================================
// 安全水位模組（成品 + 玻璃瓶通用；低於水位在登入後警告）
//   分頁：安全水位設定（於 MAIN_SHEET_ID）
//   欄位 A類別(成品/玻璃瓶) B客戶(成品才有) C品名 D安全水位 E更新人 F更新時間
//   key = 類別|客戶|品名（玻璃瓶客戶留空）
// ============================================================
const SAFETY_SHEET_NAME = '安全水位設定';
const SAFETY_HEADERS = ['類別', '客戶', '品名', '安全水位', '更新人', '更新時間'];
const SF = { cat: 0, client: 1, item: 2, level: 3, operator: 4, updatedAt: 5 };

function _safetySheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName(SAFETY_SHEET_NAME);
  if (!ws) {
    ws = ss.insertSheet(SAFETY_SHEET_NAME);
    ws.getRange(1, 1, 1, SAFETY_HEADERS.length).setValues([SAFETY_HEADERS]);
    ws.setFrozenRows(1);
  } else if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, SAFETY_HEADERS.length).setValues([SAFETY_HEADERS]);
    ws.setFrozenRows(1);
  }
  return ws;
}

function _safetyRows_() {
  const ws = _safetySheet_();
  if (ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow() - 1, SAFETY_HEADERS.length).getValues();
}

// key → level 快查表（供 overview / alerts 併入）
function _safetyMap_() {
  const map = {};
  _safetyRows_().forEach(function (r) {
    const key = String(r[SF.cat]) + '|' + String(r[SF.client] || '') + '|' + String(r[SF.item]);
    map[key] = Number(r[SF.level]) || 0;
  });
  return map;
}

// 全部安全水位（設定 UI 用）
function getSafetyLevels() {
  const list = _safetyRows_().map(function (r) {
    return {
      category: String(r[SF.cat]), client: String(r[SF.client] || ''),
      item: String(r[SF.item]), level: Number(r[SF.level]) || 0
    };
  });
  return { ok: true, list: list };
}

// 設定/更新一筆安全水位（倉管/admin；同 類別+客戶+品名 覆蓋）
function setSafetyLevel(p) {
  const category = p && p.category, item = p && p.item;
  const client = (p && p.client) || '';
  const level = Math.floor(Number(p && p.level));
  if (category !== '成品' && category !== '玻璃瓶') return { ok: false, error: '類別需為 成品 或 玻璃瓶' };
  if (!item) return { ok: false, error: '缺少品名' };
  if (!(level >= 0)) return { ok: false, error: '安全水位需為 0 或正整數' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ws = _safetySheet_();
    const data = ws.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][SF.cat]) === category &&
        String(data[i][SF.client] || '') === String(client) &&
        String(data[i][SF.item]) === String(item)) {
        ws.getRange(i + 1, SF.level + 1).setValue(level);
        ws.getRange(i + 1, SF.operator + 1).setValue(p.operator || '');
        ws.getRange(i + 1, SF.updatedAt + 1).setValue(_stockNow_());
        return { ok: true, updated: true, category: category, client: client, item: item, level: level };
      }
    }
    ws.appendRow([category, client, item, level, p.operator || '', _stockNow_()]);
    return { ok: true, updated: false, category: category, client: client, item: item, level: level };
  } finally { lock.releaseLock(); }
}

// 低於安全水位的品項（登入後警告用）；水位=0 視為未設不警告
function getStockAlerts() {
  const rows = _safetyRows_();
  if (!rows.length) return { ok: true, count: 0, alerts: [] };
  const stockRows = _stockRows_();
  const bottleRows = _bottleRows_();
  const alerts = [];
  rows.forEach(function (r) {
    const cat = String(r[SF.cat]);
    const client = String(r[SF.client] || '');
    const item = String(r[SF.item]);
    const level = Number(r[SF.level]) || 0;
    if (level <= 0) return;
    let stock = 0;
    if (cat === '成品') stock = _stockOf_(stockRows, client, item);
    else if (cat === '玻璃瓶') stock = _bottleStockOf_(bottleRows, item);
    else return;
    if (stock < level) alerts.push({ category: cat, client: client, item: item, stock: stock, level: level });
  });
  return { ok: true, count: alerts.length, alerts: alerts };
}

// ============================================================
// Run Card 模組（v2.6）：製酒各站點紀錄表
//   分頁：RunCard（於 MAIN_SHEET_ID，表頭自動建立）
//   欄位 A卡號 B訂單編號 C客戶 D酒款 E酒譜sheet F瓶型 G生產日期 H產品PM
//        I Lot批號 J版本 K資料JSON L狀態 M建立人 N建立時間 O更新人 P更新時間
//   資料JSON = { totalVol, bottles, labelFront, labelBack, processNote,
//     liquids:[{name,pct,abv,vol,fed,ordered,note}],
//     solids:[{name,ratio,fed,note}],
//     stations:[{no,name,note,operator,done}] }
//   一張訂單多酒款＝每酒款一張卡；同酒款可多次生產＝多張卡（歷史）。
// ============================================================
const RUNCARD_SHEET_NAME = 'RunCard';
const RUNCARD_HEADERS = ['卡號', '訂單編號', '客戶', '酒款', '酒譜sheet', '瓶型', '生產日期',
  '產品PM', 'Lot批號', '版本', '資料JSON', '狀態', '建立人', '建立時間', '更新人', '更新時間'];

function _runcardSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName(RUNCARD_SHEET_NAME);
  if (!ws) {
    ws = ss.insertSheet(RUNCARD_SHEET_NAME);
    ws.getRange(1, 1, 1, RUNCARD_HEADERS.length).setValues([RUNCARD_HEADERS]);
    ws.setFrozenRows(1);
    // Lot批號欄文字格式，防開頭 0 被吃掉
    var mr = ws.getMaxRows() - 1;
    if (mr > 0) ws.getRange(2, 9, mr, 1).setNumberFormat('@');
  } else if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, RUNCARD_HEADERS.length).setValues([RUNCARD_HEADERS]);
  }
  return ws;
}
function _genRunCardNo_(ws, orderNo) {
  const data = ws.getDataRange().getValues();
  // v2.7：綁訂單的卡＝「訂單編號-01」流水（跟著訂單走）；未綁訂單維持 RC-YYYYMMDD-NNN
  if (orderNo) {
    const prefix = String(orderNo).trim() + '-';
    let maxSeq = 0;
    for (let i = 1; i < data.length; i++) {
      const no = String(data[i][0] || '');
      if (no.indexOf(prefix) === 0) {
        const seq = parseInt(no.slice(prefix.length), 10) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    return prefix + ('0' + (maxSeq + 1)).slice(-2);
  }
  const datePart = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const prefix2 = 'RC-' + datePart + '-';
  let maxSeq2 = 0;
  for (let i = 1; i < data.length; i++) {
    const no = String(data[i][0] || '');
    if (no.indexOf(prefix2) === 0) {
      const seq = parseInt(no.slice(prefix2.length), 10);
      if (seq > maxSeq2) maxSeq2 = seq;
    }
  }
  return prefix2 + ('00' + (maxSeq2 + 1)).slice(-3);
}
function _runcardRowToObj_(r) {
  let data = {};
  try { data = r[10] ? JSON.parse(r[10]) : {}; } catch (e) { data = {}; }
  return {
    id: String(r[0]), orderNo: String(r[1] == null ? '' : r[1]),
    client: String(r[2] == null ? '' : r[2]), product: String(r[3] == null ? '' : r[3]),
    sheet: String(r[4] == null ? '' : r[4]), bottleType: String(r[5] == null ? '' : r[5]),
    prodDate: _fmtDate_(r[6]), pm: String(r[7] == null ? '' : r[7]),
    lot: String(r[8] == null ? '' : r[8]), version: String(r[9] == null ? '' : r[9]),
    data: data, status: String(r[11] == null ? '' : r[11]),
    creator: String(r[12] == null ? '' : r[12]), createdAt: _fmtDateTime_(r[13]),
    updater: String(r[14] == null ? '' : r[14]), updatedAt: _fmtDateTime_(r[15])
  };
}
// 儲存（id 空＝新建；有 id＝整卡覆寫更新）
function saveRunCard(p) {
  if (!p.client || !p.product) return { ok: false, error: '缺少 客戶 或 酒款' };
  let dataStr = String(p.data || '{}');
  try { JSON.parse(dataStr); } catch (e) { return { ok: false, error: 'Run Card 資料 JSON 解析失敗' }; }
  const ws = _runcardSheet_();
  const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
  const user = String(p._user || p.user || '');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (p.id) {
      const data = ws.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(p.id)) {
          ws.getRange(i + 1, 2, 1, 11).setValues([[
            String(p.orderNo || ''), String(p.client), String(p.product),
            String(p.sheet || ''), String(p.bottleType || ''), String(p.prodDate || ''),
            String(p.pm || ''), String(p.lot || ''), String(p.version || ''),
            dataStr, String(p.status || '進行中')
          ]]);
          ws.getRange(i + 1, 15, 1, 2).setValues([[user, now]]);
          if (p.orderNo) _logOrderChange_(p.orderNo, user, 'Run Card', '更新 ' + p.id + '（' + p.product + '）');
          return { ok: true, id: String(p.id) };
        }
      }
      return { ok: false, error: '找不到 Run Card：' + p.id };
    }
    const id = _genRunCardNo_(ws, p.orderNo);
    ws.appendRow([id, String(p.orderNo || ''), String(p.client), String(p.product),
      String(p.sheet || ''), String(p.bottleType || ''), String(p.prodDate || ''),
      String(p.pm || ''), String(p.lot || ''), String(p.version || ''),
      dataStr, String(p.status || '進行中'), user, now, user, now]);
    ws.getRange(ws.getLastRow(), 9).setNumberFormat('@').setValue(String(p.lot || ''));
    if (p.orderNo) _logOrderChange_(p.orderNo, user, 'Run Card', '建立 ' + id + '（' + p.product + '）');
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}
// 查詢：可依 orderNo、client、product 過濾（都給就 AND），新→舊排序
function getRunCards(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName(RUNCARD_SHEET_NAME);
  if (!ws) return { ok: true, cards: [] };
  const data = ws.getDataRange().getValues();
  const cards = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    if (p && p.orderNo && String(r[1]) !== String(p.orderNo)) continue;
    if (p && p.client && String(r[2]) !== String(p.client)) continue;
    if (p && p.product && String(r[3]) !== String(p.product)) continue;
    cards.push(_runcardRowToObj_(r));
  }
  cards.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
  return { ok: true, cards: cards };
}
function getRunCard(p) {
  if (!p || !p.id) return { ok: false, error: '缺少 id' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName(RUNCARD_SHEET_NAME);
  if (!ws) return { ok: false, error: '尚無 Run Card 資料' };
  const data = ws.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) return { ok: true, card: _runcardRowToObj_(data[i]) };
  }
  return { ok: false, error: '找不到 Run Card：' + p.id };
}
// 刪除（admin 限定；比照 deleteOrder）
function deleteRunCard(p) {
  if (p._role !== 'admin') return { ok: false, error: '僅管理員可刪除 Run Card' };
  if (!p.id) return { ok: false, error: '缺少 id' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName(RUNCARD_SHEET_NAME);
  if (!ws) return { ok: false, error: '尚無 Run Card 資料' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = ws.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.id)) {
        const orderNo = String(data[i][1] || '');
        ws.deleteRow(i + 1);
        if (orderNo) _logOrderChange_(orderNo, p._user || '', 'Run Card', '刪除 ' + p.id);
        return { ok: true, id: String(p.id) };
      }
    }
    return { ok: false, error: '找不到 Run Card：' + p.id };
  } finally { lock.releaseLock(); }
}
