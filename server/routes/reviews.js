import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { checkMuted } from '../middleware/checkMuted.js';
import textModerator from '../lib/textModerator.js';
import { NotificationService } from '../notifications/service.js';

const router = express.Router();

// GET /api/reviews/:reviewId — public
router.get('/:reviewId', async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('reviews')
        .select('*')
        .eq('id', req.params.reviewId)
        .single();

    if (error) {
        const err = new Error(error.message);
        err.status = error.code === 'PGRST116' ? 404 : 502;
        throw err;
    }

    res.json(data);
});

// PATCH /api/reviews/:reviewId — auth required (club members only)
router.patch('/:reviewId', requireAuth, async (req, res) => {
    // Fetch the review to verify club membership before allowing the update.
    const { data: review, error: fetchErr } = await supabaseAdmin
        .from('reviews')
        .select('id, club_id')
        .eq('id', req.params.reviewId)
        .single();

    if (fetchErr || !review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('member_list')
        .eq('id', req.user.id)
        .single();

    if (!(profile?.member_list || []).includes(review.club_id)) {
        return res.status(403).json({ error: 'Only club members can update this review' });
    }

    const { isHidden } = req.body;
    if (typeof isHidden !== 'boolean') {
        return res.status(400).json({ error: 'isHidden (boolean) is required' });
    }

    const { data, error } = await supabaseAdmin
        .from('reviews')
        .update({ is_hidden: isHidden })
        .eq('id', req.params.reviewId)
        .select()
        .single();

    if (error) {
        const err = new Error(error.message);
        err.status = 502;
        throw err;
    }

    res.json(data);
});

router.use(requireAuth);

const REVIEW_WRITABLE = new Set([
    'club_id',
    'review_text',
    'review_title',
    'club_hours',
    'club_leadership',
    'club_fun',
    'club_community',
    'club_growth_index',
    'review_images',
]);

function pickWritable(body) {
    const out = {};
    for (const key of Object.keys(body || {})) {
        if (REVIEW_WRITABLE.has(key)) out[key] = body[key];
    }
    return out;
}

router.post('/', checkMuted, async (req, res) => {
    const patch = pickWritable(req.body);
    if (!patch.club_id) {
        return res.status(400).json({ error: 'club_id required' });
    }

    const textCheck = textModerator.checkFields({
        review_text: patch.review_text,
        review_title: patch.review_title,
    });
    if (!textCheck.clean) {
        return res.status(400).json({ error: textCheck.message });
    }

    // user_id always comes from the verified JWT, never from the body.
    const row = { ...patch, user_id: req.user.id };

    const { data, error } = await supabaseAdmin
        .from('reviews')
        .insert(row)
        .select()
        .single();

    if (error) {
        // Postgres unique_violation (23505) on reviews_one_per_user — surfaced as a real
        // 409 rather than the generic 502 below, which is what the frontend's own
        // `err.status === 409` branch (ReviewPage.jsx) has been waiting on all along.
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Sorry, only one review per user' });
        }
        const err = new Error(error.message);
        err.status = 502;
        throw err;
    }

    res.status(201).json(data);

    // Notify club moderators (fire-and-forget)
    (async () => {
        try {
            const [{ data: club }, { data: moderators }] = await Promise.all([
                supabaseAdmin.from('demo_club_data').select('club_name, image_url').eq('id', patch.club_id).single(),
                supabaseAdmin
                    .from('club_memberships')
                    .select('user_id')
                    .eq('club_id', patch.club_id)
                    .in('role', ['moderator', 'top_moderator'])
                    .neq('user_id', req.user.id),
            ]);

            if (!moderators?.length) return;

            await Promise.allSettled(
                moderators.map((m) =>
                    NotificationService.dispatch({
                        type: 'new_review',
                        recipientId: m.user_id,
                        actorId: req.user.id,
                        entity: { kind: 'review', id: data.id },
                        payload: {
                            clubName: club?.club_name ?? null,
                            imageUrl: club?.image_url ?? null,
                        },
                    })
                )
            );
        } catch (err) {
            console.error('[reviews] notification fan-out failed:', err.message);
        }
    })();
});

export default router;
