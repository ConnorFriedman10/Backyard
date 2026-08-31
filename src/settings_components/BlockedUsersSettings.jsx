import React, { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useClubData } from '../context/useClubData'
import { cachedFetch, readCached, invalidateKey } from '../lib/queryCache'
import { Skeleton, SkeletonCircle, SkeletonRegion } from '../components/Skeleton'
import Avatar from '../components/Avatar'

// The management screen GET /api/me/blocks was built for. Until now that route and its
// DELETE counterpart had no frontend callers at all — blocking was one-way with no way
// to see or undo it.
export const BlockedUsersSettings = () => {
    const [blocked, setBlocked] = useState(() => readCached('me:blocks') ?? [])
    const [loading, setLoading] = useState(() => readCached('me:blocks') === null)
    const [unblockingId, setUnblockingId] = useState(null)
    const [error, setError] = useState(null)
    const { refetch } = useClubData()

    const load = useCallback(async () => {
        try {
            const data = await cachedFetch('me:blocks', () => apiFetch('/me/blocks'))
            setBlocked(data || [])
        } catch (err) {
            console.error('Error loading blocked users:', err)
            setError('Could not load your blocked users.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const unblock = async (user) => {
        setUnblockingId(user.id)
        setError(null)

        try {
            await apiFetch(`/me/blocks/${user.id}`, { method: 'DELETE' })
            invalidateKey('me:blocks')
            setBlocked((prev) => prev.filter((b) => b.id !== user.id))
            // They become visible again across the app, so drop the cached friend and
            // membership maps that were built while they were hidden.
            await refetch?.()
        } catch (err) {
            console.error('Error unblocking user:', err)
            setError(err?.status === 429 ? err.message : 'Could not unblock. Try again.')
        } finally {
            setUnblockingId(null)
        }
    }

    return (
        <section className="settings-section">
            {loading && (
                <SkeletonRegion label="Loading blocked users">
                    <ul className="settings-blocked-list">
                        {[0, 1].map((i) => (
                            <li key={i} className="settings-blocked-item">
                                <SkeletonCircle size={36} />
                                <Skeleton width="40%" height="1rem" />
                                <Skeleton width="92px" height="2.1rem" radius={999} />
                            </li>
                        ))}
                    </ul>
                </SkeletonRegion>
            )}

            {!loading && blocked.length === 0 && (
                <p className="settings-status">You haven&apos;t blocked anyone.</p>
            )}

            {blocked.length > 0 && (
                <>
                    <p className="settings-hint">
                        You and these people can&apos;t see each other&apos;s profiles, events or
                        friends. Unblocking restores that — it does not make you friends again.
                    </p>
                    <ul className="settings-blocked-list">
                        {blocked.map((user) => (
                            <li key={user.id} className="settings-blocked-item">
                                <Avatar
                                    className="settings-blocked-avatar"
                                    url={user.avatar_url}
                                    username={user.username}
                                />
                                <span className="settings-blocked-name">{user.username}</span>
                                <button
                                    type="button"
                                    className="settings-unblock"
                                    onClick={() => unblock(user)}
                                    disabled={unblockingId === user.id}
                                >
                                    {unblockingId === user.id ? 'Unblocking…' : 'Unblock'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {error && <p className="settings-error">{error}</p>}
        </section>
    )
}

export default BlockedUsersSettings
