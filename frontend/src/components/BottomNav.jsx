import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Users, MapPin, Settings, Radio } from 'lucide-react'
import './BottomNav.css'

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/stream', icon: Radio, label: 'SOS', isCenter: true },
  { path: '/location', icon: MapPin, label: 'Location' },
  { path: '/settings', icon: Settings, label: 'Settings' }
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  if (location.pathname === '/stream' || location.pathname === '/auth') {
    return null
  }

  return (
    <nav className="bottom-nav">
      {navItems.map(item => {
        const Icon = item.icon
        const isActive = location.pathname === item.path

        if (item.isCenter) {
          return (
            <button
              key={item.path}
              className="nav-sos"
              onClick={() => navigate(item.path)}
            >
              <div className="sos-ring" />
              <div className="sos-ring sos-ring-2" />
              <Icon size={24} />
            </button>
          )
        }

        return (
          <button
            key={item.path}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <Icon size={22} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

