import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Mock Supabase before importing the router (vi.mock is hoisted).
//
// POST /api/events makes two calls:
//   1. from('profiles').select('member_list').eq('id', uid).single()  — membership check
//   2. from('club_events').insert(payload).select().single()          — the write
//
// insertMock captures the payload so we can assert which fields actually reached it.
const insertMock = vi.fn();
const singleMock = vi.fn();

vi.mock('../supabaseAdmin.js', () => {
    const from = vi.fn((table) => {
        if (table === 'club_events') {
            return {
                insert: (payload) => {
                    insertMock(payload);
                    return { select: () => ({ single: async () => ({ data: { id: 'evt-1', ...payload }, error: null }) }) };
                },
            };
        }
        // profiles
        return {
            select: () => ({ eq: () => ({ single: singleMock }) }),
        };
    });
    return { supabaseAdmin: { from } };
});

// checkMuted queries profiles too; stub it out so these tests stay focused on the route.
vi.mock('../middleware/checkMuted.js', () => ({
    checkMuted: (_req, _res, next) => next(),
}));

const { default: eventsRouter } = await import('./events.js');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/events', eventsRouter);
    app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({ error: err.message });
    });
    return app;
}

const token = jwt.sign(
    { sub: 'user-1', email: 'a@b.com', aud: 'authenticated' },
    process.env.SUPABASE_JWT_SECRET
);

const validBody = {
    clubId: 'club-1',
    clubName: 'Chess Club',
    description: 'Weekly meetup',
    // Relative to now, not hardcoded. These were fixed 2026-09-01 timestamps, so the
    // whole suite went red on its own once that date passed — validateEventFields
    // rejects a start time in the past, and four tests started 400ing on a clock tick
    // rather than a code change.
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    eventName: 'Blitz Night',
    where: 'Snell 101',
    isMembersOnly: true,
};

describe('POST /api/events', () => {
    beforeEach(() => {
        insertMock.mockReset();
        singleMock.mockReset();
        singleMock.mockResolvedValue({ data: { member_list: ['club-1'] }, error: null });
    });

    // Regression: eventName, where and isMembersOnly were used in the handler but never
    // destructured from req.body, so every POST threw ReferenceError before the insert.
    it('creates an event without throwing on undeclared fields', async () => {
        const res = await request(makeApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(validBody);

        expect(res.status).toBe(201);
        expect(insertMock).toHaveBeenCalledOnce();
    });

    it('passes eventName, where and isMembersOnly through to the insert', async () => {
        await request(makeApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(validBody);

        expect(insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id_of_club: 'club-1',
                event_name: 'Blitz Night',
                where: 'Snell 101',
                is_members_only: true,
            })
        );
    });

    it('omits optional fields that were not supplied', async () => {
        const { eventName, where, isMembersOnly, ...withoutOptional } = validBody;
        await request(makeApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(withoutOptional);

        const payload = insertMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty('event_name');
        expect(payload).not.toHaveProperty('where');
        // isMembersOnly is always written, defaulting to false when absent.
        expect(payload.is_members_only).toBe(false);
    });

    it('rejects a non-member of the club', async () => {
        singleMock.mockResolvedValue({ data: { member_list: ['some-other-club'] }, error: null });

        const res = await request(makeApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(validBody);

        expect(res.status).toBe(403);
        expect(insertMock).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
        const res = await request(makeApp()).post('/api/events').send(validBody);
        expect(res.status).toBe(401);
        expect(insertMock).not.toHaveBeenCalled();
    });
});
