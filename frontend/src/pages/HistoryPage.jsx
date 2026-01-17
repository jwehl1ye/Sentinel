import { useState, useEffect } from 'react'
import { 
  Clock, Video, Shield, Download, Trash2, Eye, Share2
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../services/api'
import './HistoryPage.css'

export default function HistoryPage() {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)

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
    } catch (err) {
      console.error('Failed to delete recording:', err)
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const savedCount = recordings.filter(r => r.status === 'saved').length
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

              <div className="recording-preview">
                <Video size={32} />
                <span className="duration-badge">{formatDuration(recording.duration)}</span>
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
                <button className="action-btn">
                  <Eye size={16} />
                  VIEW
                </button>
                <button className="action-btn">
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
    </div>
  )
}

