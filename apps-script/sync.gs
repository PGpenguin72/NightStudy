// 夜自習考勤同步腳本
// 部署方式：Extensions → Apps Script → Deploy → New deployment → Web App
//   Execute as: Me
//   Who has access: Anyone
// 將產生的 URL 貼到 Cloudflare Worker 的 APPS_SCRIPT_URL 環境變數

var SPREADSHEET_ID = '15rlBMtj7DIGguoJcRmFY3piZBr7uU4mAU51BRQHSwUo';

// 接收 Cloudflare Worker POST 過來的出勤資料
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    // payload = { date: 'YYYY-MM-DD', records: [...] }

    var date = payload.date;
    var records = payload.records;

    if (!date || !records || !records.length) {
      return jsonResponse({ error: 'EMPTY_PAYLOAD' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    syncRecords(ss, date, records);

    return jsonResponse({ success: true, count: records.length, date: date });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// 手動觸發用（測試時用）
function doGet(e) {
  return jsonResponse({ status: 'ok', message: '夜自習考勤同步 Web App 運作中' });
}

function syncRecords(ss, date, records) {
  records.forEach(function(record) {
    upsertStudentSheet(ss, date, record);
  });
  updateSemesterStats(ss, records);
}

// ─── 個人考勤表 ─────────────────────────────────────────────
function upsertStudentSheet(ss, date, record) {
  var tabName = record.name + '考勤表';
  var sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    initStudentSheet(sheet, record);
  }

  // Append 當日紀錄（從第 5 行開始是日誌）
  sheet.appendRow([date, statusLabel(record.status), record.checkin_at || '—']);

  // 重算統計
  recalcStudentStats(sheet, record);
}

function initStudentSheet(sheet, record) {
  // Row 1: 欄位標題
  var headers = [['班級', '座號', '姓名', '卡號', '應到', '實到', '遲到', '請假', '曠課', '出勤比']];
  sheet.getRange(1, 1, 1, 10).setValues(headers).setFontWeight('bold');

  // Row 2: 學生資料（統計欄先填 0）
  sheet.getRange(2, 1, 1, 10).setValues([[
    record.class, record.class_no, record.name, record.card_id, 0, 0, 0, 0, 0, '0%'
  ]]);

  // Row 3: 空白隔行
  // Row 4: 日誌欄位標題
  sheet.getRange(4, 1, 1, 3).setValues([['日期', '狀態', '簽到時間']]).setFontWeight('bold');

  // 格式設定
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 80);
}

function recalcStudentStats(sheet, record) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 5) return; // 還沒有日誌

  var logData = sheet.getRange(5, 1, lastRow - 4, 2).getValues();
  var validRows = logData.filter(function(r) { return r[0] !== ''; });

  var 應到 = validRows.length;
  var 實到 = validRows.filter(function(r) { return r[1] === '準時抵達' || r[1] === '遲到'; }).length;
  var 遲到 = validRows.filter(function(r) { return r[1] === '遲到'; }).length;
  var 請假 = validRows.filter(function(r) { return r[1] === '請假'; }).length;
  var 曠課 = validRows.filter(function(r) { return r[1] === '曠課'; }).length;
  var 出勤比 = 應到 > 0 ? Math.round(實到 / 應到 * 100) + '%' : '0%';

  sheet.getRange(2, 5, 1, 6).setValues([[應到, 實到, 遲到, 請假, 曠課, 出勤比]]);
}

// ─── 學期統計表 ──────────────────────────────────────────────
function updateSemesterStats(ss, records) {
  var statsSheet = ss.getSheetByName('學期統計');

  if (!statsSheet) {
    statsSheet = ss.insertSheet('學期統計');
    var headers = [['姓名', '班級', '座號', '應到', '實到', '出勤比', '遲到', '請假', '曠課', '可領保證金']];
    statsSheet.getRange(1, 1, 1, 10).setValues(headers).setFontWeight('bold');
  }

  var statsData = statsSheet.getDataRange().getValues();
  var nameIndex = {};
  for (var i = 1; i < statsData.length; i++) {
    nameIndex[statsData[i][0]] = i + 1; // 1-based row number
  }

  records.forEach(function(record) {
    var tabName = record.name + '考勤表';
    var studentSheet = ss.getSheetByName(tabName);
    if (!studentSheet) return;

    var s = studentSheet.getRange(2, 5, 1, 6).getValues()[0];
    // s = [應到, 實到, 遲到, 請假, 曠課, 出勤比]
    var pct = parseInt(String(s[5])) || 0;
    var row = [record.name, record.class, record.class_no, s[0], s[1], s[5], s[2], s[3], s[4], pct >= 80 ? '是' : '否'];

    if (nameIndex[record.name]) {
      statsSheet.getRange(nameIndex[record.name], 1, 1, 10).setValues([row]);
    } else {
      statsSheet.appendRow(row);
      nameIndex[record.name] = statsSheet.getLastRow();
    }
  });
}

// ─── 工具函數 ────────────────────────────────────────────────
function statusLabel(status) {
  var map = {
    PRESENT:  '準時抵達',
    LATE:     '遲到',
    OUT:      '準時抵達',
    ABSENT:   '曠課',
    EXCUSED:  '請假',
    EXPECTED: '曠課'
  };
  return map[status] || status;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
