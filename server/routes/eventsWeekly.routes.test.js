import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const USER = '11111111-1111-4111-8111-111111111111';
const CLUB_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const CLUB_B = 'bbbbbbbb-2222-4222-8222-222222222222';

const db = {
    member_list: [CLUB_A, CLUB_B],
    club_events: [],
    demo_club_data: [
        { id: CLUB_A, image_url: 'club-a-logo.png' },
        { id: CLUB_B, image_url: 'club-b-logo.png' },
    ],
};

// Captures what the route actually asked the database for, so the window
// filters can be asserted rather than inferred from the rows that come back.
const captured = {};

vi.mock('../supabaseAdmin.js', () => {
    const from = (table) => {
        if (table === 'profiles') {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: { member_list: db.member_list }, error: null }),
                        single: async () => ({ data: { member_list: db.member_list }, error: null }),
                    }),
                }),
            };
        }

        if (table === 'club_events') {
            const q = {
                in: (_c, ids) => { captured.clubIds = ids; return q; },
                gte: (_c, v) => { captured.gte = v; return q; },
                lt: (_c, v) => { captured.lt = v; return q; },
                order: async () => {
                    const rows = db.club_events.filter((e) =>
                        captured.clubIds.includes(e.id_of_club) &&
                        e.end_time >= captured.gte &&
                        e.start_time < captured.lt);
                    return { data: rows, error: null };
                },
            };
            return { select: () => q };
        }

        if (table === 'demo_club_data') {
            return {
                select: () => ({
                    in: async (_c, ids) => ({
                        data: db.demo_club_data.filter((c) => ids.includes(c.id)),
                        error: null,
                    }),
                }),
            };
        }

        throw new Error(`unexpected table ${table}`);
    };

    return { supabaseAdmin: { from, rpc: async () => { throw new Error('should not call the rpc any more'); } } };
});

async function makeApp() {
    const { default: router } = await import('./events.js');
    const app = express();
    app.use(express.json());
    app.use('/api/events', router);
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
    return app;
}

// aud must be 'authenticated' — verifyBearer passes { audience: 'authenticated' }
// to jwt.verify, and the secret comes from vitest.setup.js.
const token = () => jwt.sign(
    { sub: USER, email: 'a@b.c', aud: 'authenticated' },
    process.env.SUPABASE_JWT_SECRET,
);

describe('GET /api/events/weekly', () => {
    beforeEach(() => {
        db.member_list = [CLUB_A, CLUB_B];
        db.club_events = [];
    });

    it('filters on wall-clock time, so an event later today is still upcoming', async () => {
        // 16:52Z = 12:52 EDT. Under the old SQL comparison this event's naive
        // 16:00 end_time was read as 16:00Z and dropped as past; it starts at 1pm
        // local and must be returned.
        vi.setSystemTime(new Date('2026-08-23T16:52:03Z'));
        db.club_events = [
            { id: 'e1', id_of_club: CLUB_A, club_name: 'A', event_name: 'Kirk Getaway', event_description: null, start_time: '2026-08-23T13:00:00', end_time: '2026-08-23T16:00:00', event_image_url: null },
        ];

        const res = await request(await makeApp()).get('/api/events/weekly').set('Authorization', `Bearer ${token()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(captured.gte).toBe('2026-08-23T12:52:03');
        expect(captured.lt).toBe('2026-08-30T12:52:03');
        vi.useRealTimers();
    });

    it('excludes events that have ended and events past the seven-day edge', async () => {
        vi.setSystemTime(new Date('2026-08-23T16:52:03Z'));
        db.club_events = [
            { id: 'over', id_of_club: CLUB_A, club_name: 'A', event_name: 'over', start_time: '2026-08-23T09:00:00', end_time: '2026-08-23T10:00:00', event_image_url: null },
            { id: 'far', id_of_club: CLUB_A, club_name: 'A', event_name: 'far', start_time: '2026-09-24T12:00:00', end_time: '2026-09-24T15:00:00', event_image_url: null },
            { id: 'keep', id_of_club: CLUB_B, club_name: 'B', event_name: 'keep', start_time: '2026-08-25T18:00:00', end_time: '2026-08-25T20:00:00', event_image_url: null },
        ];

        const res = await request(await makeApp()).get('/api/events/weekly').set('Authorization', `Bearer ${token()}`);

        expect(res.body.map((e) => e.id)).toEqual(['keep']);
        vi.useRealTimers();
    });

    it('returns the same column shape the rpc did, including club_id and the image fallback', async () => {
        vi.setSystemTime(new Date('2026-08-23T16:52:03Z'));
        db.club_events = [
            { id: 'own', id_of_club: CLUB_A, club_name: 'A', event_name: 'has poster', event_description: 'd', start_time: '2026-08-24T10:00:00', end_time: '2026-08-24T11:00:00', event_image_url: 'poster.png' },
            { id: 'fallback', id_of_club: CLUB_B, club_name: 'B', event_name: 'no poster', event_description: null, start_time: '2026-08-24T12:00:00', end_time: '2026-08-24T13:00:00', event_image_url: null },
        ];

        const res = await request(await makeApp()).get('/api/events/weekly').set('Authorization', `Bearer ${token()}`);

        expect(res.body[0]).toEqual({
            id: 'own', id_of_club: CLUB_A, club_id: CLUB_A, club_name: 'A',
            event_name: 'has poster', event_description: 'd',
            start_time: '2026-08-24T10:00:00', end_time: '2026-08-24T11:00:00',
            image_url: 'poster.png',
        });
        // COALESCE(event_image_url, dc.image_url) — the club logo stands in.
        expect(res.body[1].image_url).toBe('club-b-logo.png');
        expect(res.body[1].club_id).toBe(CLUB_B);
        vi.useRealTimers();
    });

    it('short-circuits to [] for a user in no clubs, without querying events', async () => {
        db.member_list = [];
        captured.clubIds = ['sentinel'];

        const res = await request(await makeApp()).get('/api/events/weekly').set('Authorization', `Bearer ${token()}`);

        expect(res.body).toEqual([]);
        expect(captured.clubIds).toEqual(['sentinel']); // untouched
    });
});
