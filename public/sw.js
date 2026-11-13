// Service worker for the installed app. It deliberately caches almost nothing:
// every page and all data always come fresh from the network. Its one job is
// to show a friendly "You're offline" page instead of the browser's error
// screen when there is no connection. It also shows alerts on the device.
const CACHE = 'offline-v1';
const OFFLINE_FILES = ['/offline.html', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate') {
    // Page loads: network first, offline page only if the network fails.
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  if (request.method === 'GET' && new URL(request.url).pathname === '/logo.png') {
    event.respondWith(fetch(request).catch(() => caches.match('/logo.png')));
  }
  // Everything else goes straight to the network, untouched.
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
        return { title: 'You have ' + items.length + ' new assignments', body: first.title + (first.body ? ': ' + first.body : ''), href: '/my-tasks' };
      })
      .catch(() => fallback)
      .then((alert) =>
        self.registration.showNotification(alert.title, {
          body: alert.body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'assignments',
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
