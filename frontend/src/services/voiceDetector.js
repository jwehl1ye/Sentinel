// Voice Detection Service
// Uses Web Speech API to listen for emergency keywords

class VoiceDetector {
    constructor(options = {}) {
        this.keywords = options.keywords || ['emergency', 'help me', 'help', 'sentinel', 'danger']
        this.onKeyword = options.onKeyword || (() => { })
        this.onListeningChange = options.onListeningChange || (() => { })

        this.recognition = null
        this.listening = false
        this.enabled = false
        this.restartTimeout = null

        this.initRecognition()
    }

    initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

        if (!SpeechRecognition) {
            console.warn('Speech Recognition API not supported')
            return
        }

        this.recognition = new SpeechRecognition()
        this.recognition.continuous = true
        this.recognition.interimResults = true
        this.recognition.lang = 'en-US'
        this.recognition.maxAlternatives = 3

        this.recognition.onresult = (event) => {
            const results = event.results

            for (let i = event.resultIndex; i < results.length; i++) {
                const transcript = results[i][0].transcript.toLowerCase().trim()

                for (const keyword of this.keywords) {
                    if (transcript.includes(keyword.toLowerCase())) {
                        console.log('Voice keyword detected:', keyword, 'in:', transcript)
                        this.triggerKeyword(keyword)
                        return
                    }
                }
            }
        }

        this.recognition.onstart = () => {
            this.listening = true
            this.onListeningChange(true)
        }

        this.recognition.onend = () => {
            this.listening = false
            this.onListeningChange(false)

            // Auto-restart if still enabled
            if (this.enabled) {
                this.restartTimeout = setTimeout(() => {
                    this.startListening()
                }, 100)
            }
        }

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error)

            // Don't restart on fatal errors
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.enabled = false
                return
            }

            // Restart on recoverable errors
            if (this.enabled) {
                this.restartTimeout = setTimeout(() => {
                    this.startListening()
                }, 1000)
            }
        }
    }

    triggerKeyword(keyword) {
        // Haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200])
        }
        this.onKeyword(keyword)
    }

    async requestPermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach(track => track.stop())
            return true
        } catch (err) {
            console.error('Microphone permission error:', err)
            return false
        }
    }

    startListening() {
        if (!this.recognition) {
            console.warn('Speech Recognition not initialized')
            return false
        }

        if (this.listening) return true

        try {
            this.recognition.start()
            this.enabled = true
            return true
        } catch (err) {
            console.error('Failed to start speech recognition:', err)
            return false
        }
    }

    stopListening() {
        this.enabled = false

        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout)
            this.restartTimeout = null
        }

        if (this.recognition && this.listening) {
            try {
                this.recognition.stop()
            } catch (err) {
                console.error('Failed to stop speech recognition:', err)
            }
        }

        this.listening = false
    }

    isListening() {
        return this.listening
    }

    isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    }

    setKeywords(keywords) {
        this.keywords = keywords
    }

    addKeyword(keyword) {
        if (!this.keywords.includes(keyword.toLowerCase())) {
            this.keywords.push(keyword.toLowerCase())
        }
    }
}

// Singleton instance
let voiceDetectorInstance = null

export const getVoiceDetector = (options) => {
    if (!voiceDetectorInstance) {
        voiceDetectorInstance = new VoiceDetector(options)
    }
    return voiceDetectorInstance
}

export default VoiceDetector
