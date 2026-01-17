const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001/api'
  : `${window.location.origin}/api`

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
    }).then(handleResponse)
}

export default api

