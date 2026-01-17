import { Router } from 'express'
import db from '../database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

router.get('/', authenticateToken, (req, res) => {
  try {
    const contacts = db.prepare(
      'SELECT * FROM contacts WHERE user_id = ? ORDER BY is_default DESC, created_at DESC'
    ).all(req.user.id)
    res.json({ contacts })
  } catch (error) {
    console.error('Get contacts error:', error)
    res.status(500).json({ error: 'Failed to get contacts' })
  }
})

router.get('/emergency', authenticateToken, (req, res) => {
  try {
    const contacts = db.prepare(
      "SELECT * FROM contacts WHERE user_id = ? AND (type = 'emergency' OR type = 'police' OR notify_on_stream = 1)"
    ).all(req.user.id)
    res.json({ contacts })
  } catch (error) {
    console.error('Get emergency contacts error:', error)
    res.status(500).json({ error: 'Failed to get emergency contacts' })
  }
})

router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, phone, email, type = 'personal' } = req.body

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' })
    }

    const result = db.prepare(
      'INSERT INTO contacts (user_id, name, phone, email, type) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, name, phone, email || null, type)

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ contact })
  } catch (error) {
    console.error('Add contact error:', error)
    res.status(500).json({ error: 'Failed to add contact' })
  }
})

router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params
    const { name, phone, email, type, can_view_stream, notify_on_stream } = req.body

    const contact = db.prepare(
      'SELECT * FROM contacts WHERE id = ? AND user_id = ?'
    ).get(id, req.user.id)

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' })
    }

    const updates = []
    const values = []

    if (name !== undefined) { updates.push('name = ?'); values.push(name) }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone) }
    if (email !== undefined) { updates.push('email = ?'); values.push(email) }
    if (type !== undefined) { updates.push('type = ?'); values.push(type) }
    if (can_view_stream !== undefined) { updates.push('can_view_stream = ?'); values.push(can_view_stream ? 1 : 0) }
    if (notify_on_stream !== undefined) { updates.push('notify_on_stream = ?'); values.push(notify_on_stream ? 1 : 0) }

    if (updates.length > 0) {
      values.push(id)
      db.prepare(
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values)
    }

    const updatedContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id)
    res.json({ contact: updatedContact })
  } catch (error) {
    console.error('Update contact error:', error)
    res.status(500).json({ error: 'Failed to update contact' })
  }
})

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params

    const contact = db.prepare(
      'SELECT * FROM contacts WHERE id = ? AND user_id = ?'
    ).get(id, req.user.id)

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' })
    }

    if (contact.is_default) {
      return res.status(400).json({ error: 'Cannot delete default contact' })
    }

    db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
    res.json({ message: 'Contact deleted' })
  } catch (error) {
    console.error('Delete contact error:', error)
    res.status(500).json({ error: 'Failed to delete contact' })
  }
})

export default router

