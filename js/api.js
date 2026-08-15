/**
 * Google Apps Script 웹앱과 통신하는 래퍼.
 * APP_CONFIG.MOCK_MODE 가 켜져 있으면(배포 URL 미설정 시 자동) sessionStorage 기반의
 * 목(mock) 백엔드로 동작해 배포 전에도 화면을 확인할 수 있다.
 */
const Api = (function () {
  function delay_(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function list() {
    if (APP_CONFIG.MOCK_MODE) {
      await delay_(150);
      return mockEvents_();
    }
    const res = await fetch(APP_CONFIG.APPS_SCRIPT_URL + '?action=list');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '일정을 불러오지 못했습니다.');
    return data.events;
  }

  async function post_(payload) {
    if (APP_CONFIG.MOCK_MODE) {
      return mockPost_(payload);
    }
    const res = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      // Content-Type을 text/plain으로 보내야 Apps Script에서 CORS 프리플라이트 없이 처리됩니다.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '요청 처리에 실패했습니다.');
    return data;
  }

  function verifyAdmin(password) {
    return post_({ action: 'verifyAdmin', password }).then((d) => d.valid);
  }
  function verifyPrivate(password) {
    return post_({ action: 'verifyPrivate', password }).then((d) => d.valid);
  }
  function changePassword(adminPassword, target, newPassword) {
    return post_({ action: 'changePassword', adminPassword, target, newPassword });
  }
  function createEvent(adminPassword, event) {
    return post_({ action: 'create', adminPassword, event }).then((d) => d.event);
  }
  function updateEvent(adminPassword, event) {
    return post_({ action: 'update', adminPassword, event });
  }
  function deleteEvent(adminPassword, row) {
    return post_({ action: 'delete', adminPassword, row });
  }

  // ---------------- Mock backend (로컬 미리보기 전용) ----------------
  const MOCK_ADMIN_KEY = 'calendar_mock_adminPassword';
  const MOCK_PRIVATE_KEY = 'calendar_mock_privatePassword';
  const MOCK_EVENTS_KEY = 'calendar_mock_events';

  function mockEvents_() {
    let raw = sessionStorage.getItem(MOCK_EVENTS_KEY);
    if (!raw) {
      raw = JSON.stringify(window.MOCK_EVENTS || []);
      sessionStorage.setItem(MOCK_EVENTS_KEY, raw);
    }
    return JSON.parse(raw);
  }
  function saveMockEvents_(events) {
    sessionStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(events));
  }
  function mockPassword_(key) {
    return sessionStorage.getItem(key) || '2854';
  }

  // 캘린더 화면의 등록/수정/삭제는 관리자 비밀번호 또는 비공개 확인 비밀번호(연동) 둘 중 하나로 허용.
  function mockHasEditAccess_(password) {
    return password === mockPassword_(MOCK_ADMIN_KEY) || password === mockPassword_(MOCK_PRIVATE_KEY);
  }

  async function mockPost_(payload) {
    await delay_(120);
    const events = mockEvents_();
    switch (payload.action) {
      case 'verifyAdmin':
        return { ok: true, valid: payload.password === mockPassword_(MOCK_ADMIN_KEY) };
      case 'verifyPrivate':
        return { ok: true, valid: payload.password === mockPassword_(MOCK_PRIVATE_KEY) };
      case 'changePassword': {
        if (payload.adminPassword !== mockPassword_(MOCK_ADMIN_KEY)) return { ok: false, error: 'unauthorized' };
        const key = payload.target === 'private' ? MOCK_PRIVATE_KEY : MOCK_ADMIN_KEY;
        sessionStorage.setItem(key, payload.newPassword);
        return { ok: true };
      }
      case 'create': {
        if (!mockHasEditAccess_(payload.adminPassword)) return { ok: false, error: 'unauthorized' };
        const maxSeq = events.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
        const maxRow = events.reduce((m, e) => Math.max(m, Number(e._row) || 1), 1);
        const ev = Object.assign({}, payload.event, { seq: maxSeq + 1, _row: maxRow + 1 });
        events.push(ev);
        saveMockEvents_(events);
        return { ok: true, event: { _row: ev._row, seq: ev.seq } };
      }
      case 'update': {
        if (!mockHasEditAccess_(payload.adminPassword)) return { ok: false, error: 'unauthorized' };
        const idx = events.findIndex((e) => e._row === payload.event._row);
        if (idx >= 0) events[idx] = Object.assign({}, events[idx], payload.event);
        saveMockEvents_(events);
        return { ok: true };
      }
      case 'delete': {
        if (!mockHasEditAccess_(payload.adminPassword)) return { ok: false, error: 'unauthorized' };
        saveMockEvents_(events.filter((e) => e._row !== payload.row));
        return { ok: true };
      }
      default:
        return { ok: false, error: 'unknown action' };
    }
  }

  return { list, verifyAdmin, verifyPrivate, changePassword, createEvent, updateEvent, deleteEvent };
})();
