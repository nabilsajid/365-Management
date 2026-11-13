// Service worker for the installed app. It deliberately caches almost nothing:
// every page and all data always come fresh from the network. Its one job is
// to show a friendly "You're offline" page instead of the browser's error
// screen when there is no connection.
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
