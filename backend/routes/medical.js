import { Router } from 'express'
import db from '../database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

router.get('/', authenticateToken, (req, res) => {
  try {
    let medical = db.prepare(
      'SELECT * FROM medical_info WHERE user_id = ?'
    ).get(req.user.id)

    if (!medical) {
      db.prepare('INSERT INTO medical_info (user_id) VALUES (?)').run(req.user.id)
      medical = db.prepare('SELECT * FROM medical_info WHERE user_id = ?').get(req.user.id)
    }

    res.json({
      medical: {
        ...medical,
        allergies: JSON.parse(medical.allergies || '[]'),
        conditions: JSON.parse(medical.conditions || '[]'),
        medications: JSON.parse(medical.medications || '[]'),
        ice_contacts: JSON.parse(medical.ice_contacts || '[]')
      }
    })
  } catch (error) {
    console.error('Get medical info error:', error)
    res.status(500).json({ error: 'Failed to get medical info' })
  }
})

router.put('/', authenticateToken, (req, res) => {
  try {
    const {
      full_name, date_of_birth, blood_type, organ_donor,
      allergies, conditions, medications, ice_contacts,
      doctor_name, doctor_phone, hospital, additional_notes
    } = req.body

    let existing = db.prepare('SELECT * FROM medical_info WHERE user_id = ?').get(req.user.id)
    
    if (!existing) {
      db.prepare('INSERT INTO medical_info (user_id) VALUES (?)').run(req.user.id)
    }

    const updates = []
    const values = []

    if (full_name !== undefined) { updates.push('full_name = ?'); values.push(full_name) }
    if (date_of_birth !== undefined) { updates.push('date_of_birth = ?'); values.push(date_of_birth) }
    if (blood_type !== undefined) { updates.push('blood_type = ?'); values.push(blood_type) }
    if (organ_donor !== undefined) { updates.push('organ_donor = ?'); values.push(organ_donor ? 1 : 0) }
    if (allergies !== undefined) { updates.push('allergies = ?'); values.push(JSON.stringify(allergies)) }
    if (conditions !== undefined) { updates.push('conditions = ?'); values.push(JSON.stringify(conditions)) }
    if (medications !== undefined) { updates.push('medications = ?'); values.push(JSON.stringify(medications)) }
    if (ice_contacts !== undefined) { updates.push('ice_contacts = ?'); values.push(JSON.stringify(ice_contacts)) }
    if (doctor_name !== undefined) { updates.push('doctor_name = ?'); values.push(doctor_name) }
    if (doctor_phone !== undefined) { updates.push('doctor_phone = ?'); values.push(doctor_phone) }
    if (hospital !== undefined) { updates.push('hospital = ?'); values.push(hospital) }
    if (additional_notes !== undefined) { updates.push('additional_notes = ?'); values.push(additional_notes) }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP')
      values.push(req.user.id)
      db.prepare(`UPDATE medical_info SET ${updates.join(', ')} WHERE user_id = ?`).run(...values)
    }

    const medical = db.prepare('SELECT * FROM medical_info WHERE user_id = ?').get(req.user.id)

    res.json({
      medical: {
        ...medical,
        allergies: JSON.parse(medical.allergies || '[]'),
        conditions: JSON.parse(medical.conditions || '[]'),
        medications: JSON.parse(medical.medications || '[]'),
        ice_contacts: JSON.parse(medical.ice_contacts || '[]')
      }
    })
  } catch (error) {
    console.error('Update medical info error:', error)
    res.status(500).json({ error: 'Failed to update medical info' })
  }
})

export default router

