/* LASTFRM3 DARKROOM — Service Worker.
 * Zakres = katalog, w którym leży ten plik (nie cała strona CODE).
 * Strategia: precache powłoki aplikacji (index + zasoby z ./assets/), potem cache-first z odświeżaniem w tle.
 * Zdjęcia nigdy nie przechodzą przez sieć ani cache — przetwarzanie jest lokalne.
 * Ruszamy wyłącznie własne cache (prefiks "lf3-"). Zmień VERSION przy wydaniu, by wymusić aktualizację. */
const VERSION = 'v1';
const CACHE = `lf3-shell-${VERSION}`;
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(BASE, { cache: 'reload' });
    const html = await res.clone().text();
    const urls = new Set([BASE, 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']);
    for (const m of html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+|\/[^"]*assets\/[^"]+)"/g)) urls.add(m[1]);
    await cache.put(BASE, res);
    await Promise.all([...urls].filter((u) => u !== BASE).map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('lf3-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { event.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') { const shell = await cache.match(BASE); if (shell) return shell; }
    return new Response('Offline', { status: 503 });
  })());
});
