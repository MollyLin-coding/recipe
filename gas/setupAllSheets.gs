// ============================================================
// 南坡萬酒廠 — 一次性 Sheet 格式更新 script v5.9
// 執行方式：貼入 GAS 編輯器，用「執行」按鈕執行各函式
// ⚠️ 結果請到「執行記錄」(View > Logs) 查看，不會彈出視窗
// ============================================================

const FB_SHEET_ID              = '1WwCsC2SvLqWmGFPrwzM8pYLx3DpF3VM_3srfksWfza4';
const INVENTORY_SHEET_ID_SETUP = '1uadQOdbLBmbNFfPKaiqy_QFQ0Lcw79nmojmvis66kKE';
const INVENTORY_GID_SETUP      = '689797361';

const COLOR_HEADER_GREEN = '#d9ead3';
const COLOR_NOTE_BLUE    = '#cfe2f3';
const COLOR_NOTE_TEXT    = '#1155cc';

// ============================================================
// 【1】setupAllSheets()
// 幫 7 個失敗分頁補跑格式更新（其他已完成的會自動略過）
// 修復重點：插入列前先 breakApart() 取消附近合併格，避免衝突
// ============================================================
function setupAllSheets() {
  const ss = SpreadsheetApp.openById(FB_SHEET_ID);
  const sheets = ss.getSheets().filter(s => {
    const n = s.getName();
    return (n.startsWith('0FB_') || n.startsWith('FB_')) &&
           !n.includes('毛利分析') && !n.includes('原料庫');
  });

  const log = [];
  sheets.forEach(sheet => {
    try {
      const result = processSheet(sheet);
      log.push(`✅ ${sheet.getName()}: ${result}`);
    } catch(e) {
      log.push(`❌ ${sheet.getName()}: ${e.toString()}`);
    }
  });

  try {
    updateProfitSheet(ss);
    log.push('✅ 0毛利分析: 完成（或已存在）');
  } catch(e) {
    log.push(`❌ 0毛利分析: ${e.toString()}`);
  }

  Logger.log(log.join('\n'));
}

// ── 處理單一酒譜分頁 ──────────────────────────────────────
function processSheet(sheet) {
  const maxRow = Math.min(sheet.getLastRow(), 45);
  const colA = sheet.getRange(1, 1, maxRow, 1).getValues()
                    .map(r => r[0] ? r[0].toString().trim() : '');

  let totalRow = -1, hasBaseHeader = false, hasNoteRow = false;
  for (let i = 0; i < colA.length; i++) {
    if (colA[i] === '總體積')   totalRow = i + 1;
    if (colA[i] === '基礎原料') hasBaseHeader = true;
    if (colA[i] === '製程備註') hasNoteRow = true;
  }
  if (totalRow === -1) return '找不到「總體積」列，略過';

  const lastCol = Math.max(sheet.getLastColumn(), 9);
  const actions = [];

  // ── Step 1：插入「基礎原料」標題列 ──
  if (!hasBaseHeader) {
    // 關鍵修復：先取消插入點附近所有合併，避免跨列合併衝突
    sheet.getRange(totalRow, 1, 3, lastCol).breakApart();
    sheet.insertRowAfter(totalRow);
    const hr = totalRow + 1;
    sheet.getRange(hr, 1, 1, lastCol).breakApart(); // 新列可能繼承合併格式
    sheet.getRange(hr, 1, 1, lastCol).merge();
    sheet.getRange(hr, 1)
         .setValue('基礎原料')
         .setBackground(COLOR_HEADER_GREEN)
         .setFontWeight('bold')
         .setFontColor('#000000')
         .setHorizontalAlignment('center')
         .setVerticalAlignment('middle');
    actions.push('新增「基礎原料」標題列');

    // 重新掃描（插入後 row 號偏移）
    hasNoteRow = false;
    const nc = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues()
                    .map(r => r[0] ? r[0].toString().trim() : '');
    for (let i = 0; i < nc.length; i++) {
      if (nc[i] === '製程備註') hasNoteRow = true;
    }
  }

  // ── Step 2：插入「製程備註」列 ──
  if (!hasNoteRow) {
    const lastDataRow = findLastLvl1Row(sheet);
    sheet.getRange(lastDataRow, 1, 3, lastCol).breakApart();
    sheet.insertRowAfter(lastDataRow);
    const nr = lastDataRow + 1;
    sheet.getRange(nr, 1, 1, lastCol).breakApart();
    sheet.getRange(nr, 1, 1, 6).merge(); // A~F 合併
    sheet.getRange(nr, 1)
         .setValue('製程備註')
         .setBackground(COLOR_NOTE_BLUE)
         .setFontColor(COLOR_NOTE_TEXT)
         .setFontWeight('bold')
         .setHorizontalAlignment('center')
         .setVerticalAlignment('middle');
    actions.push('新增「製程備註」列');
  }

  // ── Step 3：數字格式 ──
  applyNumberFormat(sheet, 6, '0.0');   // F欄：進貨單價
  applyNumberFormat(sheet, 8, '0.00');  // H欄：每單位成本
  actions.push('更新數字格式');

  return actions.join('、');
}

function findLastLvl1Row(sheet) {
  const colA = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues()
                    .map(r => r[0] ? r[0].toString().trim() : '');
  let baseStart = -1, lastData = -1;
  for (let i = 0; i < colA.length; i++) {
    if (colA[i] === '基礎原料') baseStart = i + 1;
    if (baseStart !== -1 && i > baseStart && colA[i] !== '') lastData = i + 1;
  }
  return lastData !== -1 ? lastData : baseStart + 3;
}

function applyNumberFormat(sheet, colNum, fmt) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 4) return;
  sheet.getRange(4, colNum, lastRow - 3, 1).setNumberFormat(fmt);
}

// ── 更新毛利分析分頁 ──────────────────────────────────────
function updateProfitSheet(ss) {
  const ps = ss.getSheetByName('0毛利分析') || ss.getSheetByName('毛利分析');
  if (!ps) throw new Error('找不到毛利分析分頁');

  const headers = ps.getRange(1, 1, 1, Math.max(ps.getLastColumn(), 6)).getValues()[0];
  if (headers[3] && headers[3].toString().trim() !== '') return; // 已有欄位

  ps.getRange(1, 4).setValue('4L總成本(元)');
  ps.getRange(1, 5).setValue('毛利(元)');
  ps.getRange(1, 6).setValue('毛利率(%)');
  ps.getRange(1, 4, 1, 3)
    .setFontWeight('bold')
    .setBackground('#d9ead3')
    .setHorizontalAlignment('center');

  const lastRow = ps.getLastRow();
  if (lastRow < 2) return;
  for (let r = 2; r <= lastRow; r++) {
    if (!ps.getRange(r, 1).getValue()) continue;
    ps.getRange(r, 5).setFormula(`=IF(D${r}<>"",B${r}-D${r},"")`);
    ps.getRange(r, 6).setFormula(`=IF(AND(E${r}<>"",B${r}<>0),ROUND(E${r}/B${r}*100,1)&"%","")`);
  }
  ps.getRange(2, 4, lastRow - 1, 1).setNumberFormat('0');
  ps.getRange(2, 5, lastRow - 1, 1).setNumberFormat('0');
}


// ============================================================
// 【2】auditPrices()
// 掃描所有酒譜分頁 F/G 欄，與進料價格表比對，列出差異
// 只讀取，不修改任何資料
// ============================================================
function auditPrices() {
  const priceTable = loadPriceTable();
  const ss = SpreadsheetApp.openById(FB_SHEET_ID);
  const sheets = ss.getSheets().filter(s => {
    const n = s.getName();
    return (n.startsWith('0FB_') || n.startsWith('FB_')) &&
           !n.includes('毛利分析') && !n.includes('原料庫');
  });

  const diffs = [];
  sheets.forEach(sheet => {
    const lr = sheet.getLastRow();
    if (lr < 4) return;
    const data = sheet.getRange(4, 1, lr - 3, 7).getValues();
    data.forEach((row, idx) => {
      const name = row[0] ? row[0].toString().trim() : '';
      if (!name || ['總體積','基礎原料','製程備註','體積占比'].includes(name)) return;
      if (!priceTable[name]) return;

      const ref = priceTable[name];
      const sheetPrice = parseFloat(row[5]) || 0;
      const sheetVol   = parseFloat(row[6]) || 0;
      const priceDiff  = Math.abs(sheetPrice - ref.unitPrice) > 0.01;
      const volDiff    = ref.unitVolume > 0 && Math.abs(sheetVol - ref.unitVolume) > 0.01;

      if (priceDiff || volDiff) {
        diffs.push({ sheet: sheet.getName(), row: idx + 4, name,
                     sheetPrice, sheetVol, refPrice: ref.unitPrice, refVol: ref.unitVolume,
                     priceDiff, volDiff });
      }
    });
  });

  if (diffs.length === 0) {
    Logger.log('✅ 所有品項與進料表一致，無差異');
    return;
  }
  Logger.log(`⚠️ 發現 ${diffs.length} 筆差異（以進料表為準）：\n`);
  Logger.log('分頁\t列\t品名\tSheet單價\t進料表單價\tSheet容量\t進料表容量');
  diffs.forEach(d => {
    Logger.log([d.sheet, d.row, d.name,
                d.sheetPrice, d.refPrice,
                d.sheetVol,   d.refVol].join('\t'));
  });
  Logger.log('\n確認無誤後執行 updatePrices() 套用更新');
}


// ============================================================
// 【3】updatePrices()
// 將 auditPrices() 找到的差異全部更新到酒譜分頁
// ⚠️ 請先執行 auditPrices() 確認差異清單後再執行
// ============================================================
function updatePrices() {
  const priceTable = loadPriceTable();
  const ss = SpreadsheetApp.openById(FB_SHEET_ID);
  const sheets = ss.getSheets().filter(s => {
    const n = s.getName();
    return (n.startsWith('0FB_') || n.startsWith('FB_')) &&
           !n.includes('毛利分析') && !n.includes('原料庫');
  });

  let count = 0;
  sheets.forEach(sheet => {
    const lr = sheet.getLastRow();
    if (lr < 4) return;
    const data = sheet.getRange(4, 1, lr - 3, 7).getValues();
    data.forEach((row, idx) => {
      const name = row[0] ? row[0].toString().trim() : '';
      if (!name || ['總體積','基礎原料','製程備註','體積占比'].includes(name)) return;
      if (!priceTable[name]) return;

      const ref = priceTable[name];
      const sheetPrice = parseFloat(row[5]) || 0;
      const sheetVol   = parseFloat(row[6]) || 0;
      const priceDiff  = Math.abs(sheetPrice - ref.unitPrice) > 0.01;
      const volDiff    = ref.unitVolume > 0 && Math.abs(sheetVol - ref.unitVolume) > 0.01;

      if (priceDiff || volDiff) {
        const r = idx + 4;
        if (priceDiff) sheet.getRange(r, 6).setValue(ref.unitPrice);
        if (volDiff)   sheet.getRange(r, 7).setValue(ref.unitVolume);
        Logger.log(`更新 ${sheet.getName()} Row${r} [${name}] 單價:${sheetPrice}→${ref.unitPrice}  容量:${sheetVol}→${ref.unitVolume}`);
        count++;
      }
    });
  });
  Logger.log(`\n✅ 完成，共更新 ${count} 筆`);
}


// ── 讀取進料價格表，建立品名 → {unitPrice, unitVolume} 對照 ──
function loadPriceTable() {
  const ss = SpreadsheetApp.openById(INVENTORY_SHEET_ID_SETUP);
  let sheet = null;
  for (const s of ss.getSheets()) {
    if (s.getSheetId().toString() === INVENTORY_GID_SETUP) { sheet = s; break; }
  }
  if (!sheet) sheet = ss.getSheets()[0];

  const lr = sheet.getLastRow();
  const data = sheet.getRange(1, 1, lr, 7).getValues();
  const map = {};

  for (const row of data) {
    // 進料表欄位：A=類型 B=品牌 C=品名 D=酒精濃度 E=進貨單價 F=單位容量 G=單位成本
    const name  = row[2] ? row[2].toString().trim() : '';
    const price = parseFloat(row[4]);
    const vol   = parseFloat(row[5]);
    if (!name || name === '品名/規格' || isNaN(price) || price === 0) continue;
    map[name] = { unitPrice: price, unitVolume: isNaN(vol) ? 0 : vol };
  }
  return map;
}

