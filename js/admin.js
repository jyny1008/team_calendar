/**
 * 관리자페이지 로직 (admin.html)
 */
(function () {
  const state = {
    adminPassword: null,
    events: [],
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth() + 1,
    editingRow: null,
    editingSeq: null
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheEls_();
    bindEvents_();
  }

  function cacheEls_() {
    els.loginGate = document.getElementById('loginGate');
    els.loginForm = document.getElementById('loginForm');
    els.loginPassword = document.getElementById('loginPassword');
    els.loginError = document.getElementById('loginError');
    els.adminShell = document.getElementById('adminShell');
    els.logoutBtn = document.getElementById('logoutBtn');

    els.adminPrevBtn = document.getElementById('adminPrevBtn');
    els.adminNextBtn = document.getElementById('adminNextBtn');
    els.adminMonthLabel = document.getElementById('adminMonthLabel');
    els.tableMonthLabel = document.getElementById('tableMonthLabel');
    els.tablePrevBtn = document.getElementById('tablePrevBtn');
    els.tableNextBtn = document.getElementById('tableNextBtn');
    els.tablePdfBtn = document.getElementById('tablePdfBtn');
    els.tableExcelBtn = document.getElementById('tableExcelBtn');

    els.exportPdfBtn = document.getElementById('exportPdfBtn');
    els.exportExcelBtn = document.getElementById('exportExcelBtn');
    els.exportOfflineBtn = document.getElementById('exportOfflineBtn');

    els.eventForm = document.getElementById('eventForm');
    els.eventRow = document.getElementById('eventRow');
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
    els.fNote = document.getElementById('fNote');
    els.formTitle = document.getElementById('formTitle');
    els.submitBtn = document.getElementById('submitBtn');
    els.resetFormBtn = document.getElementById('resetFormBtn');

    els.eventTableBody = document.getElementById('eventTableBody');

    els.orgColorRows = document.getElementById('orgColorRows');
    els.newOrgName = document.getElementById('newOrgName');
    els.newOrgColor = document.getElementById('newOrgColor');
    els.addOrgBtn = document.getElementById('addOrgBtn');
    els.privateColorInput = document.getElementById('privateColorInput');
    els.savePrivateColorBtn = document.getElementById('savePrivateColorBtn');

    els.adminPwForm = document.getElementById('adminPwForm');
    els.newAdminPw = document.getElementById('newAdminPw');
    els.privatePwForm = document.getElementById('privatePwForm');
    els.newPrivatePw = document.getElementById('newPrivatePw');

    els.loadingOverlay = document.getElementById('loadingOverlay');
    els.toast = document.getElementById('toast');
  }

  function bindEvents_() {
    els.loginForm.addEventListener('submit', onLogin_);
    els.logoutBtn.addEventListener('click', logout_);

    els.adminPrevBtn.addEventListener('click', () => changeMonth_(-1));
    els.adminNextBtn.addEventListener('click', () => changeMonth_(1));
    els.tablePrevBtn.addEventListener('click', () => changeMonth_(-1));
    els.tableNextBtn.addEventListener('click', () => changeMonth_(1));

    els.exportPdfBtn.addEventListener('click', () => {
      ExportTools.printMonth(state.viewYear, state.viewMonth, filterEventsForMonth_(state.viewYear, state.viewMonth, state.events));
    });
    els.exportExcelBtn.addEventListener('click', () => {
      ExportTools.exportExcel(state.viewYear, state.viewMonth, filterEventsForMonth_(state.viewYear, state.viewMonth, state.events));
    });
    els.exportOfflineBtn.addEventListener('click', () => {
      ExportTools.downloadOfflineHtml(state.viewYear, state.viewMonth, filterEventsForMonth_(state.viewYear, state.viewMonth, state.events));
      toast_('오프라인 HTML 파일을 생성했습니다.');
    });
    els.tablePdfBtn.addEventListener('click', () => {
      ExportTools.printEventTable(state.viewYear, state.viewMonth, filterEventsForMonth_(state.viewYear, state.viewMonth, state.events));
    });
    els.tableExcelBtn.addEventListener('click', () => {
      ExportTools.exportExcel(state.viewYear, state.viewMonth, filterEventsForMonth_(state.viewYear, state.viewMonth, state.events));
    });

    els.fColorDefault.addEventListener('change', () => {
      els.fColor.disabled = els.fColorDefault.checked;
    });

    els.eventForm.addEventListener('submit', onSubmitEvent_);
    els.resetFormBtn.addEventListener('click', resetForm_);

    els.addOrgBtn.addEventListener('click', onAddOrg_);
    els.savePrivateColorBtn.addEventListener('click', onSavePrivateColor_);

    els.adminPwForm.addEventListener('submit', (e) => onChangePassword_(e, 'admin', els.newAdminPw));
    els.privatePwForm.addEventListener('submit', (e) => onChangePassword_(e, 'private', els.newPrivatePw));
  }

  async function onLogin_(e) {
    e.preventDefault();
    const pw = els.loginPassword.value.trim();
    if (!pw) return;
    showLoading_(true);
    try {
      const ok = await Api.verifyAdmin(pw);
      if (ok) {
        state.adminPassword = pw;
        els.loginGate.classList.add('hidden');
        els.adminShell.classList.remove('hidden');
        await loadEvents_();
      } else {
        els.loginError.textContent = '비밀번호가 올바르지 않습니다.';
      }
    } catch (err) {
      els.loginError.textContent = err.message;
    } finally {
      showLoading_(false);
    }
  }

  function logout_() {
    state.adminPassword = null;
    els.loginPassword.value = '';
    els.loginError.textContent = '';
    els.adminShell.classList.add('hidden');
    els.loginGate.classList.remove('hidden');
  }

  async function loadEvents_() {
    showLoading_(true);
    try {
      const res = await Api.list();
      state.events = res.events;
      APP_CONFIG.applyOrgConfig(res.orgConfig);
    } catch (err) {
      toast_(err.message, true);
      state.events = [];
    }
    showLoading_(false);
    populateOrgDatalist_();
    renderOrgColorRows_();
    renderMonthLabel_();
    renderTable_();
  }

  function populateOrgDatalist_() {
    const dl = document.getElementById('orgOptions');
    if (!dl) return;
    dl.innerHTML = APP_CONFIG.ORG_ORDER.map((o) => '<option value="' + escapeHtml_(o) + '">').join('');
  }

  function renderOrgColorRows_() {
    els.orgColorRows.innerHTML = APP_CONFIG.ORG_ORDER.map((org) => {
      const color = APP_CONFIG.getOrgColor(org);
      return '<div class="org-color-row" data-org="' + escapeHtml_(org) + '">' +
        '<span class="org-color-name">' + escapeHtml_(org) + '</span>' +
        '<input type="color" class="org-color-input" value="' + color + '">' +
        '<button type="button" class="btn small org-color-save">저장</button>' +
        '</div>';
    }).join('');
    els.orgColorRows.querySelectorAll('.org-color-row').forEach((row) => {
      const org = row.dataset.org;
      const input = row.querySelector('.org-color-input');
      const saveBtn = row.querySelector('.org-color-save');
      saveBtn.addEventListener('click', () => onSaveOrgColor_(org, input.value));
    });
    els.privateColorInput.value = APP_CONFIG.PRIVATE_COLOR;
  }

  async function onSaveOrgColor_(org, color) {
    showLoading_(true);
    try {
      const cfg = await Api.updateOrgColor(state.adminPassword, org, color);
      APP_CONFIG.applyOrgConfig(cfg);
      renderTable_();
      toast_('"' + org + '" 색상을 저장했습니다.');
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  async function onSavePrivateColor_() {
    showLoading_(true);
    try {
      const cfg = await Api.updatePrivateColor(state.adminPassword, els.privateColorInput.value);
      APP_CONFIG.applyOrgConfig(cfg);
      toast_('비공개 일정 색상을 저장했습니다.');
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  async function onAddOrg_() {
    const name = els.newOrgName.value.trim();
    if (!name) {
      toast_('새 주관명을 입력하세요.', true);
      return;
    }
    showLoading_(true);
    try {
      const cfg = await Api.addOrg(state.adminPassword, name, els.newOrgColor.value);
      APP_CONFIG.applyOrgConfig(cfg);
      els.newOrgName.value = '';
      populateOrgDatalist_();
      renderOrgColorRows_();
      toast_('"' + name + '" 주관을 추가했습니다.');
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  function changeMonth_(delta) {
    let m = state.viewMonth + delta;
    let y = state.viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    state.viewMonth = m;
    state.viewYear = y;
    renderMonthLabel_();
    renderTable_();
  }

  function renderMonthLabel_() {
    const label = state.viewYear + '년 ' + state.viewMonth + '월';
    els.adminMonthLabel.textContent = label;
    els.tableMonthLabel.textContent = label;
  }

  function renderTable_() {
    const list = filterEventsForMonth_(state.viewYear, state.viewMonth, state.events)
      .slice()
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

    els.eventTableBody.innerHTML = '';
    if (list.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">해당 월에 등록된 일정이 없습니다.</td>';
      els.eventTableBody.appendChild(tr);
      return;
    }

    list.forEach((ev) => {
      const tr = document.createElement('tr');
      const period = formatPeriod_(ev);
      const color = ev.color || APP_CONFIG.getOrgColor(ev.org);
      tr.innerHTML =
        '<td>' + escapeHtml_(period) + '</td>' +
        '<td><span class="swatch" style="background:' + color + '"></span>' + escapeHtml_(ev.org || '-') + '</td>' +
        '<td>' + escapeHtml_(ev.title) + '</td>' +
        '<td>' + escapeHtml_(ev.location || '-') + '</td>' +
        '<td>' + escapeHtml_(ev.manager || '-') + '</td>' +
        '<td><span class="tag ' + (ev.visibility === '비공개' ? 'visibility-private' : 'visibility-public') + '">' + escapeHtml_(ev.visibility || '공개') + '</span></td>' +
        '<td class="row-actions"></td>';
      const actionsTd = tr.querySelector('.row-actions');
      const editBtn = document.createElement('button');
      editBtn.className = 'btn small';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', () => editEvent_(ev));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn small danger';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => onDelete_(ev));
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
      els.eventTableBody.appendChild(tr);
    });
  }

  function editEvent_(ev) {
    state.editingRow = ev._row;
    state.editingSeq = ev.seq;
    els.eventRow.value = ev._row;
    els.fStartDate.value = ev.startDate || '';
    els.fStartTime.value = ev.startTime || '';
    els.fEndDate.value = ev.endDate || '';
    els.fEndTime.value = ev.endTime || '';
    els.fTitle.value = ev.title || '';
    els.fLocation.value = ev.location || '';
    els.fOrg.value = ev.org || '';
    els.fAudience.value = ev.audience || '';
    els.fManager.value = ev.manager || '';
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
    els.formTitle.textContent = '✏️ 일정 수정';
    els.submitBtn.textContent = '수정 저장';
    els.eventForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm_() {
    state.editingRow = null;
    state.editingSeq = null;
    els.eventForm.reset();
    els.eventRow.value = '';
    els.fColor.disabled = true;
    els.formTitle.textContent = '➕ 일정 등록';
    els.submitBtn.textContent = '등록';
  }

  async function onSubmitEvent_(e) {
    e.preventDefault();
    if (!els.fStartDate.value || !els.fTitle.value.trim() || !els.fOrg.value.trim()) {
      toast_('시작일 / 행사명 / 주관은 필수입니다.', true);
      return;
    }
    if (els.fEndDate.value && els.fEndDate.value < els.fStartDate.value) {
      toast_('종료일은 시작일보다 빠를 수 없습니다.', true);
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
      note: els.fNote.value.trim(),
      color: els.fColorDefault.checked ? '' : els.fColor.value
    };

    showLoading_(true);
    try {
      if (state.editingRow) {
        event._row = state.editingRow;
        event.seq = state.editingSeq;
        await Api.updateEvent(state.adminPassword, event);
        toast_('일정을 수정했습니다.');
      } else {
        await Api.createEvent(state.adminPassword, event);
        toast_('일정을 등록했습니다.');
      }
      resetForm_();
      await loadEvents_();
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  async function onDelete_(ev) {
    if (!confirm('"' + ev.title + '" 일정을 삭제할까요?')) return;
    showLoading_(true);
    try {
      await Api.deleteEvent(state.adminPassword, ev._row);
      toast_('일정을 삭제했습니다.');
      await loadEvents_();
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  async function onChangePassword_(e, target, inputEl) {
    e.preventDefault();
    const newPw = inputEl.value.trim();
    if (!newPw) return;
    showLoading_(true);
    try {
      await Api.changePassword(state.adminPassword, target, newPw);
      if (target === 'admin') state.adminPassword = newPw;
      inputEl.value = '';
      toast_((target === 'admin' ? '관리자' : '비공개 확인') + ' 비밀번호를 변경했습니다.');
    } catch (err) {
      toast_(err.message, true);
    } finally {
      showLoading_(false);
    }
  }

  function filterEventsForMonth_(year, month, events) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    return events.filter((ev) => {
      if (!ev.startDate) return false;
      const s = parseDate_(ev.startDate);
      const en = ev.endDate ? parseDate_(ev.endDate) : s;
      if (!s || !en) return false;
      return s <= monthEnd && en >= monthStart;
    });
  }

  function parseDate_(s) {
    if (!s) return null;
    const p = s.split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
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

  function showLoading_(show) { els.loadingOverlay.classList.toggle('hidden', !show); }

  let toastTimer = null;
  function toast_(msg, isError) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function escapeHtml_(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
