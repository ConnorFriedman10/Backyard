import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { checkMuted } from '../middleware/checkMuted.js';
import { ImageModerator } from '../lib/imageModerator.js';
import { requireModerator } from '../lib/clubPermissions.js';

const router = express.Router();

router.use(requireAuth);
router.use(checkMuted);

const imageModerator = process.env.CLOUD_VISION_API
    ? new ImageModerator(process.env.CLOUD_VISION_API)
    : null;

// Without the key every upload is waved through unscanned. That is survivable in local
// development but means no nudity detection at all in production, and previously it
// happened silently — nothing distinguished "moderation passed" from "moderation never
// ran". Say so loudly at boot so a missing Railway variable cannot go unnoticed.
if (!imageModerator) {
    console.warn(
        '[moderation] CLOUD_VISION_API is not set — image moderation is DISABLED. ' +
        'Every upload will be accepted without a nudity or violence scan.'
    );
}

// The client picks the file extension, and stripping it to alphanumerics still lets
// through "svg" — a format that can carry <script> and event handlers. Nothing renders
// a club logo as anything but an <img>, where browsers refuse to run embedded script,
// but an SVG sitting in a public bucket is one <object> or direct link away from being
// a stored XSS. Allowlist the raster formats /verify-image will accept anyway, so a
// rejected type never reaches storage in the first place.
//
// Mirrors SAFE_IMAGE_TYPES below; anything outside it falls back to the caller default.
const SAFE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);

function imageExt(raw, fallback) {
    const cleaned = String(raw ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
    return SAFE_EXTENSIONS.has(cleaned) ? cleaned : fallback;
}

// Pattern: backend mints a short-lived signed upload URL, browser PUTs the
// file bytes directly to Supabase Storage. We never proxy megabytes through
// Express, but the service-role key stays on the server.
//
// Response shape: { signedUrl, token, path, publicUrl }
//   signedUrl — what the browser sends the PUT to
//   publicUrl — the URL the client should save in the DB row after upload
async function makeSignedUpload(bucket, path, res, options = {}) {
    const { data, error } = await supabaseAdmin
        .storage
        .from(bucket)
        .createSignedUploadUrl(path, options);

    if (error) {
        const err = new Error(error.message);
        err.status = 502;
        throw err;
    }

    const { data: publicData } = supabaseAdmin
        .storage
        .from(bucket)
        .getPublicUrl(path);

    res.json({
        signedUrl: data.signedUrl,
        token: data.token,
        path,
        publicUrl: publicData.publicUrl,
    });
}

// Profile avatars: deterministic filename per user so re-uploads overwrite.
// Extension is preserved from the original file (same pattern as club logos).
// We delete any existing avatar first because Supabase's upsertEnabled on
// createSignedUploadUrl can still throw "resource already exists" in practice.
router.post('/profile-upload-url', async (req, res) => {
    const ext = imageExt(req.body?.ext, 'jpg');
    const newPath = `${req.user.id}.${ext}`;

    // Purge all existing avatar files for this user regardless of extension.
    const { data: listed } = await supabaseAdmin.storage
        .from('profile_images')
        .list('', { search: req.user.id });
    const toRemove = (listed || [])
        .filter(f => f.name.startsWith(`${req.user.id}.`))
        .map(f => f.name);
    if (toRemove.length) {
        await supabaseAdmin.storage.from('profile_images').remove(toRemove);
    }

    await makeSignedUpload('profile_images', newPath, res, { upsert: true });
});

// Review images: many per user, so we randomize. Namespace under the user's
// id so it's obvious who uploaded what and so storage policies can scope
// listing if you ever add them.
router.post('/review-upload-url', async (req, res) => {
    const ext = imageExt(req.body?.ext, 'webp');
    const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const path = `${req.user.id}/${rand}.${ext}`;
    await makeSignedUpload('review_images', path, res);
});

router.post('/profile-photos-upload-url', async (req, res) => {
    const ext = imageExt(req.body?.ext, 'webp');
    const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const path = `${req.user.id}/${rand}.${ext}`;
    await makeSignedUpload('profile_photos', path, res);
});

router.post('/club-logo-upload-url', async (req, res) => {
    const clubId = req.body.club_id ?? req.body.clubId;
    if (!clubId) return res.status(400).json({ error: 'club_id is required' });

    // This endpoint used to check only that club_id was PRESENT. Because the storage
    // path is deterministic (`${clubId}.${ext}`) and upsert is enabled, any authenticated
    // user could mint an upload URL for any club and overwrite its logo. The role check
    // existed but only in verifyOwnership, which runs on the separate /verify-image call
    // a client can simply skip.
    await requireModerator(req.user.id, clubId);

    const ext = imageExt(req.body?.ext, 'webp');
    const path = `${clubId}.${ext}`;

    // No delete here. Issuing a signed URL is not evidence that an upload will follow,
    // so removing the current logo at this point loses it whenever the browser never
    // PUTs — moving the delete later in the same handler did not change that, since it
    // still runs before the upload.
    //
    // The path is deterministic and upsert is enabled, so a same-extension replacement
    // overwrites in place. Changing extension does strand the old file: it stays in the
    // bucket and remains publicly readable, though nothing links to it once image_url is
    // updated. Accepted for now — losing a club's live logo to an abandoned upload is the
    // worse failure. A sweep keyed on club id would be the real fix.
    await makeSignedUpload('club_logos', path, res, { upsert: true });
});

router.post('/event-poster-upload-url', async (req, res) => {
    const clubId = req.body.club_id ?? req.body.clubId;
    if (!clubId) return res.status(400).json({ error: 'club_id is required' });

    // Namespaced by uploader, not by club — matches /club-media-video-upload-url
    // below, the other growing-collection-of-club-media bucket (club_logos is
    // different: one deterministic file per club, overwritten in place, not a
    // collection). club_id is still required so only a moderator of that club
    // can mint an upload URL at all.
    await requireModerator(req.user.id, clubId);

    const ext = imageExt(req.body?.ext, 'jpg');
    const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const path = `${req.user.id}/${rand}.${ext}`;
    await makeSignedUpload('event_posters', path, res);
});

// Club media short videos (≤15 s on the client): mp4/webm/mov, namespaced per user.
router.post('/club-media-video-upload-url', async (req, res) => {
    const raw = (req.body?.ext || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'mp4';
    const allowed = new Set(['mp4', 'webm', 'mov', 'm4v']);
    const ext = allowed.has(raw) ? raw : 'mp4';
    const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const path = `${req.user.id}/${rand}.${ext}`;
    await makeSignedUpload('club_media_videos', path, res);
});

const USER_BUCKETS = new Set([
    'profile_images', 'review_images', 'profile_photos',
    'club_logos', 'event_posters', 'club_media_videos',
]);

const SAFE_IMAGE_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
]);

function parseStorageUrl(publicUrl) {
    let parsed;
    try { parsed = new URL(publicUrl); } catch { return null; }

    const allowed = new URL(process.env.SUPABASE_URL);
    if (parsed.hostname !== allowed.hostname || parsed.protocol !== 'https:'
        || parsed.username || parsed.password) return null;
    if (!parsed.pathname.startsWith('/storage/v1/object/public/')) return null;

    const after = parsed.pathname.slice('/storage/v1/object/public/'.length);
    const segments = after.split('/');
    const bucket = segments[0];
    if (!USER_BUCKETS.has(bucket)) return null;

    return { parsed, bucket, objectPath: segments.slice(1).join('/') };
}

const USER_NAMESPACED_BUCKETS = new Set([
    'review_images', 'profile_photos', 'event_posters', 'club_media_videos',
]);

async function verifyOwnership(bucket, objectPath, userId) {
    if (bucket === 'profile_images') {
        return objectPath.startsWith(`${userId}.`);
    }
    if (USER_NAMESPACED_BUCKETS.has(bucket)) {
        return objectPath.startsWith(`${userId}/`);
    }
    if (bucket === 'club_logos') {
        const clubId = objectPath.split('.')[0];
        const { data } = await supabaseAdmin
            .from('club_memberships')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', userId)
            .maybeSingle();
        return ['moderator', 'top_moderator'].includes(data?.role);
    }
    return false;
}

async function verifyContentType(publicUrl) {
    const headRes = await fetch(publicUrl, { method: 'HEAD' });
    if (!headRes.ok) return false;
    const contentType = (headRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return SAFE_IMAGE_TYPES.has(contentType);
}

router.post('/verify-image', async (req, res) => {
    const { publicUrl } = req.body || {};
    if (!publicUrl || typeof publicUrl !== 'string') {
        return res.status(400).json({ ok: false, error: 'publicUrl is required' });
    }

    const urlInfo = process.env.SUPABASE_URL && parseStorageUrl(publicUrl);
    if (!urlInfo) {
        return res.status(400).json({ ok: false, error: 'Invalid storage URL' });
    }

    const owned = await verifyOwnership(urlInfo.bucket, urlInfo.objectPath, req.user.id);
    if (!owned) {
        return res.status(403).json({ ok: false, error: 'You do not own this file' });
    }

    const isImage = await verifyContentType(publicUrl);
    if (!isImage) {
        if (imageModerator) await imageModerator.deleteFromStorage(publicUrl);
        return res.status(400).json({ ok: false, error: 'File is not a valid image' });
    }

    // Decided from the bucket, never from the request body. This used to read
    // `req.body?.skipScan === true`, which meant any authenticated caller could disable
    // Cloud Vision for ANY bucket — club logos, review images, club media — by adding one
    // field to the JSON. That is the whole moderation system behind a client-supplied
    // boolean, and the onboarding wizard is about to hand logo upload to 150 strangers.
    //
    // Avatars are the one case the flag legitimately existed for: they are only visible
    // on the uploader's own profile, and the content-type check still applies.
    const skipScan = urlInfo.bucket === 'profile_images';

    // Fails open rather than blocking uploads outright, but flags the response so the
    // gap is visible rather than looking identical to a passing scan.
    if (!imageModerator || skipScan) {
        return res.json({ ok: true, scanned: false });
    }

    let result;
    try {
        result = await imageModerator.scan(publicUrl);
    } catch (scanErr) {
        // API-level failures (billing disabled, quota exceeded, network error) are not
        // content violations — don't block the upload. Log loudly so it's visible in
        // production, but let the image through rather than breaking every upload.
        console.warn(`[moderation] scan failed (${urlInfo.bucket}), failing open:`, scanErr.message);
        return res.json({ ok: true, scanned: false });
    }

    if (result.safe) {
        return res.json({ ok: true });
    }

    await imageModerator.deleteFromStorage(publicUrl);

    const strike = await imageModerator.recordStrike(
        req.user.id,
        result.violations[0].category,
        { publicUrl, violations: result.violations },
    );

    const response = {
        ok: false,
        error: 'Your image was detected to have inappropriate content',
        strikes: strike.strikes,
    };

    if (strike.muted) {
        response.muted = true;
        response.muted_until = strike.mutedUntil;
    }

    res.status(422).json(response);
});

export default router;
