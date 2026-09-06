import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// GET /api/me/onboarding — the token-free way back into the wizard.
//
// Two queries: the caller's moderator memberships, then the club_onboarding rows for
// those clubs. Mocked at server/supabaseAdmin.js, the boundary.
const membershipRows = vi.fn();
const onboardingRows = vi.fn();
const membershipRoleFilter = vi.fn();

vi.mock('../supabaseAdmin.js', () => {
    const from = vi.fn((table) => {
        if (table === 'club_memberships') {
            return {
                select: () => ({
                    eq: () => ({
                        in: (_col, roles) => {
                            membershipRoleFilter(roles);
                            return membershipRows();
                        },
                    }),
                }),
            };
        }
        // club_onboarding
        return { select: () => ({ in: () => onboardingRows() }) };
    });
    return { supabaseAdmin: { from } };
});

const { meOnboardingRouter } = await import('./onboarding.js');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/me/onboarding', meOnboardingRouter);
    app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({ error: err.message });
    });
    return app;
}

const token = jwt.sign(
    { sub: 'user-1', email: 'pres@club.edu', aud: 'authenticated' },
    process.env.SUPABASE_JWT_SECRET
);

const get = () => request(makeApp()).get('/api/me/onboarding').set('Authorization', `Bearer ${token}`);

describe('GET /api/me/onboarding', () => {
    beforeEach(() => {
        membershipRows.mockReset();
        onboardingRows.mockReset();
        membershipRoleFilter.mockReset();
    });

    it('rejects an anonymous caller', async () => {
        const res = await request(makeApp()).get('/api/me/onboarding');
        expect(res.status).toBe(401);
    });

    it('returns the clubs the caller moderates that are in setup', async () => {
        membershipRows.mockResolvedValue({ data: [{ club_id: 'club-1' }], error: null });
        onboardingRows.mockResolvedValue({
            data: [{
                club_id: 'club-1',
                status: 'changes_requested',
                demo_club_data: { club_name: 'Chess Club', image_url: 'https://img/logo.png' },
            }],
            error: null,
        });

        const res = await get();

        expect(res.status).toBe(200);
        expect(res.body.clubs).toEqual([{
            club_id: 'club-1',
            status: 'changes_requested',
            club_name: 'Chess Club',
            club_image: 'https://img/logo.png',
        }]);
    });

    // Plain members must not get a way into the wizard — this is the only authorization
    // check on the route, since there is no token to fall back on.
    it('asks only for moderator and top_moderator memberships', async () => {
        membershipRows.mockResolvedValue({ data: [], error: null });
        await get();
        expect(membershipRoleFilter).toHaveBeenCalledWith(['moderator', 'top_moderator']);
    });

    it('returns an empty list without a second query when the caller moderates nothing', async () => {
        membershipRows.mockResolvedValue({ data: [], error: null });

        const res = await get();

        expect(res.status).toBe(200);
        expect(res.body.clubs).toEqual([]);
        expect(onboardingRows).not.toHaveBeenCalled();
    });

    // Moderating a club is not the same as having a wizard to resume: a long-published
    // club has no club_onboarding row and should not appear.
    it('omits moderated clubs that have no onboarding row', async () => {
        membershipRows.mockResolvedValue({
            data: [{ club_id: 'club-1' }, { club_id: 'club-2' }], error: null,
        });
        onboardingRows.mockResolvedValue({
            data: [{ club_id: 'club-2', status: 'claimed', demo_club_data: { club_name: 'Rowing' } }],
            error: null,
        });

        const res = await get();

        expect(res.body.clubs.map((c) => c.club_id)).toEqual(['club-2']);
        expect(res.body.clubs[0].club_image).toBeNull();
    });

    it('surfaces a database failure as a 502', async () => {
        membershipRows.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

        const res = await get();

        expect(res.status).toBe(502);
        expect(res.body.error).toBe('connection reset');
    });
});
