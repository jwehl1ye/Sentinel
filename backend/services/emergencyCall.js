import Twilio from 'twilio'

// IMPORTANT: Test number only - NEVER use actual 911
const EMERGENCY_TEST_NUMBER = '+14372541201'

let twilioClient = null

const getTwilioClient = () => {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (accountSid && authToken) {
      twilioClient = new Twilio(accountSid, authToken)
    }
  }
  return twilioClient
}

export const initiateEmergencyCall = async ({ 
  location, 
  situation, 
  userId,
  callbackUrl 
}) => {
  const client = getTwilioClient()
  if (!client) {
    throw new Error('Twilio not configured')
  }

  const twilioNumber = process.env.TWILIO_PHONE_NUMBER
  if (!twilioNumber) {
    throw new Error('Twilio phone number not configured')
  }

  // Create TwiML for the call that connects to our AI
  const twiml = `
    <Response>
      <Connect>
        <Stream url="${callbackUrl}/emergency-stream/${userId}" />
      </Connect>
    </Response>
  `

  try {
    const call = await client.calls.create({
      to: EMERGENCY_TEST_NUMBER,
      from: twilioNumber,
      twiml: twiml,
      statusCallback: `${callbackUrl}/api/emergency/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    })

    console.log('Emergency call initiated:', call.sid)
    return {
      callSid: call.sid,
      status: call.status,
      to: EMERGENCY_TEST_NUMBER
    }
  } catch (error) {
    console.error('Failed to initiate emergency call:', error)
    throw error
  }
}

export const endEmergencyCall = async (callSid) => {
  const client = getTwilioClient()
  if (!client) {
    throw new Error('Twilio not configured')
  }

  try {
    const call = await client.calls(callSid).update({ status: 'completed' })
    return { status: call.status }
  } catch (error) {
    console.error('Failed to end call:', error)
    throw error
  }
}

export const isConfigured = () => {
  return !!(
    process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_PHONE_NUMBER
  )
}
