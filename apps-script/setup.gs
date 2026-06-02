// 執行一次初始化整個 Spreadsheet 結構
// Apps Script 編輯器中：選 setupSpreadsheet → Run
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  setupTeacherList(ss);
  setupStudentList(ss);
  setupSeatTemplate(ss);
  setupSemesterStats(ss);

  SpreadsheetApp.flush();
  Browser.msgBox('✅ 初始化完成！教師名單、學生名單、座位模板、學期統計都建好了。');
}

// ─── 教師名單 ─────────────────────────────────────────────────
function setupTeacherList(ss) {
  var sheet = getOrCreateSheet(ss, '教師名單', 0);
  sheet.clearContents();
  sheet.clearFormats();

  sheet.getRange(1, 1, 1, 3).setValues([['卡號', '姓名', '備註']]);
  styleHeader(sheet.getRange(1, 1, 1, 3));
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 200);
  sheet.setFrozenRows(1);

  // 範例（替換成真實卡號）
  sheet.getRange(2, 1, 1, 3).setValues([['TEACHER_CARD_001', '王老師', '班導師']]);

  sheet.getRange(1, 5).setValue('⚠ 填入老師實體卡號，新增/刪除後點前端「同步教師名單」按鈕即可生效');
  sheet.getRange(1, 5).setFontColor('#e67e22').setFontWeight('bold');
  sheet.setColumnWidth(5, 420);
}

// ─── 學生名單 ─────────────────────────────────────────────────
function setupStudentList(ss) {
  var sheet = getOrCreateSheet(ss, '學生名單', 0);
  sheet.clearContents();
  sheet.clearFormats();

  var headers = [['學生ID', '卡號', '姓名', '班級', '座號', '報名日 (Mon/Tue/Wed/Thu/Fri)']];
  sheet.getRange(1, 1, 1, 6).setValues(headers);
  styleHeader(sheet.getRange(1, 1, 1, 6));

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 70);
  sheet.setColumnWidth(5, 70);
  sheet.setColumnWidth(6, 200);

  sheet.setFrozenRows(1);

  // 範例學生（實際使用時填真實資料或透過管理介面匯入）
  var sampleData = [
    ['uuid-001', 'CARD00001', '陳奕銘', '115', 35, 'Mon,Tue,Wed,Thu,Fri'],
    ['uuid-002', 'CARD00002', '劉養生', '112', 17, 'Mon,Tue,Wed,Thu,Fri'],
    ['uuid-003', 'CARD00003', '余佳穎', '112',  5, 'Mon,Tue,Wed,Thu,Fri'],
  ];
  sheet.getRange(2, 1, sampleData.length, 6).setValues(sampleData);

  // 說明文字
  sheet.getRange(1, 8).setValue('⚠ 學生ID 需與 D1 資料庫一致，卡號為實體卡上的號碼');
  sheet.getRange(1, 8).setFontColor('#e67e22').setFontWeight('bold');
}

// ─── 座位模板 ─────────────────────────────────────────────────
function setupSeatTemplate(ss) {
  var sheet = getOrCreateSheet(ss, '座位模板', 1);
  sheet.clearContents();
  sheet.clearFormats();

  var headers = [['星期', '座位', '學生ID', '姓名（自動顯示）', '班級（自動顯示）']];
  sheet.getRange(1, 1, 1, 5).setValues(headers);
  styleHeader(sheet.getRange(1, 1, 1, 5));

  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 120);
  sheet.setFrozenRows(1);

  var rows = ['A','B','C','D','E','F','G','H'];
  var cols = [1,2,3,4,5,6];
  var days = ['Mon','Tue','Wed','Thu','Fri'];
  var data = [];

  days.forEach(function(day) {
    rows.forEach(function(row) {
      cols.forEach(function(col) {
        data.push([day, row + col, '', '', '']);
      });
    });
  });

  sheet.getRange(2, 1, data.length, 5).setValues(data);

  // VLOOKUP 公式：自動從學生名單帶出姓名和班級
  var studentListName = '學生名單';
  for (var i = 2; i <= data.length + 1; i++) {
    sheet.getRange(i, 4).setFormula(
      '=IF(C' + i + '="","",IFERROR(VLOOKUP(C' + i + ',\'' + studentListName + '\'!A:C,3,FALSE),"找不到"))'
    );
    sheet.getRange(i, 5).setFormula(
      '=IF(C' + i + '="","",IFERROR(VLOOKUP(C' + i + ',\'' + studentListName + '\'!A:D,4,FALSE),"找不到"))'
    );
  }

  // 交替底色方便閱讀
  days.forEach(function(day, idx) {
    var startRow = idx * 48 + 2;
    var bgColor = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
    sheet.getRange(startRow, 1, 48, 5).setBackground(bgColor);
    // 星期列醒目標示
    sheet.getRange(startRow, 1, 48, 1).setBackground(getDayColor(day)).setFontWeight('bold');
  });

  sheet.getRange(1, 7).setValue('使用方式：在「學生ID」欄填入對應的 UUID，姓名和班級會自動帶入');
  sheet.getRange(1, 7).setFontColor('#27ae60').setFontWeight('bold');
}

// ─── 學期統計 ─────────────────────────────────────────────────
function setupSemesterStats(ss) {
  var sheet = getOrCreateSheet(ss, '學期統計', 2);
  sheet.clearContents();
  sheet.clearFormats();

  var headers = [['姓名', '班級', '座號', '應到', '實到', '出勤比', '遲到', '請假', '曠課', '可領保證金']];
  sheet.getRange(1, 1, 1, 10).setValues(headers);
  styleHeader(sheet.getRange(1, 1, 1, 10));

  // 條件式格式：出勤比 < 80% 標紅
  var pctRange = sheet.getRange('F2:F1000');
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0.8)
    .setBackground('#fce4e4')
    .setFontColor('#c0392b')
    .setRanges([pctRange])
    .build();
  sheet.setConditionalFormatRules([rule]);

  // 條件式格式：可領保證金 = 否 標橘
  var eligibleRange = sheet.getRange('J2:J1000');
  var rule2 = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('否')
    .setBackground('#fef3cd')
    .setFontColor('#856404')
    .setRanges([eligibleRange])
    .build();

  sheet.setConditionalFormatRules([rule, rule2]);

  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2,  70);
  sheet.setColumnWidth(3,  70);
  sheet.setColumnWidth(4,  60);
  sheet.setColumnWidth(5,  60);
  sheet.setColumnWidth(6,  70);
  sheet.setColumnWidth(7,  60);
  sheet.setColumnWidth(8,  60);
  sheet.setColumnWidth(9,  60);
  sheet.setColumnWidth(10, 90);

  sheet.setFrozenRows(1);

  sheet.getRange(1, 12).setValue('由系統每晚 23:00 自動更新，請勿手動編輯 A~J 欄');
  sheet.getRange(1, 12).setFontColor('#7f8c8d').setFontStyle('italic');
}

// ─── 工具函數 ─────────────────────────────────────────────────
function getOrCreateSheet(ss, name, position) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, position);
  }
  return sheet;
}

function styleHeader(range) {
  range
    .setBackground('#1a1d27')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, '#2a2d3e', SpreadsheetApp.BorderStyle.SOLID);
}

function getDayColor(day) {
  var colors = {
    Mon: '#d4e6f1',
    Tue: '#d5f5e3',
    Wed: '#fdebd0',
    Thu: '#e8daef',
    Fri: '#fdfefe'
  };
  return colors[day] || '#ffffff';
}
