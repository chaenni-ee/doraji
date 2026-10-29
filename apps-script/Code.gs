// 나만의 도라지타령 — 학생이 제출한 가락을 이 시트의 '기록표' 탭에 적습니다.
// 시트 메뉴 [확장 프로그램 → Apps Script]에 붙여 넣고, [배포 → 새 배포 → 웹 앱]으로 배포하세요.
const SHEET_NAME = '기록표';
const FIRST_ROW = 5; // 1번 학생이 있는 줄
const TIME_COL = 9;  // I열: 제출 시각

function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    out = p.action === 'ping' ? ping_() : save_(JSON.parse(p.data || '{}'));
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  const json = JSON.stringify(out);
  const cb = /^[A-Za-z_$][\w$]*$/.test(p.callback || '') ? p.callback : '';
  return cb
    ? ContentService.createTextOutput(cb + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT)
    : ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function ping_() {
  sheet_();
  return { ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() };
}

function save_(d) {
  const no = Math.floor(Number(d.no));
  if (!(no >= 1 && no <= 99)) throw new Error('번호를 1~99 사이로 적어 주세요.');
  const row = FIRST_ROW + no - 1;
  const values = [[
    text_(d.name, 30),
    text_(d.melody, 120),
    d.full ? 'O' : 'X',
    d.rule ? 'O' : 'X',
  ]];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    if (!sheet.getRange(FIRST_ROW - 2, TIME_COL).getValue()) {
      sheet.getRange(FIRST_ROW - 2, TIME_COL).setValue('제출 시각');
    }
    sheet.getRange(row, 1).setValue(no);
    sheet.getRange(row, 2, 1, 4).setValues(values);
    sheet.getRange(row, TIME_COL).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
  return { ok: true, no: no };
}

function sheet_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!s) throw new Error("'" + SHEET_NAME + "' 탭을 찾을 수 없어요. 탭 이름을 확인해 주세요.");
  return s;
}

// 학생이 쓴 글이 수식으로 바뀌지 않게 막습니다.
function text_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
