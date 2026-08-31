import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';
import nlSearchParser from '../lib/nlSearch.js';
import { PUBLIC_CLUB_COLUMNS } from '../lib/publicColumns.js';
import { attachClubInterests } from '../lib/clubInterests.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { q, school } = req.query;

  if (q) {
    const parsed = nlSearchParser.parse(q);

    if (parsed && (parsed.categories.length > 0 || parsed.tags.length > 0)) {
      try {
        // Same allowlist as GET /api/clubs — these two hand back the same shape and
        // must not drift, since the club grid renders whichever one answered.
        let query = supabaseAdmin.from('demo_club_data').select(PUBLIC_CLUB_COLUMNS);
        if (school) query = query.eq('school', school);
        if (parsed.categories.length > 0) query = query.in('category', parsed.categories);

        const { data: clubs, error: clubErr } = await query;
        if (clubErr) throw clubErr;

        let results = clubs || [];

        if (parsed.tags.length > 0 && results.length > 0) {
          const clubIds = results.map((c) => c.id);
          const { data: reviews } = await supabaseAdmin
            .from('reviews')
            .select('club_id, review_tags')
            .in('club_id', clubIds);

          const tagMatched = new Set();
          for (const r of reviews || []) {
            if (!Array.isArray(r.review_tags)) continue;
            for (const t of parsed.tags) {
              if (r.review_tags.includes(t)) { tagMatched.add(r.club_id); break; }
            }
          }

          results.sort((a, b) => (tagMatched.has(b.id) ? 1 : 0) - (tagMatched.has(a.id) ? 1 : 0));
        }

        if (parsed.keywords) {
          const kw = parsed.keywords.toLowerCase();
          const keywordMatched = new Set(
            results
              .filter((c) =>
                c.club_name?.toLowerCase().includes(kw) ||
                c.club_description?.toLowerCase().includes(kw))
              .map((c) => c.id)
          );
          results.sort((a, b) => (keywordMatched.has(b.id) ? 1 : 0) - (keywordMatched.has(a.id) ? 1 : 0));
        }

        return res.json(await attachClubInterests(supabaseAdmin, results));
      } catch (err) {
        console.error('[nl-search] structured query failed, falling back:', err.message);
      }
    }
  }

  // Fallback path. The column list here is fixed by the search_clubs function in the
  // database, not by this file, so the allowlist above does not constrain it — if a
  // sensitive column is ever added to demo_club_data, that function needs auditing too.
  const { data, error } = await supabaseAdmin
    .rpc('search_clubs', {
      search_query: q,
      filter_school: school,
    });

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(await attachClubInterests(supabaseAdmin, data || []));
});

export default router;
