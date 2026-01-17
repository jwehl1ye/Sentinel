import express from 'express'
import Twilio from 'twilio'
import { authenticateToken } from '../middleware/auth.js'
import db from '../database.js'
import { quickAnalyzeVideo } from '../services/twelvelabs.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

// Helper to generate ElevenLabs TTS audio URL for Twilio <Play>
const generateElevenLabsAudioUrl = (text, callId) => {
  const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`
  // Twilio will call this endpoint to get the audio - text is passed in query param
  const textHash = Buffer.from(text).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 50)
  const encodedText = encodeURIComponent(text)
  return `${serverUrl}/api/emergency/tts/${callId}/${textHash}?text=${encodedText}`
}

// Helper to generate TwiML for speech (Play with ElevenLabs or Say as fallback)
const generateSpeechTwiML = async (text, callId) => {
  const hasElevenLabs = await checkElevenLabsPermission()
  if (hasElevenLabs) {
    const audioUrl = generateElevenLabsAudioUrl(text, callId)
    return `<Play>${audioUrl}</Play>`
  } else {
    // Fallback to Twilio Say
    return `<Say voice="Google.en-US-Neural2-D">${text.replace(/[<>&'"]/g, '')}</Say>`
  }
}

// Check if ElevenLabs has permission (cache the result)
let elevenLabsHasPermission = null
const checkElevenLabsPermission = async () => {
  if (elevenLabsHasPermission !== null) return elevenLabsHasPermission
  
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY
  if (!elevenLabsKey) {
    elevenLabsHasPermission = false
    return false
  }
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'test',
        model_id: 'eleven_turbo_v2_5'
      })
    })
    
    elevenLabsHasPermission = response.ok
    if (!response.ok) {
      const error = await response.text()
      console.error('[TTS] ElevenLabs permission check failed:', error)
    }
  } catch (error) {
    console.error('[TTS] ElevenLabs permission check error:', error.message)
    elevenLabsHasPermission = false
  }
  
  return elevenLabsHasPermission
}

// Store TTS cache temporarily (text -> audio buffer)
const ttsCache = new Map()

// Endpoint for Twilio to fetch ElevenLabs audio (no auth needed - Twilio calls this)
router.get('/tts/:callId/:textHash', async (req, res) => {
  try {
    const { callId, textHash } = req.params
    const { text } = req.query
    
    if (!text) {
      return res.status(400).send('Text required')
    }

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY
    if (!elevenLabsKey) {
      return res.status(503).send('ElevenLabs not configured')
    }

    // Check cache first
    const cacheKey = `${callId}_${textHash}`
    if (ttsCache.has(cacheKey)) {
      const audio = ttsCache.get(cacheKey)
      res.set('Content-Type', 'audio/mpeg')
      res.set('Cache-Control', 'public, max-age=3600')
      return res.send(audio)
    }

    // Generate audio using ElevenLabs (use professional voice)
    const voiceId = 'EXAVITQu4vr4xnSDxMaL' // Sarah - calm and clear
    const textToSpeak = decodeURIComponent(text)

    console.log(`[TTS] Generating audio for callId: ${callId}, text length: ${textToSpeak.length}`)

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: textToSpeak,
        model_id: 'eleven_turbo_v2_5', // Fast model for real-time
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[TTS] ElevenLabs API error (${response.status}):`, errorText)
      
      // Return empty audio with proper headers - Twilio will skip it
      // The calling code should use Twilio Say as fallback
      res.set('Content-Type', 'audio/mpeg')
      res.status(200) // Return 200 so Twilio doesn't think it's an error
      return res.send(Buffer.alloc(0))
    }

    const audioBuffer = await response.arrayBuffer()
    const audio = Buffer.from(audioBuffer)
    
    console.log(`[TTS] Generated audio: ${audio.length} bytes for callId: ${callId}`)
    
    // Cache for 5 minutes
    ttsCache.set(cacheKey, audio)
    setTimeout(() => ttsCache.delete(cacheKey), 300000)

    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(audio)

  } catch (error) {
    console.error('[TTS] Generation error:', error.message, error.stack)
    // Return empty audio with proper headers - Twilio will skip it
    // The calling code should use Twilio Say as fallback
    res.set('Content-Type', 'audio/mpeg')
    res.status(200) // Return 200 so Twilio doesn't think it's an error
    res.send(Buffer.alloc(0))
  }
})

// Store active emergency calls
const activeEmergencyCalls = new Map()

// Store active safety contact calls (separate from 9111 calls)
const activeSafetyContactCalls = new Map()

// IMPORTANT: Test number only - NEVER use actual 9111
const EMERGENCY_TEST_NUMBER = '+14372541201'

// Get Twilio client
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (accountSid && authToken) {
    return new Twilio(accountSid, authToken)
  }
  return null
}

// Create ElevenLabs Conversational AI call via their API
const initiateElevenLabsCall = async (toNumber, emergencyContext) => {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  // Build the system prompt with emergency context
  const systemPrompt = `You are an AI emergency assistant making a 9111 call on behalf of someone who cannot speak. They may be in danger, injured, or hiding.

CRITICAL EMERGENCY INFORMATION:
- Caller Name: ${emergencyContext.userName || 'Unknown'}
- Location: ${emergencyContext.location?.address || `GPS: ${emergencyContext.location?.lat?.toFixed(6)}, ${emergencyContext.location?.lng?.toFixed(6)}` || 'Unknown'}
- Emergency Situation: ${emergencyContext.situation || 'Emergency - caller cannot speak'}
${emergencyContext.videoAnalysis ? `- Scene Description: ${emergencyContext.videoAnalysis}` : ''}

YOUR ROLE:
- You are speaking to a 9111 operator
- Be calm, clear, and concise
- First, state this is an AI calling on behalf of someone in an emergency
- Immediately provide the location
- Describe the emergency situation
- Answer the operator's questions directly
- If asked, confirm this is a TEST CALL for demonstration

Start by saying: "Hello, this is an AI emergency assistant calling on behalf of ${emergencyContext.userName || 'a person'} who cannot speak. This is a TEST CALL. The caller is located at ${emergencyContext.location?.address || 'coordinates ' + emergencyContext.location?.lat?.toFixed(4) + ', ' + emergencyContext.location?.lng?.toFixed(4)}. ${emergencyContext.situation || 'They need emergency assistance.'}"`;

  // Use ElevenLabs Conversational AI outbound call API
  const response = await fetch('https://api.elevenlabs.io/v1/convai/conversation/create-call', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agent_phone_number_id: 'twilio', // Uses the Twilio integration
      to_number: toNumber,
      agent_config: {
        prompt: {
          prompt: systemPrompt
        },
        first_message: `Hello, this is an AI emergency assistant. This is a TEST CALL. I'm calling on behalf of ${emergencyContext.userName || 'someone'} who is in an emergency and cannot speak. Their location is ${emergencyContext.location?.address || 'being determined'}. ${emergencyContext.situation || 'They need immediate assistance.'}`,
        language: 'en'
      }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('ElevenLabs call error:', error)
    throw new Error(`ElevenLabs API error: ${response.status}`)
  }

  return await response.json()
}

// Check if all services are configured
router.get('/config-status', authenticateToken, (req, res) => {
  res.json({
    twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY
  })
})

// Force end any existing call for user
router.post('/force-reset', authenticateToken, (req, res) => {
  const userId = req.user.id
  if (activeEmergencyCalls.has(userId)) {
    const callData = activeEmergencyCalls.get(userId)
    // Try to end Twilio call if exists
    if (callData.context?.twilioCallSid) {
      const twilioClient = getTwilioClient()
      if (twilioClient) {
        twilioClient.calls(callData.context.twilioCallSid)
          .update({ status: 'completed' })
          .catch(e => console.log('Force end call error:', e.message))
      }
    }
    activeEmergencyCalls.delete(userId)
  }
  res.json({ success: true, message: 'Call state reset' })
})

// Initiate emergency call
router.post('/call', authenticateToken, async (req, res) => {
  try {
    const { location, situation, videoFrame, userData } = req.body
    const userId = req.user.id
    
    // Analyze initial video frame using GOOD Gemini model
    let videoAnalysis = null
    if (videoFrame) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai')
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
        
        // Try good vision models
        const visionModels = ['gemini-2.5-flash', 'gemini-2.0-flash']
        const imageData = videoFrame.replace(/^data:image\/\w+;base64,/, '')
        
        for (const modelName of visionModels) {
          try {
            const model = genAI.getGenerativeModel({ 
              model: modelName,
              generationConfig: { maxOutputTokens: 80, temperature: 0.1 }
            })
            
            const result = await model.generateContent([
              { text: 'Describe this scene for 9111 in one factual sentence. Only describe what you clearly see.' },
              { inlineData: { mimeType: 'image/jpeg', data: imageData } }
            ])
            
            videoAnalysis = result.response.text().trim()
            console.log(`Initial video analysis (${modelName}):`, videoAnalysis)
            break
          } catch (e) {
            if (!e.message.includes('429')) break
          }
        }
      } catch (e) {
        console.log('Initial video analysis skipped:', e.message?.substring(0, 50))
      }
    }

    // Check if user already has an active call - but allow override if call is old (> 2 min)
    if (activeEmergencyCalls.has(userId)) {
      const existingCall = activeEmergencyCalls.get(userId)
      const callAge = Date.now() - new Date(existingCall.context.startTime).getTime()
      
      // If call is older than 2 minutes, auto-cleanup
      if (callAge > 120000) {
        console.log('Auto-cleaning stale call')
        if (existingCall.context?.twilioCallSid) {
          const twilioClient = getTwilioClient()
          if (twilioClient) {
            twilioClient.calls(existingCall.context.twilioCallSid)
              .update({ status: 'completed' })
              .catch(e => console.log('Cleanup error:', e.message))
          }
        }
        activeEmergencyCalls.delete(userId)
      } else {
        return res.status(400).json({ 
          error: 'Emergency call already in progress',
          callId: existingCall.callId,
          hint: 'Use /api/emergency/force-reset to reset'
        })
      }
    }

    // Get user info
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)

    // Prepare emergency context for AI
    const emergencyContext = {
      userId,
      userName: user?.name || 'Unknown',
      location: location || { lat: null, lng: null, address: 'Location unknown' },
      situation: situation || 'Emergency situation - caller may be in danger',
      videoAnalysis: videoAnalysis || null,
      userData: userData || {}, // Medical info, contacts, etc.
      startTime: new Date().toISOString(),
      transcript: []
    }

    const callId = `call_${Date.now()}_${userId}`
    
    // Check if ElevenLabs and Twilio are configured for real AI voice calls
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY
    const twilioClient = getTwilioClient()
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER

    if (twilioClient && twilioNumber) {
      try {
        const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`
        
        // Build concise emergency message
        const locationStr = emergencyContext.location?.address || 
          (emergencyContext.location?.lat ? `${emergencyContext.location.lat.toFixed(4)}, ${emergencyContext.location.lng.toFixed(4)}` : 'unknown location')
        
        const userName = emergencyContext.userName || 'a person'
        const emergencyMessage = `This is a test call. I'm an AI calling on behalf of ${userName}, located at ${locationStr}. They are unable to speak and requested this call. How can I help?`
        const gatherPrompt = "Please tell me your questions and I will try to help."

        // Use ElevenLabs TTS if available, otherwise fallback to Twilio Say
        const emergencySpeech = await generateSpeechTwiML(emergencyMessage, callId)
        const gatherSpeech = await generateSpeechTwiML(gatherPrompt, callId)
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${emergencySpeech}
  <Gather input="speech" timeout="8" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="help, police, ambulance, fire, location, hurt, injured, yes, no, where, what, who, how many" action="${serverUrl}/api/emergency/gather/${callId}" method="POST">
    ${gatherSpeech}
  </Gather>
  <Redirect>${serverUrl}/api/emergency/gather/${callId}?timeout=true</Redirect>
</Response>`
        
        const call = await twilioClient.calls.create({
          to: EMERGENCY_TEST_NUMBER,
          from: twilioNumber,
          twiml: twiml,
          statusCallback: `${serverUrl}/api/emergency/call-status/${callId}`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        })

        emergencyContext.twilioCallSid = call.sid
        emergencyContext.callType = 'twilio-interactive'
        
        console.log('Interactive Twilio call initiated:', call.sid)
      } catch (twilioError) {
        console.error('Twilio call failed:', twilioError.message)
        emergencyContext.callType = 'simulated'
        emergencyContext.error = twilioError.message
      }
    } else {
      emergencyContext.callType = 'simulated'
      console.log('Twilio not configured - using simulated call')
    }

    // Store the call context
    activeEmergencyCalls.set(userId, {
      callId,
      context: emergencyContext,
      status: 'connecting',
      transcript: []
    })

    // Generate initial AI greeting based on emergency context
    let initialMessage = `This is an AI emergency assistant calling on behalf of ${emergencyContext.userName}. `
    
    if (emergencyContext.location?.address && emergencyContext.location.address !== 'Location unknown') {
      initialMessage += `The caller is located at ${emergencyContext.location.address}. `
    } else if (emergencyContext.location?.lat) {
      initialMessage += `The caller's GPS coordinates are ${emergencyContext.location.lat.toFixed(6)}, ${emergencyContext.location.lng.toFixed(6)}. `
    }
    
    initialMessage += emergencyContext.situation
    
    if (emergencyContext.videoAnalysis) {
      initialMessage += ` Based on video analysis: ${emergencyContext.videoAnalysis}`
    }
    
    initialMessage += ` This is a TEST CALL for demonstration purposes.`

    // Update call status
    const callData = activeEmergencyCalls.get(userId)
    callData.status = 'active'
    callData.transcript.push({
      role: 'ai',
      content: initialMessage,
      timestamp: new Date().toISOString()
    })

    res.json({
      success: true,
      callId,
      status: 'active',
      callType: emergencyContext.callType,
      initialMessage,
      testNumber: EMERGENCY_TEST_NUMBER,
      location: emergencyContext.location
    })

  } catch (error) {
    console.error('Emergency call error:', error)
    res.status(500).json({ error: 'Failed to initiate emergency call' })
  }
})

// Handle speech input from caller (Twilio Gather webhook)
router.post('/gather/:callId', async (req, res) => {
  try {
    const { callId } = req.params
    const { SpeechResult, Confidence, Digits } = req.body
    const isTimeout = req.query.timeout === 'true'
    
    console.log(`Gather received for ${callId}:`, { SpeechResult, Confidence, Digits, isTimeout, body: req.body })
    
    // Find the call context
    let callData = null
    let userId = null
    for (const [uid, data] of activeEmergencyCalls) {
      if (data.callId === callId) {
        callData = data
        userId = uid
        break
      }
    }

    if (!callData) {
      // Call not found, just end gracefully (using ElevenLabs TTS if available)
      const lostContextSpeech = await generateSpeechTwiML("Call context lost. Please call back. Goodbye.", callId)
      res.type('text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${lostContextSpeech}
  <Hangup/>
</Response>`)
      return
    }

    const context = callData.context
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`

    // Handle timeout - just re-prompt (using ElevenLabs TTS if available)
    if (isTimeout && !SpeechResult && !Digits) {
      const stillHereSpeech = await generateSpeechTwiML("I'm still here. Go ahead.", callId)
      const goodbyeSpeech = await generateSpeechTwiML("Goodbye.", callId)
      res.type('text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="help, yes, no, police, ambulance" action="${serverUrl}/api/emergency/gather/${callId}" method="POST">
    ${stillHereSpeech}
  </Gather>
  ${goodbyeSpeech}
  <Hangup/>
</Response>`)
      return
    }

    const userInput = SpeechResult || (Digits ? `(pressed ${Digits})` : '(no speech detected)')

    // Add to transcript
    callData.transcript.push({
      role: 'operator',
      content: userInput,
      timestamp: new Date().toISOString()
    })

    // Generate AI response
    let aiResponse = "I understand. The emergency services have been notified with the caller's information."
    
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ 
        model: 'gemma-3-4b-it',
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.3,
        }
      })

      const callerInfo = `${context.userName} at ${context.location?.address || 'unknown location'}`
      
      // Build context string from user data
      let contextInfo = `Caller: ${context.userName}, Location: ${context.location?.address || 'unknown'}`
      
      if (context.userData?.medical) {
        const med = context.userData.medical
        if (med.blood_type) contextInfo += `, Blood Type: ${med.blood_type}`
        if (med.allergies) contextInfo += `, Allergies: ${med.allergies}`
        if (med.medications) contextInfo += `, Medications: ${med.medications}`
        if (med.conditions) contextInfo += `, Medical Conditions: ${med.conditions}`
      }
      
      if (context.userData?.contacts && context.userData.contacts.length > 0) {
        const contactNames = context.userData.contacts.map(c => c.name || c.phone).join(', ')
        contextInfo += `, Emergency Contacts: ${contactNames}`
      }
      
      if (context.situation && context.situation !== 'Emergency situation - caller may be in danger') {
        contextInfo += `, Situation: ${context.situation}`
      }
      
      // Check if operator is ending the conversation
      const endingPhrases = ['thank you', 'help is on the way', 'we are coming', 'assistance is coming', 'okay', 'ok', 'got it', 'understood', 'goodbye', 'bye']
      const isEnding = endingPhrases.some(phrase => userInput.toLowerCase().includes(phrase))
      
      let prompt
      if (isEnding) {
        prompt = `You are a 9111 AI assistant. The operator just said: "${userInput}"

This sounds like they are ending the conversation or confirming help is on the way.
Respond with a brief acknowledgment and end politely. One sentence only.

Example: "Thank you. I will let them know help is on the way."
You:`
      } else {
        prompt = `You are a 9111 AI assistant speaking on behalf of ${callerInfo} who cannot talk.
CONTEXT: ${contextInfo}

Answer the operator's question using this context. If you don't know something, say so.
Be concise. One short sentence only.

Operator: ${userInput}
You:`
      }

      const result = await model.generateContent(prompt)
      aiResponse = result.response.text().trim().split('\n')[0].substring(0, 200)
    } catch (e) {
      console.error('AI response generation failed:', e)
    }

    // Add AI response to transcript
    callData.transcript.push({
      role: 'ai',
      content: aiResponse,
      timestamp: new Date().toISOString()
    })

    // Send TwiML response with AI answer using ElevenLabs TTS if available
    const aiResponseSpeech = await generateSpeechTwiML(aiResponse.replace(/[<>&'"]/g, ''), callId)
    res.type('text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${aiResponseSpeech}
  <Gather input="speech" timeout="8" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="help, police, ambulance, yes, no, where, what, who, how many" action="${serverUrl}/api/emergency/gather/${callId}" method="POST"/>
  <Redirect>${serverUrl}/api/emergency/gather/${callId}?timeout=true</Redirect>
</Response>`)

  } catch (error) {
    console.error('Gather handler error:', error)
    const errorSpeech = await generateSpeechTwiML("I encountered an error. Emergency logged. Goodbye.", callId)
    res.type('text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${errorSpeech}
  <Hangup/>
</Response>`)
  }
})

// Twilio call status webhook
router.post('/call-status/:callId', (req, res) => {
  const { callId } = req.params
  const { CallStatus, CallDuration } = req.body
  
  console.log(`Call ${callId} status: ${CallStatus}`)
  
  // Find the call by callId
  for (const [userId, callData] of activeEmergencyCalls) {
    if (callData.callId === callId) {
      if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
        callData.status = 'ended'
        callData.duration = CallDuration
      } else if (CallStatus === 'in-progress') {
        callData.status = 'active'
      }
      break
    }
  }
  
  res.status(200).send('OK')
})

// Get call status
router.get('/status/:callId', authenticateToken, (req, res) => {
  const userId = req.user.id
  const callData = activeEmergencyCalls.get(userId)

  if (!callData || callData.callId !== req.params.callId) {
    return res.status(404).json({ error: 'Call not found' })
  }

  res.json({
    callId: callData.callId,
    status: callData.status,
    callType: callData.context.callType,
    transcript: callData.transcript,
    duration: Date.now() - new Date(callData.context.startTime).getTime(),
    location: callData.context.location
  })
})

// End emergency call
router.post('/end', authenticateToken, async (req, res) => {
  const userId = req.user.id
  const callData = activeEmergencyCalls.get(userId)

  if (!callData) {
    return res.status(404).json({ error: 'No active call found' })
  }

  // End Twilio call if active
  if (callData.context.twilioCallSid) {
    try {
      const twilioClient = getTwilioClient()
      if (twilioClient) {
        await twilioClient.calls(callData.context.twilioCallSid).update({ status: 'completed' })
      }
    } catch (e) {
      console.log('Error ending Twilio call:', e.message)
    }
  }

  callData.status = 'ended'
  
  console.log('Emergency call ended:', {
    callId: callData.callId,
    duration: Date.now() - new Date(callData.context.startTime).getTime(),
    transcriptLength: callData.transcript.length
  })

  // Remove from active calls after a delay
  setTimeout(() => {
    activeEmergencyCalls.delete(userId)
  }, 60000)

  res.json({
    success: true,
    callId: callData.callId,
    status: 'ended',
    transcript: callData.transcript
  })
})

// Generate AI response for emergency operator
router.post('/ai-response', authenticateToken, async (req, res) => {
  try {
    const { operatorMessage, callId, videoFrame } = req.body
    const userId = req.user.id
    const callData = activeEmergencyCalls.get(userId)

    if (!callData) {
      return res.status(404).json({ error: 'No active call found' })
    }

    const context = callData.context

    // Add operator message to transcript
    callData.transcript.push({
      role: 'operator',
      content: operatorMessage,
      timestamp: new Date().toISOString()
    })

    // Build prompt for Gemini
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    
    // Use optimized model config
    const model = genAI.getGenerativeModel({ 
      model: 'gemma-3-4b-it',
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.3,
      }
    })

    // Build conversation history for context
    const conversationHistory = callData.transcript
      .filter(t => t.role !== 'system')
      .map(t => `${t.role === 'operator' ? '9111 Operator' : 'AI Assistant'}: ${t.content}`)
      .join('\n')

    // Check if operator is ending the conversation
    const endingPhrases = ['thank you', 'help is on the way', 'we are coming', 'assistance is coming', 'okay', 'ok', 'got it', 'understood', 'goodbye', 'bye', 'will send help', 'help coming']
    const isEnding = endingPhrases.some(phrase => operatorMessage.toLowerCase().includes(phrase))
    
    let prompt
    if (isEnding) {
      prompt = `You are an AI emergency assistant on a 9111 call.
The operator just said: "${operatorMessage}"

This sounds like they are ending the conversation or confirming help is on the way.
Respond with a brief, professional acknowledgment and end the conversation politely.
One sentence only.

Example: "Thank you. I will let the caller know help is on the way."
You:`
    } else {
      prompt = `You are an AI emergency assistant on a 9111 call, speaking on behalf of someone who cannot speak (they may be in danger, injured, or hiding).

EMERGENCY CONTEXT:
- Caller Name: ${context.userName}
- Location: ${context.location?.address || (context.location?.lat ? `Coordinates: ${context.location.lat.toFixed(6)}, ${context.location.lng.toFixed(6)}` : 'Unknown')}
- Initial Situation: ${context.situation}
${context.videoAnalysis ? `- Previous Video Analysis: ${context.videoAnalysis}` : ''}

CONVERSATION SO FAR:
${conversationHistory}

CURRENT OPERATOR MESSAGE: "${operatorMessage}"

INSTRUCTIONS:
- Be calm, clear, and concise
- Prioritize providing location and nature of emergency
- Answer the operator's questions directly and helpfully
- If you see something new in the video, report it
- Keep responses brief (1-2 sentences max)
- This is a TEST CALL - if asked, confirm it's a test
- If you need more information, say you'll try to get it from the video feed

Respond as the AI assistant speaking to the 9111 operator:`
    }

    // If we have a video frame, analyze it too
    let parts = [{ text: prompt }]
    
    if (videoFrame) {
      // Video frame is base64 encoded
      try {
        const imageData = videoFrame.replace(/^data:image\/\w+;base64,/, '')
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageData
          }
        })
        parts[0].text += '\n\n[A live video frame from the scene is attached - describe what you see if relevant to the emergency]'
      } catch (e) {
        console.log('Error processing video frame:', e)
      }
    }

    const result = await model.generateContent(parts)
    const aiResponse = result.response.text()

    // Add AI response to transcript
    callData.transcript.push({
      role: 'ai',
      content: aiResponse,
      timestamp: new Date().toISOString()
    })

    // Update video analysis if we got new info
    if (videoFrame) {
      context.lastVideoAnalysis = new Date().toISOString()
    }

    res.json({
      response: aiResponse,
      transcript: callData.transcript
    })

  } catch (error) {
    console.error('AI response error:', error)
    res.status(500).json({ error: 'Failed to generate response', details: error.message })
  }
})

// Update call with new video analysis
router.post('/update-video', authenticateToken, async (req, res) => {
  try {
    const { videoFrame } = req.body
    const userId = req.user.id
    const callData = activeEmergencyCalls.get(userId)

    if (!callData) {
      return res.status(404).json({ error: 'No active call found' })
    }

    if (!videoFrame) {
      return res.status(400).json({ error: 'No video frame provided' })
    }

    // Use GOOD Gemini model for vision (gemini-2.5-flash is best for images)
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    
    // Try gemini-2.5-flash first (best vision), fallback to others if rate limited
    const visionModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro']
    let analysis = null
    
    const imageData = videoFrame.replace(/^data:image\/\w+;base64,/, '')
    
    for (const modelName of visionModels) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.1,  // Low temperature for factual descriptions
          }
        })
        
        const result = await model.generateContent([
          {
            text: `You are analyzing a live video frame for a 9111 emergency call. 
ONLY describe what you can CLEARLY see. Do NOT make assumptions or guess.
If the image is unclear, say "Image unclear".
Describe: people visible, their actions, any objects, the setting. Be factual and brief (1-2 sentences).`
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageData
            }
          }
        ])
        
        analysis = result.response.text().trim()
        console.log(`Vision analysis with ${modelName}:`, analysis.substring(0, 100))
        break  // Success, exit loop
      } catch (e) {
        console.log(`${modelName} failed:`, e.message.substring(0, 50))
        if (!e.message.includes('429')) {
          // Not a rate limit error, don't try other models
          break
        }
        // Rate limited, try next model
      }
    }
    
    if (!analysis) {
      return res.status(503).json({ 
        error: 'Vision models unavailable', 
        message: 'All Gemini vision models are rate limited. Try again later.' 
      })
    }
    
    // Update context with new analysis
    callData.context.videoAnalysis = analysis
    callData.context.lastVideoUpdate = new Date().toISOString()

    res.json({ 
      success: true, 
      analysis,
      timestamp: callData.context.lastVideoUpdate
    })

  } catch (error) {
    console.error('Video analysis error:', error)
    res.status(500).json({ error: 'Failed to analyze video' })
  }
})

// Update context (location, situation)
router.post('/update-context', authenticateToken, async (req, res) => {
  try {
    const { location, situation, videoAnalysis } = req.body
    const userId = req.user.id
    const callData = activeEmergencyCalls.get(userId)

    if (!callData) {
      return res.status(404).json({ error: 'No active call found' })
    }

    if (location) callData.context.location = location
    if (situation) callData.context.situation = situation
    if (videoAnalysis) callData.context.videoAnalysis = videoAnalysis

    res.json({ success: true, context: callData.context })

  } catch (error) {
    console.error('Update context error:', error)
    res.status(500).json({ error: 'Failed to update context' })
  }
})

// Text-to-speech for AI responses (ElevenLabs)
router.post('/synthesize-speech', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY
    
    if (!elevenLabsKey) {
      return res.status(400).json({ error: 'ElevenLabs not configured' })
    }

    const voiceId = 'EXAVITQu4vr4xnSDxMaL' // Sarah voice - calm and clear

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75
        }
      })
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`)
    }

    const audioBuffer = await response.arrayBuffer()
    
    res.set('Content-Type', 'audio/mpeg')
    res.send(Buffer.from(audioBuffer))

  } catch (error) {
    console.error('Speech synthesis error:', error)
    res.status(500).json({ error: 'Failed to synthesize speech' })
  }
})

// Analyze video clip using TwelveLabs (accurate but takes 30-60 seconds)
router.post('/analyze-video-twelvelabs', authenticateToken, async (req, res) => {
  try {
    const { videoData } = req.body // base64 encoded video
    const userId = req.user.id
    const callData = activeEmergencyCalls.get(userId)

    if (!videoData) {
      return res.status(400).json({ error: 'No video data provided' })
    }

    // Notify that analysis is starting
    res.json({ 
      status: 'processing',
      message: 'Video analysis started. This may take 30-60 seconds...'
    })

    // Save video to temp file
    const uploadsDir = path.join(__dirname, '..', 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }
    
    const filename = `emergency_${userId}_${Date.now()}.webm`
    const filepath = path.join(uploadsDir, filename)
    
    // Decode base64 and save
    const videoBuffer = Buffer.from(videoData.replace(/^data:video\/\w+;base64,/, ''), 'base64')
    fs.writeFileSync(filepath, videoBuffer)
    
    console.log('Saved video for TwelveLabs analysis:', filepath)

    // Run TwelveLabs analysis
    const analysis = await quickAnalyzeVideo(filepath)
    
    if (analysis) {
      // Update call context if there's an active call
      if (callData) {
        const analysisText = analysis.analysis || analysis.summary || JSON.stringify(analysis.gist)
        callData.context.videoAnalysis = analysisText
        callData.context.lastVideoUpdate = new Date().toISOString()
        
        // Add to transcript
        callData.transcript.push({
          role: 'system',
          content: `[TwelveLabs Video Analysis] ${analysisText}`,
          timestamp: new Date().toISOString()
        })
      }

      // Clean up temp file
      try { fs.unlinkSync(filepath) } catch (e) {}
      
      return // Already sent response
    } else {
      console.error('TwelveLabs analysis returned null')
      return // Already sent response
    }

  } catch (error) {
    console.error('TwelveLabs video analysis error:', error)
    // Response already sent, just log
  }
})

// Get TwelveLabs analysis result (poll this after starting analysis)
router.get('/video-analysis-status', authenticateToken, (req, res) => {
  const userId = req.user.id
  const callData = activeEmergencyCalls.get(userId)
  
  if (!callData) {
    return res.json({ status: 'no_call', analysis: null })
  }
  
  res.json({
    status: callData.context.videoAnalysis ? 'ready' : 'pending',
    analysis: callData.context.videoAnalysis,
    lastUpdate: callData.context.lastVideoUpdate
  })
})

// Call safety contacts automatically
router.post('/call-safety-contacts', authenticateToken, async (req, res) => {
  try {
    const { reason, location, additionalInfo } = req.body
    const userId = req.user.id

    if (!reason) {
      return res.status(400).json({ error: 'Reason for call is required' })
    }

    // Get user info
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    
    // Get safety contacts (notify_on_stream = 1 or type = 'emergency')
    const contacts = db.prepare(
      "SELECT * FROM contacts WHERE user_id = ? AND (notify_on_stream = 1 OR type = 'emergency') AND phone IS NOT NULL"
    ).all(userId)

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No safety contacts found with phone numbers' })
    }

    // Get user's medical info
    const medicalInfo = db.prepare('SELECT * FROM medical_info WHERE user_id = ?').get(userId)

    // Get all contacts for context
    const allContacts = db.prepare('SELECT * FROM contacts WHERE user_id = ?').all(userId)

    // Build user data context
    const userData = {
      medical: medicalInfo || null,
      contacts: allContacts.map(c => ({ name: c.name, phone: c.phone, type: c.type }))
    }

    const twilioClient = getTwilioClient()
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER

    if (!twilioClient || !twilioNumber) {
      return res.status(503).json({ error: 'Twilio not configured. Cannot make calls.' })
    }

    const locationStr = location?.address || 
      (location?.lat ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Location unknown')

    // Build context info string for AI
    let contextInfo = `Calling about: ${user.name || 'the user'}. Reason: ${reason}. Location: ${locationStr}`
    
    if (medicalInfo) {
      if (medicalInfo.blood_type) contextInfo += `, Blood Type: ${medicalInfo.blood_type}`
      if (medicalInfo.allergies) contextInfo += `, Allergies: ${JSON.parse(medicalInfo.allergies || '[]').join(', ')}`
      if (medicalInfo.conditions) contextInfo += `, Conditions: ${JSON.parse(medicalInfo.conditions || '[]').join(', ')}`
      if (medicalInfo.medications) contextInfo += `, Medications: ${JSON.parse(medicalInfo.medications || '[]').join(', ')}`
    }

    if (additionalInfo) {
      contextInfo += `, Additional info: ${additionalInfo}`
    }

    const callResults = []
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`

    // Make calls to each safety contact
    for (const contact of contacts) {
      try {
        const callId = `safety_${Date.now()}_${userId}_${contact.id}`
        
        // Build message for this contact (using ElevenLabs TTS if available)
        const message = `Hello, this is an AI assistant calling on behalf of ${user.name || 'someone'}. 
${reason}. 
${user.name || 'The person'} is located at ${locationStr}.
${additionalInfo ? `Additional information: ${additionalInfo}` : ''}
I can answer any questions you have. How can I help?`

        const messageSpeech = await generateSpeechTwiML(message, callId)
        const gatherPrompt = "Please tell me your questions and I will try to help."
        const gatherSpeech = await generateSpeechTwiML(gatherPrompt, callId)
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${messageSpeech}
  <Gather input="speech" timeout="8" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="help, yes, no, where, what, when, how, location, okay" action="${serverUrl}/api/emergency/gather-safety/${callId}" method="POST">
    ${gatherSpeech}
  </Gather>
  <Redirect>${serverUrl}/api/emergency/gather-safety/${callId}?timeout=true</Redirect>
</Response>`

        const call = await twilioClient.calls.create({
          to: contact.phone,
          from: twilioNumber,
          twiml: twiml,
          statusCallback: `${serverUrl}/api/emergency/call-status-safety/${callId}`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        })

        // Store call context for AI responses
        activeSafetyContactCalls.set(callId, {
          callId,
          userId,
          contactId: contact.id,
          contactName: contact.name,
          context: {
            userName: user.name || 'Unknown',
            location: location || { address: 'Location unknown' },
            reason,
            additionalInfo: additionalInfo || '',
            userData,
            contextInfo,
            twilioCallSid: call.sid,
            startTime: new Date().toISOString()
          },
          transcript: []
        })

        callResults.push({
          contactId: contact.id,
          contactName: contact.name,
          phone: contact.phone,
          callSid: call.sid,
          status: 'initiated'
        })

        console.log(`Safety contact call initiated: ${contact.name} (${contact.phone}) - ${call.sid}`)
      } catch (err) {
        console.error(`Failed to call ${contact.name}:`, err.message)
        callResults.push({
          contactId: contact.id,
          contactName: contact.name,
          phone: contact.phone,
          status: 'failed',
          error: err.message
        })
      }
    }

    res.json({
      success: true,
      calls: callResults,
      message: `Initiated ${callResults.filter(c => c.status === 'initiated').length} call(s)`
    })

  } catch (error) {
    console.error('Safety contact call error:', error)
    res.status(500).json({ error: 'Failed to call safety contacts', details: error.message })
  }
})

// Handle speech input from safety contact call (similar to 911 gather)
router.post('/gather-safety/:callId', async (req, res) => {
  try {
    const { callId } = req.params
    const { SpeechResult, Confidence, Digits } = req.body
    const isTimeout = req.query.timeout === 'true'
    
    console.log(`Safety gather received for ${callId}:`, { SpeechResult, Confidence, Digits, isTimeout })

    const callData = activeSafetyContactCalls.get(callId)

    if (!callData) {
      const lostContextSpeech = await generateSpeechTwiML("I've lost the call context. Thank you for your time. Goodbye.", callId)
      res.type('text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${lostContextSpeech}
  <Hangup/>
</Response>`)
      return
    }

    const context = callData.context
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`

    // Handle timeout (using ElevenLabs TTS if available)
    if (isTimeout && !SpeechResult && !Digits) {
      const stillHereSpeech = await generateSpeechTwiML("I'm still here if you need anything.", callId)
      const goodbyeSpeech = await generateSpeechTwiML("Thank you for your time. Goodbye.", callId)
      res.type('text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="yes, no, location, help" action="${serverUrl}/api/emergency/gather-safety/${callId}" method="POST">
    ${stillHereSpeech}
  </Gather>
  ${goodbyeSpeech}
  <Hangup/>
</Response>`)
      return
    }

    const userInput = SpeechResult || (Digits ? `(pressed ${Digits})` : '(no speech detected)')

    // Add to transcript
    callData.transcript.push({
      role: 'contact',
      content: userInput,
      timestamp: new Date().toISOString()
    })

    // Generate AI response using context
    let aiResponse = "I understand. Thank you for the information."
    
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ 
        model: 'gemma-3-4b-it',
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.3,
        }
      })

      // Check if contact is ending the conversation
      const endingPhrases = ['thank you', 'got it', 'okay', 'ok', 'understood', 'will help', 'on my way', 'goodbye', 'bye']
      const isEnding = endingPhrases.some(phrase => userInput.toLowerCase().includes(phrase))
      
      let prompt
      if (isEnding) {
        prompt = `You are an AI assistant calling ${context.contactName} about ${context.userName}'s safety.
The contact said: "${userInput}"

This sounds like they are ending the conversation or confirming they understand.
Respond with a brief acknowledgment and end politely. One sentence only.

Example: "Thank you for your help. I'll keep you updated if needed."
You:`
      } else {
        prompt = `You are an AI assistant calling a safety contact about ${context.userName}.
CONTEXT: ${context.contextInfo}

This is ${context.contactName}, a safety contact for ${context.userName}.
The contact asks: "${userInput}"

Answer helpfully using the context. Be concise. One short sentence only.

You:`
      }

      const result = await model.generateContent(prompt)
      aiResponse = result.response.text().trim().split('\n')[0].substring(0, 200)
    } catch (e) {
      console.error('AI response generation failed:', e)
    }

    // Add AI response to transcript
    callData.transcript.push({
      role: 'ai',
      content: aiResponse,
      timestamp: new Date().toISOString()
    })

    // Send TwiML response using ElevenLabs TTS if available
    const aiResponseSpeech = await generateSpeechTwiML(aiResponse.replace(/[<>&'"]/g, ''), callId)
    res.type('text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${aiResponseSpeech}
  <Gather input="speech" timeout="8" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="yes, no, where, what, when, help" action="${serverUrl}/api/emergency/gather-safety/${callId}" method="POST"/>
  <Redirect>${serverUrl}/api/emergency/gather-safety/${callId}?timeout=true</Redirect>
</Response>`)

  } catch (error) {
    console.error('Safety gather handler error:', error)
    const goodbyeSpeech = await generateSpeechTwiML("Thank you for your time. Goodbye.", callId)
    res.type('text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${goodbyeSpeech}
  <Hangup/>
</Response>`)
  }
})

// Safety contact call status webhook
router.post('/call-status-safety/:callId', (req, res) => {
  const { callId } = req.params
  const { CallStatus, CallDuration } = req.body
  
  console.log(`Safety call ${callId} status: ${CallStatus}`)
  
  const callData = activeSafetyContactCalls.get(callId)
  if (callData) {
    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
      // Clean up after 5 minutes
      setTimeout(() => {
        activeSafetyContactCalls.delete(callId)
      }, 300000)
    }
  }
  
  res.status(200).send('OK')
})

export default router
export { activeEmergencyCalls, activeSafetyContactCalls }
