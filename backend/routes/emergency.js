import express from 'express'
import Twilio from 'twilio'
import { authenticateToken } from '../middleware/auth.js'
import db from '../database.js'

const router = express.Router()

// Store active emergency calls
const activeEmergencyCalls = new Map()

// IMPORTANT: Test number only - NEVER use actual 911
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
  const systemPrompt = `You are an AI emergency assistant making a 911 call on behalf of someone who cannot speak. They may be in danger, injured, or hiding.

CRITICAL EMERGENCY INFORMATION:
- Caller Name: ${emergencyContext.userName || 'Unknown'}
- Location: ${emergencyContext.location?.address || `GPS: ${emergencyContext.location?.lat?.toFixed(6)}, ${emergencyContext.location?.lng?.toFixed(6)}` || 'Unknown'}
- Emergency Situation: ${emergencyContext.situation || 'Emergency - caller cannot speak'}
${emergencyContext.videoAnalysis ? `- Scene Description: ${emergencyContext.videoAnalysis}` : ''}

YOUR ROLE:
- You are speaking to a 911 operator
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
    const { location, situation, videoAnalysis } = req.body
    const userId = req.user.id

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
        
        // Build the emergency message
        const locationStr = emergencyContext.location?.address || 
          (emergencyContext.location?.lat ? `GPS coordinates ${emergencyContext.location.lat.toFixed(4)}, ${emergencyContext.location.lng.toFixed(4)}` : 'unknown location')
        
        const emergencyMessage = `Hello, this is an AI emergency assistant calling on behalf of ${emergencyContext.userName || 'a person in distress'}. 
          This is a test call for demonstration purposes. 
          The caller is located at ${locationStr}. 
          ${emergencyContext.situation || 'They need emergency assistance and cannot speak.'}
          ${emergencyContext.videoAnalysis ? 'Based on video analysis: ' + emergencyContext.videoAnalysis : ''}
          I am an AI and can answer questions about this emergency. Please ask me anything.`
          .replace(/\s+/g, ' ').trim()

        // Use Twilio with speech recognition for two-way conversation
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${emergencyMessage}</Say>
  <Gather input="speech dtmf" timeout="15" speechTimeout="3" speechModel="phone_call" enhanced="true" action="${serverUrl}/api/emergency/gather/${callId}" method="POST">
    <Say voice="Polly.Joanna">Go ahead and speak, I'm listening.</Say>
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
      // Call not found, just end gracefully
      res.type('text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I apologize, but I've lost the call context. Please call back if you need assistance. Goodbye.</Say>
  <Hangup/>
</Response>`)
      return
    }

    const context = callData.context
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`

    // Handle timeout - just re-prompt
    if (isTimeout && !SpeechResult && !Digits) {
      res.type('text/xml')
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="15" speechTimeout="3" speechModel="phone_call" enhanced="true" action="${serverUrl}/api/emergency/gather/${callId}" method="POST">
    <Say voice="Polly.Joanna">I'm still here. Please speak your question or press any key.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Thank you. Goodbye.</Say>
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

      const conversationHistory = callData.transcript
        .map(t => `${t.role === 'operator' ? 'Operator' : 'AI'}: ${t.content}`)
        .join('\n')

      const prompt = `You are an AI emergency assistant on a 911 call. Answer briefly and helpfully.

EMERGENCY INFO:
- Caller: ${context.userName}
- Location: ${context.location?.address || 'Unknown'}
- Situation: ${context.situation}
${context.videoAnalysis ? `- Video shows: ${context.videoAnalysis}` : ''}

CONVERSATION:
${conversationHistory}

OPERATOR JUST SAID: "${userInput}"

Respond in 1-2 short sentences. Be helpful and concise:`

      const result = await model.generateContent(prompt)
      aiResponse = result.response.text().substring(0, 500) // Limit length for TTS
    } catch (e) {
      console.error('AI response generation failed:', e)
    }

    // Add AI response to transcript
    callData.transcript.push({
      role: 'ai',
      content: aiResponse,
      timestamp: new Date().toISOString()
    })

    // Send TwiML response with AI answer and continue gathering
    res.type('text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${aiResponse.replace(/[<>&'"]/g, '')}</Say>
  <Gather input="speech dtmf" timeout="15" speechTimeout="3" speechModel="phone_call" enhanced="true" action="${serverUrl}/api/emergency/gather/${callId}" method="POST">
    <Say voice="Polly.Joanna">Go ahead, I'm listening.</Say>
  </Gather>
  <Redirect>${serverUrl}/api/emergency/gather/${callId}?timeout=true</Redirect>
</Response>`)

  } catch (error) {
    console.error('Gather handler error:', error)
    res.type('text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I encountered an error. The emergency has been logged. Goodbye.</Say>
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
    
    // Use vision model if we have video frame
    const model = genAI.getGenerativeModel({ 
      model: videoFrame ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash-lite' 
    })

    // Build conversation history for context
    const conversationHistory = callData.transcript
      .filter(t => t.role !== 'system')
      .map(t => `${t.role === 'operator' ? '911 Operator' : 'AI Assistant'}: ${t.content}`)
      .join('\n')

    let prompt = `You are an AI emergency assistant on a 911 call, speaking on behalf of someone who cannot speak (they may be in danger, injured, or hiding).

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
- Keep responses brief (1-3 sentences max)
- This is a TEST CALL - if asked, confirm it's a test
- If you need more information, say you'll try to get it from the video feed

Respond as the AI assistant speaking to the 911 operator:`

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

    // Analyze the video frame with Gemini Vision
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    const imageData = videoFrame.replace(/^data:image\/\w+;base64,/, '')
    
    const result = await model.generateContent([
      {
        text: `Analyze this emergency scene image and describe:
1. What you see happening
2. Any threats, weapons, or dangerous situations
3. Any injuries or people in distress
4. Number of people visible
5. Any important details for emergency responders

Be concise and focus on safety-relevant information.`
      },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageData
        }
      }
    ])

    const analysis = result.response.text()
    
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

export default router
export { activeEmergencyCalls }
