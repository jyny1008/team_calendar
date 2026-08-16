/**
 * 주간일정 hwpx(한글) 다운로드
 * `templates/weekly-schedule-template.hwpx`("주간일정(양식).hwpx"를 그대로 옮겨온 것) 서식의
 * 표 마지막 행("1. 행사명입력" ...)을 주간 일정 개수만큼 복제해 값을 채운 뒤 다시 압축해 내려받는다.
 * hwpx는 zip 컨테이너이므로 JSZip으로 열고, 안의 section0.xml(본문 XML)만 DOM으로 수정한다.
 */
const HwpxExport = (function () {
  const TEMPLATE_URL = 'templates/weekly-schedule-template.hwpx';
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
  function formatEventPeriod_(ev) {
    const s = parseDate_(ev.startDate);
    if (!s) return '-';
    let text = s.getFullYear() + '. ' + (s.getMonth() + 1) + '. ' + s.getDate() + '.(' + WEEKDAY_LABELS[s.getDay()] + ')';
    if (ev.startTime) text += ', ' + ev.startTime;
    if (ev.endDate && ev.endDate !== ev.startDate) {
      const e = parseDate_(ev.endDate);
      if (e) {
        text += ' ~ ' + (e.getMonth() + 1) + '. ' + e.getDate() + '.(' + WEEKDAY_LABELS[e.getDay()] + ')';
        if (ev.endTime) text += ', ' + ev.endTime;
      }
    } else if (ev.endTime) {
      text += ' ~ ' + ev.endTime;
    }
    return text;
  }
  function withinWeek_(ev, weekStart, weekEnd) {
    if (!ev.startDate) return false;
    const s = parseDate_(ev.startDate);
    const en = ev.endDate ? parseDate_(ev.endDate) : s;
    if (!s || !en) return false;
    return s <= weekEnd && en >= weekStart;
  }

  function firstT_(el) {
    return el.getElementsByTagName('hp:t')[0];
  }
  function childrenByTag_(el, tag) {
    return Array.from(el.children).filter((c) => c.tagName === tag);
  }

  async function buildHwpxBlob_(events) {
    const buf = await fetch(TEMPLATE_URL).then((r) => {
      if (!r.ok) throw new Error('hwpx 서식 파일(templates/weekly-schedule-template.hwpx)을 불러오지 못했습니다.');
      return r.arrayBuffer();
    });
    const zip = await JSZip.loadAsync(buf);
    const xmlText = await zip.file('Contents/section0.xml').async('string');
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('hwpx 서식 파일 형식이 올바르지 않습니다.');
    }

    const tbl = doc.getElementsByTagName('hp:tbl')[0];
    const rows = childrenByTag_(tbl, 'hp:tr');
    const templateRow = rows[rows.length - 1];
    tbl.removeChild(templateRow);

    if (events.length === 0) {
      const row = templateRow.cloneNode(true);
      const [leftTc, rightTc] = childrenByTag_(row, 'hp:tc');
      firstT_(leftTc).textContent = ' 해당 주에 등록된 일정이 없습니다.';
      const subList = rightTc.getElementsByTagName('hp:subList')[0];
      childrenByTag_(subList, 'hp:p').forEach((p) => {
        const t = firstT_(p);
        if (t) t.textContent = '';
      });
      tbl.appendChild(row);
    } else {
      events.forEach((ev, i) => {
        const row = templateRow.cloneNode(true);
        const [leftTc, rightTc] = childrenByTag_(row, 'hp:tc');
        [leftTc, rightTc].forEach((tc) => {
          tc.getElementsByTagName('hp:cellAddr')[0].setAttribute('rowAddr', String(2 + i));
        });
        firstT_(leftTc).textContent = ' ' + (i + 1) + '. ' + (ev.title || '');
        const subList = rightTc.getElementsByTagName('hp:subList')[0];
        const labels = [
          ' 가. 일 정: ' + formatEventPeriod_(ev),
          ' 나. 장 소: ' + (ev.location || '-'),
          ' 다. 대 상: ' + (ev.audience || '-'),
          ' 라. 내 용: ' + (ev.content || '-')
        ];
        childrenByTag_(subList, 'hp:p').forEach((p, idx) => {
          firstT_(p).textContent = labels[idx];
        });
        tbl.appendChild(row);
      });
    }

    tbl.setAttribute('rowCnt', String(2 + Math.max(events.length, 1)));

    // DOMParser로 읽은 XML 선언(인코딩/standalone)이 있는 문서를 XMLSerializer로 다시 직렬화하면
    // 브라우저가 자체적으로 "<?xml ...?>" 선언을 이미 앞에 붙여서 내보낸다. 여기서 선언을 한 번 더
    // 붙이면 "<?xml ...?><?xml ...?>..." 형태로 중복돼 올바르지 않은 XML이 되어(두 번째 "<?xml"이
    // 문서 맨 앞이 아닌 위치의 처리명령으로 취급되어 파싱 오류) 한글에서 파일을 열 때 오류가 난다.
    const xmlOut = new XMLSerializer().serializeToString(doc);
    zip.file('Contents/section0.xml', xmlOut, { compression: 'DEFLATE' });
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    // JSZip은 loadAsync()로 읽어들인, 손대지 않은 기존 항목의 원래 압축방식(STORE/DEFLATE)을
    // 기억하지 못하고 generateAsync()에 넘긴 전역 compression 옵션(DEFLATE)을 모든 항목에 그대로
    // 적용해버린다. 원본 템플릿에서 STORE(비압축)로 저장돼 있던 항목까지 DEFLATE로 바뀌는 것을
    // 막기 위해, 내용은 그대로 둔 채 압축방식만 원본과 동일하게 명시적으로 되돌린다.
    for (const name of ['version.xml', 'Preview/PrvImage.png']) {
      const content = await zip.file(name).async('uint8array');
      zip.file(name, content, { compression: 'STORE' });
    }
    // zip.file()로 기존 경로를 덮어쓸 때 JSZip이 상위 폴더 항목("Contents/", "Preview/")을
    // 자동으로 끼워 넣는데, 원본 hwpx에는 폴더 항목이 전혀 없어서(한글이 이 구조를 엄격히 따짐)
    // 반드시 제거해야 한다. 이 항목이 남아 있으면 한글에서 파일을 열었을 때 내용 없이 빈 문서로
    // 뜨거나 파일이 손상된 것으로 인식된다(실제로 재현 확인함).
    // zip.remove('Contents/')는 폴더 하위 파일까지 재귀적으로 지워버리므로 쓰면 안 되고,
    // 내부 files 맵에서 그 폴더 항목만 직접 제거한다.
    delete zip.files['Contents/'];
    delete zip.files['Preview/'];

    return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
  }

  async function downloadWeekly(weekStart, weekEnd, events) {
    const list = events
      .filter((ev) => withinWeek_(ev, weekStart, weekEnd))
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || (a.startTime || '').localeCompare(b.startTime || ''));
    const blob = await buildHwpxBlob_(list);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '중등교육과_주간일정_' + formatDate_(weekStart) + '~' + formatDate_(weekEnd) + '.hwpx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { downloadWeekly };
})();
