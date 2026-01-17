import { useState, useEffect, useRef } from 'react'
import {
  Clock, Video, Shield, Download, Trash2, Eye, Share2, X, Play,
  AlertTriangle, CheckCircle, Loader, FileText, MessageCircle, Send, ChevronDown, ChevronUp
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../services/api'
import './HistoryPage.css'

const API_BASE = (() => {
  const hostname = window.location.hostname
  const port = window.location.port
  if (hostname === 'localhost' || hostname === '127.0.0.1' || port === '5173') {
    return `http://${hostname}:3001`
  }
  return window.location.origin
})()

export default function HistoryPage() {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRecording, setSelectedRecording] = useState(null)

  useEffect(() => {
    loadRecordings()
  }, [])

  const loadRecordings = async () => {
    try {
      const res = await api.getRecordings()
      setRecordings(res.recordings || [])
    } catch (err) {
      console.error('Failed to load recordings:', err)
    } finally {
      setLoading(false)
    }
  }

  const deleteRecording = async (id) => {
    if (!confirm('Are you sure you want to delete this recording?')) return

    try {
      await api.deleteRecording(id)
      loadRecordings()
      setSelectedRecording(null)
    } catch (err) {
      console.error('Failed to delete recording:', err)
    }
  }

  const viewRecording = (recording) => {
    setSelectedRecording(recording)
  }

  const downloadRecording = async (recording) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/recordings/${recording.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recording-${recording.id}-${format(new Date(recording.created_at), 'yyyy-MM-dd')}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
      alert('Failed to download recording')
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getVideoUrl = (recording) => {
    const token = localStorage.getItem('token')
    return `${API_BASE}/api/recordings/${recording.id}/stream?token=${token}`
  }

  const sharedCount = recordings.filter(r => r.is_shared).length

  if (loading) {
    return (
      <div className="page flex-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div className="page history-page">
      <div className="page-header">
        <Clock size={28} />
        <h1>RECORDING HISTORY</h1>
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{recordings.length}</span>
          <span className="stat-label">Total Recordings</span>
        </div>
        <div className="stat">
          <span className="stat-value">{sharedCount}</span>
          <span className="stat-label">Saved & Shared</span>
        </div>
      </div>

      {recordings.length === 0 ? (
        <div className="empty-state">
          <Video size={48} />
          <h3>NO RECORDINGS YET</h3>
          <p>Your emergency recordings will appear here</p>
        </div>
      ) : (
        <div className="recordings-list">
          {recordings.map(recording => (
            <div key={recording.id} className="recording-card">
              <div className="recording-header">
                <span className="badge badge-safe">SAVED</span>
                <span className="recording-date">
                  {format(new Date(recording.created_at), 'MMM d, yyyy • h:mm a')}
                </span>
              </div>

              <div className="recording-preview" onClick={() => viewRecording(recording)}>
                <Play size={32} />
                <span className="duration-badge">{formatDuration(recording.duration || 0)}</span>
                <span className="tap-to-play">Tap to play</span>
              </div>

              <div className="recording-meta">
                <span className="recording-id">
                  ID: {recording.id.toString().slice(0, 8)}...
                </span>
                <span className="recording-size">{formatFileSize(recording.file_size)}</span>
              </div>

              {recording.is_shared && recording.shared_with?.length > 0 && (
                <div className="shared-with">
                  <Share2 size={14} />
                  <span>Shared with {recording.shared_with.length} contacts</span>
                </div>
              )}

              <div className="recording-actions">
                <button className="action-btn" onClick={() => viewRecording(recording)}>
                  <Eye size={16} />
                  VIEW
                </button>
                <button className="action-btn" onClick={() => downloadRecording(recording)}>
                  <Download size={16} />
                  DOWNLOAD
                </button>
                <button
                  className="action-btn danger"
                  onClick={() => deleteRecording(recording.id)}
                >
                  <Trash2 size={16} />
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="info-banner safe mt-4">
        <Shield size={18} />
        <span>All recordings are permanently stored in secure cloud storage and cannot be deleted by anyone except you.</span>
      </div>

      {/* Video Player Modal */}
      {selectedRecording && (
        <VideoModal
          recording={selectedRecording}
          onClose={() => setSelectedRecording(null)}
          onDownload={() => downloadRecording(selectedRecording)}
          getVideoUrl={getVideoUrl}
        />
      )}
    </div>
  )
}

function VideoModal({ recording, onClose, onDownload, getVideoUrl }) {
  const [aiEvents, setAiEvents] = useState([])
  const [aiSummary, setAiSummary] = useState(null)
  const [analysisStatus, setAnalysisStatus] = useState('loading')
  const [analysisMessage, setAnalysisMessage] = useState('')
  
  // Gemini states
  const [geminiSummary, setGeminiSummary] = useState(null)
  const [rawSummary, setRawSummary] = useState(null)
  const [showRaw, setShowRaw] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  
  // Chat states
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const res = await api.getRecordingAnalysis(recording.id)
        setAnalysisStatus(res.status)
        if (res.message) setAnalysisMessage(res.message)
        if (res.events) setAiEvents(res.events)
        if (res.summary) setAiSummary(res.summary)
      } catch (err) {
        console.error('Analysis fetch error:', err)
        setAnalysisStatus('error')
      }
    }
    fetchAnalysis()

    // Poll if processing
    const interval = setInterval(async () => {
      if (['loading', 'processing', 'pending', 'indexing', 'uploading', 'validating', 'queued'].includes(analysisStatus)) {
        try {
          const res = await api.getRecordingAnalysis(recording.id)
          setAnalysisStatus(res.status)
          if (res.message) setAnalysisMessage(res.message)
          if (res.events) setAiEvents(res.events)
          if (res.summary) setAiSummary(res.summary)
        } catch (err) {
          console.error('Polling error:', err)
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [recording.id, analysisStatus])

  // Fetch Gemini summary when analysis is ready
  useEffect(() => {
    if (analysisStatus === 'ready' && aiSummary && !geminiSummary && !summaryLoading) {
      fetchGeminiSummary()
    }
  }, [analysisStatus, aiSummary])

  const fetchGeminiSummary = async () => {
    setSummaryLoading(true)
    try {
      const res = await api.getRecordingAnalysisSummary(recording.id)
      if (res.summary) {
        setGeminiSummary(res.summary)
      }
      if (res.raw) {
        setRawSummary(res.raw)
      }
    } catch (err) {
      console.error('Gemini summary error:', err)
    }
    setSummaryLoading(false)
  }

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)

    try {
      const res = await api.chatAboutRecording(recording.id, userMessage, chatMessages)
      if (res.response) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: res.response }])
      } else if (res.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${res.message || res.error}` }])
      }
    } catch (err) {
      console.error('Chat error:', err)
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, there was an error processing your question.' }])
    }
    setChatLoading(false)
  }

  const formatGeminiText = (text) => {
    if (!text) return null
    // Convert markdown-style formatting to JSX
    return text.split('\n').map((line, i) => {
      // Bold headers
      if (line.startsWith('**') && line.endsWith('**')) {
        return <h5 key={i} className="gemini-header">{line.replace(/\*\*/g, '')}</h5>
      }
      // Bold inline
      if (line.includes('**')) {
        const parts = line.split(/\*\*/)
        return (
          <p key={i}>
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        )
      }
      // Bullet points
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return <li key={i}>{line.substring(2)}</li>
      }
      // Empty lines
      if (!line.trim()) return <br key={i} />
      // Regular text
      return <p key={i}>{line}</p>
    })
  }

  return (
    <div className="video-modal-overlay" onClick={onClose}>
      <div className="video-modal" onClick={(e) => e.stopPropagation()}>
        <div className="video-modal-header">
          <span>Recording from {format(new Date(recording.created_at), 'MMM d, yyyy')}</span>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="video-container">
          <video
            src={getVideoUrl(recording)}
            controls
            autoPlay
            className="video-player"
          />
          {aiEvents.length > 0 && (
            <div className="ai-markers-overlay">
              {aiEvents.map((event, i) => (
                <div
                  key={i}
                  className="ai-marker"
                  style={{ left: `${(event.start / recording.duration) * 100}%` }}
                  title={`${event.type} detected at ${event.start}s`}
                />
              ))}
            </div>
          )}
        </div>

        {/* AI Analysis Section */}
        <div className="ai-analysis-section">
          <div className="analysis-header">
            <h4>AI THREAT DETECTION</h4>
            <div className={`status-badge ${analysisStatus}`}>
              {['loading', 'processing', 'pending', 'indexing', 'uploading', 'validating', 'queued'].includes(analysisStatus) ? (
                <>
                  <Loader size={14} className="spin" />
                  {analysisStatus === 'uploading' ? 'UPLOADING...' : analysisStatus === 'indexing' ? 'INDEXING...' : 'ANALYZING...'}
                </>
              ) : analysisStatus === 'ready' ? (
                <>
                  <CheckCircle size={14} />
                  COMPLETE
                </>
              ) : analysisStatus === 'unavailable' ? (
                <>
                  <AlertTriangle size={14} />
                  NOT AVAILABLE
                </>
              ) : (
                <span>{analysisStatus.toUpperCase()}</span>
              )}
            </div>
          </div>

          {/* Gemini Summary Section */}
          {analysisStatus === 'ready' && (
            <div className="ai-summary-container">
              {summaryLoading ? (
                <div className="summary-loading">
                  <Loader size={16} className="spin" />
                  <span>Generating safety analysis...</span>
                </div>
              ) : geminiSummary ? (
                <>
                  <div className="ai-summary scrollable">
                    <h5><Shield size={14} /> Safety Analysis</h5>
                    <div className="gemini-content">
                      {formatGeminiText(geminiSummary)}
                    </div>
                  </div>
                  
                  <button 
                    className="toggle-raw-btn"
                    onClick={() => setShowRaw(!showRaw)}
                  >
                    {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showRaw ? 'Hide' : 'Show'} Raw Analysis
                  </button>
                  
                  {showRaw && rawSummary && (
                    <div className="ai-summary raw scrollable">
                      <h5><FileText size={14} /> Raw TwelveLabs Analysis</h5>
                      <p>{rawSummary}</p>
                    </div>
                  )}
                </>
              ) : aiSummary && (
                <div className="ai-summary scrollable">
                  <h5><FileText size={14} /> Video Summary</h5>
                  <p>{aiSummary}</p>
                </div>
              )}
            </div>
          )}

          {/* Events List */}
          <div className="ai-events-list">
            {analysisStatus === 'unavailable' ? (
              <p className="no-threats">{analysisMessage || 'AI threat detection is not available for this video.'}</p>
            ) : aiEvents.length === 0 && analysisStatus === 'ready' ? (
              <p className="no-threats">No specific threats detected.</p>
            ) : (
              aiEvents.map((event, i) => (
                <div key={i} className="ai-event-item">
                  <AlertTriangle size={16} className="text-danger" />
                  <span className="event-time">{Math.floor(event.start)}s - {Math.floor(event.end)}s</span>
                  <span className="event-type">{event.type.toUpperCase()}</span>
                  <span className="event-confidence">{(event.confidence).toFixed(0)}% Confidence</span>
                </div>
              ))
            )}
          </div>

          {/* Chat Section */}
          {analysisStatus === 'ready' && (
            <div className="chat-section">
              <button 
                className="toggle-chat-btn"
                onClick={() => setShowChat(!showChat)}
              >
                <MessageCircle size={16} />
                {showChat ? 'Hide Chat' : 'Ask Questions About This Video'}
              </button>
              
              {showChat && (
                <div className="chat-container">
                  <div className="chat-messages">
                    {chatMessages.length === 0 && (
                      <div className="chat-placeholder">
                        Ask any question about this video and the AI will respond based on the analysis.
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`chat-message ${msg.role}`}>
                        <div className="message-content">
                          {msg.role === 'assistant' ? formatGeminiText(msg.content) : msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="chat-message assistant">
                        <div className="message-content loading">
                          <Loader size={14} className="spin" /> Thinking...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  
                  <div className="chat-input-container">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask about the video..."
                      disabled={chatLoading}
                    />
                    <button 
                      onClick={handleSendMessage} 
                      disabled={!chatInput.trim() || chatLoading}
                      className="send-btn"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="video-modal-actions">
          <button className="btn btn-outline" onClick={onDownload}>
            <Download size={18} />
            DOWNLOAD
          </button>
        </div>
      </div>
    </div>
  )
}
