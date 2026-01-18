import { TwelveLabs } from 'twelvelabs-js'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let client = null

// Initialize client lazily to ensure env vars are loaded
const getClient = () => {
    if (!client) {
        const apiKey = process.env.TWELVELABS_KEY
        if (apiKey) {
            client = new TwelveLabs({ apiKey })
        }
    }
    return client
}

// Convert webm to mp4 to fix duration metadata issues
const convertToMp4 = async (webmPath) => {
    const mp4Path = webmPath.replace(/\.webm$/, '_converted.mp4')

    try {
        console.log(`Converting ${webmPath} to MP4...`)
        await execAsync(`ffmpeg -y -i "${webmPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${mp4Path}"`)
        console.log(`Conversion complete: ${mp4Path}`)
        return mp4Path
    } catch (error) {
        console.error('FFmpeg conversion error:', error.message)
        // Check if ffmpeg is even found
        try {
            await execAsync('which ffmpeg')
        } catch (e) {
            console.error('CRITICAL: ffmpeg binary NOT FOUND in path')
        }
        return null
    }
}

export const indexVideo = async (filePath, recordingId) => {
    try {
        const apiKey = process.env.TWELVELABS_KEY
        const indexId = process.env.TWELVELABS_INDEX_ID

        if (!apiKey || !indexId) {
            console.log('TwelveLabs key or Index ID missing')
            return null
        }

        console.log(`Indexing video for recording ${recordingId}...`)

        // Convert webm to mp4
        let videoPath = filePath
        if (filePath.endsWith('.webm')) {
            const mp4Path = await convertToMp4(filePath)
            if (mp4Path && fs.existsSync(mp4Path)) {
                videoPath = mp4Path
            } else {
                console.error('Failed to convert video, trying original...')
            }
        }

        const formData = new FormData()
        formData.append('index_id', indexId)
        formData.append('language', 'en')
        // Read file into blob/buffer for FormData
        const fileBuffer = fs.readFileSync(videoPath)
        const blob = new Blob([fileBuffer])
        formData.append('video_file', blob, path.basename(videoPath))

        const response = await fetch('https://api.twelvelabs.io/v1.2/tasks', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey
            },
            body: formData
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('TwelveLabs API Error:', response.status, errorText)
            return null
        }

        const data = await response.json()
        console.log('TwelveLabs task created (via fetch):', data._id)

        return data._id
    } catch (error) {
        console.error('TwelveLabs indexing error:', error.message)
        return null
    }
}

export const getTaskStatus = async (taskId) => {
    try {
        const client = getClient()
        if (!client) {
            console.error('TwelveLabs client not initialized')
            return null
        }

        const task = await client.tasks.retrieve(taskId)

        if (!task) {
            console.error(`Task ${taskId} not found`)
            return { status: 'failed', error: 'Task not found' }
        }

        console.log(`Task ${taskId} status:`, task.status, task.videoId ? `video_id: ${task.videoId}` : '')

        // Map SDK status to our expected format
        // SDK usually returns status: 'pending', 'indexing', 'ready', 'failed'
        return {
            status: task.status || 'unknown',
            video_id: task.videoId || task.video_id, // SDK may use either format
            error: task.error || null
        }
    } catch (error) {
        console.error('TwelveLabs status error:', error.message, error.body || '')

        // If task not found, it might have failed or been deleted
        if (error.statusCode === 404 || error.message.includes('not found')) {
            return { status: 'failed', error: 'Task not found - may have failed' }
        }

        return { status: 'error', error: error.message }
    }
}

export const searchVideo = async (indexId, query) => {
    try {
        const client = getClient()
        if (!client) return null

        const results = await client.search.query({
            indexId,
            queryText: query,
            searchOptions: ['visual', 'conversation']
        })

        // Map SDK results to our expected format (array of { start, end, score })
        return {
            data: (results.data || []).map(item => ({
                start: item.start,
                end: item.end,
                score: item.score
            }))
        }
    } catch (error) {
        console.error('TwelveLabs search error:', error.message)
        return null
    }
}

export const generateSummary = async (videoId) => {
    try {
        const client = getClient()
        if (!client) return null

        const result = await client.summarize({
            videoId,
            type: 'summary',
            prompt: "Generate a detailed description of what is happening in this video, focusing on any threats, weapons, or aggressive behavior. Provide a chronological summary."
        })

        return { summary: result.summary || result.data }
    } catch (error) {
        console.error('TwelveLabs generate error:', error.message)
        return null
    }
}

// Quick analyze a video file - uploads, waits for indexing, returns analysis
export const quickAnalyzeVideo = async (videoFilePath) => {
    try {
        const client = getClient()
        if (!client) {
            console.log('TwelveLabs not configured')
            return null
        }

        const indexId = process.env.TWELVELABS_INDEX_ID
        if (!indexId) {
            console.log('TwelveLabs Index ID missing')
            return null
        }

        console.log('Quick analyzing video:', videoFilePath)

        // Convert to mp4 if needed
        let videoPath = videoFilePath
        if (videoFilePath.endsWith('.webm')) {
            const mp4Path = await convertToMp4(videoFilePath)
            if (mp4Path && fs.existsSync(mp4Path)) {
                videoPath = mp4Path
            }
        }

        // Upload and create task
        const task = await client.tasks.create({
            indexId,
            videoFile: fs.createReadStream(videoPath),
            language: 'en'
        })

        console.log('Task created:', task.id)

        // Wait for indexing (poll every 3 seconds, max 60 seconds)
        let status = null
        let videoId = null
        const startTime = Date.now()
        const timeout = 60000 // 60 seconds max

        while (Date.now() - startTime < timeout) {
            const taskStatus = await client.tasks.retrieve(task.id)
            console.log('Task status:', taskStatus.status)

            if (taskStatus.status === 'ready') {
                videoId = taskStatus.videoId
                break
            } else if (taskStatus.status === 'failed') {
                console.error('Task failed')
                return null
            }

            // Wait 3 seconds before next poll
            await new Promise(r => setTimeout(r, 3000))
        }

        if (!videoId) {
            console.log('Indexing timed out')
            return null
        }

        // Get quick analysis using gist
        try {
            const gist = await client.gist({
                videoId,
                types: ['topic', 'hashtag', 'title']
            })

            // Also get a detailed analysis
            const analysis = await client.analyze({
                videoId,
                prompt: 'Describe what is happening in this video for a 9111 emergency call. Focus on: people, actions, any dangers or threats, injuries, and important details. Be factual and concise.'
            })

            return {
                gist: gist,
                analysis: analysis?.data || analysis,
                videoId
            }
        } catch (e) {
            console.error('Analysis error:', e.message)
            // Try summarize as fallback
            const summary = await client.summarize({
                videoId,
                type: 'summary',
                prompt: 'Describe what is happening for a 9111 call. Be factual.'
            })
            return { summary: summary?.summary || summary?.data, videoId }
        }
    } catch (error) {
        console.error('Quick analyze error:', error.message)
        return null
    }
}
