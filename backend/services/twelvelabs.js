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
        await execAsync(`ffmpeg -y -i "${webmPath}" -c:v libx264 -preset ultrafast -crf 32 -vf "scale='min(854,iw)':'min(480,ih)':force_original_aspect_ratio=decrease" -c:a aac -b:a 32k "${mp4Path}"`)
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

        // Use curl to upload (bypasses Node 20 fetch + FormData bug)
        const curlCmd = `curl -s -X POST "https://api.twelvelabs.io/v1.3/tasks" \\
            -H "x-api-key: ${apiKey}" \\
            -H "Content-Type: multipart/form-data" \\
            -F "index_id=${indexId}" \\
            -F "language=en" \\
            -F "video_file=@${videoPath}"`

        console.log('Uploading via curl...')
        const { stdout, stderr } = await execAsync(curlCmd, { maxBuffer: 50 * 1024 * 1024 })

        if (stderr) {
            console.error('Curl stderr:', stderr)
        }

        try {
            const data = JSON.parse(stdout)
            if (data._id) {
                console.log('TwelveLabs task created (via curl):', data._id)
                return data._id
            } else if (data.message) {
                console.error('TwelveLabs API Error:', data.message)
                return null
            }
        } catch (parseErr) {
            console.error('Failed to parse TwelveLabs response:', stdout)
            return null
        }

        return null
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
        const apiKey = process.env.TWELVELABS_KEY
        if (!apiKey) return null

        const curlCmd = `curl -s -X POST "https://api.twelvelabs.io/v1.3/search" \\
            -H "x-api-key: ${apiKey}" \\
            -H "Content-Type: application/json" \\
            -d '{"index_id": "${indexId}", "query_text": "${query.replace(/'/g, "\\'")}", "search_options": ["visual"]}'`

        const { stdout, stderr } = await execAsync(curlCmd)

        if (stderr) {
            console.error('Curl search stderr:', stderr)
        }

        try {
            const results = JSON.parse(stdout)
            if (results.data) {
                return {
                    data: results.data.map(item => ({
                        start: item.start,
                        end: item.end,
                        score: item.score
                    }))
                }
            }
            return { data: [] }
        } catch (parseErr) {
            console.error('Failed to parse TwelveLabs search response:', stdout)
            return null
        }
    } catch (error) {
        console.error('TwelveLabs search error:', error.message)
        return null
    }
}

export const generateSummary = async (videoId) => {
    try {
        const apiKey = process.env.TWELVELABS_KEY
        if (!apiKey) return null

        const prompt = "Generate a detailed description of what is happening in this video, focusing on any threats, weapons, or aggressive behavior. Provide a chronological summary."

        const curlCmd = `curl -s -X POST "https://api.twelvelabs.io/v1.3/summarize" \\
            -H "x-api-key: ${apiKey}" \\
            -H "Content-Type: application/json" \\
            -d '{"video_id": "${videoId}", "type": "summary", "prompt": "${prompt.replace(/"/g, '\\"')}"}'`

        const { stdout, stderr } = await execAsync(curlCmd)

        if (stderr) {
            console.error('Curl summarize stderr:', stderr)
        }

        try {
            const result = JSON.parse(stdout)
            return { summary: result.summary || result.data }
        } catch (parseErr) {
            console.error('Failed to parse TwelveLabs summarize response:', stdout)
            return null
        }
    } catch (error) {
        console.error('TwelveLabs generate error:', error.message)
        return null
    }
}

// Quick analyze a video file - uploads, waits for indexing, returns analysis
// Quick analyze a video file - uploads, waits for indexing, returns analysis
export const quickAnalyzeVideo = async (videoFilePath) => {
    try {
        const apiKey = process.env.TWELVELABS_KEY
        if (!apiKey) return null
        const indexId = process.env.TWELVELABS_INDEX_ID
        if (!indexId) return null

        console.log('Quick analyzing video:', videoFilePath)

        // Convert to mp4 if needed
        let videoPath = videoFilePath
        if (videoFilePath.endsWith('.webm')) {
            const mp4Path = await convertToMp4(videoFilePath)
            if (mp4Path && fs.existsSync(mp4Path)) {
                videoPath = mp4Path
            }
        }

        // 1. Upload task via curl
        const uploadCmd = `curl -s -X POST "https://api.twelvelabs.io/v1.3/tasks" \\
            -H "x-api-key: ${apiKey}" \\
            -H "Content-Type: multipart/form-data" \\
            -F "index_id=${indexId}" \\
            -F "language=en" \\
            -F "video_file=@${videoPath}"`

        const { stdout: uploadOut } = await execAsync(uploadCmd, { maxBuffer: 50 * 1024 * 1024 })
        let taskId = null
        try {
            taskId = JSON.parse(uploadOut)._id
        } catch (e) {
            console.error('Failed to parse upload response')
            return null
        }

        if (!taskId) {
            console.error('Upload failed, response:', uploadOut)
            return null
        }
        console.log('Task created:', taskId)

        // 2. Poll status via curl
        let videoId = null
        const startTime = Date.now()
        const timeout = 180000 // 3 minutes timeout

        while (Date.now() - startTime < timeout) {
            const statusCmd = `curl -s -X GET "https://api.twelvelabs.io/v1.3/tasks/${taskId}" -H "x-api-key: ${apiKey}"`
            const { stdout: statusOut } = await execAsync(statusCmd)

            let statusData;
            try {
                statusData = JSON.parse(statusOut)
            } catch (e) {
                console.log('Poll error (retrying):', statusOut)
                await new Promise(r => setTimeout(r, 3000))
                continue
            }

            console.log(`Task ${taskId} status:`, statusData.status)

            if (statusData.status === 'ready') {
                videoId = statusData.video_id
                break
            } else if (statusData.status === 'failed') {
                console.error('Task failed during processing')
                return null
            }
            await new Promise(r => setTimeout(r, 1000))
        }

        if (!videoId) return null

        // 3. Generate summary via curl
        const prompt = "Describe what is happening in this video for a 911 call. Focus on: people, actions, any dangers or threats, injuries, and important details. Be factual and concise."
        const summaryCmd = `curl -s -X POST "https://api.twelvelabs.io/v1.3/summarize" \\
            -H "x-api-key: ${apiKey}" \\
            -H "Content-Type: application/json" \\
            -d '{"video_id": "${videoId}", "type": "summary", "prompt": "${prompt.replace(/"/g, '\\"')}"}'`

        const { stdout: summaryOut } = await execAsync(summaryCmd)
        const summaryResult = JSON.parse(summaryOut)

        return {
            summary: summaryResult.summary || summaryResult.data,
            videoId
        }

    } catch (error) {
        console.error('Quick analyze error:', error.message)
        return null
    }
}
