import { useState, useEffect } from 'react'
import { 
  Heart, Share2, Plus, X, AlertTriangle, User, Phone, Building2
} from 'lucide-react'
import api from '../services/api'
import './MedicalPage.css'

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const commonAllergies = ['Penicillin', 'Peanuts', 'Latex', 'Shellfish', 'Eggs', 'Dairy', 'Gluten', 'Bee Stings']
const commonConditions = ['Diabetes', 'Asthma', 'Heart Condition', 'Epilepsy', 'Hypertension', 'Anxiety', 'Depression']

export default function MedicalPage() {
  const [medical, setMedical] = useState({
    full_name: '',
    date_of_birth: '',
    blood_type: '',
    organ_donor: false,
    allergies: [],
    conditions: [],
    medications: [],
    ice_contacts: [],
    doctor_name: '',
    doctor_phone: '',
    hospital: '',
    additional_notes: ''
  })
  const [loading, setLoading] = useState(true)
  const [showAllergyModal, setShowAllergyModal] = useState(false)
  const [showConditionModal, setShowConditionModal] = useState(false)
  const [showMedicationModal, setShowMedicationModal] = useState(false)
  const [showIceModal, setShowIceModal] = useState(false)
  const [newMedication, setNewMedication] = useState({ name: '', dosage: '', frequency: '' })
  const [newIceContact, setNewIceContact] = useState({ name: '', relationship: '', phone: '' })

  useEffect(() => {
    loadMedical()
  }, [])

  const loadMedical = async () => {
    try {
      const res = await api.getMedicalInfo()
      if (res.medical) {
        setMedical(res.medical)
      }
    } catch (err) {
      console.error('Failed to load medical info:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateField = async (field, value) => {
    const updated = { ...medical, [field]: value }
    setMedical(updated)
    try {
      await api.updateMedicalInfo({ [field]: value })
    } catch (err) {
      console.error('Failed to update:', err)
    }
  }

  const addAllergy = async (allergy) => {
    if (medical.allergies.includes(allergy)) return
    const updated = [...medical.allergies, allergy]
    setMedical({ ...medical, allergies: updated })
    await api.updateMedicalInfo({ allergies: updated })
    setShowAllergyModal(false)
  }

  const removeAllergy = async (allergy) => {
    const updated = medical.allergies.filter(a => a !== allergy)
    setMedical({ ...medical, allergies: updated })
    await api.updateMedicalInfo({ allergies: updated })
  }

  const addCondition = async (condition) => {
    if (medical.conditions.includes(condition)) return
    const updated = [...medical.conditions, condition]
    setMedical({ ...medical, conditions: updated })
    await api.updateMedicalInfo({ conditions: updated })
    setShowConditionModal(false)
  }

  const removeCondition = async (condition) => {
    const updated = medical.conditions.filter(c => c !== condition)
    setMedical({ ...medical, conditions: updated })
    await api.updateMedicalInfo({ conditions: updated })
  }

  const addMedication = async () => {
    if (!newMedication.name) return
    const updated = [...medical.medications, newMedication]
    setMedical({ ...medical, medications: updated })
    await api.updateMedicalInfo({ medications: updated })
    setNewMedication({ name: '', dosage: '', frequency: '' })
    setShowMedicationModal(false)
  }

  const removeMedication = async (index) => {
    const updated = medical.medications.filter((_, i) => i !== index)
    setMedical({ ...medical, medications: updated })
    await api.updateMedicalInfo({ medications: updated })
  }

  const addIceContact = async () => {
    if (!newIceContact.name || !newIceContact.phone) return
    const updated = [...medical.ice_contacts, newIceContact]
    setMedical({ ...medical, ice_contacts: updated })
    await api.updateMedicalInfo({ ice_contacts: updated })
    setNewIceContact({ name: '', relationship: '', phone: '' })
    setShowIceModal(false)
  }

  const removeIceContact = async (index) => {
    const updated = medical.ice_contacts.filter((_, i) => i !== index)
    setMedical({ ...medical, ice_contacts: updated })
    await api.updateMedicalInfo({ ice_contacts: updated })
  }

  const shareMedicalInfo = () => {
    const text = `
MEDICAL INFORMATION
==================
Name: ${medical.full_name || 'N/A'}
DOB: ${medical.date_of_birth || 'N/A'}
Blood Type: ${medical.blood_type || 'N/A'}
Organ Donor: ${medical.organ_donor ? 'Yes' : 'No'}

ALLERGIES: ${medical.allergies.join(', ') || 'None'}

CONDITIONS: ${medical.conditions.join(', ') || 'None'}

MEDICATIONS:
${medical.medications.map(m => `- ${m.name} ${m.dosage} ${m.frequency}`).join('\n') || 'None'}

ICE CONTACTS:
${medical.ice_contacts.map(c => `- ${c.name} (${c.relationship}): ${c.phone}`).join('\n') || 'None'}

PRIMARY DOCTOR: ${medical.doctor_name || 'N/A'}
Doctor Phone: ${medical.doctor_phone || 'N/A'}
Hospital: ${medical.hospital || 'N/A'}

Notes: ${medical.additional_notes || 'None'}
    `.trim()

    if (navigator.share) {
      navigator.share({ text })
    } else {
      navigator.clipboard.writeText(text)
      alert('Medical info copied to clipboard!')
    }
  }

  const missingFields = []
  if (!medical.blood_type) missingFields.push('Blood Type')
  if (medical.allergies.length === 0) missingFields.push('Allergies')
  if (medical.ice_contacts.length === 0) missingFields.push('ICE Contacts')

  if (loading) {
    return (
      <div className="page flex-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div className="page medical-page">
      <div className="page-header">
        <Heart size={28} />
        <h1>MEDICAL INFO</h1>
        <button className="btn-ghost share-btn" onClick={shareMedicalInfo}>
          <Share2 size={20} />
        </button>
      </div>

      {missingFields.length > 0 && (
        <div className="info-banner warning mb-4">
          <AlertTriangle size={18} />
          <span>Missing critical info: {missingFields.join(', ')}</span>
        </div>
      )}

      <section className="medical-section">
        <h3 className="section-title">PERSONAL INFO</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="label">Full Name</label>
            <input
              type="text"
              className="input"
              value={medical.full_name}
              onChange={e => updateField('full_name', e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="form-group">
            <label className="label">Date of Birth</label>
            <input
              type="date"
              className="input"
              value={medical.date_of_birth}
              onChange={e => updateField('date_of_birth', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="label">Blood Type</label>
            <select
              className="input"
              value={medical.blood_type}
              onChange={e => updateField('blood_type', e.target.value)}
            >
              <option value="">Select...</option>
              {bloodTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Organ Donor</label>
            <button
              className={`toggle-btn ${medical.organ_donor ? 'active' : ''}`}
              onClick={() => updateField('organ_donor', !medical.organ_donor)}
            >
              {medical.organ_donor ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      </section>

      <section className="medical-section">
        <div className="section-header">
          <h3 className="section-title">ALLERGIES</h3>
          <button className="btn-ghost" onClick={() => setShowAllergyModal(true)}>
            <Plus size={18} />
          </button>
        </div>
        <div className="tags-list">
          {medical.allergies.map(allergy => (
            <span key={allergy} className="tag tag-danger">
              {allergy}
              <button onClick={() => removeAllergy(allergy)}><X size={14} /></button>
            </span>
          ))}
          {medical.allergies.length === 0 && (
            <span className="text-muted">No allergies added</span>
          )}
        </div>
      </section>

      <section className="medical-section">
        <div className="section-header">
          <h3 className="section-title">CONDITIONS</h3>
          <button className="btn-ghost" onClick={() => setShowConditionModal(true)}>
            <Plus size={18} />
          </button>
        </div>
        <div className="tags-list">
          {medical.conditions.map(condition => (
            <span key={condition} className="tag tag-warning">
              {condition}
              <button onClick={() => removeCondition(condition)}><X size={14} /></button>
            </span>
          ))}
          {medical.conditions.length === 0 && (
            <span className="text-muted">No conditions added</span>
          )}
        </div>
      </section>

      <section className="medical-section">
        <div className="section-header">
          <h3 className="section-title">MEDICATIONS</h3>
          <button className="btn-ghost" onClick={() => setShowMedicationModal(true)}>
            <Plus size={18} />
          </button>
        </div>
        <div className="medications-list">
          {medical.medications.map((med, i) => (
            <div key={i} className="medication-card">
              <div className="med-info">
                <span className="med-name">{med.name}</span>
                <span className="med-details">{med.dosage} • {med.frequency}</span>
              </div>
              <button className="btn-icon" onClick={() => removeMedication(i)}>
                <X size={18} />
              </button>
            </div>
          ))}
          {medical.medications.length === 0 && (
            <span className="text-muted">No medications added</span>
          )}
        </div>
      </section>

      <section className="medical-section">
        <div className="section-header">
          <h3 className="section-title">ICE CONTACTS</h3>
          <button className="btn-ghost" onClick={() => setShowIceModal(true)}>
            <Plus size={18} />
          </button>
        </div>
        <div className="ice-list">
          {medical.ice_contacts.map((contact, i) => (
            <div key={i} className="ice-card">
              <User size={20} />
              <div className="ice-info">
                <span className="ice-name">{contact.name}</span>
                <span className="ice-relation">{contact.relationship}</span>
                <a href={`tel:${contact.phone}`} className="ice-phone">{contact.phone}</a>
              </div>
              <button className="btn-icon" onClick={() => removeIceContact(i)}>
                <X size={18} />
              </button>
            </div>
          ))}
          {medical.ice_contacts.length === 0 && (
            <span className="text-muted">No ICE contacts added</span>
          )}
        </div>
      </section>

      <section className="medical-section">
        <h3 className="section-title">PRIMARY DOCTOR</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="label">Doctor Name</label>
            <input
              type="text"
              className="input"
              value={medical.doctor_name}
              onChange={e => updateField('doctor_name', e.target.value)}
              placeholder="Dr. Smith"
            />
          </div>
          <div className="form-group">
            <label className="label">Phone</label>
            <input
              type="tel"
              className="input"
              value={medical.doctor_phone}
              onChange={e => updateField('doctor_phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="form-group full-width">
            <label className="label">Hospital</label>
            <input
              type="text"
              className="input"
              value={medical.hospital}
              onChange={e => updateField('hospital', e.target.value)}
              placeholder="General Hospital"
            />
          </div>
        </div>
      </section>

      <section className="medical-section">
        <h3 className="section-title">ADDITIONAL NOTES</h3>
        <textarea
          className="input textarea"
          value={medical.additional_notes}
          onChange={e => updateField('additional_notes', e.target.value)}
          placeholder="Any additional medical information..."
          rows={4}
        />
      </section>

      {showAllergyModal && (
        <div className="modal-overlay" onClick={() => setShowAllergyModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">ADD ALLERGY</h2>
            <div className="quick-add-grid">
              {commonAllergies.filter(a => !medical.allergies.includes(a)).map(allergy => (
                <button key={allergy} className="quick-add-btn" onClick={() => addAllergy(allergy)}>
                  {allergy}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showConditionModal && (
        <div className="modal-overlay" onClick={() => setShowConditionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">ADD CONDITION</h2>
            <div className="quick-add-grid">
              {commonConditions.filter(c => !medical.conditions.includes(c)).map(condition => (
                <button key={condition} className="quick-add-btn" onClick={() => addCondition(condition)}>
                  {condition}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showMedicationModal && (
        <div className="modal-overlay" onClick={() => setShowMedicationModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">ADD MEDICATION</h2>
            <div className="form-group">
              <label className="label">Medication Name</label>
              <input
                type="text"
                className="input"
                value={newMedication.name}
                onChange={e => setNewMedication({ ...newMedication, name: e.target.value })}
                placeholder="Medication name"
              />
            </div>
            <div className="form-group">
              <label className="label">Dosage</label>
              <input
                type="text"
                className="input"
                value={newMedication.dosage}
                onChange={e => setNewMedication({ ...newMedication, dosage: e.target.value })}
                placeholder="e.g., 10mg"
              />
            </div>
            <div className="form-group">
              <label className="label">Frequency</label>
              <input
                type="text"
                className="input"
                value={newMedication.frequency}
                onChange={e => setNewMedication({ ...newMedication, frequency: e.target.value })}
                placeholder="e.g., Twice daily"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowMedicationModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={addMedication}>Add</button>
            </div>
          </div>
        </div>
      )}

      {showIceModal && (
        <div className="modal-overlay" onClick={() => setShowIceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">ADD ICE CONTACT</h2>
            <div className="form-group">
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                value={newIceContact.name}
                onChange={e => setNewIceContact({ ...newIceContact, name: e.target.value })}
                placeholder="Contact name"
              />
            </div>
            <div className="form-group">
              <label className="label">Relationship</label>
              <input
                type="text"
                className="input"
                value={newIceContact.relationship}
                onChange={e => setNewIceContact({ ...newIceContact, relationship: e.target.value })}
                placeholder="e.g., Spouse, Parent"
              />
            </div>
            <div className="form-group">
              <label className="label">Phone</label>
              <input
                type="tel"
                className="input"
                value={newIceContact.phone}
                onChange={e => setNewIceContact({ ...newIceContact, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowIceModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={addIceContact}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

