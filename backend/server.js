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
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`SafeStream server running on port ${PORT}`)
})

