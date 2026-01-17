import { existsSync, mkdirSync, writeFileSync, readdirSync, createWriteStream, unlinkSync, rmSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHUNKS_DIR = join(__dirname, '..', 'uploads', 'chunks')

// Ensure chunks directory exists
if (!existsSync(CHUNKS_DIR)) {
    mkdirSync(CHUNKS_DIR, { recursive: true })
}

/**
 * Get the directory for a specific session's chunks
 */
export const getSessionDir = (sessionId) => {
    const dir = join(CHUNKS_DIR, sessionId)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

/**
 * Save a chunk to disk
 * @param {string} sessionId - The stream session ID
 * @param {number} chunkIndex - The chunk number
 * @param {Buffer} data - The chunk data
 */
export const saveChunk = (sessionId, chunkIndex, data) => {
    const sessionDir = getSessionDir(sessionId)
    const chunkPath = join(sessionDir, `chunk_${String(chunkIndex).padStart(5, '0')}.webm`)
    writeFileSync(chunkPath, data)
    console.log(`Saved chunk ${chunkIndex} for session ${sessionId} (${data.length} bytes)`)
    return chunkPath
}

/**
 * Assemble all chunks into a single video file
 * @param {string} sessionId - The stream session ID
 * @param {string} outputPath - Where to save the final video
 * @returns {Promise<string>} - Path to the assembled video
 */
export const assembleChunks = async (sessionId, outputPath) => {
    const sessionDir = getSessionDir(sessionId)

    // Get all chunk files sorted by name
    const chunkFiles = readdirSync(sessionDir)
        .filter(f => f.startsWith('chunk_') && f.endsWith('.webm'))
        .sort()

    if (chunkFiles.length === 0) {
        console.log(`No chunks found for session ${sessionId}`)
        return null
    }

    console.log(`Assembling ${chunkFiles.length} chunks for session ${sessionId}`)

    // For WebM, we can concatenate the chunks since they're all from the same MediaRecorder
    const writeStream = createWriteStream(outputPath)

    for (const chunkFile of chunkFiles) {
        const chunkPath = join(sessionDir, chunkFile)
        const { readFileSync } = await import('fs')
        const data = readFileSync(chunkPath)
        writeStream.write(data)
    }

    writeStream.end()

    // Wait for write to complete
    await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
    })

    console.log(`Assembled video saved to ${outputPath}`)
    return outputPath
}

/**
 * Clean up chunk files for a session
 * @param {string} sessionId - The stream session ID
 */
export const cleanupChunks = (sessionId) => {
    const sessionDir = getSessionDir(sessionId)
    if (existsSync(sessionDir)) {
        try {
            rmSync(sessionDir, { recursive: true, force: true })
            console.log(`Cleaned up chunks for session ${sessionId}`)
        } catch (e) {
            console.error(`Failed to cleanup chunks for session ${sessionId}:`, e.message)
        }
    }
}

/**
 * Get chunk count for a session
 */
export const getChunkCount = (sessionId) => {
    const sessionDir = getSessionDir(sessionId)
    if (!existsSync(sessionDir)) return 0
    return readdirSync(sessionDir).filter(f => f.startsWith('chunk_')).length
}
