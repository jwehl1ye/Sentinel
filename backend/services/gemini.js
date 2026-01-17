import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI = null
let model = null

const getModel = () => {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      genAI = new GoogleGenerativeAI(apiKey)
      model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
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
