import { apiFetch } from './api';

// Warms a club's page data before the user opens it.
//
// The problem this solves: ExpandedTile mounts and only then fires six-plus requests, so
// the card animates open against an empty shell and the content pops in afterwards. The
// animation is fine — it is the blank frame at the end of it that reads as choppy.
//
// Hovering a card is a strong signal of intent, and there is roughly 150-400ms between
// hover and click. That is enough to have the payload in hand by the time the tile mounts.
//
// is-approved is prefetched too, despite being user-specific. It decides whether the tile
// renders an editor header or a plain close button, so resolving it after mount visibly
// swaps the header and shifts everything under it. AuthListener clears this cache on
// sign-in and sign-out, which is what makes caching a per-user answer safe.
//
// RSVPs stay in the component: they depend on which events came back, and they do not
// affect layout.

const cache = new Map();     // clubId -> { data, at }
const inflight = new Map();  // clubId -> Promise

// Short enough that an edit made in another tab is not shown stale for long, long enough
// to cover browsing a grid and opening several clubs.
const TTL_MS = 60_000;

function isFresh(entry) {
  return entry && Date.now() - entry.at < TTL_MS;
}

async function load(clubId) {
  // allSettled, not all: a club with no page row or no reviews must still open. The
  // component already handles each field being absent.
  const [reviews, page, events, members, approved] = await Promise.allSettled([
    apiFetch(`/clubs/${clubId}/reviews`),
    apiFetch(`/clubs/${clubId}/page`, { auth: false }),
    apiFetch(`/clubs/${clubId}/events/upcoming`),
    apiFetch(`/clubs/${clubId}/members`),
    // 401s for signed-out visitors; allSettled turns that into a rejection we ignore,
    // which lands on the same `undefined` a signed-out viewer should see anyway.
    apiFetch(`/clubs/${clubId}/is-approved`),
  ]);

  return {
    reviews: reviews.status === 'fulfilled' ? reviews.value : undefined,
    page: page.status === 'fulfilled' ? page.value : undefined,
    events: events.status === 'fulfilled' ? events.value : undefined,
    members: members.status === 'fulfilled' ? members.value : undefined,
    role: approved.status === 'fulfilled' ? (approved.value?.role ?? null) : undefined,
    // Same reason the role is seeded here: without it the membership button renders
    // "Request to Join" for someone who has already asked, then corrects itself once the
    // real fetch lands — the flicker this prefetch exists to avoid.
    joinRequestPending: approved.status === 'fulfilled'
      ? Boolean(approved.value?.joinRequestPending)
      : undefined,
  };
}

/**
 * Start (or join) a fetch of a club's public page data.
 *
 * Safe to call repeatedly — repeated hovers over the same card join the in-flight promise
 * rather than issuing another round of requests.
 */
export function prefetchClubPage(clubId) {
  if (!clubId) return Promise.resolve(null);

  const entry = cache.get(clubId);
  if (isFresh(entry)) return Promise.resolve(entry.data);

  const existing = inflight.get(clubId);
  if (existing) return existing;

  const promise = load(clubId)
    .then((data) => {
      cache.set(clubId, { data, at: Date.now() });
      inflight.delete(clubId);
      return data;
    })
    .catch((err) => {
      // Never cache a failure — the next hover should be free to retry.
      inflight.delete(clubId);
      console.error('[clubPageCache] prefetch failed:', err);
      return null;
    });

  inflight.set(clubId, promise);
  return promise;
}

/** Synchronous read, for seeding component state on the very first render. */
export function readClubPage(clubId) {
  const entry = cache.get(clubId);
  return isFresh(entry) ? entry.data : null;
}

/** Drop a club after its page is edited, so the next open re-reads it. */
export function invalidateClubPage(clubId) {
  cache.delete(clubId);
  inflight.delete(clubId);
}

/** Drop everything. Called on sign-in and sign-out, since some of the cached payload
 *  (upcoming events in particular) varies with who is asking. */
export function invalidateAllClubPages() {
  cache.clear();
  inflight.clear();
}
