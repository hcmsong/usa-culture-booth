// 서비스 워커: 처음 한 번 온라인에서 파일을 모두 기기 안에 저장하고, 그 뒤로는 저장본으로 연다.
// 문제·화면을 고치면 VERSION을 올린다(config.js VERSION과 같게).
const VERSION = 'v2';
const BUILD = '1794112230e9'; // 자산 내용 해시 — node tools/check.mjs --write 가 채운다(내용이 바뀌면 이 줄이 바뀌어 iPad가 새 판을 받는다)
const CACHE = 'usa-booth-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './questions.js',
  './core.js',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('usa-booth-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await cache.match('./');
      if (page) return page;
    }
    return fetch(req);
  })());
});
