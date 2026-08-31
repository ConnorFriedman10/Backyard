import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useClubData } from '../context/useClubData'
import { Skeleton, SkeletonRegion } from '../components/Skeleton'

export const AccountSettings = () => {
    const navigate = useNavigate()
    // Shared profile — this was the third component on the page requesting /me/profile.
    const { profile, loading } = useClubData()

    // Password
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [pwStatus, setPwStatus] = useState('idle') // idle | saving | done
    const [pwError, setPwError] = useState(null)

    // Deletion
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState(null)

    const changePassword = async (event) => {
        event.preventDefault()
        setPwError(null)

        // Matches the rules ResetPasswordPage already enforces.
        if (password.length < 6) {
            setPwError('Password must be at least 6 characters.')
            return
        }
        if (password !== confirmPassword) {
            setPwError('Passwords do not match.')
            return
        }

        setPwStatus('saving')
        const { error } = await supabase.auth.updateUser({ password })

        if (error) {
            setPwError(error.message)
            setPwStatus('idle')
            return
        }

        setPassword('')
        setConfirmPassword('')
        setPwStatus('done')
    }

    const deleteAccount = async () => {
        const confirmed = window.confirm(
            'Are you sure you want to delete your account? This cannot be undone.'
        )
        if (!confirmed) return

        setDeleting(true)
        setDeleteError(null)

        try {
            await apiFetch('/me/account', {
                method: 'DELETE',
                // The server re-verifies this matches the authenticated user's own
                // username — it's not a client-trusted value, just the shape that
                // endpoint expects. Filled in automatically now that there's no typed
                // confirmation field for the user to enter it into.
                body: { confirmUsername: profile?.username },
            })
            // The auth user is gone; clear the local session so the app does not keep
            // presenting a signed-in shell backed by a dead token.
            await supabase.auth.signOut()
            navigate('/', { replace: true })
        } catch (err) {
            console.error('Error deleting account:', err)
            setDeleteError(err?.message || 'Could not delete your account. Please try again.')
            setDeleting(false)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        navigate('/', { replace: true })
    }

    const mutedUntil = profile?.muted_until ? new Date(profile.muted_until) : null
    const isMuted = mutedUntil && mutedUntil > new Date()

    if (loading) {
        return (
            <SkeletonRegion className="settings-section" label="Loading account settings">
                <div className="settings-readonly">
                    <Skeleton width="60px" height="0.8rem" />
                    <Skeleton width="220px" height="1rem" />
                </div>
                <div className="settings-form">
                    <Skeleton width="140px" height="0.8rem" />
                    <Skeleton height="2.4rem" radius={4} />
                    <Skeleton height="2.4rem" radius={4} />
                </div>
                <div className="settings-actions">
                    <Skeleton width="150px" height="2.2rem" radius={999} />
                </div>
            </SkeletonRegion>
        )
    }

    return (
        <section className="settings-section">
            <div className="settings-readonly">
                <span className="setup-field-label">email</span>
                <span className="settings-readonly-value">{profile?.email || '—'}</span>
            </div>

            {/* Being muted is otherwise only visible as an opaque 403 on every write. */}
            {isMuted && (
                <p className="settings-warning">
                    Your account is muted until {mutedUntil.toLocaleString()}. You can browse,
                    but you can&apos;t post reviews, events or questions until then.
                </p>
            )}

            <form className="settings-form" onSubmit={changePassword}>
                <label className="setup-field-label" htmlFor="settings-new-password">
                    change password
                </label>
                <input
                    id="settings-new-password"
                    className="setup-school-input"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPwStatus('idle') }}
                    placeholder="New password"
                />
                <input
                    className="setup-school-input"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                />

                <div className="settings-actions">
                    <div className="duo-btn-wrap">
                        <div className="duo-btn-pill" aria-hidden="true" />
                        <button
                            type="submit"
                            className={`settings-save settings-save--sm duo-btn${pwStatus === 'done' ? ' settings-save--saved' : ''}`}
                            style={{ '--duo-shadow': pwStatus === 'done' ? 'rgb(30, 90, 42)' : 'rgb(20, 17, 13)' }}
                            disabled={pwStatus === 'saving' || !password}
                        >
                            {pwStatus === 'saving' ? 'Updating…' : pwStatus === 'done' ? 'Updated' : 'Update password'}
                        </button>
                    </div>
                </div>

                {pwError && <p className="settings-error">{pwError}</p>}
            </form>

            <div className="settings-actions settings-account-actions">
                <div className="duo-btn-wrap">
                    <div className="duo-btn-pill" aria-hidden="true" />
                    <button
                        type="button"
                        className="settings-secondary settings-logout-btn duo-btn"
                        style={{ '--duo-shadow': 'rgb(122, 48, 47)' }}
                        onClick={signOut}
                    >
                        Logout
                    </button>
                </div>
                <div className="duo-btn-wrap">
                    <div className="duo-btn-pill" aria-hidden="true" />
                    <button
                        type="button"
                        className="settings-danger-btn duo-btn"
                        style={{ '--duo-shadow': 'rgb(110, 12, 8)' }}
                        onClick={deleteAccount}
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting…' : 'Delete account'}
                    </button>
                </div>
            </div>
            {deleteError && <p className="settings-error">{deleteError}</p>}
        </section>
    )
}

export default AccountSettings
