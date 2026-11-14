// Service worker for the installed app.
//
// Online, every page and all data come fresh from the network, exactly as
// before. What this adds is a copy on the device: each page that loads is
// saved, so that without a connection the last saved copy opens instead of an
// error. Nothing here ever sends data; changes made offline are queued by the
// app itself (src/lib/offline-queue.ts). It also shows alerts on the device.
const SHELL = 'offline-v2';
const PAGES = 'pages-v1';
const STATIC = 'static-v1';
const OFFLINE_FILES = ['/offline.html', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(OFFLINE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL, PAGES, STATIC];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The app's own code and images never change once built, so the saved copy is used first.
function staticFirst(request) {
  return caches.open(STATIC).then((cache) =>
    cache.match(request).then(
      (saved) =>
        saved ||
        fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }),
    ),
  );
}

// A page: the network first, and a copy saved for later. Without a connection
// (or when it is too slow to answer) the saved copy, else the offline page.
function pageFreshFirst(request, key) {
  return caches.open(PAGES).then((cache) =>
    cache.match(key).then((saved) => {
      const fromNetwork = fetch(request).then((response) => {
        const html = (response.headers.get('content-type') || '').includes('text/html');
        // A redirect means "sign in first"; that is never saved as the page.
        if (response.ok && !response.redirected && response.type === 'basic' && html) cache.put(key, response.clone());
        return response;
      });
      // No copy of this exact address (a different tab or filter): the same page saved
      // with any other filter is better than nothing.
      const fallback = () =>
        saved || cache.match(key, { ignoreSearch: true }).then((other) => other || caches.match('/offline.html'));
      if (!saved) return fromNetwork.catch(fallback);
      // With a saved copy in hand, a connection that hangs is not waited on forever.
      const tooSlow = new Promise((resolve) => setTimeout(() => resolve(saved), 7000));
      return Promise.race([fromNetwork.catch(() => saved), tooSlow]);
    }),
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Signing out removes the saved pages, so the next person on this device cannot open them.
  if (request.method === 'POST' && url.pathname === '/auth/signout') {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (request.method !== 'GET') return;

  const path = url.pathname;
  if (path.startsWith('/_next/static/') || path.startsWith('/icons/') || path === '/logo.png' || path === '/logo-mark.png') {
    event.respondWith(staticFirst(request));
    return;
  }

  // Data requests and the sign-in pages always go to the network.
  if (path.startsWith('/api/') || path.startsWith('/auth') || path.startsWith('/login')) {
    if (request.mode === 'navigate') event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // In-app page changes ask for a data-only version of the page; those are not
  // saved. When one fails offline the app falls back to a normal page load,
  // which is answered from the saved copy below.
  const dataOnly = request.headers.has('rsc') || url.searchParams.has('_rsc') || request.headers.has('next-router-prefetch');
  const wantsPage = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage && !dataOnly) {
    event.respondWith(pageFreshFirst(request, path + url.search));
  }
});

// Alerts on the device. A push carries no text: it only says "something is new",
// and the worker asks the app what it is (signed in as whoever uses this device).
self.addEventListener('push', (event) => {
  const fallback = { title: '365 Frames', body: 'You have something new. Open the app to see it.', href: '/my-tasks' };
  event.waitUntil(
    fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const items = (result && result.data) || [];
        if (items.length === 0) return fallback;
        const first = items[0];
        if (items.length === 1) return { title: first.title, body: first.body || '', href: first.href || '/my-tasks' };
        return { title: items.length + ' new things for you', body: first.title + (first.body ? ': ' + first.body : ''), href: '/my-tasks' };
      })
      .catch(() => fallback)
      .then((alert) =>
        self.registration.showNotification(alert.title, {
          body: alert.body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'updates',
          renotify: true,
          data: { href: alert.href },
        }),
      ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/my-tasks';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(href).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
