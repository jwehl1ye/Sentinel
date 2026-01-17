// Push Notifications Service
// Handles Web Push API subscription and notifications

class PushNotificationService {
    constructor() {
        this.registration = null
        this.subscription = null
        this.vapidPublicKey = null // Set this from your server
    }

    async init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push notifications not supported')
            return false
        }

        try {
            // Register service worker
            this.registration = await navigator.serviceWorker.register('/sw.js')
            console.log('Service Worker registered')

            // Check existing subscription
            this.subscription = await this.registration.pushManager.getSubscription()

            return true
        } catch (err) {
            console.error('Failed to initialize push notifications:', err)
            return false
        }
    }

    async requestPermission() {
        const permission = await Notification.requestPermission()
        return permission === 'granted'
    }

    async subscribe(serverPublicKey) {
        if (!this.registration) {
            await this.init()
        }

        try {
            const applicationServerKey = this.urlBase64ToUint8Array(serverPublicKey)

            this.subscription = await this.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            })

            console.log('Push subscription:', this.subscription)
            return this.subscription.toJSON()
        } catch (err) {
            console.error('Failed to subscribe to push:', err)
            return null
        }
    }

    async unsubscribe() {
        if (this.subscription) {
            await this.subscription.unsubscribe()
            this.subscription = null
            return true
        }
        return false
    }

    isSubscribed() {
        return !!this.subscription
    }

    getSubscription() {
        return this.subscription?.toJSON() || null
    }

    // Show local notification (not push)
    async showNotification(title, options = {}) {
        if (!this.registration) {
            await this.init()
        }

        if (Notification.permission !== 'granted') {
            console.warn('Notification permission not granted')
            return false
        }

        const defaultOptions = {
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            vibrate: [200, 100, 200],
            requireInteraction: false,
            ...options
        }

        try {
            await this.registration.showNotification(title, defaultOptions)
            return true
        } catch (err) {
            console.error('Failed to show notification:', err)
            return false
        }
    }

    // Show wellness check notification
    async showWellnessCheck() {
        return this.showNotification('Are you okay?', {
            body: 'Tap to confirm you are safe. Your contacts will be alerted if you don\'t respond.',
            tag: 'wellness-check',
            requireInteraction: true,
            actions: [
                { action: 'safe', title: 'I\'m Safe' },
                { action: 'help', title: 'Need Help' }
            ],
            data: { type: 'wellness-check' }
        })
    }

    // Show trip reminder
    async showTripReminder(destination) {
        return this.showNotification('Have you arrived?', {
            body: `Expected arrival at ${destination}. Confirm you're safe.`,
            tag: 'trip-reminder',
            requireInteraction: true,
            actions: [
                { action: 'arrived', title: 'I\'ve Arrived' },
                { action: 'delayed', title: 'Delayed' }
            ],
            data: { type: 'trip-reminder', destination }
        })
    }

    // Show emergency alert sent notification
    async showAlertSent(contactCount) {
        return this.showNotification('Emergency Alert Sent', {
            body: `${contactCount} contact(s) have been notified of your situation.`,
            tag: 'alert-sent',
            data: { type: 'alert-sent' }
        })
    }

    // Helper to convert VAPID key
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4)
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/')

        const rawData = window.atob(base64)
        const outputArray = new Uint8Array(rawData.length)

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i)
        }

        return outputArray
    }
}

// Singleton instance
let pushServiceInstance = null

export const getPushService = () => {
    if (!pushServiceInstance) {
        pushServiceInstance = new PushNotificationService()
    }
    return pushServiceInstance
}

export default PushNotificationService
