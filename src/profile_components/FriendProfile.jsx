import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useGlobalStore } from '../lib/store'
import './ProfilePage.css'
import './FriendDiscoveryList.css'
import './FriendProfile.css'
import { ClubMembershipPanel } from './ClubMembershipPanel'
import { PolaroidCards } from './PolaroidCards'
import { useClubData } from '../context/useClubData'
import { cachedFetch, readCached, invalidatePrefix } from '../lib/queryCache'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { Skeleton, SkeletonCircle, SkeletonRegion } from '../components/Skeleton'
import Avatar from '../components/Avatar'

// Read-only counterpart to ProfilePage. Renders another user's profile and the
// friends both viewers have in common. There is intentionally no avatar upload,
// no biography editor, and no Setup button — the page is purely consumption.
export const FriendProfile = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const lastPath = useGlobalStore((state) => state.lastPath)
  const [viewerId, setViewerId] = useState(null)
  // Seeded from cache so returning to a friend you already viewed paints immediately
  // instead of showing the skeleton again.
  const [profile, setProfile] = useState(() => readCached(`user:${id}`))
  const [status, setStatus] = useState(() => (readCached(`user:${id}`) ? 'ready' : 'loading'))
  const [errorMessage, setErrorMessage] = useState(null)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState(null)
  const { refetch } = useClubData()
  // Falsy until the profile resolves, so the tab shows the default rather than
  // "Backyard | undefined" for a moment.
  useDocumentTitle(profile?.username ? `Backyard | ${profile.username}` : null)

  useEffect(() => {
    let cancelled = false
    
    async function load() {
      setStatus('loading')
      setErrorMessage(null)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return
      if (authError || !authData?.user) {
        navigate('/', { replace: true })
        return
      }

      const authUser = authData.user
      setViewerId(authUser.id)

      // Viewing /friend/<your-own-id> doesn't make sense — bounce to the
      // editable profile page instead.
      if (authUser.id === id) {
        navigate('/profile', { replace: true })
        return
      }

      try {
        const data = await cachedFetch(`user:${id}`, () => apiFetch(`/users/${id}/profile`))
        if (cancelled) return
        setProfile(data)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        console.error('Error fetching friend profile:', err)
        setErrorMessage(err?.status === 404 ? 'User not found.' : 'Could not load profile.')
        setStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  // Prefer the page the viewer was on before opening this profile; fall back
  // to their own profile so the close button is always meaningful.
  const handleClose = () => {
    const target = lastPath && lastPath !== window.location.pathname ? lastPath : '/profile'
    navigate(target)
  }

  // Blocking severs the friendship on both sides and hides each user from the other, so
  // it is confirmed rather than fired straight from the button.
  const handleBlock = async () => {
    setBlocking(true)
    setBlockError(null)

    try {
      await apiFetch('/me/blocks', { method: 'POST', body: { blockedId: id } })
      // Mutual invisibility changes what every profile returns, not just this one.
      invalidatePrefix('user:')
      // The provider caches friends and their club memberships; without this the blocked
      // user lingers in friend lists and "X is going" callouts until a reload.
      await refetch?.()
      navigate('/profile', { replace: true })
    } catch (err) {
      console.error('Error blocking user:', err)
      setBlockError(
        err?.status === 429 ? err.message : 'Could not block this user. Please try again.'
      )
      setBlocking(false)
    }
  }

  if (status === 'loading') {
    return (
      <SkeletonRegion className="ProfilePage" label="Loading profile">
        <div className="profile-header">
          <SkeletonCircle size={140} />
          <div className="profile-copy">
            <Skeleton width="220px" height="2.2rem" />
            <Skeleton width="65%" height="1rem" style={{ marginTop: 10 }} />
          </div>
        </div>
        <hr className="profile-divider" />
        <div className="profile-section">
          <Skeleton width="140px" height="1.4rem" />
        </div>
      </SkeletonRegion>
    )
  }

  if (status === 'error') {
    return (
      <div className="ProfilePage">
        <button
          className="profile-close-btn"
          onClick={handleClose}
          aria-label="Close profile"
        >
          ×
        </button>
        <p className="friend-profile-status">{errorMessage}</p>
      </div>
    )
  }

  const profileDescription = profile?.biography ?? ''

  return (
    <div className="ProfilePage">
      <div className="profile-header">
        <div className="friend-photo-wrap">
          <Avatar
            url={profile?.avatar_url}
            username={profile?.username}
            className="profile-image"
          />
        </div>
        <div className="profile-copy">
          <h1 className="ProfileName">{profile?.username}</h1>
          <p className="user-description">{profileDescription}</p>
        </div>
        <button
          className="profile-close-btn"
          onClick={handleClose}
          aria-label="Close profile"
        >
          ×
        </button>
      </div>
      <hr className="profile-divider" />

      <div className="profile-section friend-block-section">
        {confirmingBlock ? (
          <div className="friend-block-confirm" role="alertdialog" aria-label="Confirm block">
            <p className="friend-block-copy">
              Block {profile?.username || 'this user'}? You won&apos;t see each other&apos;s
              profiles, events or friends, and you&apos;ll be removed as friends.
            </p>
            <div className="friend-block-actions">
              <button
                type="button"
                className="friend-block-cancel"
                onClick={() => { setConfirmingBlock(false); setBlockError(null) }}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                type="button"
                className="friend-block-danger"
                onClick={handleBlock}
                disabled={blocking}
              >
                {blocking ? 'Blocking…' : `Block ${profile?.username || 'user'}`}
              </button>
            </div>
            {blockError && <p className="friend-block-error">{blockError}</p>}
          </div>
        ) : (
          <div className="duo-btn-wrap">
            <div className="duo-btn-pill" aria-hidden="true" />
            <button
              type="button"
              className="friend-block-trigger duo-btn"
              style={{ '--duo-shadow': 'rgb(110, 12, 8)' }}
              onClick={() => setConfirmingBlock(true)}
            >
              Block user
            </button>
          </div>
        )}
      </div>
      <hr className="profile-divider" />

      {/* A visitor can't act on "no clubs joined" or "no mutual friends" the way the
          profile's owner can, so each section only appears when there's actually
          something to show — unlike ProfilePage.jsx, which always shows all three
          with a friendly empty state. */}
      {profile?.photos?.length > 0 && (
        <div className="profile-section">
          <h2 className="profile-divider-header">Photos</h2>
          <PolaroidCards photos={profile.photos} />
        </div>
      )}

      {profile?.member_list?.length > 0 && (
        <div className="profile-section">
          <h2 className="profile-divider-header">Clubs Joined</h2>
          <ClubMembershipPanel memberList={profile.member_list} readOnly />
        </div>
      )}

      {profile?.mutual_friends?.length > 0 && (
        <div className="profile-section">
          <h2 className="profile-divider-header">Mutual Friends</h2>
          <MutualFriendsList friends={profile.mutual_friends} viewerId={viewerId} />
        </div>
      )}
    </div>
  )
}

// Only ever rendered by FriendProfile when friends.length > 0 — the empty case is
// handled by not rendering this section at all.
const MutualFriendsList = ({ friends, viewerId }) => {
  const navigate = useNavigate()

  return (
    <div className="friends-panel">
      <div className="friends-scroll">
        {friends.map((friend) => (
          <button
            type="button"
            className="friend-card friend-card-button"
            key={friend.id}
            onClick={() =>
              navigate(friend.id === viewerId ? '/profile' : `/friend/${friend.id}`)
            }
          >
            <Avatar
              className="friend-avatar"
              url={friend.avatar_url}
              username={friend.username}
            />
            <span className="friend-card-name">{friend.username}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default FriendProfile
