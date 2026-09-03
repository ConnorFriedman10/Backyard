import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

const AUTOSAVE_MS = 1200;

/**
 * Draft state for the wizard, autosaved to club_onboarding.draft.
 *
 * Clubs abandon halfway — someone opens the link between classes and comes back that
 * evening — so every keystroke has to be recoverable. Saving is debounced rather than
 * per-step so a half-finished step survives a closed tab too.
 */
export function useWizardDraft(clubId) {
    const [draft, setDraft] = useState({ modules: [], details: {}, events: [], interests: {} });
    const [status, setStatus] = useState('unclaimed');
    const [reviewNote, setReviewNote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
    const [error, setError] = useState(null);

    const timer = useRef(null);
    const pending = useRef(null);
    // Guards against a slow save landing after the component unmounts.
    const alive = useRef(true);

    useEffect(() => () => {
        alive.current = false;
        if (timer.current) clearTimeout(timer.current);
    }, []);

    useEffect(() => {
        // Returning here without clearing `loading` left WizardShell on its skeleton
        // permanently: no error, no timeout, and no request in the network tab, which is
        // the worst shape a bug report can take. ClaimGate now refuses to mount us
        // without a club id, so this is a backstop — but it has to be a visible one.
        if (!clubId) {
            setError('We couldn’t work out which club this link is for. Try opening it again.');
            setLoading(false);
            return;
        }
        let cancelled = false;

        apiFetch(`/clubs/${clubId}/onboarding`)
            .then((row) => {
                if (cancelled) return;
                setDraft({
                    modules: row?.draft?.modules ?? [],
                    details: row?.draft?.details ?? {},
                    events: row?.draft?.events ?? [],
                    interests: row?.draft?.interests ?? {},
                });
                setStatus(row?.status ?? 'unclaimed');
                setReviewNote(row?.review_note ?? null);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err.message);
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [clubId]);

    const flush = useCallback(async () => {
        if (!pending.current) return;
        // Not a silent return: saveNow() rejecting is the only thing stopping submit()
        // from sending a draft that was never written. Resolving cleanly here made an
        // unsaved draft look saved, and the wizard locks read-only after submit.
        if (!clubId) {
            const err = new Error('There’s no club to save this draft to.');
            if (alive.current) { setSaveState('error'); setError(err.message); }
            throw err;
        }
        const payload = pending.current;
        setSaveState('saving');
        try {
            await apiFetch(`/clubs/${clubId}/onboarding/draft`, { method: 'PUT', body: payload });
            // Cleared only on success. Clearing up front meant a dropped connection
            // silently discarded whatever the club had just typed.
            if (pending.current === payload) pending.current = null;
            if (alive.current) { setSaveState('saved'); setError(null); }
        } catch (err) {
            if (alive.current) { setSaveState('error'); setError(err.message); }
            // Re-arm so a transient failure retries instead of stranding the draft.
            if (alive.current && pending.current) {
                if (timer.current) clearTimeout(timer.current);
                // flush() rethrows so saveNow() can reject before a submit. A bare
                // setTimeout(flush) would therefore raise an unhandled rejection on
                // every retry; the failure is already surfaced through saveState.
                timer.current = setTimeout(() => { flush().catch(() => {}); }, AUTOSAVE_MS * 4);
            }
            throw err;
        }
    }, [clubId]);

    const queueSave = useCallback((payload) => {
        pending.current = { ...(pending.current ?? {}), ...payload };
        if (timer.current) clearTimeout(timer.current);
        // Same .catch() the retry path needs, and for the same reason: flush() rethrows
        // so saveNow() can reject before a submit, which makes a bare setTimeout(flush)
        // an unhandled rejection on every failed autosave. Failure is already visible
        // through saveState.
        timer.current = setTimeout(() => { flush().catch(() => {}); }, AUTOSAVE_MS);
    }, [flush]);

    /**
     * Replace one module's data, creating the module if the draft has never held it.
     * `data` may be an updater function, which receives the CURRENT data — required for
     * anything resolving asynchronously (the logo upload), where a value captured at
     * render would overwrite whatever was typed while the request was in flight.
     */
    const setModule = useCallback((type, data) => {
        setDraft((prev) => {
            const modules = [...(prev.modules ?? [])];
            const i = modules.findIndex((m) => m.type === type);
            const current = i === -1 ? {} : (modules[i].data ?? {});
            const nextData = typeof data === 'function' ? data(current) : data;
            const next = i === -1
                ? { type, order: modules.length, isDisplayed: true, data: nextData }
                : { ...modules[i], data: nextData };
            if (i === -1) modules.push(next); else modules[i] = next;

            queueSave({ modules });
            return { ...prev, modules };
        });
    }, [queueSave]);

    // Events are rows, not page modules, so they live beside `modules` in the draft and
    // are only turned into club_events when the page is approved.
    const setEvents = useCallback((next) => {
        setDraft((prev) => {
            queueSave({ events: next });
            return { ...prev, events: next };
        });
    }, [queueSave]);

    const setInterests = useCallback((next) => {
        setDraft((prev) => {
            queueSave({ interests: next });
            return { ...prev, interests: next };
        });
    }, [queueSave]);

    const setDetails = useCallback((patch) => {
        setDraft((prev) => {
            const details = { ...(prev.details ?? {}), ...patch };
            queueSave({ details });
            return { ...prev, details };
        });
    }, [queueSave]);

    const getModule = useCallback(
        (type) => draft.modules?.find((m) => m.type === type)?.data ?? null,
        [draft.modules]
    );

    // Called before navigating between steps so a save is never left in the debounce
    // window when someone closes the tab.
    // Rejects on failure. Callers that must not proceed on a stale draft — submitting,
    // above all — need to know, rather than reading a resolved promise as success.
    const saveNow = useCallback(async () => {
        if (timer.current) clearTimeout(timer.current);
        await flush();
    }, [flush]);

    // Moving between steps should not block on a save; the retry handles it.
    const saveNowQuietly = useCallback(async () => {
        try { await saveNow(); } catch { /* surfaced through saveState */ }
    }, [saveNow]);

    return {
        draft, getModule, setModule, setDetails, setEvents, setInterests,
        status, reviewNote, loading, saveState, error, saveNow, saveNowQuietly, setStatus,
    };
}
