import { useState, useEffect, useRef, useCallback } from 'react'
import { Phone, PhoneOff, Mic, MicOff, AlertTriangle, MapPin, Loader, Send, X, Shield, Video, VideoOff } from 'lucide-react'
import api from '../services/api'
import './EmergencyCallModal.css'

export default function EmergencyCallModal({ 
  isOpen, 
  onClose, 
  location, 
  videoRef,
  onCallStatusChange 
}) {
  const [callStatus, setCallStatus] = useState('idle') // idle, connecting, active, ended
  const [callId, setCallId] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [operatorInput, setOperatorInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [situation, setSituation] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState('')
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false)
  const [lastVideoAnalysis, setLastVideoAnalysis] = useState(null)
  const [callType, setCallType] = useState(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  const transcriptEndRef = useRef(null)
  const timerRef = useRef(null)
  const videoAnalysisRef = useRef(null)
  const audioContextRef = useRef(null)
  const canvasRef = useRef(null)

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Call duration timer
  useEffect(() => {
    if (callStatus === 'active') {
      timerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)

      // Start periodic video analysis
      videoAnalysisRef.current = setInterval(() => {
        captureAndAnalyzeVideo()
      }, 10000) // Analyze every 10 seconds
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (videoAnalysisRef.current) clearInterval(videoAnalysisRef.current)
    }
  }, [callStatus])

  // Notify parent of status changes
  useEffect(() => {
    onCallStatusChange?.(callStatus)
  }, [callStatus, onCallStatusChange])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (videoAnalysisRef.current) clearInterval(videoAnalysisRef.current)
    }
  }, [])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Capture video frame and convert to base64
  const captureVideoFrame = useCallback(() => {
    if (!videoRef?.current) return null

    try {
      const video = videoRef.current
      if (!video.videoWidth || !video.videoHeight) return null

      // Create canvas if not exists
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }
      
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0)
      
      // Convert to base64 JPEG
      return canvas.toDataURL('image/jpeg', 0.7)
    } catch (e) {
      console.error('Error capturing video frame:', e)
      return null
    }
  }, [videoRef])

  // Analyze current video frame
  const captureAndAnalyzeVideo = useCallback(async () => {
    if (callStatus !== 'active' || isAnalyzingVideo) return

    const frame = captureVideoFrame()
    if (!frame) return

    setIsAnalyzingVideo(true)
    try {
      const result = await api.updateEmergencyVideo({ videoFrame: frame })
      if (result.analysis) {
        setLastVideoAnalysis(result.analysis)
        
        // Add to transcript as system message
        setTranscript(prev => [...prev, {
          role: 'system',
          content: `[Video Update] ${result.analysis}`,
          timestamp: new Date().toISOString()
        }])
      }
    } catch (e) {
      console.error('Video analysis error:', e)
    }
    setIsAnalyzingVideo(false)
  }, [callStatus, isAnalyzingVideo, captureVideoFrame])

  // Text-to-speech for AI responses
  const speakText = async (text) => {
    if (isMuted) return
    
    setIsSpeaking(true)
    try {
      const response = await fetch(`${getApiBase()}/api/emergency/synthesize-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ text })
      })

      if (response.ok) {
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        audio.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
        }
        
        audio.onerror = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
        }
        
        await audio.play()
      } else {
        setIsSpeaking(false)
      }
    } catch (e) {
      console.error('TTS error:', e)
      setIsSpeaking(false)
    }
  }

  const getApiBase = () => {
    const hostname = window.location.hostname
    const port = window.location.port
    if (hostname === 'localhost' || hostname === '127.0.0.1' || port === '5173') {
      return `http://${hostname}:3001`
    }
    return window.location.origin
  }

  const initiateCall = async () => {
    setCallStatus('connecting')
    setError('')
    setTranscript([])
    setCallDuration(0)
    setLastVideoAnalysis(null)

    try {
      // Capture initial video frame for analysis
      const videoFrame = captureVideoFrame()
      let initialVideoAnalysis = null
      
      if (videoFrame) {
        try {
          const analysisResult = await api.analyzeEmergencySituation({
            videoDescription: 'Live video feed from emergency'
          })
          initialVideoAnalysis = analysisResult?.summary
        } catch (e) {
          console.log('Initial video analysis failed:', e)
        }
      }

      const situationDesc = situation || 'Emergency situation - caller may be in danger and cannot speak'

      const response = await api.initiateEmergencyCall({
        location: location || { address: 'Location unknown' },
        situation: situationDesc,
        videoAnalysis: initialVideoAnalysis
      })

      if (response.success) {
        setCallId(response.callId)
        setCallStatus('active')
        setCallType(response.callType)
        
        // Add initial messages to transcript
        setTranscript([
          {
            role: 'system',
            content: response.callType === 'real' 
              ? `Real phone call connected to: ${response.testNumber}`
              : `Simulated call (Twilio not configured) - Test number: ${response.testNumber}`,
            timestamp: new Date().toISOString()
          },
          {
            role: 'system',
            content: `Location: ${response.location?.address || 'Coordinates: ' + response.location?.lat?.toFixed(4) + ', ' + response.location?.lng?.toFixed(4)}`,
            timestamp: new Date().toISOString()
          },
          {
            role: 'ai',
            content: response.initialMessage,
            timestamp: new Date().toISOString()
          }
        ])

        // Speak the initial message
        speakText(response.initialMessage)
      } else {
        throw new Error(response.error || 'Failed to connect')
      }
    } catch (err) {
      console.error('Call error:', err)
      const errorMsg = err.message || 'Failed to initiate call'
      
      // If call already in progress, offer to reset
      if (errorMsg.includes('already in progress')) {
        setError('Previous call still active. Click "Reset" to clear it.')
      } else {
        setError(errorMsg)
      }
      setCallStatus('idle')
    }
  }

  const handleForceReset = async () => {
    try {
      await api.forceResetEmergencyCall()
      setError('')
      setTranscript([])
      setCallId(null)
    } catch (e) {
      console.error('Reset error:', e)
    }
  }

  const endCall = async () => {
    try {
      if (callId) {
        await api.endEmergencyCall()
      }
    } catch (e) {
      console.log('End call error:', e)
    }
    
    setCallStatus('ended')
    if (timerRef.current) clearInterval(timerRef.current)
    if (videoAnalysisRef.current) clearInterval(videoAnalysisRef.current)
  }

  const handleOperatorMessage = async () => {
    if (!operatorInput.trim() || isProcessing) return

    const message = operatorInput.trim()
    setOperatorInput('')
    setIsProcessing(true)

    // Add operator message to transcript
    setTranscript(prev => [...prev, {
      role: 'operator',
      content: message,
      timestamp: new Date().toISOString()
    }])

    try {
      // Capture current video frame to send with response
      const videoFrame = captureVideoFrame()
      
      const response = await api.getEmergencyAIResponse(message, callId, videoFrame)
      
      if (response.response) {
        setTranscript(prev => [...prev, {
          role: 'ai',
          content: response.response,
          timestamp: new Date().toISOString()
        }])
        
        // Speak the response
        speakText(response.response)
      }
    } catch (err) {
      console.error('AI response error:', err)
      const errorResponse = 'I apologize, I am having difficulty. Please stay on the line.'
      setTranscript(prev => [...prev, {
        role: 'ai',
        content: errorResponse,
        timestamp: new Date().toISOString()
      }])
      speakText(errorResponse)
    }

    setIsProcessing(false)
  }

  const handleManualVideoAnalysis = async () => {
    await captureAndAnalyzeVideo()
  }

  const handleClose = () => {
    if (callStatus === 'active') {
      if (window.confirm('Are you sure you want to end the emergency call?')) {
        endCall()
        onClose()
      }
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="emergency-modal-overlay">
      <div className="emergency-modal">
        <div className="emergency-header">
          <div className="emergency-title">
            <AlertTriangle size={24} className="emergency-icon" />
            <span>EMERGENCY CALL</span>
          </div>
          <button className="close-btn" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {/* Call Status Display */}
        <div className={`call-status-display ${callStatus}`}>
          {callStatus === 'idle' && (
            <>
              <Shield size={48} />
              <h3>AI Emergency Assistant</h3>
              <p>The AI will call emergency services and communicate on your behalf using live video analysis and your location.</p>
              
              <div className="location-info">
                <MapPin size={16} />
                <span>
                  {location?.address || 
                   (location?.lat ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Getting location...')}
                </span>
              </div>

              <div className="situation-input">
                <label>Describe your emergency (optional):</label>
                <textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="e.g., Someone is following me, I heard gunshots, etc."
                  rows={2}
                />
              </div>

              {error && (
                <div className="error-container">
                  <p className="error-message">{error}</p>
                  {error.includes('Reset') && (
                    <button className="reset-btn" onClick={handleForceReset}>
                      Reset Previous Call
                    </button>
                  )}
                </div>
              )}

              <button className="call-911-btn" onClick={initiateCall}>
                <Phone size={24} />
                <span>CALL 911</span>
              </button>

              <p className="test-notice">
                <AlertTriangle size={14} />
                TEST MODE: Calls go to +1 (437) 254-1201
              </p>
            </>
          )}

          {callStatus === 'connecting' && (
            <>
              <Loader size={48} className="spin" />
              <h3>Connecting...</h3>
              <p>Establishing emergency call</p>
            </>
          )}

          {callStatus === 'active' && (
            <>
              <div className="active-call-header">
                <div className="call-indicator">
                  <span className="pulse-dot" />
                  <span>
                    {callType === 'real' ? 'LIVE CALL' : 'SIMULATED CALL'}
                  </span>
                </div>
                <span className="call-timer">{formatTime(callDuration)}</span>
              </div>

              {/* Video Analysis Status */}
              <div className="video-analysis-status">
                <Video size={14} />
                <span>
                  {isAnalyzingVideo ? 'Analyzing video...' : 'Video feed active'}
                </span>
                <button 
                  className="analyze-now-btn" 
                  onClick={handleManualVideoAnalysis}
                  disabled={isAnalyzingVideo}
                >
                  Analyze Now
                </button>
              </div>

              <div className="transcript-container">
                {transcript.map((msg, i) => (
                  <div key={i} className={`transcript-message ${msg.role}`}>
                    <span className="message-role">
                      {msg.role === 'operator' ? '911 Operator' : 
                       msg.role === 'ai' ? 'AI Assistant' : 
                       msg.role === 'system' ? 'System' : msg.role}
                    </span>
                    <p>{msg.content}</p>
                  </div>
                ))}
                {isProcessing && (
                  <div className="transcript-message ai">
                    <span className="message-role">AI Assistant</span>
                    <p className="typing"><Loader size={14} className="spin" /> Analyzing and responding...</p>
                  </div>
                )}
                {isSpeaking && (
                  <div className="speaking-indicator">
                    <span className="sound-wave" />
                    <span>Speaking...</span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>

              <div className="operator-input-section">
                <p className="input-label">
                  {callType === 'real' 
                    ? 'Type what the 911 operator says:' 
                    : 'Simulate operator question:'}
                </p>
                <div className="input-row">
                  <input
                    type="text"
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleOperatorMessage()}
                    placeholder="Type what the operator says..."
                    disabled={isProcessing}
                  />
                  <button 
                    onClick={handleOperatorMessage}
                    disabled={!operatorInput.trim() || isProcessing}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>

              <div className="call-controls">
                <button 
                  className={`mute-btn ${isMuted ? 'muted' : ''}`}
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? 'Unmute AI voice' : 'Mute AI voice'}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button className="end-call-btn" onClick={endCall}>
                  <PhoneOff size={24} />
                  <span>END CALL</span>
                </button>
              </div>
            </>
          )}

          {callStatus === 'ended' && (
            <>
              <CheckCircle size={48} />
              <h3>Call Ended</h3>
              <p>Duration: {formatTime(callDuration)}</p>
              
              {transcript.length > 0 && (
                <div className="transcript-summary">
                  <h4>Call Transcript</h4>
                  <div className="transcript-container readonly">
                    {transcript.map((msg, i) => (
                      <div key={i} className={`transcript-message ${msg.role}`}>
                        <span className="message-role">
                          {msg.role === 'operator' ? '911 Operator' : 
                           msg.role === 'ai' ? 'AI Assistant' : 
                           msg.role === 'system' ? 'System' : msg.role}
                        </span>
                        <p>{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-outline" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckCircle({ size, className }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
