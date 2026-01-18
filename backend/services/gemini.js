import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI = null
let model = null

const getModel = () => {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      genAI = new GoogleGenerativeAI(apiKey)
      model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' })
    }
  }
  return model
}

export const summarizeAnalysis = async (rawAnalysis) => {
  try {
    const model = getModel()
    if (!model) {
      console.log('Gemini API key not configured')
      return null
    }

    const prompt = `You are a safety analysis assistant. Analyze the following video description and provide a concise safety summary.

VIDEO ANALYSIS:
${rawAnalysis}

Please provide:
1. **Risk Level**: (Low/Medium/High/Critical) - Based on any threats, weapons, aggressive behavior, or dangerous situations detected
2. **Safety Alerts**: List any specific safety concerns or threats identified (if none, say "No immediate threats detected")
3. **Key Observations**: 2-3 bullet points summarizing the most important details
4. **Recommendation**: A brief safety recommendation based on the analysis

Keep the response concise and focused on safety-relevant information. Use clear formatting with headers.`

    const result = await model.generateContent(prompt)
    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Gemini summarization error:', error.message)
    return null
  }
}

export const chatAboutVideo = async (rawAnalysis, userQuestion, chatHistory = []) => {
  try {
    const model = getModel()
    if (!model) {
      console.log('Gemini API key not configured')
      return null
    }

    // Build context from chat history
    let historyContext = ''
    if (chatHistory.length > 0) {
      historyContext = '\n\nPREVIOUS CONVERSATION:\n' +
        chatHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n')
    }

    const prompt = `You are a helpful assistant analyzing a video recording for safety purposes. Answer questions based on the video analysis provided.

VIDEO ANALYSIS:
${rawAnalysis}
${historyContext}

USER QUESTION: ${userQuestion}

Provide a helpful, concise answer based on the video analysis. If the question cannot be answered from the available information, say so. Focus on safety-relevant details when applicable.`

    const result = await model.generateContent(prompt)
    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Gemini chat error:', error.message)
    return null
  }
}

export const isConfigured = () => {
  return !!process.env.GEMINI_API_KEY
}

// Fast video analysis using Gemini Vision (2-3 seconds vs 30-60s for TwelveLabs)
export const analyzeVideoWithGemini = async (videoFilePath) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.log('Gemini API key not configured')
      return null
    }

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const fs = await import('fs')
    const path = await import('path')
    const execAsync = promisify(exec)

    // Extract 3 frames from video (beginning, middle, end)
    const tempDir = path.dirname(videoFilePath)
    const frameBase = path.join(tempDir, `frame_${Date.now()}`)

    try {
      // Get video duration first
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFilePath}"`,
        { timeout: 10000 }
      )
      const duration = parseFloat(durationOutput.trim()) || 10

      // Extract 3 key frames
      const timestamps = [1, Math.floor(duration / 2), Math.max(1, Math.floor(duration - 1))]
      const frames = []

      for (let i = 0; i < timestamps.length; i++) {
        const framePath = `${frameBase}_${i}.jpg`
        try {
          await execAsync(
            `ffmpeg -y -ss ${timestamps[i]} -i "${videoFilePath}" -vframes 1 -q:v 2 "${framePath}"`,
            { timeout: 15000 }
          )
          if (fs.existsSync(framePath)) {
            const frameData = fs.readFileSync(framePath)
            frames.push(frameData.toString('base64'))
            fs.unlinkSync(framePath) // Clean up
          }
        } catch (e) {
          console.log(`Frame extraction at ${timestamps[i]}s failed:`, e.message.substring(0, 50))
        }
      }

      if (frames.length === 0) {
        console.error('No frames extracted from video')
        return null
      }

      // Analyze frames with Gemini Vision
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.2
        }
      })

      const imageParts = frames.map(frameData => ({
        inlineData: {
          mimeType: 'image/jpeg',
          data: frameData
        }
      }))

      const result = await model.generateContent([
        {
          text: `Analyze these ${frames.length} frames from a safety recording. Provide a detailed safety analysis:

1. **Scene Description**: What is happening in the video?
2. **People Present**: How many people, what are they doing?
3. **Safety Concerns**: Any weapons, aggressive behavior, threats, accidents, or dangerous situations?
4. **Risk Level**: LOW, MEDIUM, HIGH, or CRITICAL
5. **Key Details**: Any important observations (license plates, faces, objects, locations)?

Be thorough but concise. This is for safety documentation purposes.`
        },
        ...imageParts
      ])

      const analysis = result.response.text()
      console.log('[Gemini Video Analysis] Complete:', analysis.substring(0, 100))

      return {
        summary: analysis,
        analyzedAt: new Date().toISOString(),
        framesAnalyzed: frames.length,
        method: 'gemini-vision'
      }
    } catch (ffmpegError) {
      console.error('FFmpeg/Analysis error:', ffmpegError.message)
      return null
    }
  } catch (error) {
    console.error('Gemini video analysis error:', error.message)
    return null
  }
}
