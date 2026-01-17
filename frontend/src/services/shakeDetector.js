// Shake Detection Service
// Detects rapid device shaking to trigger SOS

class ShakeDetector {
    constructor(options = {}) {
        this.threshold = options.threshold || 15
        this.timeout = options.timeout || 1000
        this.shakeCount = options.shakeCount || 3
        this.onShake = options.onShake || (() => { })

        this.lastX = null
        this.lastY = null
        this.lastZ = null
        this.lastTime = 0
        this.shakes = []
        this.listening = false
        this.permissionGranted = false

        this.handleMotion = this.handleMotion.bind(this)
    }

    async requestPermission() {
        // iOS 13+ requires permission request
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission()
                this.permissionGranted = permission === 'granted'
                return this.permissionGranted
            } catch (err) {
                console.error('Motion permission error:', err)
                return false
            }
        }
        // Android and older iOS don't need permission
        this.permissionGranted = true
        return true
    }

    handleMotion(event) {
        const { accelerationIncludingGravity } = event
        if (!accelerationIncludingGravity) return

        const { x, y, z } = accelerationIncludingGravity
        const now = Date.now()

        if (this.lastX !== null) {
            const deltaX = Math.abs(x - this.lastX)
            const deltaY = Math.abs(y - this.lastY)
            const deltaZ = Math.abs(z - this.lastZ)
            const acceleration = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ)

            if (acceleration > this.threshold) {
                this.shakes.push(now)

                // Remove shakes older than timeout
                this.shakes = this.shakes.filter(t => now - t < this.timeout)

                // Check if we have enough shakes
                if (this.shakes.length >= this.shakeCount) {
                    this.shakes = []
                    this.triggerShake()
                }
            }
        }

        this.lastX = x
        this.lastY = y
        this.lastZ = z
        this.lastTime = now
    }

    triggerShake() {
        // Haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100])
        }
        this.onShake()
    }

    start(callback) {
        if (callback) this.onShake = callback

        if (!this.permissionGranted) {
            console.warn('Motion permission not granted. Call requestPermission() first.')
            return false
        }

        if (this.listening) return true

        window.addEventListener('devicemotion', this.handleMotion)
        this.listening = true
        return true
    }

    stop() {
        window.removeEventListener('devicemotion', this.handleMotion)
        this.listening = false
        this.shakes = []
        this.lastX = null
        this.lastY = null
        this.lastZ = null
    }

    isListening() {
        return this.listening
    }

    isSupported() {
        return typeof DeviceMotionEvent !== 'undefined'
    }
}

// Singleton instance
let shakeDetectorInstance = null

export const getShakeDetector = (options) => {
    if (!shakeDetectorInstance) {
        shakeDetectorInstance = new ShakeDetector(options)
    }
    return shakeDetectorInstance
}

export default ShakeDetector
