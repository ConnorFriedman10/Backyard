// club_events.start_time / end_time are `timestamp without time zone` holding
// local wall-clock values: AddEventPanel sends `${formData.start}:00` straight
// from an <input type="datetime-local">, so "1pm" is stored as the bare string
// '13:00:00' with no zone attached. Nothing in that column is comparable to an
// instant until you decide what zone it meant.
//
// Everything else in the app already treats it as wall clock — parseISO() on the
// frontend reads it as local, and validateEventFields' "cannot start in the
// past" check compares it to a local `new Date()`. The one place that didn't was
// get_weekly_events, whose `ce.end_time >= now()` compared a timestamp to a
// timestamptz; Postgres resolves that by coercing the naive value with the
// session TimeZone (UTC on Supabase), reading a 4pm EDT event as 4pm UTC and
// dropping it from the week four hours before it ended.
//
// So: build the window in the same naive wall-clock space the column is stored
// in, and compare strings to strings.

// Single-university app, so a constant rather than a per-club setting. This is
// the assumption to revisit first when a second school is added — along with
// migrating those two columns to timestamptz, which is the real fix.
export const APP_TIME_ZONE = 'America/New_York';

/**
 * The current wall-clock time in `timeZone`, formatted the way the column
 * stores it ('YYYY-MM-DDTHH:mm:ss', no offset).
 *
 * 'sv-SE' is the shortest route to ISO-ish output from Intl; the zone lookup
 * itself comes from the ICU database, so DST is handled without a table here.
 */
export function wallClock(date = new Date(), timeZone = APP_TIME_ZONE) {
    return date.toLocaleString('sv-SE', { timeZone }).replace(' ', 'T');
}

/**
 * The week view's window, as naive wall-clock strings: an event belongs in it if
 * it hasn't ended yet and starts within seven days. Mirrors get_weekly_events'
 * `end_time >= now() AND start_time < now() + interval '7 days'`, but with both
 * sides in wall-clock space.
 *
 * Seven days is added as elapsed time, not as seven calendar days, so a window
 * spanning a DST boundary ends an hour off from the SQL version's wall-clock
 * arithmetic. That only ever moves the far edge of a 7-day window by an hour,
 * twice a year.
 */
export function weeklyWindow(now = new Date(), timeZone = APP_TIME_ZONE) {
    return {
        from: wallClock(now, timeZone),
        to: wallClock(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), timeZone),
    };
}
