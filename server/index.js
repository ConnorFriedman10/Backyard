import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { identifyUser } from './middleware/requireAuth.js';
import { ALLOWED_ORIGINS } from './lib/appUrls.js';

import clubsRouter from './routes/clubs.js';
import clubDetailsRouter from './routes/clubDetails.js';
import onboardingRouter, { meOnboardingRouter } from './routes/onboarding.js';
import adminOnboardingRouter from './routes/adminOnboarding.js';
import searchRouter from './routes/search.js';
import universitiesRouter from './routes/universities.js';
import reviewsRouter from './routes/reviews.js';
import favoritesRouter from './routes/favorites.js';
import votesRouter from './routes/votes.js';
import friendsRouter from './routes/friends.js';
import blocksRouter from './routes/blocks.js';
import accountRouter from './routes/account.js';
import profilesRouter from './routes/profiles.js';
import usersRouter from './routes/users.js';
import storageRouter from './routes/storage.js';
import eventsRouter from './routes/events.js';
import supportRouter from './routes/support.js';
import clubEventsRouter from './routes/clubEvents.js';
import clubPageRouter from './routes/clubPage.js';
import questionsRouter from './routes/questions.js';
import invitesRouter from './routes/invites.js';
import interestsRouter from './routes/interests.js';
import userInterestsRouter from './routes/userInterests.js';
import { startQueue } from './notifications/queue.js';
import friendRequestsRouter from './routes/friend-requests.js';
import notificationsRouter from './routes/notifications.js';
import clubMembersRouter from './routes/clubMembers.js';


const app = express();
const port = process.env.PORT || 3001;

// Railway terminates TLS and forwards through exactly one proxy hop, so req.ip must be
// read from X-Forwarded-For. Without this Express (default `false` in v5) resolves
// req.ip to the proxy's own address and *every user of the product shares one
// rate-limit bucket*. Use 1 rather than `true`: trusting the entire forwarded chain
// would let any client spoof the header and sidestep limits altogether.
app.set('trust proxy', 1);

app.use(helmet());
// Parsed in lib/appUrls.js, which also derives the single-origin link bases. Keeping
// both in one place is what stops the allowlist from being interpolated into a URL.
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));

const WINDOW_MS = 15 * 60 * 1000;

// Key by user ID whenever we know who is calling. A university campus NATs thousands of
// students behind a handful of public addresses, so keying by IP throttles the entire
// school as if it were one person. ipKeyGenerator is the library's own helper — it
// normalizes IPv6 to a /56 subnet, which hand-rolled `req.ip` keying gets wrong.
const keyByUser = (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? '');

const limiter = (max) =>
  rateLimit({
    windowMs: WINDOW_MS,
    max,
    keyGenerator: keyByUser,
    standardHeaders: true, // RateLimit-* headers so the client can back off intelligently
    legacyHeaders: false,
  });

// Populate req.user before any limiter runs. requireAuth lives inside the routers, which
// is too late for keyGenerator to see it.
app.use('/api', identifyUser);

// Overall ceiling. Generous, because opening a single club card costs ~8 requests.
app.use('/api', limiter(1000));

// Each write surface gets its own bucket. Previously one shared limiter instance backed
// all ten mounts, so a burst of image uploads would exhaust the same 60-request budget
// that favoriting a club needed.
const reviewsLimiter = limiter(100);
const favoritesLimiter = limiter(300); // hearts get toggled rapidly while browsing
const votesLimiter = limiter(300);
const friendsLimiter = limiter(150);
const friendRequestsLimiter = limiter(100);
const notificationsLimiter = limiter(300); // mostly reads (mark-as-seen polling)
const eventsLimiter = limiter(150);
const storageLimiter = limiter(100); // uploads are expensive downstream (Vision API)
const invitesLimiter = limiter(100);
const supportLimiter = limiter(30); // abuse-prone, and nobody files 30 tickets legitimately

// /users/check-username has to stay reachable without a token — signup calls it before
// an account exists — which makes it an account-existence oracle. On the global 1000
// bucket that is 1000 guesses per window against a username list. Nobody picks a
// handle in 30 tries, and the limiter keys by user id once signed in, so a real user
// hitting the profile-settings path is not throttled by whatever the IP has been doing.
const usernameCheckLimiter = limiter(30);
// Covers the rest of the router. /users/search is an authenticated username
// autocomplete, so it is a second, quieter enumeration surface.
const usersLimiter = limiter(200);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Public reads
app.use('/api/interests', interestsRouter);
app.use('/api/clubs', clubMembersRouter);
app.use('/api/clubs', clubsRouter);
app.use('/api/clubs', clubPageRouter);
app.use('/api/clubs', questionsRouter);
app.use('/api/clubs', clubEventsRouter);

// Club onboarding. Mounted on the bare '/api/clubs' prefix these limiters charged every
// unrelated club route and every /api/clubs 404 — POST /clubs/:id/invite-link silently
// dropped from 100 to 60 per window. Same mount-ordering trap the check-username comment
// above describes. The routers still mount on /api/clubs; only the buckets are scoped.
//
// Draft saves fire once per wizard step, so that bucket is the generous one. Both key by
// user id, since every route behind them requires auth.
app.use(/^\/api\/clubs\/[^/]+\/onboarding/, limiter(120));
app.use(/^\/api\/clubs\/[^/]+\/details$/, limiter(60));
app.use('/api/clubs', onboardingRouter);
app.use('/api/clubs', clubDetailsRouter);
app.use('/api/search', searchRouter);
app.use('/api/universities', universitiesRouter);

// Authenticated writes/reads scoped to the current user (req.user from JWT)
app.use('/api/reviews', reviewsLimiter, reviewsRouter);
app.use('/api/me/favorites', favoritesLimiter, favoritesRouter);
app.use('/api/me/votes', votesLimiter, votesRouter);
app.use('/api/me/friends', friendsLimiter, friendsRouter);
app.use('/api/me/blocks', friendsLimiter, blocksRouter);
// Irreversible, so it gets its own tight bucket rather than sharing one.
app.use('/api/me/account', limiter(10), accountRouter);
app.use('/api/me/interests', limiter(100), userInterestsRouter);
// Mounted on the exact path, before the broad '/api/me' router below — same
// mount-order rule as /api/users/check-username further down.
app.use('/api/me/onboarding', limiter(60), meOnboardingRouter);
app.use('/api/friend-requests', friendRequestsLimiter, friendRequestsRouter);
app.use('/api/me/notifications', notificationsLimiter, notificationsRouter);
app.use('/api/me', profilesRouter); // serves /profile and /membership
// The specific path has to be registered before the router mount, or Express reaches the
// router first and the tighter bucket never runs.
app.use('/api/users/check-username', usernameCheckLimiter);
app.use('/api/users', usersLimiter, usersRouter);
app.use('/api/events', eventsLimiter, eventsRouter);

// Signed upload URLs (auth required; service role stays on the server)
app.use('/api/storage', storageLimiter, storageRouter);

// Invite links: generate (POST /api/clubs/:clubId/invite-link) + validate/redeem
// (GET|POST /api/invite/:token) + admin (/api/admin/*).
//
// The router's own paths are relative to /api, so it stays mounted there. The limiter,
// however, is scoped to the invite prefixes instead of riding on the bare '/api' mount —
// previously it ran for every request that fell through unmatched, so each /api 404
// burned write budget. /api/invite is the surface actually worth limiting: it is where
// someone would brute-force invite tokens.
app.use('/api/invite', invitesLimiter);
// Tighter than the shared /api/admin bucket: this is the only endpoint that mints
// credentials in bulk. Registered before the router, the same ordering the
// check-username limiter above depends on.
app.use('/api/admin/onboarding-links', limiter(20));
app.use('/api/admin', invitesLimiter);
app.use('/api/admin', adminOnboardingRouter);
app.use('/api', invitesRouter);
// Support tickets
app.use('/api/support', supportLimiter, supportRouter);

app.use((err, req, res, _next) => {
  console.error('[api error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

startQueue().catch((err) => {
  console.error('[queue] failed to start — notifications disabled:', err.message);
});
