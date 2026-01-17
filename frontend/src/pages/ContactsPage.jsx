import { useState, useEffect } from 'react'
import { 
  Users, Shield, AlertTriangle, User, UserPlus, Building2, 
  Phone, Plus, X, Trash2
} from 'lucide-react'
import api from '../services/api'
import './ContactsPage.css'

const contactTypes = [
  { id: 'personal', label: 'Personal', icon: User, color: 'default' },
  { id: 'emergency', label: 'Emergency', icon: AlertTriangle, color: 'warning' },
  { id: 'police', label: 'Police', icon: Shield, color: 'info' }
]

const quickAddOptions = [
  { type: 'police', label: 'Add Police Contact', icon: Shield, color: 'info' },
  { type: 'emergency', label: 'Add Emergency Service', icon: Building2, color: 'warning' },
  { type: 'personal', label: 'Add Family/Friend', icon: UserPlus, color: 'default' }
]

export default function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedType, setSelectedType] = useState('personal')
  const [newContact, setNewContact] = useState({ name: '', phone: '' })

  useEffect(() => {
    loadContacts()
  }, [])

  const loadContacts = async () => {
    try {
      const res = await api.getContacts()
      setContacts(res.contacts || [])
    } catch (err) {
      console.error('Failed to load contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  const addContact = async () => {
    if (!newContact.name || !newContact.phone) return
    
    try {
      await api.addContact({
        name: newContact.name,
        phone: newContact.phone,
        type: selectedType
      })
      loadContacts()
      setShowAddModal(false)
      setNewContact({ name: '', phone: '' })
    } catch (err) {
      console.error('Failed to add contact:', err)
    }
  }

  const deleteContact = async (id) => {
    try {
      await api.deleteContact(id)
      loadContacts()
    } catch (err) {
      console.error('Failed to delete contact:', err)
    }
  }

  const openAddModal = (type) => {
    setSelectedType(type)
    setShowAddModal(true)
  }

  const getContactIcon = (type) => {
    const found = contactTypes.find(t => t.id === type)
    return found ? found.icon : User
  }

  const getContactColor = (type) => {
    const found = contactTypes.find(t => t.id === type)
    return found ? found.color : 'default'
  }

  if (loading) {
    return (
      <div className="page flex-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div className="page contacts-page">
      <div className="page-header">
        <Users size={28} />
        <h1>EMERGENCY CONTACTS</h1>
      </div>

      <div className="info-banner info mb-4">
        <AlertTriangle size={18} />
        <span>These contacts will be automatically notified when you start an emergency stream.</span>
      </div>

      <div className="contacts-list">
        {contacts.map(contact => {
          const Icon = getContactIcon(contact.type)
          const color = getContactColor(contact.type)
          
          return (
            <div key={contact.id} className="contact-card">
              <div className={`contact-icon ${color}`}>
                <Icon size={20} />
              </div>
              <div className="contact-info">
                <span className="contact-name">{contact.name}</span>
                <a href={`tel:${contact.phone}`} className="contact-phone">
                  <Phone size={14} />
                  {contact.phone}
                </a>
              </div>
              <span className={`badge badge-${color === 'default' ? 'info' : color}`}>
                {contact.type}
              </span>
              {!contact.is_default && (
                <button 
                  className="btn-icon delete-btn"
                  onClick={() => deleteContact(contact.id)}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <h3 className="section-title mt-6">QUICK ADD</h3>
      <div className="quick-add-grid">
        {quickAddOptions.map(option => (
          <button
            key={option.type}
            className={`quick-add-card ${option.color}`}
            onClick={() => openAddModal(option.type)}
          >
            <option.icon size={24} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">ADD CONTACT</h2>
            
            <div className="form-group">
              <label className="label">Type</label>
              <div className="type-buttons">
                {contactTypes.map(type => (
                  <button
                    key={type.id}
                    className={`type-btn ${selectedType === type.id ? 'active' : ''} ${type.color}`}
                    onClick={() => setSelectedType(type.id)}
                  >
                    <type.icon size={16} />
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                value={newContact.name}
                onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Contact name"
              />
            </div>

            <div className="form-group">
              <label className="label">Phone Number</label>
              <input
                type="tel"
                className="input"
                value={newContact.phone}
                onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={addContact}>
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

