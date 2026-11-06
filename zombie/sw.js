/* 도파민 좀비탈출 서비스워커 — 하나의 앱(허브 + 모든 모듈)이 인터넷 없이도 열리게.
   빌드가 438831ba50·/zombie/·["/zombie/", "/zombie/manifest.webmanifest", "/zombie/assets/icons/favicon.svg?v=1", "/zombie/assets/icons/favicon-32.png?v=1", "/zombie/assets/icons/apple-touch-icon.png?v=1", "/zombie/assets/fonts/plex-kr-400.woff2", "/zombie/assets/fonts/orbit-400.woff2", "/zombie/assets/z.css?v=ca6a4e0e", "/zombie/hub.css?v=7aa2ea44", "/zombie/starter/", "/zombie/switch/", "/zombie/switch/icon-192.png?v=1", "/zombie/starter/icon-192.png?v=1", "/zombie/split/", "/zombie/split/icon-192.png?v=1", "/zombie/roulette/", "/zombie/roulette/icon-192.png?v=1", "/zombie/promise/", "/zombie/promise/icon-192.png?v=1", "/zombie/assets/z.js?v=16171fb2", "/zombie/hub.js?v=af3dd054", "/zombie/promise/manifest.webmanifest", "/zombie/promise/favicon.svg?v=1", "/zombie/promise/favicon-32.png?v=1", "/zombie/promise/apple-touch-icon.png?v=1", "/zombie/promise/style.css?v=fa6fe930", "/zombie/promise/app.js?v=76debb10", "/zombie/roulette/manifest.webmanifest", "/zombie/roulette/favicon.svg?v=1", "/zombie/roulette/favicon-32.png?v=1", "/zombie/roulette/apple-touch-icon.png?v=1", "/zombie/roulette/style.css?v=4748e9dd", "/zombie/roulette/app.js?v=ccaa2c0a", "/zombie/split/manifest.webmanifest", "/zombie/split/favicon.svg?v=1", "/zombie/split/favicon-32.png?v=1", "/zombie/split/apple-touch-icon.png?v=1", "/zombie/split/style.css?v=a20f8e2b", "/zombie/split/app.js?v=2f9fd13c", "/zombie/starter/manifest.webmanifest", "/zombie/starter/favicon.svg?v=1", "/zombie/starter/favicon-32.png?v=1", "/zombie/starter/apple-touch-icon.png?v=1", "/zombie/starter/style.css?v=10c953d3", "/zombie/starter/app.js?v=97317870", "/zombie/switch/manifest.webmanifest", "/zombie/switch/favicon.svg?v=1", "/zombie/switch/favicon-32.png?v=1", "/zombie/switch/apple-touch-icon.png?v=1", "/zombie/switch/style.css?v=c7437b0f", "/zombie/switch/app.js?v=2d0d7c1a", "/zombie/assets/fonts/jua-400.woff2", "/zombie/assets/fonts/plex-kr-700.woff2", "/zombie/assets/fonts/space-grotesk-500.woff2", "/zombie/assets/fonts/space-grotesk-700.woff2"] 를 채운다. 화면(HTML)은 «인터넷 먼저 → 안 되면 저장본», 나머지는 «저장본 먼저». */
const VER = '438831ba50';
const BASE = '/zombie/';
const CACHE = 'zombie-' + VER;
const PRE = ["/zombie/", "/zombie/manifest.webmanifest", "/zombie/assets/icons/favicon.svg?v=1", "/zombie/assets/icons/favicon-32.png?v=1", "/zombie/assets/icons/apple-touch-icon.png?v=1", "/zombie/assets/fonts/plex-kr-400.woff2", "/zombie/assets/fonts/orbit-400.woff2", "/zombie/assets/z.css?v=ca6a4e0e", "/zombie/hub.css?v=7aa2ea44", "/zombie/starter/", "/zombie/switch/", "/zombie/switch/icon-192.png?v=1", "/zombie/starter/icon-192.png?v=1", "/zombie/split/", "/zombie/split/icon-192.png?v=1", "/zombie/roulette/", "/zombie/roulette/icon-192.png?v=1", "/zombie/promise/", "/zombie/promise/icon-192.png?v=1", "/zombie/assets/z.js?v=16171fb2", "/zombie/hub.js?v=af3dd054", "/zombie/promise/manifest.webmanifest", "/zombie/promise/favicon.svg?v=1", "/zombie/promise/favicon-32.png?v=1", "/zombie/promise/apple-touch-icon.png?v=1", "/zombie/promise/style.css?v=fa6fe930", "/zombie/promise/app.js?v=76debb10", "/zombie/roulette/manifest.webmanifest", "/zombie/roulette/favicon.svg?v=1", "/zombie/roulette/favicon-32.png?v=1", "/zombie/roulette/apple-touch-icon.png?v=1", "/zombie/roulette/style.css?v=4748e9dd", "/zombie/roulette/app.js?v=ccaa2c0a", "/zombie/split/manifest.webmanifest", "/zombie/split/favicon.svg?v=1", "/zombie/split/favicon-32.png?v=1", "/zombie/split/apple-touch-icon.png?v=1", "/zombie/split/style.css?v=a20f8e2b", "/zombie/split/app.js?v=2f9fd13c", "/zombie/starter/manifest.webmanifest", "/zombie/starter/favicon.svg?v=1", "/zombie/starter/favicon-32.png?v=1", "/zombie/starter/apple-touch-icon.png?v=1", "/zombie/starter/style.css?v=10c953d3", "/zombie/starter/app.js?v=97317870", "/zombie/switch/manifest.webmanifest", "/zombie/switch/favicon.svg?v=1", "/zombie/switch/favicon-32.png?v=1", "/zombie/switch/apple-touch-icon.png?v=1", "/zombie/switch/style.css?v=c7437b0f", "/zombie/switch/app.js?v=2d0d7c1a", "/zombie/assets/fonts/jua-400.woff2", "/zombie/assets/fonts/plex-kr-700.woff2", "/zombie/assets/fonts/space-grotesk-500.woff2", "/zombie/assets/fonts/space-grotesk-700.woff2"];

self.addEventListener('install', e => {
  // 🔴 필수 파일이 하나라도 안 받아지면 설치 실패 → 옛 판(정상 캐시)이 그대로 남는다
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zombie-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const fallback = async () => (await c.match(u.pathname)) || (await c.match(u.pathname + 'index.html')) || (await c.match(BASE));
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res && res.ok) { c.put(u.pathname, res.clone()); return res; }
        if (res && res.status >= 500) { const hit = await fallback(); if (hit) return hit; }   // 서버 고장이면 저장본으로(F8)
        return res;
      } catch (err) {
        return (await fallback()) || new Response('<meta charset=utf-8><p style="font-family:sans-serif;padding:20px">인터넷이 없어요. 한 번 연 화면만 다시 열 수 있어요.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);           // ?v=해시 까지 정확히 같은 것만(새 화면에 옛 코드가 붙지 않게)
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});
