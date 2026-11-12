self.addEventListener('notificationclick', (event) => {
  const noticeId = event.notification.data?.noticeId;
  const taskId = event.notification.data?.taskId;
  const workspaceId = event.notification.data?.workspaceId;
  event.notification.close();
  if (typeof noticeId !== 'string' || !noticeId) return;

  event.waitUntil((async () => {
    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const inScope = openClients.filter((client) => client.url.startsWith(self.registration.scope));

    if (inScope.length > 0) {
      await inScope[0].focus();
      inScope[0].postMessage({ type: 'stackflow:notice-open', noticeId, taskId, workspaceId });
      return;
    }

    const url = new URL(self.registration.scope);
    url.searchParams.set('notice', noticeId);
    if (typeof taskId === 'string') url.searchParams.set('task', taskId);
    if (typeof workspaceId === 'string') url.searchParams.set('workspace', workspaceId);
    await self.clients.openWindow(url.href);
  })());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    const payload = event.data.json();
    if (typeof payload?.title !== 'string' || typeof payload?.data?.noticeId !== 'string') return;
    await self.registration.showNotification(payload.title, {
      body: typeof payload.body === 'string' ? payload.body : '',
      tag: payload.data.noticeId,
      icon: new URL('icon.svg', self.registration.scope).href,
      data: payload.data,
    });
  })());
});
