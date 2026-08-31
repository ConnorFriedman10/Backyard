import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { PUBLIC_CLUB_COLUMNS, PUBLIC_REVIEW_COLUMNS } from '../lib/publicColumns.js';
import { attachClubInterests } from '../lib/clubInterests.js';

const router = express.Router();

// Is this caller in the club? Members are allowed to see hidden reviews, because a
// member is who un-hides them (see PATCH /api/reviews/:reviewId). Returns false for
// anonymous callers rather than throwing — these routes stay reachable without a token.
async function isClubMember(userId, clubId) {
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from('club_memberships')
    .select('user_id')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle();
  return Boolean(data);
}

// GET /api/clubs — list all clubs.
// Public: no requireAuth middleware. The service-role client just runs the query
// against Supabase as if RLS didn't exist, which is fine here because the data
// is meant to be public anyway.
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('demo_club_data')
    .select(PUBLIC_CLUB_COLUMNS);


  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(await attachClubInterests(supabaseAdmin, data));
});


// GET /api/clubs/:clubId — single club by ID
router.get('/:clubId', async (req, res) => {
  const { clubId } = req.params;

  const { data, error } = await supabaseAdmin
    .from('demo_club_data')
    .select(PUBLIC_CLUB_COLUMNS)
    .eq('id', clubId)
    .single();

  if (error) {
    const err = new Error(error.message);
    err.status = error.code === 'PGRST116' ? 404 : 502;
    throw err;
  }

  res.json(data);
});

// Reviews a club member hid stay in the table so they can be restored, but this route
// was handing every one of them to anyone who asked. The client only consults is_hidden
// to render the moderation toggle, so hidden text was shipped to the public and merely
// not drawn — visible to anyone reading the response. Filter it server-side and let
// members, who are the ones able to un-hide, still see the full set.
router.get('/:clubId/reviews', async (req, res) => {
  const { clubId } = req.params;

  // identifyUser is mounted globally on /api, so req.user is populated when a token is
  // present without this route requiring one.
  const canSeeHidden = await isClubMember(req.user?.id, clubId);

  let query = supabaseAdmin
    .from('reviews')
    .select(PUBLIC_REVIEW_COLUMNS)
    .eq('club_id', clubId);

  // Rows predating the moderation feature have is_hidden NULL, and `neq(true)` would
  // drop them: in SQL, NULL <> true is NULL, not true.
  if (!canSeeHidden) query = query.or('is_hidden.is.null,is_hidden.eq.false');

  const { data, error } = await query;

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data);
});


router.get('/:clubId/stats', async (req, res) => {
  const { clubId } = req.params;

  const { data, error } = await supabaseAdmin
    .rpc('get_averages', { p_club_id: clubId });

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data);
});

export default router;
