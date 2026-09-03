import { useState } from 'react';
import { useWizardDraft } from './useWizardDraft.js';
import { apiFetch } from '../lib/api';
import Basics from './steps/Basics.jsx';
import Joining from './steps/Joining.jsx';
import Faqs from './steps/Faqs.jsx';
import Stats from './steps/Stats.jsx';
import Events from './steps/Events.jsx';
import Review from './steps/Review.jsx';
import wordmark from '../assets/BackyardOnBoardHeader.png';

// Events sits right after Basics (rather than near the end) so it gets more traction —
// upcoming events are one of the more valuable things a club can list, and step order
// tends to track completion rate.
const STEPS = [
    { key: 'basics', name: 'Basics', Component: Basics },
    { key: 'events', name: 'Events', Component: Events },
    { key: 'joining', name: 'Joining', Component: Joining },
    { key: 'faqs', name: 'Questions', Component: Faqs },
    { key: 'stats', name: 'Numbers', Component: Stats },
    { key: 'review', name: 'Review', Component: Review },
];

export default function WizardShell({ clubId, clubName, clubLogo }) {
    console.log("Basics Club id: " + clubId);
    const wizard = useWizardDraft(clubId);
    const [index, setIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const isSubmitted = wizard.status === 'approved';

    if (wizard.loading) {
        return (
            <Page clubName={clubName}>
                <div className="ob-card ob-centered" aria-busy="true">
                    <div className="ob-skeleton" style={{ height: 26, width: '45%', margin: '0 auto 12px' }} />
                    <div className="ob-skeleton" style={{ height: 15, width: '70%', margin: '0 auto' }} />
                </div>
            </Page>
        );
    }

    if (isSubmitted) return <Submitted clubName={clubName} status={wizard.status} />;

    const step = STEPS[index];
    const { Component } = step;

    const go = async (next) => {
        await wizard.saveNowQuietly();
        setIndex(next);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const submit = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            // Must not swallow this: submitting on a draft whose last save failed would
            // send the reviewer a version the club never saw, and the wizard locks
            // read-only afterwards so they could not fix it.
            await wizard.saveNow();
            await apiFetch(`/clubs/${clubId}/onboarding/submit`, { method: 'POST' });
            wizard.setStatus('pending_review');
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Page clubName={clubName} clubLogo={clubLogo}>
            <div className="ob-card">
                <div className="ob-body">
                    <nav className="ob-rail" aria-label="Setup steps">
                        <p className="ob-rail-title">Your page</p>
                        <ul className="ob-steps">
                            {STEPS.map((s, i) => (
                                <li key={s.key}>
                                    <button
                                        type="button"
                                        className={`ob-step${i < index ? ' is-done' : ''}`}
                                        aria-current={i === index ? 'step' : undefined}
                                        onClick={() => go(i)}
                                    >
                                        <span className="ob-step-num" aria-hidden="true">
                                            {i < index ? '✓' : i + 1}
                                        </span>
                                        <span className="ob-step-name">{s.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="ob-saved" role="status">
                            {wizard.saveState === 'saving' && 'Saving…'}
                            {wizard.saveState === 'saved' && 'Saved. You can close this and come back.'}
                            {wizard.saveState === 'error' && 'Couldn’t save. Check your connection.'}
                        </p>
                    </nav>

                    <div className="ob-main">
                        {wizard.status === 'pending_review' && (
                            <div className="ob-note">
                                <strong>Your page is under review.</strong>
                                <p style={{ margin: '6px 0 0' }}>We'll email you once it's live. You can keep editing and resubmit if you'd like to make changes before we review.</p>
                            </div>
                        )}
                        {wizard.status === 'changes_requested' && wizard.reviewNote && (
                            <div className="ob-note">
                                <strong>A note from the Backyard team:</strong>
                                <p style={{ margin: '6px 0 0' }}>{wizard.reviewNote}</p>
                            </div>
                        )}

                        {wizard.error && <div className="ob-error">{wizard.error}</div>}
                        {submitError && <div className="ob-error">{submitError}</div>}

                        <p className="ob-eyebrow">
                            Step {index + 1} of {STEPS.length}
                        </p>
                        <p className="ob-hint" style={{ margin: '-4px 0 16px' }}>
                            Nothing here is final — you can edit your page on our real site later.
                        </p>
                        <Component wizard={wizard} clubId={clubId} clubName={clubName} />

                        <div className="ob-actions">
                            {index > 0 && (
                                <button type="button" className="ob-ghost" onClick={() => go(index - 1)}>
                                    Back
                                </button>
                            )}
                            <span className="ob-spacer" />
                            {index < STEPS.length - 1 ? (
                                <button type="button" className="ob-btn" onClick={() => go(index + 1)}>
                                    Continue
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="ob-btn ob-btn--sage"
                                    onClick={submit}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Sending…' : 'Send for review'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Page>
    );
}

function Submitted({ clubName, status }) {
    const approved = status === 'approved';
    return (
        <Page clubName={clubName}>
            <div className="ob-card ob-centered">
                <div className="ob-stamp">{approved ? 'Published' : 'Received'}</div>
                <h1 className="ob-h1" style={{ marginTop: 24 }}>
                    {approved ? `${clubName} is live` : 'Thanks, we have your page'}
                </h1>
                <p className="ob-lede" style={{ margin: '0 auto' }}>
                    {approved
                        ? 'Students can find your club on Backyard. Sign in any time to keep it up to date.'
                        : `We read every page before it goes live. You'll hear from us within a couple of days, and we'll email you if anything needs a second look.`}
                </p>
            </div>
        </Page>
    );
}

function Page({ children, clubName, clubLogo }) {
    return (
        <div className="ob-page">
            <header className="ob-brand">
                <h1 className="ob-wordmark">
                    <img src={wordmark} alt="Backyard" />
                </h1>
                <span className="ob-club-tag">
                    {clubLogo && (
                        <img
                            src={clubLogo}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: 5, verticalAlign: -5, marginRight: 8 }}
                        />
                    )}
                    {clubName}
                </span>
            </header>
            {children}
        </div>
    );
}
