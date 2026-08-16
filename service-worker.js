/**
 * PWA 설치(바로가기 생성) 조건을 만족시키기 위한 최소한의 서비스 워커.
 * 오프라인 캐싱은 하지 않고 항상 네트워크로 그대로 통과시킨다(구버전 정적 파일이
 * 캐시에 남아 갱신이 안 반영되는 문제를 피하기 위함).
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
