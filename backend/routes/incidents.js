import express from 'express'
import db from '../database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Incident types with their base severity weights
const INCIDENT_TYPES = {
  theft: { label: 'Theft', severity: 'high', weight: 8 },
  assault: { label: 'Assault', severity: 'critical', weight: 10 },
  robbery: { label: 'Robbery', severity: 'critical', weight: 10 },
  harassment: { label: 'Harassment', severity: 'high', weight: 7 },
  suspicious: { label: 'Suspicious Activity', severity: 'medium', weight: 5 },
  vandalism: { label: 'Vandalism', severity: 'low', weight: 3 },
  accident: { label: 'Traffic Accident', severity: 'medium', weight: 4 },
  fire: { label: 'Fire', severity: 'high', weight: 8 },
  medical: { label: 'Medical Emergency', severity: 'medium', weight: 4 },
  other: { label: 'Other', severity: 'low', weight: 2 }
}

const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 2
}

// Get nearby incidents
router.get('/nearby', authenticateToken, (req, res) => {
  try {
    const { latitude, longitude, radius = 5 } = req.query // radius in km
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location required' })
    }

    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const radiusKm = parseFloat(radius)

    // Calculate bounding box for efficient query
    const latDelta = radiusKm / 111.32 // ~111km per degree of latitude
    const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))

    const incidents = db.prepare(`
      SELECT * FROM (
        SELECT 
          i.*,
          (6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          )) as distance
        FROM incidents i
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
          AND status IN ('active', 'investigating')
          AND datetime(reported_at) > datetime('now', '-24 hours')
      ) WHERE distance <= ?
      ORDER BY 
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        distance ASC
      LIMIT 100
    `).all(
      lat, lng, lat,
      lat - latDelta, lat + latDelta,
      lng - lngDelta, lng + lngDelta,
      radiusKm
    )

    res.json({ 
      incidents: incidents.map(i => ({
        ...i,
        typeInfo: INCIDENT_TYPES[i.type] || INCIDENT_TYPES.other,
        distance: Math.round(i.distance * 1000) // meters
      }))
    })
  } catch (err) {
    console.error('Get nearby incidents error:', err)
    res.status(500).json({ error: 'Failed to fetch incidents' })
  }
})

// Get all incidents for map (with pagination)
router.get('/', authenticateToken, (req, res) => {
  try {
    const { page = 1, limit = 50, status = 'active' } = req.query
    const offset = (page - 1) * limit

    const incidents = db.prepare(`
      SELECT * FROM incidents
      WHERE status = ?
      ORDER BY reported_at DESC
      LIMIT ? OFFSET ?
    `).all(status, parseInt(limit), offset)

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM incidents WHERE status = ?
    `).get(status).count

    res.json({
      incidents: incidents.map(i => ({
        ...i,
        typeInfo: INCIDENT_TYPES[i.type] || INCIDENT_TYPES.other
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (err) {
    console.error('Get incidents error:', err)
    res.status(500).json({ error: 'Failed to fetch incidents' })
  }
})

// Report a new incident
router.post('/', authenticateToken, (req, res) => {
  try {
    const { type, title, description, latitude, longitude, address, severity } = req.body

    if (!type || !title || !latitude || !longitude) {
      return res.status(400).json({ error: 'Type, title, and location are required' })
    }

    const incidentType = INCIDENT_TYPES[type] || INCIDENT_TYPES.other
    const finalSeverity = severity || incidentType.severity

    const result = db.prepare(`
      INSERT INTO incidents (user_id, type, severity, title, description, latitude, longitude, address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(req.user.id, type, finalSeverity, title, description, latitude, longitude, address)

    // Update historical data
    const now = new Date()
    const hourOfDay = now.getHours()
    const dayOfWeek = now.getDay()
    const month = now.getMonth()

    // Round location to grid (approximately 100m cells)
    const gridLat = Math.round(latitude * 1000)
    const gridLng = Math.round(longitude * 1000)

    db.prepare(`
      INSERT INTO incident_history (latitude, longitude, type, severity, hour_of_day, day_of_week, month, count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT DO UPDATE SET count = count + 1
    `).run(latitude, longitude, type, finalSeverity, hourOfDay, dayOfWeek, month)

    // Update area safety score
    updateAreaSafetyScore(gridLat, gridLng, hourOfDay, dayOfWeek)

    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(result.lastInsertRowid)

    res.json({
      success: true,
      incident: {
        ...incident,
        typeInfo: INCIDENT_TYPES[incident.type] || INCIDENT_TYPES.other
      }
    })
  } catch (err) {
    console.error('Report incident error:', err)
    res.status(500).json({ error: 'Failed to report incident' })
  }
})

// Update incident (vote, status)
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params
    const { vote, status } = req.body

    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id)
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' })
    }

    if (vote === 'up') {
      db.prepare('UPDATE incidents SET upvotes = upvotes + 1, verified = CASE WHEN upvotes >= 3 THEN 1 ELSE verified END WHERE id = ?').run(id)
    } else if (vote === 'down') {
      db.prepare('UPDATE incidents SET downvotes = downvotes + 1 WHERE id = ?').run(id)
      // Auto-resolve if too many downvotes
      const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id)
      if (updated.downvotes >= 5 && updated.upvotes < updated.downvotes) {
        db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").run(id)
      }
    }

    if (status && ['active', 'investigating', 'resolved'].includes(status)) {
      const resolvedAt = status === 'resolved' ? "datetime('now')" : 'NULL'
      db.prepare(`UPDATE incidents SET status = ?, resolved_at = ${status === 'resolved' ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(status, id)
    }

    const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id)
    res.json({
      success: true,
      incident: {
        ...updated,
        typeInfo: INCIDENT_TYPES[updated.type] || INCIDENT_TYPES.other
      }
    })
  } catch (err) {
    console.error('Update incident error:', err)
    res.status(500).json({ error: 'Failed to update incident' })
  }
})

// Get safety score for a location
router.get('/safety-score', authenticateToken, (req, res) => {
  try {
    const { latitude, longitude } = req.query

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location required' })
    }

    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const now = new Date()
    const hourOfDay = now.getHours()
    const dayOfWeek = now.getDay()

    const safetyScore = calculateSafetyScore(lat, lng, hourOfDay, dayOfWeek)

    res.json(safetyScore)
  } catch (err) {
    console.error('Get safety score error:', err)
    res.status(500).json({ error: 'Failed to calculate safety score' })
  }
})

// Get historical incident patterns for a location
router.get('/historical', authenticateToken, (req, res) => {
  try {
    const { latitude, longitude, radius = 1 } = req.query

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location required' })
    }

    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const radiusKm = parseFloat(radius)
    const latDelta = radiusKm / 111.32
    const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))

    // Get incidents by hour
    const hourlyPatterns = db.prepare(`
      SELECT hour_of_day, SUM(count) as incident_count, type
      FROM incident_history
      WHERE latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
      GROUP BY hour_of_day, type
      ORDER BY hour_of_day
    `).all(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)

    // Get incidents by day of week
    const dailyPatterns = db.prepare(`
      SELECT day_of_week, SUM(count) as incident_count, type
      FROM incident_history
      WHERE latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
      GROUP BY day_of_week, type
      ORDER BY day_of_week
    `).all(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)

    // Get most common incident types in area
    const incidentTypes = db.prepare(`
      SELECT type, SUM(count) as total
      FROM incident_history
      WHERE latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
      GROUP BY type
      ORDER BY total DESC
      LIMIT 5
    `).all(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)

    // Aggregate hourly data
    const hourlyData = Array(24).fill(0).map((_, hour) => {
      const incidents = hourlyPatterns.filter(p => p.hour_of_day === hour)
      return {
        hour,
        total: incidents.reduce((sum, p) => sum + p.incident_count, 0),
        types: incidents.reduce((acc, p) => {
          acc[p.type] = p.incident_count
          return acc
        }, {})
      }
    })

    // Find peak danger times
    const peakHours = hourlyData
      .map((h, i) => ({ hour: i, count: h.total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    // Aggregate daily data
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dailyData = Array(7).fill(0).map((_, day) => {
      const incidents = dailyPatterns.filter(p => p.day_of_week === day)
      return {
        day,
        dayName: dayNames[day],
        total: incidents.reduce((sum, p) => sum + p.incident_count, 0)
      }
    })

    res.json({
      hourlyData,
      dailyData,
      peakHours,
      commonTypes: incidentTypes.map(t => ({
        type: t.type,
        label: INCIDENT_TYPES[t.type]?.label || t.type,
        count: t.total
      })),
      totalHistoricalIncidents: incidentTypes.reduce((sum, t) => sum + t.total, 0)
    })
  } catch (err) {
    console.error('Get historical data error:', err)
    res.status(500).json({ error: 'Failed to fetch historical data' })
  }
})

// Get incident types
router.get('/types', authenticateToken, (req, res) => {
  res.json({ types: INCIDENT_TYPES })
})

// Helper function to calculate safety score
function calculateSafetyScore(lat, lng, hour, dayOfWeek) {
  const radiusKm = 1.5 // Consider incidents within 1.5km
  const latDelta = radiusKm / 111.32
  const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))

  // Get recent active incidents
  const recentIncidents = db.prepare(`
    SELECT * FROM (
      SELECT type, severity,
        (6371 * acos(
          cos(radians(?)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(latitude))
        )) as distance
      FROM incidents
      WHERE latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
        AND status = 'active'
        AND datetime(reported_at) > datetime('now', '-12 hours')
    ) WHERE distance <= ?
  `).all(
    lat, lng, lat,
    lat - latDelta, lat + latDelta,
    lng - lngDelta, lng + lngDelta,
    radiusKm
  )

  // Get historical patterns for this time
  const historicalData = db.prepare(`
    SELECT type, severity, SUM(count) as total
    FROM incident_history
    WHERE latitude BETWEEN ? AND ?
      AND longitude BETWEEN ? AND ?
      AND hour_of_day BETWEEN ? AND ?
      AND day_of_week = ?
    GROUP BY type
  `).all(
    lat - latDelta, lat + latDelta,
    lng - lngDelta, lng + lngDelta,
    Math.max(0, hour - 2), Math.min(23, hour + 2),
    dayOfWeek
  )

  // Calculate score components
  let score = 100

  // Deduct for recent incidents (more impact)
  recentIncidents.forEach(incident => {
    const typeWeight = INCIDENT_TYPES[incident.type]?.weight || 3
    const severityWeight = SEVERITY_WEIGHTS[incident.severity] || 4
    const distanceFactor = Math.max(0.2, 1 - (incident.distance / radiusKm))
    const deduction = typeWeight * severityWeight * distanceFactor * 0.5
    score -= deduction
  })

  // Deduct for historical patterns (less impact)
  historicalData.forEach(data => {
    const typeWeight = INCIDENT_TYPES[data.type]?.weight || 3
    const historicalDeduction = Math.min(15, data.total * typeWeight * 0.2)
    score -= historicalDeduction
  })

  // Time-based adjustments
  const isNightTime = hour >= 22 || hour <= 5
  const isLateNight = hour >= 0 && hour <= 4
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  if (isLateNight) {
    score -= 10
  } else if (isNightTime) {
    score -= 5
  }

  if (isWeekend && isNightTime) {
    score -= 5 // Additional risk for weekend nights
  }

  // Clamp score
  score = Math.max(0, Math.min(100, Math.round(score)))

  // Determine risk level
  let riskLevel, riskColor
  if (score >= 80) {
    riskLevel = 'Safe'
    riskColor = 'safe'
  } else if (score >= 60) {
    riskLevel = 'Moderate'
    riskColor = 'warning'
  } else if (score >= 40) {
    riskLevel = 'Elevated'
    riskColor = 'warning'
  } else if (score >= 20) {
    riskLevel = 'High Risk'
    riskColor = 'danger'
  } else {
    riskLevel = 'Critical'
    riskColor = 'danger'
  }

  // Generate alerts
  const alerts = []
  
  if (recentIncidents.length > 0) {
    const criticalIncidents = recentIncidents.filter(i => i.severity === 'critical' || i.severity === 'high')
    if (criticalIncidents.length > 0) {
      alerts.push({
        type: 'active',
        severity: 'high',
        message: `${criticalIncidents.length} serious incident${criticalIncidents.length > 1 ? 's' : ''} reported nearby in the last 12 hours`
      })
    }
    if (recentIncidents.length >= 3) {
      alerts.push({
        type: 'cluster',
        severity: 'medium',
        message: `Multiple incidents (${recentIncidents.length}) reported in this area recently`
      })
    }
  }

  if (historicalData.length > 0) {
    const totalHistorical = historicalData.reduce((sum, d) => sum + d.total, 0)
    if (totalHistorical >= 5) {
      alerts.push({
        type: 'historical',
        severity: 'low',
        message: `This area historically has elevated incident reports at this time`
      })
    }
  }

  if (isLateNight && score < 70) {
    alerts.push({
      type: 'time',
      severity: 'medium',
      message: 'Late night hours typically have higher risk - stay alert'
    })
  }

  return {
    score,
    riskLevel,
    riskColor,
    recentIncidentCount: recentIncidents.length,
    historicalIncidentCount: historicalData.reduce((sum, d) => sum + d.total, 0),
    alerts,
    factors: {
      recentIncidents: recentIncidents.length,
      historicalPattern: historicalData.length > 0,
      timeOfDay: isNightTime ? 'night' : 'day',
      dayOfWeek: dayOfWeek
    }
  }
}

// Helper function to update area safety score
function updateAreaSafetyScore(gridLat, gridLng, hourOfDay, dayOfWeek) {
  const existing = db.prepare(`
    SELECT * FROM area_safety_scores 
    WHERE grid_lat = ? AND grid_lng = ? AND hour_of_day = ? AND day_of_week = ?
  `).get(gridLat, gridLng, hourOfDay, dayOfWeek)

  if (existing) {
    const newScore = Math.max(0, existing.safety_score - 5)
    db.prepare(`
      UPDATE area_safety_scores 
      SET safety_score = ?, incident_count = incident_count + 1, last_updated = datetime('now')
      WHERE id = ?
    `).run(newScore, existing.id)
  } else {
    db.prepare(`
      INSERT INTO area_safety_scores (latitude, longitude, grid_lat, grid_lng, hour_of_day, day_of_week, safety_score, incident_count)
      VALUES (?, ?, ?, ?, ?, ?, 90, 1)
    `).run(gridLat / 1000, gridLng / 1000, gridLat, gridLng, hourOfDay, dayOfWeek)
  }
}

export default router
