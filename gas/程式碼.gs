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
const MAIN_SHEET_ID = '1rXmA0ACRwy4jo3XEkXHZzNjJw8uZzX1jzVle-6k0V40';

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
function doGet(e) {
  const p = e.parameter || {};
  const action = p.action || '';
  let result;
  try {
    switch(action) {
      case 'login':          result = login(p); break;
      case 'changePassword': result = changePassword(p); break;
      case 'getRecipeList':  result = getRecipeList(); break;
      case 'getRecipe':      result = getRecipe(p); break;
      case 'saveProcessNote':result = saveProcessNote(p); break;
      case 'getInventory':   result = getInventory(); break;
      case 'addBatchRecord': result = addBatchRecord(p); break;
      case 'updateBatchRecord': result = updateBatchRecord(p); break;
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
function login(p) {
  const username = p.username, password = p.password;
  if (!username || !password) return { ok: false, error: '請提供帳號密碼' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let ws = ss.getSheetByName('使用者資料') || ss.getSheetByName('帳號');
  if (!ws) return { ok: false, error: '找不到帳號分頁' };
  const rows = ws.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [acc, pwd, role] = rows[i];
    if (String(acc) === username && String(pwd) === String(password)) {
      return { ok: true, role: role || 'user' };
    }
  }
  return { ok: false, error: '帳號或密碼錯誤' };
}

// ── 改密碼 ───────────────────────────────────────────────────
function changePassword(p) {
  const { username, oldPassword, newPassword } = p;
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
function getRecipeList() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('recipeList_v1');
  if (cached) return JSON.parse(cached);
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
  return result;
}

// ── 單一酒譜 ─────────────────────────────────────────────────
function getRecipe(p) {
  const { client, sheet } = p;
  if (!client || !sheet) return { ok: false, error: '缺少 client 或 sheet' };
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

  return {
    ok: true,
    recipeName,
    abv,
    totalVol,
    ingredientCost,
    tax,
    ingredients,
    processNote
  };
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


