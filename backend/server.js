import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import authRoutes from './routes/auth.js'
import contactsRoutes from './routes/contacts.js'
import recordingsRoutes from './routes/recordings.js'
import streamRoutes from './routes/stream.js'
import locationRoutes from './routes/location.js'
import medicalRoutes from './routes/medical.js'
import incidentsRoutes from './routes/incidents.js'
import emergencyRoutes from './routes/emergency.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://100.65.9.227:5173', /^http:\/\/192\.168\.\d+\.\d+:5173$/, /^http:\/\/10\.\d+\.\d+\.\d+:5173$/, /^http:\/\/100\.\d+\.\d+\.\d+:5173$/],
    methods: ['GET', 'POST'],
    credentials: true
  }
})

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true })) // Required for Twilio webhooks
app.use('/uploads', express.static(join(__dirname, 'uploads')))

app.use((req, res, next) => {
  req.io = io
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/contacts', contactsRoutes)
app.use('/api/recordings', recordingsRoutes)
app.use('/api/stream', streamRoutes)
app.use('/api/location', locationRoutes)
app.use('/api/medical', medicalRoutes)
app.use('/api/incidents', incidentsRoutes)
app.use('/api/emergency', emergencyRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

io.on('connection', (socket) => {
  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`)
  })

  socket.on('stream-started', (data) => {
    const { userId, contacts, streamId } = data
    contacts.forEach(contactId => {
      io.to(`user-${contactId}`).emit('emergency-alert', {
        type: 'stream-started',
        userId,
        streamId,
        message: 'Emergency stream started!'
      })
    })
  })

  socket.on('stream-ended', (data) => {
    const { userId, contacts, streamId, cancelled } = data
    contacts.forEach(contactId => {
      io.to(`user-${contactId}`).emit('emergency-alert', {
        type: 'stream-ended',
        userId,
        streamId,
        cancelled,
        message: cancelled ? 'Emergency cancelled' : 'Emergency stream ended'
      })
    })
  })

  socket.on('location-update', (data) => {
    const { userId, latitude, longitude, accuracy, battery } = data
    socket.to(`user-${userId}-watchers`).emit('location-changed', {
      userId,
      latitude,
      longitude,
      accuracy,
      battery,
      timestamp: new Date().toISOString()
    })
  })

  socket.on('emergency-location', (data) => {
    const { userId, contacts, latitude, longitude } = data
    contacts.forEach(contactId => {
      io.to(`user-${contactId}`).emit('emergency-location-alert', {
        userId,
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      })
    })
  })

  socket.on('low-battery-alert', (data) => {
    const { userId, contacts, batteryLevel, latitude, longitude } = data
    contacts.forEach(contactId => {
      io.to(`user-${contactId}`).emit('battery-warning', {
        userId,
        batteryLevel,
        latitude,
        longitude,
        message: `Low battery warning: ${batteryLevel}%`
      })
    })
  })

  socket.on('geofence-trigger', (data) => {
    const { userId, contacts, eventType, locationName } = data
    contacts.forEach(contactId => {
      io.to(`user-${contactId}`).emit('geofence-alert', {
        userId,
        eventType,
        locationName,
        timestamp: new Date().toISOString()
      })
    })
  })

  // === CONTINUOUS CLOUD BACKUP HANDLERS ===

  // Track active recording sessions per socket
  socket.streamSession = null

  socket.on('stream:start', async (data, callback) => {
    try {
      const { userId, sessionId, location } = data
      console.log(`[CloudBackup] Stream started: session=${sessionId}, user=${userId}`)

      // Store session info on socket for disconnect handling
      socket.streamSession = {
        sessionId,
        userId,
        location,
        chunkCount: 0,
        startedAt: new Date()
      }

      // Import chunk assembler to create session directory
      const { getSessionDir } = await import('./services/chunkAssembler.js')
      getSessionDir(sessionId)

      if (callback) callback({ success: true, sessionId })
    } catch (error) {
      console.error('[CloudBackup] stream:start error:', error)
      if (callback) callback({ success: false, error: error.message })
    }
  })

  socket.on('stream:chunk', async (data, callback) => {
    try {
      if (!socket.streamSession) {
        if (callback) callback({ success: false, error: 'No active session' })
        return
      }

      const { chunkData } = data
      const { sessionId } = socket.streamSession
      const chunkIndex = socket.streamSession.chunkCount

      // Save chunk to disk
      const { saveChunk } = await import('./services/chunkAssembler.js')
      saveChunk(sessionId, chunkIndex, Buffer.from(chunkData))

      socket.streamSession.chunkCount++
      socket.streamSession.lastChunkAt = new Date()

      if (callback) callback({ success: true, chunkIndex })
    } catch (error) {
      console.error('[CloudBackup] stream:chunk error:', error)
      if (callback) callback({ success: false, error: error.message })
    }
  })

  socket.on('stream:end', async (data, callback) => {
    try {
      if (!socket.streamSession) {
        if (callback) callback({ success: false, error: 'No active session' })
        return
      }

      const { cancelled } = data || {}
      const { sessionId, userId, location, chunkCount } = socket.streamSession

      console.log(`[CloudBackup] Stream ended: session=${sessionId}, chunks=${chunkCount}, cancelled=${cancelled}`)

      if (cancelled || chunkCount === 0) {
        // User cancelled or no chunks - cleanup
        const { cleanupChunks } = await import('./services/chunkAssembler.js')
        cleanupChunks(sessionId)
        socket.streamSession = null
        if (callback) callback({ success: true, cancelled: true })
        return
      }

      // Assemble chunks into final video
      const { assembleChunks, cleanupChunks } = await import('./services/chunkAssembler.js')
      const { v4: uuidv4 } = await import('uuid')
      const { join } = await import('path')
      const { fileURLToPath } = await import('url')
      const { dirname } = await import('path')

      const __dirname = dirname(fileURLToPath(import.meta.url))
      const finalFilename = `${uuidv4()}-${Date.now()}.webm`
      const finalPath = join(__dirname, 'uploads', finalFilename)

      await assembleChunks(sessionId, finalPath)

      // Create recording in database
      const db = (await import('./database.js')).default
      const { statSync } = await import('fs')
      const fileStats = statSync(finalPath)

      const result = db.prepare(`
        INSERT INTO recordings (user_id, filename, original_name, file_path, file_size, duration, status, location_lat, location_lng, location_address, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        userId,
        finalFilename,
        'cloud-backup-recording.webm',
        finalPath,
        fileStats.size,
        Math.floor((new Date() - socket.streamSession.startedAt) / 1000),
        location?.lat || null,
        location?.lng || null,
        location?.address || null
      )

      const recordingId = result.lastInsertRowid

      // Cleanup chunks
      cleanupChunks(sessionId)
      socket.streamSession = null

      console.log(`[CloudBackup] Recording saved: id=${recordingId}`)
      if (callback) callback({ success: true, recordingId })
    } catch (error) {
      console.error('[CloudBackup] stream:end error:', error)
      if (callback) callback({ success: false, error: error.message })
    }
  })

  socket.on('disconnect', async () => {
    // Auto-save orphaned sessions
    if (socket.streamSession && socket.streamSession.chunkCount > 0) {
      console.log(`[CloudBackup] Socket disconnected - auto-saving orphaned session ${socket.streamSession.sessionId}`)

      try {
        const { sessionId, userId, location, chunkCount } = socket.streamSession

        const { assembleChunks, cleanupChunks } = await import('./services/chunkAssembler.js')
        const { v4: uuidv4 } = await import('uuid')
        const { join } = await import('path')
        const { fileURLToPath } = await import('url')
        const { dirname } = await import('path')

        const __dirname = dirname(fileURLToPath(import.meta.url))
        const finalFilename = `${uuidv4()}-${Date.now()}-recovered.webm`
        const finalPath = join(__dirname, 'uploads', finalFilename)

        await assembleChunks(sessionId, finalPath)

        const db = (await import('./database.js')).default
        const { statSync } = await import('fs')
        const fileStats = statSync(finalPath)

        db.prepare(`
          INSERT INTO recordings (user_id, filename, original_name, file_path, file_size, duration, status, location_lat, location_lng, location_address, saved_at)
          VALUES (?, ?, ?, ?, ?, ?, 'recovered', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          userId,
          finalFilename,
          'recovered-recording.webm',
          finalPath,
          fileStats.size,
          Math.floor((new Date() - socket.streamSession.startedAt) / 1000),
          location?.lat || null,
          location?.lng || null,
          location?.address || null
        )

        cleanupChunks(sessionId)
        console.log(`[CloudBackup] Orphaned recording recovered successfully`)
      } catch (error) {
        console.error('[CloudBackup] Failed to recover orphaned session:', error)
      }
    }
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`SafeStream server running on port ${PORT}`)
})

