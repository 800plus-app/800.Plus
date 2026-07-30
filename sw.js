/* service worker — offline cache.
   ONE place to bump on every deploy: REV. It names the cache *and* the asset query strings,
   so the URLs precached here are byte-for-byte the URLs index.html requests. When those drift
   apart the app silently keeps serving an old build — which is exactly what used to happen. */
const REV = '26';
const V = 'hw-v' + REV;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  `./app.js?v=${REV}`, `./data.js?v=${REV}`, `./data-en.js?v=${REV}`,
  `./leveltest.js?v=${REV}`, `./enrank.js?v=${REV}`,
  './supabase.min.js', './config.js', './store.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  // cache:'reload' bypasses the HTTP cache, so a new REV can never precache a stale file
  e.waitUntil(
    caches.open(V)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const cacheable = res => res && res.status === 200 && (res.type === 'basic' || res.type === 'cors');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;   // never touch extension schemes

  // Navigations: network-first, so a freshly deployed version is picked up on the next open
  // instead of one load late. Falls back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (cacheable(res)) { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(hit => hit || caches.match('./index.html'))
          .then(hit => hit || Response.error()))
    );
    return;
  }

  // Everything else: cache-first on the EXACT url (query included), refreshed in the background.
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (cacheable(res)) { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => cached || Response.error());
      return cached || net;
    })
  );
});
