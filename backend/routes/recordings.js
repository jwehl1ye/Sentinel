import { Router } from 'express'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import db from '../database.js'
import { authenticateToken } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsDir = join(__dirname, '..', 'uploads')

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}.webm`
    cb(null, uniqueName)
  }
})

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
})

const router = Router()

router.get('/', authenticateToken, (req, res) => {
  try {
    const recordings = db.prepare(
      'SELECT * FROM recordings WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id)

    const parsed = recordings.map(r => ({
      ...r,
      shared_with: JSON.parse(r.shared_with || '[]')
    }))

    res.json({ recordings: parsed })
  } catch (error) {
    console.error('Get recordings error:', error)
    res.status(500).json({ error: 'Failed to get recordings' })
  }
})

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    res.json({
      recording: {
        ...recording,
        shared_with: JSON.parse(recording.shared_with || '[]')
      }
    })
  } catch (error) {
    console.error('Get recording error:', error)
    res.status(500).json({ error: 'Failed to get recording' })
  }
})

router.post('/upload', authenticateToken, upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' })
    }

    const { duration, latitude, longitude, address, stream_id } = req.body

    const result = db.prepare(`
      INSERT INTO recordings (user_id, filename, original_name, file_path, file_size, duration, status, location_lat, location_lng, location_address, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      req.user.id,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      parseInt(duration) || 0,
      parseFloat(latitude) || null,
      parseFloat(longitude) || null,
      address || null
    )

    if (stream_id) {
      db.prepare('UPDATE stream_sessions SET recording_id = ? WHERE id = ?').run(result.lastInsertRowid, stream_id)
    }

    const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(result.lastInsertRowid)

    res.status(201).json({
      recording: {
        ...recording,
        shared_with: JSON.parse(recording.shared_with || '[]')
      }
    })
  } catch (error) {
    console.error('Upload recording error:', error)
    res.status(500).json({ error: 'Failed to upload recording' })
  }
})

router.post('/:id/share', authenticateToken, (req, res) => {
  try {
    const { contact_ids } = req.body
    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    const currentShared = JSON.parse(recording.shared_with || '[]')
    const newShared = [...new Set([...currentShared, ...contact_ids])]

    db.prepare(
      'UPDATE recordings SET is_shared = 1, shared_with = ? WHERE id = ?'
    ).run(JSON.stringify(newShared), req.params.id)

    const contacts = db.prepare(
      `SELECT name FROM contacts WHERE id IN (${newShared.map(() => '?').join(',')}) AND user_id = ?`
    ).all(...newShared, req.user.id)

    res.json({ 
      message: 'Recording shared',
      shared_with: contacts.map(c => c.name)
    })
  } catch (error) {
    console.error('Share recording error:', error)
    res.status(500).json({ error: 'Failed to share recording' })
  }
})

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    if (recording.file_path && existsSync(recording.file_path)) {
      unlinkSync(recording.file_path)
    }

    db.prepare('DELETE FROM recordings WHERE id = ?').run(req.params.id)
    res.json({ message: 'Recording deleted' })
  } catch (error) {
    console.error('Delete recording error:', error)
    res.status(500).json({ error: 'Failed to delete recording' })
  }
})

export default router

