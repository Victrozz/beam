self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch {}
  e.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'Beam', {
      body: data.body || '',
      tag: data.id || 'beam',
      data: { id: data.id },
      icon: '/icon-192.png',
    });
    // If the app is open, refresh its list right away.
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'refresh' });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) {
      wins[0].postMessage({ type: 'open', id });
      return wins[0].focus();
    }
    return self.clients.openWindow(id ? `/?item=${encodeURIComponent(id)}` : '/');
  })());
});
