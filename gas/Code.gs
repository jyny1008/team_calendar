/**
 * 중등교육 캘린더 - Google Apps Script 백엔드
 *
 * 배포 방법은 SETUP.md 참고. 이 파일 전체를 Apps Script 프로젝트의 Code.gs에
 * 그대로 붙여넣고 "웹 앱으로 배포"하면 됩니다.
 *
 * 원본 시트(첫 번째 탭)의 컬럼 구조를 그대로 사용합니다:
 *  A:연번 B:시작일 C:종료일 D:행사명 E:장소 F:참가대상 G:주관 H:담당자 I:공개여부 J:비고 K:색상(자동추가)
 *
 * 비밀번호/설정은 별도 "Config" 탭에 SHA-256 해시로만 저장합니다.
 */

const MAIN_SHEET_INDEX = 0;
const CONFIG_SHEET_NAME = 'Config';
const DATA_COLUMNS = 11; // A~K
const DEFAULT_PASSWORD = '2854';

/**
 * 배포 전에 딱 한 번, Apps Script 편집기 상단의 함수 선택 드롭박스에서
 * "setup"을 고른 뒤 ▶ 실행 버튼으로 직접 실행하세요.
 * "웹 앱으로 배포"만으로는 이 파일의 코드가 실제로 실행되지 않기 때문에,
 * 이 함수를 한 번 실행해줘야 Config 탭과 "색상" 컬럼이 즉시 생성되고
 * 권한 승인(구글 계정 인증) 절차도 이 시점에 끝납니다.
 */
function setup() {
  getMainSheet_();
  getConfigSheet_();
  Logger.log('설정 완료: 색상 컬럼과 Config 탭이 준비되었습니다.');
}

function getMainSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[MAIN_SHEET_INDEX];
  ensureColorColumn_(sheet);
  return sheet;
}

function ensureColorColumn_(sheet) {
  const header = sheet.getRange(1, 1, 1, DATA_COLUMNS).getValues()[0];
  if (header[10] !== '색상') {
    sheet.getRange(1, 11).setValue('색상');
  }
}

function getConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.getRange(1, 1, 3, 2).setValues([
      ['key', 'value'],
      ['adminPasswordHash', hash_(DEFAULT_PASSWORD)],
      ['privatePasswordHash', hash_(DEFAULT_PASSWORD)]
    ]);
    sheet.hideSheet();
  }
  return sheet;
}

function hash_(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
}

function getConfigValue_(key) {
  const sheet = getConfigSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setConfigValue_(key, value) {
  const sheet = getConfigSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const DAY_NAMES_ = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateWithDay_(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return dateStr + '(' + DAY_NAMES_[d.getDay()] + ')';
}

function parseDateOnly_(cellValue) {
  if (!cellValue) return '';
  const m = String(cellValue).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'list') {
      return jsonOutput_({ ok: true, events: listEvents_() });
    }
    return jsonOutput_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function listEvents_() {
  const sheet = getMainSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, DATA_COLUMNS).getValues();
  const events = [];
  values.forEach(function (row, idx) {
    const title = row[3];
    if (!title) return; // 빈 행 제외
    events.push({
      _row: idx + 2,
      seq: row[0],
      startDate: parseDateOnly_(row[1]),
      endDate: parseDateOnly_(row[2]),
      title: title,
      location: row[4],
      audience: row[5],
      org: row[6],
      manager: row[7],
      visibility: row[8] || '공개',
      note: row[9],
      color: row[10] || ''
    });
  });
  return events;
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'invalid body' });
  }
  const action = body.action;
  try {
    switch (action) {
      case 'verifyAdmin':
        return jsonOutput_({ ok: true, valid: hash_(body.password) === getConfigValue_('adminPasswordHash') });
      case 'verifyPrivate':
        return jsonOutput_({ ok: true, valid: hash_(body.password) === getConfigValue_('privatePasswordHash') });
      case 'changePassword': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        const key = body.target === 'private' ? 'privatePasswordHash' : 'adminPasswordHash';
        setConfigValue_(key, hash_(body.newPassword));
        return jsonOutput_({ ok: true });
      }
      case 'create': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        return jsonOutput_({ ok: true, event: createEvent_(body.event) });
      }
      case 'update': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        updateEvent_(body.event);
        return jsonOutput_({ ok: true });
      }
      case 'delete': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        deleteEvent_(body.row);
        return jsonOutput_({ ok: true });
      }
      default:
        return jsonOutput_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function requireAdmin_(password) {
  return !!password && hash_(password) === getConfigValue_('adminPasswordHash');
}

function createEvent_(ev) {
  const sheet = getMainSheet_();
  const lastRow = sheet.getLastRow();
  let targetRow = -1;
  if (lastRow >= 2) {
    const nameCol = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
    for (let i = 0; i < nameCol.length; i++) {
      if (!nameCol[i][0]) { targetRow = i + 2; break; }
    }
  }
  if (targetRow === -1) targetRow = lastRow + 1;

  let maxSeq = 0;
  if (lastRow >= 2) {
    const seqCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    seqCol.forEach(function (r) {
      const n = Number(r[0]);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    });
  }
  const seq = maxSeq + 1;

  writeRow_(sheet, targetRow, seq, ev);
  return { _row: targetRow, seq: seq };
}

function updateEvent_(ev) {
  const sheet = getMainSheet_();
  if (!ev._row) throw new Error('missing _row');
  writeRow_(sheet, ev._row, ev.seq, ev);
}

function writeRow_(sheet, row, seq, ev) {
  const start = ev.startDate ? formatDateWithDay_(ev.startDate) : '';
  const end = ev.endDate ? formatDateWithDay_(ev.endDate) : '';
  sheet.getRange(row, 1, 1, DATA_COLUMNS).setValues([[
    seq, start, end, ev.title || '', ev.location || '', ev.audience || '',
    ev.org || '', ev.manager || '', ev.visibility || '공개', ev.note || '', ev.color || ''
  ]]);
}

function deleteEvent_(row) {
  const sheet = getMainSheet_();
  if (!row) throw new Error('missing row');
  sheet.getRange(row, 1, 1, DATA_COLUMNS).clearContent();
}
