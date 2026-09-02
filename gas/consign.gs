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
var CONSIGN_DEALER_ACTIONS = ['changePassword', 'consignMe', 'consignSale', 'consignAdjust', 'consignLedger', 'consignStatements'];
var TYPE_CONSIGN_SETTLE = '經銷商寄售月結認列單';

var CONSIGN_CFG_SHEET = '經銷商設定';
var CONSIGN_CFG_HEADERS = ['經銷商鍵', '顯示名', '折扣率', '結帳日', '聯絡人', '啟用', '備註', '更新人', '更新時間'];
var CCF = { key: 0, label: 1, discount: 2, closeDay: 3, contact: 4, enabled: 5, note: 6, updatedBy: 7, updatedAt: 8 };

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
  return ws.getRange(2, 1, ws.getLastRow() - 1, headers.length).getValues();
}
// 讀取路徑用（不建分頁；分頁不存在＝視為空）
function _consignRowsRO_(name, headers) {
  try {
    var ws = SpreadsheetApp.openById(MAIN_SHEET_ID).getSheetByName(name);
    if (!ws || ws.getLastRow() < 2) return [];
    return ws.getRange(2, 1, ws.getLastRow() - 1, headers.length).getValues();
  } catch (e) { return []; }
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
    map[key] = {
      key: key, label: String(r[CCF.label] || key), discount: Number(r[CCF.discount]) || 0,
      closeDay: Math.floor(Number(r[CCF.closeDay])) || 5, contact: String(r[CCF.contact] || ''),
      enabled: _consignBool_(r[CCF.enabled]), note: String(r[CCF.note] || '')
    };
  });
  return map;
}
function consignDealers(p) {
  var map = _consignDealerMap_();
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
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ws = _consignSheet_(CONSIGN_CFG_SHEET, CONSIGN_CFG_HEADERS);
    var rows = _consignRowsOf_(CONSIGN_CFG_SHEET, CONSIGN_CFG_HEADERS);
    var op = String((p && p._user) || '');
    var enabled = (p.enabled == null || p.enabled === '') ? 'TRUE' : (String(p.enabled).toLowerCase() === 'true' ? 'TRUE' : 'FALSE');
    var row = [key, String(p.label || key), discount, closeDay, String(p.contact || ''), enabled, String(p.note || ''), op, _consignNow_()];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][CCF.key]).trim() === key) {
        ws.getRange(i + 2, 1, 1, CONSIGN_CFG_HEADERS.length).setValues([row]);
        return { ok: true, updated: true, dealer: key };
      }
    }
    ws.appendRow(row);
    return { ok: true, created: true, dealer: key };
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
  }).sort(function (a, b) { return a.product.localeCompare(b.product) || (parseInt(a.volume, 10) - parseInt(b.volume, 10)); });
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
  return { ok: true, dealer: cfg, today: today, stock: stock, todaySold: todaySold,
    current: cur, previous: prev, previousStatement: prevStmt, statements: stmts, recent: recent, lockedPeriods: lockedPeriods };
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
  return { ok: true, period: period, today: today, dealers: dealers };
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
  return { ok: true, alerts: alerts };
}
