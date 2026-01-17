const API_URL = (() => {
  const hostname = window.location.hostname
  const port = window.location.port
  
  // If on localhost or development (port 5173), use port 3001 for backend
  if (hostname === 'localhost' || hostname === '127.0.0.1' || port === '5173') {
    return `http://${hostname}:3001/api`
  }
  
  // Otherwise, use same origin (for production)
  return `${window.location.origin}/api`
})()

const getHeaders = () => {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  }
}

const handleResponse = async (response) => {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

const api = {
  register: (email, password, name, phone) =>
    fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password, name, phone })
    }).then(handleResponse),

  login: (email, password) =>
    fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password })
    }).then(handleResponse),

  getMe: () =>
    fetch(`${API_URL}/auth/me`, {
      headers: getHeaders()
    }).then(handleResponse),

  updateSettings: (settings) =>
    fetch(`${API_URL}/auth/settings`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(settings)
    }).then(handleResponse),

  getContacts: () =>
    fetch(`${API_URL}/contacts`, {
      headers: getHeaders()
    }).then(handleResponse),

  getEmergencyContacts: () =>
    fetch(`${API_URL}/contacts/emergency`, {
      headers: getHeaders()
    }).then(handleResponse),

  addContact: (contact) =>
    fetch(`${API_URL}/contacts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(contact)
    }).then(handleResponse),

  updateContact: (id, contact) =>
    fetch(`${API_URL}/contacts/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(contact)
    }).then(handleResponse),

  deleteContact: (id) =>
    fetch(`${API_URL}/contacts/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  getRecordings: () =>
    fetch(`${API_URL}/recordings`, {
      headers: getHeaders()
    }).then(handleResponse),

  getRecording: (id) =>
    fetch(`${API_URL}/recordings/${id}`, {
      headers: getHeaders()
    }).then(handleResponse),

  getRecordingAnalysis: (id) =>
    fetch(`${API_URL}/recordings/${id}/analysis`, {
      headers: getHeaders()
    }).then(handleResponse),

  getRecordingAnalysisSummary: (id) =>
    fetch(`${API_URL}/recordings/${id}/analysis/summary`, {
      headers: getHeaders()
    }).then(handleResponse),

  chatAboutRecording: (id, question, history = []) =>
    fetch(`${API_URL}/recordings/${id}/analysis/chat`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ question, history })
    }).then(handleResponse),

  // Emergency Call APIs
  initiateEmergencyCall: (data) =>
    fetch(`${API_URL}/emergency/call`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse),

  getEmergencyCallStatus: (callId) =>
    fetch(`${API_URL}/emergency/status/${callId}`, {
      headers: getHeaders()
    }).then(handleResponse),

  endEmergencyCall: () =>
    fetch(`${API_URL}/emergency/end`, {
      method: 'POST',
      headers: getHeaders()
    }).then(handleResponse),

  forceResetEmergencyCall: () =>
    fetch(`${API_URL}/emergency/force-reset`, {
      method: 'POST',
      headers: getHeaders()
    }).then(handleResponse),

  getEmergencyAIResponse: (operatorMessage, callId, videoFrame = null) =>
    fetch(`${API_URL}/emergency/ai-response`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ operatorMessage, callId, videoFrame })
    }).then(handleResponse),

  updateEmergencyContext: (data) =>
    fetch(`${API_URL}/emergency/update-context`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse),

  updateEmergencyVideo: (data) =>
    fetch(`${API_URL}/emergency/update-video`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse),

  analyzeEmergencySituation: (data) =>
    fetch(`${API_URL}/emergency/analyze-situation`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse),

  getEmergencyConfigStatus: () =>
    fetch(`${API_URL}/emergency/config-status`, {
      headers: getHeaders()
    }).then(handleResponse),

  uploadRecording: async (videoBlob, metadata) => {
    const token = localStorage.getItem('token')
    const formData = new FormData()
    formData.append('video', videoBlob, 'recording.webm')
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value)
      }
    })
    
    const response = await fetch(`${API_URL}/recordings/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    })
    return handleResponse(response)
  },

  shareRecording: (id, contactIds) =>
    fetch(`${API_URL}/recordings/${id}/share`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ contact_ids: contactIds })
    }).then(handleResponse),

  deleteRecording: (id) =>
    fetch(`${API_URL}/recordings/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  startStream: () =>
    fetch(`${API_URL}/stream/start`, {
      method: 'POST',
      headers: getHeaders()
    }).then(handleResponse),

  endStream: (id, cancelled = false) =>
    fetch(`${API_URL}/stream/${id}/end`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ cancelled })
    }).then(handleResponse),

  getStream: (id) =>
    fetch(`${API_URL}/stream/${id}`, {
      headers: getHeaders()
    }).then(handleResponse),

  getActiveStream: () =>
    fetch(`${API_URL}/stream/active/current`, {
      headers: getHeaders()
    }).then(handleResponse),

  getStreamHistory: () =>
    fetch(`${API_URL}/stream`, {
      headers: getHeaders()
    }).then(handleResponse),

  getSafeLocations: () =>
    fetch(`${API_URL}/location/safe-locations`, {
      headers: getHeaders()
    }).then(handleResponse),

  addSafeLocation: (location) =>
    fetch(`${API_URL}/location/safe-locations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(location)
    }).then(handleResponse),

  deleteSafeLocation: (id) =>
    fetch(`${API_URL}/location/safe-locations/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  getAlerts: () =>
    fetch(`${API_URL}/location/alerts`, {
      headers: getHeaders()
    }).then(handleResponse),

  createAlert: (alert) =>
    fetch(`${API_URL}/location/alerts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(alert)
    }).then(handleResponse),

  updateAlert: (id, alert) =>
    fetch(`${API_URL}/location/alerts/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(alert)
    }).then(handleResponse),

  deleteAlert: (id) =>
    fetch(`${API_URL}/location/alerts/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  getMovementHistory: (days = 7) =>
    fetch(`${API_URL}/location/movement?days=${days}`, {
      headers: getHeaders()
    }).then(handleResponse),

  getLocationShares: () =>
    fetch(`${API_URL}/location/share`, {
      headers: getHeaders()
    }).then(handleResponse),

  createLocationShare: (durationHours, sharedWith) =>
    fetch(`${API_URL}/location/share`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ duration_hours: durationHours, shared_with: sharedWith })
    }).then(handleResponse),

  stopLocationShare: (id) =>
    fetch(`${API_URL}/location/share/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  viewSharedLocation: (code) =>
    fetch(`${API_URL}/location/view/${code}`).then(handleResponse),

  getMedicalInfo: () =>
    fetch(`${API_URL}/medical`, {
      headers: getHeaders()
    }).then(handleResponse),

  updateMedicalInfo: (info) =>
    fetch(`${API_URL}/medical`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(info)
    }).then(handleResponse),

  // Incidents API
  getNearbyIncidents: (latitude, longitude, radius = 5) =>
    fetch(`${API_URL}/incidents/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`, {
      headers: getHeaders()
    }).then(handleResponse),

  getIncidents: (page = 1, limit = 50, status = 'active') =>
    fetch(`${API_URL}/incidents?page=${page}&limit=${limit}&status=${status}`, {
      headers: getHeaders()
    }).then(handleResponse),

  reportIncident: (incident) =>
    fetch(`${API_URL}/incidents`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(incident)
    }).then(handleResponse),

  updateIncident: (id, data) =>
    fetch(`${API_URL}/incidents/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse),

  getSafetyScore: (latitude, longitude) =>
    fetch(`${API_URL}/incidents/safety-score?latitude=${latitude}&longitude=${longitude}`, {
      headers: getHeaders()
    }).then(handleResponse),

  getHistoricalData: (latitude, longitude, radius = 1) =>
    fetch(`${API_URL}/incidents/historical?latitude=${latitude}&longitude=${longitude}&radius=${radius}`, {
      headers: getHeaders()
    }).then(handleResponse),

  getIncidentTypes: () =>
    fetch(`${API_URL}/incidents/types`, {
      headers: getHeaders()
    }).then(handleResponse)
}

export default api

