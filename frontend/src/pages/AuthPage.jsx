import { useState } from 'react'
import { Shield, Eye, EyeOff, AlertTriangle, Loader } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './AuthPage.css'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, register } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name, phone)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <Shield size={48} />
          <h1>SAFESTREAM</h1>
          <p>Your Safety, Always Protected</p>
        </div>

        <div className="auth-toggle">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError('') }}
          >
            LOGIN
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError('') }}
          >
            REGISTER
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="form-group">
              <label className="label">Full Name</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Password</label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="label">Phone (Optional)</label>
              <input
                type="tel"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>
          )}

          {error && (
            <div className="auth-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-danger auth-submit" disabled={loading}>
            {loading ? <Loader size={20} className="spinner" /> : (mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT')}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
            {mode === 'login' ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  )
}

