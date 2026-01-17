import { Router } from 'express'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, unlinkSync, statSync, createReadStream } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import jwt from 'jsonwebtoken'
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

    const recordingId = result.lastInsertRowid

    if (stream_id) {
      db.prepare('UPDATE stream_sessions SET recording_id = ? WHERE id = ?').run(recordingId, stream_id)
    }

    // Trigger TwelveLabs Indexing (Async)
    import('../services/twelvelabs.js').then(async ({ indexVideo }) => {
      try {
        const taskId = await indexVideo(req.file.path, recordingId)
        if (taskId) {
          db.prepare('UPDATE recordings SET twelvelabs_task_id = ? WHERE id = ?').run(taskId, recordingId)
        }
      } catch (err) {
        console.error('Async indexing failed:', err)
      }
    })

    const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId)

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

// Stream video for playback
router.get('/:id/stream', (req, res) => {
  try {
    // Support token in query param for video src
    const token = req.query.token || req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: 'Token required' })
    }

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'safestream-secret-key-change-in-production')
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, decoded.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    if (!recording.file_path || !existsSync(recording.file_path)) {
      return res.status(404).json({ error: 'Video file not found' })
    }

    const stat = statSync(recording.file_path)
    const fileSize = stat.size
    const range = req.headers.range

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1
      const file = createReadStream(recording.file_path, { start, end })

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/webm'
      })

      file.pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/webm'
      })
      createReadStream(recording.file_path).pipe(res)
    }
  } catch (error) {
    console.error('Stream error:', error)
    res.status(500).json({ error: 'Failed to stream video' })
  }
})

// Download video
router.get('/:id/download', authenticateToken, (req, res) => {
  try {
    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    if (!recording.file_path || !existsSync(recording.file_path)) {
      return res.status(404).json({ error: 'Video file not found' })
    }

    res.download(recording.file_path, `recording-${recording.id}.webm`)
  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({ error: 'Failed to download video' })
  }

})

// Get Gemini-summarized analysis
router.get('/:id/analysis/summary', authenticateToken, async (req, res) => {
  try {
    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check if we have raw analysis to summarize
    if (!recording.ai_events) {
      return res.json({ error: 'No analysis available to summarize' })
    }

    const aiData = JSON.parse(recording.ai_events)
    if (!aiData.summary) {
      return res.json({ error: 'No summary available' })
    }

    // Check if Gemini is configured
    const { isConfigured, summarizeAnalysis } = await import('../services/gemini.js')
    if (!isConfigured()) {
      return res.json({ 
        summary: null, 
        raw: aiData.summary,
        message: 'Gemini API not configured - showing raw analysis'
      })
    }

    // Check if we already have a cached Gemini summary
    if (aiData.geminiSummary) {
      return res.json({ 
        summary: aiData.geminiSummary, 
        raw: aiData.summary 
      })
    }

    // Generate new summary
    const geminiSummary = await summarizeAnalysis(aiData.summary)
    if (geminiSummary) {
      // Cache the summary
      aiData.geminiSummary = geminiSummary
      db.prepare('UPDATE recordings SET ai_events = ? WHERE id = ?').run(JSON.stringify(aiData), recording.id)
      return res.json({ summary: geminiSummary, raw: aiData.summary })
    }

    return res.json({ summary: null, raw: aiData.summary })
  } catch (error) {
    console.error('Summary error:', error)
    res.status(500).json({ error: 'Failed to get summary' })
  }
})

// Chat about video
router.post('/:id/analysis/chat', authenticateToken, async (req, res) => {
  try {
    const { question, history } = req.body
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' })
    }

    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    if (!recording.ai_events) {
      return res.json({ error: 'No analysis available to chat about' })
    }

    const aiData = JSON.parse(recording.ai_events)
    if (!aiData.summary) {
      return res.json({ error: 'No video analysis available' })
    }

    const { isConfigured, chatAboutVideo } = await import('../services/gemini.js')
    if (!isConfigured()) {
      return res.json({ 
        error: 'Gemini API not configured',
        message: 'Chat feature requires Gemini API configuration'
      })
    }

    const response = await chatAboutVideo(aiData.summary, question, history || [])
    if (response) {
      return res.json({ response })
    }

    return res.json({ error: 'Failed to generate response' })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to process chat' })
  }
})

router.get('/:id/analysis', authenticateToken, async (req, res) => {
  try {
    const recording = db.prepare(
      'SELECT * FROM recordings WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id)

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Check if TwelveLabs is configured
    const hasApiKey = process.env.TWELVELABS_KEY
    const hasIndexId = process.env.TWELVELABS_INDEX_ID

    if (!hasApiKey || !hasIndexId) {
      return res.json({ 
        status: 'unavailable', 
        events: [], 
        summary: null,
        message: 'AI analysis requires TwelveLabs API configuration'
      })
    }

    // If already analyzed, return cached results
    if (recording.ai_events && recording.ai_events !== '[]') {
      const events = JSON.parse(recording.ai_events)
      // Check if summary is missing (legacy analysis)
      if (!events.summary && recording.twelvelabs_task_id) {
        // Fall through to re-analyze/summarize
      } else {
        return res.json({ status: 'ready', events: events.events || events, summary: events.summary })
      }
    }

    // If video hasn't been indexed yet but TwelveLabs is available, start indexing
    if (!recording.twelvelabs_task_id && hasApiKey && hasIndexId) {
      try {
        const { indexVideo } = await import('../services/twelvelabs.js')
        const taskId = await indexVideo(recording.file_path, recording.id)
        if (taskId) {
          db.prepare('UPDATE recordings SET twelvelabs_task_id = ? WHERE id = ?').run(taskId, recording.id)
          return res.json({ status: 'indexing', message: 'Video is being analyzed. This may take a few minutes.' })
        } else {
          // Indexing failed (likely video format/duration issue)
          return res.json({ 
            status: 'unavailable', 
            events: [], 
            summary: null,
            message: 'Video format not supported for AI analysis (must be at least 4 seconds)'
          })
        }
      } catch (err) {
        console.error('Failed to start indexing:', err)
        return res.json({ 
          status: 'unavailable', 
          events: [], 
          summary: null,
          message: 'Could not analyze this video'
        })
      }
    }

    if (recording.twelvelabs_task_id) {
      const { getTaskStatus, searchVideo, generateSummary } = await import('../services/twelvelabs.js')
      const status = await getTaskStatus(recording.twelvelabs_task_id)

      // Handle failed/error statuses
      if (!status) {
        console.error(`Failed to get status for task ${recording.twelvelabs_task_id}`)
        return res.json({ 
          status: 'unavailable', 
          events: [], 
          summary: null,
          message: 'Failed to check analysis status. Try again later.' 
        })
      }

      if (status.status === 'failed' || status.status === 'error') {
        console.error(`Task ${recording.twelvelabs_task_id} failed:`, status.error)
        // Clear the failed task_id so user can retry
        db.prepare('UPDATE recordings SET twelvelabs_task_id = NULL WHERE id = ?').run(recording.id)
        return res.json({ 
          status: 'unavailable', 
          events: [], 
          summary: null,
          message: `Analysis failed: ${status.error || 'Unknown error'}. You can try viewing the video again to retry.` 
        })
      }

      if (status && status.status === 'ready') {
        const envIndexId = process.env.TWELVELABS_INDEX_ID

        if (envIndexId) {
          // 1. Search for threats (Marengo)
          const keywords = ['gunshot', 'scream', 'fire', 'explosion', 'weapon', 'fighting', 'crash']
          const searchPromises = keywords.map(q => searchVideo(envIndexId, q))
          const results = await Promise.all(searchPromises)

          const events = []
          results.forEach((result, index) => {
            if (result && result.data) {
              result.data.forEach(item => {
                if (item.score > 75) { // Confidence threshold
                  events.push({
                    type: keywords[index],
                    start: item.start,
                    end: item.end,
                    confidence: item.score
                  })
                }
              })
            }
          })

          // 2. Generate Summary (Pegasus) - MUST use video_id, not task_id
          let summary = null
          try {
            if (status.video_id) {
              const summaryRes = await generateSummary(status.video_id)
              summary = summaryRes ? summaryRes.summary : null
            } else {
              console.warn(`Task ${recording.twelvelabs_task_id} is ready but no video_id found`)
            }
          } catch (err) {
            console.error('Summary generation failed:', err.message)
            // Continue without summary if generation fails
          }

          // Save to DB
          const aiData = { events, summary }
          db.prepare('UPDATE recordings SET ai_events = ? WHERE id = ?').run(JSON.stringify(aiData), recording.id)

          return res.json({ status: 'ready', events, summary })
        }
      } else if (status && (status.status === 'indexing' || status.status === 'pending')) {
        // Still indexing/pending - return status for frontend polling
        return res.json({ 
          status: status.status, 
          message: status.status === 'indexing' ? 'Video is being analyzed. This may take a few minutes.' : 'Video analysis is queued. Please wait.'
        })
      } else if (status && status.status === 'ready' && !status.video_id) {
        // Status says ready but no video_id - might be transitioning
        return res.json({ status: 'indexing', message: 'Finalizing analysis...' })
      } else if (status) {
        // Other status (unknown, etc.)
        console.warn(`Unexpected task status: ${status.status} for task ${recording.twelvelabs_task_id}`)
        return res.json({ status: status.status || 'pending', message: status.error || 'Processing video...' })
      }
    }

    // No task_id and no analysis - should have been handled above, but fallback
    res.json({ status: 'pending', message: 'Analysis will begin shortly...' })
  } catch (error) {
    console.error('Analysis error:', error)
    res.status(500).json({ error: 'Failed to get analysis' })
  }
})

export default router
