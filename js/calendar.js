/**
 * 공개 캘린더 화면 로직 (index.html)
 */
(function () {
  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1, // 1-12
    events: [],
    orgs: [],
    activeOrgs: new Set(),
    privateChecked: false
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls_();
    bindStaticEvents_();
    showLoading_(true);
    try {
      state.events = await Api.list();
    } catch (err) {
      toast_(err.message, true);
      state.events = [];
    }
    showLoading_(false);
    buildOrgFilters_();
    state.privateChecked = sessionStorage.getItem('calendar_privateUnlocked') === '1';
    els.privateToggle.checked = state.privateChecked;
    updatePrivateToggleUi_();
    render_();
  }

  function cacheEls_() {
    els.monthLabel = document.getElementById('monthLabel');
    els.prevBtn = document.getElementById('prevMonthBtn');
    els.nextBtn = document.getElementById('nextMonthBtn');
    els.todayBtn = document.getElementById('todayBtn');
    els.orgFilters = document.getElementById('orgFilters');
    els.selectAllToggle = document.getElementById('selectAllToggle');
    els.selectAllLabel = document.getElementById('selectAllLabel');
    els.privateToggle = document.getElementById('privateToggle');
    els.privateLabel = document.getElementById('privateLabel');
    els.calendarBody = document.getElementById('calendarBody');
    els.detailModal = document.getElementById('detailModal');
    els.detailBody = document.getElementById('detailBody');
    els.detailTitle = document.getElementById('detailTitle');
    els.passwordModal = document.getElementById('passwordModal');
    els.passwordInput = document.getElementById('passwordInput');
    els.passwordError = document.getElementById('passwordError');
    els.loadingOverlay = document.getElementById('loadingOverlay');
    els.toast = document.getElementById('toast');
  }

  function bindStaticEvents_() {
    els.prevBtn.addEventListener('click', () => changeMonth_(-1));
    els.nextBtn.addEventListener('click', () => changeMonth_(1));
    els.todayBtn.addEventListener('click', () => {
      const now = new Date();
      state.year = now.getFullYear();
      state.month = now.getMonth() + 1;
      render_();
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

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => closeModal_(e.target.closest('.modal-overlay')));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal_(overlay); });
    });

    document.getElementById('passwordForm').addEventListener('submit', onPasswordSubmit_);
  }

  function changeMonth_(delta) {
    let m = state.month + delta;
    let y = state.year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    state.month = m;
    state.year = y;
    render_();
  }

  function buildOrgFilters_() {
    const set = new Set();
    state.events.forEach((e) => { if (e.org) set.add(e.org); });
    const known = ['중등교육', '직업교육', '중등인사', '진로진학'];
    const orgs = known.filter((o) => set.has(o)).concat([...set].filter((o) => !known.includes(o)));
    state.orgs = orgs;
    orgs.forEach((o) => state.activeOrgs.add(o));

    els.orgFilters.innerHTML = '';
    orgs.forEach((org) => {
      const id = 'org_' + org;
      const label = document.createElement('label');
      label.className = 'chip-checkbox active';
      label.htmlFor = id;
      label.innerHTML =
        '<input type="checkbox" id="' + id + '" checked>' +
        '<span class="dot" style="background:' + APP_CONFIG.getOrgColor(org) + '"></span>' +
        escapeHtml_(org);
      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        if (input.checked) state.activeOrgs.add(org); else state.activeOrgs.delete(org);
        label.classList.toggle('active', input.checked);
        syncSelectAllToggle_();
        render_();
      });
      els.orgFilters.appendChild(label);
    });
  }

  function syncOrgCheckboxes_() {
    els.orgFilters.querySelectorAll('label').forEach((label) => {
      const input = label.querySelector('input');
      const org = input.id.replace('org_', '');
      input.checked = state.activeOrgs.has(org);
      label.classList.toggle('active', input.checked);
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
      openPasswordModal_();
    } else {
      state.privateChecked = false;
      render_();
      updatePrivateToggleUi_();
    }
  }

  function openPasswordModal_() {
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
        sessionStorage.setItem('calendar_privateUnlocked', '1');
        els.privateToggle.checked = true;
        closeModal_(els.passwordModal);
        updatePrivateToggleUi_();
        render_();
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
    els.monthLabel.textContent = state.year + '년 ' + state.month + '월';

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

      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if (!inMonth) cell.classList.add('outside');
      if (dateStr === todayStr) cell.classList.add('today');
      if (dow === 0) cell.classList.add('sun');
      if (dow === 6) cell.classList.add('sat');

      const num = document.createElement('span');
      num.className = 'day-num';
      num.textContent = cellDate.getDate();
      cell.appendChild(num);

      const list = document.createElement('div');
      list.className = 'event-list';
      const dayEvents = (eventsByDate[dateStr] || []).filter(passesFilter_);
      dayEvents.forEach((ev) => list.appendChild(buildChip_(ev)));
      cell.appendChild(list);

      els.calendarBody.appendChild(cell);
    }
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
    const color = ev.color || APP_CONFIG.getOrgColor(ev.org);
    btn.style.borderLeftColor = color;
    if (!isPrivate) {
      btn.style.backgroundColor = hexToRgba_(color, 0.14);
    }
    btn.addEventListener('click', () => openDetail_(ev));
    return btn;
  }

  function openDetail_(ev) {
    els.detailTitle.textContent = ev.title;
    const period = ev.endDate && ev.endDate !== ev.startDate
      ? ev.startDate + ' ~ ' + ev.endDate
      : ev.startDate;
    const visTag = ev.visibility === '비공개'
      ? '<span class="tag visibility-private">비공개</span>'
      : '<span class="tag visibility-public">공개</span>';
    els.detailBody.innerHTML =
      '<div class="detail-row"><div class="k">기간</div><div class="v">' + escapeHtml_(period) + '</div></div>' +
      '<div class="detail-row"><div class="k">주관</div><div class="v">' + escapeHtml_(ev.org || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">장소</div><div class="v">' + escapeHtml_(ev.location || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">참가대상</div><div class="v">' + escapeHtml_(ev.audience || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">담당자</div><div class="v">' + escapeHtml_(ev.manager || '-') + '</div></div>' +
      '<div class="detail-row"><div class="k">공개여부</div><div class="v">' + visTag + '</div></div>' +
      '<div class="detail-row"><div class="k">비고</div><div class="v">' + escapeHtml_(ev.note || '-') + '</div></div>';
    els.detailModal.classList.remove('hidden');
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
  function formatDate_(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function hexToRgba_(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }
  function escapeHtml_(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.CalendarApp = { state, render: render_ };
})();
