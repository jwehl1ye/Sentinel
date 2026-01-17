import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Zap, Clock, Vibrate, Volume2, Eye, Bell, Shield,
  Heart, MapPin, HelpCircle, ChevronRight, Mic, AlertTriangle,
  EyeOff, Timer
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './SettingsPage.css'

const cancelWindowOptions = [30, 45, 60, 90]
const deadManIntervalOptions = [15, 30, 60, 120]

export default function SettingsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleSettingChange = async (key, value) => {
    setLoading(true)
    try {
      await updateSettings({ [key]: value })
    } catch (err) {
      console.error('Failed to update setting:', err)
    } finally {
      setLoading(false)
    }
  }

  const startPractice = () => {
    navigate('/stream?practice=true')
  }

  const startSilentPractice = () => {
    navigate('/stream?practice=true&silent=true')
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <Settings size={28} />
        <h1>SETTINGS</h1>
      </div>

      <section className="settings-section">
        <h3 className="section-title">PRACTICE MODE</h3>
        <div className="setting-card">
          <div className="setting-info">
            <Zap size={20} />
            <div>
              <span className="setting-name">Test Recording</span>
              <p className="setting-desc">Try the recording feature without saving data</p>
            </div>
          </div>
          <button className="btn btn-outline" onClick={startPractice}>
            START PRACTICE
          </button>
        </div>
        <div className="setting-card">
          <div className="setting-info">
            <EyeOff size={20} />
            <div>
              <span className="setting-name">Test Silent Mode</span>
              <p className="setting-desc">Try stealth recording with hidden UI</p>
            </div>
          </div>
          <button className="btn btn-outline" onClick={startSilentPractice}>
            TEST SILENT SOS
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">CANCEL WINDOW</h3>
        <p className="section-desc">Time to cancel after stopping a recording</p>
        <div className="option-buttons">
          {cancelWindowOptions.map(seconds => (
            <button
              key={seconds}
              className={`option-btn ${settings?.cancel_window_seconds === seconds ? 'active' : ''}`}
              onClick={() => handleSettingChange('cancel_window_seconds', seconds)}
              disabled={loading}
            >
              {seconds}s
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">SHAKE ACTIVATION</h3>
        <div className="setting-card">
          <div className="setting-info">
            <Vibrate size={20} />
            <div>
              <span className="setting-name">Shake to Activate</span>
              <p className="setting-desc">Shake phone 3 times to start recording</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.shake_to_activate ? 'active' : ''}`}
            onClick={() => handleSettingChange('shake_to_activate', !settings?.shake_to_activate)}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">VOICE ACTIVATION</h3>
        <div className="setting-card">
          <div className="setting-info">
            <Mic size={20} />
            <div>
              <span className="setting-name">Voice Commands</span>
              <p className="setting-desc">Say "Emergency" or "Help" to start recording</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.voice_activation ? 'active' : ''}`}
            onClick={() => handleSettingChange('voice_activation', !settings?.voice_activation)}
          />
        </div>
        {settings?.voice_activation && (
          <div className="info-banner info">
            <Mic size={16} />
            <span>Voice detection is active. Say "Emergency", "Help me", or "Sentinel" to trigger recording.</span>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3 className="section-title">DEAD MAN'S SWITCH</h3>
        <div className="setting-card">
          <div className="setting-info">
            <AlertTriangle size={20} />
            <div>
              <span className="setting-name">Enable Wellness Checks</span>
              <p className="setting-desc">Auto-alert contacts if you don't respond</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.dead_man_switch ? 'active' : ''}`}
            onClick={() => handleSettingChange('dead_man_switch', !settings?.dead_man_switch)}
          />
        </div>

        {settings?.dead_man_switch && (
          <>
            <p className="section-desc" style={{ marginTop: '12px' }}>Check interval (minutes)</p>
            <div className="option-buttons">
              {deadManIntervalOptions.map(minutes => (
                <button
                  key={minutes}
                  className={`option-btn ${settings?.dead_man_interval === minutes ? 'active' : ''}`}
                  onClick={() => handleSettingChange('dead_man_interval', minutes)}
                  disabled={loading}
                >
                  {minutes}m
                </button>
              ))}
            </div>

            <div className="setting-card" style={{ marginTop: '12px' }}>
              <div className="setting-info">
                <Timer size={20} />
                <div>
                  <span className="setting-name">Pause During Sleep</span>
                  <p className="setting-desc">No checks between 11 PM - 7 AM</p>
                </div>
              </div>
              <div
                className={`toggle ${settings?.dead_man_sleep_pause !== false ? 'active' : ''}`}
                onClick={() => handleSettingChange('dead_man_sleep_pause', settings?.dead_man_sleep_pause === false)}
              />
            </div>
          </>
        )}
      </section>

      <section className="settings-section">
        <h3 className="section-title">SILENT SOS MODE</h3>
        <div className="setting-card">
          <div className="setting-info">
            <EyeOff size={20} />
            <div>
              <span className="setting-name">Long-Press for Silent Mode</span>
              <p className="setting-desc">Hold SOS button 3 seconds for stealth recording</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.enable_silent_sos ? 'active' : ''}`}
            onClick={() => handleSettingChange('enable_silent_sos', !settings?.enable_silent_sos)}
          />
        </div>
        {settings?.enable_silent_sos && (
          <div className="info-banner warning">
            <EyeOff size={16} />
            <span>Silent SOS hides all recording indicators. Use in dangerous situations where visibility could put you at risk.</span>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3 className="section-title">DETERRENT DISPLAY</h3>
        <div className="setting-card">
          <div className="setting-info">
            <Eye size={20} />
            <div>
              <span className="setting-name">Show Deterrent Banner</span>
              <p className="setting-desc">Display "RECORDING" warning visible to others</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.show_deterrent_banner ? 'active' : ''}`}
            onClick={() => handleSettingChange('show_deterrent_banner', !settings?.show_deterrent_banner)}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">SOUND & ALERTS</h3>
        <div className="setting-card">
          <div className="setting-info">
            <Bell size={20} />
            <div>
              <span className="setting-name">Enable Siren & Alerts</span>
              <p className="setting-desc">Play siren and voice warnings during recording</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.enable_sound ? 'active' : ''}`}
            onClick={() => handleSettingChange('enable_sound', !settings?.enable_sound)}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">SHARING & PRIVACY</h3>
        <div className="setting-card">
          <div className="setting-info">
            <Shield size={20} />
            <div>
              <span className="setting-name">Auto-Share with Police</span>
              <p className="setting-desc">Automatically share recordings with police contacts</p>
            </div>
          </div>
          <div
            className={`toggle ${settings?.auto_share_with_police ? 'active' : ''}`}
            onClick={() => handleSettingChange('auto_share_with_police', !settings?.auto_share_with_police)}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">INFORMATION</h3>
        <div className="nav-cards">
          <button className="nav-card" onClick={() => navigate('/medical')}>
            <Heart size={20} />
            <span>Medical Information</span>
            <ChevronRight size={18} />
          </button>
          <button className="nav-card" onClick={() => navigate('/safety')}>
            <Zap size={20} />
            <span>Safety Tools</span>
            <ChevronRight size={18} />
          </button>
          <button className="nav-card" onClick={() => navigate('/location')}>
            <MapPin size={20} />
            <span>Location Tracking</span>
            <ChevronRight size={18} />
          </button>
          <button className="nav-card" onClick={() => navigate('/trip')}>
            <Clock size={20} />
            <span>Trip Tracker</span>
            <ChevronRight size={18} />
          </button>
          <button className="nav-card" onClick={() => { }}>
            <HelpCircle size={20} />
            <span>How It Works</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <p className="version-info">SAFESTREAM v2.0.0</p>
    </div>
  )
}

