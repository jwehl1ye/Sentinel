import { useState, useEffect } from 'react'
import { X, Phone, Loader, AlertCircle } from 'lucide-react'
import api from '../services/api'
import './Call911ForMeModal.css'

export default function Call911ForMeModal({ isOpen, onClose }) {
  const [situation, setSituation] = useState('')
  const [isCalling, setIsCalling] = useState(false)
  const [callStatus, setCallStatus] = useState('idle') // idle, connecting, active, completed
  const [error, setError] = useState('')
  const [callId, setCallId] = useState(null)

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSituation('')
      setIsCalling(false)
      setCallStatus('idle')
      setError('')
      setCallId(null)
    }
  }, [isOpen])

  const handleCall = async () => {
    if (!situation.trim()) {
      setError('Please describe what is wrong')
      return
    }

    setIsCalling(true)
    setError('')

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

        // Try reverse geocoding
        try {
          const geoResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          )
          const geoData = await geoResponse.json()
          if (geoData.display_name) {
            address = geoData.display_name
          }
        } catch (e) {
          console.log('Reverse geocoding failed:', e)
        }

        location = { lat, lng, address }
      } catch (e) {
        console.log('Location unavailable:', e)
        location = { address: 'Location unknown' }
      }

      // Get user data for context
      const [contacts, medicalInfo] = await Promise.all([
        api.getContacts().catch(() => ({ contacts: [] })),
        api.getMedicalInfo().catch(() => null)
      ])

      // Initiate the call
      const response = await api.initiateEmergencyCall({
        location,
        situation: situation.trim(),
        videoFrame: null, // No video for this feature
        userData: {
          contacts: contacts.contacts || [],
          medical: medicalInfo?.medical || null
        }
      })

      if (response.success) {
        setCallId(response.callId)
        setCallStatus('active')
      } else {
        throw new Error(response.error || 'Failed to initiate call')
      }
    } catch (err) {
      console.error('Call error:', err)
      const errorMsg = err.message || 'Failed to make the call'

      if (errorMsg.includes('already in progress')) {
        setError('A call is already in progress. Please wait or reset.')
      } else {
        setError(errorMsg)
      }
      setCallStatus('idle')
    } finally {
      setIsCalling(false)
    }
  }

  const handleClose = () => {
    if (callStatus === 'active') {
      // Don't close during active call
      return
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="call911-modal-overlay" onClick={handleClose}>
      <div className="call911-modal" onClick={(e) => e.stopPropagation()}>
        <div className="call911-modal-header">
          <h2>Call 911 for Me</h2>
          {callStatus !== 'active' && (
            <button className="close-btn" onClick={handleClose}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="call911-modal-content">
          {callStatus === 'idle' && (
            <>
              <div className="call911-info">
                <AlertCircle size={18} />
                <span>This is a test call. AI will call <strong>+1 (437) 254-1201</strong> on your behalf. (911 for testing)</span>
              </div>

              <div className="call911-input-section">
                <label>What's wrong? Describe the emergency:</label>
                <textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="Example: I've fallen and can't get up. I'm alone at home and need medical assistance."
                  rows={5}
                  disabled={isCalling}
                />
              </div>

              {error && (
                <div className="call911-error">
                  {error}
                </div>
              )}

              <button
                className="call911-submit-btn"
                onClick={handleCall}
                disabled={isCalling || !situation.trim()}
              >
                {isCalling ? (
                  <>
                    <Loader size={18} className="spin" />
                    <span>Initiating call...</span>
                  </>
                ) : (
                  <>
                    <Phone size={18} />
                    <span>Call 911 Now</span>
                  </>
                )}
              </button>
            </>
          )}

          {callStatus === 'active' && (
            <div className="call911-active">
              <div className="call911-active-icon">
                <Phone size={48} />
              </div>
              <h3>Call in Progress</h3>
              <p>The AI is calling 911 on your behalf.</p>
              <p className="call911-situation">{situation}</p>
              <div className="call911-status">
                <Loader size={20} className="spin" />
                <span>Connecting...</span>
              </div>
              <div className="call911-note">
                <AlertCircle size={16} />
                <span>You can close this window. The call will continue.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
