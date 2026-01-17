// Wearable Connect Service
// Connects to smartwatches via Web Bluetooth API

class WearableConnect {
    constructor(options = {}) {
        this.onConnect = options.onConnect || (() => { })
        this.onDisconnect = options.onDisconnect || (() => { })
        this.onHeartRate = options.onHeartRate || (() => { })
        this.onSOS = options.onSOS || (() => { })

        this.device = null
        this.server = null
        this.heartRateService = null
        this.connected = false
    }

    isSupported() {
        return 'bluetooth' in navigator
    }

    async requestDevice() {
        if (!this.isSupported()) {
            console.warn('Web Bluetooth not supported')
            return null
        }

        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['heart_rate'] },
                    { services: ['battery_service'] },
                    { namePrefix: 'Apple Watch' },
                    { namePrefix: 'Galaxy Watch' },
                    { namePrefix: 'Fitbit' },
                    { namePrefix: 'Garmin' }
                ],
                optionalServices: ['heart_rate', 'battery_service', 'device_information']
            })

            this.device.addEventListener('gattserverdisconnected', () => {
                this.connected = false
                this.onDisconnect()
            })

            return this.device
        } catch (err) {
            console.error('Failed to request device:', err)
            return null
        }
    }

    async connect() {
        if (!this.device) {
            await this.requestDevice()
        }

        if (!this.device) return false

        try {
            this.server = await this.device.gatt.connect()
            this.connected = true

            // Try to get heart rate service
            try {
                this.heartRateService = await this.server.getPrimaryService('heart_rate')
                await this.startHeartRateNotifications()
            } catch (e) {
                console.log('Heart rate service not available')
            }

            this.onConnect(this.device.name)
            return true
        } catch (err) {
            console.error('Connection failed:', err)
            return false
        }
    }

    async startHeartRateNotifications() {
        if (!this.heartRateService) return

        try {
            const characteristic = await this.heartRateService.getCharacteristic('heart_rate_measurement')

            characteristic.addEventListener('characteristicvaluechanged', (event) => {
                const value = event.target.value
                const heartRate = this.parseHeartRate(value)
                this.onHeartRate(heartRate)

                // Detect abnormal heart rate (potential panic)
                if (heartRate > 150 || heartRate < 40) {
                    console.log('Abnormal heart rate detected:', heartRate)
                }
            })

            await characteristic.startNotifications()
            console.log('Heart rate notifications started')
        } catch (err) {
            console.error('Failed to start heart rate notifications:', err)
        }
    }

    parseHeartRate(value) {
        const flags = value.getUint8(0)
        const rate16Bits = flags & 0x1

        if (rate16Bits) {
            return value.getUint16(1, true)
        }
        return value.getUint8(1)
    }

    async getBatteryLevel() {
        if (!this.server) return null

        try {
            const batteryService = await this.server.getPrimaryService('battery_service')
            const batteryLevel = await batteryService.getCharacteristic('battery_level')
            const value = await batteryLevel.readValue()
            return value.getUint8(0)
        } catch (err) {
            console.log('Battery service not available')
            return null
        }
    }

    async getDeviceInfo() {
        if (!this.server) return null

        try {
            const deviceInfo = await this.server.getPrimaryService('device_information')

            const info = {}

            try {
                const manufacturer = await deviceInfo.getCharacteristic('manufacturer_name_string')
                const value = await manufacturer.readValue()
                info.manufacturer = new TextDecoder().decode(value)
            } catch (e) { }

            try {
                const model = await deviceInfo.getCharacteristic('model_number_string')
                const value = await model.readValue()
                info.model = new TextDecoder().decode(value)
            } catch (e) { }

            return info
        } catch (err) {
            console.log('Device info not available')
            return null
        }
    }

    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect()
        }
        this.connected = false
        this.server = null
        this.heartRateService = null
    }

    isConnected() {
        return this.connected
    }

    getDeviceName() {
        return this.device?.name || null
    }
}

// Singleton instance
let wearableConnectInstance = null

export const getWearableConnect = (options) => {
    if (!wearableConnectInstance) {
        wearableConnectInstance = new WearableConnect(options)
    }
    return wearableConnectInstance
}

export default WearableConnect
