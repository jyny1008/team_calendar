/**
 * 관리자페이지 내보내기 기능: PDF(인쇄), 엑셀(SheetJS), 오프라인 HTML
 * 세 함수 모두 "해당 월과 겹치는 이벤트 배열"을 인자로 받는다.
 */
const ExportTools = (function () {
  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  function parseDate_(s) {
    if (!s) return null;
    const p = s.split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function formatDate_(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function escapeHtml_(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function indexByDate_(year, month, events) {
    const map = {};
    events.forEach((ev) => {
      if (!ev.startDate) return;
      const start = parseDate_(ev.startDate);
      const end = ev.endDate ? parseDate_(ev.endDate) : start;
      if (!start || !end) return;
      const cursor = new Date(start);
      let guard = 0;
      while (cursor <= end && guard < 60) {
        if (cursor.getFullYear() === year && cursor.getMonth() === month - 1) {
          const key = formatDate_(cursor);
          (map[key] = map[key] || []).push(ev);
        }
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    });
    return map;
  }

  function buildGridCells_(year, month, eventsByDate, chipRenderer) {
    const firstOfMonth = new Date(year, month - 1, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(year, month - 1, 1 - startOffset);
    let html = '';
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const dateStr = formatDate_(cellDate);
      const inMonth = cellDate.getMonth() === month - 1;
      const dow = cellDate.getDay();
      const classes = ['day-cell'];
      if (!inMonth) classes.push('outside');
      if (dow === 0) classes.push('sun');
      if (dow === 6) classes.push('sat');
      const dayEvents = eventsByDate[dateStr] || [];
      html += '<div class="' + classes.join(' ') + '">' +
        '<span class="day-num">' + cellDate.getDate() + '</span>' +
        '<div class="event-list" style="max-height:none;overflow:visible;">' +
        dayEvents.map(chipRenderer).join('') +
        '</div></div>';
    }
    return html;
  }

  function weekdayRowHtml_() {
    return '<div class="weekday-row">' + WEEKDAY_LABELS.map((w, i) =>
      '<div class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>').join('') + '</div>';
  }

  // ---------------- PDF (브라우저 인쇄) ----------------
  function printMonth(year, month, events) {
    const container = document.getElementById('printCalendar');
    if (!container) return;
    const eventsByDate = indexByDate_(year, month, events);
    const chip = (ev) => {
      const isPrivate = ev.visibility === '비공개';
      const color = ev.color || APP_CONFIG.getOrgColor(ev.org);
      const style = isPrivate
        ? ' style="' + APP_CONFIG.privateChipStyle() + '"'
        : ' style="background-color:' + color + ';color:#fff;"';
      return '<div class="event-chip' + (isPrivate ? ' private' : '') + '"' + style + '>' +
        escapeHtml_('[' + (ev.org || '기타') + '] ' + ev.title) + '</div>';
    };
    container.innerHTML =
      '<h2 style="margin:0 0 10px;">' + year + '년 ' + month + '월 중등교육 캘린더</h2>' +
      '<div class="calendar">' + weekdayRowHtml_() + '<div class="day-grid">' +
      buildGridCells_(year, month, eventsByDate, chip) + '</div></div>';
    window.print();
  }

  function hexToRgba_(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  // ---------------- 일정 목록 표 PDF (브라우저 인쇄) ----------------
  function printEventTable(year, month, events) {
    const container = document.getElementById('printCalendar');
    if (!container) return;
    const list = events.slice().sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    const headers = ['기간', '주관', '행사명', '장소', '담당자', '공개여부'];
    const rowsHtml = list.map((ev) => {
      const period = ev.endDate && ev.endDate !== ev.startDate ? ev.startDate + ' ~ ' + ev.endDate : ev.startDate;
      return '<tr>' +
        '<td>' + escapeHtml_(period) + '</td>' +
        '<td>' + escapeHtml_(ev.org || '-') + '</td>' +
        '<td>' + escapeHtml_(ev.title) + '</td>' +
        '<td>' + escapeHtml_(ev.location || '-') + '</td>' +
        '<td>' + escapeHtml_(ev.manager || '-') + '</td>' +
        '<td>' + escapeHtml_(ev.visibility || '공개') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;padding:16px;">등록된 일정이 없습니다.</td></tr>';

    container.innerHTML =
      '<h2 style="margin:0 0 12px;">' + year + '년 ' + month + '월 중등교육 캘린더 - 일정 목록</h2>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr>' + headers.map((h) => '<th style="text-align:left;border-bottom:1.5px solid #333;padding:6px 8px;">' + h + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table>' +
      '<style>#printCalendar td{border-bottom:1px solid #ddd;padding:6px 8px;}</style>';
    window.print();
  }

  // ---------------- 엑셀 (SheetJS) ----------------
  function exportExcel(year, month, events) {
    const rows = events
      .slice()
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
      .map((ev) => ({
        연번: ev.seq,
        시작일: ev.startDate,
        종료일: ev.endDate,
        행사명: ev.title,
        장소: ev.location,
        참가대상: ev.audience,
        주관: ev.org,
        담당자: ev.manager,
        공개여부: ev.visibility,
        비고: ev.note
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, month + '월');
    XLSX.writeFile(wb, '중등교육캘린더_' + year + '년' + month + '월.xlsx');
  }

  // ---------------- 오프라인 HTML ----------------
  function downloadOfflineHtml(year, month, events) {
    const html = buildOfflineDocument_(year, month, events);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '중등교육캘린더_' + year + '년' + month + '월_오프라인.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function buildOfflineDocument_(year, month, events) {
    const eventsByDate = indexByDate_(year, month, events);
    const chip = (ev) => {
      const isPrivate = ev.visibility === '비공개';
      const color = ev.color || APP_CONFIG.getOrgColor(ev.org);
      const style = isPrivate ? APP_CONFIG.privateChipStyle() : 'background-color:' + color + ';color:#fff;';
      const period = ev.endDate && ev.endDate !== ev.startDate ? ev.startDate + ' ~ ' + ev.endDate : ev.startDate;
      return '<details class="chip-details"><summary class="event-chip' + (isPrivate ? ' private' : '') +
        '" style="' + style + '">' +
        escapeHtml_('[' + (ev.org || '기타') + '] ' + ev.title) + '</summary>' +
        '<div class="chip-detail-body">' +
        '<div><b>기간</b> ' + escapeHtml_(period) + '</div>' +
        '<div><b>장소</b> ' + escapeHtml_(ev.location || '-') + '</div>' +
        '<div><b>참가대상</b> ' + escapeHtml_(ev.audience || '-') + '</div>' +
        '<div><b>담당자</b> ' + escapeHtml_(ev.manager || '-') + '</div>' +
        '<div><b>공개여부</b> ' + escapeHtml_(ev.visibility || '-') + '</div>' +
        '<div><b>비고</b> ' + escapeHtml_(ev.note || '-') + '</div>' +
        '</div></details>';
    };
    const gridHtml = buildGridCells_(year, month, eventsByDate, chip);

    return '<!doctype html><html lang="ko"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + year + '년 ' + month + '월 중등교육 캘린더 (오프라인)</title>' +
      '<style>' + offlineCss_() + '</style></head><body>' +
      '<div class="wrap">' +
      '<h1>' + year + '년 ' + month + '월 중등교육 캘린더</h1>' +
      '<p class="note">이 파일은 다운로드 시점 기준 스냅샷이며, 인터넷 연결 없이 열람할 수 있습니다. 항목을 클릭하면 상세 정보가 펼쳐집니다.</p>' +
      '<div class="calendar"><div class="weekday-row">' +
      WEEKDAY_LABELS.map((w, i) => '<div class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>').join('') +
      '</div><div class="day-grid">' + gridHtml + '</div></div>' +
      '</div></body></html>';
  }

  function offlineCss_() {
    return `
      *{box-sizing:border-box;}
      body{margin:0;font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#eceff4;color:#2e3440;}
      .wrap{max-width:1100px;margin:0 auto;padding:24px 20px 60px;}
      h1{font-size:20px;margin:0 0 4px;}
      .note{font-size:12.5px;color:#4c566a;margin:0 0 16px;}
      .calendar{background:#fff;border:1px solid #d8dee9;border-radius:10px;overflow:hidden;}
      .weekday-row,.day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}
      .weekday-row{background:#e5e9f0;border-bottom:1px solid #d8dee9;}
      .weekday-row div{padding:8px 0;text-align:center;font-size:12px;font-weight:700;color:#4c566a;}
      .weekday-row .sun{color:#bf616a;} .weekday-row .sat{color:#5e81ac;}
      .day-cell{min-width:0;min-height:96px;border-right:1px solid #d8dee9;border-bottom:1px solid #d8dee9;padding:6px;}
      .day-cell.outside{background:#e5e9f0;opacity:0.6;}
      .day-num{font-size:12px;font-weight:700;display:block;margin-bottom:4px;}
      .event-list{display:flex;flex-direction:column;gap:3px;}
      .chip-details{margin:0;}
      summary.event-chip{font-size:11px;font-weight:700;padding:3px 6px;border-radius:5px;cursor:pointer;list-style:none;}
      summary.event-chip::-webkit-details-marker{display:none;}
      .chip-detail-body{font-size:11.5px;background:#f7f9fc;border:1px solid #d8dee9;border-top:none;border-radius:0 0 5px 5px;padding:6px 8px;line-height:1.6;}
    `;
  }

  return { printMonth, printEventTable, exportExcel, downloadOfflineHtml, indexByDate_ };
})();
