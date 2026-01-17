import { AlertTriangle, CheckCircle } from 'lucide-react'
import './WellnessCheckModal.css'

export default function WellnessCheckModal({ onRespond }) {
    return (
        <div className="wellness-modal-overlay">
            <div className="wellness-modal">
                <div className="wellness-icon">
                    <AlertTriangle size={48} />
                </div>
                <h2>ARE YOU OKAY?</h2>
                <p>This is a safety check. If you don't respond within 60 seconds, your emergency contacts will be notified.</p>
                <button className="btn btn-safe wellness-btn" onClick={onRespond}>
                    <CheckCircle size={20} />
                    I'M SAFE
                </button>
                <p className="wellness-hint">Tap the button to confirm you're okay</p>
            </div>
        </div>
    )
}
