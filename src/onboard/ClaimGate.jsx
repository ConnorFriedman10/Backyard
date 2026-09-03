import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import Form from '../login_components/form';
import WizardShell from './WizardShell.jsx';
import wordmark from '../assets/BackyardOnBoardHeader.png';

/**
 * Everything before the wizard: resolve the token, show the club it belongs to, get the
 * person an account, and redeem.
 *
 * The token stash is the load-bearing piece. Signing up sends people to their inbox, and
 * they come back through /auth/callback with no URL params and no React state — so the
 * token goes into sessionStorage on arrival and is read back on return. This mirrors
 * JoinPage.jsx, which solved the same problem for member invites.
 */
export default function ClaimGate() {
    const { token } = useParams();

    const [invite, setInvite] = useState(null);
    const [inviteError, setInviteError] = useState(null);
    const [user, setUser] = useState(undefined); // undefined = still resolving
    const [claim, setClaim] = useState(null);    // null | 'working' | {club_id,...} | error string
    const [mode, setMode] = useState('signup');

    useEffect(() => {
        if (token) sessionStorage.setItem('pendingClaimToken', token);
    }, [token]);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

        // form.jsx only calls onAuth when signUp returns a session. With email
        // confirmation enabled it returns none — it just shows its own "check your
        // inbox" message — so onAuth never fires and nothing else here would notice the
        // session appearing after the user returns through /auth/callback.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) setUser(session.user);
        });
        return () => sub?.subscription?.unsubscribe();
    }, []);

    useEffect(() => {
        apiFetch(`/invite/${token}`, { auth: false })
            .then(setInvite)
            .catch((err) => setInviteError(err.message));
    }, [token]);

    const redeem = async () => {
        setClaim('working');
        try {
            // The main app creates the profiles row via AuthListener and the
            // /profile-setup bounce, neither of which exists in this bundle. Without a
            // row, addToMemberList updates zero rows and profiles.member_list — which
            // clubEvents.js and events.js read — never learns about the club.
            // POST /me/profile is an upsert keyed on the JWT, so this is safe to repeat.
            //
            // Carry over the names Supabase stored as user metadata at signup. Sending an
            // empty body created a bare row and silently discarded what the person had
            // just typed — profiles.js drops empty strings, so passing them through is
            // safe even when the metadata is absent (Google OAuth uses given/family_name).
            const meta = (await supabase.auth.getUser()).data.user?.user_metadata ?? {};
            await apiFetch('/me/profile', {
                method: 'POST',
                body: {
                    first_name: meta.first_name || meta.given_name || '',
                    last_name: meta.last_name || meta.family_name || '',
                },
            });

            const result = await apiFetch(`/invite/${token}/redeem`, { method: 'POST' });
            sessionStorage.removeItem('pendingClaimToken');
            setClaim(result);
        } catch (err) {
            setClaim(err.message || 'Something went wrong. Try the link again.');
        }
    };

    // Redeeming is idempotent, so someone already signed in can go straight through.
    useEffect(() => {
        if (user && invite && claim === null) redeem();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, invite]);

    // Most club leaders will reach for this rather than inventing another password. The
    // token is already in sessionStorage from the effect above, so /auth/callback can
    // send them back here — same mechanism the email-confirmation round trip uses.
    //
    // window.location.origin is the onboarding domain, so this must be in Supabase's
    // allowed redirect URLs or Google returns to a page that does not exist.
    const handleGoogleSignIn = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) setClaim(error.message);
    };

    // Only fires when signUp or signIn returned a session — i.e. email confirmation is
    // off, or this was a sign-in. When confirmation is ON, form.jsx shows its own
    // check-your-inbox message and never calls this; the onAuthStateChange subscription
    // above is what picks the user up when they return through /auth/callback.
    //
    // Unlike the main app there is no /profile-setup bounce here — the wizard collects
    // what it needs itself.
    const handleAuth = async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) setUser(data.user);
    };

    if (inviteError) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow ob-centered">
                    <h1 className="ob-h1">This link isn&apos;t working</h1>
                    <p className="ob-lede" style={{ margin: '0 auto' }}>
                        It may have expired or been replaced. Email{' '}
                        <a href="mailto:hello@explorethebackyard.com">hello@explorethebackyard.com</a>{' '}
                        and we&apos;ll send you a fresh one.
                    </p>
                </div>
            </Page>
        );
    }

    if (!invite || user === undefined) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow ob-centered" aria-busy="true">
                    <div className="ob-skeleton" style={{ height: 30, width: '65%', margin: '0 auto 14px' }} />
                    <div className="ob-skeleton" style={{ height: 15, width: '85%', margin: '0 auto 8px' }} />
                    <div className="ob-skeleton" style={{ height: 44, width: 190, margin: '22px auto 0', borderRadius: 999 }} />
                    <span className="ob-hint">Loading your club…</span>
                </div>
            </Page>
        );
    }

    // The redeem response is the primary source, but GET /invite/:token already returns
    // club_id and `invite` is in hand by this point — so a redeem that comes back without
    // the field still opens the wizard rather than stranding the club.
    const claimedClubId = claim && typeof claim === 'object'
        ? (claim.club_id ?? invite.club_id ?? null)
        : null;

    if (claimedClubId) {
        return <WizardShell clubId={claimedClubId} clubName={invite.club_name} clubLogo={invite.club_image} />;
    }

    // Redeemed, but with nothing to key the wizard on. This used to mount WizardShell
    // anyway: useWizardDraft bails on a falsy clubId without clearing `loading`, so the
    // club sat on a skeleton that never resolved and never issued a request — nothing in
    // the network tab, nothing to report. Fail loudly and offer the retry instead.
    const claimError = claim && typeof claim === 'object'
        ? 'We claimed your club but couldn’t tell which page it belongs to.'
        : (typeof claim === 'string' && claim !== 'working' ? claim : null);

    if (claimError) {
        return (
            <Page clubName={invite.club_name}>
                <div className="ob-card ob-card--narrow ob-centered">
                    <h1 className="ob-h1">We couldn&apos;t open your page</h1>
                    <p className="ob-lede" style={{ margin: '0 auto 18px' }}>{claimError}</p>
                    <button className="ob-btn" onClick={redeem}>Try again</button>
                </div>
            </Page>
        );
    }

    if (claim === 'working') {
        return (
            <Page clubName={invite.club_name}>
                <div className="ob-card ob-card--narrow ob-centered">
                    <p className="ob-lede" style={{ margin: 0 }}>Opening your page…</p>
                </div>
            </Page>
        );
    }

    // The "check your email" screen that used to live here was unreachable: it was gated
    // on a mode only handleAuth could set, and handleAuth never runs when confirmation is
    // enabled. Form renders its own inline message in that case, which is the one people
    // actually see, so the duplicate is gone rather than left as dead code.
    return (
        <Page clubName={invite.club_name}>
            <div className="ob-card ob-card--narrow" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
                {invite.club_image && (
                    <img className="ob-logo-preview" src={invite.club_image} alt="" style={{ marginBottom: 16 }} />
                )}
                <p className="ob-eyebrow">Club setup</p>
                <h1 className="ob-h1">Set up {invite.club_name} on Backyard</h1>
                <p className="ob-lede">
                    You&apos;ll build the page students see when they find your club. It takes
                    about ten minutes, and you can stop and come back to this link any time.
                </p>

                <button type="button" className="ob-oauth" onClick={handleGoogleSignIn}>
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    Continue with Google
                </button>

                <div className="ob-or">or</div>

                {/* .ob-auth scopes the layout overrides in onboard.css. form.css sizes
                    its fields in viewport units for a full-screen modal, which overflows
                    this card by several hundred pixels on a tall display. */}
                <div className="ob-auth">
                <Form
                    isSignUp={mode === 'signup'}
                    onAuth={handleAuth}
                    toggleAuthButton={
                        <button
                            type="button"
                            className="ob-link"
                            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                        >
                            {mode === 'signup'
                                ? 'Already have an account? Sign in'
                                : 'Need an account? Sign up'}
                        </button>
                    }
                />
                </div>
            </div>
        </Page>
    );
}

function Page({ children, clubName }) {
    return (
        <div className="ob-page">
            <header className="ob-brand">
                <h1 className="ob-wordmark">
                    <img src={wordmark} alt="Backyard" />
                </h1>
                {clubName && <span className="ob-club-tag">{clubName}</span>}
            </header>
            {children}
        </div>
    );
}
