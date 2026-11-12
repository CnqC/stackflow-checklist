self.addEventListener('notificationclick', (event) => {
  const noticeId = event.notification.data?.noticeId;
  event.notification.close();
  if (typeof noticeId !== 'string' || !noticeId) return;

  event.waitUntil((async () => {
    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const inScope = openClients.filter((client) => client.url.startsWith(self.registration.scope));

    if (inScope.length > 0) {
      await inScope[0].focus();
      inScope[0].postMessage({ type: 'stackflow:notice-open', noticeId });
      return;
    }

    const url = new URL(self.registration.scope);
    url.searchParams.set('notice', noticeId);
    await self.clients.openWindow(url.href);
  })());
});
