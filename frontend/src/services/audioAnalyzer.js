// Audio Analyzer Service
// Detects audio threats like screaming, glass breaking, loud impacts

class AudioAnalyzer {
    constructor(options = {}) {
        this.threshold = options.threshold || 0.7
        this.onThreat = options.onThreat || (() => { })
        this.onLevelChange = options.onLevelChange || (() => { })

        this.audioContext = null
        this.analyser = null
        this.microphone = null
        this.stream = null
        this.listening = false
        this.animationFrame = null

        // Detection state
        this.loudnessHistory = []
        this.historySize = 30 // ~0.5 seconds at 60fps
        this.lastThreatTime = 0
        this.cooldownMs = 5000 // 5 second cooldown between alerts
    }

    async init() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            })

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
            this.analyser = this.audioContext.createAnalyser()
            this.analyser.fftSize = 2048
            this.analyser.smoothingTimeConstant = 0.3

            this.microphone = this.audioContext.createMediaStreamSource(this.stream)
            this.microphone.connect(this.analyser)

            return true
        } catch (err) {
            console.error('Failed to initialize audio analyzer:', err)
            return false
        }
    }

    start() {
        if (this.listening) return
        if (!this.analyser) {
            console.warn('Audio analyzer not initialized')
            return
        }

        this.listening = true
        this.analyze()
    }

    stop() {
        this.listening = false

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame)
            this.animationFrame = null
        }
    }

    cleanup() {
        this.stop()

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop())
            this.stream = null
        }

        if (this.audioContext) {
            this.audioContext.close()
            this.audioContext = null
        }
    }

    analyze() {
        if (!this.listening) return

        const bufferLength = this.analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        this.analyser.getByteFrequencyData(dataArray)

        // Calculate average loudness
        const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength
        const normalizedLevel = average / 255

        // Update history
        this.loudnessHistory.push(normalizedLevel)
        if (this.loudnessHistory.length > this.historySize) {
            this.loudnessHistory.shift()
        }

        // Report current level
        this.onLevelChange(normalizedLevel)

        // Detect sudden spikes (potential threat)
        const threatDetected = this.detectThreat(dataArray, normalizedLevel)

        if (threatDetected) {
            const now = Date.now()
            if (now - this.lastThreatTime > this.cooldownMs) {
                this.lastThreatTime = now
                this.onThreat(this.classifyThreat(dataArray))
            }
        }

        this.animationFrame = requestAnimationFrame(() => this.analyze())
    }

    detectThreat(frequencyData, currentLevel) {
        if (this.loudnessHistory.length < this.historySize) return false

        // Calculate baseline from history
        const baseline = this.loudnessHistory.slice(0, -5)
            .reduce((a, b) => a + b, 0) / (this.historySize - 5)

        // Sudden spike detection
        const spikeRatio = currentLevel / (baseline + 0.01)
        if (spikeRatio > 3 && currentLevel > this.threshold) {
            return true
        }

        // Sustained loud sound
        const recentAvg = this.loudnessHistory.slice(-10)
            .reduce((a, b) => a + b, 0) / 10
        if (recentAvg > this.threshold * 0.8) {
            return true
        }

        // High-frequency content (screaming detection)
        const highFreq = frequencyData.slice(Math.floor(frequencyData.length * 0.6))
        const highFreqAvg = highFreq.reduce((a, b) => a + b, 0) / highFreq.length / 255
        if (highFreqAvg > this.threshold * 0.6 && currentLevel > this.threshold * 0.5) {
            return true
        }

        return false
    }

    classifyThreat(frequencyData) {
        const lowFreq = frequencyData.slice(0, Math.floor(frequencyData.length * 0.2))
        const midFreq = frequencyData.slice(
            Math.floor(frequencyData.length * 0.2),
            Math.floor(frequencyData.length * 0.6)
        )
        const highFreq = frequencyData.slice(Math.floor(frequencyData.length * 0.6))

        const lowAvg = lowFreq.reduce((a, b) => a + b, 0) / lowFreq.length
        const midAvg = midFreq.reduce((a, b) => a + b, 0) / midFreq.length
        const highAvg = highFreq.reduce((a, b) => a + b, 0) / highFreq.length

        // Classify based on frequency distribution
        if (highAvg > midAvg && highAvg > lowAvg) {
            return { type: 'scream', confidence: highAvg / 255 }
        }

        if (lowAvg > midAvg * 2) {
            return { type: 'impact', confidence: lowAvg / 255 }
        }

        if (midAvg > lowAvg && midAvg > highAvg) {
            return { type: 'glass', confidence: midAvg / 255 }
        }

        return { type: 'loud_noise', confidence: (lowAvg + midAvg + highAvg) / 3 / 255 }
    }

    setThreshold(threshold) {
        this.threshold = Math.max(0, Math.min(1, threshold))
    }

    isListening() {
        return this.listening
    }
}

// Singleton instance
let audioAnalyzerInstance = null

export const getAudioAnalyzer = (options) => {
    if (!audioAnalyzerInstance) {
        audioAnalyzerInstance = new AudioAnalyzer(options)
    }
    return audioAnalyzerInstance
}

export default AudioAnalyzer
