import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { checkMuted } from '../middleware/checkMuted.js';
import { requireModerator } from '../lib/clubPermissions.js';
import { validateModules } from '../../shared/clubPageValidation.js';
import { validateClubDetails, pickClubDetails } from '../../shared/clubDetailsValidation.js';
import { sanitizeModules } from '../../shared/sanitizeModules.js';
import { checkDraftReady } from '../../shared/onboardingDraft.js';
import { validateEvents } from '../../shared/clubEventsValidation.js';
import { validateInterests } from '../../shared/clubInterestsValidation.js';
import textModerator from '../lib/textModerator.js';
import { sendClubSubmissionEmail } from '../lib/emails/sendClubSubmission.js';

const router = express.Router();

// The invite token is used for exactly two requests — GET /invite/:token and
// POST /invite/:token/redeem — and never again. From here on authorization is the JWT
// plus club_memberships.role, like every other club write.
//
// Deriving the club from the token on each wizard request would create a second
// authorization mechanism every future endpoint has to get right, and would keep the
// token in the URL bar, browser history and Referer headers for the whole session.

// Statuses where the club still owns the draft. Once submitted, edits are blocked so
// what a reviewer approves is what the club actually sent.
const EDITABLE_STATUSES = new Set(['unclaimed', 'claimed', 'changes_requested']);

async function loadRow(clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_onboarding')
    .select('club_id, status, draft, claimed_by, claimed_at, submitted_at, reviewed_at, review_note')
    .eq('club_id', clubId)
    .maybeSingle();

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }
  return data;
}

// GET /api/clubs/:clubId/onboarding — the wizard's resume endpoint.
router.get('/:clubId/onboarding', requireAuth, async (req, res) => {
  const { clubId } = req.params;
  await requireModerator(req.user.id, clubId);

  const row = await loadRow(clubId);
  if (!row) {
    return res.json({ club_id: clubId, status: 'unclaimed', draft: {}, review_note: null });
  }
  res.json(row);
});

// PUT /api/clubs/:clubId/onboarding/draft — autosaved once per wizard step.
//
// Writes to club_onboarding.draft rather than club_page_data, so nothing a club types
// is publicly readable until it has been reviewed. GET /clubs/:clubId/page is public,
// unauthenticated and select('*').
router.put('/:clubId/onboarding/draft', requireAuth, checkMuted, async (req, res) => {
  const { clubId } = req.params;
  await requireModerator(req.user.id, clubId);

  const existing = await loadRow(clubId);

  // No row means this club was never part of outreach. Creating one here would set its
  // status to 'claimed' and permanently 409 that club out of its own page and details
  // editor, with no self-service way back.
  if (!existing) {
    return res.status(404).json({
      error: 'This club is not part of club setup. Edit your page from your club page instead.',
    });
  }

  if (!EDITABLE_STATUSES.has(existing.status)) {
    return res.status(409).json({
      error: existing.status === 'approved'
        ? 'This page has been approved and can now be edited from your club page.'
        : 'This page is waiting on review and cannot be edited right now.',
      status: existing.status,
    });
  }

  const { modules, details, events, interests } = req.body ?? {};

  // Saves are partial by design — the wizard sends one step at a time — so each half is
  // validated only when present. The hard completeness check happens on submit.
  const patch = { ...(existing?.draft ?? {}) };

  if (modules !== undefined) {
    // Sanitize first, then validate what will actually be stored. Validating the raw
    // input and storing the sanitized version lets a field pass a length check and then
    // land empty — e.g. a body of only "<script>x</script>".
    const safeModules = sanitizeModules(modules);
    // partial: an autosave fires mid-typing, so unfilled fields are not errors here.
    // Completeness is checked once, on submit.
    const structure = validateModules(safeModules, { partial: true });
    if (!structure.valid) {
      return res.status(400).json({ error: structure.errors[0].message, errors: structure.errors });
    }
    const textCheck = textModerator.checkFields(collectText(safeModules));
    if (!textCheck.clean) {
      return res.status(400).json({ error: textCheck.message, field: textCheck.field });
    }
    patch.modules = safeModules;
  }

  if (details !== undefined) {
    const picked = pickClubDetails(details);
    const check = validateClubDetails(picked);
    if (!check.valid) {
      return res.status(400).json({ error: check.errors[0].message, errors: check.errors });
    }
    const textCheck = textModerator.checkFields(picked);
    if (!textCheck.clean) {
      return res.status(400).json({ error: textCheck.message, field: textCheck.field });
    }
    patch.details = { ...(existing?.draft?.details ?? {}), ...picked };
  }

  if (events !== undefined) {
    // partial for the same reason modules are: an autosave fires while a club is still
    // picking a date, and "you have not filled this in yet" is not an error yet.
    const check = validateEvents(events, { partial: true });
    if (!check.valid) {
      return res.status(400).json({ error: check.errors[0].message, errors: check.errors });
    }
    const textCheck = textModerator.checkFields(collectEventText(events));
    if (!textCheck.clean) {
      return res.status(400).json({ error: textCheck.message, field: textCheck.field });
    }
    patch.events = events;
  }

  if (interests !== undefined) {
    const check = validateInterests(interests, { partial: true });
    if (!check.valid) {
      return res.status(400).json({ error: check.errors[0], errors: check.errors });
    }
    // Typed subcategory names are club-authored text that will join a shared, publicly
    // readable taxonomy, so they are moderated here as well as at approval.
    const names = {};
    (interests.subcategories ?? []).forEach((s, i) => { names[`subcategory.${i}`] = s?.name ?? ''; });
    const textCheck = textModerator.checkFields(names);
    if (!textCheck.clean) {
      return res.status(400).json({ error: textCheck.message, field: textCheck.field });
    }
    patch.interests = interests;
  }

  const { data, error } = await supabaseAdmin
    .from('club_onboarding')
    .upsert({
      club_id: clubId,
      draft: patch,
      // 'unclaimed' → 'claimed' because someone is demonstrably working on it now, and
      // 'changes_requested' → 'claimed' so the review queue stops showing it as needing
      // attention until it is resubmitted. The row is guaranteed to exist by the check
      // above, so there is no create-on-write path here.
      status: existing.status === 'approved' ? 'approved' : 'claimed',
      claimed_by: existing.claimed_by ?? req.user.id,
      claimed_at: existing.claimed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'club_id' })
    .select('club_id, status, draft, updated_at')
    .single();

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data);
});

// POST /api/clubs/:clubId/onboarding/submit — hand the page to review.
router.post('/:clubId/onboarding/submit', requireAuth, checkMuted, async (req, res) => {
  const { clubId } = req.params;
  // Moderator, not top_moderator. The default max_uses of 5 exists precisely so a
  // president can forward the link to their e-board; requiring ownership here meant
  // everyone but the first claimer hit a 403 on the last button in the flow.
  await requireModerator(req.user.id, clubId);

  const existing = await loadRow(clubId);
  if (!existing) return res.status(404).json({ error: 'Nothing to submit yet.' });
  if (!EDITABLE_STATUSES.has(existing.status)) {
    return res.status(409).json({ error: 'Already submitted.', status: existing.status });
  }

  const problems = checkDraftReady(existing.draft);
  if (problems.length) {
    return res.status(400).json({ error: problems[0], errors: problems });
  }

  const { data, error } = await supabaseAdmin
    .from('club_onboarding')
    .update({
      status: 'pending_review',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('club_id', clubId)
    .select('club_id, status, submitted_at')
    .single();

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json(data);

  // After responding, and never able to fail the submission. A club that filled in their
  // page should not see an error because our mail provider had a bad minute, and the
  // page is already safely submitted by this point.
  const basic = (existing.draft?.modules ?? [])
    .find((m) => m?.type === 'basic_info')?.data ?? {};
  sendClubSubmissionEmail({
    to: req.user.email,
    clubName: basic.club_name,
    userId: req.user.id,
  });
});

// Only the fields a human actually wrote — module scaffolding is placeholder text and
// would drown a moderation check in false positives.
function collectText(modules) {
  const out = {};
  for (const [i, m] of (modules ?? []).entries()) {
    const d = m?.data ?? {};
    if (m?.type === 'basic_info') {
      out[`basic_info.club_name.${i}`] = d.club_name ?? '';
      out[`basic_info.description.${i}`] = d.description ?? '';
    }
    if (m?.type === 'join') {
      for (const [j, t] of (d.tabs ?? []).entries()) {
        out[`join.tab.${i}.${j}.title`] = t?.title ?? '';
        out[`join.tab.${i}.${j}.body`] = t?.body ?? '';
      }
    }
    if (m?.type === 'faqs') {
      for (const [j, f] of (d.faqs ?? []).entries()) {
        out[`faq.${i}.${j}.q`] = f?.q ?? '';
        out[`faq.${i}.${j}.a`] = f?.a ?? '';
      }
    }
    if (m?.type === 'member_roster') {
      for (const [j, mem] of (d.members ?? []).entries()) {
        out[`member.${i}.${j}.name`] = mem?.name ?? '';
        out[`member.${i}.${j}.bio`] = mem?.bio ?? '';
      }
    }
  }
  return out;
}

// Event names, locations and descriptions are user-written and end up on a public
// calendar, so they go through the same moderation as page text.
function collectEventText(events) {
  const out = {};
  for (const [i, ev] of (events ?? []).entries()) {
    out[`event.${i}.name`] = ev?.event_name ?? '';
    out[`event.${i}.where`] = ev?.where ?? '';
    out[`event.${i}.description`] = ev?.description ?? '';
  }
  return out;
}

// GET /api/me/onboarding — the token-free way back into the wizard.
//
// Mounted separately because this router sits under /api/clubs and this route is keyed on
// the caller, not a club.
//
// The claim token grants a role once and then plays no further part in authorization —
// every route above checks club_memberships.role. But /claim/:token was the onboard
// bundle's only entry point, which made the token an address as well as a grant. A link
// that expired (30 days by default) or was revoked therefore locked a club out of a page
// they were still fully authorized to edit, and minting a replacement is refused for any
// club that already has an owner. Between those two rules there was no supported way
// back. This is it.
export const meOnboardingRouter = express.Router();

meOnboardingRouter.get('/', requireAuth, async (req, res) => {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('club_memberships')
    .select('club_id')
    .eq('user_id', req.user.id)
    .in('role', ['moderator', 'top_moderator']);

  if (membershipError) {
    const err = new Error(membershipError.message);
    err.status = 502;
    throw err;
  }

  const clubIds = (memberships ?? []).map((m) => m.club_id);
  if (clubIds.length === 0) return res.json({ clubs: [] });

  // Inner-joined on club_onboarding rather than listing every club they moderate: a
  // moderator of a long-published club has no wizard to resume and belongs on their club
  // page instead.
  const { data: rows, error } = await supabaseAdmin
    .from('club_onboarding')
    .select('club_id, status, demo_club_data(club_name, image_url)')
    .in('club_id', clubIds);

  if (error) {
    const err = new Error(error.message);
    err.status = 502;
    throw err;
  }

  res.json({
    clubs: (rows ?? []).map((r) => ({
      club_id: r.club_id,
      status: r.status,
      club_name: r.demo_club_data?.club_name ?? '',
      club_image: r.demo_club_data?.image_url ?? null,
    })),
  });
});

export default router;
