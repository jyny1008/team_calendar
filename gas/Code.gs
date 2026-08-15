/**
 * 중등교육 캘린더 - Google Apps Script 백엔드
 *
 * 배포 방법은 SETUP.md 참고. 이 파일 전체를 Apps Script 프로젝트의 Code.gs에
 * 그대로 붙여넣고 "웹 앱으로 배포"하면 됩니다.
 *
 * 원본 시트(첫 번째 탭)의 컬럼 구조를 그대로 사용합니다:
 *  A:연번 B:시작일 C:시작시간 D:종료일 E:종료시간 F:행사명 G:장소 H:참가대상 I:주관 J:담당자 K:공개여부 L:비고 M:색상(자동추가)
 * 컬럼을 더 추가/삭제할 경우 아래 COL_* 상수만 맞춰서 고치면 됩니다.
 *
 * 비밀번호/설정은 별도 "Config" 탭에 SHA-256 해시로만 저장합니다.
 */

const MAIN_SHEET_INDEX = 0;
const CONFIG_SHEET_NAME = 'Config';
const DEFAULT_PASSWORD = '2854';

const ORG_CONFIG_KEY = 'orgConfig';
const DEFAULT_ORG_ORDER = ['중등교육', '진로진학', '직업교육', '중등인사'];
const DEFAULT_ORG_COLORS = {
  '중등교육': '#3B82F6',
  '진로진학': '#A855F7',
  '직업교육': '#10B981',
  '중등인사': '#F59E0B',
  '__default': '#64748B'
};
const DEFAULT_PRIVATE_COLOR = '#E11D48';

const SITE_CONFIG_KEY = 'siteConfig';
const DEFAULT_SITE_TITLE = '중등교육 캘린더';
const DEFAULT_SITE_YEAR = '2026';

const COL_SEQ = 1;
const COL_START_DATE = 2;
const COL_START_TIME = 3;
const COL_END_DATE = 4;
const COL_END_TIME = 5;
const COL_TITLE = 6;
const COL_LOCATION = 7;
const COL_AUDIENCE = 8;
const COL_ORG = 9;
const COL_MANAGER = 10;
const COL_VISIBILITY = 11;
const COL_NOTE = 12;
const COL_COLOR = 13;
const DATA_COLUMNS = 13; // A~M

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
  if (header[COL_COLOR - 1] !== '색상') {
    sheet.getRange(1, COL_COLOR).setValue('색상');
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

// 주관 표시 순서 / 주관별 색상 / 비공개 일정 색상을 Config 탭에 JSON으로 저장한다.
function getOrgConfig_() {
  const raw = getConfigValue_(ORG_CONFIG_KEY);
  const fallback = {
    order: DEFAULT_ORG_ORDER.slice(),
    colors: Object.assign({}, DEFAULT_ORG_COLORS),
    privateColor: DEFAULT_PRIVATE_COLOR
  };
  if (!raw) {
    setConfigValue_(ORG_CONFIG_KEY, JSON.stringify(fallback));
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      order: parsed.order && parsed.order.length ? parsed.order : fallback.order,
      colors: Object.assign({}, DEFAULT_ORG_COLORS, parsed.colors || {}),
      privateColor: parsed.privateColor || fallback.privateColor
    };
  } catch (err) {
    return fallback;
  }
}

function saveOrgConfig_(cfg) {
  setConfigValue_(ORG_CONFIG_KEY, JSON.stringify(cfg));
}

// 캘린더 제목 / 연도 배지를 Config 탭에 JSON으로 저장한다.
function getSiteConfig_() {
  const raw = getConfigValue_(SITE_CONFIG_KEY);
  const fallback = { title: DEFAULT_SITE_TITLE, year: DEFAULT_SITE_YEAR };
  if (!raw) {
    setConfigValue_(SITE_CONFIG_KEY, JSON.stringify(fallback));
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      title: parsed.title || fallback.title,
      year: parsed.year || fallback.year
    };
  } catch (err) {
    return fallback;
  }
}

function saveSiteConfig_(cfg) {
  setConfigValue_(SITE_CONFIG_KEY, JSON.stringify(cfg));
}

const DAY_NAMES_ = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateWithDay_(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return dateStr + '(' + DAY_NAMES_[d.getDay()] + ')';
}

function parseDateOnly_(cellValue) {
  if (!cellValue) return '';
  if (cellValue instanceof Date) {
    const y = cellValue.getFullYear();
    const m = String(cellValue.getMonth() + 1).padStart(2, '0');
    const d = String(cellValue.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const m = String(cellValue).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function parseTimeOnly_(cellValue) {
  if (!cellValue) return '';
  if (cellValue instanceof Date) {
    // 시간만 입력된 셀은 구글시트 내부적으로 1899-12-30을 기준일로 저장한다.
    // 그 시절 서울의 표준시(지방평균시)는 UTC+8:27:52로, 지금의 UTC+9와 달라서
    // getHours()/getMinutes()(스크립트 타임존 기준 로컬 변환)를 쓰면 그 차이만큼
    // 시각이 밀려 보인다(예: 11:00 입력 → 19:27로 표시). 셀에 저장된 실제 시:분은
    // UTC 값 그대로이므로 UTC 게터로 읽어야 한다.
    const h = String(cellValue.getUTCHours()).padStart(2, '0');
    const m = String(cellValue.getUTCMinutes()).padStart(2, '0');
    return h + ':' + m;
  }
  const s = String(cellValue).trim();
  if (!s) return '';
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : '';
}

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'list') {
      return jsonOutput_({ ok: true, events: listEvents_(), orgConfig: getOrgConfig_(), siteConfig: getSiteConfig_() });
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
    const title = row[COL_TITLE - 1];
    if (!title) return; // 빈 행 제외
    events.push({
      _row: idx + 2,
      seq: row[COL_SEQ - 1],
      startDate: parseDateOnly_(row[COL_START_DATE - 1]),
      startTime: parseTimeOnly_(row[COL_START_TIME - 1]),
      endDate: parseDateOnly_(row[COL_END_DATE - 1]),
      endTime: parseTimeOnly_(row[COL_END_TIME - 1]),
      title: title,
      location: row[COL_LOCATION - 1],
      audience: row[COL_AUDIENCE - 1],
      org: row[COL_ORG - 1],
      manager: row[COL_MANAGER - 1],
      visibility: row[COL_VISIBILITY - 1] || '공개',
      note: row[COL_NOTE - 1],
      color: row[COL_COLOR - 1] || ''
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
        if (!requireEditAccess_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        return jsonOutput_({ ok: true, event: createEvent_(body.event) });
      }
      case 'update': {
        if (!requireEditAccess_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        updateEvent_(body.event);
        return jsonOutput_({ ok: true });
      }
      case 'delete': {
        if (!requireEditAccess_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        deleteEvent_(body.row);
        return jsonOutput_({ ok: true });
      }
      case 'updateOrgColor': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        const cfg = getOrgConfig_();
        cfg.colors[body.org] = body.color;
        saveOrgConfig_(cfg);
        return jsonOutput_({ ok: true, orgConfig: cfg });
      }
      case 'updatePrivateColor': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        const cfg = getOrgConfig_();
        cfg.privateColor = body.color;
        saveOrgConfig_(cfg);
        return jsonOutput_({ ok: true, orgConfig: cfg });
      }
      case 'addOrg': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        const cfg = getOrgConfig_();
        const name = String(body.org || '').trim();
        if (!name) throw new Error('주관명을 입력하세요');
        if (cfg.order.indexOf(name) === -1) cfg.order.push(name);
        cfg.colors[name] = body.color || DEFAULT_ORG_COLORS.__default;
        saveOrgConfig_(cfg);
        return jsonOutput_({ ok: true, orgConfig: cfg });
      }
      case 'updateSiteConfig': {
        if (!requireAdmin_(body.adminPassword)) return jsonOutput_({ ok: false, error: 'unauthorized' });
        const cfg = {
          title: String(body.title || '').trim() || DEFAULT_SITE_TITLE,
          year: String(body.year || '').trim() || DEFAULT_SITE_YEAR
        };
        saveSiteConfig_(cfg);
        return jsonOutput_({ ok: true, siteConfig: cfg });
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

// 캘린더 화면의 일정 등록/수정/삭제는 관리자 비밀번호 또는 비공개 일정 확인
// 비밀번호(캘린더 화면의 잠금 해제 암호와 연동) 둘 중 하나로 인가한다.
// 비밀번호 변경(changePassword)은 requireAdmin_ 그대로 사용해 관리자 전용으로 유지한다.
function requireEditAccess_(password) {
  if (!password) return false;
  const h = hash_(password);
  return h === getConfigValue_('adminPasswordHash') || h === getConfigValue_('privatePasswordHash');
}

function createEvent_(ev) {
  const sheet = getMainSheet_();
  const lastRow = sheet.getLastRow();
  let targetRow = -1;
  if (lastRow >= 2) {
    const nameCol = sheet.getRange(2, COL_TITLE, lastRow - 1, 1).getValues();
    for (let i = 0; i < nameCol.length; i++) {
      if (!nameCol[i][0]) { targetRow = i + 2; break; }
    }
  }
  if (targetRow === -1) targetRow = lastRow + 1;

  let maxSeq = 0;
  if (lastRow >= 2) {
    const seqCol = sheet.getRange(2, COL_SEQ, lastRow - 1, 1).getValues();
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
    seq, start, ev.startTime || '', end, ev.endTime || '', ev.title || '', ev.location || '', ev.audience || '',
    ev.org || '', ev.manager || '', ev.visibility || '공개', ev.note || '', ev.color || ''
  ]]);
}

function deleteEvent_(row) {
  const sheet = getMainSheet_();
  if (!row) throw new Error('missing row');
  sheet.getRange(row, 1, 1, DATA_COLUMNS).clearContent();
}
