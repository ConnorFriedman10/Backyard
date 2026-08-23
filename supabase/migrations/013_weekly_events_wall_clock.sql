-- The week view was empty even with events scheduled for today.
--
-- club_events.start_time / end_time are `timestamp without time zone`, and the
-- app writes local wall-clock values into them verbatim: AddEventPanel sends
-- `${formData.start}:00` straight from an <input type="datetime-local">, so
-- "1pm" is stored as the naive string '13:00:00' with no zone attached. Every
-- consumer treats that as wall clock — the frontend's parseISO() reads it as
-- local, and the server's own "cannot start in the past" check compares it to
-- a local `new Date()`.
--
-- This function was the one place that didn't. `ce.end_time >= now()` compares
-- a `timestamp` to a `timestamptz`, which Postgres resolves by coercing the
-- naive value using the session TimeZone — UTC here. So a 4pm EDT event was
-- read as 4pm UTC, four hours earlier than intended, and events fell out of the
-- week window four hours before they actually ended. Measured on 2026-08-23 at
-- 16:52Z (12:52 EDT): `end_time >= '16:52'` matched 0 rows while
-- `end_time >= '12:52'` matched two events that had not yet started.
--
-- Comparing against `now() AT TIME ZONE 'America/New_York'` puts both sides in
-- the same naive wall-clock space, which is the space the data is actually
-- stored in. The timezone is hardcoded because the app is single-university
-- today; the real fix is to migrate these two columns to timestamptz and have
-- the client send an offset, which is a change across the write path, this
-- function and a backfill of every existing row.
--
-- CREATE OR REPLACE FUNCTION cannot change a function's output columns, so the
-- old signature has to be dropped first.
DROP FUNCTION IF EXISTS get_weekly_events(uuid);

CREATE FUNCTION get_weekly_events(p_user_id uuid)
RETURNS TABLE (
    id uuid,
    id_of_club uuid,
    club_id uuid,
    club_name text,
    event_name text,
    event_description text,
    start_time timestamp,
    end_time timestamp,
    image_url text
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        ce.id,
        ce.id_of_club,
        ce.id_of_club AS club_id,
        ce.club_name,
        ce.event_name,
        ce.event_description,
        ce.start_time,
        ce.end_time,
        COALESCE(ce.event_image_url, dc.image_url) AS image_url
    FROM club_events ce
    JOIN demo_club_data dc ON dc.id = ce.id_of_club
    WHERE ce.id_of_club = ANY (
        SELECT unnest(member_list)
        FROM profiles
        WHERE id = p_user_id
    )
    AND ce.end_time >= (now() AT TIME ZONE 'America/New_York')
    AND ce.start_time < (now() AT TIME ZONE 'America/New_York') + interval '7 days';
$$;
