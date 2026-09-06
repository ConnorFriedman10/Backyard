import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { checkDraftReady } from '../../../shared/onboardingDraft.js';

// Last screen before submitting. Its job is to make gaps obvious, not to congratulate
// anyone — so required items that are still empty are called out in the accent colour
// rather than silently omitted.
export default function Review({ wizard }) {
    const basic = wizard.getModule('basic_info') ?? {};
    const join = wizard.getModule('join') ?? {};
    const faqs = wizard.getModule('faqs')?.faqs ?? [];
    const stats = wizard.getModule('stats')?.stats ?? [];
    const events = wizard.draft.events ?? [];
    const details = wizard.draft.details ?? {};
    const interests = wizard.draft.interests ?? {};

    const [taxonomy, setTaxonomy] = useState(null);

    useEffect(() => {
        let cancelled = false;
        apiFetch('/interests', { auth: false })
            .then((data) => { if (!cancelled) setTaxonomy(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const categoryLabel = (() => {
        if (!interests.category_id) return '';
        const cat = taxonomy?.find((c) => c.id === interests.category_id);
        const subs = (interests.subcategories ?? []).map((s) => s.name).filter(Boolean);
        const catName = cat?.name ?? (taxonomy ? '' : '…');
        return [catName, ...subs].filter(Boolean).join(' · ');
    })();

    const problems = checkDraftReady(wizard.draft);

    const rows = [
        { key: 'Name', value: basic.club_name, required: true },
        { key: 'Logo', value: basic.logo_url ? 'Uploaded' : '', required: false },
        { key: 'About', value: basic.description, required: true },
        { key: 'Category', value: categoryLabel, required: false },
        { key: 'Links', value: countLabel(basic.links, 'link'), required: false },
        { key: 'Joining', value: countLabel(join.tabs, 'section'), required: false },
        { key: 'Contact', value: details.email, required: false },
        { key: 'Questions', value: countLabel(faqs, 'question'), required: false },
        { key: 'Numbers', value: countLabel(stats, 'number'), required: false },
        { key: 'Events', value: countLabel(events, 'event'), required: false },
    ];

    return (
        <>
            <h2 className="ob-h1">Ready to send</h2>
            <p className="ob-lede">
                Here&apos;s what you&apos;ve filled in. Go back to any step to change
                anything. Nothing is final until you send it.
            </p>

            {problems.length > 0 && (
                <div className="ob-error">
                    <strong>Still needed before you can send:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                        {problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                </div>
            )}

            <ul className="ob-review-list">
                {rows.map((r) => (
                    <li className="ob-review-item" key={r.key}>
                        <span className="ob-review-key">{r.key}</span>
                        <span className={`ob-review-val${!r.value ? ' is-empty' : ''}`}>
                            {r.value || (r.required ? 'Still empty' : 'Not added')}
                        </span>
                    </li>
                ))}
            </ul>

            <p className="ob-hint">
                We read every page before it goes live. If something needs changing
                we&apos;ll send it back with a note, and your work stays saved.
            </p>
        </>
    );
}

function countLabel(list, singular, plural) {
    const n = list?.length ?? 0;
    if (n === 0) return '';
    return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}
