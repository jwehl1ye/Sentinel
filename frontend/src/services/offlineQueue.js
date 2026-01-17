// Offline Queue Service
// Handles offline storage and syncing of recordings and alerts

class OfflineQueue {
    constructor() {
        this.dbName = 'safestream-offline'
        this.dbVersion = 1
        this.db = null
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion)

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error)
                reject(request.error)
            }

            request.onsuccess = () => {
                this.db = request.result
                console.log('IndexedDB initialized')
                resolve(true)
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result

                // Offline recordings store
                if (!db.objectStoreNames.contains('offline-recordings')) {
                    const recordingsStore = db.createObjectStore('offline-recordings', {
                        keyPath: 'id',
                        autoIncrement: true
                    })
                    recordingsStore.createIndex('timestamp', 'timestamp')
                }

                // Offline alerts store
                if (!db.objectStoreNames.contains('offline-alerts')) {
                    const alertsStore = db.createObjectStore('offline-alerts', {
                        keyPath: 'id',
                        autoIncrement: true
                    })
                    alertsStore.createIndex('timestamp', 'timestamp')
                }

                // Pending sync store
                if (!db.objectStoreNames.contains('pending-sync')) {
                    db.createObjectStore('pending-sync', {
                        keyPath: 'id',
                        autoIncrement: true
                    })
                }
            }
        })
    }

    async queueRecording(videoBlob, metadata) {
        if (!this.db) await this.init()

        const token = localStorage.getItem('token')

        const item = {
            timestamp: Date.now(),
            token,
            videoBlob,
            metadata,
            synced: false
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('offline-recordings', 'readwrite')
            const store = tx.objectStore('offline-recordings')
            const request = store.add(item)

            request.onsuccess = () => {
                console.log('Recording queued for offline sync:', request.result)
                this.requestBackgroundSync('sync-recordings')
                resolve(request.result)
            }

            request.onerror = () => {
                console.error('Failed to queue recording:', request.error)
                reject(request.error)
            }
        })
    }

    async queueAlert(alertData) {
        if (!this.db) await this.init()

        const token = localStorage.getItem('token')

        const item = {
            timestamp: Date.now(),
            token,
            data: alertData,
            synced: false
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('offline-alerts', 'readwrite')
            const store = tx.objectStore('offline-alerts')
            const request = store.add(item)

            request.onsuccess = () => {
                console.log('Alert queued for offline sync:', request.result)
                this.requestBackgroundSync('sync-alerts')
                resolve(request.result)
            }

            request.onerror = () => {
                console.error('Failed to queue alert:', request.error)
                reject(request.error)
            }
        })
    }

    async getPendingRecordings() {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('offline-recordings', 'readonly')
            const store = tx.objectStore('offline-recordings')
            const request = store.getAll()

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    async getPendingAlerts() {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('offline-alerts', 'readonly')
            const store = tx.objectStore('offline-alerts')
            const request = store.getAll()

            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    async markSynced(storeName, id) {
        if (!this.db) await this.init()

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite')
            const store = tx.objectStore(storeName)
            const request = store.delete(id)

            request.onsuccess = () => resolve(true)
            request.onerror = () => reject(request.error)
        })
    }

    async syncAll() {
        const recordings = await this.getPendingRecordings()
        const alerts = await this.getPendingAlerts()

        console.log(`Syncing ${recordings.length} recordings and ${alerts.length} alerts`)

        // Sync recordings
        for (const recording of recordings) {
            try {
                const formData = new FormData()
                formData.append('video', recording.videoBlob, 'recording.webm')
                Object.entries(recording.metadata).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        formData.append(key, value)
                    }
                })

                const response = await fetch('/api/recordings/upload', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${recording.token}` },
                    body: formData
                })

                if (response.ok) {
                    await this.markSynced('offline-recordings', recording.id)
                    console.log('Synced recording:', recording.id)
                }
            } catch (err) {
                console.error('Failed to sync recording:', err)
            }
        }

        // Sync alerts
        for (const alert of alerts) {
            try {
                const response = await fetch('/api/stream/start', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${alert.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(alert.data)
                })

                if (response.ok) {
                    await this.markSynced('offline-alerts', alert.id)
                    console.log('Synced alert:', alert.id)
                }
            } catch (err) {
                console.error('Failed to sync alert:', err)
            }
        }

        return {
            recordings: recordings.length,
            alerts: alerts.length
        }
    }

    async requestBackgroundSync(tag) {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready
                await registration.sync.register(tag)
                console.log('Background sync registered:', tag)
            } catch (err) {
                console.error('Background sync registration failed:', err)
                // Fall back to manual sync
                this.syncAll()
            }
        } else {
            // Fallback for browsers without background sync
            this.syncAll()
        }
    }

    isOnline() {
        return navigator.onLine
    }

    onOnline(callback) {
        window.addEventListener('online', callback)
    }

    onOffline(callback) {
        window.addEventListener('offline', callback)
    }
}

// Singleton instance
let offlineQueueInstance = null

export const getOfflineQueue = () => {
    if (!offlineQueueInstance) {
        offlineQueueInstance = new OfflineQueue()
    }
    return offlineQueueInstance
}

export default OfflineQueue
