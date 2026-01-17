import { io } from 'socket.io-client'

// Socket URL - same logic as API
const SOCKET_URL = (() => {
    const hostname = window.location.hostname
    const port = window.location.port

    // If on localhost or development, use port 3001 for backend
    if (hostname === 'localhost' || hostname === '127.0.0.1' || port === '5173' || port === '3002') {
        return `http://${hostname}:3001`
    }

    // Otherwise, use same origin
    return window.location.origin
})()

let socket = null

/**
 * Connect to the Socket.IO server for stream uploads
 */
export const connectStreamSocket = () => {
    if (socket && socket.connected) {
        return socket
    }

    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    })

    socket.on('connect', () => {
        console.log('[StreamSocket] Connected:', socket.id)
    })

    socket.on('disconnect', (reason) => {
        console.log('[StreamSocket] Disconnected:', reason)
    })

    socket.on('connect_error', (error) => {
        console.error('[StreamSocket] Connection error:', error.message)
    })

    return socket
}

/**
 * Start a new stream session for cloud backup
 * @param {number} userId - The user ID
 * @param {string} sessionId - Unique session ID
 * @param {object} location - Location data
 * @returns {Promise<object>}
 */
export const startStreamSession = (userId, sessionId, location) => {
    return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
            connectStreamSocket()
        }

        socket.emit('stream:start', { userId, sessionId, location }, (response) => {
            if (response.success) {
                console.log('[StreamSocket] Session started:', sessionId)
                resolve(response)
            } else {
                console.error('[StreamSocket] Failed to start session:', response.error)
                reject(new Error(response.error))
            }
        })
    })
}

/**
 * Upload a video chunk
 * @param {ArrayBuffer} chunkData - The chunk data
 * @returns {Promise<object>}
 */
export const uploadChunk = (chunkData) => {
    return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
            reject(new Error('Socket not connected'))
            return
        }

        socket.emit('stream:chunk', { chunkData }, (response) => {
            if (response.success) {
                resolve(response)
            } else {
                console.error('[StreamSocket] Chunk upload failed:', response.error)
                reject(new Error(response.error))
            }
        })
    })
}

/**
 * End the stream session
 * @param {boolean} cancelled - Whether the recording was cancelled
 * @returns {Promise<object>}
 */
export const endStreamSession = (cancelled = false) => {
    return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
            reject(new Error('Socket not connected'))
            return
        }

        socket.emit('stream:end', { cancelled }, (response) => {
            if (response.success) {
                console.log('[StreamSocket] Session ended:', response)
                resolve(response)
            } else {
                console.error('[StreamSocket] Failed to end session:', response.error)
                reject(new Error(response.error))
            }
        })
    })
}

/**
 * Disconnect the socket
 */
export const disconnectStreamSocket = () => {
    if (socket) {
        socket.disconnect()
        socket = null
    }
}

export default {
    connectStreamSocket,
    startStreamSession,
    uploadChunk,
    endStreamSession,
    disconnectStreamSocket
}
