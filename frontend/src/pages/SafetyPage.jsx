import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PhoneCall, Clock, Heart, AlertTriangle, Car, Home as HomeIcon,
  Briefcase, User, Timer, Plus, X, Check
} from 'lucide-react'
import { Conversation } from '@11labs/client'
import { callSafetyContacts, CallReasons } from '../services/safetyContactCalls'
import api from '../services/api'
import './SafetyPage.css'

const tabs = [
  { id: 'fakecall', label: 'Fake Call', icon: PhoneCall },
  { id: 'checkin', label: 'Check-In', icon: Clock },
  { id: 'medical', label: 'Medical', icon: Heart }
]

const fakeCallScenarios = [
  { id: 'uber', name: 'Uber/Ride is here', emoji: '🚗', icon: Car, number: 'Uber Driver' },
  { id: 'emergency', name: 'Emergency at home', emoji: '🏠', icon: HomeIcon, number: 'Home' },
  { id: 'work', name: 'Urgent work call', emoji: '💼', icon: Briefcase, number: 'Work' },
  { id: 'mom', name: 'Mom calling', emoji: '👩', icon: User, number: 'Mom' },
  { id: 'partner', name: 'Partner picking up', emoji: '❤️', icon: Heart, number: 'Partner' }
]

const checkInPresets = [
  { name: 'Going for a walk', duration: 30, emoji: '🚶' },
  { name: 'Meeting someone', duration: 60, emoji: '🤝' },
  { name: 'Night out', duration: 180, emoji: '🌙' },
  { name: 'Road trip', duration: 480, emoji: '🚗' },
  { name: 'Hiking', duration: 240, emoji: '🥾' },
  { name: 'Date', duration: 120, emoji: '💕' }
]

const scheduleOptions = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 }
]

export default function SafetyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'fakecall'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [fakeCallActive, setFakeCallActive] = useState(null)
  const [callAnswered, setCallAnswered] = useState(false)
  const [callTimer, setCallTimer] = useState(0)
  const [scheduledCall, setScheduledCall] = useState(null)
  const [activeCheckIns, setActiveCheckIns] = useState([])
  const [showCreateCheckIn, setShowCreateCheckIn] = useState(false)
  const [newCheckIn, setNewCheckIn] = useState({ name: '', duration: 30, escalationDelay: 5 })
  const [showCustomDuration, setShowCustomDuration] = useState(false)
  const [showCustomEscalation, setShowCustomEscalation] = useState(false)
  const [customDuration, setCustomDuration] = useState({ minutes: '', seconds: '' })
  const [customEscalation, setCustomEscalation] = useState({ minutes: '', seconds: '' })
  const [useAiVoice, setUseAiVoice] = useState(true)
  // Contact selection for notifications
  const [contacts, setContacts] = useState([])
  const [selectedContacts, setSelectedContacts] = useState([])
  const [, forceUpdate] = useState(0) // For timer re-render
  // Default to the Sentinel Public Agent
  const [agentId, setAgentId] = useState('agent_7401kf5b6y9je06v6r5vzqfbrp3r')
  const [conversation, setConversation] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')

  useEffect(() => {
    loadActiveCheckIns()
    loadContacts()
    return () => {
      if (conversation) conversation.endSession()
    }
  }, [])

  // Timer refresh interval for real-time countdown updates
  useEffect(() => {
    if (activeCheckIns.length > 0) {
      const interval = setInterval(() => {
        forceUpdate(n => n + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [activeCheckIns.length])

  const loadContacts = async () => {
    try {
      const res = await api.getContacts()
      setContacts(res.contacts || [])
    } catch (err) {
      console.error('Failed to load contacts:', err)
    }
  }

  useEffect(() => {
    let interval
    if (callAnswered) {
      interval = setInterval(() => setCallTimer(t => t + 1), 1000)

      if (useAiVoice && agentId) {
        startConversation()
      }
    } else {
      if (conversation) {
        conversation.endSession()
        setConversation(null)
        setConnectionStatus('disconnected')
      }
    }
    return () => clearInterval(interval)
  }, [callAnswered])

  useEffect(() => {
    if (scheduledCall) {
      const timeout = setTimeout(() => {
        setFakeCallActive(scheduledCall.scenario)
        setScheduledCall(null)
      }, scheduledCall.delay * 1000)
      return () => clearTimeout(timeout)
    }
  }, [scheduledCall])

  const loadActiveCheckIns = () => {
    const stored = localStorage.getItem('checkIns')
    if (stored) {
      const checkIns = JSON.parse(stored).filter(c => {
        // Keep check-ins that haven't expired yet (including escalation delay)
        const escalationTime = new Date(new Date(c.dueAt).getTime() + (c.escalationDelay || 5) * 60000)
        return escalationTime > new Date()
      })
      setActiveCheckIns(checkIns)

      // Schedule alerts for all active check-ins
      checkIns.forEach(checkIn => {
        scheduleCheckInAlert(checkIn)
      })
    }
  }

  const handleTabChange = (tabId) => {
    if (tabId === 'medical') {
      navigate('/medical')
    } else {
      setActiveTab(tabId)
    }
  }

  const startConversation = async () => {
    try {
      setConnectionStatus('connecting')
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })

      const conv = await Conversation.startSession({
        agentId: agentId,
        onModeChange: (mode) => setConnectionStatus(mode.mode === 'speaking' ? 'speaking' : 'listening'),
        onStatusChange: (status) => console.log('Status:', status),
        onError: (err) => {
          console.error('Conversation error:', err)
          setConnectionStatus('error')
        }
      })
      setConversation(conv)
      setConnectionStatus('connected')
    } catch (err) {
      console.error('Failed to start conversation:', err)
      setConnectionStatus('error')
      alert('Failed to start AI conversation. Check microphone permissions.')
    }
  }

  const startFakeCall = (scenario) => {
    setFakeCallActive(scenario)
    setCallAnswered(false)
    setCallTimer(0)
    if ('vibrate' in navigator) {
      const vibrateInterval = setInterval(() => navigator.vibrate([500, 200]), 700)
      setTimeout(() => clearInterval(vibrateInterval), 10000)
    }
  }

  const scheduleCall = (scenario, delay) => {
    setScheduledCall({ scenario, delay })
  }

  const answerCall = () => {
    setCallAnswered(true)
    if ('vibrate' in navigator) navigator.vibrate(0)
  }

  const endCall = () => {
    setFakeCallActive(null)
    setCallAnswered(false)
    setCallTimer(0)
    if ('vibrate' in navigator) navigator.vibrate(0)
  }

  const declineCall = () => {
    setFakeCallActive(null)
    if ('vibrate' in navigator) navigator.vibrate(0)
  }

  const startCheckIn = (preset) => {
    const checkIn = {
      id: Date.now(),
      name: preset.name,
      duration: preset.duration,
      dueAt: new Date(Date.now() + preset.duration * 60000).toISOString(),
      escalationDelay: 5
    }

    const updated = [...activeCheckIns, checkIn]
    setActiveCheckIns(updated)
    localStorage.setItem('checkIns', JSON.stringify(updated))
    localStorage.setItem('activeCheckIn', JSON.stringify(checkIn))

    // Schedule alert for when check-in expires
    scheduleCheckInAlert(checkIn)
  }

  const closeCheckInModal = () => {
    setShowCreateCheckIn(false)
    setNewCheckIn({ name: '', duration: 30, escalationDelay: 5 })
    setShowCustomDuration(false)
    setShowCustomEscalation(false)
    setCustomDuration('')
    setCustomEscalation('')
  }

  const handleCheckInExpired = async (checkIn) => {
    // Call safety contacts instead of starting recording
    console.log('Check-in expired without confirmation:', checkIn)
    try {
      // Get user's location
      let location = null
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000
          })
        })
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        try {
          const geoResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          )
          const geoData = await geoResponse.json()
          if (geoData.display_name) address = geoData.display_name
        } catch (e) { }
        location = { lat, lng, address }
      } catch (e) {
        location = { address: 'Location unknown' }
      }

      await callSafetyContacts({
        reason: `${CallReasons.CHECKIN_MISSED}. Check-in "${checkIn.name || 'Check-in'}" was due ${checkIn.duration || 30} minutes ago and has not been confirmed.`,
        location,
        additionalInfo: `Expected check-in time was ${new Date(checkIn.dueAt).toLocaleTimeString()}. User has not confirmed they are safe.`
      })
    } catch (error) {
      console.error('Failed to call safety contacts on check-in expiration:', error)
    }
  }

  const scheduleCheckInAlert = (checkIn) => {
    const escalationTime = new Date(new Date(checkIn.dueAt).getTime() + checkIn.escalationDelay * 60000)
    const timeUntilEscalation = escalationTime.getTime() - Date.now()

    if (timeUntilEscalation > 0) {
      setTimeout(async () => {
        // Check if check-in still exists and hasn't been confirmed
        const stored = localStorage.getItem('checkIns')
        if (stored) {
          const checkIns = JSON.parse(stored)
          const found = checkIns.find(c => c.id === checkIn.id)
          if (found) {
            // Check-in expired - call safety contacts
            handleCheckInExpired(checkIn)
          }
        }
      }, timeUntilEscalation)
    }
  }

  const createCustomCheckIn = () => {
    if (!newCheckIn.name) return

    const checkIn = {
      id: Date.now(),
      name: newCheckIn.name,
      duration: newCheckIn.duration,
      dueAt: new Date(Date.now() + newCheckIn.duration * 60000).toISOString(),
      escalationDelay: newCheckIn.escalationDelay
    }

    const updated = [...activeCheckIns, checkIn]
    setActiveCheckIns(updated)
    localStorage.setItem('checkIns', JSON.stringify(updated))
    localStorage.setItem('activeCheckIn', JSON.stringify(checkIn))
    closeCheckInModal()

    // Schedule alert for when check-in expires
    scheduleCheckInAlert(checkIn)
  }

  const confirmCheckIn = (id) => {
    const updated = activeCheckIns.filter(c => c.id !== id)
    setActiveCheckIns(updated)
    localStorage.setItem('checkIns', JSON.stringify(updated))
    if (updated.length === 0) {
      localStorage.removeItem('activeCheckIn')
    }

    // Track for safety score
    const count = parseInt(localStorage.getItem('checkInCount') || '0')
    localStorage.setItem('checkInCount', (count + 1).toString())
  }

  const cancelCheckIn = (id) => {
    const updated = activeCheckIns.filter(c => c.id !== id)
    setActiveCheckIns(updated)
    localStorage.setItem('checkIns', JSON.stringify(updated))
    if (updated.length === 0) {
      localStorage.removeItem('activeCheckIn')
    }
  }

  const formatTimeRemaining = (dueAt) => {
    const diff = new Date(dueAt) - new Date()
    if (diff <= 0) return 'OVERDUE'
    const mins = Math.floor(diff / 60000)
    const secs = Math.floor((diff % 60000) / 1000)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatCallTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (fakeCallActive) {
    return (
      <div className="fake-call-screen">
        {!callAnswered ? (
          <div className="incoming-call">
            <div className="caller-avatar">{fakeCallActive.emoji}</div>
            <h2 className="caller-name">{fakeCallActive.name}</h2>
            <p className="caller-number">{fakeCallActive.number}</p>
            <p className="call-status">Incoming call...</p>
            <div className="call-actions">
              <button className="call-btn decline" onClick={declineCall}>
                <PhoneCall size={28} style={{ transform: 'rotate(135deg)' }} />
              </button>
              <button className="call-btn answer" onClick={answerCall}>
                <PhoneCall size={28} />
              </button>
            </div>
            <div className="call-labels">
              <span>Decline</span>
              <span>Answer</span>
            </div>
          </div>
        ) : (
          <div className="active-call">
            <div className="caller-avatar">{fakeCallActive.emoji}</div>
            <h2 className="caller-name">{fakeCallActive.name}</h2>
            <p className="call-timer">{formatCallTime(callTimer)}</p>

            {useAiVoice && agentId ? (
              <div className="ai-status-indicator">
                <div className={`status-dot ${connectionStatus}`}></div>
                <span>
                  {connectionStatus === 'connecting' && 'Connecting to AI...'}
                  {connectionStatus === 'connected' && 'AI Connected'}
                  {connectionStatus === 'listening' && 'Listening...'}
                  {connectionStatus === 'speaking' && 'Speaking...'}
                  {connectionStatus === 'error' && 'Connection Error'}
                </span>
              </div>
            ) : (
              <div className="call-message">
                <p>"Hey! I'm outside waiting. Come out when you're ready!"</p>
              </div>
            )}
            <button className="end-call-btn" onClick={endCall}>
              End Call
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page safety-page">
      <div className="page-header">
        <AlertTriangle size={28} />
        <h1>SAFETY TOOLS</h1>
      </div>

      <div className="tab-selector">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'fakecall' && (
        <div className="tab-content">
          <div className="info-banner warning">
            <AlertTriangle size={18} />
            <span>Use fake calls to safely exit uncomfortable situations without confrontation.</span>
          </div>

          <div className="settings-card mb-4" style={{ display: 'none' }}>
            <div className="setting-row">
              <div className="setting-info">
                <h3>Conversational AI Agent</h3>
                <p>Enable two-way conversation with ElevenLabs Agent</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={useAiVoice}
                  onChange={(e) => setUseAiVoice(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          <div className="fake-call-main-action">
            <button
              className="start-call-btn"
              onClick={() => startFakeCall({ name: 'Incoming Call', number: 'Unknown', emoji: '📞' })}
            >
              <PhoneCall size={32} />
              <span>START FAKE CALL</span>
            </button>
            <p className="fake-call-hint">
              AI Agent is active. Speak naturally to guide the conversation.
            </p>
          </div>

          <h3 className="section-title">SCHEDULE CALL</h3>
          <div className="schedule-options">
            {scheduleOptions.map(opt => (
              <button
                key={opt.value}
                className={`schedule-btn ${scheduledCall?.delay === opt.value ? 'active' : ''}`}
                onClick={() => scheduleCall(fakeCallScenarios[0], opt.value)}
              >
                <Timer size={16} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          {scheduledCall && (
            <div className="scheduled-banner">
              <span>Call scheduled in {scheduledCall.delay}s</span>
              <button onClick={() => setScheduledCall(null)}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'checkin' && (
        <div className="tab-content">
          <div className="info-banner info">
            <Clock size={18} />
            <span>Set a check-in timer. If you don't confirm you're safe, your emergency contacts will be alerted.</span>
          </div>

          {activeCheckIns.length > 0 && (
            <>
              <h3 className="section-title">ACTIVE CHECK-INS</h3>
              <div className="active-checkins">
                {activeCheckIns.map(checkIn => (
                  <div key={checkIn.id} className="checkin-card">
                    <div className="checkin-info">
                      <span className="checkin-name">{checkIn.name}</span>
                      <span className="checkin-timer">{formatTimeRemaining(checkIn.dueAt)}</span>
                    </div>
                    <div className="checkin-actions">
                      <button className="btn btn-safe btn-sm" onClick={() => confirmCheckIn(checkIn.id)}>
                        <Check size={16} />
                        I'm Safe
                      </button>
                      <button className="btn-icon" onClick={() => cancelCheckIn(checkIn.id)}>
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="section-title">QUICK START</h3>
          <div className="presets-grid">
            {checkInPresets.map(preset => (
              <button
                key={preset.name}
                className="preset-card"
                onClick={() => startCheckIn(preset)}
              >
                <span className="preset-emoji">{preset.emoji}</span>
                <span className="preset-name">{preset.name}</span>
                <span className="preset-duration">{preset.duration}m</span>
              </button>
            ))}
          </div>

          <button className="custom-checkin-btn" onClick={() => setShowCreateCheckIn(true)}>
            <Plus size={20} />
            <span>Custom Check-In</span>
          </button>

          {showCreateCheckIn && (
            <div className="modal-overlay" onClick={closeCheckInModal}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">CREATE CHECK-IN</h2>

                <div className="form-group">
                  <label className="label">Activity Name</label>
                  <input
                    type="text"
                    className="input"
                    value={newCheckIn.name}
                    onChange={e => setNewCheckIn({ ...newCheckIn, name: e.target.value })}
                    placeholder="What are you doing?"
                  />
                </div>

                <div className="form-group">
                  <label className="label">Duration</label>
                  <div className="duration-options">
                    {[15, 30, 60, 120, 240].map(d => (
                      <button
                        key={d}
                        className={`duration-btn ${newCheckIn.duration === d && !showCustomDuration ? 'active' : ''}`}
                        onClick={() => {
                          setShowCustomDuration(false)
                          setNewCheckIn({ ...newCheckIn, duration: d })
                        }}
                      >
                        {d < 60 ? `${d}m` : `${d / 60}h`}
                      </button>
                    ))}
                    <button
                      className={`duration-btn custom ${showCustomDuration ? 'active' : ''}`}
                      onClick={() => {
                        setShowCustomDuration(true)
                      }}
                    >
                      Custom
                    </button>
                  </div>
                  {showCustomDuration && (
                    <div className="custom-input-group">
                      <div className="time-inputs-row">
                        <input
                          type="number"
                          min="0"
                          max="1440"
                          placeholder="Min"
                          value={customDuration.minutes}
                          onChange={(e) => {
                            const mins = parseInt(e.target.value) || 0
                            setCustomDuration({ ...customDuration, minutes: e.target.value })
                            const secs = parseInt(customDuration.seconds) || 0
                            const totalMins = mins + secs / 60
                            if (totalMins > 0) {
                              setNewCheckIn({ ...newCheckIn, duration: totalMins })
                            }
                          }}
                          className="custom-time-input"
                        />
                        <span className="time-separator">:</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          placeholder="Sec"
                          value={customDuration.seconds}
                          onChange={(e) => {
                            const secs = Math.min(59, parseInt(e.target.value) || 0)
                            setCustomDuration({ ...customDuration, seconds: e.target.value })
                            const mins = parseInt(customDuration.minutes) || 0
                            const totalMins = mins + secs / 60
                            if (totalMins > 0) {
                              setNewCheckIn({ ...newCheckIn, duration: totalMins })
                            }
                          }}
                          className="custom-time-input"
                        />
                      </div>
                      <span className="input-hint">minutes : seconds</span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="label">Escalation Delay</label>
                  <div className="duration-options">
                    {[1, 5, 10, 15].map(d => (
                      <button
                        key={d}
                        className={`duration-btn ${newCheckIn.escalationDelay === d && !showCustomEscalation ? 'active' : ''}`}
                        onClick={() => {
                          setShowCustomEscalation(false)
                          setNewCheckIn({ ...newCheckIn, escalationDelay: d })
                        }}
                      >
                        {d}m
                      </button>
                    ))}
                    <button
                      className={`duration-btn custom ${showCustomEscalation ? 'active' : ''}`}
                      onClick={() => {
                        setShowCustomEscalation(true)
                      }}
                    >
                      Custom
                    </button>
                  </div>
                  {showCustomEscalation && (
                    <div className="custom-input-group">
                      <div className="time-inputs-row">
                        <input
                          type="number"
                          min="0"
                          max="120"
                          placeholder="Min"
                          value={customEscalation.minutes}
                          onChange={(e) => {
                            const mins = parseInt(e.target.value) || 0
                            setCustomEscalation({ ...customEscalation, minutes: e.target.value })
                            const secs = parseInt(customEscalation.seconds) || 0
                            const totalMins = mins + secs / 60
                            if (totalMins > 0) {
                              setNewCheckIn({ ...newCheckIn, escalationDelay: totalMins })
                            }
                          }}
                          className="custom-time-input"
                        />
                        <span className="time-separator">:</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          placeholder="Sec"
                          value={customEscalation.seconds}
                          onChange={(e) => {
                            const secs = Math.min(59, parseInt(e.target.value) || 0)
                            setCustomEscalation({ ...customEscalation, seconds: e.target.value })
                            const mins = parseInt(customEscalation.minutes) || 0
                            const totalMins = mins + secs / 60
                            if (totalMins > 0) {
                              setNewCheckIn({ ...newCheckIn, escalationDelay: totalMins })
                            }
                          }}
                          className="custom-time-input"
                        />
                      </div>
                      <span className="input-hint">minutes : seconds</span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="label">Notify Contacts (on expiry)</label>
                  <div className="contact-list">
                    {contacts.length === 0 ? (
                      <p className="text-muted">No contacts added yet. Add contacts in Settings.</p>
                    ) : (
                      contacts.map(contact => (
                        <button
                          key={contact.id}
                          className={`contact-item ${selectedContacts.includes(contact.id) ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedContacts(prev =>
                              prev.includes(contact.id)
                                ? prev.filter(id => id !== contact.id)
                                : [...prev, contact.id]
                            )
                          }}
                        >
                          <span>{contact.name}</span>
                          {selectedContacts.includes(contact.id) && <Check size={16} />}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={closeCheckInModal}>
                    Cancel
                  </button>
                  <button className="btn btn-danger" onClick={createCustomCheckIn}>
                    Start Check-In
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

