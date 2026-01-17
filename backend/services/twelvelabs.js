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
    return null
  }
}

export const indexVideo = async (filePath, recordingId) => {
    try {
        const client = getClient()
        if (!client) {
            console.log('TwelveLabs key missing, skipping indexing')
            return null
        }
        const indexId = process.env.TWELVELABS_INDEX_ID
        if (!indexId) {
            console.log('TwelveLabs Index ID missing')
            return null
        }

        console.log(`Indexing video for recording ${recordingId}...`)

        // Convert webm to mp4 for better compatibility with TwelveLabs
        let videoPath = filePath
        if (filePath.endsWith('.webm')) {
            const mp4Path = await convertToMp4(filePath)
            if (mp4Path && fs.existsSync(mp4Path)) {
                videoPath = mp4Path
            } else {
                console.error('Failed to convert video, trying original...')
            }
        }

        const task = await client.tasks.create({
            indexId,
            videoFile: fs.createReadStream(videoPath),
            language: 'en'
        })

        console.log('TwelveLabs task created:', task.id)
        
        // Clean up converted file after upload (optional - keep for debugging)
        // if (videoPath !== filePath && fs.existsSync(videoPath)) {
        //     fs.unlinkSync(videoPath)
        // }
        
        return task.id
    } catch (error) {
        console.error('TwelveLabs indexing error:', error.message)
        if (error.body) console.error('Error body:', JSON.stringify(error.body, null, 2))
        return null
    }
}

export const getTaskStatus = async (taskId) => {
    try {
        const client = getClient()
        if (!client) return null
        const task = await client.tasks.retrieve(taskId)

        // Map SDK status to our expected format
        // SDK usually returns status: 'pending', 'indexing', 'ready', 'failed'
        return {
            status: task.status,
            video_id: task.videoId // SDK usually provides this when ready
        }
    } catch (error) {
        console.error('TwelveLabs status error:', error.message)
        return null
    }
}

export const searchVideo = async (indexId, query) => {
    try {
        const client = getClient()
        if (!client) return null

        const results = await client.search.query({
            indexId,
            queryText: query,
            options: ['visual', 'conversation']
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
