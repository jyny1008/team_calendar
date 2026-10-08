/**
 * 공개 캘린더 화면 로직 (index.html)
 */
(function () {
  const WEEKDAY_LABELS_ = ['일', '월', '화', '수', '목', '금', '토'];

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1, // 1-12
    weekAnchor: new Date(), // 주별 보기 기준일
    events: [],
    orgs: [],
    activeOrgs: new Set(),
    _knownOrgs: null,
    privateChecked: false,
    privatePassword: null, // 세션 중 메모리에만 보관 (쓰기 작업용, 새로고침 시 초기화)
    showHolidays: false,
    view: 'month' // 'month' | 'week' | 'list'
  };

  const els = {};
  let currentDetailEvent = null;
  let pendingAfterAuth = null;

  const CACHE_KEY_ = 'calendar_dataCache_v1';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls_();
    bindStaticEvents_();

    // 이전 방문에서 저장해둔 데이터가 있으면 네트워크 응답을 기다리지 않고 먼저 그려서
    // 체감 로딩을 없애고, 최신 데이터는 화면 뒤에서 조용히 받아와 반영한다(stale-while-revalidate).
    const cached = loadCache_();
    if (cached) {
      applyFetchResult_(cached);
      finishInit_();
      fetchAndApply_().then(finishInit_).catch(() => {});
      return;
    }

    showLoading_(true);
    try {
      await fetchAndApply_();
    } catch (err) {
      toast_(err.message, true);
      state.events = [];
    }
    showLoading_(false);
    finishInit_();
  }

  function loadCache_() {
    try {
      const raw = localStorage.getItem(CACHE_KEY_);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveCache_(res) {
    try {
      localStorage.setItem(CACHE_KEY_, JSON.stringify({ events: res.events, orgConfig: res.orgConfig, siteConfig: res.siteConfig }));
    } catch (err) {
      // 저장 공간 초과 등은 캐시를 못 쓸 뿐이므로 무시한다.
    }
  }

  function applyFetchResult_(res) {
    state.events = res.events;
    APP_CONFIG.applyOrgConfig(res.orgConfig);
    APP_CONFIG.applySiteConfig(res.siteConfig);
  }

  async function fetchAndApply_() {
    const res = await Api.list();
    applyFetchResult_(res);
    saveCache_(res);
  }

  function finishInit_() {
    renderSiteMeta_();
    populateOrgDatalist_();
    buildOrgFilters_();
    state.privateChecked = sessionStorage.getItem('calendar_privateUnlocked') === '1';
    els.privateToggle.checked = state.privateChecked;
    updatePrivateToggleUi_();
    render_();
  }

  function cacheEls_() {
    els.siteTitleText = document.getElementById('siteTitleText');
    els.siteYearBadge = document.getElementById('siteYearBadge');
    els.monthLabel = document.getElementById('monthLabel');
    els.prevBtn = document.getElementById('prevMonthBtn');
    els.nextBtn = document.getElementById('nextMonthBtn');
    els.todayBtn = document.getElementById('todayBtn');
    els.addEventBtn = document.getElementById('addEventBtn');
    els.orgFilters = document.getElementById('orgFilters');
    els.selectAllToggle = document.getElementById('selectAllToggle');
    els.selectAllLabel = document.getElementById('selectAllLabel');
    els.privateToggle = document.getElementById('privateToggle');
    els.privateLabel = document.getElementById('privateLabel');
    els.holidayToggle = document.getElementById('holidayToggle');
    els.holidayLabel = document.getElementById('holidayLabel');
    els.viewToggleBtns = Array.from(document.querySelectorAll('#viewToggle button'));
    els.calendarView = document.getElementById('calendarView');
    els.weekView = document.getElementById('weekView');
    els.listView = document.getElementById('listView');
    els.calendarBody = document.getElementById('calendarBody');
    els.weekGrid = document.getElementById('weekGrid');
    els.listTableBody = document.getElementById('listTableBody');

    els.detailModal = document.getElementById('detailModal');
    els.detailBody = document.getElementById('detailBody');
    els.detailTitle = document.getElementById('detailTitle');
    els.detailEditBtn = document.getElementById('detailEditBtn');
    els.detailDeleteBtn = document.getElementById('detailDeleteBtn');

    els.passwordModal = document.getElementById('passwordModal');
    els.passwordModalTitle = document.getElementById('passwordModalTitle');
    els.passwordInput = document.getElementById('passwordInput');
    els.passwordError = document.getElementById('passwordError');

    els.eventFormModal = document.getElementById('eventFormModal');
    els.eventForm = document.getElementById('eventForm');
    els.eventFormTitle = document.getElementById('eventFormTitle');
    els.eventFormSubmitBtn = document.getElementById('eventFormSubmitBtn');
    els.fRow = document.getElementById('fRow');
    els.fSeq = document.getElementById('fSeq');
    els.fStartDate = document.getElementById('fStartDate');
    els.fStartTime = document.getElementById('fStartTime');
    els.fEndDate = document.getElementById('fEndDate');
    els.fEndTime = document.getElementById('fEndTime');
    els.fTitle = document.getElementById('fTitle');
    els.fLocation = document.getElementById('fLocation');
    els.fOrg = document.getElementById('fOrg');
    els.fAudience = document.getElementById('fAudience');
    els.fManager = document.getElementById('fManager');
    els.fColorDefault = document.getElementById('fColorDefault');
    els.fColor = document.getElementById('fColor');
    els.fContent = document.getElementById('fContent');
    els.fNote = document.getElementById('fNote');

    els.loadingOverlay = document.getElementById('loadingOverlay');
    els.toast = document.getElementById('toast');
  }

  function bindStaticEvents_() {
    els.prevBtn.addEventListener('click', () => changeNav_(-1));
    els.nextBtn.addEventListener('click', () => changeNav_(1));
    els.todayBtn.addEventListener('click', () => {
      const now = new Date();
      state.year = now.getFullYear();
      state.month = now.getMonth() + 1;
      state.weekAnchor = now;
      render_();
    });

    els.addEventBtn.addEventListener('click', () => {
      requireAuth_('일정 등록 확인', () => openEventForm_(null));
    });

    els.viewToggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const newView = btn.dataset.view;
        if (newView === 'week' && state.view !== 'week') {
          state.weekAnchor = new Date(state.year, state.month - 1, 1);
        }
        state.view = newView;
        els.viewToggleBtns.forEach((b) => b.classList.toggle('active', b === btn));
        els.calendarView.classList.toggle('hidden', state.view !== 'month');
        els.weekView.classList.toggle('hidden', state.view !== 'week');
        els.listView.classList.toggle('hidden', state.view !== 'list');
        render_();
      });
    });

    els.selectAllToggle.addEventListener('change', () => {
      if (els.selectAllToggle.checked) {
        state.orgs.forEach((o) => state.activeOrgs.add(o));
      } else {
        state.activeOrgs.clear();
      }
      syncOrgCheckboxes_();
      render_();
    });

    els.privateToggle.addEventListener('change', onPrivateToggle_);

    els.holidayToggle.addEventListener('change', () => {
      state.showHolidays = els.holidayToggle.checked;
      els.holidayLabel.classList.toggle('active', state.showHolidays);
      render_();
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => closeModal_(e.target.closest('.modal-overlay')));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal_(overlay); });
    });

    document.getElementById('passwordForm').addEventListener('submit', onPasswordSubmit_);

    els.detailEditBtn.addEventListener('click', () => {
      if (!currentDetailEvent) return;
      const ev = currentDetailEvent;
      requireAuth_('일정 수정 확인', () => {
        closeModal_(els.detailModal);
        openEventForm_(ev);
      });
    });
    els.detailDeleteBtn.addEventListener('click', () => {
      if (!currentDetailEvent) return;
      const ev = currentDetailEvent;
      requireAuth_('일정 삭제 확인', () => onDeleteEvent_(ev));
    });

    els.fColorDefault.addEventListener('change', () => {
      els.fColor.disabled = els.fColorDefault.checked;
    });
    els.eventForm.addEventListener('submit', onSubmitEventForm_);
  }

  function changeNav_(delta) {
    if (state.view === 'week') {
      const d = new Date(state.weekAnchor);
      d.setDate(d.getDate() + delta * 7);
      state.weekAnchor = d;
      state.year = d.getFullYear();
      state.month = d.getMonth() + 1;
    } else {
      let m = state.month + delta;
      let y = state.year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      state.month = m;
      state.year = y;
    }
    render_();
  }

  function populateOrgDatalist_() {
    const dl = document.getElementById('orgOptions');
    if (!dl) return;
    dl.innerHTML = APP_CONFIG.ORG_ORDER.map((o) => '<option value="' + escapeHtml_(o) + '">').join('');
  }

  function buildOrgFilters_() {
    const set = new Set();
    state.events.forEach((e) => { if (e.org) set.add(e.org); });
    const known = APP_CONFIG.ORG_ORDER;
    const orgs = known.filter((o) => set.has(o)).concat([...set].filter((o) => !known.includes(o)));

    const prevKnown = state._knownOrgs;
    orgs.forEach((o) => { if (!prevKnown || !prevKnown.has(o)) state.activeOrgs.add(o); });
    [...state.activeOrgs].forEach((o) => { if (!orgs.includes(o)) state.activeOrgs.delete(o); });
    state.orgs = orgs;
    state._knownOrgs = new Set(orgs);

    els.orgFilters.innerHTML = '';
    orgs.forEach((org) => {
      const id = 'org_' + org;
      const active = state.activeOrgs.has(org);
      const color = APP_CONFIG.getOrgColor(org);
      const label = document.createElement('label');
      label.className = 'chip-checkbox' + (active ? ' active' : '');
      label.htmlFor = id;
      if (active) label.style.color = color;
      label.innerHTML =
        '<input type="checkbox" id="' + id + '"' + (active ? ' checked' : '') + '>' +
        '<span class="dot" style="background:' + color + '"></span>' +
        escapeHtml_(org);
      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        if (input.checked) state.activeOrgs.add(org); else state.activeOrgs.delete(org);
        label.classList.toggle('active', input.checked);
        label.style.color = input.checked ? color : '';
        syncSelectAllToggle_();
        render_();
      });
      els.orgFilters.appendChild(label);
    });
    syncSelectAllToggle_();
  }

  function syncOrgCheckboxes_() {
    els.orgFilters.querySelectorAll('label').forEach((label) => {
      const input = label.querySelector('input');
      const org = input.id.replace('org_', '');
      input.checked = state.activeOrgs.has(org);
      label.classList.toggle('active', input.checked);
      label.style.color = input.checked ? APP_CONFIG.getOrgColor(org) : '';
    });
    syncSelectAllToggle_();
  }

  function syncSelectAllToggle_() {
    const allChecked = state.orgs.length > 0 && state.activeOrgs.size === state.orgs.length;
    els.selectAllToggle.checked = allChecked;
    els.selectAllLabel.classList.toggle('active', allChecked);
  }

  function onPrivateToggle_() {
    if (els.privateToggle.checked) {
      if (state.privateChecked) {
        render_();
        updatePrivateToggleUi_();
        return;
      }
      els.privateToggle.checked = false; // 인증 전에는 원복해두고 모달에서 처리
      openPasswordModal_('비공개 일정 확인', () => render_());
    } else {
      state.privateChecked = false;
      render_();
      updatePrivateToggleUi_();
    }
  }

  // 비공개 일정 확인 비밀번호로 등록/수정/삭제까지 인가한다(암호 연동).
  function requireAuth_(title, onSuccess) {
    if (state.privatePassword) {
      onSuccess();
      return;
    }
    openPasswordModal_(title, onSuccess);
  }

  function openPasswordModal_(title, afterAuth) {
    pendingAfterAuth = afterAuth || null;
    els.passwordModalTitle.textContent = title || '비공개 일정 확인';
    els.passwordInput.value = '';
    els.passwordError.textContent = '';
    els.passwordModal.classList.remove('hidden');
    setTimeout(() => els.passwordInput.focus(), 50);
  }

  async function onPasswordSubmit_(e) {
    e.preventDefault();
    const pw = els.passwordInput.value.trim();
    if (!pw) return;
    try {
      const ok = await Api.verifyPrivate(pw);
      if (ok) {
        state.privateChecked = true;
        state.privatePassword = pw;
        sessionStorage.setItem('calendar_privateUnlocked', '1');
        els.privateToggle.checked = true;
        updatePrivateToggleUi_();
        closeModal_(els.passwordModal);
        const cb = pendingAfterAuth;
        pendingAfterAuth = null;
        if (cb) cb(); else render_();
      } else {
        els.passwordError.textContent = '비밀번호가 올바르지 않습니다.';
      }
    } catch (err) {
      els.passwordError.textContent = err.message;
    }
  }

  function updatePrivateToggleUi_() {
    els.privateLabel.classList.toggle('unlocked', state.privateChecked);
  }

  function closeModal_(overlay) { overlay.classList.add('hidden'); }

  function render_() {
    renderMonthLabel_();
    if (state.view === 'week') renderWeek_();
    else if (state.view === 'list') renderList_();
    else renderCalendar_();
  }

  function renderMonthLabel_() {
    if (state.view === 'week') {
      const start = weekStartOf_(state.weekAnchor);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      els.monthLabel.textContent = formatWeekRange_(start, end);
    } else {
      els.monthLabel.textContent = state.year + '년 ' + state.month + '월';
    }
  }

  function weekStartOf_(d) {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - s.getDay());
    return s;
  }

  function formatWeekRange_(start, end) {
    const y = start.getFullYear();
    if (start.getMonth() === end.getMonth()) {
      return y + '년 ' + (start.getMonth() + 1) + '월 ' + start.getDate() + '일~' + end.getDate() + '일';
    }
    return y + '년 ' + (start.getMonth() + 1) + '월 ' + start.getDate() + '일 ~ ' + (end.getMonth() + 1) + '월 ' + end.getDate() + '일';
  }

  function renderCalendar_() {
    const firstOfMonth = new Date(state.year, state.month - 1, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(state.year, state.month - 1, 1 - startOffset);
    const todayStr = formatDate_(new Date());
    const eventsByDate = indexEventsByDate_();

    els.calendarBody.innerHTML = '';
    const totalCells = 42;
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const dateStr = formatDate_(cellDate);
      const inMonth = cellDate.getMonth() === state.month - 1;
      const dow = cellDate.getDay();
      const holidayName = state.showHolidays ? window.KR_HOLIDAYS[dateStr] : null;

      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if (!inMonth) cell.classList.add('outside');
      if (dateStr === todayStr) cell.classList.add('today');
      if (dow === 0) cell.classList.add('sun');
      if (dow === 6) cell.classList.add('sat');

      const num = document.createElement('span');
      num.className = 'day-num' + (holidayName ? ' holiday' : '');
      num.textContent = cellDate.getDate();
      if (holidayName) num.title = holidayName;
      cell.appendChild(num);

      const list = document.createElement('div');
      list.className = 'event-list';
      if (holidayName) list.appendChild(buildHolidayChip_(holidayName));
      const dayEvents = (eventsByDate[dateStr] || []).filter(passesFilter_);
      dayEvents.forEach((ev) => list.appendChild(buildChip_(ev)));
      cell.appendChild(list);

      els.calendarBody.appendChild(cell);
    }
  }

  function renderWeek_() {
    const start = weekStartOf_(state.weekAnchor);
    const todayStr = formatDate_(new Date());
    const eventsByDate = indexEventsByDate_();

    els.weekGrid.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(start);
      cellDate.setDate(start.getDate() + i);
      const dateStr = formatDate_(cellDate);
      const dow = cellDate.getDay();
      const holidayName = state.showHolidays ? window.KR_HOLIDAYS[dateStr] : null;

      const col = document.createElement('div');
      col.className = 'week-day-col';
      if (dateStr === todayStr) col.classList.add('today');
      if (dow === 0) col.classList.add('sun');
      if (dow === 6) col.classList.add('sat');

      const head = document.createElement('div');
      head.className = 'week-day-head';
      if (holidayName) head.title = holidayName;
      head.innerHTML =
        '<span class="wd-label">' + WEEKDAY_LABELS_[dow] + '</span>' +
        '<span class="wd-date' + (holidayName ? ' holiday' : '') + '">' + cellDate.getDate() + '</span>';
      col.appendChild(head);

      const list = document.createElement('div');
      list.className = 'event-list week';
      if (holidayName) list.appendChild(buildHolidayChip_(holidayName));
      (eventsByDate[dateStr] || []).filter(passesFilter_).forEach((ev) => list.appendChild(buildChip_(ev)));
      col.appendChild(list);

      els.weekGrid.appendChild(col);
    }
  }

  function renderList_() {
    const monthStart = new Date(state.year, state.month - 1, 1);
    const monthEnd = new Date(state.year, state.month, 0);
    const list = state.events.filter((ev) => {
      if (!ev.startDate) return false;
      const s = parseDate_(ev.startDate);
      const en = ev.endDate ? parseDate_(ev.endDate) : s;
      if (!s || !en) return false;
      if (!(s <= monthEnd && en >= monthStart)) return false;
      return passesFilter_(ev);
    }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

    els.listTableBody.innerHTML = '';
    if (list.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" class="list-empty">해당 월에 등록된 일정이 없습니다.</td>';
      els.listTableBody.appendChild(tr);
      return;
    }
    list.forEach((ev) => {
      const tr = document.createElement('tr');
      const period = formatPeriod_(ev);
      const color = ev.color || APP_CONFIG.getOrgColor(ev.org);
      const isPrivate = ev.visibility === '비공개';
      tr.innerHTML =
        '<td>' + escapeHtml_(period) + '</td>' +
        '<td><span class="org-pill" style="background:' + color + '">' + escapeHtml_(ev.org || '-') + '</span></td>' +
        '<td>' + (isPrivate ? '🔒 ' : '') + escapeHtml_(ev.title) + '</td>' +
        '<td>' + escapeHtml_(ev.location || '-') + '</td>' +
        '<td>' + escapeHtml_(ev.manager || '-') + '</td>';
      tr.addEventListener('click', () => openDetail_(ev));
      els.listTableBody.appendChild(tr);
    });
  }

  function passesFilter_(ev) {
    if (ev.org && !state.activeOrgs.has(ev.org)) return false;
    const isPrivate = ev.visibility === '비공개';
    if (isPrivate && !state.privateChecked) return false;
    return true;
  }

  function indexEventsByDate_() {
    const map = {};
    state.events.forEach((ev) => {
      if (!ev.startDate) return;
      const start = parseDate_(ev.startDate);
      const end = ev.endDate ? parseDate_(ev.endDate) : start;
      if (!start || !end) return;
      const cursor = new Date(start);
      let guard = 0;
      while (cursor <= end && guard < 60) {
        const key = formatDate_(cursor);
        (map[key] = map[key] || []).push(ev);
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    });
    return map;
  }

  function buildChip_(ev) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isPrivate = ev.visibility === '비공개';
    btn.className = 'event-chip' + (isPrivate ? ' private' : '');
    btn.textContent = '[' + (ev.org || '기타') + '] ' + ev.title;
    if (isPrivate) {
      btn.style.cssText += APP_CONFIG.privateChipStyle();
    } else {
      const color = ev.color || APP_CONFIG.getOrgColor(ev.org);
      btn.style.backgroundColor = color;
    }
    btn.addEventListener('click', () => openDetail_(ev));
    return btn;
  }

  function buildHolidayChip_(name) {
    const div = document.createElement('div');
    div.className = 'event-chip holiday-chip';
    div.textContent = '🇰🇷 ' + name;
    return div;
  }

  function openDetail_(ev) {
    currentDetailEvent = ev;
    els.detailTitle.textContent = ev.title;
    const periodDate = formatPeriodDateOnly_(ev);
    const timeRows =
      (ev.startTime ? '<div class="detail-row"><div class="k">시작시간</div><div class="v">' + escapeHtml_(ev.startTime) + '</div></div>' : '') +
      (ev.endTime ? '<div class="detail-row"><div class="k">종료시간</div><div class="v">' + escapeHtml_(ev.endTime) + '</div></div>' : '');
    const visTag = ev.visibility === '비공개'
      ? '<span class="tag visibility-private">비공개</span>'
      : '<span class="tag visibility-public">공개</span>';
    els.detailBody.innerHTML =
      '<div class="detail-row"><div class="k">기간</div><div class="v">' + escapeHtml_(periodDate) + '</div></div>' +
      timeRows +
      '<div class="detail-row"><div class="k">주관</div><div class="v">' + escapeHtml_(ev.org || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">장소</div><div class="v">' + escapeHtml_(ev.location || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">참가대상</div><div class="v">' + escapeHtml_(ev.audience || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">담당자</div><div class="v">' + escapeHtml_(ev.manager || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">공개여부</div><div class="v">' + visTag + '</div></div>' +
      '<div class="detail-row"><div class="k">내용</div><div class="v">' + escapeHtml_(ev.content || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">비고</div><div class="v">' + escapeHtml_(ev.note || '-') + '</div></div>';
    els.detailModal.classList.remove('hidden');
  }

  function openEventForm_(ev) {
    els.eventForm.reset();
    if (ev) {
      els.fRow.value = ev._row;
      els.fSeq.value = ev.seq;
      els.fStartDate.value = ev.startDate || '';
      els.fStartTime.value = ev.startTime || '';
      els.fEndDate.value = ev.endDate || '';
      els.fEndTime.value = ev.endTime || '';
      els.fTitle.value = ev.title || '';
      els.fLocation.value = ev.location || '';
      els.fOrg.value = ev.org || '';
      els.fAudience.value = ev.audience || '';
      els.fManager.value = ev.manager || '';
      els.fContent.value = ev.content || '';
      els.fNote.value = ev.note || '';
      document.querySelector('input[name="fVisibility"][value="' + (ev.visibility === '비공개' ? '비공개' : '공개') + '"]').checked = true;
      if (ev.color) {
        els.fColorDefault.checked = false;
        els.fColor.disabled = false;
        els.fColor.value = ev.color;
      } else {
        els.fColorDefault.checked = true;
        els.fColor.disabled = true;
        els.fColor.value = APP_CONFIG.getOrgColor(ev.org);
      }
      els.eventFormTitle.textContent = '✏️ 일정 수정';
      els.eventFormSubmitBtn.textContent = '수정 저장';
    } else {
      els.fRow.value = '';
      els.fSeq.value = '';
      els.fColor.disabled = true;
      els.eventFormTitle.textContent = '➕ 일정 등록';
      els.eventFormSubmitBtn.textContent = '등록';
    }
    els.eventFormModal.classList.remove('hidden');
  }

  async function onSubmitEventForm_(e) {
    e.preventDefault();
    if (!els.fStartDate.value || !els.fTitle.value.trim() || !els.fOrg.value.trim()) {
      toast_('시작일 / 행사명 / 주관은 필수입니다.', true);
      return;
    }
    if (els.fEndDate.value && els.fEndDate.value < els.fStartDate.value) {
      toast_('종료일은 시작일보다 빠를 수 없습니다.', true);
      return;
    }
    if (!state.privatePassword) {
      toast_('비밀번호 확인이 필요합니다.', true);
      return;
    }
    const event = {
      startDate: els.fStartDate.value,
      startTime: els.fStartTime.value || '',
      endDate: els.fEndDate.value || '',
      endTime: els.fEndTime.value || '',
      title: els.fTitle.value.trim(),
      location: els.fLocation.value.trim(),
      audience: els.fAudience.value.trim(),
      org: els.fOrg.value.trim(),
      manager: els.fManager.value.trim(),
      visibility: document.querySelector('input[name="fVisibility"]:checked').value,
      content: els.fContent.value.trim(),
      note: els.fNote.value.trim(),
      color: els.fColorDefault.checked ? '' : els.fColor.value
    };

    showLoading_(true);
    try {
      if (els.fRow.value) {
        event._row = Number(els.fRow.value);
        event.seq = els.fSeq.value;
        await Api.updateEvent(state.privatePassword, event);
        toast_('일정을 수정했습니다.');
      } else {
        await Api.createEvent(state.privatePassword, event);
        toast_('일정을 등록했습니다.');
      }
      closeModal_(els.eventFormModal);
      await reloadEvents_();
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  async function onDeleteEvent_(ev) {
    if (!confirm('"' + ev.title + '" 일정을 삭제할까요?')) return;
    showLoading_(true);
    try {
      await Api.deleteEvent(state.privatePassword, ev._row);
      toast_('일정을 삭제했습니다.');
      closeModal_(els.detailModal);
      await reloadEvents_();
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  async function reloadEvents_() {
    try {
      await fetchAndApply_();
    } catch (err) {
      toast_(err.message, true);
      return;
    }
    renderSiteMeta_();
    populateOrgDatalist_();
    buildOrgFilters_();
    render_();
  }

  function renderSiteMeta_() {
    els.siteTitleText.textContent = APP_CONFIG.SITE_TITLE;
    els.siteYearBadge.textContent = APP_CONFIG.SITE_YEAR;
    document.title = APP_CONFIG.SITE_TITLE;
  }

  function showLoading_(show) { els.loadingOverlay.classList.toggle('hidden', !show); }

  let toastTimer = null;
  function toast_(msg, isError) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function parseDate_(s) {
    if (!s) return null;
    const parts = s.split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function formatPeriod_(ev) {
    const sameDay = !ev.endDate || ev.endDate === ev.startDate;
    let text = ev.startDate + (ev.startTime ? ' ' + ev.startTime : '');
    if (sameDay) {
      if (ev.endTime) text += ' ~ ' + ev.endTime;
    } else {
      text += ' ~ ' + ev.endDate + (ev.endTime ? ' ' + ev.endTime : '');
    }
    return text;
  }
  // 상세보기 모달의 "기간" 행은 날짜만 표시하고, 시작/종료 시간은 있을 때만 별도 행으로 보여준다.
  function formatPeriodDateOnly_(ev) {
    const sameDay = !ev.endDate || ev.endDate === ev.startDate;
    return sameDay ? ev.startDate : ev.startDate + ' ~ ' + ev.endDate;
  }
  function formatDate_(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function escapeHtml_(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.CalendarApp = { state, render: render_ };
})();
