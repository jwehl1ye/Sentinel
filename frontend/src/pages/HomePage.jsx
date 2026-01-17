import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, Radio, LogOut, PhoneCall, Clock, Heart, Eye,
  Zap, Cloud, MapPin, Bell, Users, Video, Vibrate, Volume2, AlertTriangle,
  Navigation, Phone, EyeOff
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import SafetyScore from '../components/SafetyScore'
import { getEmergencyServices } from '../services/emergencyServices'
import './HomePage.css'

const quickActions = [
  { icon: Navigation, label: 'Trip', path: '/trip' },
  { icon: PhoneCall, label: 'Fake Call', path: '/safety?tab=fakecall' },
  { icon: Clock, label: 'Check-In', path: '/safety?tab=checkin' },
  { icon: Heart, label: 'Medical', path: '/medical' }
]

const features = [
  { icon: Zap, title: 'INSTANT DETERRENT', desc: 'Visible recording warning with siren & strobe' },
  { icon: Cloud, title: 'PERMANENT SAVE', desc: "Video stored in cloud - can't be deleted" },
  { icon: MapPin, title: 'LOCATION SHARING', desc: 'Live GPS shared with your contacts' },
  { icon: Bell, title: 'CHECK-IN SYSTEM', desc: "Auto-alert contacts if you don't check in" }
]

export default function HomePage() {
  const navigate = useNavigate()
  const { user, logout, settings } = useAuth()
  const [contacts, setContacts] = useState([])
  const [recordings, setRecordings] = useState([])
  const [activeCheckIn, setActiveCheckIn] = useState(null)
  const [activeTrip, setActiveTrip] = useState(null)
  const [safeLocations, setSafeLocations] = useState([])
  const [hasMedical, setHasMedical] = useState(false)
  const [longPressProgress, setLongPressProgress] = useState(0)

  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const animationFrame = useRef(null)

  useEffect(() => {
    loadData()
    checkActiveCheckIn()
    checkActiveTrip()
  }, [])

  const loadData = async () => {
    try {
      const [contactsRes, recordingsRes, medicalRes, locationsRes] = await Promise.all([
        api.getContacts(),
        api.getRecordings(),
        api.getMedicalInfo().catch(() => null),
        api.getSafeLocations().catch(() => ({ locations: [] }))
      ])
      setContacts(contactsRes.contacts || [])
      setRecordings(recordingsRes.recordings || [])
      setHasMedical(medicalRes?.medical?.blood_type || medicalRes?.medical?.allergies)
      setSafeLocations(locationsRes.locations || [])
    } catch (err) {
      console.error('Failed to load data:', err)
    }
  }

  const checkActiveCheckIn = () => {
    const stored = localStorage.getItem('activeCheckIn')
    if (stored) {
      const checkIn = JSON.parse(stored)
      if (new Date(checkIn.dueAt) > new Date()) {
        setActiveCheckIn(checkIn)
      } else {
        localStorage.removeItem('activeCheckIn')
      }
    }
  }

  const checkActiveTrip = () => {
    const stored = localStorage.getItem('activeTrip')
    if (stored) {
      const trip = JSON.parse(stored)
      if (new Date(trip.expectedArrival) > new Date()) {
        setActiveTrip(trip)
      }
    }
  }

  const handleSOS = () => {
    navigate('/stream')
  }

  const handleSilentSOS = () => {
    navigate('/stream?silent=true')
  }

  // Long press handlers for silent SOS
  const handlePressStart = (e) => {
    e.preventDefault()
    longPressStart.current = Date.now()

    // Only show long-press progress if silent SOS is enabled
    if (settings?.enable_silent_sos) {
      const updateProgress = () => {
        if (!longPressStart.current) return
        const elapsed = Date.now() - longPressStart.current
        const progress = Math.min(elapsed / 3000, 1) // 3 seconds
        setLongPressProgress(progress)

        if (progress < 1) {
          animationFrame.current = requestAnimationFrame(updateProgress)
        } else {
          // Trigger silent SOS
          longPressStart.current = null
          setLongPressProgress(0)
          handleSilentSOS()
        }
      }

      animationFrame.current = requestAnimationFrame(updateProgress)
    }
  }

  const handlePressEnd = () => {
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current)
      animationFrame.current = null
    }

    const startTime = longPressStart.current
    longPressStart.current = null
    setLongPressProgress(0)

    // Only trigger SOS if we actually started a press
    if (startTime) {
      const elapsed = Date.now() - startTime
      // If less than 3 seconds (or silent mode disabled), normal SOS
      if (elapsed < 3000) {
        handleSOS()
      }
    }
  }

  const handlePressCancel = () => {
    // Cancel without triggering - used for mouse leave
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current)
      animationFrame.current = null
    }
    longPressStart.current = null
    setLongPressProgress(0)
  }

  const handleCall911 = () => {
    const emergency = getEmergencyServices()
    emergency.call()
  }

  // Safety score data
  const safetyData = {
    contacts: contacts.length,
    hasMedical,
    safeLocations: safeLocations.length,
    practiceRuns: parseInt(localStorage.getItem('practiceRuns') || '0'),
    checkIns: parseInt(localStorage.getItem('checkInCount') || '0'),
    trips: parseInt(localStorage.getItem('tripCount') || '0')
  }

  return (
    <div className="page home-page">
      <header className="home-header">
        <div className="brand">
          <Shield size={28} />
          <span>SAFESTREAM</span>
        </div>
        <div className="user-section">
          <span className="welcome">Hi, {user?.name?.split(' ')[0]}</span>
          <button className="btn-ghost" onClick={logout}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {activeTrip && (
        <div className="active-trip-banner" onClick={() => navigate('/trip')}>
          <Navigation size={20} />
          <div className="trip-info">
            <span className="trip-dest">{activeTrip.destination}</span>
            <span className="trip-status">Trip in progress</span>
          </div>
        </div>
      )}

      {activeCheckIn && (
        <div className="active-checkin" onClick={() => navigate('/safety?tab=checkin')}>
          <Clock size={20} />
          <div className="checkin-info">
            <span className="checkin-name">{activeCheckIn.name}</span>
            <span className="checkin-time">Check-in active</span>
          </div>
        </div>
      )}

      <div className="sos-section">
        <button
          className="sos-button"
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressCancel}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          onTouchCancel={handlePressCancel}
        >
          <div className="sos-ring-1" />
          <div className="sos-ring-2" />
          <div className="sos-ring-3" />
          {longPressProgress > 0 && (
            <svg className="long-press-ring" viewBox="0 0 100 100">
              <circle
                className="long-press-progress"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                strokeWidth="4"
                strokeDasharray={`${longPressProgress * 283} 283`}
              />
            </svg>
          )}
          <div className="sos-inner">
            <Radio size={48} />
            <span className="sos-text">GO LIVE</span>
            <span className="sos-subtext">
              {settings?.enable_silent_sos ? 'HOLD FOR SILENT MODE' : 'TAP TO START STREAMING'}
            </span>
          </div>
        </button>
      </div>

      <div className="grid-4 quick-actions">
        {quickActions.map(action => (
          <button
            key={action.label}
            className="quick-action"
            onClick={() => navigate(action.path)}
          >
            <action.icon size={20} />
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      <SafetyScore data={safetyData} />

      <div className="grid-2 stats-grid">
        <button className="stat-card" onClick={() => navigate('/contacts')}>
          <Users size={24} />
          <div className="stat-info">
            <span className="stat-value">{contacts.length}</span>
            <span className="stat-label">Emergency Contacts</span>
          </div>
        </button>
        <button className="stat-card" onClick={() => navigate('/history')}>
          <Video size={24} />
          <div className="stat-info">
            <span className="stat-value">{recordings.length}</span>
            <span className="stat-label">Saved Recordings</span>
          </div>
        </button>
      </div>

      <div className="activation-methods">
        <div className={`activation-item ${settings?.shake_to_activate ? 'active' : ''}`}>
          <Vibrate size={18} />
          <span>Shake 3x to activate</span>
        </div>
        <div className={`activation-item ${settings?.voice_activation ? 'active' : ''}`}>
          <Volume2 size={18} />
          <span>Say "Emergency" to activate</span>
        </div>
        {settings?.enable_silent_sos && (
          <div className="activation-item active">
            <EyeOff size={18} />
            <span>Hold SOS for silent mode</span>
          </div>
        )}
      </div>

      <div className="tip-banner">
        <AlertTriangle size={18} />
        <span>Pro tip: Add multiple emergency contacts for maximum safety coverage</span>
      </div>
    </div>
  )
}
