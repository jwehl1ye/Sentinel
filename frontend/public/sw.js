// Service Worker for SafeStream
// Handles push notifications, offline caching, and background sync

const CACHE_NAME = 'safestream-v2.0.0'
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...')
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS)
        })
    )
    self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...')
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        })
    )
    self.clients.claim()
})

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return

    // Skip API requests (always go to network)
    if (event.request.url.includes('/api/')) return

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached response and update cache in background
                event.waitUntil(
                    fetch(event.request).then((networkResponse) => {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse)
                        })
                    }).catch(() => { })
                )
                return cachedResponse
            }

            // Not in cache, try network
            return fetch(event.request).then((networkResponse) => {
                // Cache the response for future
                if (networkResponse.status === 200) {
                    const responseClone = networkResponse.clone()
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone)
                    })
                }
                return networkResponse
            }).catch(() => {
                // Network failed, return offline page if available
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html')
                }
                return new Response('Offline', { status: 503 })
            })
        })
    )
})

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received')

    let data = { title: 'SafeStream', body: 'You have a new notification' }

    if (event.data) {
        try {
            data = event.data.json()
        } catch (e) {
            data.body = event.data.text()
        }
    }

    const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'safestream-notification',
        renotify: true,
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [
            { action: 'open', title: 'Open App' },
            { action: 'dismiss', title: 'Dismiss' }
        ],
        data: data.data || {}
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    )
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action)

    event.notification.close()

    const action = event.action
    const data = event.notification.data

    if (action === 'dismiss') {
        return
    }

    // Default action - open app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus()
                    if (data.url) {
                        client.navigate(data.url)
                    }
                    return
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow(data.url || '/')
            }
        })
    )
})

// Background sync for offline recordings
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag)

    if (event.tag === 'sync-recordings') {
        event.waitUntil(syncRecordings())
    }

    if (event.tag === 'sync-alerts') {
        event.waitUntil(syncAlerts())
    }
})

async function syncRecordings() {
    try {
        // Get queued recordings from IndexedDB
        const db = await openDB()
        const recordings = await db.getAll('offline-recordings')

        for (const recording of recordings) {
            try {
                const response = await fetch('/api/recordings/upload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${recording.token}`
                    },
                    body: recording.formData
                })

                if (response.ok) {
                    await db.delete('offline-recordings', recording.id)
                    console.log('[SW] Synced recording:', recording.id)
                }
            } catch (err) {
                console.error('[SW] Failed to sync recording:', err)
            }
        }
    } catch (err) {
        console.error('[SW] Sync recordings failed:', err)
    }
}

async function syncAlerts() {
    try {
        // Get queued alerts from IndexedDB
        const db = await openDB()
        const alerts = await db.getAll('offline-alerts')

        for (const alert of alerts) {
            try {
                const response = await fetch('/api/stream/start', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${alert.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(alert.data)
                })

                if (response.ok) {
                    await db.delete('offline-alerts', alert.id)
                    console.log('[SW] Synced alert:', alert.id)
                }
            } catch (err) {
                console.error('[SW] Failed to sync alert:', err)
            }
        }
    } catch (err) {
        console.error('[SW] Sync alerts failed:', err)
    }
}

// Simple IndexedDB helper
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('safestream-offline', 1)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
            const db = request.result
            resolve({
                getAll: (store) => new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readonly')
                    const req = tx.objectStore(store).getAll()
                    req.onsuccess = () => res(req.result)
                    req.onerror = () => rej(req.error)
                }),
                delete: (store, key) => new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite')
                    const req = tx.objectStore(store).delete(key)
                    req.onsuccess = () => res()
                    req.onerror = () => rej(req.error)
                })
            })
        }

        request.onupgradeneeded = (event) => {
            const db = event.target.result
            if (!db.objectStoreNames.contains('offline-recordings')) {
                db.createObjectStore('offline-recordings', { keyPath: 'id' })
            }
            if (!db.objectStoreNames.contains('offline-alerts')) {
                db.createObjectStore('offline-alerts', { keyPath: 'id' })
            }
        }
    })
}

console.log('[SW] Service worker loaded')
