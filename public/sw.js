/**
 * Service Worker minimale — solo Web Push (nessuna cache aggressiva).
 */
self.addEventListener('push', (event) => {
    let payload = {
        title: 'FloreMoria Staff',
        body: 'Nuovo messaggio WhatsApp',
        url: '/dashboard/communications',
        tag: 'fm-whatsapp',
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            payload = { ...payload, ...parsed };
        }
    } catch {
        const text = event.data?.text?.();
        if (text) payload.body = text;
    }

    const options = {
        body: payload.body,
        icon: '/icon-v2.png',
        badge: '/apple-icon-v2.png',
        tag: payload.tag || 'fm-whatsapp',
        renotify: true,
        silent: false,
        data: {
            url: payload.url || '/dashboard/communications',
        },
    };

    event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/dashboard/communications';
    const absoluteUrl = new URL(targetUrl, self.location.origin).href;

    event.waitUntil(
        clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                for (const client of windowClients) {
                    if (client.url.includes('/dashboard/communications') && 'focus' in client) {
                        return client.focus();
                    }
                }
                for (const client of windowClients) {
                    if ('focus' in client) {
                        client.navigate(absoluteUrl);
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(absoluteUrl);
                }
                return undefined;
            })
    );
});
