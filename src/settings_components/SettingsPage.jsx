import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ProfileSettings } from './ProfileSettings'
import { CalendarSettings } from './CalendarSettings'
import { NotificationSettings } from './NotificationSettings'
import { BlockedUsersSettings } from './BlockedUsersSettings'
import { AccountSettings } from './AccountSettings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { Skeleton, SkeletonRegion } from '../components/Skeleton'
import '../profile_components/ProfilePage.css'
import '../profile_components/ProfileSetupPage.css'
import './SettingsPage.css'

const TABS = [
    { label: 'Profile', Component: ProfileSettings },
    { label: 'Calendar', Component: CalendarSettings },
    { label: 'Notifications', Component: NotificationSettings },
    { label: 'Blocked Users', Component: BlockedUsersSettings },
    { label: 'Account', Component: AccountSettings },
]

// Settings. Each section owns its own fetch and save state so one failing section does
// not take the page down with it.
//
// Visual design is intentionally minimal here — structure and behaviour only.
export const SettingsPage = () => {
    const navigate = useNavigate()
    const [status, setStatus] = useState('loading')
    const [activeTab, setActiveTab] = useState(0)
    useDocumentTitle('Backyard | Settings')

    // Auth guard modelled on FriendProfile: a cancelled flag so a resolved promise cannot
    // set state after unmount, and a hard redirect rather than silently rendering nothing.
    useEffect(() => {
        let cancelled = false

        async function check() {
            const { data, error } = await supabase.auth.getUser()
            if (cancelled) return
            if (error || !data?.user) {
                navigate('/', { replace: true })
                return
            }
            setStatus('ready')
        }

        check()
        return () => { cancelled = true }
    }, [navigate])

    const handleClose = () => {
        navigate('/profile')
    }

    if (status === 'loading') {
        return (
            <div className="settings-overlay">
                <SkeletonRegion className="ProfilePage settings-page" label="Loading settings">
                    <div className="profile-header">
                        <div className="profile-copy">
                            <Skeleton width="180px" height="2.2rem" />
                        </div>
                    </div>
                    <div className="settings-divider" />
                    <div className="settings-tabs">
                        {TABS.map(({ label }) => (
                            <Skeleton key={label} width={`${label.length}ch`} height="1.3rem" />
                        ))}
                    </div>
                    <div className="settings-form">
                        <Skeleton height="2.4rem" radius={4} />
                        <Skeleton width="70%" height="2.4rem" radius={4} />
                    </div>
                </SkeletonRegion>
            </div>
        )
    }

    const ActiveComponent = TABS[activeTab].Component

    return (
        <div className="settings-overlay">
            <div className="ProfilePage settings-page">
                <div className="profile-header">
                    <div className="profile-copy">
                        <h1 className="settings-heading">Settings</h1>
                    </div>
                    <button
                        className="profile-close-btn"
                        onClick={handleClose}
                        aria-label="Close settings"
                    >
                        ×
                    </button>
                </div>
                <div className="settings-divider" />

                <div className="settings-tabs" role="tablist">
                    {TABS.map(({ label }, i) => (
                        <button
                            key={label}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === i}
                            className={`settings-tab${activeTab === i ? ' settings-tab--active' : ''}`}
                            onClick={() => setActiveTab(i)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="settings-content">
                    <ActiveComponent />
                </div>
            </div>
        </div>
    )
}

export default SettingsPage
