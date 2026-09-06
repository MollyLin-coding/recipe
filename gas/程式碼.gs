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
  // v2.8 OEM-Babyface 轉正式客戶（主公提供酒譜表，link 分享讀取；5 款 BF_ 前綴）
  'OEM-Babyface': {
    id: '1BLZREU_iCSij55jLApYZgPawISYF3reF2rsilqz3K6s',
    prefix: /^BF_/i, strip: /^BF_/i,
    profitSheet: 'BF_報價毛利分析', profitFmt: 'bf-2row',
  },
  // v3.10 全客製-酒肉朋友 轉正式客戶（主公提供「酒肉朋友酒譜資料庫」20260807）
  // ⚠️ 此書分頁「無前綴」（如「梨香蜜桃紅烏龍調酒」），以「調酒」結尾為識別（毛利/報價分頁本就被 isRecipeSheet 排除）；
  //    suffix 式 strip 不適用「審核核准建新分頁」的前綴推導（createRecipeSheet），此客戶暫不支援該功能。
  '全客製-酒肉朋友': {
    id: '1GguVGe67xnq1GlMVqUSb1GUQrT-tzXTLXAl2yVpvh1Q',
    prefix: /調酒$/, strip: /調酒$/,
    profitSheet: '報價毛利', profitFmt: 'jrp-1row',
  },
  // v3.15 全客製-昭和浪漫冰室 轉正式客戶（主公提供「昭和浪漫冰室_酒譜資料庫」20260821）
  // 分頁前綴 SH_（主公已於試算表加好）；毛利分頁名為「報價毛利分析」。
  // 未建譜 3 款（百香果碧螺春/紅袍羅漢萊姆酒/錫蘭紅茶hot zombie）成本欄空白 → getProfitData 會標 warn，屬預期。
  '全客製-昭和浪漫冰室': {
    id: '1OhqlXI7kDOH_SvwXblnx8ltzEXsGuFud2ZTNWQk39NA',
    prefix: /^SH_/i, strip: /^SH_/i,
    profitSheet: '報價毛利分析', profitFmt: 'sh-1row',
  },
  // v3.23 全客製-好野吧 轉正式客戶（主公提供「好野吧_酒譜資料庫」20260827）
  // 客戶鍵沿用既有的 'OEM-好野吧'（前端 CLIENT_LABELS 顯示「全客製-好野吧」，歷史訂單存的也是這個值）
  // 分頁前綴＝中文「好野吧-」；主公已將暫不上線的 4 款（老鷹教父40/網球時尚/E式快攻/羽球瘋琴）前綴移除。
  // capMap：本表無「使用瓶型」欄，改由容量對照瓶型名（否則會顯示 100ml/20000ml 這種假瓶型）。
  'OEM-好野吧': {
    id: '1v8WSv-L5Ox-AOcqMBgXyj-HyXwYyIp4FRDVqhwodF1M',
    prefix: /^好野吧-/, strip: /^好野吧-/,
    profitSheet: '好野吧-報價毛利分析', profitFmt: 'hyb-1row',
    capMap: { 100: '100ml江小白', 500: '500ml伏特加瓶', 1800: '1800ml玻璃瓶', 20000: '20公升有水龍頭桶' },
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
  // OEM-Babyface：A酒款 B售價 C容量 D總成本，一酒款兩列(100ml/500ml)、無 ABV 欄
  'bf-2row':    { price: 1, cost: 3, twoRow: true, noAbv: true },
  // 全客製-酒肉朋友：A品名 B容量 C含稅單價 D成本 …… G使用瓶型，單列式
  'jrp-1row':   { price: 2, cost: 3, capCol: 1, bottleCol: 6 },
  // 昭和浪漫冰室：A品名 B容量 C含稅單價 D成本 E報價 F毛利 G毛利率 H使用瓶型，單列式
  // 售價讀 C 含稅單價（主公拍板）；比 jrp-1row 多一欄「報價」，故 bottleCol=7 而非 6
  'sh-1row':    { price: 2, cost: 3, capCol: 1, bottleCol: 7 },
  // 好野吧：A品名 B容量 C含稅單價 D扣除後標費 E客製瓶身LOGO印刷費 F報價 G成本 H毛利 I毛利率，單列式、無瓶型欄
  // ⚠️ 售價讀 F 報價(5) 而非 C 含稅單價(2)：C 未含印刷費、與成本基準不同，讀 C 會讓 100ml 出現負毛利（主公 20260827 拍板讀 F）
  'hyb-1row':   { price: 5, cost: 6, capCol: 1 },
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
var FBVIEW_ALLOWED_ACTIONS = ['getRecipeList', 'getRecipe', 'changePassword', 'bootstrap', 'whoami'];
// v3.7 P0-1 角色權限矩陣（後端統一把關；補「持有效 token 即可呼叫任意寫入 action」的洞）。
// 規則：列於此表的 action 僅限指定角色；未列者＝任何已登入者皆可（讀取與日常操作）。
// admin 一律放行（各清單皆含 admin）。FB觀看 另有更嚴格白名單（見 FBVIEW_ALLOWED_ACTIONS）。
// 各業務函式原有的 p._role 內檢查保留為縱深防禦，本表為第一道統一閘門。
var ROLE_MATRIX = {
  // 訂單建立/編輯 → admin + PM(v3.9 主公拍板：Vic/阿軒可自建單；金流/配送編輯/刪除仍僅 admin)
  createOrder: ['admin', 'PM'], updateOrder: ['admin', 'PM'], updateOrderFinance: ['admin'],
  updateOrderDelivery: ['admin'], deleteOrder: ['admin'],
  reviewApply: ['admin'], reviewRdApply: ['admin'],
  migrateOrderNos: ['admin'], migrateOrderTypes: ['admin'], backfillOrderCreators: ['admin'],
  deleteBatchRecord: ['admin'], deleteRunCard: ['admin'], deleteRdRecord: ['admin'],
  checkUser: ['admin'],
  // 完成回報/確認出貨日/出貨扣庫、成品與玻璃瓶庫存異動、新增瓶品項、安全水位 → admin + 倉管
  completeOrderItem: ['admin', '倉管'], confirmShipDate: ['admin', '倉管'], shipOrder: ['admin', '倉管'],
  stockIn: ['admin', '倉管'], stockOut: ['admin', '倉管'],
  bottleIn: ['admin', '倉管'], bottleOut: ['admin', '倉管'], addBottleItem: ['admin', '倉管'],
  setSafetyLevel: ['admin', '倉管'],
  // v3.26 實際出貨紀錄：登打出貨＝出貨作業(admin+倉管)；刪除紀錄是破壞性動作＝僅 admin
  addShipment: ['admin', '倉管'], deleteShipment: ['admin'],
  // v3.28 經銷商寄售：經銷商本人＋admin 可登記售出/異動；對帳單產生/結清/設定/種子 僅 admin；總覽 admin+財務
  consignMe: ['admin', '財務', '經銷商'], consignSale: ['admin', '經銷商'], consignAdjust: ['admin', '經銷商'],
  consignLedger: ['admin', '財務', '經銷商'], consignStatements: ['admin', '財務', '經銷商'],
  consignDealers: ['admin', '財務', 'PM'], consignPrices: ['admin', '財務'], consignOverview: ['admin', '財務'], consignAlerts: ['admin', '財務'],
  consignSaveDealer: ['admin'], consignStatementCreate: ['admin'], consignStatementSettle: ['admin'], consignSeed: ['admin'], consignStatementDelete: ['admin'],
  // v3.29 叫貨：送出＝經銷商本人或 admin 代填；放行/駁回/測試信 僅 admin
  consignRestockCreate: ['admin', '經銷商'], consignRestockList: ['admin', '財務', '經銷商'], consignRestockApprove: ['admin'], consignRestockReject: ['admin'], consignMailTest: ['admin'], consignResetDealer: ['admin'],
  // v3.39 業績模型：僅 admin（Kevin／Molly）；財務／PM／倉管／FB觀看 一律 403，CONSIGN_DEALER_ACTIONS 白名單不加（經銷商 403）
  perfGet: ['admin'], perfSave: ['admin'], perfReset: ['admin'],
  // v3.40 廠務支出／固定成本：僅 admin（Kevin／Molly）；expImport 另可帶 CRM_CASH_KEY 免 token（本機匯入腳本）
  expList: ['admin'], expSave: ['admin'], expDelete: ['admin'], expImport: ['admin'], fixedGet: ['admin'], fixedSave: ['admin']
};
// v3.38 POST 入口：大 payload（經銷商設定含授權酒款 JSON／長文字、建單明細…）走 POST，免 GET 網址過長被 Google 回 400 HTML 頁。
//   前端以 text/plain 送 JSON body（免 CORS preflight）；解析後與 doGet 走完全相同的流程（token 閘門／角色／派發）。
function doPost(e) {
  var p = null;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || ''); } catch (err) { p = null; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = (e && e.parameter) || {};
  return doGet({ parameter: p });
}
function doGet(e) {
  const p = e.parameter || {};
  const action = p.action || '';
  let result;
  try {
    // v2.1 輕量 session token：除 login/getEnvInfo 外，所有 action 一律要求有效 token
    // v3.40 匯入腳本免 token：expImport 帶 key＝Script Property CRM_CASH_KEY 時視為 admin（操作人「匯入腳本」；一次性搬 Google 支出表用）
    var _expKeyOk = (action === 'expImport' && !!_crmCashKey_() && String(p.key || '') === _crmCashKey_());
    if (_expKeyOk) { p._user = '匯入腳本'; p._role = 'admin'; }
    if (!_expKeyOk && action !== 'login' && action !== 'getEnvInfo' && action !== 'crmCashRead' && action !== 'crmCashKeySetup') {
      const sess = _getSession_(p.token);
      if (!sess) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'SESSION_EXPIRED' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      p._user = sess.username; p._role = sess.role; p._dealer = sess.dealer || '';
      // v3.28 經銷商角色：只准白名單 action，且一律用 session 綁定的經銷商鍵覆寫 p.dealer（絕不信前端參數）
      if (sess.role === CONSIGN_ROLE) {
        if (CONSIGN_DEALER_ACTIONS.indexOf(action) < 0) {
          return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '權限不足' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        if (!sess.dealer) {
          return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '此帳號尚未綁定經銷商，請聯絡南坡萬' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        p.dealer = sess.dealer;
      }
      if (sess.role === 'FB觀看' && FBVIEW_ALLOWED_ACTIONS.indexOf(action) < 0) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '權限不足' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      // v3.7 P0-1：角色權限矩陣統一把關（未列於表者放行）
      var _mRoles = ROLE_MATRIX[action];
      if (_mRoles && _mRoles.indexOf(sess.role) < 0) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '權限不足' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    // v3.14.4 強制刷新逃生口：使用者按 ↻ 時前端帶 fresh=1 → 先清掉該讀取對應的快取再執行。
    //   有了它，TTL 才敢拉長（資料一致性靠「寫入即失效」＋「使用者可強制繞過」，而非短 TTL 硬扛）。
    if (String(p.fresh || '') === '1' && FRESH_BUST_MAP[action]) {
      try { CacheService.getScriptCache().removeAll(FRESH_BUST_MAP[action]); } catch (e) {}
    }
    switch(action) {
      case 'getEnvInfo':
        try { CacheService.getScriptCache().removeAll(V3144_CACHE_KEYS); } catch (e) {}
        result = getEnvInfo();
        result.modules = { consign: (typeof consignMe === 'function'), perf: (typeof perfGet === 'function'), expense: (typeof expList === 'function') };   // v3.40 expense 探針   // v3.39 perf 探針   // v3.28 免登入探針：consign.gs 是否真的在部署版本裡（2026-09-03 Action 漏檔事故）
        // v3.14.5 診斷：CacheService 到底能不能用（put→get→remove 全程回報例外）
        result.cacheDiag = (function () {
          var d = {};
          // 輕量：只驗 CacheService（getEnvInfo 是保溫 ping 的目標，不可拖慢）
          try {
            var c = CacheService.getScriptCache();
            var k = 'diag_' + Utilities.getUuid();
            c.put(k, 'hello', 60);
            d.works = (c.get(k) === 'hello');
            c.remove(k);
          } catch (e) { d.error = String((e && e.message) || e); }
          // 完整診斷（Properties/Lock/跨請求 session）只在 ?diag=1 時做，避免每次都寫 Properties
          if (String(p.diag || '') !== '1' && !p.diagsess) return d;
          // v3.14.5 併測 PropertiesService／LockService，判斷是否為專案授權整體失效
          try {
            var pr = PropertiesService.getScriptProperties();
            var pk = 'diag_p_' + Utilities.getUuid();
            pr.setProperty(pk, 'hello');
            d.propsReadBack = pr.getProperty(pk);
            d.propsWorks = (d.propsReadBack === 'hello');
            pr.deleteProperty(pk);
          } catch (e) { d.propsError = String((e && e.message) || e); }
          try { var lk = LockService.getScriptLock(); lk.waitLock(2000); lk.releaseLock(); d.lockWorks = true; }
          catch (e) { d.lockError = String((e && e.message) || e); }
          // v3.14.7 跨請求 session 診斷（免密碼）：
          //   ?action=getEnvInfo&diagsess=put → 建立一個測試 session 並回傳 tk
          //   ?action=getEnvInfo&diagsess=get&tk=<tk> → **在另一個請求中**讀回，才算真的存得住
          try {
            var ds = String(p.diagsess || '');
            if (ds === 'put') {
              var ntk = 'diag_' + Utilities.getUuid();
              d.putWhere = _sessPut_(ntk, { username: '__diag__', role: '__diag__' });
              d.tk = ntk;
            } else if (ds === 'get' && p.tk) {
              var got = _getSession_(String(p.tk));
              d.crossRequestOk = !!(got && got.username === '__diag__');
              try { PropertiesService.getScriptProperties().deleteProperty('sess_' + String(p.tk)); } catch (e2) {}
              try { CacheService.getScriptCache().remove('sess_' + String(p.tk)); } catch (e2) {}
            }
          } catch (e) { d.diagSessError = String((e && e.message) || e); }
          // v3.14.6 session 端到端自我測試：不需要任何人的密碼，即可證明登入憑證存得住、讀得回
          try {
            var tk = 'diag_' + Utilities.getUuid();
            d.sessionStore = _sessPut_(tk, { username: '__diag__', role: '__diag__' });
            var back = _getSession_(tk);
            d.sessionWorks = !!(back && back.username === '__diag__' && back.role === '__diag__');
            try { PropertiesService.getScriptProperties().deleteProperty('sess_' + tk); } catch (e2) {}
            try { CacheService.getScriptCache().remove('sess_' + tk); } catch (e2) {}
          } catch (e) { d.sessionError = String((e && e.message) || e); }
          return d;
        })();
        break;                        // 環境探針(確認打到哪份主表)
      case 'login':          result = login(p); break;
      case 'whoami':         result = { ok: true, user: p._user, role: p._role }; break;   // v3.43 F5 還原專用：驗 token 零 Sheets I/O（原 probe 用 getRecipeList，冷快取要掃全部酒譜表 3~20 秒，還原停留太久＝被誤認為登出）
      case 'changePassword': result = changePassword(p); break;
      case 'checkUser':      result = checkUser(p); break;               // 帳號診斷(遮罩、不回密碼)
      case '__seedTestUsers': result = __seedTestUsers(); break;         // 沙盒限定：種驗收用測試帳號(PROD 直接拒絕)
      case '__readLoginLog':  result = __readLoginLog(); break;          // 沙盒限定：讀登入紀錄供自動驗收(PROD 直接拒絕)
      case '__readAuditLog':  result = __readAuditLog(); break;
      case '__consignReset':  result = __consignReset(p); break;         // 沙盒限定：清空寄售流水帳/對帳單供重複驗收(PROD 直接拒絕, v3.28)          // 沙盒限定：讀操作紀錄供自動驗收(PROD 直接拒絕, v3.8)
      case 'bootstrap':      result = bootstrap(p); break;                    // v3.14.4 開機一次打包(取代 6~8 個請求)
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
      case 'crmCashRead':            result = crmCashRead(p); break;             // 任務卡CRM每客戶當月實收(金鑰限定, 20260824)
      case 'crmCashKeySetup':        result = crmCashKeySetup(p); break;         // CRM金鑰一次性設定(屬性已存在即拒絕)
      case 'getStockOverview':       result = getStockOverview(p); break;        // 成品庫存
      case 'stockIn':                result = stockIn(p); break;                 // 成品庫存
      case 'stockOut':               result = stockOut(p); break;                // 成品庫存
      case 'getStockLedger':         result = getStockLedger(p); break;          // 成品庫存
      case 'shipOrder':              result = shipOrder(p); break;               // 成品庫存(出貨連動 hook)
      case 'addShipment':            result = addShipment(p); break;             // 實際出貨紀錄：新增一次出貨(v3.26)
      case 'getShipments':           result = getShipments(p); break;            // 實際出貨紀錄：查某單全部批次＋寄倉餘量(v3.26)
      case 'consignMe':              result = consignMe(p); break;              // v3.28 寄售：經銷商端整頁資料
      case 'consignSale':            result = consignSale(p); break;            // v3.28 寄售：登記售出（單價凍結）
      case 'consignAdjust':          result = consignAdjust(p); break;          // v3.28 寄售：退貨/損耗/盤點修正
      case 'consignLedger':          result = consignLedger(p); break;          // v3.28 寄售：流水帳
      case 'consignStatements':      result = consignStatements(p); break;      // v3.28 寄售：對帳單清單
      case 'consignDaily':           result = consignDaily(p); break;           // v3.30 寄售：每日銷售紀錄（月）
      case 'consignDealers':         result = consignDealers(p); break;         // v3.28 寄售：經銷商設定清單
      case 'consignSaveDealer':      result = consignSaveDealer(p); break;      // v3.28 寄售：新增/修改經銷商（折扣/結帳日）
      case 'consignPrices':          result = consignPrices(p); break;          // v3.28 寄售：牌價表
      case 'consignOverview':        result = consignOverview(p); break;        // v3.28 寄售：南坡萬端期別總覽
      case 'consignStatementCreate': result = consignStatementCreate(p); break; // v3.28 寄售：產生/重算對帳單
      case 'consignStatementSettle': result = consignStatementSettle(p); break; // v3.28 寄售：結清＋建認列單
      case 'consignAlerts':          result = consignAlerts(p); break;          // v3.28 寄售：結帳日到期提醒
      case 'consignSeed':            result = consignSeed(p); break;            // v3.28 寄售：一次性啟用種子(冪等)
      case 'consignStatementDelete': result = consignStatementDelete(p); break; // v3.28 寄售：撤銷尚未建認列單的對帳單(admin)
      case 'consignRestockCreate':   result = consignRestockCreate(p); break;   // v3.29 叫貨：店長送出（FOQ 檢查＋email）
      case 'consignRestockList':     result = consignRestockList(p); break;     // v3.29 叫貨：清單（經銷商=自己／admin=全部）
      case 'consignRestockApprove':  result = consignRestockApprove(p); break;  // v3.29 叫貨：放行→自動建出貨訂單(admin)
      case 'consignRestockReject':   result = consignRestockReject(p); break;   // v3.29 叫貨：駁回(admin)
      case 'consignMailTest':        result = consignMailTest(p); break;        // v3.29 叫貨：寄信授權驗證(admin)
      case 'consignResetDealer':     result = consignResetDealer(p); break;     // v3.35 重置經銷商測試資料(admin，不可逆)
      case 'perfGet':                result = perfGet(p); break;                // v3.39 業績模型：整頁資料(admin；首次自動種子)
      case 'perfSave':               result = perfSave(p); break;               // v3.39 業績模型：整包覆寫(admin；走 doPost)
      case 'expList':                result = expList(p); break;                // v3.40 廠務支出：該月列＋摘要＋固定成本＋金流四格(admin)
      case 'expSave':                result = expSave(p); break;                // v3.40 廠務支出：新增/覆寫一筆(admin)
      case 'expDelete':              result = expDelete(p); break;              // v3.40 廠務支出：刪一筆(admin)
      case 'expImport':              result = expImport(p); break;              // v3.40 廠務支出：批次匯入(admin 或 CRM_CASH_KEY；來源鍵去重)
      case 'fixedGet':               result = fixedGet(p); break;               // v3.40 固定成本：該月(含沿用)(admin)
      case 'fixedSave':              result = fixedSave(p); break;              // v3.40 固定成本：寫該月列(admin)
      case 'perfReset':              result = perfReset(p); break;              // v3.39 業績模型：恢復種子預設(admin；confirm=業績模型)
      case 'deleteShipment':         result = deleteShipment(p); break;          // 實際出貨紀錄：刪除某一次出貨(v3.26, admin 限定)
      case 'getBottleOverview':      result = getBottleOverview(); break;        // 玻璃瓶庫存
      case 'bottleIn':               result = bottleIn(p); break;                // 玻璃瓶庫存
      case 'bottleOut':              result = bottleOut(p); break;               // 玻璃瓶庫存
      case 'getBottleLedger':        result = getBottleLedger(p); break;         // 玻璃瓶庫存
      case 'addBottleItem':          result = addBottleItem(p); break;           // 新增玻璃瓶品項(ledger 派生)
      case 'saveRunCard':            result = saveRunCard(p); break;             // Run Card(v2.6)
      case 'getRunCards':            result = getRunCards(p); break;             // Run Card(v2.6)
      case 'getRunCardIndex':        result = getRunCardIndex(); break;          // Run Card 輕量索引(v2.9.3, 訂單列表鈕條件顯示)
      case 'getRunCard':             result = getRunCard(p); break;              // Run Card(v2.6)
      case 'deleteRunCard':          result = deleteRunCard(p); break;           // Run Card(v2.6, admin 限定)
      case 'migrateOrderNos':        result = migrateOrderNos(p); break;         // 訂單編號遷移(v2.7, admin 限定, 冪等)
      case 'migrateOrderTypes':      result = migrateOrderTypes(p); break;       // 訂單類型改制遷移(v3.0, admin 限定, 冪等)
      case 'backfillOrderCreators':  result = backfillOrderCreators(p); break;   // 建單人員一次性回填(v3.2.1, admin, 冪等只填空白)
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
    _logAction_(action, p, result); // v3.8 操作紀錄（內部 try/catch，失敗不阻斷）
    _bustOrderCache_(action, result); // v3.14.4 訂單快取失效（寫入成功即清，防「剛建的單看不到」）
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── v3.8 操作紀錄（稽核用）─────────────────────────────────────
// 記「寫入動作」＋「敏感讀取(開酒譜)」到主表「操作紀錄」分頁：時間/帳號/角色/動作/摘要/結果。
// 摘要只收白名單參數(絕不記 password/token/data 大 JSON)；appendRow 失敗不阻斷業務。
var AUDIT_ACTIONS = {
  createOrder:1, updateOrder:1, updateOrderFinance:1, updateOrderDelivery:1, deleteOrder:1,
  completeOrderItem:1, confirmShipDate:1, shipOrder:1,
  stockIn:1, stockOut:1, bottleIn:1, bottleOut:1, addBottleItem:1, setSafetyLevel:1,
  addShipment:1, deleteShipment:1,
  consignSale:1, consignAdjust:1, consignSaveDealer:1, consignStatementCreate:1, consignStatementSettle:1, consignSeed:1, consignStatementDelete:1,
  consignRestockCreate:1, consignRestockApprove:1, consignRestockReject:1, consignMailTest:1, consignResetDealer:1,
  perfSave:1, perfReset:1,   // v3.39 業績模型寫入（摘要只收白名單參數，整包 JSON 不入紀錄）
  expSave:1, expDelete:1, expImport:1, fixedSave:1,   // v3.40 廠務支出／固定成本寫入
  saveRunCard:1, deleteRunCard:1, saveProcessNote:1,
  addBatchRecord:1, updateBatchRecord:1, deleteBatchRecord:1,
  submitApply:1, reviewApply:1, saveRdRecord:1, deleteRdRecord:1, submitRdApply:1, reviewRdApply:1,
  changePassword:1, migrateOrderNos:1, migrateOrderTypes:1, backfillOrderCreators:1,
  getRecipe:1, getRecipeForProduction:1 // 敏感讀取：誰、何時、開了哪張配方(外洩溯源)
};
var AUDIT_PARAM_KEYS = ['orderNo','client','sheet','product','item','qty','id','itemIndex','category','name','level','username','approve','seq','date','dealer','period','type','paidDate','month','amount','source'];   // v3.40 +month/amount/source
function _logAction_(action, p, result) {
  if (!AUDIT_ACTIONS[action]) return;
  try {
    var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
    var ws = ss.getSheetByName('操作紀錄');
    if (!ws) {
      ws = ss.insertSheet('操作紀錄');
      ws.getRange(1, 1, 1, 6).setValues([['時間', '帳號', '角色', '動作', '摘要', '結果']]);
    }
    var parts = [];
    for (var i = 0; i < AUDIT_PARAM_KEYS.length; i++) {
      var k = AUDIT_PARAM_KEYS[i];
      if (p[k] != null && p[k] !== '') parts.push(k + '=' + String(p[k]).slice(0, 60));
    }
    ws.appendRow([Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'),
      String(p._user || ''), String(p._role || ''), action, parts.join(' '),
      (result && result.ok) ? '成功' : ('失敗:' + String((result && result.error) || '').slice(0, 80))]);
  } catch (e) { /* 紀錄失敗不阻斷 */ }
}

// ── 登入 ─────────────────────────────────────────────────────
// v2.1 session：token 存 ScriptCache（key=sess_<uuid>，TTL 6h=CacheService 上限），過期即需重新登入
var SESSION_TTL_SEC = 21600;
// ── v3.14.5 緊急（2026-08-21）────────────────────────────────────────────────
// 事故：v3.14.4 把訂單/瓶/卡片/水位等**大型資料**塞進 CacheService.getScriptCache()，
//   而**登入 session 也存在同一個 Script Cache**（key=sess_<uuid>）。資料快取把 cache 佔滿後，
//   session 的 put 失敗／get 讀不回 → `_getSession_` 的 try/catch 靜默回 null → **全員 SESSION_EXPIRED**
//   （症狀＝登入後訂單列表顯示「載入失敗」，主公 8/21 由小李畫面回報）。
// 止血：資料快取總開關預設 **false**（session 獨佔 Script Cache）；bootstrap 保留（收益不靠快取）。
// 教訓：**session 與資料不可共用同一個有限的 Script Cache**。日後要恢復快取，
//   必須改用不與 session 競爭的儲存（或嚴格限制筆數與大小）並實測 session 存活。
// 2026-08-21 稍晚：CacheService 服務已恢復（正式與測試專案皆實測 works=true）→ 重新啟用。
//   ⚠️ 若日後再次故障，最壞情況只是「快取讀不到 → 回去讀試算表」＝變慢，不會出錯；
//   真正致命的 session 已改為 Cache+Properties **無條件雙寫**（v3.14.7），不再單點依賴 cache。
var DATA_CACHE_ON = true;
var V3144_CACHE_KEYS = ['orders_v1_full_std', 'orders_v1_full_PM',
  'orders_v1_bartender_std', 'orders_v1_bartender_PM',
  'bottleOv_v1', 'rcIdx_v1', 'stockAlerts_v1'];
// v3.14.6 session 儲存：CacheService 優先，失效時自動 fallback 到 PropertiesService。
//   ⚠️ 2026-08-21 事故：CacheService 整個服務失效（put 後立刻 get 回 null 且不拋例外），
//   session 只存在那裡 → 全站 SESSION_EXPIRED、所有人無法使用。實測 Properties/Lock 正常。
//   Properties 沒有 TTL，故 payload 自帶 exp，並在 login 時順手清理過期項目。
function _sessKey_(token) { return 'sess_' + token; }
// ⚠️ v3.14.7 修正 v3.14.6 的漏洞：原本「cache 寫完立刻讀回確認，成功就不寫 Properties」。
//   但 CacheService 目前處於**同一次執行內讀得到、跨請求就消失**的半死狀態
//   → 每次都誤判為成功而跳過 Properties → 下一個請求仍 SESSION_EXPIRED。
//   正解：**無條件雙寫**（Properties 才是可靠的那份；cache 只當加速）。多一次 Properties 寫入很便宜。
function _sessPut_(token, obj) {
  var payload = JSON.stringify({ u: obj.username, r: obj.role, d: obj.dealer || '', exp: (new Date()).getTime() + SESSION_TTL_SEC * 1000 }); // v3.28 d=經銷商綁定鍵
  var where = [];
  try { CacheService.getScriptCache().put(_sessKey_(token), payload, SESSION_TTL_SEC); where.push('cache'); } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty(_sessKey_(token), payload); where.push('props'); } catch (e) {}
  return where.join('+') || 'none';
}
function _getSession_(token) {
  if (!token) return null;
  var raw = null;
  try { raw = CacheService.getScriptCache().get(_sessKey_(token)); } catch (e) {}
  if (!raw) { try { raw = PropertiesService.getScriptProperties().getProperty(_sessKey_(token)); } catch (e) {} }
  if (!raw) return null;
  var o = null;
  try { o = JSON.parse(raw); } catch (e) { return null; }
  if (!o) return null;
  if (o.exp && (new Date()).getTime() > o.exp) {   // Properties 無 TTL → 自行判過期
    try { PropertiesService.getScriptProperties().deleteProperty(_sessKey_(token)); } catch (e) {}
    return null;
  }
  // 相容舊格式 {username, role}（v3.14.6 之前寫入的 cache 項目）
  var u = (o.u != null) ? o.u : o.username;
  var r = (o.r != null) ? o.r : o.role;
  if (!u) return null;
  var sess = { username: u, role: r, dealer: (o.d != null ? String(o.d) : '') };
  // v3.42 滑動續期（修「F5 被強制登出」）：原本 token 是登入起算 6h 的固定死線，
  //   活躍使用者到點照樣被踢（F5 還原 probe 失敗＝主公看到的強制登出）。
  //   改為：剩餘壽命 < 一半（3h）就地雙寫續 6h → 有在用就不斷線；閒置超過 6h 才需重登（安全底線不變）。
  //   舊格式（無 exp）項目也會在此一併升級為含 exp 的新格式。
  try {
    var _now = (new Date()).getTime();
    if (!o.exp || (o.exp - _now) < SESSION_TTL_SEC * 500) {   // *500 = *1000/2 → 剩餘 < 3h
      _sessPut_(token, sess);
    }
  } catch (e) {}
  return sess;
}
// 清掉 Properties 裡已過期的 session（login 時呼叫；Properties 總量上限 500KB，不清會累積）
function _sessSweep_() {
  try {
    var pr = PropertiesService.getScriptProperties();
    var all = pr.getProperties();
    var now = (new Date()).getTime();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('sess_') !== 0) return;
      var ok = false;
      try { var o = JSON.parse(all[k]); ok = !!(o && o.exp && now <= o.exp); } catch (e) { ok = false; }
      if (!ok) pr.deleteProperty(k);
    });
  } catch (e) {}
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
// v3.28 使用者資料「綁定經銷商」欄位定位：表頭列有「綁定經銷商」就用它，否則預設第 6 欄(F)。
//   ⚠️ 不可用 D 欄：正式表 D=已換密碼(TRUE/FALSE)、E=建立時間，是人工維護欄位。
function _userDealerCol_(headerRow) {
  const h = headerRow || [];
  for (let i = 0; i < h.length; i++) if (String(h[i] == null ? '' : h[i]).trim() === '綁定經銷商') return i;
  return 5;
}
function login(p) {
  const username = p.username, password = p.password;
  if (!username || !password) return { ok: false, error: '請提供帳號密碼' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('使用者資料') || ss.getSheetByName('帳號');
  if (!ws) return { ok: false, error: '找不到帳號分頁' };
  const rows = ws.getDataRange().getValues();
  const dealerCol = _userDealerCol_(rows[0]);   // v3.28 綁定經銷商欄：認表頭「綁定經銷商」，找不到退回 F 欄（正式表 D=已換密碼、E=建立時間 已被佔用）
  let matchedAcc = null; // 帳號存在但密碼錯 → 記「密碼錯誤」
  for (let i = 1; i < rows.length; i++) {
    const [acc, pwd, role] = rows[i];
    const dealerKey = rows[i][dealerCol];
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
      _sessPut_(token, { username: String(username).trim(), role: finalRole, dealer: String(dealerKey == null ? '' : dealerKey).trim() });
      _sessSweep_();   // 順手清掉過期的 Properties session
      _logLogin_(username, finalRole, '成功');
      return { ok: true, role: finalRole, token: token, dealer: String(dealerKey == null ? '' : dealerKey).trim() };
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
  [['上海Jason', '111111', 'FB觀看'], ['testadmin', '999999', 'admin'],
   ['wtest', '444444', '倉管'], ['utest', '555555', 'user'], ['ftest', '666666', '財務'],
   ['pmtest', '777777', 'PM'],
   ['dtest_sun', '888888', '經銷商', '經銷商－日光貳參'], ['dtest_wing', '888889', '經銷商', '經銷商－島羽']].forEach(function (u) {   // v3.28 沙盒經銷商帳號
    const dc = _userDealerCol_(rows[0]);
    if (!have[u[0]]) {
      const row = [u[0], u[1], u[2]];
      if (u[3]) { while (row.length < dc) row.push(''); row.push(u[3]); }
      ws.appendRow(row); added.push(u[0]);
    } else if (u[3]) {
      // 已存在的沙盒經銷商帳號：把綁定鍵補到正確欄（v3.28 由 D 欄改為認表頭/F 欄）
      for (let i = 1; i < rows.length; i++) if (String(rows[i][0]).trim() === u[0]) { ws.getRange(i + 1, dc + 1).setValue(u[3]); if (dc !== 3) ws.getRange(i + 1, 4).setValue(''); }
    }
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

// 沙盒限定：讀操作紀錄末 20 筆（v3.8 自動驗收用；PROD 一律拒絕）
function __readAuditLog() {
  if (getEnvInfo().env === 'PROD') return { ok: false, error: '僅限測試環境' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('操作紀錄');
  if (!ws) return { ok: true, rows: [] };
  const data = ws.getDataRange().getValues();
  const rows = [];
  for (let i = Math.max(1, data.length - 20); i < data.length; i++) {
    rows.push({ time: String(data[i][0] || ''), user: String(data[i][1] || ''), role: String(data[i][2] || ''),
      action: String(data[i][3] || ''), summary: String(data[i][4] || ''), result: String(data[i][5] || '') });
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
  cache.put('recipeList_v1', JSON.stringify(result), 600); // v3.14.4 TTL 600＋保溫每5分鐘刷新＝使用者永遠打不到冷路徑(實測冷啟 20 秒)
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
    // v3.14.3 製作方式：E 欄(index 4)＝該原料的製法備註（酒譜表為單一事實來源，APP 唯讀帶出）
    //   例：(茶葉重 : RO水量 = 4g : 100ml, 定溫冷萃24小時)；舊酒款多為簡寫 (2:100)，原樣顯示即可。
    const method = String(row[4] == null ? '' : row[4]).trim();
    if (name && (pct > 0 || vol > 0)) {
      const ing = { name, pct, vol, abv: ingAbv, cost };
      if (method) ing.method = method;   // 無值不回傳（前端以「有值才顯示」判斷）
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
    if (ing.method) c.method = ing.method;   // v3.14.3 製作方式非成本資訊，FB觀看 亦可見
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
    if (ing.method) o.method = ing.method;   // v3.14.3 製作方式（非成本，調酒師/潔淨室需要）
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
  // v3.2 建單人員（AF=32 欄）
  if (String(ws.getRange(1, 32).getValue() || '') === '') {
    ws.getRange(1, 32).setValue('建單人員');
  }
  // v3.4 運費支付方（AG=33 欄）
  if (String(ws.getRange(1, 33).getValue() || '') === '') {
    ws.getRange(1, 33).setValue('運費支付方');
  }
  // v3.31 訂單備註（AH=34 欄）：經銷商叫貨備註帶入，列表/詳情顯示「📝 客戶備註」
  if (String(ws.getRange(1, 34).getValue() || '') === '') {
    ws.getRange(1, 34).setValue('訂單備註');
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
// v3.2.1 一次性回填：既有訂單 AF 建單人員（admin/冪等；只填空白列，已有值不動）
function backfillOrderCreators(p) {
  if (p._role !== 'admin') return { ok: false, error: '僅管理員可執行' };
  const name = String(p.name || '').trim();
  if (!name) return { ok: false, error: '缺少 name' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws || ws.getLastRow() < 2) return { ok: true, filled: 0, detail: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    _ensureOrderFinanceHeaders_(ws);
    const n = ws.getLastRow() - 1;
    const rng = ws.getRange(2, 32, n, 1);
    const vals = rng.getValues();
    const nos = ws.getRange(2, 1, n, 1).getValues();
    let filled = 0; const detail = [];
    for (let i = 0; i < n; i++) {
      if (!String(nos[i][0] || '')) continue;
      if (String(vals[i][0] || '').trim() !== '') continue;
      vals[i][0] = name; filled++; detail.push(String(nos[i][0]));
    }
    if (filled) rng.setValues(vals);
    return { ok: true, filled: filled, detail: detail };
  } finally { lock.releaseLock(); }
}
// v3.0 訂單類型改制一次性遷移（admin/冪等）：換前標公版酒、OEM客戶訂單 → 代工訂單(全客製/換前標)；南坡萬自有品牌 → 南坡萬自有酒款投產單，無金流
function migrateOrderTypes(p) {
  if (p._role !== 'admin') return { ok: false, error: '僅管理員可執行' };
  const MAP = { '換前標公版酒': '代工訂單(全客製/換前標)', 'OEM客戶訂單': '代工訂單(全客製/換前標)', '南坡萬自有品牌': '南坡萬自有酒款投產單，無金流' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws || ws.getLastRow() < 2) return { ok: true, changed: 0, detail: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rng = ws.getRange(2, 3, ws.getLastRow() - 1, 1); // C 訂單類型
    const vals = rng.getValues();
    let changed = 0;
    const detail = [];
    for (let i = 0; i < vals.length; i++) {
      const cur = String(vals[i][0] || '').trim();
      if (MAP[cur]) {
        vals[i][0] = MAP[cur]; changed++;
        detail.push(String(ws.getRange(i + 2, 1).getValue()) + '：' + cur + '→' + MAP[cur]);
      }
    }
    if (changed) rng.setValues(vals);
    return { ok: true, changed: changed, detail: detail };
  } finally { lock.releaseLock(); }
}
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
    if (it.sample && (Number(it.sample.qty) || 0) > 0) o.sample = { bottleType: String(it.sample.bottleType || ''), qty: Number(it.sample.qty) || 0, note: String(it.sample.note || '') }; // v3.4 試飲/SGS
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
    // AF 建單人員（v3.2）
    if (p.orderCreator != null && String(p.orderCreator).trim() !== '') {
      ws.getRange(ws.getLastRow(), 32).setValue(String(p.orderCreator).trim());
    }
    // AG 運費支付方（v3.4）
    if (p.shipFeePayer != null && String(p.shipFeePayer).trim() !== '') {
      ws.getRange(ws.getLastRow(), 33).setValue(String(p.shipFeePayer).trim());
    }
    // AH 訂單備註（v3.31）
    if (p.orderNote != null && String(p.orderNote).trim() !== '') {
      ws.getRange(ws.getLastRow(), 34).setValue(String(p.orderNote).trim());
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
  // v3.14.4 訂單快取（實測 getOrders 熱狀態 4.7 秒，其中 2.7 秒是試算表 I/O）。
  // ⚠️ 輸出會因 view(bartender/full) 與 _role(PM 剝金流) 而異 → **每個變體各自一把 key**，
  //    絕不像 recipeList 那樣共用（沿用 _filterRecipeListByRole_ 的教訓：過濾結果不得寫回共用 cache）。
  //    TTL 僅 30 秒，且任何訂單寫入 action 成功後由 _bustOrderCache_ 立即清除。
  const _ck = _ordersCacheKey_(p);
  if (DATA_CACHE_ON) {
    try {
      const _hit = CacheService.getScriptCache().get(_ck);
      if (_hit) return JSON.parse(_hit);
    } catch (e) {}
  }
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: true, orders: [] };
  const data = ws.getDataRange().getValues();
  // v3.26 實際出貨紀錄：一次讀「出貨紀錄」分頁彙總，逐單注入 it.shipped／it.remainStock（寄倉餘量）。
  //   衍生值不落地 → 前端 items 白名單重組 payload 也洗不掉（避開 v3.11.2 autoStockedIn 那類 bug）。
  //   刻意不呼叫 _shipSheet_()：讀取路徑不建立分頁，分頁不存在就視為零出貨。
  let _shipAgg = {};
  try {
    const _sws = ss.getSheetByName(SHIP_SHEET_NAME);
    if (_sws && _sws.getLastRow() > 1) {
      _shipAgg = _shipAggAll_(_sws.getRange(2, 1, _sws.getLastRow() - 1, SHIP_HEADERS.length).getValues());
    }
  } catch (e) { _shipAgg = {}; }
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
      lot: String(r[30] == null ? '' : r[30]),
      orderCreator: String(r[31] == null ? '' : r[31]), // v3.2 建單人員（兩種 view 皆回，非金額）
      shipFeePayer: String(r[32] == null ? '' : r[32]), // v3.4 運費支付方
      orderNote: String(r[33] == null ? '' : r[33]) // v3.31 訂單備註（經銷商叫貨備註）
    };
    // v3.26 注入出貨進度：單層 shipBatches/lastShipDate，每款 shipped(已出)/remainStock(寄倉餘量)
    const _sa = _shipAgg[base.orderNo] || null;
    base.shipBatches = _sa ? (_sa.batches || 0) : 0;
    base.lastShipDate = _sa ? (_sa.lastDate || '') : '';
    base.shipLog = _sa ? (_sa.log || []).slice().sort(function (a, b) { return a.seq - b.seq; }) : [];
    // 尚未出貨的單也要注入（shipped=0、remainStock=訂購量）＝寄倉欄位永遠有預設值
    {
      const _byKey = _sa ? (_sa.byKey || {}) : {};
      const _used = {};
      items.forEach(function (it) {
        const k = _shipKeyOf_(it.product, it.bottleType);
        // 同款同瓶型拆成多列時，已出量依序分攤，避免每列都顯示總量
        const q = Math.floor(Number(it.qty)) || 0;
        const sh = Math.min(Math.max(0, (_byKey[k] || 0) - (_used[k] || 0)), q);
        _used[k] = (_used[k] || 0) + sh;
        it.shipped = sh;
        it.remainStock = Math.max(0, q - sh);
      });
    }
    if (view === 'bartender') {
      if (base.status === '已完成' || base.status === '已出貨') continue; // 不回完成/已出貨單
      base.items = items.map(function (it) {
        const o = {
          product: it.product, sheet: it.sheet, volume: it.volume,
          bottleType: it.bottleType, qty: it.qty, status: it.status || '待製作',
          shipped: it.shipped || 0, remainStock: (it.remainStock != null ? it.remainStock : (Math.floor(Number(it.qty)) || 0))
        };
        if (it.srcClient) o.srcClient = it.srcClient; // 公版酒配方來源（Run Card 預填要用，非金額欄）
        if (it.sample) o.sample = it.sample; // v3.4 試飲/SGS（製作端要看）
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
      // v3.9 PM 視角：full view(含已完成單+total 等建單基本盤)但剝除金流明細 N~V(僅 admin/財務名單可見)
      if (p && p._role === 'PM') {
        base.depositAmount = ''; base.depositDueDate = ''; base.depositPaidDate = '';
        base.finalAmount = ''; base.finalDueDate = ''; base.finalPaidDate = '';
        base.finalAdjusted = false; base.finalAdjustedAmount = ''; base.finalAdjustNote = '';
      }
      orders.push(base);
    }
  }
  if (view === 'bartender') {
    orders.sort(function (a, b) { return (a.deliveryDate || '').localeCompare(b.deliveryDate || ''); });
  }
  const _out = { ok: true, orders: orders };
  if (DATA_CACHE_ON) { try { CacheService.getScriptCache().put(_ck, JSON.stringify(_out), 300); } catch (e) {} } // v3.14.4 TTL 5 分鐘：一致性靠「寫入即失效」而非短 TTL；使用者按 ↻ 會帶 fresh=1 強制繞過
  return _out;
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
    if (it.sample && (Number(it.sample.qty) || 0) > 0) o.sample = { bottleType: String(it.sample.bottleType || ''), qty: Number(it.sample.qty) || 0, note: String(it.sample.note || '') }; // v3.4 試飲/SGS
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
      // v3.5 P0-5：儲存前重讀表內現況，已完成款的 status/batchId 以現況為準（防編輯快照蓋掉完成狀態→重複扣瓶/重複製作記錄）
      let curItems = [];
      try { curItems = data[i][4] ? JSON.parse(data[i][4]) : []; } catch (e) { curItems = []; }
      const claimedIdx = [];
      items.forEach(function (nit) {
        for (let k = 0; k < curItems.length; k++) {
          if (claimedIdx.indexOf(k) >= 0) continue;
          if (String(curItems[k].product || '') === String(nit.product || '') && curItems[k].status === '完成') {
            nit.status = '完成';
            if (curItems[k].batchId) nit.batchId = curItems[k].batchId;
            claimedIdx.push(k);
            break;
          }
        }
      });
      const allDone = items.every(function (it) { return it.status === '完成'; });
      const anyDone = items.some(function (it) { return it.status === '完成'; });
      const status = allDone ? '已完成' : (anyDone ? '製作中' : '待製作');
      ws.getRange(i + 1, 2, 1, 9).setValues([[
        p.client, p.orderType || '', p.deliveryDate || '', JSON.stringify(items),
        Number(p.total) || 0, Number(p.balance) || 0, p.depositStatus || '', status, p.pm || ''
      ]]);
      ws.getRange(i + 1, 12).setValue(p.actualDeliveryDate || p.deliveryDate || '');
      // v3.9 PM 編輯不動金流明細 N~V(其 modal 無金流欄、getOrders 也不回給它——照寫會把 admin 填的蓋空)
      if (p._role !== 'PM') ws.getRange(i + 1, 14, 1, 9).setValues([[
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
      // AF 建單人員（v3.2；有帶參數才覆寫，舊呼叫不清空）
      if (p.orderCreator != null) ws.getRange(i + 1, 32).setValue(String(p.orderCreator).trim());
      // AG 運費支付方（v3.4；同上）
      if (p.shipFeePayer != null) ws.getRange(i + 1, 33).setValue(String(p.shipFeePayer).trim());
      // AH 訂單備註（v3.31；同上）
      if (p.orderNote != null) ws.getRange(i + 1, 34).setValue(String(p.orderNote).trim());
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
        // v3.26：連同該單的出貨紀錄一起清掉。訂單編號會被回收（刪掉當日最後一張，
        //   下一張就拿到同一個號），紀錄留著會沾到新訂單上。
        var _shipDel = 0;
        try {
          var _sws = ss.getSheetByName(SHIP_SHEET_NAME);
          if (_sws && _sws.getLastRow() > 1) {
            var _sr = _sws.getRange(2, 1, _sws.getLastRow() - 1, SHIP_HEADERS.length).getValues();
            for (var j = _sr.length - 1; j >= 0; j--) {
              if (String(_sr[j][SHP.orderNo]) === String(orderNo)) { _sws.deleteRow(j + 2); _shipDel++; }
            }
          }
        } catch (e) { /* 清紀錄失敗不阻斷刪單 */ }
        _logOrderChange_(orderNo, p._user || '', '刪除訂單',
          client + '（整張刪除，不可復原）' + (_shipDel ? ('｜同時清除出貨紀錄 ' + _shipDel + ' 列') : ''));
        return { ok: true, orderNo: orderNo, shipRowsRemoved: _shipDel };
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
      if (p.shipFeePayer != null) ws.getRange(i + 1, 33).setValue(String(p.shipFeePayer).trim()); // v3.4
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
// 任務卡APP CRM 佣金看板專用（2026-08-24 主公指示）：金鑰認證、唯讀、回「每客戶該月實收現金」
//   實收邏輯與 getFinanceSummary 的 cashReceived 完全一致：P訂金實際收取日在該月的訂金 ＋ S尾款實際收取日在該月的實際尾款(調整後優先)
//   listAll=1 時另回全部曾出現的客戶名（供任務卡別名對照設定用）
function _crmCashKey_() { try { return PropertiesService.getScriptProperties().getProperty('CRM_CASH_KEY') || ''; } catch (e) { return ''; } }
// CRM 金鑰一次性設定：只在 CRM_CASH_KEY 屬性「不存在」時可寫入一次；已設定後永久拒絕（換鑰匙請至 GAS 編輯器改 Script Property）
function crmCashKeySetup(p) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CRM_CASH_KEY')) return { ok: false, error: '金鑰已設定，拒絕覆寫' };
  const k = String((p && p.key) || '').trim();
  if (k.length < 20) return { ok: false, error: '金鑰長度不足' };
  props.setProperty('CRM_CASH_KEY', k);
  return { ok: true, set: true };
}

function crmCashRead(p) {
  const _k = _crmCashKey_();
  if (!_k || !p || String(p.key || '') !== _k) return { ok: false, error: 'CRM 金鑰錯誤或未設定' };
  const month = String((p && p.month) || '') || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { ok: true, month: month, customers: {}, allCustomers: [] };
  const data = ws.getDataRange().getValues();
  const byCust = {};
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    const client = String(r[1] || '').trim();
    if (!client) continue;
    seen[client] = true;
    const depositAmt = _numOrBlank_(r[13]);
    const finalAmt = _numOrBlank_(r[16]);
    const adjusted = (String(r[19]).toUpperCase() === 'TRUE' || r[19] === true);
    const adjAmt = _numOrBlank_(r[20]);
    const effFinal = (adjusted && adjAmt !== '') ? adjAmt : (finalAmt !== '' ? finalAmt : (Number(r[6]) || 0));
    let cash = 0;
    if (_fmtDate_(r[15]).slice(0, 7) === month && depositAmt !== '') cash += depositAmt;
    if (_fmtDate_(r[18]).slice(0, 7) === month) cash += effFinal;
    if (cash) byCust[client] = (byCust[client] || 0) + cash;
  }
  const out = { ok: true, month: month, customers: byCust };
  if (String((p && p.listAll) || '') === '1') out.allCustomers = Object.keys(seen).sort();
  return out;
}

var FINANCE_USERS = ['Kevin', 'Molly', 'Lulu'];
// v3.39 共用：一列訂單的「損益口徑」出貨月與有效金額（原 getFinanceSummary 內聯邏輯原樣抽出；perfGet 實際營收共用）
//   出貨月＝實際出貨日 L 欄，無則表訂 D 欄；有效金額＝總金額 F，若尾款有調整（T=TRUE 且 U 有值）→ 總金額 − 原尾款 ＋ 調整後尾款
function _orderRevenueRow_(r) {
  const total = Number(r[5]) || 0;
  const finalAmt = _numOrBlank_(r[16]);
  const adjusted = (String(r[19]).toUpperCase() === 'TRUE' || r[19] === true);
  const adjAmt = _numOrBlank_(r[20]);
  const shipMonth = (_fmtDate_(r[11]) || _fmtDate_(r[3])).slice(0, 7);
  let eff = total;
  if (adjusted && adjAmt !== '') {
    const origFinal = (finalAmt !== '') ? finalAmt : (Number(r[6]) || 0);
    eff = total - origFinal + adjAmt;
  }
  return { shipMonth: shipMonth, eff: eff, total: total };
}
// v3.40 共用：某月金流摘要（原 getFinanceSummary 迴圈原樣抽出；廠務支出分頁 expList 的「實收現金」共用同一口徑）
function _financeMonth_(month) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('訂單主表');
  if (!ws) return { orderRevenue: 0, cashReceived: 0, orderCount: 0 };
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
    const rev = _orderRevenueRow_(r);   // v3.39 抽成共用函式（業績模型「實際營收」同口徑）；算法逐字不變
    if (rev.shipMonth === month) { count++; revenue += rev.eff; }
    if (_fmtDate_(r[15]).slice(0, 7) === month && depositAmt !== '') cash += depositAmt;
    if (_fmtDate_(r[18]).slice(0, 7) === month) cash += effFinal;
  }
  return { orderRevenue: revenue, cashReceived: cash, orderCount: count };
}
function getFinanceSummary(p) {
  const user = String((p && p.user) || '');
  if (FINANCE_USERS.indexOf(user) < 0) return { ok: false, error: '無權限查看金流摘要' };
  const month = String((p && p.month) || '') || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const f = _financeMonth_(month);
  return { ok: true, month: month, orderRevenue: f.orderRevenue, cashReceived: f.cashReceived, orderCount: f.orderCount };
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
    if (item.status === '完成') return { ok: false, error: '此酒款已完成回報過，勿重複回報（避免重複扣瓶）' };
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
    // 3) v2.9 玻璃瓶理論扣除：瓶型對得上庫存品名 → 自動寫「出庫」（允許負庫存＝帳差訊號；實際值以倉管盤點為準）
    var bottleDeduct = null;
    try {
      var bNames = {};
      BOTTLE_TYPES.forEach(function (n) { bNames[n] = true; });
      _bottleRows_().forEach(function (rr) { if (rr[BK.item]) bNames[String(rr[BK.item])] = true; });
      var invItem = _bottleKeyOf_(String(p.bottle || item.bottleType || ''), bNames);
      var dq = Math.floor(Number(p.bottleCount)) || Math.floor(Number(item.qty)) || 0;
      if (invItem && dq > 0) {
        _bottleSheet_().appendRow([_stockGenId_(), _stockToday_(), invItem, '出庫', dq,
          p.creator || p.pm || '', _stockNow_(), '訂單 ' + orderNo + ' 完成自動扣瓶(理論)']);
        bottleDeduct = { item: invItem, qty: dq, stock: _bottleStockOf_(_bottleRows_(), invItem) };
      }
    } catch (e) { /* 扣瓶失敗不影響完成回報 */ }
    return { ok: true, batchId: batch.id, orderStatus: orderStatus, item: item.product, bottleDeduct: bottleDeduct };
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
      ws.getRange(i + 2, 1).setValue(note); // v3.5 P0-2：寫「下一列 A 欄」與 getRecipe 讀取位置一致（原誤寫同列 B 欄，存了讀不回）
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
// v3.22 毛利分頁解析：設定名找不到時，退而尋找該書內含「毛利／報價」的分頁當備援。
//   起因＝昭和浪漫冰室改分頁名加 SH_ 前綴後，設定名對不上導致整頁掛掉（見接手文件）。
//   規則：① 完全比對設定名 ② 去前綴後比對 ③ 唯一一個含毛利/報價者 ④ 皆失敗→回傳全部分頁名供除錯。
//   ⚠️ 只在「設定名找不到」時才啟動，既有四家客戶命中①，行為完全不變。
function _resolveProfitWs_(ss, want) {
  const all = ss.getSheets().map(function (s) { return s.getName(); });
  let ws = ss.getSheetByName(want);
  if (ws) return { ws: ws, used: want, all: all, fallback: false };

  const bare = String(want).replace(/^[A-Za-z0-9.]+_/, '');   // 去掉設定名的前綴，如 SH_ / NO1.V2_
  const hits = all.filter(function (n) { return n.indexOf('毛利') >= 0 || n.indexOf('報價') >= 0; });

  // ② 去前綴後同名（含對方帶前綴的情況，如 SH_報價毛利分析 ↔ 報價毛利分析）
  let pick = hits.filter(function (n) { return n.replace(/^[A-Za-z0-9.]+_/, '') === bare; })[0];
  // ③ 全書只有一個毛利/報價分頁 → 直接用它
  if (!pick && hits.length === 1) pick = hits[0];

  if (pick) return { ws: ss.getSheetByName(pick), used: pick, all: all, fallback: true };
  return { ws: null, used: '', all: all, fallback: false };
}

function getProfitData(p) {
  const client = p.client;
  if (!client) return { ok: false, error: '缺少 client' };
  const ss = getClientSS(client);
  const profitSheetName = getProfitSheetName(client);
  const _pf = _resolveProfitWs_(ss, profitSheetName);
  const ws = _pf.ws;
  if (!ws) return { ok: false, error: '找不到毛利分頁（設定名「' + profitSheetName + '」）。此書現有分頁：' + _pf.all.join('、') };

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
      const abv = pc.noAbv ? 0 : (parseFloat(row[1]) || 0);
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
    // FB / FBC（capCol/bottleCol 未設走原欄位）；jrp-1row 帶 capCol=B、bottleCol=G
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nm = String(row[0] || '').trim();
      if (!nm) continue;
      const price = parseFloat(row[pc.price]) || 0;
      const cap = parseFloat(row[pc.capCol != null ? pc.capCol : 2]) || 0;
      const totalCostTax = parseFloat(row[pc.cost]) || 0;
      if (!price && !totalCostTax && !cap) continue; // 整列無數據 = 非酒款列，跳過
      // 欄位健檢：有酒款名稱卻讀不到售價/成本 → 不再靜默丟棄，照常回傳並標記 warn
      const warn = !(price > 0) || !(totalCostTax > 0);
      const profit = Math.round((price - totalCostTax) * 100) / 100;
      const profitRate = price > 0 ? Math.round(profit / price * 1000) / 10 : 0; // 百分比整數（55.1），與NO1分支統一
      // v3.23 瓶型決定順序：① bottleCol 實際值 ② 客戶 capMap 容量對照 ③ 容量湊字串 ④ 皆無 → 4L桶
      const capKey = String(Math.round(cap));
      const mapped = (cfg.capMap && (cfg.capMap[capKey] || cfg.capMap[cap])) || '';
      const bottle = pc.bottleCol != null
        ? (String(row[pc.bottleCol] || '').trim() || mapped || (cap ? cap + 'ml' : ''))
        : (mapped || '4L桶');   // ← FB/FBC 無 capMap 時仍回 '4L桶'，行為不變
      list.push({ recipeName: nm, bottle, price, cap, totalCostTax, profit, profitRate, warn });
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

// v3.7 P0-3：核准寫回占比(B)後，連動重算「體積(C)／成本(I)」。
// 欄位語意沿用 getRecipe：A=名稱(0) B=占比小數(1) C=體積(2) I=成本(8)，「總體積」列 C 欄=本批總體積。
// 連動公式：新體積 = 占比 × 總體積；新成本 = 舊成本 × 新體積/舊體積（成本∝體積，免解析單價/複合料）。
// 防呆：C/I 若為 Sheet 公式則不覆寫（讓其自動重算）；舊體積=0 時略過成本重算；全程 try/catch 不阻斷核准。
// ⚠️ 執行帳號 joyhouse.rental 須對該酒譜表有「編輯者」權限，否則寫入被 Google 擋（懸案①）。
function writeApproveToRecipe(row) {
  const client = String(row[3]), sheet = String(row[4]);
  const items = JSON.parse(String(row[6]));
  const ss = getClientSS(client);
  const ws = ss.getSheetByName(sheet);
  if (!ws) return;
  const range = ws.getDataRange();
  const data = range.getValues();
  const formulas = range.getFormulas(); // 判斷 C/I 是否為公式，公式列不覆寫

  // 定位「總體積」列，讀本批總體積(C 欄=index 2)
  let totalVol = 0;
  for (let i = 3; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === '總體積') { totalVol = parseFloat(data[i][2]) || 0; break; }
  }

  for (const item of items) {
    for (let i = 3; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(item.name).trim()) {
        // newVal 是百分比整數如 10，需 ÷100 還原為 0.1
        const ratio = parseFloat(item.newVal) / 100;
        ws.getRange(i + 1, 2).setValue(ratio); // B 占比

        // C 體積：非公式且有總體積才連動重算
        const cIsFormula = !!(formulas[i] && formulas[i][2]);
        const oldVol = parseFloat(data[i][2]) || 0;
        if (!cIsFormula && totalVol > 0) {
          const newVol = ratio * totalVol;
          ws.getRange(i + 1, 3).setValue(newVol); // C 體積

          // I 成本：非公式且舊體積>0 才按體積比例連動
          const iIsFormula = !!(formulas[i] && formulas[i][8]);
          const oldCost = parseFloat(data[i][8]) || 0;
          if (!iIsFormula && oldVol > 0 && oldCost > 0) {
            ws.getRange(i + 1, 9).setValue(oldCost * newVol / oldVol); // I 成本
          }
        }
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
// v3.16：帶 id 且找得到該列 → **更新原列**（保留原 id 與建立時間）；否則維持新增。
//   修正：原本永遠 appendRow，導致「載入編輯→改→儲存」變成新增一筆，
//   舊記錄不會被覆蓋（主公 8/21 回報：刪掉的空白材料在詳情仍看得到）。
function saveRdRecord(p) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName('研發試算記錄');
  if (!ws) return { ok: false, error: '找不到研發試算記錄分頁' };
  const wantId = String((p && p.id) || '').trim();
  if (wantId) {
    const data = ws.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === wantId) {
        // C~I 欄覆寫（A=id、B=建立時間 保留不動）
        ws.getRange(i + 1, 3, 1, 7).setValues([[p.creator, p.client, p.name, p.volume, p.bottle, p.ingredients, p.results]]);
        return { ok: true, id: wantId, updated: true };
      }
    }
    // 帶了 id 卻找不到（可能已被刪）→ 落回新增，不讓使用者的編輯憑空消失
  }
  const id = 'R' + Date.now();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  ws.appendRow([id, now, p.creator, p.client, p.name, p.volume, p.bottle, p.ingredients, p.results]);
  return { ok: true, id: id, updated: false };
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
  let row = null, rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderNo)) { row = data[i]; rowIdx = i; break; }
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
    if (rowIdx > 0) ows.getRange(rowIdx + 1, 9).setValue('已出貨'); // v3.5 P1-2：I 製作狀態=已出貨（列表一眼可辨、退出玻璃瓶預佔）
    _logOrderChange_(orderNo, p.operator || '', '確認出貨', '扣成品庫存 ' + shipped + ' 款');
    return { ok: true, orderNo: orderNo, client: client, shippedItems: shipped };
  } finally { lock.releaseLock(); }
}

// ============================================================
// v3.26 實際出貨紀錄（寄倉分批出貨）｜ledger 不可變流水帳
//   分頁：出貨紀錄（於 MAIN_SHEET_ID）
//   欄位 A出貨ID B訂單編號 C第幾次 D出貨日期 E客戶 F酒款 G瓶型 H出貨瓶數 I操作人 J建立時間 K備註
//   一次出貨 = 同一個「第幾次(seq)」，該次出的每一款各一列。
//   ⚠️ 本模組**只記錄、不動成品庫存**——代工訂單的貨本來就不入成品庫存帳；
//      自有酒款的庫存扣除仍走既有「確認出貨（扣庫存）」shipOrder（未指示變更，兩者互不干擾）。
//   寄倉餘量 = 訂單該款數量 − Σ已出貨（**衍生值、不落地**，永遠與 ledger 一致，
//      故前端 items 白名單重組 payload 也洗不掉它——避開 v3.11.2 autoStockedIn 那類 bug）。
// ============================================================
// ⭐ v3.27：出貨紀錄合併「扣成品庫存」（主公拍板，取代原本另一顆「確認出貨(扣庫存)」鈕）。
//   **成品庫存只有「南坡萬v.2」一本帳**（投產單完工 _rcAutoStockIn_ 入庫、手動 stockIn 入庫）。
//   舊 shipOrder 拿「訂單的客戶」去扣 → 出貨給 經銷商－日光貳參／島羽 等永遠找到 0 瓶被擋，
//   正式庫存流水帳 0 筆出庫可證＝那顆鈕實際上一直是壞的。此處一律扣 STOCK_OWNER_CLIENT 的帳。
//   代工酒款（不在這本帳裡）＝只記錄、不扣，避免把不存在的帳扣成負數。
const STOCK_OWNER_CLIENT = '南坡萬v.2';
const SHIP_SHEET_NAME = '出貨紀錄';
const SHIP_HEADERS = ['出貨ID', '訂單編號', '第幾次', '出貨日期', '客戶', '酒款', '瓶型', '出貨瓶數', '操作人', '建立時間', '備註'];
const SHP = { id: 0, orderNo: 1, seq: 2, date: 3, client: 4, product: 5, bottleType: 6, qty: 7, operator: 8, createdAt: 9, note: 10 };

function _shipSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName(SHIP_SHEET_NAME);
  if (!ws) {
    ws = ss.insertSheet(SHIP_SHEET_NAME);
    ws.getRange(1, 1, 1, SHIP_HEADERS.length).setValues([SHIP_HEADERS]);
    ws.setFrozenRows(1);
  } else if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, SHIP_HEADERS.length).setValues([SHIP_HEADERS]);
    ws.setFrozenRows(1);
  }
  return ws;
}
function _shipRows_() {
  const ws = _shipSheet_();
  if (ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow() - 1, SHIP_HEADERS.length).getValues();
}
// 款式鍵＝酒款+瓶型（同單同款不同瓶型視為兩個品項）。
// 刻意**不用 itemIndex**：訂單被編輯（增刪、換順序）後索引會錯位，名稱鍵才對得上。
function _shipKeyOf_(product, bottleType) {
  return String(product == null ? '' : product).trim() + '|' + String(bottleType == null ? '' : bottleType).trim();
}
// 全部出貨紀錄依訂單彙總：{ orderNo: { byKey:{key:qty}, maxSeq:n, batches:n, lastDate:'' } }
function _shipAggAll_(rows) {
  const map = {};
  (rows || []).forEach(function (r) {
    const no = String(r[SHP.orderNo] || '');
    if (!no) return;
    if (!map[no]) map[no] = { byKey: {}, maxSeq: 0, seqs: {}, batches: 0, lastDate: '', log: [] };
    const m = map[no];
    const k = _shipKeyOf_(r[SHP.product], r[SHP.bottleType]);
    m.byKey[k] = (m.byKey[k] || 0) + (Math.floor(Number(r[SHP.qty])) || 0);
    const sq = Number(r[SHP.seq]) || 0;
    if (sq > m.maxSeq) m.maxSeq = sq;
    if (!m.seqs[sq]) { m.seqs[sq] = 1; m.batches++; m.log.push({ seq: sq, date: _fmtDate_(r[SHP.date]), qty: 0 }); }
    const _lg = m.log.filter(function (x) { return x.seq === sq; })[0];
    if (_lg) _lg.qty += (Math.floor(Number(r[SHP.qty])) || 0);
    const d = _fmtDate_(r[SHP.date]);
    if (d && d > m.lastDate) m.lastDate = d;
  });
  return map;
}
// 訂單 items 的訂購量彙總（同款同瓶型合併）
function _shipOrderedOf_(items) {
  const ordered = {};
  (items || []).forEach(function (it) {
    const k = _shipKeyOf_(it.product, it.bottleType);
    ordered[k] = (ordered[k] || 0) + (Math.floor(Number(it.qty)) || 0);
  });
  return ordered;
}

// 成品庫存帳本中「有帳」的酒款集合（南坡萬v.2 曾有任何異動列即算有帳）＋目前庫存。
// 用資料判定而非訂單類型字串＝日後新增訂單類型不必回來改這裡。
function _ownStockMap_(rows) {
  const m = {};
  (rows || []).forEach(function (r) {
    if (String(r[SK.client]) !== STOCK_OWNER_CLIENT) return;
    const it = String(r[SK.item] || ''); if (!it) return;
    const q = Math.floor(Number(r[SK.qty])) || 0;
    if (m[it] == null) m[it] = 0;
    if (String(r[SK.type]) === '入庫') m[it] += q;
    else if (String(r[SK.type]) === '出庫') m[it] -= q;
  });
  return m;   // { 酒款: 目前庫存 }；key 存在＝這款有成品庫存帳，要扣
}

// ── 新增一次出貨（admin+倉管）：一次可出多款；擋超過寄倉餘量；seq 自動遞增 ──
function addShipment(p) {
  const orderNo = p && p.orderNo;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  const date = String((p && p.date) || '').trim();
  if (!date) return { ok: false, error: '缺少出貨日期' };
  let lines;
  try { lines = typeof p.lines === 'string' ? JSON.parse(p.lines) : (p.lines || []); }
  catch (e) { return { ok: false, error: '出貨明細 JSON 解析失敗' }; }
  if (!lines || !lines.length) return { ok: false, error: '請至少填一款出貨數量' };

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ows = ss.getSheetByName('訂單主表');
  if (!ows) return { ok: false, error: '找不到訂單主表分頁' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = ows.getDataRange().getValues();
    let row = null, rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(orderNo)) { row = data[i]; rowIdx = i; break; }
    }
    if (!row) return { ok: false, error: '找不到訂單：' + orderNo };
    const client = String(row[1]);
    let items = [];
    try { items = row[4] ? JSON.parse(row[4]) : []; } catch (e) { return { ok: false, error: '訂單酒款明細 JSON 解析失敗' }; }
    if (!items.length) return { ok: false, error: '訂單無酒款明細' };

    const ordered = _shipOrderedOf_(items);
    const agg = _shipAggAll_(_shipRows_())[String(orderNo)] || { byKey: {}, maxSeq: 0, batches: 0 };

    const use = [], bad = [];
    lines.forEach(function (ln) {
      const q = Math.floor(Number(ln.qty)) || 0;
      if (q <= 0) return;
      const k = _shipKeyOf_(ln.product, ln.bottleType);
      if (ordered[k] == null) { bad.push('「' + String(ln.product || '') + '」不在此訂單的酒款明細內'); return; }
      const remain = (ordered[k] || 0) - (agg.byKey[k] || 0);
      if (q > remain) bad.push('「' + String(ln.product || '') + '」本次 ' + q + ' 瓶，超過寄倉餘量 ' + remain + ' 瓶');
      else use.push({ product: String(ln.product || ''), bottleType: String(ln.bottleType || ''), qty: q, key: k });
    });
    if (bad.length) return { ok: false, error: '出貨數量有誤，整批未寫入：' + bad.join('；'), problems: bad };
    if (!use.length) return { ok: false, error: '本次出貨數量皆為 0，未寫入' };

    const seq = (agg.maxSeq || 0) + 1;
    const ws = _shipSheet_();
    const now = _stockNow_();
    const gid = _stockGenId_();
    const note = String((p && p.note) || '');
    const op = String((p && p.operator) || (p && p._user) || '');

    // v3.27 扣成品庫存（合併原 shipOrder）：只扣在 STOCK_OWNER_CLIENT 帳本裡有帳的酒款。
    //   先整批驗足額，任一款不足就整張擋下不寫入（沿用舊 shipOrder 的 all-or-nothing 防線）。
    const _stkRows = _stockRows_();
    const _stkMap = _ownStockMap_(_stkRows);
    const _deduct = [], _short = [];
    const _needBy = {};
    use.forEach(function (u) {
      if (_stkMap[u.product] == null) return;   // 代工酒款沒有成品庫存帳 → 只記錄
      _needBy[u.product] = (_needBy[u.product] || 0) + u.qty;
    });
    Object.keys(_needBy).forEach(function (prod) {
      const have = _stkMap[prod] || 0;
      if (_needBy[prod] > have) _short.push('「' + prod + '」需 ' + _needBy[prod] + '、現有 ' + have);
      else _deduct.push({ product: prod, qty: _needBy[prod], before: have });
    });
    if (_short.length) {
      return { ok: false, error: '成品庫存不足，本次出貨未登記：' + _short.join('；'), shortages: _short };
    }
    const out = use.map(function (u, i) {
      return [gid + '-' + (i + 1), String(orderNo), seq, date, client,
        u.product, u.bottleType, u.qty, op, now, note];
    });
    ws.getRange(ws.getLastRow() + 1, 1, out.length, SHIP_HEADERS.length).setValues(out);

    // 訂單主表：L 實際出貨日＝本次日期、M 已確認；全部出清才把 I 標「已出貨」
    ows.getRange(rowIdx + 1, 12).setValue(date);
    ows.getRange(rowIdx + 1, 13).setValue('TRUE');
    let allShipped = true;
    Object.keys(ordered).forEach(function (k) {
      let shipped = agg.byKey[k] || 0;
      use.forEach(function (u) { if (u.key === k) shipped += u.qty; });
      if (shipped < ordered[k]) allShipped = false;
    });
    if (allShipped) ows.getRange(rowIdx + 1, 9).setValue('已出貨');

    // 扣庫存：一款一筆「出庫」，關聯訂單編號＋備註標明第幾次（可回溯、可回沖）
    if (_deduct.length) {
      const sws = _stockSheet_();
      const today = _stockToday_();
      const stkOut = _deduct.map(function (d, i) {
        return [_stockGenId_() + '-s' + (i + 1), today, STOCK_OWNER_CLIENT, d.product, '出庫', d.qty,
          '', String(orderNo), op, now, '訂單出貨 第 ' + seq + ' 次（客戶：' + client + '）'];
      });
      sws.getRange(sws.getLastRow() + 1, 1, stkOut.length, STOCK_HEADERS.length).setValues(stkOut);
      _deduct.forEach(function (d) { d.after = d.before - d.qty; });
    }
    // v3.28 出貨給啟用中的經銷商 → 自動寫「經銷商庫存異動」進貨列（第三本帳的進貨不手打）；失敗不阻斷出貨
    var _consignIn = null, _consignErr = '';
    try { _consignIn = _consignOnShipment_(client, orderNo, seq, date, use, items, op); } catch (e) { _consignErr = String((e && e.message) || e); }
    // v3.32 叫貨行政鏈條收尾：此單若來自經銷商叫貨 → 叫貨單狀態 已出貨／部分出貨＋出貨日（店長頁看得到）
    var _rqUpd = 0;
    try { _rqUpd = _consignRestockOnShip_(String(orderNo), date, allShipped); } catch (e) {}
    _logOrderChange_(orderNo, op, '第 ' + seq + ' 次出貨',
      date + '：' + use.map(function (u) { return u.product + '×' + u.qty; }).join('、') +
      (_consignIn ? ('｜經銷商門市在庫 +' + use.reduce(function (a, u) { return a + u.qty; }, 0) + ' 瓶') : '') +
      (_consignErr ? ('｜⚠ 門市在庫寫入失敗：' + _consignErr) : '') +
      (_rqUpd ? ('｜叫貨單→' + (allShipped ? '已出貨' : '部分出貨')) : '') +
      (allShipped ? '（本單已全部出清）' : '（尚有寄倉未出）') +
      (_deduct.length ? ('｜扣成品庫存 ' + _deduct.map(function (d) { return d.product + '−' + d.qty; }).join('、')) : '') +
      (note ? ('｜' + note) : ''));
    return { ok: true, orderNo: orderNo, seq: seq, date: date, lines: use, allShipped: allShipped,
      stockDeducted: _deduct, consignIn: _consignIn, consignError: _consignErr, restockUpdated: _rqUpd };
  } finally { lock.releaseLock(); }
}

// ── 查某張訂單的出貨紀錄（依「第幾次」分組）＋目前寄倉餘量 ──
function getShipments(p) {
  const orderNo = String((p && p.orderNo) || '');
  const rows = _shipRows_();
  const groups = {}, out = [];
  rows.forEach(function (r) {
    if (orderNo && String(r[SHP.orderNo]) !== orderNo) return;
    const gk = String(r[SHP.orderNo]) + '#' + String(r[SHP.seq]);
    if (!groups[gk]) {
      groups[gk] = {
        orderNo: String(r[SHP.orderNo]), seq: Number(r[SHP.seq]) || 0,
        date: _fmtDate_(r[SHP.date]), client: String(r[SHP.client] || ''),
        operator: String(r[SHP.operator] || ''), createdAt: _fmtDateTime_(r[SHP.createdAt]),
        note: String(r[SHP.note] || ''), lines: []
      };
      out.push(groups[gk]);
    }
    groups[gk].lines.push({
      product: String(r[SHP.product] || ''), bottleType: String(r[SHP.bottleType] || ''),
      qty: Math.floor(Number(r[SHP.qty])) || 0
    });
  });
  out.sort(function (a, b) { return a.seq - b.seq; });

  // 目前寄倉（＝訂購 − 已出）；找得到訂單才算得出來
  const remain = [];
  if (orderNo) {
    try {
      const ws = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
      const data = ws.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) !== orderNo) continue;
        let items = [];
        try { items = data[i][4] ? JSON.parse(data[i][4]) : []; } catch (e) { items = []; }
        const ordered = _shipOrderedOf_(items);
        const agg = _shipAggAll_(rows)[orderNo] || { byKey: {} };
        items.forEach(function (it) {
          const k = _shipKeyOf_(it.product, it.bottleType);
          if (remain.some(function (x) { return x.key === k; })) return;   // 同款同瓶型只列一次
          remain.push({
            key: k, product: String(it.product || ''), bottleType: String(it.bottleType || ''),
            ordered: ordered[k] || 0, shipped: agg.byKey[k] || 0,
            remain: Math.max(0, (ordered[k] || 0) - (agg.byKey[k] || 0))
          });
        });
        break;
      }
    } catch (e) { /* 算不出寄倉不影響紀錄本身 */ }
  }
  // v3.27：每款是否會扣成品庫存＋目前庫存（登記表單要顯示「將扣庫存 X（現有 Y）」）
  const stockInfo = {};
  try {
    const _m = _ownStockMap_(_stockRows_());
    remain.forEach(function (x) {
      stockInfo[x.product] = (_m[x.product] == null)
        ? { tracked: false, stock: null }
        : { tracked: true, stock: _m[x.product] };
    });
  } catch (e) { /* 算不出庫存不影響紀錄顯示 */ }
  return { ok: true, orderNo: orderNo, shipments: out, remain: remain, stockInfo: stockInfo };
}

// ── 刪除某一次出貨（admin 限定）：整批 seq 一起刪；刪完回推訂單狀態 ──
function deleteShipment(p) {
  const orderNo = String((p && p.orderNo) || '');
  const seq = Math.floor(Number(p && p.seq)) || 0;
  if (!orderNo) return { ok: false, error: '缺少 orderNo' };
  if (!seq) return { ok: false, error: '缺少 seq（第幾次出貨）' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ws = _shipSheet_();
    if (ws.getLastRow() < 2) return { ok: false, error: '尚無出貨紀錄' };
    const rows = ws.getRange(2, 1, ws.getLastRow() - 1, SHIP_HEADERS.length).getValues();
    let removed = 0;
    const delLines = [];   // v3.27 記下被刪的款式與數量，供成品庫存回沖
    let _delClient = '';   // v3.28 該批客戶（經銷商門市在庫沖回用）
    for (let i = rows.length - 1; i >= 0; i--) {   // 由下往上刪，列號才不會位移
      if (String(rows[i][SHP.orderNo]) === orderNo && (Number(rows[i][SHP.seq]) || 0) === seq) {
        if (!_delClient) _delClient = String(rows[i][SHP.client] || '');   // v3.28 門市在庫沖回要用
        delLines.push({ product: String(rows[i][SHP.product] || ''), qty: Math.floor(Number(rows[i][SHP.qty])) || 0 });
        ws.deleteRow(i + 2); removed++;
      }
    }
    if (!removed) return { ok: false, error: '找不到 ' + orderNo + ' 的第 ' + seq + ' 次出貨' };

    // v3.27 回沖成品庫存：刪掉的那批若曾扣庫存，補寫「入庫」沖回。
    //   刻意不刪成品庫存的列＝流水帳保持不可變，一出一進看得出來龍去脈。
    const _back = [];
    try {
      const _m = _ownStockMap_(_stockRows_());
      const _sum = {};
      delLines.forEach(function (l) {
        if (_m[l.product] == null) return;
        _sum[l.product] = (_sum[l.product] || 0) + l.qty;
      });
      const keys = Object.keys(_sum);
      if (keys.length) {
        const sws = _stockSheet_();
        const rowsIn = keys.map(function (prod, i) {
          _back.push({ product: prod, qty: _sum[prod] });
          return [_stockGenId_() + '-r' + (i + 1), _stockToday_(), STOCK_OWNER_CLIENT, prod, '入庫', _sum[prod],
            '', String(orderNo), String((p && p.operator) || (p && p._user) || ''), _stockNow_(),
            '刪除第 ' + seq + ' 次出貨紀錄，庫存回沖'];
        });
        sws.getRange(sws.getLastRow() + 1, 1, rowsIn.length, STOCK_HEADERS.length).setValues(rowsIn);
      }
    } catch (e) { /* 回沖失敗不阻斷刪除，但會少一筆帳 → 由操作紀錄可查 */ }


    // v3.28 經銷商門市在庫沖回：當初自動寫的「進貨」列以「進貨取消」負數沖回（流水帳不刪列）
    let _consignBack = null;
    try { _consignBack = _consignOnShipmentDelete_(_delClient, orderNo, seq, delLines, String((p && p.operator) || (p && p._user) || '')); } catch (e) {}
    // v3.32 回推叫貨單狀態（依刪除後剩餘批次）
    try {
      var _left = _shipRows_().filter(function (r) { return String(r[SHP.orderNo]) === String(orderNo); });
      var _lastD = ''; _left.forEach(function (r) { var d = _fmtDate_(r[SHP.date]); if (d > _lastD) _lastD = d; });
      _consignRestockOnShipDelete_(String(orderNo), _left.length, _lastD);
    } catch (e) {}

    // 回推訂單主表：L/M 依剩下的紀錄重算；I 若已無「全部出清」則退回製作狀態
    try {
      const ows = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
      const data = ows.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) !== orderNo) continue;
        let items = [];
        try { items = data[i][4] ? JSON.parse(data[i][4]) : []; } catch (e) { items = []; }
        const ordered = _shipOrderedOf_(items);
        const agg = _shipAggAll_(_shipRows_())[orderNo] || { byKey: {}, batches: 0, lastDate: '' };
        let allShipped = Object.keys(ordered).length > 0;
        Object.keys(ordered).forEach(function (k) {
          if ((agg.byKey[k] || 0) < ordered[k]) allShipped = false;
        });
        if (agg.batches > 0) { ows.getRange(i + 1, 12).setValue(agg.lastDate || ''); ows.getRange(i + 1, 13).setValue('TRUE'); }
        else { ows.getRange(i + 1, 12).setValue(''); ows.getRange(i + 1, 13).setValue(''); }
        if (!allShipped && String(data[i][8] || '').trim() === '已出貨') {
          const allDone = items.length > 0 && items.every(function (it) { return it.status === '完成'; });
          ows.getRange(i + 1, 9).setValue(allDone ? '已完成' : '製作中');
        }
        break;
      }
    } catch (e) { /* 回推失敗不影響刪除本身 */ }

    _logOrderChange_(orderNo, String((p && p.operator) || (p && p._user) || ''),
      '刪除出貨紀錄', '刪除第 ' + seq + ' 次出貨（' + removed + ' 列）' +
      (_back.length ? ('｜庫存回沖 ' + _back.map(function (b) { return b.product + '+' + b.qty; }).join('、')) : ''));
    return { ok: true, orderNo: orderNo, seq: seq, removed: removed, stockRestored: _back, consignReversed: _consignBack };
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
// v2.9 建單瓶型↔玻璃瓶庫存連動：舊訂單瓶型別名 → 庫存品名（新單前端直接存庫存品名）
const BOTTLE_ALIAS = { '江小白': '100ml江小白', '伏特加': '500ml伏特加瓶', '山形香水瓶': '100ml山形香水瓶', '山形瓶': '100ml山形香水瓶', '大香水瓶': '500ml大香水瓶' };
function _bottleKeyOf_(name, namesMap) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (namesMap[n]) return n;
  if (BOTTLE_ALIAS[n] && namesMap[BOTTLE_ALIAS[n]]) return BOTTLE_ALIAS[n];
  return null;
}
// 未完成訂單的玻璃瓶預佔量（item 狀態≠完成者依瓶型彙總；失敗不影響庫存總覽）
function _bottleReserved_(namesMap) {
  const map = {};
  try {
    const ws = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
    if (!ws || ws.getLastRow() < 2) return map;
    const data = ws.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const orderNo = String(data[i][0] || '');
      if (!orderNo) continue;
      // v3.5 P1-1：出貨單出成品不裝瓶，不佔玻璃瓶；v3.13：改抬頭「自有酒款出貨訂單(有金流)」＋新型「自有酒款樣品(無金流)」同理（皆出自有成品庫存）
      if (['自有酒款庫存出貨訂單', '自有酒款出貨訂單(有金流)', '自有酒款樣品(無金流)'].indexOf(String(data[i][2] || '')) >= 0) continue;
      if (String(data[i][8] || '').trim() === '已出貨') continue;        // v3.5 P1-2：已出貨單不再預佔
      let items;
      try { items = JSON.parse(data[i][4] || '[]'); } catch (e) { continue; }
      items.forEach(function (it) {
        if (!it || it.status === '完成') return;
        const inv = _bottleKeyOf_(it.bottleType, namesMap);
        if (!inv) return;
        const q = Number(it.qty) || 0;
        if (!(q > 0)) return;
        if (!map[inv]) map[inv] = { qty: 0, detail: [] };
        map[inv].qty += q;
        map[inv].detail.push(orderNo + '×' + q);
      });
    }
  } catch (e) { }
  return map;
}

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
  // v3.14.4 快取 60 秒（無參數＝無 role/view 變體，單一 key 天然安全）；
  //   bottleIn/bottleOut/addBottleItem 成功後由 _bustOrderCache_ 立即清除。
  if (DATA_CACHE_ON) { try { const h = CacheService.getScriptCache().get('bottleOv_v1'); if (h) return JSON.parse(h); } catch (e) {} }
  const rows = _bottleRows_();
  const smap = _safetyMap_();
  const names = {};
  BOTTLE_TYPES.forEach(function (n) { names[n] = true; });
  rows.forEach(function (r) { if (r[BK.item]) names[String(r[BK.item])] = true; });
  const ordered = BOTTLE_TYPES.slice();
  Object.keys(names).forEach(function (n) { if (ordered.indexOf(n) < 0) ordered.push(n); });
  const reserved = _bottleReserved_(names); // v2.9 未完成訂單預佔
  const list = ordered.map(function (item) {
    let inQty = 0, outQty = 0, ngQty = 0;
    rows.forEach(function (r) {
      if (String(r[BK.item]) !== item) return;
      const q = Number(r[BK.qty]) || 0;
      if (String(r[BK.type]) === '入庫') inQty += q;
      else if (String(r[BK.type]) === '出庫') outQty += q;
      else if (String(r[BK.type]) === 'NG') ngQty += q; // v3.6 NG 統計（不入庫存）
    });
    const rsv = reserved[item] || { qty: 0, detail: [] };
    return { item: item, inQty: inQty, outQty: outQty, stock: inQty - outQty,
      safety: smap['玻璃瓶||' + item] || 0, ng: ngQty,
      reserved: rsv.qty, reservedDetail: rsv.detail.join('、') };
  });
  const _o = { ok: true, list: list };
  if (DATA_CACHE_ON) { try { CacheService.getScriptCache().put('bottleOv_v1', JSON.stringify(_o), 1800); } catch (e) {} }
  return _o;
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
    // v3.6 NG 瓶：另記一筆「NG」型別列（不入庫存 Σ，供小李統計；備註=NG 原因）
    const ngQty = Math.floor(Number(p.ngQty)) || 0;
    if (ngQty > 0) {
      ws.appendRow([_stockGenId_(), p.date || _stockToday_(), item, 'NG', ngQty,
        p.operator || '', _stockNow_(), String(p.ngNote || 'NG瓶')]);
    }
    return { ok: true, item: item, stock: _bottleStockOf_(_bottleRows_(), item), ngQty: ngQty };
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
  // v3.14.4 快取 60 秒；庫存/水位/出貨/完工異動後立即清除
  if (DATA_CACHE_ON) { try { const h = CacheService.getScriptCache().get('stockAlerts_v1'); if (h) return JSON.parse(h); } catch (e) {} }
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
  const _o = { ok: true, count: alerts.length, alerts: alerts };
  if (DATA_CACHE_ON) { try { CacheService.getScriptCache().put('stockAlerts_v1', JSON.stringify(_o), 1800); } catch (e) {} }
  return _o;
}

// ============================================================
// Run Card 模組（v2.6）：製酒各站點紀錄表
//   分頁：RunCard（於 MAIN_SHEET_ID，表頭自動建立）
//   欄位 A卡號 B訂單編號 C客戶 D酒款 E酒譜sheet F瓶型 G生產日期 H產品PM
//        I Lot批號 J版本 K資料JSON L狀態 M建立人 N建立時間 O更新人 P更新時間
//   資料JSON = { totalVol, bottles, labelFront, labelBack, processNote,
//     liquids:[{name,pct,abv,vol,fed,ordered,note,method}],   // method=製作方式(v3.14.3)
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
// v3.0 投產單完工自動入庫：卡綁訂單類型=南坡萬自有酒款投產單，無金流 且 第11站(final)完成+瓶數>0
// → 成品庫存自動寫「入庫」（備註記卡號；冪等：卡片 JSON 記 autoStockedIn 後不再重複入庫）
function _rcAutoStockIn_(p, cardId, dataStr) {
  const out = { dataStr: dataStr, autoStockIn: null };
  try {
    if (!p.orderNo) return out;
    const data = JSON.parse(dataStr);
    if (data.autoStockedIn) return out; // 已入過庫（冪等）
    const fin = (data.stations || []).find(function (s) { return s && s.type === 'final'; });
    const qty = fin ? Math.floor(Number(fin.count)) : 0;
    if (!fin || !fin.done || !(qty > 0)) return out;
    const ows = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
    if (!ows) return out;
    const orows = ows.getDataRange().getValues();
    let orderType = '', orderClient = '';
    for (let i = 1; i < orows.length; i++) {
      if (String(orows[i][0]) === String(p.orderNo)) { orderClient = String(orows[i][1] || ''); orderType = String(orows[i][2] || ''); break; }
    }
    if (orderType !== '南坡萬自有酒款投產單，無金流') return out;
    const client = orderClient || '南坡萬v.2';
    _stockSheet_().appendRow([_stockGenId_(), _stockToday_(), client, String(p.product), '入庫', qty,
      String(p.lot || ''), String(p.orderNo), String(p._user || p.user || ''), _stockNow_(),
      'Run Card ' + cardId + ' 完工自動入庫']);
    data.autoStockedIn = { qty: qty, at: _stockNow_() };
    out.dataStr = JSON.stringify(data);
    out.autoStockIn = { item: String(p.product), qty: qty, client: client };
  } catch (e) { }
  return out;
}
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
          // v3.11.2 冪等補強（BUG-20260817 泰奶烏龍蘭姆酒重複入庫×4）：舊前端 payload 不帶 autoStockedIn，
          // 每次覆寫都把旗標洗掉→完工投產單卡每存一次（含自動回存）就重複入庫一次。
          // 修＝更新前先從「庫內舊卡」把 autoStockedIn 併回進來的 data（後端自保，不依賴前端）。
          try {
            const stored = JSON.parse(String(data[i][10] || '{}'));
            if (stored && stored.autoStockedIn) {
              const incoming = JSON.parse(dataStr);
              if (!incoming.autoStockedIn) { incoming.autoStockedIn = stored.autoStockedIn; dataStr = JSON.stringify(incoming); }
            }
          } catch (e) {}
          const asi = _rcAutoStockIn_(p, String(p.id), dataStr); dataStr = asi.dataStr; // v3.0 投產單完工自動入庫
          ws.getRange(i + 1, 2, 1, 11).setValues([[
            String(p.orderNo || ''), String(p.client), String(p.product),
            String(p.sheet || ''), String(p.bottleType || ''), String(p.prodDate || ''),
            String(p.pm || ''), String(p.lot || ''), String(p.version || ''),
            dataStr, String(p.status || '進行中')
          ]]);
          ws.getRange(i + 1, 15, 1, 2).setValues([[user, now]]);
          if (p.orderNo) _logOrderChange_(p.orderNo, user, 'Run Card', '更新 ' + p.id + '（' + p.product + '）');
          return { ok: true, id: String(p.id), autoStockIn: asi.autoStockIn };
        }
      }
      return { ok: false, error: '找不到 Run Card：' + p.id };
    }
    const id = _genRunCardNo_(ws, p.orderNo);
    const asi = _rcAutoStockIn_(p, id, dataStr); dataStr = asi.dataStr; // v3.0 投產單完工自動入庫
    ws.appendRow([id, String(p.orderNo || ''), String(p.client), String(p.product),
      String(p.sheet || ''), String(p.bottleType || ''), String(p.prodDate || ''),
      String(p.pm || ''), String(p.lot || ''), String(p.version || ''),
      dataStr, String(p.status || '進行中'), user, now, user, now]);
    ws.getRange(ws.getLastRow(), 9).setNumberFormat('@').setValue(String(p.lot || ''));
    if (p.orderNo) _logOrderChange_(p.orderNo, user, 'Run Card', '建立 ' + id + '（' + p.product + '）');
    return { ok: true, id: id, autoStockIn: asi.autoStockIn };
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
// v2.9.3 輕量索引：只回 訂單編號+酒款（不含明細 JSON），供訂單列表判斷哪些酒款已建卡
function getRunCardIndex() {
  // v3.14.4 快取 60 秒；saveRunCard/deleteRunCard 成功後立即清除
  if (DATA_CACHE_ON) { try { const h = CacheService.getScriptCache().get('rcIdx_v1'); if (h) return JSON.parse(h); } catch (e) {} }
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const ws = ss.getSheetByName(RUNCARD_SHEET_NAME);
  if (!ws) return { ok: true, index: [] };
  const data = ws.getDataRange().getValues();
  const index = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    // v3.6：finalDone=第11站(final)已勾完成且有產出瓶數 → 與狀態欄「完成」同視為已完成
    let finalDone = false;
    try {
      const d = r[10] ? JSON.parse(r[10]) : {};
      const fin = (d.stations || []).find(function (s) { return s && s.type === 'final'; });
      finalDone = !!(fin && fin.done && (Number(fin.count) || 0) > 0);
    } catch (e) { }
    // v3.8.4 補 id/client：讓前端能列出「無訂單之獨立卡」並直接開啟(孤兒卡救援)
    index.push({ id: String(r[0] || ''), orderNo: String(r[1] || ''), client: String(r[2] || ''), product: String(r[3] || ''), status: String(r[11] || ''), finalDone: finalDone });
  }
  const _o = { ok: true, index: index };
  if (DATA_CACHE_ON) { try { CacheService.getScriptCache().put('rcIdx_v1', JSON.stringify(_o), 1800); } catch (e) {} }
  return _o;
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


// ============================================================
// v3.14.4 A 止血包：保溫觸發器 ／ 開機打包 ／ 訂單快取工具
//   背景：2026-08-20 實測 —— GAS 固定往返 1.8~2.5 秒（連不碰試算表的 getEnvInfo 都這麼久）、
//   getRecipeList 冷啟動 20.2 秒、getOrders 4.7 秒；且開 APP 瞬間打 8 個請求會觸發 Google 限流，
//   後端改回 HTML 錯誤頁 → 前端解析失敗 → 列表空白＝接手文件 §42.21「訂單不見了」的真因。
// ============================================================

// ── 訂單快取 key：view(bartender/full) × role(PM/std) 四種變體各自一把 ──
function _ordersCacheKey_(p) {
  var view = (p && p.view === 'bartender') ? 'bartender' : 'full';
  var role = (p && p._role === 'PM') ? 'PM' : 'std';
  return 'orders_v1_' + view + '_' + role;
}
var ORDERS_CACHE_KEYS = ['orders_v1_full_std', 'orders_v1_full_PM',
                         'orders_v1_bartender_std', 'orders_v1_bartender_PM'];
// 任何會改動「訂單主表」的 action 成功後，立即清掉四把訂單快取。
// 放在 doGet 派發層＝單一出口，日後新增寫入函式也不會忘記清（只要列進本表）。
var ORDER_MUTATING_ACTIONS = {
  createOrder:1, updateOrder:1, updateOrderFinance:1, updateOrderDelivery:1, deleteOrder:1,
  completeOrderItem:1, confirmShipDate:1, shipOrder:1,
  migrateOrderNos:1, migrateOrderTypes:1, backfillOrderCreators:1,
  addShipment:1, deleteShipment:1,
  consignStatementSettle:1,  // v3.28 結清自動建認列單
  consignRestockApprove:1,   // v3.29 叫貨放行自動建出貨單
  consignResetDealer:1       // v3.35 重置經銷商測試資料（刪訂單）
};
// 其餘讀取快取的失效對應（action → 要清掉的 key）。
// 新增寫入函式時只要在這裡登記一行，就不會出現「改了資料卻還看到舊值」。
var CACHE_BUST_MAP = {
  bottleIn:['bottleOv_v1'], bottleOut:['bottleOv_v1'], addBottleItem:['bottleOv_v1'],
  saveRunCard:['rcIdx_v1'], deleteRunCard:['rcIdx_v1'],
  stockIn:['stockAlerts_v1'], stockOut:['stockAlerts_v1'], setSafetyLevel:['stockAlerts_v1'],
  // 出貨/完工會動成品庫存與卡片狀態 → 水位警示與 run card 索引一併重算
  shipOrder:['stockAlerts_v1'], completeOrderItem:['stockAlerts_v1','rcIdx_v1'],
  // v3.27 出貨紀錄合併扣庫存 → 水位警示同步失效
  addShipment:['stockAlerts_v1'], deleteShipment:['stockAlerts_v1']
};
// ↻ 強制刷新對應表：action → 該清掉的讀取快取
var FRESH_BUST_MAP = {
  getOrders: ORDERS_CACHE_KEYS,
  getBottleOverview: ['bottleOv_v1'], getRunCardIndex: ['rcIdx_v1'], getStockAlerts: ['stockAlerts_v1'],
  getRecipeList: ['recipeList_v1'], getInventory: ['inventory_v2'],
  bootstrap: ORDERS_CACHE_KEYS.concat(['bottleOv_v1', 'rcIdx_v1', 'stockAlerts_v1'])
};
function _bustOrderCache_(action, result) {
  if (!result || result.ok !== true) return;   // 失敗的寫入不必清
  var keys = [];
  if (ORDER_MUTATING_ACTIONS[action]) keys = keys.concat(ORDERS_CACHE_KEYS);
  if (CACHE_BUST_MAP[action]) keys = keys.concat(CACHE_BUST_MAP[action]);
  if (!keys.length) return;
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) {}
}

// ── 開機打包：把原本 6~8 個請求併成 1 個（每個請求都要付 ~2 秒固定往返）──
// ⚠️ 只打包「未列於 ROLE_MATRIX 的讀取型 action」＝任何已登入者本來就能呼叫，無權限提升。
//    子項目各自 try/catch：單項失敗不拖垮整個開機（前端會退回舊路徑補抓）。
function bootstrap(p) {
  var role = p && p._role;
  var out = { ok: true, role: role || '' };
  function safe(fn) { try { return fn(); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } }
  if (role === CONSIGN_ROLE) return out;   // v3.28 經銷商角色走 dealer.html／consignMe，不回廠務資料
  out.recipeList = safe(function () { return getRecipeList(p); });
  // v3.28 經銷商設定（建單判斷寄售客戶用）＋結帳日提醒（admin/財務 登入一天一次）
  if (role === 'admin' || role === '財務' || role === 'PM') out.consignDealers = safe(function () { return consignDealers(p); });
  if (role === 'admin' || role === '財務') out.consignAlerts = safe(function () { return consignAlerts(p); });
  if (role === 'FB觀看') return out;   // FB觀看 只看酒譜，其餘一律不回
  // v3.19b bootstrap 減重：inventory(261筆/38.5KB) 移出開機路徑——開機畫面用不到，
  //   原料/資材庫頁與研發試算頁本就有 lazy-load(!C.inv 即自抓)，進頁才載。舊版前端拿不到
  //   _b.inventory 時走 || {ok:false} 分支，同樣落入 lazy-load，向下相容。
  out.orders        = safe(function () { return getOrders(p); });   // view 由前端帶，PM 剝除照舊
  out.runCardIndex  = safe(function () { return getRunCardIndex(); });
  out.bottles       = safe(function () { return getBottleOverview(); });
  out.stockAlerts   = safe(function () { return getStockAlerts(); });
  return out;
}

// ⚠️ v3.14.5（2026-08-21 事故）已移除 keepWarm_／__installKeepWarm／__keepWarmStatus。
//   原因：它們用到 ScriptApp.getProjectTriggers 與 UrlFetchApp.fetch，會讓腳本要求新的 OAuth scope，
//   而本部署的既有授權沒有涵蓋 → 整個執行落入「授權不足」狀態，**連帶把 CacheService 打壞**
//   （實測：put 一個 5 bytes 的全新 key 後立刻 get 回 null，且不拋任何例外）
//   → session 存不住 → **全站所有角色 SESSION_EXPIRED**（症狀＝登入後訂單列表顯示「載入失敗」）。
//   ⚠️ 保溫要復活，必須先由 joyhouse.rental 在 Apps Script 編輯器完成一次授權，
//      且部署後**實測 CacheService 仍正常**（getEnvInfo 的 cacheDiag）才可再加回。


// ############################################################
// ##  以下原為獨立檔 gas/consign.gs（v3.28 經銷商寄售模組）
// ##  2026-09-03 併入本檔：deploy-gas Action 只複製 程式碼.gs 一個檔去 clasp push --force，
// ##  獨立檔會被推掉（正式站 consign.gs 消失事故）。日後新增模組一律寫在本檔，勿另開 .gs。
// ############################################################
// ============================================================
// 經銷商寄售模組（v3.28 P1，2026-09-02 主公拍板）
//   「第三本帳」＝經銷商門市在庫：
//     ①南坡萬成品庫存 ─(出貨紀錄 addShipment)→ ②經銷商門市在庫 ─(經銷商登記售出)→ ③當期應請款
//   ⚠️ 命名：系統既有「寄倉」＝訂單未出貨餘量（貨還在南坡萬），本模組一律稱「門市在庫」，勿混用。
//   分頁（主表，表頭自動建立）：
//     經銷商設定     A經銷商鍵 B顯示名 C折扣率 D結帳日 E聯絡人 F啟用 G備註 H更新人 I更新時間
//     牌價表         A酒款(系統名) B對外名稱(報價單名) C規格 D建議零售價 E備註 F更新人 G更新時間
//     經銷商庫存異動 A異動ID B日期 C經銷商 D酒款 E規格 F瓶型 G異動類型 H數量(±) I成交單價 J關聯訂單編號 K出貨批次 L操作人 M建立時間 N備註
//     經銷商對帳單   A對帳單ID B經銷商 C期別 D期間起 E期間迄 F結算日 G售出瓶數 H請款金額 I明細JSON J狀態 K建立人 L建立時間 M結清人 N入帳日 O認列訂單編號 P備註
//   設計核心：
//     ・庫存異動＝不可變流水帳，數量一律帶正負號（進貨 +、售出/退貨/損耗 −、盤點修正 ±），在庫＝Σ數量。
//     ・售出當下把「成交單價」（牌價×折扣，四捨五入整數）凍結寫進列，牌價日後改了歷史帳不變形。
//     ・進貨列不手打：addShipment 出貨給經銷商時自動寫入；deleteShipment 寫「進貨取消」沖回。
//     ・期別＝自然月 YYYY-MM；結帳日 D＝次月第 D 日對帳（每家可設）。請款只算「售出」，在庫一瓶都不算。
//     ・結清（方案 B）：對帳單標「已結清」＋自動建一張「經銷商寄售月結認列單」訂單（客戶＝經銷商、
//       明細＝當期實售、金額＝請款額、尾款實收日＝入帳日），一期一單一對一；出貨訂單本身金額掛 0＝純物流單。
//     ・經銷商角色資料隔離：後端一律用 session 綁定的經銷商鍵覆寫 p.dealer，絕不信前端參數。
// ============================================================
var CONSIGN_ROLE = '經銷商';
// 經銷商角色可呼叫的 action 白名單（比照 FBVIEW_ALLOWED_ACTIONS，未列者一律 403）
var CONSIGN_DEALER_ACTIONS = ['changePassword', 'consignMe', 'consignSale', 'consignAdjust', 'consignLedger', 'consignStatements', 'consignRestockCreate', 'consignRestockList', 'consignDaily'];
var TYPE_CONSIGN_SETTLE = '經銷商寄售月結認列單';

var CONSIGN_CFG_SHEET = '經銷商設定';
// v3.37 經銷條件擴充（主公 2026-09-04 拍板）：基本資料（抬頭／統編／地址／電話／Email，僅廠務端顯示）＋談定條件（MOQ×3 規格／授權酒款JSON／預設規格／試飲品約定／特殊約定／合約起日，店長頁「合作條件」卡顯示）。
//   新欄一律加在表頭末尾、舊分頁由 _consignCfgEnsureHeaders_ 補表頭；空值走預設（MOQ 空＝100ml 25／500・700ml 12；授權酒款空＝全部可叫）＝舊資料零遷移。
var CONSIGN_CFG_HEADERS = ['經銷商鍵', '顯示名', '折扣率', '結帳日', '聯絡人', '啟用', '備註', '更新人', '更新時間',
  '公司抬頭', '統一編號', '收件地址', '聯絡電話', 'Email', 'MOQ_100ml', 'MOQ_500ml', 'MOQ_700ml', '授權酒款JSON', '預設規格', '試飲品約定', '特殊約定', '合約起日'];
var CCF = { key: 0, label: 1, discount: 2, closeDay: 3, contact: 4, enabled: 5, note: 6, updatedBy: 7, updatedAt: 8,
  company: 9, taxId: 10, address: 11, phone: 12, email: 13, moq100: 14, moq500: 15, moq700: 16, productsJson: 17, defaultVolume: 18, sampleTerms: 19, specialTerms: 20, contractStart: 21 };
var CONSIGN_VOLS = ['100ml', '500ml', '700ml'];
var CONSIGN_MOQ_DEFAULT = { '100ml': 25, '500ml': 12, '700ml': 12 };   // 未個別談定時的預設（Molly 202609 報價單 FOQ）
// 舊「經銷商設定」分頁只有 9 欄：欄數不足先補欄，再補空白表頭（冪等）
function _consignCfgEnsureHeaders_(ws) {
  if (ws.getMaxColumns() < CONSIGN_CFG_HEADERS.length) ws.insertColumnsAfter(ws.getMaxColumns(), CONSIGN_CFG_HEADERS.length - ws.getMaxColumns());
  for (var i = 0; i < CONSIGN_CFG_HEADERS.length; i++) {
    if (String(ws.getRange(1, i + 1).getValue() || '') === '') ws.getRange(1, i + 1).setValue(CONSIGN_CFG_HEADERS[i]);
  }
}

var CONSIGN_PRICE_SHEET = '牌價表';
var CONSIGN_PRICE_HEADERS = ['酒款', '對外名稱', '規格', '建議零售價', '備註', '更新人', '更新時間'];
var CPR = { product: 0, pubName: 1, volume: 2, price: 3, note: 4, updatedBy: 5, updatedAt: 6 };

var CONSIGN_LEDGER_SHEET = '經銷商庫存異動';
var CONSIGN_LEDGER_HEADERS = ['異動ID', '日期', '經銷商', '酒款', '規格', '瓶型', '異動類型', '數量(±)', '成交單價', '關聯訂單編號', '出貨批次', '操作人', '建立時間', '備註'];
var CLG = { id: 0, date: 1, dealer: 2, product: 3, volume: 4, bottleType: 5, type: 6, qty: 7, price: 8, orderNo: 9, seq: 10, operator: 11, createdAt: 12, note: 13 };
var CONSIGN_LEDGER_TYPES = ['進貨', '進貨取消', '售出', '退貨', '損耗', '盤點修正'];

var CONSIGN_STMT_SHEET = '經銷商對帳單';
var CONSIGN_STMT_HEADERS = ['對帳單ID', '經銷商', '期別', '期間起', '期間迄', '結算日', '售出瓶數', '請款金額', '明細JSON', '狀態', '建立人', '建立時間', '結清人', '入帳日', '認列訂單編號', '備註'];
var CST = { id: 0, dealer: 1, period: 2, from: 3, to: 4, closeDate: 5, soldQty: 6, amount: 7, detail: 8, status: 9, createdBy: 10, createdAt: 11, settledBy: 12, paidDate: 13, orderNo: 14, note: 15 };

// 種子資料（沙盒與正式第一次啟用時由 consignSeed 寫入；已存在的鍵不覆蓋＝冪等）
var CONSIGN_SEED_DEALERS = [
  ['經銷商－日光貳參', '日光貳參', 0.75, 5, '', 'TRUE', '牌價 75 折（標準寄售方案）'],
  ['經銷商－島羽', '島羽 Wing Islands', 0.70, 5, '', 'TRUE', '牌價 7 折（2026-08-29 首鋪專案價，內規：7 折為首鋪天花板非標準價）']
];
// 牌價來源：Molly「通路報價單_凱文南坡萬實業社_202609」。系統酒名帶 V2＝配方微調版（客戶不需知道），對外名稱用報價單名。
var CONSIGN_SEED_PRICES = (function () {
  var classic = [['蜜香紅茶荔枝琴酒V2', '蜜香紅茶荔枝琴酒'], ['茉莉香片脆梅琴酒V2', '茉莉香片脆梅琴酒'], ['芭樂綠茶梅酒', '芭樂綠茶梅酒'],
    ['包種茶青梅甜酒V2', '包種茶青梅甜酒'], ['白桃翠玉莫奇朵', '白桃翠玉莫奇朵'], ['海鹽西瓜莫奇朵', '海鹽西瓜莫奇朵']];
  var premium = [['煙燻百香果蘭姆酒', '煙燻百香果蘭姆酒'], ['青花椒烏梅蘭姆酒', '青花椒烏梅蘭姆酒'], ['泰奶烏龍蘭姆酒', '泰奶焙火烏龍蘭姆酒'], ['梔子花金萱威士忌V2', '梔子花金萱威士忌']];
  var out = [];
  classic.forEach(function (c) { out.push([c[0], c[1], '100ml', 200, '經典系列 ABV 8%']); out.push([c[0], c[1], '500ml', 850, '經典系列 ABV 8%']); out.push([c[0], c[1], '700ml', 1150, '經典系列 ABV 8%']); });
  premium.forEach(function (c) { out.push([c[0], c[1], '100ml', 250, '典藏系列 ABV 14%']); out.push([c[0], c[1], '500ml', 1000, '典藏系列 ABV 14%']); out.push([c[0], c[1], '700ml', 1350, '典藏系列 ABV 14%']); });
  return out;
})();

// ── 通用分頁取得（不存在即建立＋表頭）──
function _consignSheet_(name, headers) {
  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var ws = ss.getSheetByName(name);
  if (!ws) {
    ws = ss.insertSheet(name);
    ws.getRange(1, 1, 1, headers.length).setValues([headers]);
    ws.setFrozenRows(1);
  } else if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, headers.length).setValues([headers]);
    ws.setFrozenRows(1);
  }
  return ws;
}
function _consignRowsOf_(name, headers) {
  var ws = _consignSheet_(name, headers);
  if (ws.getLastRow() < 2) return [];
  return _consignPadRows_(ws.getRange(2, 1, ws.getLastRow() - 1, Math.min(headers.length, ws.getMaxColumns())).getValues(), headers.length);
}
// 讀取路徑用（不建分頁；分頁不存在＝視為空）
function _consignRowsRO_(name, headers) {
  try {
    var ws = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName(name);
    if (!ws || ws.getLastRow() < 2) return [];
    return _consignPadRows_(ws.getRange(2, 1, ws.getLastRow() - 1, Math.min(headers.length, ws.getMaxColumns())).getValues(), headers.length);
  } catch (e) { return []; }
}
// v3.37 表頭加欄後，舊分頁實體欄數可能少於 headers.length：讀取只取現有欄、其餘補空字串（避免 getRange 超出範圍丟例外→整張表被當成空）
function _consignPadRows_(rows, n) {
  for (var i = 0; i < rows.length; i++) while (rows[i].length < n) rows[i].push('');
  return rows;
}
function _consignNow_() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'); }
function _consignToday_() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'); }
function _consignGenId_(prefix) { return (prefix || 'C') + (new Date()).getTime() + '-' + Math.floor(Math.random() * 900 + 100); }
function _consignBool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
// 規格正規化：'100ml' / '100ml山形香水瓶' / '100 ML' → '100ml'
function _consignVolOf_(volume, bottleType) {
  var m = String(volume == null ? '' : volume).match(/(\d+)\s*ml/i);
  if (m) return m[1] + 'ml';
  m = String(bottleType == null ? '' : bottleType).match(/(\d+)\s*ml/i);
  if (m) return m[1] + 'ml';
  return String(volume == null ? '' : volume).trim();
}
function _consignKeyOf_(product, volume) { return String(product == null ? '' : product).trim() + '|' + String(volume == null ? '' : volume).trim(); }
// 期別工具：期別＝自然月
function _consignPeriodOf_(dateStr) { return String(dateStr || '').slice(0, 7); }
// ⚠️ Sheets 會把 '2026-08' 這種文字自動轉成 Date（沙盒實測踩到：對帳單期別變成 Date 物件、比對失敗重複建列）。
//   讀：Date → 'yyyy-MM'；寫：期別欄一律先設文字格式 '@' 再寫值。
function _consignPeriodStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM');
  return String(v == null ? '' : v).trim().slice(0, 7);
}
function _consignPeriodRange_(period) {
  var y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7));
  var last = new Date(y, m, 0).getDate();
  var mm = ('0' + m).slice(-2);
  return { from: y + '-' + mm + '-01', to: y + '-' + mm + '-' + ('0' + last).slice(-2) };
}
function _consignPrevPeriod_(period) {
  var y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7)) - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + ('0' + m).slice(-2);
}
function _consignNextPeriod_(period) {
  var y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7)) + 1;
  if (m > 12) { m = 1; y++; }
  return y + '-' + ('0' + m).slice(-2);
}
// 結帳日：期別 P 的對帳日＝次月第 closeDay 日（超過該月天數則取月底）
function _consignDueDate_(period, closeDay) {
  var np = _consignNextPeriod_(period);
  var y = Number(np.slice(0, 4)), m = Number(np.slice(5, 7));
  var last = new Date(y, m, 0).getDate();
  var d = Math.min(Math.max(1, Math.floor(Number(closeDay) || 5)), last);
  return np + '-' + ('0' + d).slice(-2);
}

// ── 經銷商設定 ──
function _consignDealerMap_() {
  var map = {};
  _consignRowsRO_(CONSIGN_CFG_SHEET, CONSIGN_CFG_HEADERS).forEach(function (r) {
    var key = String(r[CCF.key] || '').trim(); if (!key) return;
    // v3.37 MOQ：有填＝談定值（moqCustom），空＝預設；授權酒款 JSON 壞掉＝視為不限定
    var moq = {}, moqCustom = {};
    CONSIGN_VOLS.forEach(function (v) {
      var raw = r[CCF['moq' + parseInt(v, 10)]], n = Math.floor(Number(raw));
      if (raw !== '' && raw != null && n > 0) { moq[v] = n; moqCustom[v] = n; } else moq[v] = CONSIGN_MOQ_DEFAULT[v];
    });
    var products = [];
    try { products = r[CCF.productsJson] ? JSON.parse(String(r[CCF.productsJson])) : []; } catch (e) { products = []; }
    if (!Array.isArray(products)) products = [];
    map[key] = {
      key: key, label: String(r[CCF.label] || key), discount: Number(r[CCF.discount]) || 0,
      closeDay: Math.floor(Number(r[CCF.closeDay])) || 5, contact: String(r[CCF.contact] || ''),
      enabled: _consignBool_(r[CCF.enabled]), note: String(r[CCF.note] || ''),
      company: String(r[CCF.company] || ''), taxId: String(r[CCF.taxId] || ''), address: String(r[CCF.address] || ''),
      phone: String(r[CCF.phone] || ''), email: String(r[CCF.email] || ''),
      moq: moq, moqCustom: moqCustom, products: products, defaultVolume: String(r[CCF.defaultVolume] || '').trim(),
      sampleTerms: String(r[CCF.sampleTerms] || ''), specialTerms: String(r[CCF.specialTerms] || ''), contractStart: _fmtDate_(r[CCF.contractStart])
    };
  });
  return map;
}
function consignDealers(p) {
  var map = _consignDealerMap_();
  // 首次啟用自動種子：admin 第一次登入（bootstrap→consignDealers）若分頁還是空的，就把經銷商設定＋牌價種進去（冪等，正式站免手動打 consignSeed）
  if (!Object.keys(map).length && p && p._role === 'admin') {
    try { consignSeed(p); map = _consignDealerMap_(); } catch (e) {}
  }
  var list = Object.keys(map).map(function (k) { return map[k]; });
  return { ok: true, dealers: list };
}
function consignSaveDealer(p) {
  var key = String((p && p.key) || '').trim();
  if (!key) return { ok: false, error: '缺少經銷商鍵' };
  var discount = Number(p.discount);
  if (!(discount > 0 && discount <= 1)) return { ok: false, error: '折扣率須介於 0~1（如 0.75）' };
  var closeDay = Math.floor(Number(p.closeDay)) || 0;
  if (closeDay < 1 || closeDay > 31) return { ok: false, error: '結帳日須為 1~31' };
  // v3.37 經銷條件：MOQ（空＝預設）、授權酒款 JSON（空＝不限定）、預設規格、合約起日
  var moqs = {};
  for (var vi = 0; vi < CONSIGN_VOLS.length; vi++) {
    var v = CONSIGN_VOLS[vi], raw = p['moq' + parseInt(v, 10)];
    if (raw == null || String(raw).trim() === '') { moqs[v] = ''; continue; }
    var n = Math.floor(Number(raw));
    if (!(n > 0)) return { ok: false, error: 'MOQ ' + v + ' 須為正整數（留空＝預設 ' + CONSIGN_MOQ_DEFAULT[v] + ' 瓶）' };
    moqs[v] = n;
  }
  var productsJson = '';
  if (p.products != null && String(p.products).trim() !== '') {
    try {
      var arr = JSON.parse(String(p.products));
      if (!Array.isArray(arr)) throw new Error('not array');
      arr = arr.filter(function (e) { return e && String(e.product || '').trim(); }).map(function (e) {
        return { product: String(e.product).trim(), volumes: Array.isArray(e.volumes) ? e.volumes.map(String) : [] };
      });
      productsJson = arr.length ? JSON.stringify(arr) : '';
    } catch (e) { return { ok: false, error: '授權酒款格式錯誤' }; }
  }
  var defVol = String(p.defaultVolume || '').trim();
  if (defVol && !/^\d+ml$/i.test(defVol)) return { ok: false, error: '預設規格格式須如 100ml' };
  var contractStart = String(p.contractStart || '').trim();
  if (contractStart && !/^\d{4}-\d{2}-\d{2}$/.test(contractStart)) return { ok: false, error: '合約起日格式須為 YYYY-MM-DD' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _consignSheet_(CONSIGN_CFG_SHEET, CONSIGN_CFG_HEADERS);
    _consignCfgEnsureHeaders_(ws);   // 舊分頁補第 10～22 欄表頭
    var rows = _consignRowsOf_(CONSIGN_CFG_SHEET, CONSIGN_CFG_HEADERS);
    var op = String((p && p._user) || '');
    var enabled = (p.enabled == null || p.enabled === '') ? 'TRUE' : (String(p.enabled).toLowerCase() === 'true' ? 'TRUE' : 'FALSE');
    var row = [key, String(p.label || key), discount, closeDay, String(p.contact || ''), enabled, String(p.note || ''), op, _consignNow_(),
      String(p.company || ''), String(p.taxId || '').trim(), String(p.address || ''), String(p.phone || '').trim(), String(p.email || '').trim(),
      moqs['100ml'], moqs['500ml'], moqs['700ml'], productsJson, defVol, String(p.sampleTerms || ''), String(p.specialTerms || ''), contractStart];
    var r = 0;
    for (var i = 0; i < rows.length; i++) if (String(rows[i][CCF.key]).trim() === key) { r = i + 2; break; }
    var created = !r; if (!r) r = ws.getLastRow() + 1;
    // 統編／電話／合約起日鎖文字格式：Sheets 會吃掉統編開頭的 0、把日期字串轉 Date
    [CCF.taxId, CCF.phone, CCF.contractStart].forEach(function (c) { ws.getRange(r, c + 1).setNumberFormat('@'); });
    ws.getRange(r, 1, 1, CONSIGN_CFG_HEADERS.length).setValues([row]);
    return created ? { ok: true, created: true, dealer: key } : { ok: true, updated: true, dealer: key };
  } finally { lock.releaseLock(); }
}

// ── 牌價表 ──
function _consignPriceMap_() {
  var map = {};
  _consignRowsRO_(CONSIGN_PRICE_SHEET, CONSIGN_PRICE_HEADERS).forEach(function (r) {
    var prod = String(r[CPR.product] || '').trim(); if (!prod) return;
    var vol = _consignVolOf_(r[CPR.volume], '');
    map[_consignKeyOf_(prod, vol)] = { product: prod, pubName: String(r[CPR.pubName] || prod), volume: vol, price: Number(r[CPR.price]) || 0 };
  });
  return map;
}
function _consignStripVer_(name) { return String(name || '').replace(/\s*V\d+$/i, '').trim(); }
// 牌價查找：先精確（系統名+規格），再退回去掉 V2 尾綴比對（配方版本升級酒名改了也對得上）
function _consignPriceOf_(map, product, volume) {
  var k = _consignKeyOf_(product, volume);
  if (map[k]) return map[k];
  var base = _consignStripVer_(product);
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    var e = map[keys[i]];
    if (e.volume === volume && (_consignStripVer_(e.product) === base || e.pubName === base)) return e;
  }
  return null;
}
function _consignUnitPrice_(entry, discount) { return Math.round((Number(entry.price) || 0) * (Number(discount) || 0)); }
function consignPrices(p) {
  var map = _consignPriceMap_();
  var list = Object.keys(map).map(function (k) { return map[k]; });
  list.sort(function (a, b) { return a.product.localeCompare(b.product) || (parseInt(a.volume, 10) - parseInt(b.volume, 10)); });
  return { ok: true, prices: list };
}
// 一次性啟用（admin、冪等）：建四個分頁＋種經銷商設定與牌價（已存在的鍵不動）
function consignSeed(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var op = String((p && p._user) || 'seed'), now = _consignNow_();
    var cws = _consignSheet_(CONSIGN_CFG_SHEET, CONSIGN_CFG_HEADERS);
    var have = _consignDealerMap_();
    var addedD = [];
    CONSIGN_SEED_DEALERS.forEach(function (d) {
      if (have[d[0]]) return;
      cws.appendRow(d.concat([op, now])); addedD.push(d[0]);
    });
    var pws = _consignSheet_(CONSIGN_PRICE_SHEET, CONSIGN_PRICE_HEADERS);
    var pm = _consignPriceMap_();
    var addedP = 0, rowsP = [];
    CONSIGN_SEED_PRICES.forEach(function (r) {
      if (pm[_consignKeyOf_(r[0], r[2])]) return;
      rowsP.push(r.concat([op, now])); addedP++;
    });
    if (rowsP.length) pws.getRange(pws.getLastRow() + 1, 1, rowsP.length, CONSIGN_PRICE_HEADERS.length).setValues(rowsP);
    _consignSheet_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS);
    _consignSheet_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    return { ok: true, dealersAdded: addedD, pricesAdded: addedP };
  } finally { lock.releaseLock(); }
}

// ── 庫存異動流水帳 ──
function _consignLedgerRows_() { return _consignRowsRO_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS); }
function _consignRowObj_(r) {
  return {
    id: String(r[CLG.id] || ''), date: _fmtDate_(r[CLG.date]), dealer: String(r[CLG.dealer] || ''),
    product: String(r[CLG.product] || ''), volume: String(r[CLG.volume] || ''), bottleType: String(r[CLG.bottleType] || ''),
    type: String(r[CLG.type] || ''), qty: Math.round(Number(r[CLG.qty]) || 0), price: (r[CLG.price] === '' || r[CLG.price] == null) ? '' : (Number(r[CLG.price]) || 0),
    orderNo: String(r[CLG.orderNo] || ''), seq: String(r[CLG.seq] || ''), operator: String(r[CLG.operator] || ''),
    createdAt: _fmtDateTime_(r[CLG.createdAt]), note: String(r[CLG.note] || '')
  };
}
// 某經銷商在庫（依款式鍵彙總；untilDate 含當日，空＝全部）
function _consignStockMap_(rows, dealer, untilDate) {
  var m = {};
  rows.forEach(function (r) {
    if (String(r[CLG.dealer]) !== dealer) return;
    var d = _fmtDate_(r[CLG.date]);
    if (untilDate && d > untilDate) return;
    var prod = String(r[CLG.product] || ''), vol = String(r[CLG.volume] || '');
    var k = _consignKeyOf_(prod, vol);
    if (!m[k]) m[k] = { key: k, product: prod, volume: vol, bottleType: String(r[CLG.bottleType] || ''), qty: 0 };
    m[k].qty += Math.round(Number(r[CLG.qty]) || 0);
    if (r[CLG.bottleType]) m[k].bottleType = String(r[CLG.bottleType]);
  });
  return m;
}
function _consignStmtRows_() { return _consignRowsRO_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS); }
// v3.30 經銷商「預設規格」：目前寄售通路皆 100ml；日後可在經銷商設定備註欄寫 defaultVolume=500ml 覆寫
function _consignDefaultVol_(cfg) {
  var dv = String((cfg && cfg.defaultVolume) || '').trim();   // v3.37 正式欄位「預設規格」
  if (/^\d+ml$/i.test(dv)) return dv;
  var m = /defaultVolume\s*=\s*(\d+ml)/i.exec(String((cfg && cfg.note) || ''));   // v3.30 備註暗碼寫法相容
  return m ? m[1] : '100ml';
}
// v3.37 授權酒款：cfg.products=[{product, volumes:[...]}]；空陣列＝不限定（全部可叫）；volumes 空＝該款全部規格。酒名比對容忍 V2 尾綴
function _consignAllowed_(cfg, product, volume) {
  var list = (cfg && cfg.products) || [];
  if (!list.length) return true;
  var pn = String(product || '').trim(), ps = _consignStripVer_(pn), v = String(volume || '').trim();
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {}, ep = String(e.product || '').trim();
    if (ep !== pn && _consignStripVer_(ep) !== ps) continue;
    var vols = Array.isArray(e.volumes) ? e.volumes.map(String) : [];
    return !vols.length || vols.indexOf(v) >= 0;
  }
  return false;
}
// v3.30 每日銷售彙總（月）：售出＝POS 賣出瓶數；退貨列為負；營業額兩口徑＝牌價營業額(建議零售價×瓶數，參考) ／ 應付南坡萬(凍結成交單價×瓶數)
function _consignDailyOf_(rows, dealer, month, pm) {
  var byDay = {};
  rows.forEach(function (r) {
    if (String(r[CLG.dealer]) !== dealer) return;
    var t = String(r[CLG.type] || ''); if (t !== '售出' && t !== '退貨') return;
    var d = _fmtDate_(r[CLG.date]); if (d.slice(0, 7) !== month) return;
    var prod = String(r[CLG.product] || ''), vol = String(r[CLG.volume] || '');
    var q = -Math.round(Number(r[CLG.qty]) || 0);            // 售出/退貨在帳上是負數 → 轉成賣出瓶數（退貨變負）
    var unit = (r[CLG.price] === '' || r[CLG.price] == null) ? 0 : (Number(r[CLG.price]) || 0);
    var pe = _consignPriceOf_(pm, prod, vol);
    var list = pe ? (Number(pe.price) || 0) : 0;
    var day = byDay[d] || (byDay[d] = { date: d, qty: 0, owed: 0, retail: 0, lines: {} });
    var k = _consignKeyOf_(prod, vol);
    var ln = day.lines[k] || (day.lines[k] = { product: prod, pubName: pe ? pe.pubName : _consignStripVer_(prod), volume: vol, qty: 0, owed: 0, retail: 0, unitPrice: unit, listPrice: list });
    ln.qty += q; ln.owed += q * unit; ln.retail += q * list;
    day.qty += q; day.owed += q * unit; day.retail += q * list;
  });
  var days = Object.keys(byDay).sort().reverse().map(function (d) {
    var day = byDay[d];
    day.lines = Object.keys(day.lines).map(function (k) { return day.lines[k]; }).sort(function (a, b) { return a.product.localeCompare(b.product); });
    return day;
  });
  var tot = days.reduce(function (a, x) { a.qty += x.qty; a.owed += x.owed; a.retail += x.retail; return a; }, { qty: 0, owed: 0, retail: 0 });
  return { month: month, days: days, total: tot };
}
// v3.30 換月查每日銷售（經銷商＝自己；admin/財務 可帶 dealer）
function consignDaily(p) {
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  var month = String((p && p.month) || '').trim() || _consignPeriodOf_(_consignToday_());
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月份格式須為 YYYY-MM' };
  return { ok: true, dealer: dealer, daily: _consignDailyOf_(_consignLedgerRows_(), dealer, month, _consignPriceMap_()) };
}
function _consignStmtObj_(r) {
  var detail = [];
  try { detail = r[CST.detail] ? JSON.parse(r[CST.detail]) : []; } catch (e) { detail = []; }
  return {
    id: String(r[CST.id] || ''), dealer: String(r[CST.dealer] || ''), period: _consignPeriodStr_(r[CST.period]),
    from: _fmtDate_(r[CST.from]), to: _fmtDate_(r[CST.to]), closeDate: _fmtDate_(r[CST.closeDate]),
    soldQty: Math.round(Number(r[CST.soldQty]) || 0), amount: Math.round(Number(r[CST.amount]) || 0), detail: detail,
    status: String(r[CST.status] || ''), createdBy: String(r[CST.createdBy] || ''), createdAt: _fmtDateTime_(r[CST.createdAt]),
    settledBy: String(r[CST.settledBy] || ''), paidDate: _fmtDate_(r[CST.paidDate]), orderNo: String(r[CST.orderNo] || ''), note: String(r[CST.note] || '')
  };
}
function _consignStmtOf_(rows, dealer, period) {
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][CST.dealer]) === dealer && _consignPeriodStr_(rows[i][CST.period]) === period) return { row: rows[i], idx: i };
  }
  return null;
}
// 該日期所屬期別是否已結清（結清後的期別禁止再登記異動＝帳鎖）
function _consignPeriodLocked_(dealer, dateStr) {
  var s = _consignStmtOf_(_consignStmtRows_(), dealer, _consignPeriodOf_(dateStr));
  return !!(s && String(s.row[CST.status]) === '已結清');
}

// 期別結算（純計算，不寫入）：每款 期初／進貨／售出(瓶、金額)／其他(退貨損耗盤點)／期末；恆等式 期末＝期初＋進貨−售出＋其他
function _consignCalcPeriod_(dealer, period, rows, cfg) {
  var rg = _consignPeriodRange_(period);
  var byKey = {}, order = [];
  function slot(prod, vol, bt) {
    var k = _consignKeyOf_(prod, vol);
    if (!byKey[k]) { byKey[k] = { key: k, product: prod, volume: vol, bottleType: bt || '', opening: 0, inQty: 0, sold: 0, soldAmt: 0, other: 0, closing: 0, prices: {} }; order.push(k); }
    if (bt) byKey[k].bottleType = bt;
    return byKey[k];
  }
  rows.forEach(function (r) {
    if (String(r[CLG.dealer]) !== dealer) return;
    var d = _fmtDate_(r[CLG.date]); if (!d) return;
    var s = slot(String(r[CLG.product] || ''), String(r[CLG.volume] || ''), String(r[CLG.bottleType] || ''));
    var q = Math.round(Number(r[CLG.qty]) || 0);
    var t = String(r[CLG.type] || '');
    if (d < rg.from) { s.opening += q; return; }
    if (d > rg.to) return;
    if (t === '進貨' || t === '進貨取消') s.inQty += q;
    else if (t === '售出') { s.sold += -q; var up = Number(r[CLG.price]) || 0; s.soldAmt += (-q) * up; s.prices[up] = (s.prices[up] || 0) + (-q); }
    else s.other += q;
  });
  var totalSold = 0, totalAmt = 0, totalClosing = 0, totalOpening = 0, totalIn = 0;
  var items = order.map(function (k) {
    var s = byKey[k];
    s.closing = s.opening + s.inQty - s.sold + s.other;
    totalSold += s.sold; totalAmt += s.soldAmt; totalClosing += s.closing; totalOpening += s.opening; totalIn += s.inQty;
    var ps = Object.keys(s.prices).map(Number);
    s.unitPrice = ps.length === 1 ? ps[0] : (ps.length ? ps.sort(function (a, b) { return a - b; }).join('/') : '');
    delete s.prices;
    return s;
  }).filter(function (s) { return s.opening || s.inQty || s.sold || s.other || s.closing; });
  return { dealer: dealer, period: period, from: rg.from, to: rg.to, items: items,
    totalOpening: totalOpening, totalIn: totalIn, totalSold: totalSold, totalAmount: totalAmt, totalClosing: totalClosing,
    dueDate: _consignDueDate_(period, cfg ? cfg.closeDay : 5) };
}

// ── 出貨連動（由 addShipment／deleteShipment 呼叫；失敗不阻斷出貨，回傳訊息給前端）──
// 出貨給啟用中的經銷商 → 自動寫「進貨」列（規格取自訂單 items 的 volume，找不到就從瓶型字串解析）
function _consignOnShipment_(client, orderNo, seq, date, useLines, items, op) {
  var map = _consignDealerMap_();
  var cfg = map[String(client)];
  if (!cfg || !cfg.enabled) return null;
  var volByKey = {};
  (items || []).forEach(function (it) { volByKey[_shipKeyOf_(it.product, it.bottleType)] = _consignVolOf_(it.volume, it.bottleType); });
  var ws = _consignSheet_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS);
  var now = _consignNow_(), gid = _consignGenId_('CI');
  var out = useLines.map(function (u, i) {
    var vol = volByKey[u.key] || _consignVolOf_('', u.bottleType);
    return [gid + '-' + (i + 1), String(date), String(client), u.product, vol, u.bottleType, '進貨', u.qty, '',
      String(orderNo), seq, op, now, '訂單出貨 第 ' + seq + ' 次'];
  });
  if (out.length) ws.getRange(ws.getLastRow() + 1, 1, out.length, CONSIGN_LEDGER_HEADERS.length).setValues(out);
  return { dealer: cfg.key, lines: out.length };
}
function _consignOnShipmentDelete_(client, orderNo, seq, delLines, op) {
  var map = _consignDealerMap_();
  var cfg = map[String(client)];
  if (!cfg) return null;
  // 找到當初自動寫的進貨列（同單同批），逐列沖回
  var rows = _consignLedgerRows_();
  var back = [];
  rows.forEach(function (r) {
    if (String(r[CLG.dealer]) !== String(client)) return;
    if (String(r[CLG.orderNo]) !== String(orderNo) || String(r[CLG.seq]) !== String(seq)) return;
    if (String(r[CLG.type]) !== '進貨') return;
    back.push({ product: String(r[CLG.product]), volume: String(r[CLG.volume]), bottleType: String(r[CLG.bottleType]), qty: Math.round(Number(r[CLG.qty]) || 0) });
  });
  if (!back.length) return null;
  var ws = _consignSheet_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS);
  var now = _consignNow_(), gid = _consignGenId_('CX'), today = _consignToday_();
  var out = back.map(function (b, i) {
    return [gid + '-' + (i + 1), today, String(client), b.product, b.volume, b.bottleType, '進貨取消', -b.qty, '',
      String(orderNo), seq, op, now, '刪除第 ' + seq + ' 次出貨紀錄，門市在庫沖回'];
  });
  ws.getRange(ws.getLastRow() + 1, 1, out.length, CONSIGN_LEDGER_HEADERS.length).setValues(out);
  return { dealer: cfg.key, lines: out.length };
}

// ── 經銷商端：一次取回自己的全部畫面資料 ──
function consignMe(p) {
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  var cfg = _consignDealerMap_()[dealer];
  if (!cfg) return { ok: false, error: '找不到經銷商設定：' + dealer };
  var rows = _consignLedgerRows_();
  var pm = _consignPriceMap_();
  var stockMap = _consignStockMap_(rows, dealer, '');
  var stock = Object.keys(stockMap).map(function (k) {
    var s = stockMap[k];
    var pe = _consignPriceOf_(pm, s.product, s.volume);
    s.listPrice = pe ? pe.price : '';
    s.unitPrice = pe ? _consignUnitPrice_(pe, cfg.discount) : '';
    s.pubName = pe ? pe.pubName : _consignStripVer_(s.product);
    return s;
  });
  // v3.30 主公指示：10 款酒永遠列出——牌價表有、但這家還沒進過貨的款式，以「預設規格」補一列在庫 0（placeholder），店長一眼看全 10 款
  //   v3.37：只補「授權」的款（未限定＝全部）；預設規格若未授權就改列該款第一個授權規格
  var defVol = _consignDefaultVol_(cfg);
  var have = {}; stock.forEach(function (x) { have[x.product] = true; });
  var byProd = {};
  Object.keys(pm).forEach(function (k) { var pe = pm[k]; (byProd[pe.product] = byProd[pe.product] || []).push(pe); });
  Object.keys(byProd).forEach(function (prod) {
    if (have[prod]) return;
    var allowed = byProd[prod].filter(function (pe) { return _consignAllowed_(cfg, pe.product, pe.volume); });
    if (!allowed.length) return;
    allowed.sort(function (a, b) { return parseInt(a.volume, 10) - parseInt(b.volume, 10); });
    var pe = allowed.filter(function (x) { return String(x.volume) === defVol; })[0] || allowed[0];
    have[prod] = true;
    stock.push({ key: _consignKeyOf_(pe.product, pe.volume), product: pe.product, volume: pe.volume, bottleType: _consignBottleFor_(pe.volume), qty: 0,
      listPrice: pe.price, unitPrice: _consignUnitPrice_(pe, cfg.discount), pubName: pe.pubName, placeholder: true });
  });
  stock.sort(function (a, b) { return a.product.localeCompare(b.product) || (parseInt(a.volume, 10) - parseInt(b.volume, 10)); });
  var today = _consignToday_();
  var curPeriod = _consignPeriodOf_(today);
  var cur = _consignCalcPeriod_(dealer, curPeriod, rows, cfg);
  var prevPeriod = _consignPrevPeriod_(curPeriod);
  var prev = _consignCalcPeriod_(dealer, prevPeriod, rows, cfg);
  var srows = _consignStmtRows_();
  var stmts = srows.filter(function (r) { return String(r[CST.dealer]) === dealer; }).map(_consignStmtObj_)
    .sort(function (a, b) { return b.period.localeCompare(a.period); }).slice(0, 12);
  var prevStmt = stmts.filter(function (s) { return s.period === prevPeriod; })[0] || null;
  var todaySold = 0;
  rows.forEach(function (r) { if (String(r[CLG.dealer]) === dealer && String(r[CLG.type]) === '售出' && _fmtDate_(r[CLG.date]) === today) todaySold += -Math.round(Number(r[CLG.qty]) || 0); });
  var recent = rows.filter(function (r) { return String(r[CLG.dealer]) === dealer; }).map(_consignRowObj_).reverse().slice(0, 40);
  var lockedPeriods = stmts.filter(function (s) { return s.status === '已結清'; }).map(function (s) { return s.period; });
  var catalog = _consignCatalog_(cfg);   // v3.29 叫貨目錄（牌價表全款＋折扣後單價＋FOQ）
  var restocks = _consignRestockRows_().filter(function (r) { return String(r[CRS.dealer]) === dealer; }).map(_consignRestockObj_).reverse().slice(0, 10);
  var daily = _consignDailyOf_(rows, dealer, curPeriod, pm);   // v3.30 本月每日銷售（換月由 consignDaily 抓）
  return { ok: true, dealer: cfg, today: today, stock: stock, todaySold: todaySold,
    current: cur, previous: prev, previousStatement: prevStmt, statements: stmts, recent: recent, lockedPeriods: lockedPeriods,
    catalog: catalog, restocks: restocks, daily: daily };
}

// ── 登記售出（經銷商本人／admin 代登）：lines=[{product, volume, qty}]，單價當下凍結 ──
function consignSale(p) {
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  var cfg = _consignDealerMap_()[dealer];
  if (!cfg) return { ok: false, error: '找不到經銷商設定：' + dealer };
  if (!cfg.enabled) return { ok: false, error: '此經銷商已停用' };
  var date = String((p && p.date) || '').trim() || _consignToday_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日期格式須為 YYYY-MM-DD' };
  if (date > _consignToday_()) return { ok: false, error: '售出日期不可晚於今天' };
  var lines;
  try { lines = typeof p.lines === 'string' ? JSON.parse(p.lines) : (p.lines || []); }
  catch (e) { return { ok: false, error: '明細 JSON 解析失敗' }; }
  if (!lines || !lines.length) return { ok: false, error: '請至少填一款售出數量' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (_consignPeriodLocked_(dealer, date)) return { ok: false, error: date.slice(0, 7) + ' 期已結清鎖帳，無法再登記；如需更正請聯絡南坡萬' };
    var rows = _consignLedgerRows_();
    var stockMap = _consignStockMap_(rows, dealer, '');
    var pm = _consignPriceMap_();
    var use = [], bad = [], need = {};
    lines.forEach(function (ln) {
      var q = Math.floor(Number(ln.qty)) || 0; if (q <= 0) return;
      var prod = String(ln.product || '').trim(), vol = _consignVolOf_(ln.volume, ln.bottleType);
      var k = _consignKeyOf_(prod, vol);
      var st = stockMap[k];
      if (!st) { bad.push('「' + prod + ' ' + vol + '」不在門市在庫清單內'); return; }
      need[k] = (need[k] || 0) + q;
      if (need[k] > st.qty) { bad.push('「' + prod + ' ' + vol + '」售出 ' + need[k] + ' 瓶，超過在庫 ' + st.qty + ' 瓶'); return; }
      var pe = _consignPriceOf_(pm, prod, vol);
      if (!pe) { bad.push('「' + prod + ' ' + vol + '」牌價表查無此規格，請南坡萬補牌價後再登記'); return; }
      use.push({ product: prod, volume: vol, bottleType: st.bottleType, qty: q, unitPrice: _consignUnitPrice_(pe, cfg.discount), listPrice: pe.price });
    });
    if (bad.length) return { ok: false, error: '登記有誤，整批未寫入：' + bad.join('；'), problems: bad };
    if (!use.length) return { ok: false, error: '售出數量皆為 0，未寫入' };
    var ws = _consignSheet_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS);
    var now = _consignNow_(), gid = _consignGenId_('CS'), op = String((p && p._user) || ''), note = String((p && p.note) || '');
    var out = use.map(function (u, i) {
      return [gid + '-' + (i + 1), date, dealer, u.product, u.volume, u.bottleType, '售出', -u.qty, u.unitPrice, '', '', op, now, note];
    });
    ws.getRange(ws.getLastRow() + 1, 1, out.length, CONSIGN_LEDGER_HEADERS.length).setValues(out);
    var amount = 0; use.forEach(function (u) { amount += u.qty * u.unitPrice; });
    return { ok: true, dealer: dealer, date: date, lines: use, amount: amount };
  } finally { lock.releaseLock(); }
}
// ── 其他異動（退貨／損耗／盤點修正）：盤點修正 qty＝實際盤點數，系統倒推差額；退貨損耗 qty＝正數 ──
function consignAdjust(p) {
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  var cfg = _consignDealerMap_()[dealer];
  if (!cfg) return { ok: false, error: '找不到經銷商設定：' + dealer };
  var type = String((p && p.type) || '').trim();
  if (['退貨', '損耗', '盤點修正'].indexOf(type) < 0) return { ok: false, error: '異動類型須為 退貨／損耗／盤點修正' };
  var date = String((p && p.date) || '').trim() || _consignToday_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日期格式須為 YYYY-MM-DD' };
  if (date > _consignToday_()) return { ok: false, error: '日期不可晚於今天' };
  var note = String((p && p.note) || '').trim();
  if (!note) return { ok: false, error: '請填寫原因（備註必填，供雙方對帳）' };
  var lines;
  try { lines = typeof p.lines === 'string' ? JSON.parse(p.lines) : (p.lines || []); }
  catch (e) { return { ok: false, error: '明細 JSON 解析失敗' }; }
  if (!lines || !lines.length) return { ok: false, error: '請至少填一款' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (_consignPeriodLocked_(dealer, date)) return { ok: false, error: date.slice(0, 7) + ' 期已結清鎖帳，無法再登記' };
    var rows = _consignLedgerRows_();
    var stockMap = _consignStockMap_(rows, dealer, '');
    var use = [], bad = [];
    lines.forEach(function (ln) {
      var prod = String(ln.product || '').trim(), vol = _consignVolOf_(ln.volume, ln.bottleType);
      var k = _consignKeyOf_(prod, vol), st = stockMap[k];
      if (!st) { bad.push('「' + prod + ' ' + vol + '」不在門市在庫清單內'); return; }
      var delta;
      if (type === '盤點修正') {
        var actual = Math.floor(Number(ln.qty));
        if (!(actual >= 0)) { bad.push('「' + prod + '」盤點數須為 ≥0 的整數'); return; }
        delta = actual - st.qty;
        if (delta === 0) return;   // 沒差就不寫
      } else {
        var q = Math.floor(Number(ln.qty)) || 0;
        if (q <= 0) return;
        if (q > st.qty) { bad.push('「' + prod + ' ' + vol + '」' + type + ' ' + q + ' 瓶，超過在庫 ' + st.qty + ' 瓶'); return; }
        delta = -q;
      }
      use.push({ product: prod, volume: vol, bottleType: st.bottleType, delta: delta, before: st.qty, after: st.qty + delta });
    });
    if (bad.length) return { ok: false, error: '登記有誤，整批未寫入：' + bad.join('；'), problems: bad };
    if (!use.length) return { ok: false, error: '沒有需要寫入的異動（數量為 0 或盤點數與在庫相同）' };
    var ws = _consignSheet_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS);
    var now = _consignNow_(), gid = _consignGenId_('CA'), op = String((p && p._user) || '');
    var out = use.map(function (u, i) {
      return [gid + '-' + (i + 1), date, dealer, u.product, u.volume, u.bottleType, type, u.delta, '', '', '', op, now, note];
    });
    ws.getRange(ws.getLastRow() + 1, 1, out.length, CONSIGN_LEDGER_HEADERS.length).setValues(out);
    return { ok: true, dealer: dealer, type: type, date: date, lines: use };
  } finally { lock.releaseLock(); }
}
// ── 流水帳查詢：dealer 必填（經銷商角色由 session 強制）；from/to 選填 ──
function consignLedger(p) {
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  var from = String((p && p.from) || ''), to = String((p && p.to) || '');
  var list = _consignLedgerRows_().filter(function (r) {
    if (String(r[CLG.dealer]) !== dealer) return false;
    var d = _fmtDate_(r[CLG.date]);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }).map(_consignRowObj_).reverse();
  return { ok: true, dealer: dealer, list: list };
}
function consignStatements(p) {
  var dealer = String((p && p.dealer) || '').trim();
  var list = _consignStmtRows_().filter(function (r) { return !dealer || String(r[CST.dealer]) === dealer; })
    .map(_consignStmtObj_).sort(function (a, b) { return b.period.localeCompare(a.period) || a.dealer.localeCompare(b.dealer); });
  return { ok: true, statements: list };
}

// ── 南坡萬端：某期別全經銷商總覽 ──
function consignOverview(p) {
  var period = String((p && p.period) || '').trim() || _consignPeriodOf_(_consignToday_());
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: '期別格式須為 YYYY-MM' };
  var map = _consignDealerMap_();
  var rows = _consignLedgerRows_();
  var srows = _consignStmtRows_();
  var pm = _consignPriceMap_();
  var today = _consignToday_();
  var dealers = Object.keys(map).map(function (k) {
    var cfg = map[k];
    var calc = _consignCalcPeriod_(k, period, rows, cfg);
    var s = _consignStmtOf_(srows, k, period);
    var curStock = _consignStockMap_(rows, k, '');
    var stockNow = 0, stockItems = [];
    Object.keys(curStock).forEach(function (kk) {
      var st = curStock[kk]; stockNow += st.qty;
      var pe = _consignPriceOf_(pm, st.product, st.volume);
      st.unitPrice = pe ? _consignUnitPrice_(pe, cfg.discount) : '';
      stockItems.push(st);
    });
    // 牌價缺漏檢查：在庫有、牌價沒有 → 登記售出會被擋，先提醒
    var missing = stockItems.filter(function (st) { return st.qty > 0 && st.unitPrice === ''; }).map(function (st) { return st.product + ' ' + st.volume; });
    return { cfg: cfg, calc: calc, statement: s ? _consignStmtObj_(s.row) : null, stockNow: stockNow, stockItems: stockItems,
      isDue: (today >= calc.dueDate) && !(s && String(s.row[CST.status]) === '已結清'), missingPrices: missing };
  });
  var pending = _consignRestockRows_().filter(function (r) { return String(r[CRS.status]) === '待放行'; }).map(_consignRestockObj_).reverse();   // v3.29
  return { ok: true, period: period, today: today, dealers: dealers, pendingRestocks: pending };
}
// ── 產生／重算對帳單（admin）：已結清者拒絕；待結清者可重算覆蓋（結清前數字可變）──
function consignStatementCreate(p) {
  var dealer = String((p && p.dealer) || '').trim();
  var period = String((p && p.period) || '').trim();
  if (!dealer || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: '缺少經銷商或期別' };
  var cfg = _consignDealerMap_()[dealer];
  if (!cfg) return { ok: false, error: '找不到經銷商設定：' + dealer };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _consignSheet_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    var srows = _consignRowsOf_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    var exist = _consignStmtOf_(srows, dealer, period);
    if (exist && String(exist.row[CST.status]) === '已結清') return { ok: false, error: period + ' 期已結清，不可重算' };
    var calc = _consignCalcPeriod_(dealer, period, _consignLedgerRows_(), cfg);
    var op = String((p && p._user) || ''), now = _consignNow_();
    var id = exist ? String(exist.row[CST.id]) : _consignGenId_('ST');
    var row = [id, dealer, period, calc.from, calc.to, calc.dueDate, calc.totalSold, calc.totalAmount,
      JSON.stringify(calc.items), '待結清', op, exist ? exist.row[CST.createdAt] : now, '', '', '', String((p && p.note) || (exist ? exist.row[CST.note] : ''))];
    var rowIdx = exist ? (exist.idx + 2) : (ws.getLastRow() + 1);
    ws.getRange(rowIdx, CST.period + 1).setNumberFormat('@');   // 期別欄鎖文字，防 '2026-08' 被轉成 Date
    ws.getRange(rowIdx, 1, 1, CONSIGN_STMT_HEADERS.length).setValues([row]);
    return { ok: true, id: id, dealer: dealer, period: period, amount: calc.totalAmount, soldQty: calc.totalSold, recalculated: !!exist, calc: calc };
  } finally { lock.releaseLock(); }
}
// ── 撤銷對帳單（admin）：只允許尚未產生認列單的對帳單（誤產生／期別選錯）；結清且已建認列單者不可撤，請走刪除訂單＋人工處理 ──
function consignStatementDelete(p) {
  var id = String((p && p.id) || '').trim();
  if (!id) return { ok: false, error: '缺少對帳單 ID' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _consignSheet_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    var srows = _consignRowsOf_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    for (var i = srows.length - 1; i >= 0; i--) {
      if (String(srows[i][CST.id]) !== id) continue;
      if (String(srows[i][CST.orderNo] || '').trim()) return { ok: false, error: '此對帳單已建立認列單 ' + srows[i][CST.orderNo] + '，不可撤銷' };
      ws.deleteRow(i + 2);
      return { ok: true, id: id, dealer: String(srows[i][CST.dealer]), period: _consignPeriodStr_(srows[i][CST.period]) };
    }
    return { ok: false, error: '找不到對帳單：' + id };
  } finally { lock.releaseLock(); }
}
// ── 結清（admin，主公拍板方案 B）：標「已結清」＋自動建「經銷商寄售月結認列單」訂單（金額>0 才建）──
function consignStatementSettle(p) {
  var id = String((p && p.id) || '').trim();
  var paidDate = String((p && p.paidDate) || '').trim() || _consignToday_();
  if (!id) return { ok: false, error: '缺少對帳單 ID' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return { ok: false, error: '入帳日格式須為 YYYY-MM-DD' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _consignSheet_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    var srows = _consignRowsOf_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS);
    var idx = -1;
    for (var i = 0; i < srows.length; i++) if (String(srows[i][CST.id]) === id) { idx = i; break; }
    if (idx < 0) return { ok: false, error: '找不到對帳單：' + id };
    var st = _consignStmtObj_(srows[idx]);
    if (st.status === '已結清') return { ok: false, error: '此對帳單已結清（' + st.paidDate + '），不可重複結清' };
    var cfg = _consignDealerMap_()[st.dealer] || { label: st.dealer };
    var op = String((p && p._user) || '');
    // 結清前以最新流水帳重算一次＝對帳單數字永遠等於帳本（防「產生後又補登售出」）
    var calc = _consignCalcPeriod_(st.dealer, st.period, _consignLedgerRows_(), cfg);
    var orderNo = '';
    if (calc.totalAmount > 0) {
      var items = calc.items.filter(function (it) { return it.sold > 0; }).map(function (it) {
        return { product: it.product, sheet: '', volume: it.volume, bottleType: it.bottleType || '', qty: it.sold, status: '完成', unitPrice: it.unitPrice, amount: it.soldAmt };
      });
      var res = createOrder({
        client: st.dealer, orderType: TYPE_CONSIGN_SETTLE, deliveryDate: calc.to, actualDeliveryDate: calc.to,
        items: items, total: calc.totalAmount, balance: 0, depositStatus: '已結清', pm: String(p.pm || 'Molly'),
        depositAmount: '', finalAmount: calc.totalAmount, finalDueDate: calc.dueDate, finalPaidDate: paidDate,
        orderCreator: op, user: op, _user: op, _role: 'admin',
        finalAdjustNote: '寄售 ' + st.period + ' 期月結認列（對帳單 ' + id + '）'
      });
      if (!res || !res.ok) return { ok: false, error: '認列單建立失敗：' + ((res && res.error) || '') };
      orderNo = res.orderNo;
      // 認列單不是待製作／待出貨的單：直接標已完成＋出貨日已確認
      try {
        var ows = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
        var data = ows.getDataRange().getValues();
        for (var j = data.length - 1; j >= 1; j--) {
          if (String(data[j][0]) === String(orderNo)) { ows.getRange(j + 1, 9).setValue('已完成'); ows.getRange(j + 1, 13).setValue('TRUE'); break; }
        }
      } catch (e) {}
      _logOrderChange_(orderNo, op, '寄售月結認列', st.dealer + '／' + st.period + ' 期／售出 ' + calc.totalSold + ' 瓶／NT$' + calc.totalAmount + '／入帳 ' + paidDate);
    }
    var row = srows[idx].slice();
    row[CST.period] = st.period;   // 以正規化字串回寫（若曾被 Sheets 轉成 Date，這裡順手修正）
    row[CST.soldQty] = calc.totalSold; row[CST.amount] = calc.totalAmount; row[CST.detail] = JSON.stringify(calc.items);
    row[CST.status] = '已結清'; row[CST.settledBy] = op; row[CST.paidDate] = paidDate; row[CST.orderNo] = orderNo;
    if (p && p.note) row[CST.note] = String(p.note);
    ws.getRange(idx + 2, CST.period + 1).setNumberFormat('@');
    ws.getRange(idx + 2, 1, 1, CONSIGN_STMT_HEADERS.length).setValues([row]);
    return { ok: true, id: id, dealer: st.dealer, period: st.period, amount: calc.totalAmount, soldQty: calc.totalSold, paidDate: paidDate, orderNo: orderNo };
  } finally { lock.releaseLock(); }
}
// ── 沙盒限定：清空門市在庫流水帳＋對帳單（保留經銷商設定與牌價），供重複驗收；PROD 一律拒絕 ──
function __consignReset(p) {
  if (getEnvInfo().env === 'PROD') return { ok: false, error: '僅限測試環境' };
  var out = {};
  [[CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS], [CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS]].forEach(function (x) {
    var ws = _consignSheet_(x[0], x[1]);
    var n = ws.getLastRow() - 1;
    if (n > 0) ws.deleteRows(2, n);
    out[x[0]] = n > 0 ? n : 0;
  });
  return { ok: true, cleared: out };
}
// ── 結帳日提醒（admin／財務；登入時一天一次由前端控制）：最近 3 期中「已到對帳日但尚未結清」的期別 ──
function consignAlerts(p) {
  var map = _consignDealerMap_();
  var keys = Object.keys(map).filter(function (k) { return map[k].enabled; });
  if (!keys.length) return { ok: true, alerts: [] };
  var rows = _consignLedgerRows_(), srows = _consignStmtRows_();
  var today = _consignToday_();
  var cur = _consignPeriodOf_(today);
  var alerts = [];
  keys.forEach(function (k) {
    var cfg = map[k];
    var per = _consignPrevPeriod_(cur);
    for (var n = 0; n < 3; n++) {
      var due = _consignDueDate_(per, cfg.closeDay);
      var s = _consignStmtOf_(srows, k, per);
      var settled = !!(s && String(s.row[CST.status]) === '已結清');
      if (today >= due && !settled) {
        var calc = _consignCalcPeriod_(k, per, rows, cfg);
        if (calc.totalSold > 0 || calc.totalOpening > 0 || calc.totalIn > 0 || s) {
          alerts.push({ dealer: k, label: cfg.label, period: per, dueDate: due, status: s ? '待結清' : '未產生對帳單', soldQty: calc.totalSold, amount: calc.totalAmount });
        }
      }
      per = _consignPrevPeriod_(per);
    }
  });
  var restocks = _consignRestockRows_().filter(function (r) { return String(r[CRS.status]) === '待放行'; }).map(_consignRestockObj_);   // v3.29 待放行叫貨
  return { ok: true, alerts: alerts, pendingRestocks: restocks.map(function (q) { return { id: q.id, dealer: q.dealer, label: (map[q.dealer] || {}).label || q.dealer, date: q.date, totalQty: q.totalQty, emailed: q.emailed }; }) };
}


// ############################################################
// ##  v3.29 P2 經銷商叫貨系統（2026-09-03 主公拍板：人工放行＋email 通知）
// ##  流程：店長 dealer.html 送叫貨（FOQ 檢查）→ 寫「經銷商叫貨單」待放行 ＋ MailApp 通知 Molly/Kevin
// ##        → admin 在「經銷商寄售」分頁放行 → 自動建「自有酒款出貨訂單(有金流)」(金額 0、寄售) ／ 或駁回填原因
// ##  ⚠️ MailApp 需要新的 OAuth scope（script.send_mail）：部署前須由 joyhouse.rental 在編輯器跑一次 __authMail 授權；
// ##     寄信一律 try/catch＝授權前叫貨照樣成立，只是 emailSent=false（回傳與分頁都會標示）。
// ############################################################
var CONSIGN_NOTIFY_EMAILS = ['molly_lin@kevinnumber1-cocktail.com', 'kevin_huang@kevinnumber1-cocktail.com'];
var TYPE_CONSIGN_SHIP = '自有酒款出貨訂單(有金流)';   // 與前端 TYPE_SHIP 同字串（後端原本沒有這個常數）
var CONSIGN_RESTOCK_SHEET = '經銷商叫貨單';
var CONSIGN_RESTOCK_HEADERS = ['叫貨ID', '經銷商', '申請日期', '狀態', '明細JSON', '希望到貨日', '備註', '申請人', '建立時間', '審核人', '審核時間', '審核備註', '建立訂單編號', 'email通知', 'email錯誤', '出貨日'];
var CRS = { id: 0, dealer: 1, date: 2, status: 3, detail: 4, wishDate: 5, note: 6, applicant: 7, createdAt: 8, reviewer: 9, reviewedAt: 10, reviewNote: 11, orderNo: 12, emailed: 13, emailErr: 14, shipDate: 15 };
// 舊分頁補齊新表頭（O email錯誤／P 出貨日）
function _consignRestockEnsureHeaders_(ws) {
  for (var i = 0; i < CONSIGN_RESTOCK_HEADERS.length; i++) {
    if (String(ws.getRange(1, i + 1).getValue() || '') === '') ws.getRange(1, i + 1).setValue(CONSIGN_RESTOCK_HEADERS[i]);
  }
}
// v3.32 出貨連動叫貨單：該訂單來自叫貨（M 欄=訂單編號）→ 全出清「已出貨」／未出清「部分出貨」，P 欄記最近出貨日；回傳更新筆數
function _consignRestockOnShip_(orderNo, date, allShipped) {
  var ws = _consignSheet_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS);
  _consignRestockEnsureHeaders_(ws);
  var rows = _consignRowsOf_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS), n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][CRS.orderNo]) !== String(orderNo)) continue;
    var st = String(rows[i][CRS.status] || '');
    if (st !== '已放行' && st !== '部分出貨' && st !== '已出貨') continue;
    ws.getRange(i + 2, CRS.status + 1).setValue(allShipped ? '已出貨' : '部分出貨');
    ws.getRange(i + 2, CRS.shipDate + 1).setNumberFormat('@').setValue(String(date || ''));
    n++;
  }
  return n;
}
// v3.32 刪除出貨批次後回推叫貨單狀態：仍有批次→部分出貨；全無→已放行（清出貨日）
function _consignRestockOnShipDelete_(orderNo, remainingBatches, lastDate) {
  var ws = _consignSheet_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS);
  var rows = _consignRowsOf_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS), n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][CRS.orderNo]) !== String(orderNo)) continue;
    var st = String(rows[i][CRS.status] || '');
    if (st !== '部分出貨' && st !== '已出貨') continue;
    ws.getRange(i + 2, CRS.status + 1).setValue(remainingBatches > 0 ? '部分出貨' : '已放行');
    ws.getRange(i + 2, CRS.shipDate + 1).setValue(remainingBatches > 0 ? String(lastDate || '') : '');
    n++;
  }
  return n;
}
// 最低叫貨量：v3.37 起每家可在「經銷商設定」談定（MOQ_100ml／500ml／700ml），未填走預設（Molly 202609 報價單：100ml 25 瓶／500・700ml 12 瓶）
function _consignFoqOf_(volume, cfg) {
  var v = String(volume);
  if (cfg && cfg.moq && Number(cfg.moq[v]) > 0) return Number(cfg.moq[v]);
  return CONSIGN_MOQ_DEFAULT[v] || 12;
}
// 依規格預設瓶型（建單頁同一套慣例；700ml 尚無庫存瓶型，留空讓 admin 在訂單補）
function _consignBottleFor_(volume) { return ({ '100ml': '100ml山形香水瓶', '500ml': '500ml大香水瓶' })[String(volume)] || ''; }
function _consignRestockRows_() { return _consignRowsRO_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS); }
function _consignRestockObj_(r) {
  var detail = [];
  try { detail = r[CRS.detail] ? JSON.parse(r[CRS.detail]) : []; } catch (e) { detail = []; }
  return {
    id: String(r[CRS.id] || ''), dealer: String(r[CRS.dealer] || ''), date: _fmtDate_(r[CRS.date]), status: String(r[CRS.status] || ''),
    lines: detail, wishDate: _fmtDate_(r[CRS.wishDate]), note: String(r[CRS.note] || ''), applicant: String(r[CRS.applicant] || ''),
    createdAt: _fmtDateTime_(r[CRS.createdAt]), reviewer: String(r[CRS.reviewer] || ''), reviewedAt: _fmtDateTime_(r[CRS.reviewedAt]),
    reviewNote: String(r[CRS.reviewNote] || ''), orderNo: String(r[CRS.orderNo] || ''), emailed: _consignBool_(r[CRS.emailed]), emailErr: String(r[CRS.emailErr] || ''), shipDate: _fmtDate_(r[CRS.shipDate]),
    totalQty: detail.reduce(function (a, l) { return a + (Number(l.qty) || 0); }, 0)
  };
}
// 經銷商可叫貨的目錄＝牌價表（含該經銷商折扣後單價）；v3.37 只列該家授權的酒款規格（未限定＝全款），MOQ 依該家設定
function _consignCatalog_(cfg) {
  var pm = _consignPriceMap_();
  return Object.keys(pm).filter(function (k) { return _consignAllowed_(cfg, pm[k].product, pm[k].volume); }).map(function (k) {
    var e = pm[k];
    return { product: e.product, pubName: e.pubName, volume: e.volume, listPrice: e.price, unitPrice: _consignUnitPrice_(e, cfg.discount), foq: _consignFoqOf_(e.volume, cfg), bottleType: _consignBottleFor_(e.volume) };
  }).sort(function (a, b) { return a.product.localeCompare(b.product) || (parseInt(a.volume, 10) - parseInt(b.volume, 10)); });
}
// ── 送出叫貨（經銷商本人／admin 代填）：lines=[{product, volume, qty}]；每款須 ≥ FOQ；寫單＋寄信 ──
function consignRestockCreate(p) {
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  var cfg = _consignDealerMap_()[dealer];
  if (!cfg) return { ok: false, error: '找不到經銷商設定：' + dealer };
  if (!cfg.enabled) return { ok: false, error: '此經銷商已停用' };
  var lines;
  try { lines = typeof p.lines === 'string' ? JSON.parse(p.lines) : (p.lines || []); }
  catch (e) { return { ok: false, error: '明細 JSON 解析失敗' }; }
  if (!lines || !lines.length) return { ok: false, error: '請至少選一款' };
  var wish = String((p && p.wishDate) || '').trim();
  if (wish && !/^\d{4}-\d{2}-\d{2}$/.test(wish)) return { ok: false, error: '希望到貨日格式須為 YYYY-MM-DD' };
  var pm = _consignPriceMap_();
  var use = [], bad = [];
  lines.forEach(function (ln) {
    var q = Math.floor(Number(ln.qty)) || 0; if (q <= 0) return;
    var prod = String(ln.product || '').trim(), vol = _consignVolOf_(ln.volume, ln.bottleType);
    var pe = _consignPriceOf_(pm, prod, vol);
    if (!pe) { bad.push('「' + prod + ' ' + vol + '」不在牌價表／目錄內'); return; }
    if (!_consignAllowed_(cfg, pe.product, vol)) { bad.push('「' + pe.pubName + ' ' + vol + '」不在貴店的經銷品項內，如需新增請聯絡南坡萬'); return; }   // v3.37
    var foq = _consignFoqOf_(vol, cfg);
    if (q < foq) { bad.push('「' + pe.pubName + ' ' + vol + '」' + q + ' 瓶，低於最低叫貨量 ' + foq + ' 瓶'); return; }
    use.push({ product: pe.product, pubName: pe.pubName, volume: vol, bottleType: _consignBottleFor_(vol), qty: q, unitPrice: _consignUnitPrice_(pe, cfg.discount) });
  });
  if (bad.length) return { ok: false, error: '叫貨內容有誤，未送出：' + bad.join('；'), problems: bad };
  if (!use.length) return { ok: false, error: '叫貨數量皆為 0，未送出' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _consignSheet_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS);
    var id = _consignGenId_('RQ'), now = _consignNow_(), today = _consignToday_();
    var op = String((p && p._user) || ''), note = String((p && p.note) || '');
    var totalQty = use.reduce(function (a, l) { return a + l.qty; }, 0);
    // email 通知（授權前會丟例外 → 不阻斷；狀態記進 N 欄與回傳）
    var emailed = false, emailErr = '';
    try {
      var subj = '【南坡萬】' + cfg.label + ' 叫貨申請 ' + totalQty + ' 瓶（' + today + '）';
      var body = cfg.label + '（' + dealer + '）於 ' + now + ' 送出叫貨申請，請至廠務 APP「經銷商寄售」分頁放行或駁回。\n\n'
        + use.map(function (l) { return '・' + l.pubName + ' ' + l.volume + ' × ' + l.qty + ' 瓶（單價 NT$' + l.unitPrice + '）'; }).join('\n')
        + '\n\n合計 ' + totalQty + ' 瓶' + (wish ? '　希望到貨日 ' + wish : '') + (note ? '\n備註：' + note : '')
        + '\n申請人：' + op + '\n叫貨單號：' + id
        + '\n\n廠務 APP：https://mollylin-coding.github.io/recipe/\n（此信由系統自動寄出）';
      MailApp.sendEmail({ to: CONSIGN_NOTIFY_EMAILS.join(','), subject: subj, body: body, name: '南坡萬廠務系統' });
      emailed = true;
    } catch (e) { emailErr = String((e && e.message) || e); }
    var row = [id, dealer, today, '待放行', JSON.stringify(use), wish, note, op, now, '', '', '', '', emailed ? 'TRUE' : 'FALSE', emailErr, ''];   // v3.30 O 欄=寄信例外文字（診斷）；v3.32 P 欄=出貨日
    _consignRestockEnsureHeaders_(ws);   // 舊分頁補表頭
    var r = ws.getLastRow() + 1;
    ws.getRange(r, CRS.date + 1).setNumberFormat('@'); ws.getRange(r, CRS.wishDate + 1).setNumberFormat('@');
    ws.getRange(r, 1, 1, CONSIGN_RESTOCK_HEADERS.length).setValues([row]);
    return { ok: true, id: id, dealer: dealer, lines: use, totalQty: totalQty, emailSent: emailed, emailError: emailErr };
  } finally { lock.releaseLock(); }
}
// ── 叫貨單清單：經銷商＝自己的（session 強制）；admin＝全部，status 可篩 ──
function consignRestockList(p) {
  var dealer = String((p && p.dealer) || '').trim();
  var status = String((p && p.status) || '').trim();
  var list = _consignRestockRows_().filter(function (r) {
    if (dealer && String(r[CRS.dealer]) !== dealer) return false;
    if (status && String(r[CRS.status]) !== status) return false;
    return true;
  }).map(_consignRestockObj_).reverse();
  return { ok: true, list: list };
}
function _consignRestockFind_(id) {
  var ws = _consignSheet_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS);
  var rows = _consignRowsOf_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][CRS.id]) === id) return { ws: ws, row: rows[i], idx: i };
  return null;
}
// ── 放行（admin）：自動建「自有酒款出貨訂單(有金流)」＝寄售純物流單（金額 0），叫貨單標已放行＋訂單編號 ──
function consignRestockApprove(p) {
  var id = String((p && p.id) || '').trim();
  if (!id) return { ok: false, error: '缺少叫貨單 ID' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var f = _consignRestockFind_(id);
    if (!f) return { ok: false, error: '找不到叫貨單：' + id };
    var rq = _consignRestockObj_(f.row);
    if (rq.status !== '待放行') return { ok: false, error: '此叫貨單狀態為「' + rq.status + '」，不可重複處理' };
    // 酒譜 sheet 名：對回南坡萬v.2 酒譜清單（Run Card／完成回報要用），對不到留空
    var sheetOf = {};
    try { (getClientRecipeList({ client: STOCK_OWNER_CLIENT }).list || []).forEach(function (r) { sheetOf[r.recipeName] = r.sheet; }); } catch (e) {}
    var items = rq.lines.map(function (l) {
      return { product: l.product, sheet: sheetOf[l.product] || '', volume: l.volume, bottleType: l.bottleType || _consignBottleFor_(l.volume), qty: Number(l.qty) || 0, status: '待製作' };
    });
    var op = String((p && p._user) || '');
    var deliveryDate = rq.wishDate || String((p && p.deliveryDate) || '') || _consignToday_();
    var res = createOrder({
      client: rq.dealer, orderType: TYPE_CONSIGN_SHIP, deliveryDate: deliveryDate, actualDeliveryDate: deliveryDate,
      items: items, total: 0, balance: 0, depositStatus: '寄售', pm: String((p && p.pm) || 'Molly'),
      orderCreator: '經銷商叫貨(' + (rq.applicant || rq.dealer) + ')',   // v3.30 主公指示：內部一眼看出這是經銷商主動叫貨（列表「建單:經銷商叫貨(TP01-A)」）
      orderNote: rq.note || '',   // v3.31 主公指示：店長的叫貨備註帶進訂單，PM 在列表一眼看到
      user: op, _user: op, _role: 'admin'
    });
    if (!res || !res.ok) return { ok: false, error: '建立出貨訂單失敗：' + ((res && res.error) || '') };
    var row = f.row.slice();
    row[CRS.status] = '已放行'; row[CRS.reviewer] = op; row[CRS.reviewedAt] = _consignNow_();
    row[CRS.reviewNote] = String((p && p.note) || ''); row[CRS.orderNo] = res.orderNo;
    f.ws.getRange(f.idx + 2, 1, 1, CONSIGN_RESTOCK_HEADERS.length).setValues([row]);
    _logOrderChange_(res.orderNo, op, '叫貨放行建單', rq.dealer + '／叫貨單 ' + id + '／' + rq.totalQty + ' 瓶');
    return { ok: true, id: id, orderNo: res.orderNo, dealer: rq.dealer, totalQty: rq.totalQty };
  } finally { lock.releaseLock(); }
}
// ── 駁回（admin）：原因必填 ──
function consignRestockReject(p) {
  var id = String((p && p.id) || '').trim();
  var note = String((p && p.note) || '').trim();
  if (!id) return { ok: false, error: '缺少叫貨單 ID' };
  if (!note) return { ok: false, error: '請填駁回原因（店長會看到）' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var f = _consignRestockFind_(id);
    if (!f) return { ok: false, error: '找不到叫貨單：' + id };
    if (String(f.row[CRS.status]) !== '待放行') return { ok: false, error: '此叫貨單已處理' };
    var row = f.row.slice();
    row[CRS.status] = '已駁回'; row[CRS.reviewer] = String((p && p._user) || ''); row[CRS.reviewedAt] = _consignNow_(); row[CRS.reviewNote] = note;
    f.ws.getRange(f.idx + 2, 1, 1, CONSIGN_RESTOCK_HEADERS.length).setValues([row]);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}
// ── v3.35 重置經銷商測試資料（admin、不可逆）──
//   範圍：①該經銷商、且「建單人員」以「經銷商叫貨」開頭的訂單：逐批 deleteShipment（成品庫存回沖＋門市在庫進貨取消）→ deleteOrder
//         ②該經銷商在「經銷商庫存異動」「經銷商叫貨單」「經銷商對帳單」的所有列
//   不碰：非叫貨來源的訂單（例如 260902-002 真單）、成品庫存流水帳（回沖是加列不刪列）
function _consignDeleteRowsWhere_(name, headers, colIdx, value) {
  var ws = _consignSheet_(name, headers);
  var rows = _consignRowsOf_(name, headers), n = 0;
  for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i][colIdx]) === value) { ws.deleteRow(i + 2); n++; }
  return n;
}
function consignResetDealer(p) {
  if (!p || p._role !== 'admin') return { ok: false, error: '僅管理員可重置' };
  var dealer = String((p && p.dealer) || '').trim();
  if (!dealer) return { ok: false, error: '缺少經銷商' };
  if (String((p && p.confirm) || '') !== dealer) return { ok: false, error: '確認字串不符，未執行' };
  var op = String((p && p._user) || '');
  var out = { ok: true, dealer: dealer, orders: [], shipmentsDeleted: 0, stockRestored: [], ledgerRows: 0, restockRows: 0, stmtRows: 0, errors: [] };
  // ① 叫貨來源訂單：先刪出貨批次（庫存回沖），再刪訂單
  var ows = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
  var data = ows ? ows.getDataRange().getValues() : [];
  var targets = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === dealer && /^經銷商叫貨/.test(String(data[i][31] || ''))) targets.push(String(data[i][0]));
  }
  targets.forEach(function (no) {
    var seqs = {};
    _shipRows_().forEach(function (r) { if (String(r[SHP.orderNo]) === no) seqs[Number(r[SHP.seq]) || 0] = true; });
    Object.keys(seqs).sort(function (a, b) { return b - a; }).forEach(function (sq) {
      try {
        var r = deleteShipment({ orderNo: no, seq: sq, operator: op, _user: op, _role: 'admin' });
        if (r && r.ok) { out.shipmentsDeleted++; (r.stockRestored || []).forEach(function (x) { out.stockRestored.push(x); }); }
        else out.errors.push(no + ' 第' + sq + '次：' + ((r && r.error) || ''));
      } catch (e) { out.errors.push(no + ' 第' + sq + '次：' + String((e && e.message) || e)); }
    });
    try {
      var d = deleteOrder({ orderNo: no, user: op, _user: op, _role: 'admin' });
      if (d && d.ok) out.orders.push(no); else out.errors.push(no + '：' + ((d && d.error) || ''));
    } catch (e) { out.errors.push(no + '：' + String((e && e.message) || e)); }
  });
  // ② 清三張表該經銷商的列
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    out.ledgerRows = _consignDeleteRowsWhere_(CONSIGN_LEDGER_SHEET, CONSIGN_LEDGER_HEADERS, CLG.dealer, dealer);
    out.restockRows = _consignDeleteRowsWhere_(CONSIGN_RESTOCK_SHEET, CONSIGN_RESTOCK_HEADERS, CRS.dealer, dealer);
    out.stmtRows = _consignDeleteRowsWhere_(CONSIGN_STMT_SHEET, CONSIGN_STMT_HEADERS, CST.dealer, dealer);
  } finally { lock.releaseLock(); }
  return out;
}
// ── 授權用：joyhouse.rental 在 Apps Script 編輯器直接「執行」這個函式一次 → 跳出 Google 授權畫面 → 允許 → 收到測試信即完成 ──
function __authMail() {
  MailApp.sendEmail({ to: CONSIGN_NOTIFY_EMAILS.join(','), subject: '【南坡萬廠務系統】叫貨 email 通知授權成功', body: '此信由 __authMail 寄出，代表 MailApp 授權已生效（' + _consignNow_() + '）。', name: '南坡萬廠務系統' });
  return 'sent';
}
// API 版測試信（admin）：授權後由前端／curl 驗證寄信通不通
function consignMailTest(p) {
  try { __authMail(); return { ok: true, sent: true, to: CONSIGN_NOTIFY_EMAILS }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e), hint: '請由 joyhouse.rental 在 Apps Script 編輯器執行 __authMail 完成授權' }; }
}
// ============================================================
// 📈 業績模型（perf 模組，v3.39・2026-09-05・主公派工／Cowork spec「Code交接_業績模型分頁_spec_20260905」）
// ##  一句話：Cowork 的「Q4 獲客缺口試算頁」搬進廠務APP；參數＋逐月目標存主表、Kevin／Molly 共用同一組；
// ##          每月「目標營收／推估營收／實際營收」並排，實際營收＝金流總覽「當月訂單營收（損益）」同一算法（_orderRevenueRow_）。
// ##  資料：主表分頁「業績模型參數」（key／value 一參數一列）＋「業績模型月表」（一月一列，A 月份鎖 @ 文字格式）。
// ##  action（皆 admin-only，ROLE_MATRIX）：perfGet（首次自動種子，冪等）／perfSave（走 doPost，整包覆寫）／perfReset（需 confirm=業績模型）。
// ##  演算法在前端（life／alive／calc 自參考 html 原樣移植）；後端只管存取與實際營收。
// ============================================================
var PERF_PARAM_SHEET = '業績模型參數';
var PERF_PARAM_HEADERS = ['參數鍵', '值', '說明', '更新人', '更新時間'];
var PERF_MONTH_SHEET = '業績模型月表';
var PERF_MONTH_HEADERS = ['月份', '目標營收', '活躍經銷家數', '大單張數', '備註'];
// 模型期間（v1.2：2026-09 → 2027-12 共 16 個月）。日後延長：改 PERF_MODEL_END（前端 PERF 期間吃後端回傳的 months，不必再改前端）；_perfEnsure_ 會自動補列。
var PERF_MODEL_START = '2026-09', PERF_MODEL_END = '2027-12';
// 參數種子＝參考 html DEF 物件（rifuOn 存 1／0）
var PERF_PARAM_DEF = [
  ['base', 180000, '既有代工客戶每月回購底盤（元）'],
  ['baseGrow', 0, '底盤年成長率（%）；0＝持平'],
  ['tGrow', 0, '月營業額目標成長率（%／月，自第 2 個月起以首月目標複利自動填目標）；0＝維持手填目標'],
  ['perSku', 100000, '新代工客戶每款首單金額（元）'],
  ['skus', 1, '新代工客戶平均款數'],
  ['gapM', 3, '首單→續單間隔（月）'],
  ['repPct', 50, '續單金額佔首單（%）'],
  ['surv', 70, '每輪續單存活率（%）'],
  ['rifuOn', 1, '日富一日是否簽下（1＝簽下、0＝沒簽）'],
  ['rifuSku', 125000, '日富一日每款首單金額（元）'],
  ['rifuN', 2, '日富一日款數'],
  ['rifuGap', 3, '日富一日續單間隔（月）'],
  ['bottles', 40, '經銷商 100ml 每家月售瓶數'],
  ['price', 150, '經銷商 100ml 認列單價（元）'],
  ['bottles5', 5, '經銷商 500ml 每家月售瓶數'],
  ['price5', 640, '經銷商 500ml 認列單價（元）'],
  ['upRate', 20, '經銷商升級換前標比率（%）'],
  ['upVal', 72000, '升級單金額（元）'],
  ['bigVal', 250000, '軌道 B 每張大單金額（元）']
];
function _perfMonths_() {
  var out = [], y = Number(PERF_MODEL_START.slice(0, 4)), m = Number(PERF_MODEL_START.slice(5, 7));
  for (var i = 0; i < 240; i++) {
    var ym = y + '-' + ('0' + m).slice(-2);
    out.push(ym);
    if (ym === PERF_MODEL_END) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
// 月表種子（＝參考 html DEF）：目標 30／45／67.5／100 萬，之後各月 100 萬；活躍經銷 2／6／10／10，之後皆 10；大單 0
function _perfMonthSeed_(ym) {
  var i = _perfMonths_().indexOf(ym);
  var target = [300000, 450000, 675000, 1000000], dealers = [2, 6, 10, 10];
  return { target: (i >= 0 && i < 4) ? target[i] : 1000000, dealers: (i >= 0 && i < 4) ? dealers[i] : 10, big: 0 };
}
function _perfNum_(v, def) { if (v === '' || v == null) return def; var n = Number(v); return isFinite(n) ? n : def; }
// 兩分頁不存在即建＋種子；缺的參數鍵／月份補列（冪等，沿用 consignSeed 模式）
function _perfEnsure_(op) {
  var now = _consignNow_(), added = { params: 0, months: 0 };
  var pws = _consignSheet_(PERF_PARAM_SHEET, PERF_PARAM_HEADERS);
  var have = {};
  if (pws.getLastRow() >= 2) pws.getRange(2, 1, pws.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0] !== '') have[String(r[0])] = true; });
  var rows = [];
  PERF_PARAM_DEF.forEach(function (d) { if (!have[d[0]]) rows.push([d[0], d[1], d[2], op || 'seed', now]); });
  if (rows.length) { pws.getRange(pws.getLastRow() + 1, 1, rows.length, PERF_PARAM_HEADERS.length).setValues(rows); added.params = rows.length; }
  var mws = _consignSheet_(PERF_MONTH_SHEET, PERF_MONTH_HEADERS);
  mws.getRange(1, 1, mws.getMaxRows(), 1).setNumberFormat('@');   // ⚠️ A 月份整欄鎖文字：Sheets 會把 2026-09 轉 Date（對帳單期別同一顆地雷）
  var haveM = {};
  if (mws.getLastRow() >= 2) mws.getRange(2, 1, mws.getLastRow() - 1, 1).getValues().forEach(function (r) { var k = _consignPeriodStr_(r[0]); if (k) haveM[k] = true; });
  var mrows = [];
  _perfMonths_().forEach(function (ym) { if (haveM[ym]) return; var s = _perfMonthSeed_(ym); mrows.push([ym, s.target, s.dealers, s.big, '']); });
  if (mrows.length) { var r0 = mws.getLastRow() + 1; mws.getRange(r0, 1, mrows.length, PERF_MONTH_HEADERS.length).setValues(mrows); added.months = mrows.length; }
  return added;
}
function _perfReadParams_() {
  var out = {}, meta = { updatedBy: '', updatedAt: '' };
  var defMap = {}; PERF_PARAM_DEF.forEach(function (d) { defMap[d[0]] = d[1]; });
  _consignRowsRO_(PERF_PARAM_SHEET, PERF_PARAM_HEADERS).forEach(function (r) {
    var k = String(r[0] || ''); if (!k || !(k in defMap)) return;
    out[k] = _perfNum_(r[1], defMap[k]);
    var at = _fmtDateTime_(r[4]); if (at && at > meta.updatedAt) { meta.updatedAt = at; meta.updatedBy = String(r[3] || ''); }
  });
  PERF_PARAM_DEF.forEach(function (d) { if (out[d[0]] == null) out[d[0]] = d[1]; });
  out.rifuOn = (Number(out.rifuOn) === 1) ? '1' : '0';   // 前端算法用字串 "1"/"0"（同參考 html）
  return { params: out, meta: meta };
}
// 實際營收：全部訂單一次掃，依出貨月彙總（口徑＝getFinanceSummary 的 orderRevenue，共用 _orderRevenueRow_）
//   zeroCount＝資料洞提示：出貨日在該月、類型有金流（非「無金流」）、總金額 0；寄售純物流單（訂金狀態＝寄售）金額 0 屬正常，不計。
function _perfActualMap_() {
  var map = {};
  var ws = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName('訂單主表');
  if (!ws) return map;
  var data = ws.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r = data[i]; if (!r[0]) continue;
    var rev = _orderRevenueRow_(r); if (!rev.shipMonth) continue;
    var m = map[rev.shipMonth] || (map[rev.shipMonth] = { actual: 0, orderCount: 0, zeroCount: 0 });
    m.actual += rev.eff; m.orderCount++;
    if (rev.total === 0 && !/無金流/.test(String(r[2] || '')) && String(r[7] || '') !== '寄售') m.zeroCount++;
  }
  return map;
}
// admin：整頁資料（首次呼叫自動種子）。actual：已過月份＝金額、當月＝目前累計、未來月＝null
function perfGet(p) {
  _perfEnsure_(String((p && p._user) || ''));
  var pr = _perfReadParams_();
  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  var act = _perfActualMap_();
  var byYm = {};
  _consignRowsRO_(PERF_MONTH_SHEET, PERF_MONTH_HEADERS).forEach(function (r) { var ym = _consignPeriodStr_(r[0]); if (ym) byYm[ym] = r; });
  var months = _perfMonths_().map(function (ym) {
    var r = byYm[ym], s = _perfMonthSeed_(ym), a = act[ym], past = ym <= now;
    return {
      ym: ym,
      target: r ? _perfNum_(r[1], s.target) : s.target, dealers: r ? _perfNum_(r[2], s.dealers) : s.dealers, big: r ? _perfNum_(r[3], s.big) : s.big,
      note: r ? String(r[4] == null ? '' : r[4]) : '',
      actual: past ? Math.round((a && a.actual) || 0) : null,
      orderCount: past ? ((a && a.orderCount) || 0) : 0, zeroCount: past ? ((a && a.zeroCount) || 0) : 0
    };
  });
  // 模型期間之前最近 3 個月的實績（對照用：2026-07／08 等，與金流總覽切月數字相同）
  var prior = Object.keys(act).filter(function (ym) { return /^\d{4}-\d{2}$/.test(ym) && ym < PERF_MODEL_START; }).sort().slice(-3)
    .map(function (ym) { return { ym: ym, actual: Math.round(act[ym].actual), orderCount: act[ym].orderCount, zeroCount: act[ym].zeroCount }; });
  return { ok: true, params: pr.params, months: months, now: now, prior: prior, updatedBy: pr.meta.updatedBy, updatedAt: pr.meta.updatedAt, modelStart: PERF_MODEL_START, modelEnd: PERF_MODEL_END };
}
// admin：整包覆寫（走 doPost；GET 亦相容——params／months 若為 JSON 字串自動解析）。參數只覆寫 B 值＋更新人／時間，C 說明保留；月表依 A 月份對應覆寫 B～E。
function perfSave(p) {
  var params = p && p.params, months = p && p.months;
  if (typeof params === 'string') { try { params = JSON.parse(params); } catch (e) { params = null; } }
  if (typeof months === 'string') { try { months = JSON.parse(months); } catch (e) { months = null; } }
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { ok: false, error: '缺少 params' };
  if (!Array.isArray(months) || !months.length) return { ok: false, error: '缺少 months' };
  var op = String((p && p._user) || ''), now = _consignNow_(), changed = 0;
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    _perfEnsure_(op);
    var defMap = {}; PERF_PARAM_DEF.forEach(function (d) { defMap[d[0]] = d[1]; });
    var pws = _consignSheet_(PERF_PARAM_SHEET, PERF_PARAM_HEADERS);
    var n = pws.getLastRow() - 1;
    if (n > 0) {
      var grid = pws.getRange(2, 1, n, PERF_PARAM_HEADERS.length).getValues();
      for (var i = 0; i < grid.length; i++) {
        var k = String(grid[i][0] || ''); if (!(k in defMap) || !(k in params)) continue;
        var v = (k === 'rifuOn') ? ((String(params[k]) === '1' || params[k] === 1 || params[k] === true) ? 1 : 0) : _perfNum_(params[k], defMap[k]);
        if (grid[i][1] === '' || Number(grid[i][1]) !== v) changed++;
        grid[i][1] = v; grid[i][3] = op; grid[i][4] = now;
      }
      pws.getRange(2, 2, n, PERF_PARAM_HEADERS.length - 1).setValues(grid.map(function (r) { return r.slice(1); }));   // 只寫 B～E，A 鍵不動
    }
    var mws = _consignSheet_(PERF_MONTH_SHEET, PERF_MONTH_HEADERS);
    var mn = mws.getLastRow() - 1;
    if (mn > 0) {
      var mg = mws.getRange(2, 1, mn, PERF_MONTH_HEADERS.length).getValues();
      var byYm = {}; months.forEach(function (m) { if (m && m.ym) byYm[String(m.ym)] = m; });
      for (var j = 0; j < mg.length; j++) {
        var ym = _consignPeriodStr_(mg[j][0]), m = byYm[ym]; if (!m) continue;
        var s = _perfMonthSeed_(ym);
        mg[j][1] = _perfNum_(m.target, s.target); mg[j][2] = _perfNum_(m.dealers, s.dealers); mg[j][3] = _perfNum_(m.big, s.big);
        mg[j][4] = String(m.note == null ? '' : m.note).slice(0, 200);
      }
      mws.getRange(2, 2, mn, PERF_MONTH_HEADERS.length - 1).setValues(mg.map(function (r) { return r.slice(1); }));   // 只寫 B～E，A 月份不動（保住 @ 文字）
    }
  } finally { lock.releaseLock(); }
  var out = perfGet(p); out.saved = true; out.paramsChanged = changed; return out;
}
// admin：恢復種子預設（參數＋月表全部覆寫，備註清空）。需 confirm=業績模型
function perfReset(p) {
  if (String((p && p.confirm) || '') !== '業績模型') return { ok: false, error: '請輸入確認字串「業績模型」' };
  var params = {}; PERF_PARAM_DEF.forEach(function (d) { params[d[0]] = d[1]; });
  var months = _perfMonths_().map(function (ym) { var s = _perfMonthSeed_(ym); return { ym: ym, target: s.target, dealers: s.dealers, big: s.big, note: '' }; });
  var out = perfSave({ params: params, months: months, _user: p && p._user, _role: p && p._role });
  out.reset = true; return out;
}

// ============================================================
// 💸 廠務支出（exp 模組，v3.40・2026-09-05・主公拍板／spec「Code交接_廠務支出分頁_spec_20260905」）
// ##  一句話：Molly 的 Google 支出表自 2026-09 起改在 APP 登記——一筆支出一列（固定 19 欄）＋「固定成本表」（一月一列、未填月份自動沿用最近一月）；
// ##          頁首四格＝本月變動支出／固定成本／實收現金（_financeMonth_ 同金流總覽口徑）／淨現金流。
// ##  資料：主表分頁「廠務支出」「固定成本表」（表頭自動建；B 日期／C 月份／M 代墊結清日、固定成本 A 月份 皆鎖 @ 文字格式＝對帳單期別同一顆地雷）。
// ##  action（皆 admin-only，ROLE_MATRIX）：expList／expSave／expDelete／expImport（POST；帶 CRM_CASH_KEY 可免 token＝本機匯入腳本用）／fixedGet／fixedSave。
// ##  「零用金補款」是類別之一：不計入支出合計，只算零用金進帳（Kevin 轉帳補 Molly 零用金）。
// ============================================================
var EXP_SHEET = '廠務支出';
var EXP_HEADERS = ['支出ID', '日期', '月份', '類別', '廠商', '採購目的', '採購人員', '明細', '金額', '付款出處', '發票已歸位', '員工代墊', '代墊結清日', '備註', '來源鍵', '建立人', '建立時間', '更新人', '更新時間'];
var EXC = { id: 0, date: 1, month: 2, category: 3, vendor: 4, purpose: 5, buyer: 6, item: 7, amount: 8, source: 9, invoice: 10, advance: 11, advanceSettled: 12, note: 13, srcKey: 14, createdBy: 15, createdAt: 16, updatedBy: 17, updatedAt: 18 };
var EXP_CAT_TOPUP = '零用金補款';
var EXP_CATEGORIES = ['食材', '酒材', '資材', '設備', '廠務', '雜支', EXP_CAT_TOPUP];
var EXP_SOURCES = ['Molly零用金', '月結', 'Kevin轉帳', 'Kevin現金', 'Kevin信用卡', '其他'];
var EXP_SRC_PETTY = 'Molly零用金';
var EXP_VENDOR_SEED = ['開元', '一海香', '純露', '全祥', '鉦旺', '仰南', '驪展', '酒田', '創兆', '享樂', '彩昇', '人事', '稅務', '電費', '電信', '物流', '其他'];
var EXP_PURPOSE_SEED = ['生產', '研發', '廠內備品', '行銷', '代購'];

var FIXED_SHEET = '固定成本表';
var FIXED_HEADERS = ['月份', '廠租', '薪資_Molly', '薪資_Vic', '薪資_阿軒', '薪資_PT小李', '貸款本息', '保險', '其他固定', '備註', '更新人', '更新時間'];
var FIXED_NUM_KEYS = ['rent', 'salMolly', 'salVic', 'salXuan', 'salPtLi', 'loan', 'insurance', 'other'];   // 對應 B～I

function _expSheet_() {
  var ws = _consignSheet_(EXP_SHEET, EXP_HEADERS);
  if (ws.getMaxColumns() < EXP_HEADERS.length) ws.insertColumnsAfter(ws.getMaxColumns(), EXP_HEADERS.length - ws.getMaxColumns());
  // ⚠️ 日期／月份／代墊結清日整欄鎖文字：Sheets 會把 2026-09 轉 Date（對帳單期別同一顆地雷）
  [EXC.date + 1, EXC.month + 1, EXC.advanceSettled + 1].forEach(function (c) { ws.getRange(1, c, ws.getMaxRows(), 1).setNumberFormat('@'); });
  return ws;
}
function _fixedSheet_() {
  var ws = _consignSheet_(FIXED_SHEET, FIXED_HEADERS);
  ws.getRange(1, 1, ws.getMaxRows(), 1).setNumberFormat('@');
  return ws;
}
function _expMonthOf_(dateStr) { return String(dateStr || '').slice(0, 7); }
function _expDateStr_(v) { var s = _fmtDate_(v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function _expNum_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function _expRowObj_(r) {
  return {
    id: String(r[EXC.id] || ''), date: _expDateStr_(r[EXC.date]), month: _consignPeriodStr_(r[EXC.month]) || _expMonthOf_(_expDateStr_(r[EXC.date])),
    category: String(r[EXC.category] || '').trim(), vendor: String(r[EXC.vendor] || '').trim(), purpose: String(r[EXC.purpose] || '').trim(), buyer: String(r[EXC.buyer] || '').trim(),
    item: String(r[EXC.item] || ''), amount: _expNum_(r[EXC.amount]), source: String(r[EXC.source] || '').trim(),
    invoice: _consignBool_(r[EXC.invoice]), advance: _consignBool_(r[EXC.advance]), advanceSettled: _expDateStr_(r[EXC.advanceSettled]),
    note: String(r[EXC.note] || ''), srcKey: String(r[EXC.srcKey] || ''),
    createdBy: String(r[EXC.createdBy] || ''), createdAt: _fmtDateTime_(r[EXC.createdAt]), updatedBy: String(r[EXC.updatedBy] || ''), updatedAt: _fmtDateTime_(r[EXC.updatedAt])
  };
}
// 驗證＋正規化一筆輸入（expSave／expImport 共用）；回 {ok, row(物件)} 或 {ok:false,error}
function _expNormalize_(p) {
  var date = _expDateStr_(p.date);
  if (!date) return { ok: false, error: '日期格式須為 yyyy-MM-dd' };
  var cat = String(p.category || '').trim().replace(/厰務/g, '廠務');
  if (EXP_CATEGORIES.indexOf(cat) < 0) return { ok: false, error: '類別須為：' + EXP_CATEGORIES.join('／') };
  var item = String(p.item || '').trim();
  if (!item) return { ok: false, error: '明細不可空白' };
  var amount = Number(p.amount);
  if (!isFinite(amount) || amount <= 0) return { ok: false, error: '金額須為大於 0 的數字' };
  var source = String(p.source || '').trim();
  if (!source) return { ok: false, error: '付款出處不可空白' };
  var settled = _expDateStr_(p.advanceSettled);
  return { ok: true, row: {
    date: date, month: _expMonthOf_(date), category: cat, vendor: String(p.vendor || '').trim().slice(0, 60), purpose: String(p.purpose || '').trim().slice(0, 60),
    buyer: String(p.buyer || '').trim().slice(0, 30), item: item.slice(0, 200), amount: Math.round(amount * 100) / 100, source: source.slice(0, 30),
    invoice: _consignBool_(p.invoice), advance: _consignBool_(p.advance), advanceSettled: settled, note: String(p.note || '').trim().slice(0, 300), srcKey: String(p.srcKey || '').trim().slice(0, 80)
  } };
}
function _expRowArr_(id, o, createdBy, createdAt, updatedBy, updatedAt) {
  return [id, o.date, o.month, o.category, o.vendor, o.purpose, o.buyer, o.item, o.amount, o.source, o.invoice ? 'TRUE' : 'FALSE', o.advance ? 'TRUE' : 'FALSE', o.advanceSettled, o.note, o.srcKey, createdBy, createdAt, updatedBy, updatedAt];
}
function _expAllRows_() { return _consignRowsRO_(EXP_SHEET, EXP_HEADERS).map(function (r, i) { var o = _expRowObj_(r); o.rowIdx = i; return o; }).filter(function (o) { return o.id; }); }
// v3.41 零用金結餘（衍生值，不落地）：依 日期→列序 逐筆累計——類別「零用金補款」＋、付款出處「Molly零用金」−、其他付款出處不動。
//   回 { byId:{id:結餘}, start(月初), end(月底), current(最新) }；start＝該月第一筆之前的結餘。期初用一筆「零用金補款」列表示（明細註明期初）。
function _expPettyCalc_(all, month) {
  var seq = all.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.rowIdx - b.rowIdx; });
  var bal = 0, byId = {}, start = null, end = null;
  seq.forEach(function (o) {
    if (start === null && o.month >= month) start = bal;
    var d = o.category === EXP_CAT_TOPUP ? o.amount : (o.source === EXP_SRC_PETTY ? -o.amount : 0);
    if (d) { bal = Math.round((bal + d) * 100) / 100; byId[o.id] = bal; }
    if (o.month <= month) end = bal;
  });
  if (start === null) start = bal;
  if (end === null) end = start;
  return { byId: byId, start: start, end: end, current: bal };
}

// ── 固定成本：讀某月（無該月列→沿用「月份 < 該月」最近一列）──
function _fixedRead_(month) {
  var rows = _consignRowsRO_(FIXED_SHEET, FIXED_HEADERS).map(function (r) { return { ym: _consignPeriodStr_(r[0]), r: r }; }).filter(function (x) { return /^\d{4}-\d{2}$/.test(x.ym); });
  var exact = null, prior = null;
  rows.forEach(function (x) { if (x.ym === month) exact = x; else if (x.ym < month && (!prior || x.ym > prior.ym)) prior = x; });
  var src = exact || prior;
  var out = { month: month, inherited: !exact && !!prior, from: src ? src.ym : '', empty: !src, note: '', updatedBy: '', updatedAt: '', total: 0 };
  FIXED_NUM_KEYS.forEach(function (k, i) { out[k] = src ? _expNum_(src.r[i + 1]) : 0; out.total += out[k]; });
  if (src) { out.note = String(src.r[9] || ''); out.updatedBy = String(src.r[10] || ''); out.updatedAt = _fmtDateTime_(src.r[11]); }
  out.total = Math.round(out.total * 100) / 100;
  return out;
}
// 月份金流摘要（與 getFinanceSummary 同一迴圈；perf／exp 共用）
function _expFinance_(month) {
  try { var f = _financeMonth_(month); return { orderRevenue: Math.round(f.orderRevenue), cashReceived: Math.round(f.cashReceived), orderCount: f.orderCount }; }
  catch (e) { return { orderRevenue: 0, cashReceived: 0, orderCount: 0, error: String((e && e.message) || e) }; }
}
// admin：該月支出列＋摘要＋固定成本＋金流四格（首次呼叫自動建分頁）
function expList(p) {
  var month = _consignPeriodStr_(p && p.month) || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月份格式須為 yyyy-MM' };
  _expSheet_(); _fixedSheet_();
  var all = _expAllRows_();
  var vendors = {}, purposes = {};
  all.forEach(function (o) { if (o.vendor) vendors[o.vendor] = 1; if (o.purpose) purposes[o.purpose] = 1; });
  EXP_VENDOR_SEED.forEach(function (v) { vendors[v] = 1; }); EXP_PURPOSE_SEED.forEach(function (v) { purposes[v] = 1; });
  var petty = _expPettyCalc_(all, month);
  all.forEach(function (o) { o.pettyAfter = (o.id in petty.byId) ? petty.byId[o.id] : null; });
  var rows = all.filter(function (o) { return o.month === month; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1); });
  var s = { total: 0, count: 0, byCat: {}, bySrc: {}, invoiceMissing: 0, advanceOpen: 0, pettyIn: 0, pettyOut: 0 };
  rows.forEach(function (o) {
    if (o.category === EXP_CAT_TOPUP) { s.pettyIn += o.amount; return; }
    s.total += o.amount; s.count++;
    s.byCat[o.category] = (s.byCat[o.category] || 0) + o.amount;
    s.bySrc[o.source] = (s.bySrc[o.source] || 0) + o.amount;
    if (!o.invoice) s.invoiceMissing++;
    if (o.advance && !o.advanceSettled) s.advanceOpen++;
    if (o.source === EXP_SRC_PETTY) s.pettyOut += o.amount;
  });
  ['total', 'pettyIn', 'pettyOut'].forEach(function (k) { s[k] = Math.round(s[k] * 100) / 100; });
  var fixed = _fixedRead_(month), fin = _expFinance_(month);
  return { ok: true, month: month, rows: rows, summary: s, fixed: fixed, finance: fin, petty: { start: petty.start, end: petty.end, current: petty.current },
    net: Math.round(fin.cashReceived - s.total - fixed.total), categories: EXP_CATEGORIES, sources: EXP_SOURCES,
    vendors: Object.keys(vendors).sort(), purposes: Object.keys(purposes).sort() };
}
// admin：新增（無 id）或覆寫（有 id）一筆
function expSave(p) {
  var v = _expNormalize_(p || {});
  if (!v.ok) return v;
  var op = String((p && p._user) || ''), now = _consignNow_(), id = String((p && p.id) || '').trim();
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _expSheet_();
    if (id) {
      var n = ws.getLastRow() - 1;
      var ids = n > 0 ? ws.getRange(2, 1, n, 1).getValues() : [];
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) {
          var old = ws.getRange(i + 2, 1, 1, EXP_HEADERS.length).getValues()[0];
          var oldObj = _expRowObj_(old);
          v.row.srcKey = oldObj.srcKey;   // 來源鍵不可由前端改
          ws.getRange(i + 2, 1, 1, EXP_HEADERS.length).setValues([_expRowArr_(id, v.row, oldObj.createdBy || op, oldObj.createdAt || now, op, now)]);
          return { ok: true, id: id, updated: true, row: _expRowObj_(ws.getRange(i + 2, 1, 1, EXP_HEADERS.length).getValues()[0]) };
        }
      }
      return { ok: false, error: '找不到支出：' + id };
    }
    id = _consignGenId_('E');
    ws.appendRow(_expRowArr_(id, v.row, op, now, op, now));
    return { ok: true, id: id, created: true, row: _expRowObj_(_expRowArr_(id, v.row, op, now, op, now)) };
  } finally { lock.releaseLock(); }
}
// admin：刪一列
function expDelete(p) {
  var id = String((p && p.id) || '').trim();
  if (!id) return { ok: false, error: '缺少 id' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _expSheet_(), n = ws.getLastRow() - 1;
    var ids = n > 0 ? ws.getRange(2, 1, n, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { ws.deleteRow(i + 2); return { ok: true, id: id, deleted: true }; }
    return { ok: false, error: '找不到支出：' + id };
  } finally { lock.releaseLock(); }
}
// admin（或帶 CRM_CASH_KEY 免 token）：批次匯入；來源鍵已存在者跳過（冪等）。rows 可為陣列或 JSON 字串。
function expImport(p) {
  var rows = p && p.rows;
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch (e) { rows = null; } }
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: '缺少 rows' };
  if (rows.length > 500) return { ok: false, error: '單次最多 500 筆' };
  var op = String((p && p._user) || '匯入腳本'), now = _consignNow_();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ws = _expSheet_();
    var have = {};
    _expAllRows_().forEach(function (o) { if (o.srcKey) have[o.srcKey] = true; });
    var out = [], added = 0, skipped = 0, errors = [];
    rows.forEach(function (r, i) {
      var v = _expNormalize_(r || {});
      if (!v.ok) { errors.push({ i: i, error: v.error }); return; }
      if (v.row.srcKey && have[v.row.srcKey]) { skipped++; return; }
      if (v.row.srcKey) have[v.row.srcKey] = true;
      out.push(_expRowArr_(_consignGenId_('E') + i, v.row, op, now, op, now)); added++;
    });
    if (out.length) ws.getRange(ws.getLastRow() + 1, 1, out.length, EXP_HEADERS.length).setValues(out);
    return { ok: true, added: added, skipped: skipped, errors: errors, total: ws.getLastRow() - 1 };
  } finally { lock.releaseLock(); }
}
// admin：該月固定成本（含沿用）
function fixedGet(p) {
  var month = _consignPeriodStr_(p && p.month) || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月份格式須為 yyyy-MM' };
  _fixedSheet_();
  var f = _fixedRead_(month); f.ok = true; return f;
}
// admin：寫該月固定成本列（不存在即建；A 月份不動）
function fixedSave(p) {
  var month = _consignPeriodStr_(p && p.month);
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月份格式須為 yyyy-MM' };
  var vals = FIXED_NUM_KEYS.map(function (k) { var n = Number(p[k]); if (!isFinite(n) || n < 0) n = 0; return Math.round(n * 100) / 100; });
  var note = String((p && p.note) || '').trim().slice(0, 300), op = String((p && p._user) || ''), now = _consignNow_();
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _fixedSheet_(), n = ws.getLastRow() - 1, rowIdx = -1;
    if (n > 0) { var ms = ws.getRange(2, 1, n, 1).getValues(); for (var i = 0; i < ms.length; i++) if (_consignPeriodStr_(ms[i][0]) === month) { rowIdx = i + 2; break; } }
    if (rowIdx < 0) { ws.appendRow([month].concat(vals, [note, op, now])); }
    else ws.getRange(rowIdx, 2, 1, FIXED_HEADERS.length - 1).setValues([vals.concat([note, op, now])]);
  } finally { lock.releaseLock(); }
  var f = _fixedRead_(month); f.ok = true; f.saved = true; return f;
}
