/* service worker — offline cache.
   ONE place to bump on every deploy: REV. It names the cache *and* the asset query strings,
   so the URLs precached here are byte-for-byte the URLs index.html requests. When those drift
   apart the app silently keeps serving an old build — which is exactly what used to happen. */
const REV = '42';
const V = 'hw-v' + REV;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  `./app.js?v=${REV}`, `./data.js?v=${REV}`, `./data-en.js?v=${REV}`,
  `./leveltest.js?v=${REV}`, `./leveltest-he.js?v=${REV}`, `./enrank.js?v=${REV}`,
  `./supabase.min.js?v=${REV}`, `./config.js?v=${REV}`, `./store.js?v=${REV}`,
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
    // only OUR old versions: CacheStorage is scoped per origin, and hagay-bot.github.io
    // hosts every Pages project of the account — the old filter wiped their caches too
    caches.keys().then(ks => Promise.all(
      ks.filter(k => k !== V && k.startsWith('hw-v')).map(k => caches.delete(k))))
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

  // A cache-busting probe must never be stored: renderBuildTag() asks for index.html with a
  // fresh ?probe= every render, and each one used to become its own permanent cache entry.
  if (url.searchParams.has('probe')) { e.respondWith(fetch(req)); return; }

  // Everything else: cache-first on the EXACT url (query included), refreshed in the background.
  // waitUntil is what makes the refresh real: respondWith resolves the moment the cached copy
  // is handed over, and the browser is then free to kill the worker — so an unheld revalidation
  // was routinely dropped, and the fuller the cache the more reliably it never ran.
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (cacheable(res)) { const cp = res.clone(); return caches.open(V).then(c => c.put(req, cp)).then(() => res); }
        return res;
      }).catch(() => cached || Response.error());
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
      return net;
    })
  );
});

/* ===== notifications =====
   Three delivery paths, because no single one works everywhere:
   1. periodicSync — installed PWA on Chrome/Android. Fires while the app is closed.
   2. push        — needs a server holding VAPID keys. The handler is ready; nothing sends yet.
   3. the page itself, on open. The only path iOS Safari gives us today.
   All three end at the same renderer so the wording never diverges. */
async function showDaily(payload) {
  const d = payload || {};
  const title = d.title || 'זמן ללמוד מילים';
  const body  = d.body  || 'תרגול קצר של חמש דקות שומר על הרצף.';
  return self.registration.showNotification(title, {
    body, dir: 'rtl', lang: 'he',
    icon: './icon-192.png', badge: './icon-192.png',
    tag: 'daily-study',            // a second reminder replaces the first instead of stacking
    renotify: false,
    data: { url: './' }
  });
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-study') e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async ws => {
      // if the app is already open the user is studying; a notification would be noise
      if (ws.some(w => w.visibilityState === 'visible')) return;
      const c = await caches.open(V);
      const r = await c.match('daily-msg');
      return showDaily(r ? await r.json() : null);
    })
  );
});

self.addEventListener('push', e => {
  let d = null;
  try { d = e.data ? e.data.json() : null; } catch (_) {}
  e.waitUntil(showDaily(d));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
