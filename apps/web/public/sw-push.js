self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'EduPod Alert', {
      badge: data.badge || '/badge-72.png',
      body: data.body || '',
      data: data.data || {},
      icon: data.icon || '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/en/admin/alerts'));
});
