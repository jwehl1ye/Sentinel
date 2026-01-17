import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getShakeDetector } from '../services/shakeDetector'
import { getVoiceDetector } from '../services/voiceDetector'
import { getDeadManSwitch } from '../services/deadManSwitch'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voiceListening, setVoiceListening] = useState(false)
  const [wellnessCheck, setWellnessCheck] = useState(false)

  const navigateRef = useRef(null)
  const shakeDetector = useRef(null)
  const voiceDetector = useRef(null)
  const deadManSwitch = useRef(null)

  // Initialize safety features
  const initializeSafetyFeatures = useCallback(async () => {
    if (!settings) return

    // Shake Detection
    if (settings.shake_to_activate) {
      shakeDetector.current = getShakeDetector({
        threshold: 15,
        shakeCount: 3,
        timeout: 2000,
        onShake: () => {
          console.log('Shake detected! Triggering SOS...')
          if (navigateRef.current) {
            navigateRef.current('/stream')
          }
        }
      })

      const hasPermission = await shakeDetector.current.requestPermission()
      if (hasPermission) {
        shakeDetector.current.start()
      }
    }

    // Voice Detection
    if (settings.voice_activation) {
      voiceDetector.current = getVoiceDetector({
        keywords: ['emergency', 'help me', 'help', 'sentinel', 'danger'],
        onKeyword: (keyword) => {
          console.log('Voice keyword detected:', keyword)
          if (navigateRef.current) {
            navigateRef.current('/stream')
          }
        },
        onListeningChange: setVoiceListening
      })

      const hasPermission = await voiceDetector.current.requestPermission()
      if (hasPermission) {
        voiceDetector.current.startListening()
      }
    }

    // Dead Man's Switch
    if (settings.dead_man_switch) {
      const intervalMs = (settings.dead_man_interval || 30) * 60 * 1000

      deadManSwitch.current = getDeadManSwitch({
        checkInterval: intervalMs,
        responseWindow: 60 * 1000,
        pauseDuringSleep: settings.dead_man_sleep_pause !== false,
        sleepStart: settings.dead_man_sleep_start || 23,
        sleepEnd: settings.dead_man_sleep_end || 7,
        onCheck: () => {
          console.log('Wellness check triggered')
          setWellnessCheck(true)
        },
        onMissed: async () => {
          console.log('Wellness check missed - alerting contacts')
          setWellnessCheck(false)
          // Auto-start stream when user doesn't respond
          if (navigateRef.current) {
            navigateRef.current('/stream')
          }
        },
        onResponse: () => {
          setWellnessCheck(false)
        }
      })

      deadManSwitch.current.start()
    }
  }, [settings])

  // Cleanup safety features
  const cleanupSafetyFeatures = useCallback(() => {
    if (shakeDetector.current) {
      shakeDetector.current.stop()
    }
    if (voiceDetector.current) {
      voiceDetector.current.stopListening()
    }
    if (deadManSwitch.current) {
      deadManSwitch.current.stop()
    }
  }, [])

  // Respond to wellness check
  const respondToWellnessCheck = useCallback(() => {
    if (deadManSwitch.current) {
      deadManSwitch.current.respond()
    }
    setWellnessCheck(false)
  }, [])

  // Pause dead man's switch
  const pauseDeadManSwitch = useCallback((durationMs) => {
    if (deadManSwitch.current) {
      deadManSwitch.current.pause(durationMs)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.getMe()
        .then(data => {
          setUser(data.user)
          setSettings(data.settings)
        })
        .catch(() => {
          localStorage.removeItem('token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Re-initialize safety features when settings change
  useEffect(() => {
    if (user && settings) {
      cleanupSafetyFeatures()
      initializeSafetyFeatures()
    }

    return () => cleanupSafetyFeatures()
  }, [user, settings, initializeSafetyFeatures, cleanupSafetyFeatures])

  const login = async (email, password) => {
    const data = await api.login(email, password)
    localStorage.setItem('token', data.token)
    setUser(data.user)
    const me = await api.getMe()
    setSettings(me.settings)
    return data
  }

  const register = async (email, password, name, phone) => {
    const data = await api.register(email, password, name, phone)
    localStorage.setItem('token', data.token)
    setUser(data.user)
    const me = await api.getMe()
    setSettings(me.settings)
    return data
  }

  const logout = () => {
    cleanupSafetyFeatures()
    localStorage.removeItem('token')
    setUser(null)
    setSettings(null)
  }

  const updateSettings = async (newSettings) => {
    const data = await api.updateSettings(newSettings)
    setSettings(data.settings)
    return data
  }

  // Component to capture navigate function
  const NavigateCapture = () => {
    const navigate = useNavigate()
    useEffect(() => {
      navigateRef.current = navigate
    }, [navigate])
    return null
  }

  return (
    <AuthContext.Provider value={{
      user,
      settings,
      loading,
      login,
      register,
      logout,
      updateSettings,
      voiceListening,
      wellnessCheck,
      respondToWellnessCheck,
      pauseDeadManSwitch,
      NavigateCapture
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

