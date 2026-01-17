import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'
import WellnessCheckModal from './components/WellnessCheckModal'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import StreamPage from './pages/StreamPage'
import SafetyPage from './pages/SafetyPage'
import MedicalPage from './pages/MedicalPage'
import LocationPage from './pages/LocationPage'
import ContactsPage from './pages/ContactsPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import TripPage from './pages/TripPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page flex-center" style={{ minHeight: '100dvh' }}>
        <div className="loading-spinner" />
      </div>
    )
  }

  return user ? children : <Navigate to="/auth" replace />
}

function AppRoutes() {
  const { user, NavigateCapture, wellnessCheck, respondToWellnessCheck, voiceListening } = useAuth()

  return (
    <>
      <NavigateCapture />
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
        <Route path="/stream" element={<PrivateRoute><StreamPage /></PrivateRoute>} />
        <Route path="/safety" element={<PrivateRoute><SafetyPage /></PrivateRoute>} />
        <Route path="/medical" element={<PrivateRoute><MedicalPage /></PrivateRoute>} />
        <Route path="/location" element={<PrivateRoute><LocationPage /></PrivateRoute>} />
        <Route path="/contacts" element={<PrivateRoute><ContactsPage /></PrivateRoute>} />
        <Route path="/history" element={<PrivateRoute><HistoryPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="/trip" element={<PrivateRoute><TripPage /></PrivateRoute>} />
      </Routes>
      {user && <BottomNav />}
      {user && voiceListening && (
        <div className="voice-indicator">
          <span className="voice-dot" />
          <span>Listening...</span>
        </div>
      )}
      {wellnessCheck && (
        <WellnessCheckModal onRespond={respondToWellnessCheck} />
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

