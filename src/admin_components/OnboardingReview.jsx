import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import DraftPreview from './DraftPreview';
import ClubLinkTable from './ClubLinkTable';
import { normalizeUrl } from '../../shared/clubPageValidation.js';

/**
 * Review queue for club pages submitted through the onboarding wizard.
 *
 * Approving used to mean running curl with a hand-extracted JWT, which is fine for
 * whoever wrote the endpoints and a wall for everyone else. Outreach is not their job,
 * and the thing they will do dozens of times cannot require a terminal.
 *
 * Reviewing opens the page full screen, the way a student sees it. A preview in a side
 * panel answers "did the fields save"; this has to answer "is this good enough to
 * publish", and that is a judgement about the whole page at the size it will be read.
 */
const s = {
    row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    key: { color: '#555', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' },
    pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '2px 0 12px', fontSize: 13 },
    btn: { padding: '6px 14px', fontFamily: 'monospace', cursor: 'pointer' },
    input: { padding: '4px 6px', fontFamily: 'monospace', width: 300 },
    err: { color: 'red', marginTop: 8 },
    ok: { color: 'green', marginTop: 8 },
    muted: { color: '#555', fontSize: 13 },

    // Above the nav bar, which sits high on the main app. A reviewer should be looking at
    // the club page and nothing else.
    overlay: {
        position: 'fixed', inset: 0, zIndex: 4000,
        background: '#fff', display: 'flex', flexDirection: 'column',
    },
    // Sits above the worksheet, since review opens from inside it and the worksheet has
    // to stay put underneath rather than closing.
    overlayTop: { zIndex: 4100 },
    sheetBody: {
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: '12px 16px 16px',
    },
    openBtn: {
        padding: '10px 18px', fontFamily: 'monospace', fontSize: 14, cursor: 'pointer',
        border: '1px solid #999', borderRadius: 6, background: '#f4f1ea',
    },
    bar: {
        flex: 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', borderBottom: '1px solid #ddd', background: '#fafafa',
        fontFamily: 'monospace',
    },
    // Only this scrolls, so the actions stay reachable however long the page runs.
    body: { flex: 1, overflowY: 'auto', background: '#fff' },
    fields: { padding: 20, maxWidth: 760, fontFamily: 'monospace' },
    editIn: { width: '100%', padding: '6px 8px', fontFamily: 'monospace', fontSize: 13 },
    editArea: { width: '100%', padding: '6px 8px', fontFamily: 'monospace', fontSize: 13, minHeight: 70 },
    editing: { background: '#fffdf3', border: '1px solid #e8dfae', borderRadius: 6, padding: 14 },
    spacer: { flex: 1 },

    // z-index clears the worksheet (4000) and the review sheet (4100), so a confirmation
    // is legible whichever layer the reviewer is on.
    toast: {
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 4200, margin: 0, padding: '9px 18px', borderRadius: 6,
        fontFamily: 'monospace', fontSize: 13, border: '1px solid',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    },
};

s.toastOk = { ...s.toast, color: '#1a6b1a', background: '#f2fbf2', borderColor: '#b8dcb8' };
s.toastErr = { ...s.toast, color: '#a11', background: '#fff4f4', borderColor: '#e2b6b6' };

export default function OnboardingReview() {
    const [record, setRecord] = useState(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [view, setView] = useState('preview');
    // Draft being edited in place. Null until the reviewer starts, so opening a
    // submission never risks writing anything.
    const [edit, setEdit] = useState(null);
    const [saving, setSaving] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    // Bumped after every successful review action to make the worksheet re-read statuses.
    const [reviewedAt, setReviewedAt] = useState(0);

    const open = useCallback(async (id) => {
        setError(null); setMessage(null); setRecord(null); setView('preview');
        try {
            setRecord(await apiFetch(`/admin/onboarding/${id}`));
        } catch (e) {
            setError(e.message);
        }
    }, []);

    const close = useCallback(() => { setRecord(null); setNote(''); setEdit(null); }, []);

    // Editing works on a copy. Nothing reaches the server until Save, so abandoning an
    // edit leaves what the club submitted untouched.
    const startEdit = () => setEdit(structuredClone(record.draft ?? {}));

    const editModule = (type, patch) => setEdit((d) => {
        const modules = [...(d.modules ?? [])];
        const i = modules.findIndex((m) => m.type === type);
        if (i === -1) return d;
        modules[i] = { ...modules[i], data: { ...modules[i].data, ...patch } };
        return { ...d, modules };
    });

    const saveEdit = async () => {
        setSaving(true); setError(null); setMessage(null);
        try {
            const updated = await apiFetch(`/admin/onboarding/${record.club_id}/draft`, {
                method: 'PUT',
                body: { modules: edit.modules, details: edit.details, events: edit.events, interests: edit.interests },
            });
            setRecord((r) => ({ ...r, draft: updated.draft }));
            setEdit(null);
            setMessage('Saved.');
        } catch (e) {
            setError(e.body?.errors ? `${e.message}: ${JSON.stringify(e.body.errors)}` : e.message);
        } finally {
            setSaving(false);
        }
    };

    // Escape closes, and the page behind must not scroll while the overlay is up.
    useEffect(() => {
        if (!record && !sheetOpen) return;
        // Closes whichever layer is on top, so Escape from a review returns to the
        // worksheet rather than dismissing both.
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (record) close(); else setSheetOpen(false);
        };
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [record, sheetOpen, close]);

    const act = async (path, body, done) => {
        setBusy(true); setError(null); setMessage(null);
        const id = record.club_id;
        try {
            await apiFetch(`/admin/onboarding/${id}/${path}`, { method: 'POST', body });
            setMessage(done);
            // The worksheet underneath reads statuses once on mount. Without this the row
            // keeps showing pending_review after a successful approve or send-back, which
            // reads as the action having done nothing.
            setReviewedAt(Date.now());
            close();
        } catch (e) {
            // The endpoints return the specific validation failures, which is what lets a
            // reviewer tell the club what to fix instead of guessing.
            setError(e.body?.errors ? `${e.message}: ${JSON.stringify(e.body.errors)}` : e.message);
        } finally {
            setBusy(false);
        }
    };

    const draft = record?.draft ?? {};
    const byType = (type) => (draft.modules ?? []).find((m) => m.type === type)?.data ?? {};
    const basic = byType('basic_info');
    const join = byType('join');
    const faqs = byType('faqs').faqs ?? [];
    const people = byType('member_roster').members ?? [];
    const events = draft.events ?? [];
    const reviewable = record?.status === 'pending_review';

    // Inline styles cannot express :disabled, and s.btn sets cursor:pointer flat — so a
    // disabled button here still followed the mouse like a live one. Compose the state in
    // explicitly, or the only signal that a click did nothing is that nothing happened.
    const btnStyle = (isDisabled) =>
        (isDisabled ? { ...s.btn, cursor: 'not-allowed', opacity: 0.45 } : s.btn);

    const editByType = (type) => (edit?.modules ?? []).find((m) => m.type === type)?.data ?? {};
    const editBasic = editByType('basic_info');
    const editJoin = editByType('join');
    const editFaqs = editByType('faqs').faqs ?? [];

    return (
        <div>
            <h2>Club onboarding</h2>

            <p style={s.muted}>
                Every club, its claim link, and where it has got to.
            </p>
            <button style={s.openBtn} onClick={() => setSheetOpen(true)}>
                Open club worksheet
            </button>

            {/* Fixed, and above both overlays. These used to render in normal flow on the
                base page — which the worksheet overlay (opaque, inset:0, z-4000) covers
                completely. A reviewer working inside the worksheet saw the review sheet
                close and nothing else, with the action having actually succeeded. Only
                shown while the review sheet is closed; it renders its own errors inline. */}
            {!record && (error || message) && (
                <p style={error ? s.toastErr : s.toastOk}>{error || message}</p>
            )}

            {sheetOpen && (
                <div style={s.overlay} role="dialog" aria-modal="true" aria-label="Club worksheet">
                    <div style={s.bar}>
                        <button style={s.btn} onClick={() => setSheetOpen(false)}>← Back</button>
                        <strong>Club worksheet</strong>
                        <span style={s.muted}>Generate links, track progress, review submissions</span>
                    </div>
                    <div style={s.sheetBody}>
                        <ClubLinkTable onReview={open} reloadKey={reviewedAt} />
                    </div>
                </div>
            )}

            {record && (
                <div style={{ ...s.overlay, ...s.overlayTop }} role="dialog" aria-modal="true" aria-label="Club page preview">
                    <div style={s.bar}>
                        <button style={s.btn} onClick={close}>← Back</button>
                        <strong>{basic.club_name || record.demo_club_data?.club_name || record.club_id}</strong>
                        <span style={s.muted}>{record.status}</span>

                        <button
                            style={{ ...s.btn, fontWeight: view === 'preview' ? 700 : 400 }}
                            onClick={() => setView('preview')}
                        >
                            Page
                        </button>
                        <button
                            style={{ ...s.btn, fontWeight: view === 'fields' ? 700 : 400 }}
                            onClick={() => setView('fields')}
                        >
                            Fields
                        </button>

                        {edit ? (
                            <>
                                <button style={s.btn} disabled={saving} onClick={saveEdit}>
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                                <button style={s.btn} disabled={saving} onClick={() => setEdit(null)}>
                                    Discard
                                </button>
                            </>
                        ) : (
                            <button style={s.btn} onClick={startEdit}>Edit</button>
                        )}

                        <span style={s.spacer} />

                        <input
                            style={s.input}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What needs changing?"
                        />
                        {/* Not disabled on an empty note. It used to be, and that was the one
                            precondition with nothing to show for it: !reviewable prints the
                            yellow bar below, but a missing note printed nothing, so the button
                            sat there looking live (s.btn forces cursor:pointer) and swallowed
                            every click. Check on click and say so instead — the server returns
                            the same rule, this just gets to it without a round trip. */}
                        <button
                            style={btnStyle(busy || !reviewable)}
                            disabled={busy || !reviewable}
                            onClick={() => {
                                if (!note.trim()) {
                                    setMessage(null);
                                    setError('Add a note so the club knows what to fix.');
                                    return;
                                }
                                act('request-changes', { note: note.trim() }, 'Sent back to the club.');
                            }}
                        >
                            Request changes
                        </button>
                        <button
                            style={btnStyle(busy || !reviewable)}
                            disabled={busy || !reviewable}
                            onClick={() => act('approve', {}, 'Approved and published.')}
                        >
                            Approve
                        </button>
                        <button
                            style={btnStyle(busy)}
                            disabled={busy}
                            onClick={() => act('unclaim', {}, 'Unclaimed. The link is revoked; issue a new one.')}
                        >
                            Unclaim
                        </button>
                    </div>

                    {!reviewable && (
                        <p style={{ ...s.muted, margin: 0, padding: '6px 16px', background: '#fff8e1' }}>
                            Approve and request changes only apply to a page awaiting review.
                            This one is {record.status}.
                        </p>
                    )}
                    {error && <p style={{ ...s.err, margin: 0, padding: '6px 16px' }}>{error}</p>}

                    <div style={s.body}>
                        {view === 'preview' ? (
                            <>
                                <DraftPreview record={record} />
                                {events.length > 0 && (
                                    <div style={s.fields}>
                                        <div style={s.key}>Events to be created ({events.length})</div>
                                        <p style={s.pre}>
                                            {events.map((e) => `${e.event_name} · ${e.start_time} · ${e.where || 'no location'}`).join('\n')}
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={edit ? { ...s.fields, ...s.editing } : s.fields}>
                                {edit && (
                                    <p style={{ ...s.muted, marginTop: 0 }}>
                                        Editing the club&apos;s submission. Nothing is saved until you
                                        press Save changes.
                                    </p>
                                )}

                                <div style={s.key}>Name</div>
                                {edit ? (
                                    <input
                                        style={s.editIn}
                                        value={editBasic.club_name ?? ''}
                                        onChange={(e) => editModule('basic_info', { club_name: e.target.value })}
                                    />
                                ) : <p style={s.pre}>{basic.club_name || '(empty)'}</p>}

                                <div style={{ ...s.key, marginTop: 12 }}>Description</div>
                                {edit ? (
                                    <textarea
                                        style={s.editArea}
                                        value={editBasic.description ?? ''}
                                        onChange={(e) => editModule('basic_info', { description: e.target.value })}
                                    />
                                ) : <p style={s.pre}>{basic.description || '(empty)'}</p>}

                                <div style={{ ...s.key, marginTop: 12 }}>Links</div>
                                {edit ? (
                                    <>
                                        {(editBasic.links ?? []).map((l, i) => (
                                            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                                <input
                                                    style={{ ...s.editIn, flex: '0 0 130px' }}
                                                    value={l.name ?? ''}
                                                    placeholder="Label"
                                                    onChange={(e) => editModule('basic_info', {
                                                        links: editBasic.links.map((x, j) => j === i ? { ...x, name: e.target.value } : x),
                                                    })}
                                                />
                                                <input
                                                    style={s.editIn}
                                                    value={l.url ?? ''}
                                                    placeholder="instagram.com/theirclub"
                                                    onChange={(e) => editModule('basic_info', {
                                                        links: editBasic.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x),
                                                    })}
                                                    // Same tidy-on-blur the wizard does, so a
                                                    // reviewer typing a bare domain does not hit
                                                    // the validation error the club just hit.
                                                    onBlur={(e) => {
                                                        const tidy = normalizeUrl(e.target.value);
                                                        if (tidy && tidy !== l.url) {
                                                            editModule('basic_info', {
                                                                links: editBasic.links.map((x, j) => j === i ? { ...x, url: tidy } : x),
                                                            });
                                                        }
                                                    }}
                                                />
                                                <button
                                                    style={s.btn}
                                                    onClick={() => editModule('basic_info', {
                                                        links: editBasic.links.filter((_, j) => j !== i),
                                                    })}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            style={s.btn}
                                            onClick={() => editModule('basic_info', {
                                                links: [...(editBasic.links ?? []), { name: '', url: '', enabled: true }],
                                            })}
                                        >
                                            + Add link
                                        </button>
                                    </>
                                ) : (
                                    <p style={s.pre}>
                                        {(basic.links ?? []).length
                                            ? (basic.links ?? []).map((l) => `${l.name || '(no label)'}: ${l.url}`).join('\n')
                                            : '(none)'}
                                    </p>
                                )}

                                <div style={{ ...s.key, marginTop: 12 }}>Joining</div>
                                {edit ? (
                                    (editJoin.tabs ?? []).map((tab, i) => (
                                        <div key={i} style={{ marginBottom: 10 }}>
                                            <input
                                                style={s.editIn}
                                                value={tab.title ?? ''}
                                                placeholder="Heading"
                                                onChange={(e) => editModule('join', {
                                                    tabs: editJoin.tabs.map((x, j) => j === i ? { ...x, title: e.target.value } : x),
                                                })}
                                            />
                                            <textarea
                                                style={s.editArea}
                                                value={tab.body ?? ''}
                                                placeholder="Details"
                                                onChange={(e) => editModule('join', {
                                                    tabs: editJoin.tabs.map((x, j) => j === i ? { ...x, body: e.target.value } : x),
                                                })}
                                            />
                                        </div>
                                    ))
                                ) : (
                                    <p style={s.pre}>
                                        {(join.tabs ?? []).map((x) => `${x.title}: ${x.body}`).join('\n') || '(none)'}
                                    </p>
                                )}

                                <div style={{ ...s.key, marginTop: 12 }}>FAQs</div>
                                {edit ? (
                                    (editFaqs).map((f, i) => (
                                        <div key={i} style={{ marginBottom: 10 }}>
                                            <input
                                                style={s.editIn}
                                                value={f.q ?? ''}
                                                placeholder="Question"
                                                onChange={(e) => editModule('faqs', {
                                                    faqs: editFaqs.map((x, j) => j === i ? { ...x, q: e.target.value } : x),
                                                })}
                                            />
                                            <textarea
                                                style={s.editArea}
                                                value={f.a ?? ''}
                                                placeholder="Answer"
                                                onChange={(e) => editModule('faqs', {
                                                    faqs: editFaqs.map((x, j) => j === i ? { ...x, a: e.target.value } : x),
                                                })}
                                            />
                                        </div>
                                    ))
                                ) : (
                                    <p style={s.pre}>{faqs.map((f) => `${f.q} / ${f.a}`).join('\n') || '(none)'}</p>
                                )}

                                <div style={{ ...s.key, marginTop: 12 }}>Logo</div>
                                <p style={s.pre}>
                                    {basic.logo_url
                                        ? <img src={basic.logo_url} alt="" style={{ height: 64, borderRadius: 6 }} />
                                        : '(none)'}
                                </p>

                                <div style={s.key}>Category and subcategories</div>
                                <p style={s.pre}>
                                    {draft.interests?.category_id
                                        ? `${draft.interests.category_id} · ${(draft.interests.subcategories ?? []).map((x) => x.name).join(', ') || '(none)'}`
                                        : '(not set)'}
                                </p>

                                <div style={s.key}>Details</div>
                                <p style={s.pre}>{JSON.stringify(draft.details ?? {}, null, 1)}</p>

                                <div style={s.key}>Joining ({(join.tabs ?? []).length} section(s))</div>
                                <p style={s.pre}>
                                    {(join.tabs ?? []).map((t) => `${t.title}: ${t.body}`).join('\n') || '(none)'}
                                </p>

                                <div style={s.key}>FAQs ({faqs.length})</div>
                                <p style={s.pre}>{faqs.map((f) => `${f.q} / ${f.a}`).join('\n') || '(none)'}</p>

                                <div style={s.key}>People ({people.length})</div>
                                <p style={s.pre}>
                                    {people.map((m) => `${m.name}${m.category ? ` (${m.category})` : ''}`).join('\n') || '(none)'}
                                </p>

                                <div style={s.key}>Events ({events.length})</div>
                                <p style={s.pre}>
                                    {events.map((e) => `${e.event_name} · ${e.start_time} · ${e.where || 'no location'}`).join('\n') || '(none)'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
