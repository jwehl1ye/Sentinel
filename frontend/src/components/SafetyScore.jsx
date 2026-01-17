import { useState, useEffect } from 'react'
import { Award, CheckCircle, Users, Heart, MapPin, Video, Shield, Zap } from 'lucide-react'
import './SafetyScore.css'

const achievements = [
    { id: 'contacts', label: 'Emergency Contacts', icon: Users, points: 20, check: (data) => data.contacts >= 2 },
    { id: 'medical', label: 'Medical Info', icon: Heart, points: 15, check: (data) => data.hasMedical },
    { id: 'location', label: 'Safe Locations', icon: MapPin, points: 15, check: (data) => data.safeLocations >= 1 },
    { id: 'practice', label: 'Practice Run', icon: Video, points: 20, check: (data) => data.practiceRuns >= 1 },
    { id: 'checkin', label: 'Check-In Used', icon: Shield, points: 15, check: (data) => data.checkIns >= 1 },
    { id: 'trip', label: 'Trip Completed', icon: Zap, points: 15, check: (data) => data.trips >= 1 }
]

export default function SafetyScore({ data = {} }) {
    const [score, setScore] = useState(0)
    const [completed, setCompleted] = useState([])

    useEffect(() => {
        calculateScore()
    }, [data])

    const calculateScore = () => {
        let totalScore = 0
        const completedList = []

        for (const achievement of achievements) {
            if (achievement.check(data)) {
                totalScore += achievement.points
                completedList.push(achievement.id)
            }
        }

        setScore(totalScore)
        setCompleted(completedList)
    }

    const getScoreColor = () => {
        if (score >= 80) return 'var(--safe-primary)'
        if (score >= 50) return 'var(--warning-primary)'
        return 'var(--danger-primary)'
    }

    const getScoreLabel = () => {
        if (score >= 80) return 'Excellent'
        if (score >= 50) return 'Good'
        if (score >= 25) return 'Fair'
        return 'Needs Work'
    }

    return (
        <div className="safety-score-card">
            <div className="score-header">
                <Award size={24} style={{ color: getScoreColor() }} />
                <span className="score-title">SAFETY SCORE</span>
            </div>

            <div className="score-ring-container">
                <svg className="score-ring" viewBox="0 0 100 100">
                    <circle
                        className="score-ring-bg"
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        strokeWidth="8"
                    />
                    <circle
                        className="score-ring-progress"
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        strokeWidth="8"
                        strokeDasharray={`${(score / 100) * 264} 264`}
                        style={{ stroke: getScoreColor() }}
                    />
                </svg>
                <div className="score-value">
                    <span className="score-number" style={{ color: getScoreColor() }}>{score}</span>
                    <span className="score-label">{getScoreLabel()}</span>
                </div>
            </div>

            <div className="achievements-list">
                {achievements.map(achievement => (
                    <div
                        key={achievement.id}
                        className={`achievement-item ${completed.includes(achievement.id) ? 'completed' : ''}`}
                    >
                        <div className="achievement-icon">
                            {completed.includes(achievement.id)
                                ? <CheckCircle size={18} />
                                : <achievement.icon size={18} />
                            }
                        </div>
                        <span className="achievement-label">{achievement.label}</span>
                        <span className="achievement-points">+{achievement.points}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
