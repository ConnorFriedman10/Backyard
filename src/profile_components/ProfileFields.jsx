import React, { useState } from 'react';
import { MAX_PHOTOS } from './useProfileForm';
import Avatar from '../components/Avatar';
import ImageScaleCropModal from '../review_components/ImageScaleCropModal';

// Fetches any image URL (a remote photo URL or a local blob: preview URL — fetch()
// handles both the same way) as a File, so the crop modal always has something to work
// with regardless of whether the image has been uploaded yet.
async function fetchAsFile(url, filename) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

// The profile field group, shared by onboarding (ProfileSetupPage) and the settings page.
// Presentational only — all state and the save logic live in useProfileForm. The one
// exception is the scale/crop modal below: it's transient UI state (is a modal open,
// which image is it working on), not form data, so it lives here rather than in the hook.
//
// Keeps the existing `setup-*` class names rather than inventing a parallel set, so there
// is one place to restyle these fields.
export const ProfileFields = ({ form, idPrefix = 'profile' }) => {
    const {
        firstName, setFirstName,
        lastName, setLastName,
        username, setUsername, usernameStatus,
        biography, setBiography,
        avatarPreview, handleAvatarChange, replaceAvatarFile,
        existingPhotos, photoPreviews,
        handlePhotoChange, removeExistingPhoto, removeNewPhoto, replacePhoto,
        totalPhotos,
    } = form;

    // Both pages can render at once during a route transition, so ids must not collide.
    const id = (name) => `${idPrefix}-${name}`;

    // Settings shows a dense list of fields, so the avatar reads better as a small header
    // above the name (its own row, not competing with a full-screen onboarding hero).
    // Extracted once and placed conditionally so onboarding's layout is untouched.
    const isSettings = idPrefix === 'settings';

    // { kind: 'avatar' } | { kind: 'photo', index } | null. `busyKey` tracks which scale
    // button is mid-fetch so only that one shows a loading state.
    const [cropTarget, setCropTarget] = useState(null);
    const [busyKey, setBusyKey] = useState(null);

    const openAvatarScale = async () => {
        if (!avatarPreview) return;
        setBusyKey('avatar');
        try {
            const file = await fetchAsFile(avatarPreview, 'avatar.jpg');
            setCropTarget({ kind: 'avatar', file });
        } catch {
            // Best-effort — the button just stops loading and nothing opens.
        } finally {
            setBusyKey(null);
        }
    };

    const allPhotoUrls = [...existingPhotos, ...photoPreviews];

    const openPhotoScale = async (index) => {
        const url = allPhotoUrls[index];
        if (!url) return;
        setBusyKey(`photo-${index}`);
        try {
            const file = await fetchAsFile(url, `photo-${index}.jpg`);
            setCropTarget({ kind: 'photo', index, file });
        } catch {
            // Best-effort — same as above.
        } finally {
            setBusyKey(null);
        }
    };

    const handleCropConfirm = (file) => {
        if (cropTarget?.kind === 'avatar') replaceAvatarFile(file);
        if (cropTarget?.kind === 'photo') replacePhoto(cropTarget.index, file);
        setCropTarget(null);
    };

    const avatarBlock = (
        <React.Fragment key="avatar">
            {isSettings && <p className="setup-field-label">Profile picture</p>}
            <label htmlFor={id('avatar')} className="setup-avatar-label">
                <Avatar
                    url={avatarPreview}
                    firstName={form.firstName}
                    lastName={form.lastName}
                    username={form.username}
                    className={`setup-avatar${isSettings ? ' settings-avatar' : ''}`}
                    alt="Upload profile photo"
                />
                {isSettings && <span className="settings-avatar-overlay">Change</span>}
            </label>
            <input
                id={id('avatar')}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarChange}
            />
            {isSettings ? (
                <div className="settings-avatar-scale-row">
                    <button
                        type="button"
                        className="cal-image-scale-btn"
                        onClick={openAvatarScale}
                        disabled={busyKey === 'avatar'}
                    >
                        {busyKey === 'avatar' ? 'Loading…' : 'Scale'}
                    </button>
                </div>
            ) : (
                <p className="setup-hint">upload profile pic</p>
            )}
        </React.Fragment>
    );

    // `localIndex` is what removeExistingPhoto/removeNewPhoto expect (an index into
    // whichever of the two source arrays this item came from). `combinedIndex` is what
    // openPhotoScale/replacePhoto expect (existingPhotos then photoPreviews, one flat
    // order) — the two only diverge for "new" items, which sit after every existing one.
    const photoItem = (url, localIndex, kind) => {
        const combinedIndex = kind === 'existing' ? localIndex : existingPhotos.length + localIndex;
        const remove = () => (kind === 'existing' ? removeExistingPhoto(localIndex) : removeNewPhoto(localIndex));

        return (
            <div key={`${kind}-${localIndex}`} className={isSettings ? 'setup-photo-cell' : undefined}>
                {isSettings && (
                    <div className="cal-image-toolbar setup-photo-toolbar">
                        <button
                            type="button"
                            className="cal-image-scale-btn"
                            onClick={() => openPhotoScale(combinedIndex)}
                            disabled={busyKey === `photo-${combinedIndex}`}
                        >
                            {busyKey === `photo-${combinedIndex}` ? '…' : 'Scale'}
                        </button>
                    </div>
                )}
                <div className="setup-photo-item">
                    <img src={url} alt={`Photo ${combinedIndex + 1}`} />
                    {isSettings ? (
                        <button
                            type="button"
                            className="settings-photo-remove"
                            onClick={remove}
                            aria-label="Remove photo"
                        >
                            X
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="setup-photo-remove"
                            onClick={remove}
                            aria-label="Remove photo"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            {isSettings && avatarBlock}

            <label className="setup-field-label">name</label>
            <div className="setup-name-row">
                <input
                    className="setup-school-input"
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                />
                <input
                    className="setup-school-input"
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                />
            </div>

            <label className="setup-field-label" htmlFor={id('username')}>username</label>
            <div className="setup-username-wrap">
                <input
                    id={id('username')}
                    className="setup-school-input"
                    type="text"
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    required
                    minLength={3}
                    maxLength={30}
                />
                {usernameStatus === 'available' && (
                    <span className="setup-username-ok">Available</span>
                )}
                {usernameStatus && usernameStatus !== 'available' && (
                    <span className="setup-username-taken">
                        {usernameStatus === 'taken' ? 'Taken' : usernameStatus}
                    </span>
                )}
            </div>

            {!isSettings && avatarBlock}

            <label className="setup-field-label" htmlFor={id('bio')}>enter biography</label>
            <textarea
                id={id('bio')}
                className="setup-bio"
                value={biography}
                onChange={(e) => setBiography(e.target.value)}
                placeholder="Tell people a little about yourself"
                rows={5}
            />

            <label className="setup-field-label" htmlFor={id('photos')}>
                {isSettings ? 'Photos' : 'photos'} ({totalPhotos}/{MAX_PHOTOS})
            </label>

            {!isSettings && (
                <input
                    id={id('photos')}
                    className="setup-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoChange}
                    disabled={totalPhotos >= MAX_PHOTOS}
                />
            )}

            {(existingPhotos.length > 0 || photoPreviews.length > 0) && (
                <div className="setup-photo-previews">
                    {existingPhotos.map((url, index) => photoItem(url, index, 'existing'))}
                    {photoPreviews.map((preview, index) => photoItem(preview, index, 'new'))}
                </div>
            )}

            {isSettings && (
                <>
                    <input
                        id={id('photos')}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={handlePhotoChange}
                        disabled={totalPhotos >= MAX_PHOTOS}
                    />
                    <div className="duo-btn-wrap settings-add-photo-wrap">
                        <div className="duo-btn-pill" aria-hidden="true" />
                        <label
                            htmlFor={id('photos')}
                            className={`duo-btn settings-add-photo-btn${totalPhotos >= MAX_PHOTOS ? ' settings-add-photo-btn--disabled' : ''}`}
                            style={{ '--duo-shadow': 'rgb(20, 60, 90)' }}
                            aria-label="Add photo"
                        >
                            +
                        </label>
                    </div>
                </>
            )}

            {cropTarget && (
                <ImageScaleCropModal
                    file={cropTarget.file}
                    // Profile picture is circular and only ever square — gallery photos
                    // support square/portrait/landscape, so only lock the aspect for the
                    // avatar and let the picker show for everything else.
                    fixedAspect={cropTarget.kind === 'avatar' ? 'square' : undefined}
                    onCancel={() => setCropTarget(null)}
                    onConfirm={handleCropConfirm}
                />
            )}
        </>
    );
};

export default ProfileFields;
