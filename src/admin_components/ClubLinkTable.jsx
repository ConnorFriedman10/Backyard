import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { searchClubs } from '../lib/clubSearch';

/**
 * The outreach worksheet: every club, its claim link, and where it has got to.
 *
 * Minted links are also kept in localStorage. Tokens are hashed server side, so a link
 * cannot be looked up or re-sent — refreshing this page after minting fifty of them would
 * otherwise lose all fifty, and the only recovery is rotating every one. They are already
 * written to a CSV that lives in shared storage, so this is not a new exposure, but it is
 * worth knowing they are there.
 */
const STORE_KEY = 'backyard.onboardingLinks';

const STATUS_LABEL = {
    unclaimed: 'Not started',
    claimed: 'In progress',
    pending_review: 'Needs review',
    changes_requested: 'Sent back',
    approved: 'Published',
};

const STATUS_COLOR = {
    unclaimed: '#8a8174',
    claimed: '#2e788b',
    pending_review: '#c53b3f',
    changes_requested: '#b8860b',
    approved: '#2f8f57',
};

const s = {
    // Fills the container it is dropped into, so the overlay decides the height and
    // as many rows as the screen allows are visible at once.
    wrap: { marginTop: 8, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 },
    controls: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
    search: { padding: '6px 9px', fontFamily: 'monospace', width: 240 },
    select: { padding: '6px 9px', fontFamily: 'monospace' },
    count: { color: '#555', fontSize: 13 },

    scroll: { flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #ddd', borderRadius: 6 },
    table: { borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 13 },
    // Sticky so the columns stay identified through a list of 150.
    th: {
        position: 'sticky', top: 0, zIndex: 1,
        background: '#f4f1ea', textAlign: 'left', padding: '9px 12px',
        borderBottom: '1px solid #ddd', fontSize: 12, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: '#555', whiteSpace: 'nowrap',
    },
    td: { padding: '9px 12px', borderBottom: '1px solid #eee', verticalAlign: 'middle' },
    name: { fontWeight: 600 },
    school: { color: '#888', fontSize: 12 },

    pill: {
        display: 'inline-block', padding: '2px 9px', borderRadius: 999,
        fontSize: 12, color: '#fff', whiteSpace: 'nowrap',
    },
    btn: { padding: '4px 10px', fontFamily: 'monospace', cursor: 'pointer', whiteSpace: 'nowrap' },
    link: {
        fontFamily: 'monospace', fontSize: 11, color: '#555',
        maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'inline-block', verticalAlign: 'middle',
    },
    mini: { width: 54, padding: '3px 5px', fontFamily: 'monospace' },
    err: { color: 'red', fontSize: 12 },

    // Derived from data already on screen rather than a new endpoint, so it cannot
    // disagree with the table underneath it.
    stats: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
    stat: {
        flex: '1 1 130px', padding: '10px 14px', borderRadius: 8,
        border: '1px solid #e3ddd2', background: '#faf8f4',
    },
    statN: { fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
    statL: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666', marginTop: 2 },
};

function loadStored() {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch {
        return {};
    }
}

// reloadKey: bumped by the parent after a review action. Statuses were fetched once on
// mount and never again, so approving or requesting changes left the row showing the
// status it had when the worksheet opened — the single clearest signal a reviewer has
// that their click did anything.
export default function ClubLinkTable({ onReview, reloadKey = 0 }) {
    const [clubs, setClubs] = useState(null);
    const [statuses, setStatuses] = useState({});
    const [links, setLinks] = useState(loadStored);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [minting, setMinting] = useState(null);
    const [form, setForm] = useState({ id: null, days: 30, uses: 5 });
    const [copied, setCopied] = useState(null);
    const [error, setError] = useState(null);

    const persist = (next) => {
        setLinks(next);
        try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* quota */ }
    };

    const loadStatuses = useCallback(() => {
        apiFetch('/admin/onboarding-links')
            .then((d) => {
                const map = {};
                for (const r of d.rows ?? []) map[r.club_id] = r.status;
                setStatuses(map);
            })
            .catch((e) => setError(e.message));
    }, []);

    useEffect(() => {
        apiFetch('/clubs', { auth: false })
            .then((d) => setClubs([...d].sort((a, b) => a.club_name.localeCompare(b.club_name))))
            .catch((e) => setError(e.message));
    }, []);

    // Separate from the club list above so a review action re-reads statuses without
    // re-fetching every club on the site.
    useEffect(() => { loadStatuses(); }, [loadStatuses, reloadKey]);

    const rows = useMemo(() => {
        // Search first so its ranking survives; filtering only removes.
        const matched = searchClubs(clubs ?? [], query);
        return matched.filter((c) => {
            if (filter === 'all') return true;
            if (filter === 'nolink') return !links[c.id];
            return (statuses[c.id] ?? 'unclaimed') === filter;
        });
    }, [clubs, query, filter, links, statuses]);

    const mint = async (clubId) => {
        setMinting(clubId);
        setError(null);
        try {
            const data = await apiFetch('/admin/onboarding-links', {
                method: 'POST',
                body: { club_ids: [clubId], days_valid: Number(form.days), max_uses: Number(form.uses) },
            });
            const row = data.rows?.[0];
            if (row?.url) {
                persist({
                    ...links,
                    [clubId]: { url: row.url, days: Number(form.days), uses: Number(form.uses), at: Date.now() },
                });
            } else {
                // 'existing' means a live link is already out there and, since tokens are
                // hashed, this is the one place that fact has to be said out loud.
                setError(row?.result === 'skipped_has_owner'
                    ? 'That club already has an owner, so no link was created.'
                    : 'A live link already exists for that club. Check your saved links, or rotate it.');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setMinting(null);
            setForm({ id: null, days: form.days, uses: form.uses });
        }
    };

    const copy = (clubId, url) => {
        navigator.clipboard.writeText(url);
        setCopied(clubId);
        setTimeout(() => setCopied((c) => (c === clubId ? null : c)), 1600);
    };

    if (clubs === null) return <p style={s.count}>Loading clubs…</p>;

    const counts = (clubs ?? []).reduce((acc, c) => {
        const st = statuses[c.id] ?? 'unclaimed';
        acc[st] = (acc[st] ?? 0) + 1;
        return acc;
    }, {});

    // A club_onboarding row only exists once a link has been minted for it, so the size
    // of that map is how many clubs have been contacted.
    const sent = Object.keys(statuses).length;
    const started = (counts.claimed ?? 0) + (counts.changes_requested ?? 0);

    const tiles = [
        { n: clubs.length, label: 'Clubs available', color: '#29241d' },
        { n: sent, label: 'Links sent', color: '#2e788b' },
        { n: started, label: 'In progress', color: '#b8860b' },
        { n: counts.pending_review ?? 0, label: 'Awaiting review', color: '#c53b3f' },
        { n: counts.approved ?? 0, label: 'Published', color: '#2f8f57' },
    ];

    return (
        <div style={s.wrap}>
            <div style={s.stats}>
                {tiles.map((tile) => (
                    <div key={tile.label} style={s.stat}>
                        <div style={{ ...s.statN, color: tile.color }}>{tile.n}</div>
                        <div style={s.statL}>{tile.label}</div>
                    </div>
                ))}
            </div>

            <div style={s.controls}>
                <input
                    style={s.search}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search: name, initials, part of it"
                />
                <select style={s.select} value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All clubs</option>
                    <option value="nolink">No link yet</option>
                    <option value="claimed">In progress</option>
                    <option value="pending_review">Needs review</option>
                    <option value="changes_requested">Sent back</option>
                    <option value="approved">Published</option>
                </select>
                <button style={s.btn} onClick={loadStatuses}>Refresh</button>
                <span style={s.count}>
                    {rows.length} shown · {Object.keys(links).length} link(s) saved on this device
                </span>
            </div>

            {error && <p style={s.err}>{error}</p>}

            <div style={s.scroll}>
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={s.th}>Club</th>
                            <th style={s.th}>Link</th>
                            <th style={s.th}>Status</th>
                            <th style={s.th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((c, i) => {
                            const saved = links[c.id];
                            const status = statuses[c.id] ?? 'unclaimed';
                            const asking = form.id === c.id;

                            return (
                                <tr key={c.id} style={{ background: i % 2 ? '#fbfaf8' : '#fff' }}>
                                    <td style={s.td}>
                                        <div style={s.name}>{c.club_name}</div>
                                        <div style={s.school}>{c.school}</div>
                                    </td>

                                    <td style={s.td}>
                                        {saved ? (
                                            <>
                                                <span style={s.link} title={saved.url}>{saved.url}</span>{' '}
                                                <button style={s.btn} onClick={() => copy(c.id, saved.url)}>
                                                    {copied === c.id ? 'Copied' : 'Copy'}
                                                </button>
                                                <div style={s.school}>
                                                    {saved.days} days · {saved.uses} uses
                                                </div>
                                            </>
                                        ) : asking ? (
                                            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                                <label style={s.school}>days</label>
                                                <input
                                                    style={s.mini} type="number" min={1} max={90}
                                                    value={form.days}
                                                    onChange={(e) => setForm({ ...form, days: e.target.value })}
                                                />
                                                <label style={s.school}>uses</label>
                                                <input
                                                    style={s.mini} type="number" min={1} max={25}
                                                    value={form.uses}
                                                    onChange={(e) => setForm({ ...form, uses: e.target.value })}
                                                />
                                                <button
                                                    style={s.btn}
                                                    disabled={minting === c.id}
                                                    onClick={() => mint(c.id)}
                                                >
                                                    {minting === c.id ? '…' : 'Create'}
                                                </button>
                                                <button style={s.btn} onClick={() => setForm({ ...form, id: null })}>
                                                    Cancel
                                                </button>
                                            </span>
                                        ) : (
                                            <button style={s.btn} onClick={() => setForm({ ...form, id: c.id })}>
                                                Generate link
                                            </button>
                                        )}
                                    </td>

                                    <td style={s.td}>
                                        <span style={{ ...s.pill, background: STATUS_COLOR[status] }}>
                                            {STATUS_LABEL[status] ?? status}
                                        </span>
                                    </td>

                                    <td style={s.td}>
                                        <button
                                            style={s.btn}
                                            onClick={() => onReview(c.id)}
                                            disabled={status === 'unclaimed'}
                                            title={status === 'unclaimed' ? 'Nothing submitted yet' : 'Open the club page'}
                                        >
                                            Review
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
