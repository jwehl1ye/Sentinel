import WebSocket from 'ws'

// ElevenLabs WebSocket for real-time conversation
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation'

export class VoiceAISession {
  constructor({ 
    onTranscript, 
    onAudioData, 
    onError,
    systemPrompt,
    voiceId = 'EXAVITQu4vr4xnSDxMaL' // Default to "Sarah" voice
  }) {
    this.onTranscript = onTranscript
    this.onAudioData = onAudioData
    this.onError = onError
    this.systemPrompt = systemPrompt
    this.voiceId = voiceId
    this.ws = null
    this.isConnected = false
    this.conversationHistory = []
  }

  async connect() {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured')
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(ELEVENLABS_WS_URL, {
        headers: {
          'xi-api-key': apiKey
        }
      })

      this.ws.on('open', () => {
        console.log('ElevenLabs WebSocket connected')
        this.isConnected = true
        
        // Send initialization message
        this.ws.send(JSON.stringify({
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            agent: {
              prompt: {
                prompt: this.systemPrompt
              },
              first_message: "911, what's your emergency?",
              language: "en"
            },
            tts: {
              voice_id: this.voiceId
            }
          }
        }))
        
        resolve()
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (e) {
          // Binary audio data
          if (this.onAudioData) {
            this.onAudioData(data)
          }
        }
      })

      this.ws.on('error', (error) => {
        console.error('ElevenLabs WebSocket error:', error)
        if (this.onError) this.onError(error)
        reject(error)
      })

      this.ws.on('close', () => {
        console.log('ElevenLabs WebSocket closed')
        this.isConnected = false
      })
    })
  }

  handleMessage(message) {
    switch (message.type) {
      case 'audio':
        // Audio chunk from ElevenLabs
        if (message.audio && this.onAudioData) {
          const audioBuffer = Buffer.from(message.audio, 'base64')
          this.onAudioData(audioBuffer)
        }
        break
        
      case 'transcript':
        // Transcription of user speech or AI response
        if (this.onTranscript) {
          this.onTranscript({
            role: message.role, // 'user' or 'agent'
            text: message.text
          })
        }
        this.conversationHistory.push({
          role: message.role,
          content: message.text
        })
        break
        
      case 'agent_response':
        // AI generated response text
        console.log('Agent response:', message.text)
        break
        
      case 'error':
        console.error('ElevenLabs error:', message)
        if (this.onError) this.onError(new Error(message.message))
        break
    }
  }

  // Send audio data to ElevenLabs for processing
  sendAudio(audioData) {
    if (!this.isConnected || !this.ws) return
    
    // Send as base64 encoded audio
    this.ws.send(JSON.stringify({
      type: 'audio',
      audio: audioData.toString('base64')
    }))
  }

  // Send a text message for the AI to respond to
  sendText(text) {
    if (!this.isConnected || !this.ws) return
    
    this.ws.send(JSON.stringify({
      type: 'user_message',
      text: text
    }))
  }

  // Update the AI's context with new information (e.g., video analysis)
  updateContext(newContext) {
    if (!this.isConnected || !this.ws) return
    
    this.ws.send(JSON.stringify({
      type: 'context_update',
      context: newContext
    }))
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

export const isConfigured = () => {
  return !!process.env.ELEVENLABS_API_KEY
}
