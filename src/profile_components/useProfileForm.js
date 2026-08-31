import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { useClubData } from '../context/useClubData';
import textModerator from '../lib/textModerator';

// Shared state and save logic for the profile form.
//
// Extracted from ProfileSetupPage so the settings page can reuse it. The two differ only
// in framing and what happens after a successful save — onboarding redirects, settings
// stays put — so everything up to that point lives here: the debounced username
// availability check, avatar compression, the upload -> verify-image moderation round
// trip, and the photo gallery's three-way state (existing urls, pending files, object
// URLs for previews).
//
// Duplicating any of that would mean two moderation paths to keep in sync.

export const MAX_PHOTOS = 10;
const AVATAR_COLUMN = 'avatar_url';

export function useProfileForm() {
    // Prefer the shared copy. It falls back to fetching because onboarding can run before
    // the provider has one — a brand new account's profile row is created by AuthListener
    // after the provider's initial load.
    const { profile: sharedProfile, setProfile, loading: providerLoading } = useClubData();

    // Captured once, on mount. Two reasons it is a ref rather than read each render:
    //
    // 1. When the provider already has the profile, every field below seeds from it
    //    synchronously and there is no loading state at all — reopening Settings shows a
    //    filled-in form rather than a skeleton for data the app is already holding.
    //
    // 2. It stops the load effect from re-running when the shared profile changes. It
    //    previously depended on sharedProfile, so saving a calendar preference in another
    //    section pushed a new profile into the provider, re-ran this effect, and reset
    //    every field — silently discarding an in-progress bio or username edit.
    const seeded = useRef(sharedProfile);
    // Whether the form has been filled from a profile yet. Starts true when the provider
    // already had one at mount, since the initialisers below seeded from it.
    const populated = useRef(!!sharedProfile);

    const [loading, setLoading] = useState(() => !seeded.current);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [firstName, setFirstName] = useState(() => seeded.current?.first_name || '');
    const [lastName, setLastName] = useState(() => seeded.current?.last_name || '');
    const [username, setUsername] = useState(() => {
        const u = seeded.current?.username || '';
        return /^[a-zA-Z0-9_]+$/.test(u) ? u : '';
    });
    const [usernameStatus, setUsernameStatus] = useState(null);
    const [biography, setBiography] = useState(() => seeded.current?.biography || '');
    const [school, setSchool] = useState(() => seeded.current?.school || '');

    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(() => seeded.current?.avatar_url || null);

    const [existingPhotos, setExistingPhotos] = useState(
        () => (Array.isArray(seeded.current?.photos) ? seeded.current.photos : [])
    );
    const [selectedPhotoFiles, setSelectedPhotoFiles] = useState([]);
    const [photoPreviews, setPhotoPreviews] = useState([]);

    // The username the profile already has. Re-saving without changing it must not trip
    // the "taken" check against itself.
    const [initialUsername, setInitialUsername] = useState(() => seeded.current?.username || '');

    const checkUsername = useCallback(async (value) => {
        if (!value || value.length < 3 || !/^[a-zA-Z0-9_]+$/.test(value)) {
            setUsernameStatus(null);
            return;
        }
        try {
            const { available, reason } = await apiFetch(
                `/users/check-username?username=${encodeURIComponent(value)}`,
                { auth: false }
            );
            setUsernameStatus(available ? 'available' : reason || 'taken');
        } catch {
            setUsernameStatus(null);
        }
    }, []);

    useEffect(() => {
        if (!username) { setUsernameStatus(null); return; }
        // Your own current username is not "taken" by anyone else.
        if (username === initialUsername) { setUsernameStatus(null); return; }
        const timer = setTimeout(() => checkUsername(username), 400);
        return () => clearTimeout(timer);
    }, [username, initialUsername, checkUsername]);

    // Fills the form from a profile, exactly once.
    //
    // The guard is the important part. Populating a second time would overwrite whatever
    // the user has typed since — which is precisely what happened when this effect
    // depended on the shared profile and another Settings section wrote to it.
    const applyProfile = useCallback((profile) => {
        if (populated.current || !profile) return;
        populated.current = true;

        setFirstName(profile.first_name || '');
        setLastName(profile.last_name || '');
        const existing = profile.username || '';
        if (existing && /^[a-zA-Z0-9_]+$/.test(existing)) {
            setUsername(existing);
            setInitialUsername(existing);
        }
        setBiography(profile.biography || '');
        setSchool(profile.school || '');
        setAvatarPreview(profile.avatar_url || null);
        setExistingPhotos(Array.isArray(profile.photos) ? profile.photos : []);
        setLoading(false);
    }, []);

    // Takes the profile from whichever source has it first.
    //
    // Seeding at mount only covers the case where the provider had already loaded. Open
    // /profile-setup on a cold page load and the provider is still in flight, so the form
    // used to fire its own /me/profile — a duplicate of the request already running, and
    // a race: if it landed after the user started typing, it wiped their input.
    //
    // Waiting for the provider first means one request in the common case. The direct
    // fetch is kept for the one situation the provider cannot cover: onboarding straight
    // after signup, where AuthListener creates the row after the provider's initial load
    // finished, so the provider legitimately has nothing.
    useEffect(() => {
        if (populated.current) return;

        if (sharedProfile) {
            applyProfile(sharedProfile);
            return;
        }

        // Provider still working — let it finish rather than racing it.
        if (providerLoading) return;

        let cancelled = false;

        (async () => {
            setError(null);
            try {
                const profile = await apiFetch('/me/profile');
                if (!cancelled) applyProfile(profile);
            } catch (err) {
                if (cancelled) return;
                console.error('Error loading profile:', err);
                setError('Failed to load your profile. Please try again.');
                setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [sharedProfile, providerLoading, applyProfile]);

    // Object URLs leak until revoked.
    useEffect(() => {
        return () => photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    }, [photoPreviews]);

    const handleAvatarChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    // Same assignment handleAvatarChange does, just from a File that already exists (a
    // crop modal's output) instead of an <input> change event.
    const replaceAvatarFile = (file) => {
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const handlePhotoChange = (event) => {
        const files = Array.from(event.target.files || []);
        const remaining = MAX_PHOTOS - (existingPhotos.length + selectedPhotoFiles.length);

        if (remaining <= 0) {
            setError(`You can have at most ${MAX_PHOTOS} photos.`);
            event.target.value = '';
            return;
        }

        const toAdd = files.slice(0, remaining);
        if (files.length > remaining) {
            setError(`Only added ${remaining} photo(s). Max ${MAX_PHOTOS} total.`);
        }

        setSelectedPhotoFiles((prev) => [...prev, ...toAdd]);
        setPhotoPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
        event.target.value = '';
    };

    const removeExistingPhoto = (index) => {
        setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
    };

    const removeNewPhoto = (index) => {
        URL.revokeObjectURL(photoPreviews[index]);
        setSelectedPhotoFiles((prev) => prev.filter((_, i) => i !== index));
        setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
    };

    // `index` is over the combined existingPhotos + selectedPhotoFiles order the gallery
    // renders in. An existing photo is a remote URL, not a File, so scaling one can't
    // replace it in place — it comes out of existingPhotos and the cropped result goes in
    // as a new pending file instead (which is why it jumps to the end of the grid).
    const replacePhoto = (index, file) => {
        if (index < existingPhotos.length) {
            setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
            setSelectedPhotoFiles((prev) => [...prev, file]);
            setPhotoPreviews((prev) => [...prev, URL.createObjectURL(file)]);
            return;
        }

        const newIndex = index - existingPhotos.length;
        setSelectedPhotoFiles((prev) => prev.map((f, i) => (i === newIndex ? file : f)));
        setPhotoPreviews((prev) => {
            URL.revokeObjectURL(prev[newIndex]);
            return prev.map((p, i) => (i === newIndex ? URL.createObjectURL(file) : p));
        });
    };

    // Every uploaded image goes through /storage/verify-image before its URL is saved,
    // so a rejected image is never referenced by a profile row.
    const uploadPhotos = async () => {
        const urls = [];
        for (const file of selectedPhotoFiles) {
            const ext = file.name.split('.').pop();
            const { signedUrl, publicUrl } = await apiFetch('/storage/profile-photos-upload-url', {
                method: 'POST',
                body: { ext },
            });

            const putRes = await fetch(signedUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
            });
            if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

            const verification = await apiFetch('/storage/verify-image', {
                method: 'POST',
                body: { publicUrl },
            });
            if (!verification.ok) {
                throw new Error(verification.error || 'Photo rejected by content policy');
            }

            urls.push(publicUrl);
        }
        return urls;
    };

    const uploadAvatar = async () => {
        const ext = (avatarFile.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
        const { signedUrl, publicUrl } = await apiFetch('/storage/profile-upload-url', {
            method: 'POST',
            body: { ext },
        });

        const putRes = await fetch(signedUrl, {
            method: 'PUT',
            body: avatarFile,
            headers: { 'Content-Type': avatarFile.type },
        });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

        const verification = await apiFetch('/storage/verify-image', {
            method: 'POST',
            body: { publicUrl },
        });
        if (!verification.ok) {
            throw new Error(verification.error || 'Avatar rejected by content policy');
        }

        return publicUrl;
    };

    // Returns an error string, or null when valid. Client-side only — the server runs the
    // same moderation on every write.
    const validate = () => {
        if (!firstName.trim() || !lastName.trim()) return 'First and last name are required.';
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            return 'Username must be 3-30 alphanumeric or underscore characters.';
        }
        if (usernameStatus && usernameStatus !== 'available') return 'That username is already taken.';
        if (!biography.trim()) return 'Please enter a short biography.';

        const textCheck = textModerator.checkFields({
            first_name: firstName,
            last_name: lastName,
            biography,
        });
        if (!textCheck.clean) return textCheck.message;

        return null;
    };

    /**
     * Validates, uploads any new images, then PUTs the profile.
     * `extraFields` is merged into the body — onboarding uses it to send `school`.
     * Returns true on success, false if it set an error.
     */
    const save = async (extraFields = {}) => {
        setError(null);

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return false;
        }

        setSubmitting(true);
        try {
            const avatarUrl = avatarFile ? await uploadAvatar() : avatarPreview;
            const photos = [...existingPhotos, ...(await uploadPhotos())];

            const patch = {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                username: username.trim(),
                [AVATAR_COLUMN]: avatarUrl,
                biography: biography.trim(),
                photos,
                ...extraFields,
            };

            await apiFetch('/me/profile', { method: 'PUT', body: patch });

            // Push the saved values into the shared profile.
            //
            // Without this the provider keeps the pre-save copy, and since the form and
            // every other consumer now seed from it, the change would look reverted the
            // moment you navigated away and came back — the save having actually
            // succeeded. That is a worse failure than a slow reload, because it looks
            // like data loss.
            setProfile(patch);

            // Uploaded files are now saved URLs; fold them into the existing set so a
            // second save does not re-upload them.
            setExistingPhotos(photos);
            setSelectedPhotoFiles([]);
            setPhotoPreviews([]);
            setAvatarFile(null);
            setAvatarPreview(avatarUrl);
            setInitialUsername(username.trim());

            return true;
        } catch (err) {
            console.error('Error saving profile:', err);
            setError(err?.message || 'Could not save your profile. Please try again.');
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    return {
        loading, submitting, error, setError,
        firstName, setFirstName,
        lastName, setLastName,
        username, setUsername,
        usernameStatus,
        biography, setBiography,
        school,
        avatarFile, avatarPreview, handleAvatarChange, replaceAvatarFile,
        existingPhotos, photoPreviews,
        handlePhotoChange, removeExistingPhoto, removeNewPhoto, replacePhoto,
        totalPhotos: existingPhotos.length + selectedPhotoFiles.length,
        validate, save,
    };
}
