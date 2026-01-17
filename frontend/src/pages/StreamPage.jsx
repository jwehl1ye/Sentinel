import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye, StopCircle, Zap, MapPin, Upload, Users, Lock,
  AlertTriangle, CheckCircle, Shield, Loader, X, Volume2, VolumeX,
  EyeOff
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { startDeterrent, stopDeterrent } from '../services/deterrent'
import './StreamPage.css'

export default function StreamPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPractice = searchParams.get('practice') === 'true'
  const isSilentFromUrl = searchParams.get('silent') === 'true'
  const { settings } = useAuth()

  const [phase, setPhase] = useState('initializing')
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(0)
  const [location, setLocation] = useState(null)
  const [countdown, setCountdown] = useState(30)
  const [notifiedContacts, setNotifiedContacts] = useState([])
  const [deterrentActive, setDeterrentActive] = useState(false)
  const [streamId, setStreamId] = useState(null)
  const [videoReady, setVideoReady] = useState(false)
  const [isSilentMode, setIsSilentMode] = useState(isSilentFromUrl)
  const [fakeAppValue, setFakeAppValue] = useState('0')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const countdownRef = useRef(null)

  useEffect(() => {
    initializeStream()
    return () => cleanup()
  }, [])

  useEffect(() => {
    if (phase === 'recording') {
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'cancel-window') {
      const cancelSeconds = settings?.cancel_window_seconds || 30
      setCountdown(cancelSeconds)
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(countdownRef.current)
            handleSave()
            return 0
          }
          return c - 1
        })
      }, 1000)
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [phase])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    stopDeterrent()
  }

  const initializeStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.log('Location unavailable')
      )

      if (!isPractice) {
        const response = await api.startStream()
        setStreamId(response.session.id)
        setNotifiedContacts(response.notified || [])
      }

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorderRef.current = recorder
      recorder.start(1000)

      setPhase('recording')

      // Only activate deterrent in non-silent mode
      if (!isSilentMode && settings?.show_deterrent_banner && settings?.enable_sound) {
        setDeterrentActive(true)
        startDeterrent()
      }
    } catch (err) {
      console.error('Stream init error:', err)
      setError(err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : err.message)
      setPhase('error')
    }
  }

  const handleStop = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
    stopDeterrent()
    setDeterrentActive(false)
    setPhase('cancel-window')
  }

  const handleCancel = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current)

    if (!isPractice && streamId) {
      await api.endStream(streamId, true)
    }

    chunksRef.current = []
    cleanup()
    setPhase('cancelled')

    setTimeout(() => navigate('/'), 2000)
  }

  const handleSave = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setPhase('uploading')

    try {
      if (!isPractice && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        await api.uploadRecording(blob, {
          duration,
          latitude: location?.lat,
          longitude: location?.lng,
          stream_id: streamId,
          silent_mode: isSilentMode
        })

        if (streamId) {
          await api.endStream(streamId, false)
        }

        const contactsRes = await api.getEmergencyContacts()
        const contactIds = contactsRes.contacts?.map(c => c.id) || []
        if (contactIds.length > 0) {
          const recRes = await api.getRecordings()
          const latest = recRes.recordings?.[0]
          if (latest) {
            await api.shareRecording(latest.id, contactIds)
          }
        }
      }

      cleanup()
      setPhase('saved')
      setTimeout(() => navigate('/'), 3000)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save recording')
      setPhase('error')
    }
  }

  const toggleDeterrent = () => {
    if (deterrentActive) {
      stopDeterrent()
      setDeterrentActive(false)
    } else {
      startDeterrent()
      setDeterrentActive(true)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Fake calculator button handler for silent mode
  const handleFakeCalcButton = (val) => {
    if (val === 'C') {
      setFakeAppValue('0')
    } else if (val === '=') {
      // Stop recording when = is pressed
      handleStop()
    } else {
      setFakeAppValue(prev => prev === '0' ? val : prev + val)
    }
  }

  if (phase === 'error') {
    return (
      <div className="stream-page stream-error">
        <AlertTriangle size={64} />
        <h2>CAMERA ERROR</h2>
        <p>{error}</p>
        {error.includes('permission') && (
          <p className="error-hint">On mobile, ensure HTTPS is enabled for camera access.</p>
        )}
        <button className="btn btn-outline" onClick={() => navigate('/')}>
          GO BACK
        </button>
      </div>
    )
  }

  if (phase === 'cancelled') {
    return (
      <div className="stream-page stream-result">
        <div className="result-icon cancelled">
          <CheckCircle size={48} />
        </div>
        <h2>RECORDING CANCELLED</h2>
        <p>Video has been deleted</p>
      </div>
    )
  }

  if (phase === 'uploading') {
    return (
      <div className="stream-page stream-result">
        <Loader size={48} className="uploading-spinner" />
        <h2>UPLOADING & SAVING</h2>
        <p>Please wait...</p>
      </div>
    )
  }

  if (phase === 'saved') {
    return (
      <div className="stream-page stream-result">
        <div className="result-icon saved">
          <Shield size={48} />
        </div>
        <h2>VIDEO SAVED & SHARED</h2>
        <p>Recording has been securely stored</p>
        {isSilentMode && (
          <span className="badge badge-info" style={{ marginTop: '8px' }}>
            <EyeOff size={14} />
            Silent Recording
          </span>
        )}
        {notifiedContacts.length > 0 && (
          <div className="notified-list">
            <span>Shared with:</span>
            {notifiedContacts.map((name, i) => (
              <span key={i} className="badge badge-safe">{name}</span>
            ))}
          </div>
        )}
      </div>
    )
  }

  // SILENT MODE - Show fake calculator app
  if (isSilentMode && phase === 'recording') {
    return (
      <div className="stream-page silent-mode">
        <div className="fake-calculator">
          <div className="calc-display">
            <span className="calc-value">{fakeAppValue}</span>
          </div>
          <div className="calc-buttons">
            {['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='].map(btn => (
              <button
                key={btn}
                className={`calc-btn ${['÷', '×', '-', '+', '='].includes(btn) ? 'operator' : ''} ${btn === '0' ? 'zero' : ''}`}
                onClick={() => handleFakeCalcButton(btn)}
              >
                {btn}
              </button>
            ))}
          </div>
          <div className="silent-indicator">
            <EyeOff size={12} />
            <span>Recording</span>
            <span className="silent-time">{formatTime(duration)}</span>
          </div>
        </div>
        {/* Hidden video element for recording */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="silent-video"
          onPlaying={() => setVideoReady(true)}
        />
      </div>
    )
  }

  return (
    <div className="stream-page">
      {isPractice && (
        <div className="practice-banner">
          <Zap size={16} />
          <span>PRACTICE MODE - No data will be saved</span>
        </div>
      )}

      {phase === 'recording' && settings?.show_deterrent_banner && (
        <div className="deterrent-banner">
          <Eye size={18} />
          <span className="live-badge">● LIVE</span>
          <span>THIS IS BEING RECORDED & STREAMED TO AUTHORITIES</span>
        </div>
      )}

      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPlaying={() => setVideoReady(true)}
          className={videoReady ? 'video-ready' : 'video-loading'}
        />

        {phase === 'recording' && (
          <>
            <div className="recording-overlay">
              <div className="rec-indicator">
                <span className="rec-dot" />
                <span>REC</span>
              </div>
              <span className="duration">{formatTime(duration)}</span>
            </div>

            {location && (
              <div className="location-overlay">
                <MapPin size={14} />
                <span>{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</span>
              </div>
            )}

            <div className="stream-indicators">
              <div className="indicator">
                <Upload size={14} />
                <span>UPLOADING TO CLOUD</span>
              </div>
              <div className="indicator">
                <Users size={14} />
                <span>{notifiedContacts.length} CONTACTS NOTIFIED</span>
              </div>
              <div className="indicator">
                <Lock size={14} />
                <span>ENCRYPTED & PERMANENT</span>
              </div>
            </div>
          </>
        )}

        {phase === 'cancel-window' && (
          <div className="cancel-overlay">
            <div className="countdown-number">{countdown}</div>
            <p className="countdown-label">SECONDS TO CANCEL</p>
            <p className="countdown-info">
              False alarm? Cancel now to delete the recording.
              Otherwise it will be saved and shared automatically.
            </p>
            <div className="cancel-buttons">
              <button className="btn btn-outline" onClick={handleCancel}>
                <X size={18} />
                CANCEL & DELETE
              </button>
              <button className="btn btn-danger" onClick={handleSave}>
                SAVE & SHARE NOW
              </button>
            </div>
            <div className="countdown-progress">
              <div
                className="progress-bar"
                style={{ width: `${(countdown / (settings?.cancel_window_seconds || 30)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {phase === 'recording' && (
        <div className="recording-controls">
          <button
            className={`deterrent-toggle ${deterrentActive ? 'active' : ''}`}
            onClick={toggleDeterrent}
          >
            {deterrentActive ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button className="stop-button" onClick={handleStop}>
            <StopCircle size={24} />
            <span>STOP RECORDING</span>
          </button>
        </div>
      )}

      {phase === 'initializing' && (
        <div className="initializing-overlay">
          <Loader size={32} className="uploading-spinner" />
          <p>Initializing camera...</p>
        </div>
      )}
    </div>
  )
}
