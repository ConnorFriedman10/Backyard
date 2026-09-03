import { describe, it, expect } from 'vitest';
import { wallClock, weeklyWindow, APP_TIME_ZONE } from './wallClock.js';

describe('wallClock', () => {
    it('renders an instant as the naive wall clock of the zone, not UTC', () => {
        // 16:52Z on 2026-08-23 is 12:52 in New York (EDT, UTC-4). The whole point
        // of this helper is that the second one is what club_events stores.
        const instant = new Date('2026-08-23T16:52:03Z');
        expect(wallClock(instant, 'America/New_York')).toBe('2026-08-23T12:52:03');
        expect(wallClock(instant, 'UTC')).toBe('2026-08-23T16:52:03');
    });

    it('formats without an offset, matching the timestamp column', () => {
        const s = wallClock(new Date('2026-08-23T16:52:03Z'));
        expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        expect(s).not.toMatch(/[Z+]/);
    });

    it('follows DST rather than a fixed offset', () => {
        // January is EST (UTC-5), August is EDT (UTC-4) — same wall-clock hour
        // in NY resolves from different instants.
        expect(wallClock(new Date('2026-01-15T17:00:00Z'), 'America/New_York')).toBe('2026-01-15T12:00:00');
        expect(wallClock(new Date('2026-08-15T16:00:00Z'), 'America/New_York')).toBe('2026-08-15T12:00:00');
    });

    it('defaults to the app timezone', () => {
        const instant = new Date('2026-08-23T16:52:03Z');
        expect(wallClock(instant)).toBe(wallClock(instant, APP_TIME_ZONE));
    });
});

describe('weeklyWindow', () => {
    it('spans now to seven days out, both as naive wall clock', () => {
        const { from, to } = weeklyWindow(new Date('2026-08-23T16:52:03Z'), 'America/New_York');
        expect(from).toBe('2026-08-23T12:52:03');
        expect(to).toBe('2026-08-30T12:52:03');
    });

    it('includes an event that has started but not ended, and excludes one that has', () => {
        // The exact case that was broken: at 12:52 EDT these two events are
        // upcoming, but the SQL version read their naive end_times as UTC and
        // treated both as already over.
        const { from, to } = weeklyWindow(new Date('2026-08-23T16:52:03Z'), 'America/New_York');
        const inWindow = (start, end) => end >= from && start < to;

        expect(inWindow('2026-08-23T13:00:00', '2026-08-23T16:00:00')).toBe(true);  // Kirk Getaway
        expect(inWindow('2026-08-23T13:31:00', '2026-08-23T14:31:00')).toBe(true);  // Formal
        expect(inWindow('2026-08-23T11:00:00', '2026-08-23T12:00:00')).toBe(false); // already ended
        expect(inWindow('2026-09-24T12:00:00', '2026-09-24T15:00:00')).toBe(false); // beyond 7 days
    });

    it('compares correctly as plain strings', () => {
        // The window is handed to PostgREST as text, so lexicographic order has
        // to agree with chronological order — true only because the format is
        // zero-padded and fixed-width.
        const { from } = weeklyWindow(new Date('2026-08-23T16:52:03Z'), 'America/New_York');
        expect('2026-08-23T09:00:00' < from).toBe(true);
        expect('2026-08-23T13:00:00' > from).toBe(true);
    });
});
