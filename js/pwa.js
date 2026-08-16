/**
 * "바로가기 만들기" 버튼 로직 (index.html)
 * PC(Chrome/Edge): beforeinstallprompt로 설치 대화상자를 띄우면 바탕화면/시작메뉴에 아이콘 생성.
 * Android(Chrome): 동일한 beforeinstallprompt로 홈 화면에 추가.
 * iOS Safari: beforeinstallprompt 미지원이라 "공유 → 홈 화면에 추가" 안내 모달을 띄운다.
 */
(function () {
  let deferredPrompt = null;
  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    els.installBtn = document.getElementById('installBtn');
    els.installModal = document.getElementById('installModal');
    els.installModalTitle = document.getElementById('installModalTitle');
    els.installModalBody = document.getElementById('installModalBody');
    if (!els.installBtn) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
    });

    // 모달 닫기(✕/확인 버튼, 배경 클릭)는 calendar.js가 [data-close-modal]/.modal-overlay를
    // 페이지 전체에 대해 이미 공통으로 처리한다.
    els.installBtn.addEventListener('click', onInstallClick_);
  }

  function isStandalone_() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function isIOS_() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  async function onInstallClick_() {
    if (isStandalone_()) {
      showInfo_('이미 바로가기로 실행 중이에요', '지금 화면이 이미 설치된 앱(또는 홈 화면 아이콘)에서 열려 있습니다.');
      return;
    }
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      await promptEvent.userChoice;
      return;
    }
    if (isIOS_()) {
      showInfo_('홈 화면에 추가하기 (iPhone・iPad)',
        '1. 화면 하단(또는 상단)의 <b>공유 버튼</b> <span style="font-size:15px;">⬆️</span> 을 누르세요.<br>' +
        '2. 메뉴에서 <b>"홈 화면에 추가"</b>를 선택하세요.<br>' +
        '3. 오른쪽 위 <b>"추가"</b>를 누르면 홈 화면에 아이콘이 생깁니다.');
      return;
    }
    showInfo_('바로가기 만들기',
      '사용 중인 브라우저에 따라 방법이 달라요.<br><br>' +
      '<b>💻 PC (Chrome / Edge)</b><br>주소창 오른쪽의 설치 아이콘을 클릭한 뒤 "설치"를 누르면 바탕화면・시작메뉴에 아이콘이 생성됩니다.<br><br>' +
      '<b>📱 Android</b><br>브라우저 메뉴(⋮)에서 "앱 설치" 또는 "홈 화면에 추가"를 선택하세요.<br><br>' +
      '<b>🌐 기타 브라우저</b><br>브라우저 메뉴에서 "홈 화면에 추가" 항목을 찾아보세요.');
  }

  function showInfo_(title, html) {
    els.installModalTitle.textContent = title;
    els.installModalBody.innerHTML = html;
    els.installModal.classList.remove('hidden');
  }
})();
