import { Router } from 'express'
import db from '../database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

router.get('/', authenticateToken, (req, res) => {
  try {
    const sessions = db.prepare(
      'SELECT * FROM stream_sessions WHERE user_id = ? ORDER BY started_at DESC'
    ).all(req.user.id)

    const parsed = sessions.map(s => ({
      ...s,
      notified_contacts: JSON.parse(s.notified_contacts || '[]')
    }))

    res.json({ sessions: parsed })
  } catch (error) {
    console.error('Get stream sessions error:', error)
    res.status(500).json({ error: 'Failed to get stream sessions' })
  }
})

router.get('/active/current', authenticateToken, (req, res) => {
  try {
    const session = db.prepare(
      "SELECT * FROM stream_sessions WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1"
    ).get(req.user.id)

    if (!session) {
      return res.json({ session: null })
    }

    res.json({
      session: {
        ...session,
        notified_contacts: JSON.parse(session.notified_contacts || '[]')
      }
    })
  } catch (error) {
    console.error('Get active stream error:', error)
    res.status(500).json({ error: 'Failed to get active stream' })
  }
})

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const session = db.prepare(
      'SELECT * FROM stream_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!session) {
      return res.status(404).json({ error: 'Stream session not found' })
    }

    res.json({
      session: {
        ...session,
        notified_contacts: JSON.parse(session.notified_contacts || '[]')
      }
    })
  } catch (error) {
    console.error('Get stream error:', error)
    res.status(500).json({ error: 'Failed to get stream' })
  }
})

router.post('/start', authenticateToken, (req, res) => {
  try {
    const contacts = db.prepare(
      "SELECT id, name FROM contacts WHERE user_id = ? AND notify_on_stream = 1"
    ).all(req.user.id)

    const contactIds = contacts.map(c => c.id)

    const result = db.prepare(
      'INSERT INTO stream_sessions (user_id, notified_contacts) VALUES (?, ?)'
    ).run(req.user.id, JSON.stringify(contactIds))

    const session = db.prepare('SELECT * FROM stream_sessions WHERE id = ?').get(result.lastInsertRowid)

    contacts.forEach(contact => {
      db.prepare(
        'INSERT INTO notifications (user_id, contact_id, stream_id, type, message) VALUES (?, ?, ?, ?, ?)'
      ).run(req.user.id, contact.id, session.id, 'stream_started', `Emergency stream started by ${req.user.email}`)
    })

    res.status(201).json({
      session: {
        ...session,
        notified_contacts: contactIds
      },
      notified: contacts.map(c => c.name)
    })
  } catch (error) {
    console.error('Start stream error:', error)
    res.status(500).json({ error: 'Failed to start stream' })
  }
})

router.post('/:id/end', authenticateToken, (req, res) => {
  try {
    const { cancelled = false } = req.body
    
    const session = db.prepare(
      'SELECT * FROM stream_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!session) {
      return res.status(404).json({ error: 'Stream session not found' })
    }

    db.prepare(
      'UPDATE stream_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP, cancelled = ? WHERE id = ?'
    ).run('ended', cancelled ? 1 : 0, req.params.id)

    const notifiedContacts = JSON.parse(session.notified_contacts || '[]')
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)

    notifiedContacts.forEach(contactId => {
      db.prepare(
        'INSERT INTO notifications (user_id, contact_id, stream_id, type, message) VALUES (?, ?, ?, ?, ?)'
      ).run(
        req.user.id, 
        contactId, 
        session.id, 
        cancelled ? 'stream_cancelled' : 'stream_ended',
        cancelled ? `Emergency cancelled by ${user?.name || 'User'}` : `Emergency stream ended by ${user?.name || 'User'}`
      )
    })

    const updatedSession = db.prepare('SELECT * FROM stream_sessions WHERE id = ?').get(req.params.id)

    res.json({
      session: {
        ...updatedSession,
        notified_contacts: notifiedContacts
      },
      message: cancelled ? 'Stream cancelled' : 'Stream ended'
    })
  } catch (error) {
    console.error('End stream error:', error)
    res.status(500).json({ error: 'Failed to end stream' })
  }
})

export default router

