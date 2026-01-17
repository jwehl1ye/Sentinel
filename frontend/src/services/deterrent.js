let audioContext = null
let oscillator = null
let gainNode = null
let sirenInterval = null

const createAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

export const startSiren = (type = 'police') => {
  const ctx = createAudioContext()

  if (oscillator) stopSiren()

  oscillator = ctx.createOscillator()
  gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  gainNode.gain.value = 0.3

  if (type === 'police') {
    oscillator.type = 'sine'
    let freq = 700
    let direction = 1

    sirenInterval = setInterval(() => {
      freq += direction * 20
      if (freq >= 1200) direction = -1
      if (freq <= 700) direction = 1
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime)
    }, 20)
  } else if (type === 'alarm') {
    oscillator.type = 'square'
    oscillator.frequency.value = 800

    sirenInterval = setInterval(() => {
      gainNode.gain.value = gainNode.gain.value > 0.1 ? 0 : 0.3
    }, 200)
  } else if (type === 'horn') {
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = 150

    sirenInterval = setInterval(() => {
      gainNode.gain.value = gainNode.gain.value > 0.1 ? 0 : 0.4
    }, 500)
  }

  oscillator.start()
}

export const stopSiren = () => {
  if (sirenInterval) {
    clearInterval(sirenInterval)
    sirenInterval = null
  }
  if (oscillator) {
    oscillator.stop()
    oscillator.disconnect()
    oscillator = null
  }
  if (gainNode) {
    gainNode.disconnect()
    gainNode = null
  }
}

let strobeInterval = null

export const startStrobe = (speed = 'fast') => {
  const overlay = document.createElement('div')
  overlay.id = 'strobe-overlay'
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: white;
    opacity: 0;
    pointer-events: none;
    z-index: 9999;
    transition: opacity 0.05s;
  `
  document.body.appendChild(overlay)

  const interval = speed === 'fast' ? 100 : speed === 'medium' ? 200 : 400

  strobeInterval = setInterval(() => {
    overlay.style.opacity = overlay.style.opacity === '0' ? '0.8' : '0'
  }, interval)
}

export const stopStrobe = () => {
  if (strobeInterval) {
    clearInterval(strobeInterval)
    strobeInterval = null
  }
  const overlay = document.getElementById('strobe-overlay')
  if (overlay) overlay.remove()
}

export const speakWarning = (message = 'Warning! This incident is being recorded and streamed to emergency contacts.') => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 1
    window.speechSynthesis.speak(utterance)
  }
}

export const stopSpeaking = () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export const vibrate = (pattern = 'emergency') => {
  if ('vibrate' in navigator) {
    const patterns = {
      emergency: [200, 100, 200, 100, 200, 100, 500],
      alert: [100, 50, 100, 50, 100],
      sos: [100, 100, 100, 100, 100, 100, 300, 100, 300, 100, 300, 100, 100, 100, 100, 100, 100],
      continuous: [1000]
    }
    navigator.vibrate(patterns[pattern] || patterns.emergency)
  }
}

export const stopVibrate = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(0)
  }
}

let deterrentActive = false
let warningInterval = null

export const startDeterrent = () => {
  if (deterrentActive) return
  deterrentActive = true

  startSiren('police')
  // Strobe disabled - too disorienting
  // startStrobe('fast')
  vibrate('continuous')
  speakWarning()

  warningInterval = setInterval(() => {
    speakWarning()
  }, 15000)
}

export const stopDeterrent = () => {
  if (!deterrentActive) return
  deterrentActive = false

  stopSiren()
  stopStrobe()
  stopVibrate()
  stopSpeaking()

  if (warningInterval) {
    clearInterval(warningInterval)
    warningInterval = null
  }
}

export const isDeterrentActive = () => deterrentActive

