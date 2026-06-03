self.addEventListener('push', (e) => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { return; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'New Order', {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'order-' + (data.orderId || Date.now()),
      renotify: true,
      requireInteraction: true,
      data: { orderId: data.orderId },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const adminUrl = new URL('/admin.html', self.location.origin).href;
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'open-orders' });
          return;
        }
      }
      return clients.openWindow(adminUrl + '?openOrders=1');
    })
  );
});
