import React, { useState } from 'react'
import { useProfileForm } from '../profile_components/useProfileForm'
import { ProfileFields } from '../profile_components/ProfileFields'
import { Skeleton, SkeletonCircle, SkeletonRegion } from '../components/Skeleton'

// Edit your profile without going through onboarding. Same fields, same uploads, same
// moderation — useProfileForm carries all of it.
export const ProfileSettings = () => {
    const form = useProfileForm()
    const [saved, setSaved] = useState(false)

    const handleSubmit = async (event) => {
        event.preventDefault()
        setSaved(false)
        // No `school` here: changing it after joining clubs would strand those
        // memberships against the "members can only join clubs at their own school" RLS
        // policy. Shown read-only below.
        const ok = await form.save()
        if (ok) setSaved(true)
    }

    if (form.loading) {
        return (
            <SkeletonRegion className="settings-section" label="Loading profile">
                <div className="settings-form">
                    <Skeleton width="60px" height="0.8rem" />
                    <Skeleton height="2.4rem" radius={4} />
                    <Skeleton width="90px" height="0.8rem" />
                    <Skeleton height="2.4rem" radius={4} />
                    <SkeletonCircle size={96} />
                    <Skeleton width="120px" height="0.8rem" />
                    <Skeleton height="6rem" radius={4} />
                    <div className="settings-actions">
                        <Skeleton width="130px" height="2.2rem" radius={999} />
                    </div>
                </div>
            </SkeletonRegion>
        )
    }

    return (
        <section className="settings-section">
            <form onSubmit={handleSubmit} className="settings-form">
                <ProfileFields form={form} idPrefix="settings" />

                <label className="setup-field-label">school</label>
                <div className="setup-school-wrap">
                    <input
                        className="setup-school-input"
                        value={form.school || 'Northeastern'}
                        disabled
                    />
                </div>
                <p className="settings-hint">
                    Contact support to change your school — it affects which clubs you can join.
                </p>

                <div className="settings-actions">
                    <div className="duo-btn-wrap">
                        <div className="duo-btn-pill" aria-hidden="true" />
                        <button
                            type="submit"
                            className={`settings-save duo-btn${saved ? ' settings-save--saved' : ''}`}
                            style={{ '--duo-shadow': saved ? 'rgb(30, 90, 42)' : 'rgb(20, 17, 13)' }}
                            disabled={form.submitting}
                        >
                            {form.submitting ? 'Saving…' : saved ? 'Saved' : 'Save profile'}
                        </button>
                    </div>
                </div>

                {form.error && <p className="settings-error">{form.error}</p>}
            </form>
        </section>
    )
}

export default ProfileSettings
