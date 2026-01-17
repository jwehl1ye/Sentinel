// Emergency Services Integration
// Handles calling emergency services & sending location

const EMERGENCY_NUMBERS = {
    US: '911',
    UK: '999',
    EU: '112',
    AU: '000',
    IN: '112',
    CA: '911',
    MX: '911',
    BR: '190',
    JP: '110',
    KR: '112',
    CN: '110',
    DEFAULT: '112'
}

class EmergencyServices {
    constructor() {
        this.countryCode = null
        this.location = null
    }

    async init() {
        // Try to detect country
        try {
            const response = await fetch('https://ipapi.co/country/')
            if (response.ok) {
                this.countryCode = await response.text()
            }
        } catch (err) {
            console.log('Could not detect country, using default')
            this.countryCode = 'DEFAULT'
        }

        // Get current location
        this.updateLocation()
    }

    updateLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.location = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy
                    }
                },
                (err) => console.log('Location unavailable:', err.message)
            )
        }
    }

    getEmergencyNumber() {
        return EMERGENCY_NUMBERS[this.countryCode] || EMERGENCY_NUMBERS.DEFAULT
    }

    // Call emergency number
    call() {
        const number = this.getEmergencyNumber()
        window.location.href = `tel:${number}`
    }

    // Open SMS to emergency number (where available)
    text(message = '') {
        const number = this.getEmergencyNumber()
        const encodedMessage = encodeURIComponent(message || this.getLocationMessage())

        // iOS and Android have different SMS URL schemes
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        const separator = isIOS ? '&' : '?'

        window.location.href = `sms:${number}${separator}body=${encodedMessage}`
    }

    getLocationMessage() {
        if (!this.location) {
            return 'Emergency: I need help!'
        }

        const mapsUrl = `https://maps.google.com/?q=${this.location.lat},${this.location.lng}`
        return `Emergency: I need help! My location: ${mapsUrl}`
    }

    // Get Google Maps URL for current location
    getLocationUrl() {
        if (!this.location) return null
        return `https://maps.google.com/?q=${this.location.lat},${this.location.lng}`
    }

    // Share location via Web Share API
    async shareLocation() {
        if (!navigator.share) {
            console.warn('Web Share API not supported')
            return false
        }

        const locationUrl = this.getLocationUrl()

        try {
            await navigator.share({
                title: 'My Location',
                text: 'I need help! This is my current location:',
                url: locationUrl || 'Location unavailable'
            })
            return true
        } catch (err) {
            console.error('Share failed:', err)
            return false
        }
    }

    // Generate emergency info text
    getEmergencyInfo(userInfo = {}) {
        const lines = ['EMERGENCY INFORMATION']

        if (userInfo.name) lines.push(`Name: ${userInfo.name}`)
        if (userInfo.phone) lines.push(`Phone: ${userInfo.phone}`)
        if (this.location) {
            lines.push(`Location: ${this.location.lat.toFixed(6)}, ${this.location.lng.toFixed(6)}`)
            lines.push(`Maps: ${this.getLocationUrl()}`)
        }
        if (userInfo.bloodType) lines.push(`Blood Type: ${userInfo.bloodType}`)
        if (userInfo.allergies?.length > 0) lines.push(`Allergies: ${userInfo.allergies.join(', ')}`)
        if (userInfo.medications?.length > 0) lines.push(`Medications: ${userInfo.medications.join(', ')}`)
        if (userInfo.conditions?.length > 0) lines.push(`Conditions: ${userInfo.conditions.join(', ')}`)
        if (userInfo.emergencyContact) lines.push(`Emergency Contact: ${userInfo.emergencyContact}`)

        return lines.join('\n')
    }

    // Copy emergency info to clipboard
    async copyEmergencyInfo(userInfo = {}) {
        const info = this.getEmergencyInfo(userInfo)

        try {
            await navigator.clipboard.writeText(info)
            return true
        } catch (err) {
            console.error('Failed to copy:', err)
            return false
        }
    }

    // Check if SMS to emergency services is supported
    supportsTextTo911() {
        // Text-to-911 is available in many US areas but not universal
        // This is a simplified check
        return this.countryCode === 'US'
    }
}

// Singleton instance
let emergencyServicesInstance = null

export const getEmergencyServices = () => {
    if (!emergencyServicesInstance) {
        emergencyServicesInstance = new EmergencyServices()
        emergencyServicesInstance.init()
    }
    return emergencyServicesInstance
}

export default EmergencyServices
