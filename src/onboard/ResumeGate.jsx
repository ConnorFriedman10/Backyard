import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import WizardShell from './WizardShell.jsx';
import Form from '../login_components/form';
import wordmark from '../assets/BackyardOnBoardHeader.png';

/**
 * Token-free entry to the wizard, for a club that already claimed their page.
 *
 * ClaimGate answers "does this link grant you a role"; this answers "which page are you
 * already allowed to edit". The two look similar and are not the same question — which is
 * the whole point. The claim token grants a role once and then plays no further part in
 * authorization, but /claim/:token was the only way in, so the token was doubling as a
 * permanent address. Two rules then collided:
 *
 *   - onboarding links expire (30 days) and expiry is checked before the prior-redeemer
 *     bypass in consume_invite_link, so it locks out the very person who claimed;
 *   - minting a replacement is refused for any club that already has an owner, which by
 *     then is exactly this club.
 *
 * So a club could be fully authorized and still have no route back to their own draft,
 * and the only tool that unblocked it was Unclaim — which strips the role you are trying
 * to restore. This route is the way back, and it is bound to the signed-in identity
 * rather than to a secret, so it cannot be forwarded to hand someone else the club.
 */
export default function ResumeGate() {
    const [user, setUser] = useState(undefined); // undefined = still resolving
    const [clubs, setClubs] = useState(null);    // null = not fetched | [] = none | [...]
    const [error, setError] = useState(null);
    const [picked, setPicked] = useState(null);
    const [mode, setMode] = useState('login');   // returning clubs, so sign-in first

    // Same pair as ClaimGate: getUser resolves an existing session, and the subscription
    // catches one appearing after a redirect back through /auth/callback.
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) setUser(session.user);
        });
        return () => sub?.subscription?.unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        apiFetch('/me/onboarding')
            .then((d) => setClubs(d.clubs ?? []))
            .catch((e) => setError(e.message));
    }, [user]);

    const handleGoogleSignIn = async () => {
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (oauthError) setError(oauthError.message);
    };

    const handleAuth = async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) setUser(data.user);
    };

    if (user === undefined) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow ob-centered" aria-busy="true">
                    <div className="ob-skeleton" style={{ height: 26, width: '55%', margin: '0 auto 12px' }} />
                    <div className="ob-skeleton" style={{ height: 15, width: '75%', margin: '0 auto' }} />
                </div>
            </Page>
        );
    }

    if (user === null) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
                    <p className="ob-eyebrow">Club setup</p>
                    <h1 className="ob-h1">Pick up where you left off</h1>
                    <p className="ob-lede">
                        Sign in with the account you used to claim your club and we&apos;ll take
                        you straight back to your page.
                    </p>

                    <button type="button" className="ob-oauth" onClick={handleGoogleSignIn}>
                        Continue with Google
                    </button>

                    <div className="ob-or">or</div>

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

    if (error) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow ob-centered">
                    <h1 className="ob-h1">We couldn&apos;t load your club</h1>
                    <p className="ob-lede" style={{ margin: '0 auto 18px' }}>{error}</p>
                    <button className="ob-btn" onClick={() => { setError(null); setClubs(null); }}>
                        Try again
                    </button>
                </div>
            </Page>
        );
    }

    if (clubs === null) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow ob-centered" aria-busy="true">
                    <p className="ob-lede" style={{ margin: 0 }}>Finding your page…</p>
                </div>
            </Page>
        );
    }

    // Signed in, but this account moderates nothing in setup. Almost always the wrong
    // account — a second Google identity, or a personal address rather than the one the
    // claim link went to. Say that, because "no clubs" on its own reads as data loss.
    if (clubs.length === 0) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow ob-centered">
                    <h1 className="ob-h1">Nothing to edit on this account</h1>
                    <p className="ob-lede" style={{ margin: '0 auto 18px' }}>
                        <strong>{user.email}</strong> isn&apos;t set up to edit a club page. If you
                        claimed your club with a different email, sign in with that one. If your
                        page is already live, edit it from your club page on Backyard instead.
                    </p>
                    <button
                        className="ob-btn"
                        onClick={async () => { await supabase.auth.signOut(); setUser(null); setClubs(null); }}
                    >
                        Sign in with another account
                    </button>
                </div>
            </Page>
        );
    }

    const club = picked ?? (clubs.length === 1 ? clubs[0] : null);

    if (!club) {
        return (
            <Page>
                <div className="ob-card ob-card--narrow">
                    <h1 className="ob-h1">Which club?</h1>
                    <p className="ob-lede">You can edit more than one page on this account.</p>
                    <ul className="ob-steps" style={{ marginTop: 18 }}>
                        {clubs.map((c) => (
                            <li key={c.club_id}>
                                <button type="button" className="ob-step" onClick={() => setPicked(c)}>
                                    {c.club_image && (
                                        <img
                                            src={c.club_image}
                                            alt=""
                                            style={{ width: 22, height: 22, borderRadius: 5, marginRight: 10 }}
                                        />
                                    )}
                                    <span className="ob-step-name">{c.club_name || c.club_id}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </Page>
        );
    }

    return <WizardShell clubId={club.club_id} clubName={club.club_name} clubLogo={club.club_image} />;
}

function Page({ children }) {
    return (
        <div className="ob-page">
            <header className="ob-brand">
                <h1 className="ob-wordmark">
                    <img src={wordmark} alt="Backyard" />
                </h1>
            </header>
            {children}
        </div>
    );
}
