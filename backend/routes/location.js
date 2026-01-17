import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

router.get('/safe-locations', authenticateToken, (req, res) => {
  try {
    const locations = db.prepare(
      'SELECT * FROM safe_locations WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC'
    ).all(req.user.id)
    res.json({ locations })
  } catch (error) {
    console.error('Get safe locations error:', error)
    res.status(500).json({ error: 'Failed to get safe locations' })
  }
})

router.post('/safe-locations', authenticateToken, (req, res) => {
  try {
    const { name, latitude, longitude, radius_meters = 100, type = 'other', is_primary = false } = req.body

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Name, latitude, and longitude are required' })
    }

    if (is_primary) {
      db.prepare('UPDATE safe_locations SET is_primary = 0 WHERE user_id = ?').run(req.user.id)
    }

    const result = db.prepare(`
      INSERT INTO safe_locations (user_id, name, latitude, longitude, radius_meters, type, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, name, latitude, longitude, radius_meters, type, is_primary ? 1 : 0)

    const location = db.prepare('SELECT * FROM safe_locations WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ location })
  } catch (error) {
    console.error('Add safe location error:', error)
    res.status(500).json({ error: 'Failed to add safe location' })
  }
})

router.delete('/safe-locations/:id', authenticateToken, (req, res) => {
  try {
    const location = db.prepare(
      'SELECT * FROM safe_locations WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!location) {
      return res.status(404).json({ error: 'Location not found' })
    }

    db.prepare('DELETE FROM safe_locations WHERE id = ?').run(req.params.id)
    res.json({ message: 'Location deleted' })
  } catch (error) {
    console.error('Delete safe location error:', error)
    res.status(500).json({ error: 'Failed to delete location' })
  }
})

router.get('/alerts', authenticateToken, (req, res) => {
  try {
    const alerts = db.prepare(
      'SELECT * FROM smart_alerts WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id)

    const parsed = alerts.map(a => ({
      ...a,
      conditions: JSON.parse(a.conditions || '{}'),
      contacts: JSON.parse(a.contacts || '[]')
    }))

    res.json({ alerts: parsed })
  } catch (error) {
    console.error('Get alerts error:', error)
    res.status(500).json({ error: 'Failed to get alerts' })
  }
})

router.post('/alerts', authenticateToken, (req, res) => {
  try {
    const { name, type, conditions = {}, contacts = [], message } = req.body

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' })
    }

    const result = db.prepare(`
      INSERT INTO smart_alerts (user_id, name, type, conditions, contacts, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, name, type, JSON.stringify(conditions), JSON.stringify(contacts), message || null)

    const alert = db.prepare('SELECT * FROM smart_alerts WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({
      alert: {
        ...alert,
        conditions: JSON.parse(alert.conditions || '{}'),
        contacts: JSON.parse(alert.contacts || '[]')
      }
    })
  } catch (error) {
    console.error('Create alert error:', error)
    res.status(500).json({ error: 'Failed to create alert' })
  }
})

router.put('/alerts/:id', authenticateToken, (req, res) => {
  try {
    const { name, type, is_enabled, conditions, contacts, message } = req.body

    const alert = db.prepare(
      'SELECT * FROM smart_alerts WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    const updates = []
    const values = []

    if (name !== undefined) { updates.push('name = ?'); values.push(name) }
    if (type !== undefined) { updates.push('type = ?'); values.push(type) }
    if (is_enabled !== undefined) { updates.push('is_enabled = ?'); values.push(is_enabled ? 1 : 0) }
    if (conditions !== undefined) { updates.push('conditions = ?'); values.push(JSON.stringify(conditions)) }
    if (contacts !== undefined) { updates.push('contacts = ?'); values.push(JSON.stringify(contacts)) }
    if (message !== undefined) { updates.push('message = ?'); values.push(message) }

    if (updates.length > 0) {
      values.push(req.params.id)
      db.prepare(`UPDATE smart_alerts SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = db.prepare('SELECT * FROM smart_alerts WHERE id = ?').get(req.params.id)
    res.json({
      alert: {
        ...updated,
        conditions: JSON.parse(updated.conditions || '{}'),
        contacts: JSON.parse(updated.contacts || '[]')
      }
    })
  } catch (error) {
    console.error('Update alert error:', error)
    res.status(500).json({ error: 'Failed to update alert' })
  }
})

router.delete('/alerts/:id', authenticateToken, (req, res) => {
  try {
    const alert = db.prepare(
      'SELECT * FROM smart_alerts WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    db.prepare('DELETE FROM smart_alerts WHERE id = ?').run(req.params.id)
    res.json({ message: 'Alert deleted' })
  } catch (error) {
    console.error('Delete alert error:', error)
    res.status(500).json({ error: 'Failed to delete alert' })
  }
})

router.get('/movement', authenticateToken, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7
    const events = db.prepare(`
      SELECT me.*, sl.name as location_name 
      FROM movement_events me
      LEFT JOIN safe_locations sl ON me.location_id = sl.id
      WHERE me.user_id = ? AND me.occurred_at > datetime('now', '-${days} days')
      ORDER BY me.occurred_at DESC
    `).all(req.user.id)
    res.json({ events })
  } catch (error) {
    console.error('Get movement error:', error)
    res.status(500).json({ error: 'Failed to get movement history' })
  }
})

router.get('/share', authenticateToken, (req, res) => {
  try {
    const shares = db.prepare(
      "SELECT * FROM location_shares WHERE user_id = ? AND is_active = 1 AND expires_at > datetime('now') ORDER BY created_at DESC"
    ).all(req.user.id)
    res.json({ shares })
  } catch (error) {
    console.error('Get shares error:', error)
    res.status(500).json({ error: 'Failed to get location shares' })
  }
})

router.post('/share', authenticateToken, (req, res) => {
  try {
    const { duration_hours = 1, shared_with } = req.body
    const shareCode = uuidv4().slice(0, 8).toUpperCase()

    const result = db.prepare(`
      INSERT INTO location_shares (user_id, share_code, shared_with, expires_at)
      VALUES (?, ?, ?, datetime('now', '+${duration_hours} hours'))
    `).run(req.user.id, shareCode, shared_with || null)

    const share = db.prepare('SELECT * FROM location_shares WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ share })
  } catch (error) {
    console.error('Create share error:', error)
    res.status(500).json({ error: 'Failed to create location share' })
  }
})

router.delete('/share/:id', authenticateToken, (req, res) => {
  try {
    const share = db.prepare(
      'SELECT * FROM location_shares WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!share) {
      return res.status(404).json({ error: 'Share not found' })
    }

    db.prepare('UPDATE location_shares SET is_active = 0 WHERE id = ?').run(req.params.id)
    res.json({ message: 'Location sharing stopped' })
  } catch (error) {
    console.error('Stop share error:', error)
    res.status(500).json({ error: 'Failed to stop sharing' })
  }
})

router.get('/view/:code', (req, res) => {
  try {
    const share = db.prepare(`
      SELECT ls.*, lkl.latitude, lkl.longitude, lkl.accuracy, lkl.battery_level, lkl.address, lkl.updated_at as location_updated_at
      FROM location_shares ls
      LEFT JOIN last_known_location lkl ON ls.user_id = lkl.user_id
      WHERE ls.share_code = ? AND ls.is_active = 1 AND ls.expires_at > datetime('now')
    `).get(req.params.code.toUpperCase())

    if (!share) {
      return res.status(404).json({ error: 'Share link not found or expired' })
    }

    res.json({
      latitude: share.latitude,
      longitude: share.longitude,
      accuracy: share.accuracy,
      battery_level: share.battery_level,
      address: share.address,
      updated_at: share.location_updated_at,
      expires_at: share.expires_at
    })
  } catch (error) {
    console.error('View share error:', error)
    res.status(500).json({ error: 'Failed to view shared location' })
  }
})

export default router

