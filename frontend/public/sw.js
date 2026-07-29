self.addEventListener('push', function (event) {
    if (!(self.Notification && self.Notification.permission === 'granted')) {
        return;
    }

    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Besouhola CRM', body: event.data ? event.data.text() : '' };
    }
    const title = data.title || 'New Notification';
    const message = data.body || data.message || '';
    const icon = data.icon || '/favicon.svg';
    const tag = data.tag || 'general';
    const url = data.url || data.action_url || data.link || '/notifications';

    event.waitUntil(
        self.registration.showNotification(title, {
            body: message,
            icon: icon,
            tag: tag,
            data: { ...data, url },
            actions: data.actions || []
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const notificationData = event.notification.data || {};
    const urlToOpen = notificationData.url || '/notifications';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
