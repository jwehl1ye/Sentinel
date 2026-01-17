import { useState, useEffect } from 'react'
import {
  Clock, Video, Shield, Download, Trash2, Eye, Share2, X, Play
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../services/api'
import './HistoryPage.css'

const API_BASE = 'http://localhost:3001'

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
        <div className="video-modal-overlay" onClick={() => setSelectedRecording(null)}>
          <div className="video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="video-modal-header">
              <span>Recording from {format(new Date(selectedRecording.created_at), 'MMM d, yyyy')}</span>
              <button className="close-btn" onClick={() => setSelectedRecording(null)}>
                <X size={24} />
              </button>
            </div>
            <video
              src={getVideoUrl(selectedRecording)}
              controls
              autoPlay
              className="video-player"
            />
            <div className="video-modal-actions">
              <button className="btn btn-outline" onClick={() => downloadRecording(selectedRecording)}>
                <Download size={18} />
                DOWNLOAD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
