import { useState, useEffect } from 'react'
import { 
  MapPin, Play, Pause, Plus, X, Clock, Share2, Battery, 
  Home as HomeIcon, Briefcase, GraduationCap, Dumbbell
} from 'lucide-react'
import api from '../services/api'
import './LocationPage.css'

const locationTypes = [
  { id: 'home', emoji: '🏠', icon: HomeIcon, label: 'Home' },
  { id: 'work', emoji: '🏢', icon: Briefcase, label: 'Work' },
  { id: 'school', emoji: '🎓', icon: GraduationCap, label: 'School' },
  { id: 'gym', emoji: '💪', icon: Dumbbell, label: 'Gym' },
  { id: 'other', emoji: '📍', icon: MapPin, label: 'Other' }
]

const tabs = ['Safe Locations', 'Smart Alerts', 'Movement', 'Sharing']

export default function LocationPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [tracking, setTracking] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [battery, setBattery] = useState(null)
  const [safeLocations, setSafeLocations] = useState([])
  const [alerts, setAlerts] = useState([])
  const [movements, setMovements] = useState([])
  const [shares, setShares] = useState([])
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [newLocation, setNewLocation] = useState({ name: '', type: 'home', radius: 100 })

  useEffect(() => {
    loadData()
    getCurrentLocation()
    getBatteryLevel()
  }, [])

  const loadData = async () => {
    try {
      const [locRes, alertRes, moveRes, shareRes] = await Promise.all([
        api.getSafeLocations(),
        api.getAlerts(),
        api.getMovementHistory(7),
        api.getLocationShares()
      ])
      setSafeLocations(locRes.locations || [])
      setAlerts(alertRes.alerts || [])
      setMovements(moveRes.events || [])
      setShares(shareRes.shares || [])
    } catch (err) {
      console.error('Failed to load location data:', err)
    }
  }

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          })
        },
        err => console.error('Location error:', err)
      )
    }
  }

  const getBatteryLevel = async () => {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery()
      setBattery(Math.round(battery.level * 100))
      battery.addEventListener('levelchange', () => {
        setBattery(Math.round(battery.level * 100))
      })
    }
  }

  const toggleTracking = () => {
    setTracking(!tracking)
  }

  const addSafeLocation = async () => {
    if (!newLocation.name || !currentLocation) return
    
    try {
      await api.addSafeLocation({
        name: newLocation.name,
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        radius_meters: newLocation.radius,
        type: newLocation.type,
        is_primary: newLocation.type === 'home'
      })
      loadData()
      setShowAddLocation(false)
      setNewLocation({ name: '', type: 'home', radius: 100 })
    } catch (err) {
      console.error('Failed to add location:', err)
    }
  }

  const deleteSafeLocation = async (id) => {
    try {
      await api.deleteSafeLocation(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete location:', err)
    }
  }

  const createShare = async (hours) => {
    try {
      await api.createLocationShare(hours)
      loadData()
    } catch (err) {
      console.error('Failed to create share:', err)
    }
  }

  const stopShare = async (id) => {
    try {
      await api.stopLocationShare(id)
      loadData()
    } catch (err) {
      console.error('Failed to stop share:', err)
    }
  }

  const getTypeEmoji = (type) => {
    return locationTypes.find(t => t.id === type)?.emoji || '📍'
  }

  return (
    <div className="page location-page">
      <div className="page-header">
        <MapPin size={28} />
        <h1>LOCATION SAFETY</h1>
      </div>

      <div className="tracking-status">
        <div className="status-indicator">
          <span className={`status-dot ${tracking ? 'active' : ''}`} />
          <span>{tracking ? 'Live Tracking Active' : 'Tracking Paused'}</span>
        </div>
        <button 
          className={`btn ${tracking ? 'btn-outline' : 'btn-safe'}`}
          onClick={toggleTracking}
        >
          {tracking ? <Pause size={18} /> : <Play size={18} />}
          {tracking ? 'Stop' : 'Start'}
        </button>
      </div>

      {currentLocation && (
        <div className="current-location card">
          <div className="location-coords">
            <MapPin size={18} />
            <span>{currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</span>
          </div>
          <div className="location-meta">
            <span>±{Math.round(currentLocation.accuracy)}m</span>
            {battery !== null && (
              <span className={`battery ${battery < 20 ? 'low' : ''}`}>
                <Battery size={14} />
                {battery}%
              </span>
            )}
          </div>
        </div>
      )}

      <div className="tab-nav">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            className={`tab-item ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className="tab-content">
          <div className="safe-locations-list">
            {safeLocations.map(loc => (
              <div key={loc.id} className="safe-location-card">
                <span className="location-emoji">{getTypeEmoji(loc.type)}</span>
                <div className="location-info">
                  <span className="location-name">{loc.name}</span>
                  <span className="location-radius">{loc.radius_meters}m radius</span>
                </div>
                {loc.is_primary && <span className="badge badge-safe">Primary</span>}
                <button className="btn-icon" onClick={() => deleteSafeLocation(loc.id)}>
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          <button 
            className="add-location-btn"
            onClick={() => setShowAddLocation(true)}
            disabled={!currentLocation}
          >
            <Plus size={20} />
            <span>Add Current Location</span>
          </button>

          {showAddLocation && (
            <div className="modal-overlay" onClick={() => setShowAddLocation(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">ADD SAFE LOCATION</h2>
                
                <div className="form-group">
                  <label className="label">Name</label>
                  <input
                    type="text"
                    className="input"
                    value={newLocation.name}
                    onChange={e => setNewLocation({ ...newLocation, name: e.target.value })}
                    placeholder="e.g., My Home"
                  />
                </div>

                <div className="form-group">
                  <label className="label">Type</label>
                  <div className="type-selector">
                    {locationTypes.map(type => (
                      <button
                        key={type.id}
                        className={`type-btn ${newLocation.type === type.id ? 'active' : ''}`}
                        onClick={() => setNewLocation({ ...newLocation, type: type.id })}
                      >
                        <span>{type.emoji}</span>
                        <span>{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Radius: {newLocation.radius}m</label>
                  <input
                    type="range"
                    min="25"
                    max="500"
                    value={newLocation.radius}
                    onChange={e => setNewLocation({ ...newLocation, radius: parseInt(e.target.value) })}
                    className="range-input"
                  />
                </div>

                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={() => setShowAddLocation(false)}>Cancel</button>
                  <button className="btn btn-danger" onClick={addSafeLocation}>Add Location</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div className="tab-content">
          <div className="alerts-list">
            <div className="alert-item">
              <span className="alert-emoji">🌙</span>
              <div className="alert-info">
                <span className="alert-name">Outside home late at night</span>
                <span className="alert-desc">Alert if away from home after 11 PM</span>
              </div>
              <div className="toggle active" />
            </div>
            <div className="alert-item">
              <span className="alert-emoji">🏠</span>
              <div className="alert-info">
                <span className="alert-name">Not home by specific time</span>
                <span className="alert-desc">Alert if not home by set time</span>
              </div>
              <div className="toggle" />
            </div>
            <div className="alert-item">
              <span className="alert-emoji">✅</span>
              <div className="alert-info">
                <span className="alert-name">Daily check-in reminder</span>
                <span className="alert-desc">Remind to check in daily</span>
              </div>
              <div className="toggle" />
            </div>
            <div className="alert-item">
              <span className="alert-emoji">⏰</span>
              <div className="alert-info">
                <span className="alert-name">Away too long</span>
                <span className="alert-desc">Alert if away from home 24+ hours</span>
              </div>
              <div className="toggle" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 2 && (
        <div className="tab-content">
          <div className="movements-list">
            {movements.length === 0 ? (
              <p className="text-muted text-center">No movement events recorded</p>
            ) : (
              movements.map(event => (
                <div key={event.id} className="movement-item">
                  <span className="movement-icon">
                    {event.event_type === 'arrival' ? '📥' : '📤'}
                  </span>
                  <div className="movement-info">
                    <span className="movement-type">
                      {event.event_type === 'arrival' ? 'Arrived at' : 'Left'} {event.location_name || 'Unknown'}
                    </span>
                    <span className="movement-time">
                      {new Date(event.occurred_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="text-muted text-center" style={{ marginTop: 16, fontSize: '0.75rem' }}>
            Movement history auto-deletes after 30 days
          </p>
        </div>
      )}

      {activeTab === 3 && (
        <div className="tab-content">
          <div className="share-options">
            <p className="share-label">Share your location for:</p>
            <div className="share-durations">
              {[1, 4, 24, 168].map(hours => (
                <button 
                  key={hours} 
                  className="btn btn-outline"
                  onClick={() => createShare(hours)}
                >
                  {hours < 24 ? `${hours}h` : hours === 24 ? '24h' : '1 week'}
                </button>
              ))}
            </div>
          </div>

          {shares.length > 0 && (
            <div className="active-shares">
              <h3 className="section-title">ACTIVE SHARES</h3>
              {shares.map(share => (
                <div key={share.id} className="share-card">
                  <Share2 size={18} />
                  <div className="share-info">
                    <span className="share-code">{share.share_code}</span>
                    <span className="share-expires">
                      Expires: {new Date(share.expires_at).toLocaleString()}
                    </span>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => stopShare(share.id)}>
                    Stop
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="info-banner info mt-4">
            <Battery size={18} />
            <div>
              <strong>Dead Phone Protection</strong>
              <p style={{ marginTop: 4, fontSize: '0.8rem' }}>
                Your last known location is backed up to the cloud. 
                If your phone dies, contacts can still see where you were.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

