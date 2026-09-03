import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Regression cover for the club_id contract on the upload-URL endpoints.
//
// Both /club-logo-upload-url and /event-poster-upload-url gate on club_id and then on
// requireModerator. That gate was added to /event-poster-upload-url after its callers
// already existed, and only one of the two was updated — the other kept posting { ext }
// and every event with a poster failed with "club_id is required".
//
// These pin the server side only. The callers are React components and there is no
// jsdom/RTL in this project, so nothing here can catch a caller that stops sending
// club_id — if you tighten one of these endpoints again, grep for its path first.
//
// Mocked at server/supabaseAdmin.js, the boundary, per docs/testing-guide.md.
const membershipRole = vi.fn();
const createSignedUploadUrl = vi.fn();

vi.mock('../supabaseAdmin.js', () => {
    const from = vi.fn(() => ({
        // requireModerator: club_memberships.select('role').eq().eq().maybeSingle()
        select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => membershipRole() }) }),
        }),
    }));
    return {
        supabaseAdmin: {
            from,
            storage: {
                from: (bucket) => ({
                    createSignedUploadUrl: (path, options) =>
                        createSignedUploadUrl(bucket, path, options),
                    getPublicUrl: (path) => ({
                        data: { publicUrl: `http://localhost:54321/storage/v1/object/public/${path}` },
                    }),
                }),
            },
        },
    };
});

vi.mock('../middleware/checkMuted.js', () => ({
    checkMuted: (_req, _res, next) => next(),
}));

const { default: storageRouter } = await import('./storage.js');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/storage', storageRouter);
    app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({ error: err.message });
    });
    return app;
}

const token = jwt.sign(
    { sub: 'user-1', email: 'a@b.com', aud: 'authenticated' },
    process.env.SUPABASE_JWT_SECRET
);

const POSTER = '/api/storage/event-poster-upload-url';
const LOGO = '/api/storage/club-logo-upload-url';

describe('upload-URL endpoints require club_id', () => {
    beforeEach(() => {
        membershipRole.mockReset();
        createSignedUploadUrl.mockReset();
        membershipRole.mockResolvedValue({ data: { role: 'top_moderator' } });
        createSignedUploadUrl.mockResolvedValue({
            data: { signedUrl: 'https://signed.example/put', token: 'upload-token', path: 'p' },
            error: null,
        });
    });

    // This is the exact failure clubs hit: AddEventPanel posted { ext } with no club_id.
    it('rejects an event-poster request with no club_id', async () => {
        const res = await request(makeApp())
            .post(POSTER)
            .set('Authorization', `Bearer ${token}`)
            .send({ ext: 'jpg' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('club_id is required');
        expect(createSignedUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects a club-logo request with no club_id', async () => {
        const res = await request(makeApp())
            .post(LOGO)
            .set('Authorization', `Bearer ${token}`)
            .send({ ext: 'png' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('club_id is required');
        expect(createSignedUploadUrl).not.toHaveBeenCalled();
    });

    it('mints an event-poster URL when club_id is present and the caller moderates', async () => {
        const res = await request(makeApp())
            .post(POSTER)
            .set('Authorization', `Bearer ${token}`)
            .send({ ext: 'jpg', club_id: 'club-1' });

        expect(res.status).toBe(200);
        expect(res.body.signedUrl).toBe('https://signed.example/put');

        // Posters are namespaced by uploader, not by club — verifyOwnership on
        // /verify-image treats event_posters as a user-namespaced bucket, so a path that
        // stopped starting with the user id would silently fail moderation afterwards.
        const [bucket, path] = createSignedUploadUrl.mock.calls[0];
        expect(bucket).toBe('event_posters');
        expect(path.startsWith('user-1/')).toBe(true);
    });

    it('accepts camelCase clubId as well as club_id', async () => {
        const res = await request(makeApp())
            .post(POSTER)
            .set('Authorization', `Bearer ${token}`)
            .send({ ext: 'jpg', clubId: 'club-1' });

        expect(res.status).toBe(200);
    });

    it('refuses a poster URL for a club the caller does not moderate', async () => {
        membershipRole.mockResolvedValue({ data: { role: 'member' } });

        const res = await request(makeApp())
            .post(POSTER)
            .set('Authorization', `Bearer ${token}`)
            .send({ ext: 'jpg', club_id: 'club-1' });

        expect(res.status).toBe(403);
        expect(createSignedUploadUrl).not.toHaveBeenCalled();
    });
});
