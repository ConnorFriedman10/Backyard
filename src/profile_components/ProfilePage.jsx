import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useGlobalStore } from '../lib/store'
import './ProfilePage.css'
import { ClubMembershipPanel } from './ClubMembershipPanel'
import { FriendDiscoveryList } from './FriendDiscoveryList'
import { PolaroidCards } from './PolaroidCards'
import { InterestsModal } from './InterestsModal'
import Avatar from '../components/Avatar'
import { useClubData } from '../context/useClubData'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { Skeleton, SkeletonCircle, SkeletonRegion } from '../components/Skeleton'
import Logout from '../login_components/Logout'
import { NotificationBell } from '../notifications/NotificationBell'
import { DEFAULT_UNIVERSITY_PATH } from '../lib/university'

//this is the landing page for our university club search, most of the info will go through here

//at the moment, the user should have the ability to log out form the profile page.
//if the user logs out form this page, boot them from the page back to the home page.

export const ProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null)
  // Shared profile — this component used to fetch /me/profile itself, one of several
  // copies of the same request.
  const { profile, setProfile, loading } = useClubData()
  useDocumentTitle('Backyard | Profile')
  const [preview, setPreview] = useState(null)
  const [avatarError, setAvatarError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error fetching user:', error);
        return;
      }

      const authUser = data?.user;
      setUser(authUser);

      if (!authUser) return;

      // Profile itself comes from ClubDataProvider, which already loaded it — this
      // component only needs to know whether anyone is signed in.
    }

    loadUser();
  }, [navigate]);

  const [interestsOpen, setInterestsOpen] = useState(false);

  const lastPath = useGlobalStore((state) => state.lastPath);
  const setSupportOpen = useGlobalStore((state) => state.setSupportOpen);

  useEffect(() => {
    const handleBack = () => {
      // When users hit the browser back button on the profile page,
      // send them back to where they were right before logging in.
      if (lastPath && lastPath !== window.location.pathname) {
        navigate(lastPath, { replace: true });
      }
    };

    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [lastPath, navigate]);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validity = await new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ratio = img.naturalWidth / img.naturalHeight;
        resolve(ratio >= 0.25 && ratio <= 4.0 ? 'ok' : 'proportions');
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve('load'); };
      img.src = url;
    });

    if (validity === 'load') {
      setAvatarError('Image upload unsuccessful. Please try a different file.');
      return;
    }
    if (validity === 'proportions') {
      setAvatarError('Image has unusual proportions. Please use an aspect ratio between 1:4 and 4:1.');
      return;
    }

    setAvatarError('');
    setPreview(URL.createObjectURL(file));
    setAvatarUploading(true);

    try {
      const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
      const { signedUrl, publicUrl } = await apiFetch('/storage/profile-upload-url', {
        method: 'POST',
        body: { ext },
      });

      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

      // skipScan removed: the server now decides from the bucket, because a client-set
      // flag let any caller disable moderation for any bucket. Avatars still skip the
      // scan — that decision just isn't the browser's to make.
      const verification = await apiFetch('/storage/verify-image', {
        method: 'POST',
        body: { publicUrl },
      });
      if (!verification.ok) throw new Error(verification.error || 'Image rejected');

      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

      await apiFetch('/me/profile', {
        method: 'PUT',
        body: { avatar_url: cacheBustedUrl },
      });

      setProfile({ avatar_url: cacheBustedUrl });
    } catch (err) {
      console.error('Error uploading avatar:', err);
      setAvatarError(err.message || 'Upload failed. Please try again.');
      setPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  }

  const profileDescription = profile?.biography ?? ''

  if (loading) {
    return (
      <SkeletonRegion className="ProfilePage" label="Loading your profile">
        <div className='profile-header'>
          <SkeletonCircle size={140} />
          <div className="profile-copy">
            <Skeleton width="240px" height="2.2rem" />
            <Skeleton width="70%" height="1.1rem" style={{ marginTop: 10 }} />
          </div>
        </div>
        <hr className="profile-divider" />
        <div style={{ display: 'flex', gap: 10, padding: '12px 0 21px' }}>
          <Skeleton width="130px" height="2.1rem" radius={999} />
          <Skeleton width="100px" height="2.1rem" radius={999} />
        </div>
        <hr className="profile-divider" />
        <div className="profile-section">
          <Skeleton width="180px" height="1.4rem" />
        </div>
      </SkeletonRegion>
    )
  }

  return (
      <div className="ProfilePage">
        {interestsOpen && <InterestsModal onClose={() => setInterestsOpen(false)} />}
        <div className='profile-header'>
          <div className="avatar-upload-wrap">
            <label htmlFor="avatar-upload" className="profile-photo-btn">
              <Avatar
                url={preview || profile?.avatar_url}
                firstName={profile?.first_name}
                lastName={profile?.last_name}
                username={profile?.username}
                className="profile-image"
                alt="Your profile photo"
              />
            </label>
            <input type="file" accept="image/*" id="avatar-upload" hidden onChange={handleAvatarUpload} disabled={avatarUploading} />
            {avatarUploading && <p className="avatar-status">Saving…</p>}
            {avatarError && <p className="avatar-error">{avatarError}</p>}
          </div>
          <div className="profile-copy">
            <h1 className='ProfileName'>Hello, {profile?.username}</h1>
            <p className="user-description">{profileDescription}</p>
          </div>
          <button
            className="profile-close-btn"
            onClick={() => navigate(DEFAULT_UNIVERSITY_PATH)}
            aria-label="Close profile"
          >
            ×
          </button>
        </div>
        <hr className="profile-divider" />
        <div className="profile-btn-row">
          <div className="profile-btn-row-inner">
            <div className="duo-btn-wrap">
              <div className="duo-btn-pill" aria-hidden="true" />
              <button
                type="button"
                className="profile-setup-btn duo-btn profile-duo-btn--interests"
                style={{ '--duo-shadow': 'rgb(76, 102, 57)' }}
                onClick={() => setInterestsOpen(true)}
              >
                My Interests
              </button>
            </div>
            {user && (
              <div className="duo-btn-wrap">
                <div className="duo-btn-pill" aria-hidden="true" />
                <Logout className="duo-btn profile-duo-btn--logout" style={{ '--duo-shadow': 'rgb(122, 48, 47)' }} />
              </div>
            )}
            {user && (
              <div className="duo-btn-wrap">
                <div className="duo-btn-pill" aria-hidden="true" />
                <NotificationBell className="duo-btn profile-duo-btn--notif" style={{ '--duo-shadow': 'rgb(49, 90, 116)' }} />
              </div>
            )}
            <div className="duo-btn-wrap">
              <div className="duo-btn-pill" aria-hidden="true" />
              <button
                type="button"
                className="profile-setup-btn duo-btn profile-duo-btn--settings"
                style={{ '--duo-shadow': 'rgb(0, 0, 0)' }}
                onClick={() => navigate('/settings')}
              >
                Settings
              </button>
            </div>
            {user && (
              <div className="duo-btn-wrap">
                <div className="duo-btn-pill" aria-hidden="true" />
                <button
                  type="button"
                  className="profile-setup-btn duo-btn profile-duo-btn--support"
                  style={{ '--duo-shadow': 'rgb(184, 174, 150)' }}
                  onClick={() => setSupportOpen(true)}
                  aria-label="Open support"
                >
                  ?
                </button>
              </div>
            )}
          </div>
        </div>
        <hr className="profile-divider" />
        {user && (
          <>
            {/* Own profile always shows all three sections, even empty — a friend's
                profile (FriendProfile.jsx) is the one that hides empty sections
                entirely, since there's nothing actionable to show a visitor there. */}
            <div className="profile-section">
              <h2 className="divider-header">Your Photos</h2>
              {profile?.photos?.length > 0 ? (
                <PolaroidCards photos={profile.photos} />
              ) : (
                <p className="profile-empty-hint">You have no photos yet.</p>
              )}
            </div>
            <hr className="profile-divider" />

            <div className="profile-section">
              <h2 className="divider-header">Clubs You've Joined</h2>
              <ClubMembershipPanel userId={user.id} />
            </div>
            <hr className="profile-divider" />

            <div className="profile-section">
              <h2 className="divider-header">Friends</h2>
              <FriendDiscoveryList userId={user.id} />
            </div>
          </>
        )}
      </div>
    )
  }

export default ProfilePage
