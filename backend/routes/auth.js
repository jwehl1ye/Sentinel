import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../database.js'
import { authenticateToken, generateToken } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' })
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    
    const result = db.prepare(
      'INSERT INTO users (email, password, name, phone) VALUES (?, ?, ?, ?)'
    ).run(email, hashedPassword, name, phone || null)

    const userId = result.lastInsertRowid

    db.prepare(
      'INSERT INTO user_settings (user_id) VALUES (?)'
    ).run(userId)

    db.prepare(
      'INSERT INTO contacts (user_id, name, phone, type, is_default) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, 'Emergency Services', '911', 'emergency', 1)

    const user = db.prepare('SELECT id, email, name, phone, created_at FROM users WHERE id = ?').get(userId)
    const token = generateToken(user)

    res.status(201).json({ user, token })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const { password: _, ...userWithoutPassword } = user
    const token = generateToken(userWithoutPassword)

    res.json({ user: userWithoutPassword, token })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, email, name, phone, created_at FROM users WHERE id = ?'
    ).get(req.user.id)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const settings = db.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    ).get(req.user.id)

    res.json({ user, settings })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

router.put('/settings', authenticateToken, (req, res) => {
  try {
    const { cancel_window_seconds, auto_share_with_police, show_deterrent_banner, enable_sound, quick_activation } = req.body

    const updates = []
    const values = []

    if (cancel_window_seconds !== undefined) {
      updates.push('cancel_window_seconds = ?')
      values.push(cancel_window_seconds)
    }
    if (auto_share_with_police !== undefined) {
      updates.push('auto_share_with_police = ?')
      values.push(auto_share_with_police ? 1 : 0)
    }
    if (show_deterrent_banner !== undefined) {
      updates.push('show_deterrent_banner = ?')
      values.push(show_deterrent_banner ? 1 : 0)
    }
    if (enable_sound !== undefined) {
      updates.push('enable_sound = ?')
      values.push(enable_sound ? 1 : 0)
    }
    if (quick_activation !== undefined) {
      updates.push('quick_activation = ?')
      values.push(quick_activation ? 1 : 0)
    }

    if (updates.length > 0) {
      values.push(req.user.id)
      db.prepare(
        `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`
      ).run(...values)
    }

    const settings = db.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    ).get(req.user.id)

    res.json({ settings })
  } catch (error) {
    console.error('Update settings error:', error)
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

export default router

