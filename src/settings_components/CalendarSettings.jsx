import React, { useState } from 'react'
import { apiFetch } from '../lib/api'
import { useClubData } from '../context/useClubData'
import { Skeleton, SkeletonRegion } from '../components/Skeleton'

// Which format the single "Add to calendar" button uses.
//
// 'ics' is the default because a downloaded .ics imports into Apple Calendar, Outlook,
// Fantastical and Google alike, so an unset preference still works everywhere. The old UI
// labelled it "Apple Cal", which was a mislabel — the format is not Apple-specific.
const OPTIONS = [
    { value: 'ics', label: 'Apple Calendar, Outlook & others' },
    { value: 'google', label: 'Google Calendar' },
]

export const CalendarSettings = () => {
    // Read from the shared profile rather than fetching again. This section, ProfileSettings
    // and AccountSettings each used to request /me/profile on mount, so opening Settings
    // fired the same call three times.
    const { profile, loading, setProfile } = useClubData()

    const [preference, setPreference] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    // Local copy so a click reflects instantly; falls back to the shared value until touched.
    const current = preference ?? profile?.calendar_preference ?? 'ics'

    const choose = async (value) => {
        if (value === current) return

        const previous = current
        setPreference(value) // optimistic — this is a single radio, reverting is cheap
        setSaving(true)
        setError(null)

        try {
            await apiFetch('/me/profile', {
                method: 'PUT',
                body: { calendar_preference: value },
            })
            setProfile({ calendar_preference: value })
        } catch (err) {
            console.error('Error saving calendar preference:', err)
            setPreference(previous)
            setError(err?.status === 429 ? err.message : 'Could not save that. Try again.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <SkeletonRegion className="settings-section" label="Loading calendar settings">
                <Skeleton width="60%" height="0.9rem" />
                <div className="settings-radio-group">
                    <Skeleton width="240px" height="1.1rem" />
                    <Skeleton width="200px" height="1.1rem" />
                </div>
            </SkeletonRegion>
        )
    }

    return (
        <section className="settings-section">
            <p className="settings-radio-question">
                What kind of calendar do you use?
            </p>

            <div className="settings-radio-group" role="radiogroup" aria-label="Calendar format">
                {OPTIONS.map((option) => (
                    <label key={option.value} className="settings-radio">
                        <input
                            type="radio"
                            name="calendar_preference"
                            value={option.value}
                            checked={current === option.value}
                            onChange={() => choose(option.value)}
                            disabled={saving}
                        />
                        <span className="settings-radio-label">{option.label}</span>
                    </label>
                ))}
            </div>

            {error && <p className="settings-error">{error}</p>}
        </section>
    )
}

export default CalendarSettings
