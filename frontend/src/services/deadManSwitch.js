// Dead Man's Switch Service
// Periodic wellness checks - auto-alerts contacts if user doesn't respond

class DeadManSwitch {
    constructor(options = {}) {
        this.checkInterval = options.checkInterval || 30 * 60 * 1000 // 30 minutes default
        this.responseWindow = options.responseWindow || 60 * 1000 // 60 seconds to respond
        this.onCheck = options.onCheck || (() => { })
        this.onMissed = options.onMissed || (() => { })
        this.onResponse = options.onResponse || (() => { })

        this.active = false
        this.checkTimer = null
        this.responseTimer = null
        this.awaitingResponse = false
        this.lastCheckTime = null
        this.pausedUntil = null

        // Sleep hours (default 11pm - 7am)
        this.sleepStart = options.sleepStart || 23
        this.sleepEnd = options.sleepEnd || 7
        this.pauseDuringSleep = options.pauseDuringSleep !== false
    }

    start() {
        if (this.active) return

        this.active = true
        this.scheduleNextCheck()
        console.log('Dead Man\'s Switch activated')
    }

    stop() {
        this.active = false
        this.awaitingResponse = false

        if (this.checkTimer) {
            clearTimeout(this.checkTimer)
            this.checkTimer = null
        }

        if (this.responseTimer) {
            clearTimeout(this.responseTimer)
            this.responseTimer = null
        }

        console.log('Dead Man\'s Switch deactivated')
    }

    scheduleNextCheck() {
        if (!this.active) return

        if (this.checkTimer) {
            clearTimeout(this.checkTimer)
        }

        // Calculate delay, accounting for sleep hours
        let delay = this.checkInterval

        if (this.pauseDuringSleep && this.isDuringSleepHours()) {
            // Calculate time until sleep ends
            const now = new Date()
            const wakeTime = new Date(now)
            wakeTime.setHours(this.sleepEnd, 0, 0, 0)

            if (wakeTime <= now) {
                wakeTime.setDate(wakeTime.getDate() + 1)
            }

            delay = wakeTime.getTime() - now.getTime()
            console.log('Dead Man\'s Switch paused during sleep hours')
        }

        this.checkTimer = setTimeout(() => {
            this.triggerCheck()
        }, delay)
    }

    isDuringSleepHours() {
        const hour = new Date().getHours()

        if (this.sleepStart > this.sleepEnd) {
            // Sleep crosses midnight (e.g., 23:00 - 07:00)
            return hour >= this.sleepStart || hour < this.sleepEnd
        } else {
            // Sleep doesn't cross midnight
            return hour >= this.sleepStart && hour < this.sleepEnd
        }
    }

    triggerCheck() {
        if (!this.active) return

        this.awaitingResponse = true
        this.lastCheckTime = Date.now()

        // Notify UI to show check prompt
        this.onCheck()

        // Start response timer
        this.responseTimer = setTimeout(() => {
            this.handleMissedResponse()
        }, this.responseWindow)

        // Vibrate to get attention
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200])
        }
    }

    respond() {
        if (!this.awaitingResponse) return

        this.awaitingResponse = false

        if (this.responseTimer) {
            clearTimeout(this.responseTimer)
            this.responseTimer = null
        }

        this.onResponse()
        this.scheduleNextCheck()

        console.log('Wellness check acknowledged')
    }

    handleMissedResponse() {
        this.awaitingResponse = false
        this.responseTimer = null

        console.log('Wellness check MISSED - triggering alert')
        this.onMissed()

        // Continue checking (user might come back)
        this.scheduleNextCheck()
    }

    pause(durationMs) {
        this.pausedUntil = Date.now() + durationMs

        if (this.checkTimer) {
            clearTimeout(this.checkTimer)
        }

        // Resume after pause
        this.checkTimer = setTimeout(() => {
            this.pausedUntil = null
            this.scheduleNextCheck()
        }, durationMs)
    }

    setInterval(intervalMs) {
        this.checkInterval = intervalMs

        if (this.active && !this.awaitingResponse) {
            this.scheduleNextCheck()
        }
    }

    setResponseWindow(windowMs) {
        this.responseWindow = windowMs
    }

    setSleepHours(start, end) {
        this.sleepStart = start
        this.sleepEnd = end
    }

    getStatus() {
        return {
            active: this.active,
            awaitingResponse: this.awaitingResponse,
            lastCheckTime: this.lastCheckTime,
            nextCheckTime: this.checkTimer ? Date.now() + this.checkInterval : null,
            pausedUntil: this.pausedUntil
        }
    }

    isActive() {
        return this.active
    }

    isAwaitingResponse() {
        return this.awaitingResponse
    }
}

// Singleton instance
let deadManSwitchInstance = null

export const getDeadManSwitch = (options) => {
    if (!deadManSwitchInstance) {
        deadManSwitchInstance = new DeadManSwitch(options)
    }
    return deadManSwitchInstance
}

export default DeadManSwitch
