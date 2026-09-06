import express from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getBlockedIds, filterBlocked } from '../lib/blocks.js';

const router = express.Router();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// Optional auth — attaches req.user if a valid Bearer token is present, otherwise no-ops.
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token && JWT_SECRET) {
    try {
      const payload = jwt.verify(token, JWT_SECRET, { audience: 'authenticated' });
      req.user = { id: payload.sub };
    } catch { /* ignore invalid/expired tokens */ }
  }
  next();
}

// GET /api/clubs/events/monthly-batch?clubIds=a,b,c&year=2026&month=6
// Batched form of the per-club route below. CalendarPage needs every club the user
// belongs to, which previously meant one request per club per month — a user in 20 clubs
// fired 40 requests every time the month view opened or the month changed, enough on its
// own to trip the rate limiter.
//
// Two segments, so this cannot collide with the three-segment /:clubId/events/monthly.
router.get('/events/monthly-batch', optionalAuth, async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Valid year and month (1–12) are required' });
  }

  const clubIds = String(req.query.clubIds || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (clubIds.length === 0) return res.json([]);
  if (clubIds.length > 100) {
    return res.status(400).json({ error: 'Too many clubIds (max 100)' });
  }

  // One membership lookup covering every club, rather than one per club as the
  // single-club route does.
  let memberOf = new Set();
  if (req.user) {
    const { data: memberships } = await supabaseAdmin
      .from('club_memberships')
      .select('club_id')
      .eq('user_id', req.user.id)
      .in('club_id', clubIds);
    memberOf = new Set((memberships || []).map((m) => m.club_id));
  }

  const settled = await Promise.allSettled(
    clubIds.map((clubId) =>
      supabaseAdmin
        .rpc('get_club_monthly_events', {
          p_club_id: clubId,
          p_year: year,
          p_month: month,
          p_is_member: memberOf.has(clubId),
        })
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return (data || []).map((e) => ({ ...e, club_id: clubId }));
        })
    )
  );

  // Drop failed clubs rather than failing the whole calendar — matches what the client
  // did with Promise.allSettled when it was fanning out these requests itself.
  res.json(settled.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value));
});

// GET /api/clubs/:clubId/events/monthly?year=2026&month=6
// Returns events spanning prev month, current month, and next month for the given club.
// Optional auth — members also see members-only events.
router.get('/:clubId/events/monthly', optionalAuth, async (req, res) => {
  const { clubId } = req.params;
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Valid year and month (1–12) are required' });
  }

  let isMember = false;
  if (req.user) {
    const { data: membership } = await supabaseAdmin
      .from('club_memberships')
      .select('role')
      .eq('user_id', req.user.id)
      .eq('club_id', clubId)
      .maybeSingle();
    isMember = !!membership;
  }

  const { data, error } = await supabaseAdmin
    .rpc('get_club_monthly_events', {
      p_club_id: clubId,
      p_year: year,
      p_month: month,
      p_is_member: isMember,
    });

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data || []);
});

// GET /api/clubs/:clubId/events
// Public, optional auth. Returns this week's events for the given club.
// Authenticated members also see events where is_members_only = true.
router.get('/:clubId/events', optionalAuth, async (req, res) => {
  const { clubId } = req.params;

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let isMember = false;
  if (req.user) {
    const { data: membership } = await supabaseAdmin
      .from('club_memberships')
      .select('role')
      .eq('user_id', req.user.id)
      .eq('club_id', clubId)
      .maybeSingle();
    isMember = !!membership;
  }

  let query = supabaseAdmin
    .from('club_events')
    .select('*')
    .eq('id_of_club', clubId)
    .gte('start_time', now.toISOString())
    .lte('start_time', weekOut.toISOString())
    .order('start_time', { ascending: true });

  if (!isMember) {
    query = query.or('is_members_only.is.null,is_members_only.eq.false');
  }

  const { data, error } = await query;

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data || []);
});

// GET /api/clubs/:clubId/events/upcoming
// Returns all events today or in the future for the given club, sorted by start_time.
// Optional auth — members also see members-only events.
router.get('/:clubId/events/upcoming', optionalAuth, async (req, res) => {
  const { clubId } = req.params;

  let isMember = false;
  if (req.user) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('member_list')
      .eq('id', req.user.id)
      .single();
    isMember = (profile?.member_list || []).includes(clubId);
  }

  // Start of today in UTC so events happening today are included even if start_time has passed
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  let query = supabaseAdmin
    .from('club_events')
    .select('*')
    .eq('id_of_club', clubId)
    .gte('start_time', todayUtc.toISOString())
    .order('start_time', { ascending: true });

  if (!isMember) {
    query = query.or('is_members_only.is.null,is_members_only.eq.false');
  }

  const { data, error } = await query;

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data || []);
});

// GET /api/clubs/:clubId/events/rsvps?eventIds=a,b,c
// Returns all RSVPs/maybes for the given event IDs with basic profile data.
// Shape: [{ user_id, event_id, status, profile: { first_name, last_name, username, avatar_url } }]
//
// requireAuth was added here deliberately. The route previously had no auth middleware of
// its own — it was only ever reachable by authenticated callers because questions.js was
// accidentally 401ing the whole /api/clubs mount. With that bug fixed this became a fully
// public endpoint that let anyone enumerate who attended any event, so it now requires
// auth in its own right rather than by accident.
router.get('/:clubId/events/rsvps', requireAuth, async (req, res) => {
  const idsParam = req.query.eventIds;
  if (!idsParam) return res.json([]);

  const ids = String(idsParam).split(',').filter(Boolean);
  if (ids.length === 0) return res.json([]);

  const { data: rsvpData, error } = await supabaseAdmin
    .from('attendees')
    .select('user_id, event_id, status')
    .in('event_id', ids);

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  const blockedIds = await getBlockedIds(req.user.id);
  const filtered = filterBlocked(rsvpData, blockedIds, (r) => r.user_id);

  // Fetch profiles for all attendees in one query so the client can show avatars.
  const userIds = [...new Set(filtered.map((r) => r.user_id))];
  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, username, avatar_url')
      .in('id', userIds);
    profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  res.json(filtered.map((r) => ({ ...r, profile: profileMap[r.user_id] || null })));
});

// POST /api/clubs/:clubId/events/:eventId/rsvp — marks user as "going"
router.post('/:clubId/events/:eventId/rsvp', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('attendees')
    .upsert(
      { user_id: req.user.id, event_id: req.params.eventId, status: 'going' },
      { onConflict: 'user_id,event_id' }
    );

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.status(204).end();
});

// DELETE /api/clubs/:clubId/events/:eventId/rsvp — auth required
router.delete('/:clubId/events/:eventId/rsvp', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('attendees')
    .delete()
    .eq('user_id', req.user.id)
    .eq('event_id', req.params.eventId);

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.status(204).end();
});

// GET /api/clubs/:clubId/events/:eventId/attendees — auth required
// Returns the list of users who have RSVPd to an event, with profile data.
router.get('/:clubId/events/:eventId/attendees', requireAuth, async (req, res) => {
  const { eventId } = req.params;

  const { data, error } = await supabaseAdmin
    .from('attendees')
    .select('user_id, profiles(username, avatar_url)')
    .eq('event_id', eventId);
// POST /api/clubs/:clubId/events/:eventId/maybe — marks user as "maybe"
router.post('/:clubId/events/:eventId/maybe', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('attendees')
    .upsert(
      { user_id: req.user.id, event_id: req.params.eventId, status: 'maybe' },
      { onConflict: 'user_id,event_id' }
    );

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  const blockedIds = await getBlockedIds(req.user.id);
  const filtered = filterBlocked(data, blockedIds, (r) => r.user_id);

  res.json(filtered.map(r => ({
    user_id: r.user_id,
    username: r.profiles?.username ?? 'Unknown',
    avatar_url: r.profiles?.avatar_url ?? null,
  })));
  res.status(204).end();
});

// DELETE /api/clubs/:clubId/events/:eventId/maybe — removes maybe
router.delete('/:clubId/events/:eventId/maybe', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('attendees')
    .delete()
    .eq('user_id', req.user.id)
    .eq('event_id', req.params.eventId);

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.status(204).end();
});

export default router;
