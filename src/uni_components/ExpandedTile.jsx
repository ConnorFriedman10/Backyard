import React, { useState, useEffect, useCallback } from "react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import ReviewPage from "../review_components/ReviewPage";
import "./ExpandedTile.css";
import ReviewList from "../review_components/ReviewList";
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import logImage from '/src/assets/logImage.png';
import BasicInfoModule from '../club_page_components/BasicInfoModule';
import LinksModule from '../club_page_components/LinksModule';
import JoinModule from '../club_page_components/JoinModule';
import StatsModule from '../club_page_components/StatsModule';
import ClubMediaModule from '../club_page_components/ClubMediaModule';
import FaqModule from '../club_page_components/FaqModule';
import MemberRosterModule from '../club_page_components/MemberRosterModule';
import { CalendarModule } from '../club_page_components/CalendarModule';
import AddEventPanel from '../club_page_components/AddEventPanel';
import ModuleAccordion from '../club_page_components/accordion';
import ClubMembersPanel from '../club_page_components/ClubMembersPanel';
import { useClubData } from '../context/useClubData';
import { useGlobalStore } from '../lib/store';
import { readClubPage, invalidateClubPage } from '../lib/clubPageCache';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import InviteLinkButton from '../club_page_components/InviteLinkButton';
import QrFlyerButton from '../club_page_components/QrFlyerButton';
import dividerLineImg from '/src/assets/border-horizontal-gray.svg';

// Validation moved to shared/clubPageValidation.js so the server enforces the same
// rules. It previously lived only here, which meant PUT /clubs/:clubId/page accepted
// anything that survived the profanity check.
import { getModuleWarnings } from '../../shared/clubPageValidation.js';


function normalizeModules(modules) {
    const normalized = (modules ?? []).map((m, i) => ({
        ...m,
        order: m.order ?? i,
        isDisplayed: m.isDisplayed !== false,
    }));
    // Older club pages saved before the Links module existed won't have one yet — give them
    // one now so Links gets its own accordion slot (title, help text, visibility checkbox).
    // It has no data of its own; it edits basic_info.data.links.
    if (normalized.length > 0 && !normalized.some((m) => m.type === 'links')) {
        normalized.push({ type: 'links', order: normalized.length, isDisplayed: true, data: {} });
    }
    return normalized;
}

function applyAccordionOrder(reorderedModules) {
    return reorderedModules.map((m, i) => ({ ...m, order: i }));
}

// Turns a /clubs/:id/page response into the editable draft. A club with no page row yet
// gets a default basic_info module seeded from its base record.
//
// Shared by the prefetch-seeded initial state and the network path below, so both produce
// an identical draft — if they diverged, a cache hit and a cache miss would render
// different pages for the same club.
function buildDraft(pageValue, club) {
    const modules = pageValue?.modules;
    if (modules?.length > 0) return normalizeModules(modules);

    return normalizeModules([
        {
            type: 'basic_info',
            order: 0,
            isDisplayed: true,
            data: {
                club_name: club?.club_name || '',
                logo_url: club?.image_url || '/raccoon_pfp.png',
                description: club?.club_description || '',
                links: [],
            },
        },
        { type: 'comments', order: 1, isDisplayed: true, data: {} },
    ]);
}


function ExpandedTile({ club, onClose, onMembershipChange }) {
    // Page data warmed by prefetchClubPage when the card was hovered. Read synchronously
    // here rather than in an effect: an effect runs after the first paint, which would
    // still show one empty frame — exactly the flicker the prefetch exists to remove.
    // null when the user opened the card without hovering first (keyboard, touch, a very
    // fast click), in which case the effect below fetches as before.
    const warmed = readClubPage(club.id);

    // Read before the state block so viewerId can seed `user` below.
    const { favoritesCache, invalidateFavoritesCache, friendsArray, userId: viewerId, refetch: refetchClubs } = useClubData();

    // determines when to begin the data requesting- animationDone triggers most data requests here
    const [animationDone, setAnimationDone] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [reviews, set_reviews] = useState(() => warmed?.reviews ?? []);
    const [isClicked, setIsClicked] = useState(false);
    // records the user itself
    // Seeded from the provider, which resolved the session on app load. This is only ever
    // truthiness-tested, and it gates the Join/Leave button — deriving it from an awaited
    // getUser() inside the fetch effect meant that button popped in after the page had
    // already drawn.
    const [user, setUser] = useState(() => (viewerId ? { id: viewerId } : null));
    // null = not a member; 'member' | 'moderator' | 'top_moderator' = current role
    // False only when the card was opened without a prior hover — keyboard, touch, or a
    // click faster than the prefetch. In that window the page renders a skeleton rather
    // than an empty shell that fills in piece by piece.
    const [hydrated, setHydrated] = useState(() => !!warmed);

    // Seeded from the prefetch. This decides between the editor header and a plain close
    // button, so resolving it after mount used to swap the header and shove everything
    // below it down — the buttons visibly jumping on open.
    const [myRole, setMyRole] = useState(() => warmed?.role ?? null);
    const [requestPending, setRequestPending] = useState(() => warmed?.joinRequestPending ?? false);
    const [joinPolicy, setJoinPolicy] = useState(() => club?.join_policy ?? 'open');
    // NOTE2SELF: THIS WILL BECOME IRRELEVANT LATER AS A LOADING STATE ACROSS ALL MODULES/INFO IS PUT IN PLACE
    const [memberLoading, setMemberLoading] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    // active tab: 'page' | 'members'
    const [activeTab, setActiveTab] = useState('page');
    // info from modules data to be displayed from db
    const [pageData, setPageData] = useState(() => warmed?.page ?? null);
    // top tags derived from reviews
    // editing state for changing modules
    const [isEditing, setIsEditing] = useState(false);
    // copy of the pageData.modules array initially so that it can record changes aggregated over all the modules
    const [draft, setDraft] = useState(() => (warmed ? buildDraft(warmed.page, club) : []));
    // determines state of saving progress from changes
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    // determines if a new logo has been uploaded- requires a new signed URL upload to the supabase storage bucket
    const [pendingLogoFile, setPendingLogoFile] = useState(null);
    // favorites heart — mirrors the behavior in ClubGrid
    const [heartAnimating, setHeartAnimating] = useState(false);
    const [favError, setFavError] = useState(null);
    // pending user-submitted FAQ questions (approved editors only) + ids to delete on Save
    const [userFaqs, setUserFaqs] = useState([]);
    const [questionDeletes, setQuestionDeletes] = useState(() => new Set());
    // club events (for the calendar module)
    const [clubEvents, setClubEvents] = useState(() => warmed?.events ?? []);
    const [clubMyRsvpSet, setClubMyRsvpSet] = useState(new Set());
    const [clubMyMaybeSet, setClubMyMaybeSet] = useState(new Set());
    const [clubFriendRsvpMap, setClubFriendRsvpMap] = useState(new Map());
    const [clubAllAttendeesMap, setClubAllAttendeesMap] = useState(new Map());
    // club members (for comments module authorized/unauthorized tabs)
    const [clubMembers, setClubMembers] = useState(() => warmed?.members ?? []);
    // pending hide/show changes for comments — keyed by reviewId, only committed on Save
    const [hideDraft, setHideDraft] = useState({});
    // club interests (category + subcategories set by the club owner)
    const [taxonomy, setTaxonomy] = useState([]);
    const [clubInterestsSaved, setClubInterestsSaved] = useState(null);
    const [clubInterestsDraft, setClubInterestsDraft] = useState(null);

    const isMember = myRole !== null;
    const isApproved = myRole === 'moderator' || myRole === 'top_moderator';
    const hasOwner = clubMembers.length > 0;
    // Deliberately narrower than isApproved: changing who can get in is an ownership
    // decision, so a plain moderator does not get the toggle.

    // The membership button used to be a straight isMember ternary. It now has to say
    // whether clicking will join outright or only ask, and offer a way back out of the
    // queue — a pending request the user cannot cancel is a dead end.
    const membershipAction = isMember
        ? { label: 'Leave Club', variant: 'leave', shadow: 'rgb(90, 20, 20)' }
        : requestPending
            ? { label: 'Requested', variant: 'pending', shadow: 'rgb(92, 68, 0)' }
            : joinPolicy === 'request'
                ? { label: 'Request to Join', variant: 'join', shadow: 'rgb(0, 45, 8)' }
                : { label: 'Join Club', variant: 'join', shadow: 'rgb(0, 45, 8)' };

    const id = club.id;

    const GlobalValue = useGlobalStore((state) => state.GlobalValue);
    const liked = favoritesCache?.has(club.id) ?? false;

    const handleHeartClick = async (e) => {
        e.stopPropagation();
        if (!GlobalValue) return;

        const newLiked = !liked;
        setHeartAnimating(true);
        setFavError(null);

        // Flip the shared cache first so the heart responds immediately, then reconcile.
        invalidateFavoritesCache(club.id, newLiked);

        try {
            if (newLiked) {
                await apiFetch('/me/favorites', { method: 'POST', body: { club_id: club.id } });
            } else {
                await apiFetch(`/me/favorites/${club.id}`, { method: 'DELETE' });
            }
        } catch (err) {
            // Roll back so the heart reflects what the server actually has, and say so —
            // this failure used to be swallowed into console.error, making a rate-limited
            // click indistinguishable from a button that does nothing.
            invalidateFavoritesCache(club.id, !newLiked);
            setFavError(err?.status === 429 ? err.message : 'Could not save that. Try again.');
            console.error(`Error ${newLiked ? 'adding' : 'removing'} favorite:`, err);
        } finally {
            setTimeout(() => setHeartAnimating(false), 250);
        }
    };

    const handleClose = useCallback(() => {
        setIsClosing(true);
        onClose();
    }, [onClose]);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === "Escape") handleClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [handleClose]);

    const handleClick = () => {
        setIsOpen(!isOpen);
        setIsClicked(true);
        setTimeout(() => setIsClicked(false), 350);
    };

    useEffect(() => {
        if (!animationDone) return;

        async function fetchAll() {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            setUser(authUser ?? null);

            // Already rendered from the prefetch cache, so the five public requests would
            // be re-fetching what is on screen. Only the auth-dependent calls are left,
            // and those cannot be prefetched — they depend on who is signed in.
            const publicFetches = warmed ? [] : [
                apiFetch(`/clubs/${id}/reviews`),
                apiFetch(`/clubs/${id}/page`, { auth: false }),
                apiFetch(`/clubs/${id}/events/upcoming`), // optional auth: sends token if logged in
                apiFetch(`/clubs/${id}/members`),
            ];
            // Taxonomy and club interests are not stored in the prefetch cache, so always fetch them.
            const interestsFetches = [
                apiFetch('/interests', { auth: false }),
                apiFetch(`/clubs/${id}/interests`, { auth: false }),
            ];
            // undefined means the prefetch never resolved it; null is a real answer
            // (signed in, not an editor) and does not need asking again.
            const roleKnown = warmed && warmed.role !== undefined;
            const authFetches = authUser && !roleKnown ? [
                apiFetch(`/clubs/${id}/is-approved`),
            ] : [];

            // Settled separately rather than as one concatenated array: publicFetches is
            // empty on a cache hit, and positional destructuring across both would then
            // slide the is-approved result into the reviews slot. Still one round trip.
            const [publicSettled, interestsSettled, authSettled] = await Promise.all([
                Promise.allSettled(publicFetches),
                Promise.allSettled(interestsFetches),
                Promise.allSettled(authFetches),
            ]);

            const [reviewsResult, pageResult, eventsResult, membersResult] = publicSettled;
            const [taxonomyResult, clubInterestsResult] = interestsSettled;
            const [approvedResult] = authSettled;

            if (reviewsResult?.status === 'fulfilled') set_reviews(reviewsResult.value);
            if (membersResult?.status === 'fulfilled') setClubMembers(membersResult.value || []);
            if (taxonomyResult?.status === 'fulfilled') setTaxonomy(taxonomyResult.value || []);
            if (clubInterestsResult?.status === 'fulfilled') {
                const ci = clubInterestsResult.value || null;
                setClubInterestsSaved(ci);
                setClubInterestsDraft(ci);
            }

            // On a cache hit the events came from the prefetch, so read them from there —
            // the RSVP lookup below needs the ids either way.
            const eventsData = warmed
                ? (warmed.events || [])
                : (eventsResult?.status === 'fulfilled' ? (eventsResult.value || []) : null);

            if (eventsData) {
                if (!warmed) setClubEvents(eventsData);
                if (eventsData.length > 0 && authUser) {
                    try {
                        const eventIds = eventsData.map((e) => e.id);
                        const rsvpData = await apiFetch(`/clubs/${id}/events/rsvps?eventIds=${eventIds.join(',')}`);

                        setClubMyRsvpSet(new Set(
                            rsvpData.filter((r) => r.user_id === authUser.id && r.status === 'going').map((r) => r.event_id)
                        ));
                        setClubMyMaybeSet(new Set(
                            rsvpData.filter((r) => r.user_id === authUser.id && r.status === 'maybe').map((r) => r.event_id)
                        ));

                        const friendIdSet = new Set((friendsArray || []).map((f) => f.id));
                        const friendProfileMap = new Map((friendsArray || []).map((f) => [f.id, f]));
                        const newFriendRsvpMap = new Map();
                        const newAllAttendeesMap = new Map();

                        for (const rsvp of rsvpData) {
                            // friend callout (going only, matches existing behaviour)
                            if (friendIdSet.has(rsvp.user_id) && rsvp.status === 'going') {
                                if (!newFriendRsvpMap.has(rsvp.event_id)) newFriendRsvpMap.set(rsvp.event_id, []);
                                newFriendRsvpMap.get(rsvp.event_id).push(friendProfileMap.get(rsvp.user_id));
                            }
                            // full attendees map for overlay
                            if (!newAllAttendeesMap.has(rsvp.event_id)) {
                                newAllAttendeesMap.set(rsvp.event_id, { going: [], maybe: [] });
                            }
                            const bucket = rsvp.status === 'maybe' ? 'maybe' : 'going';
                            newAllAttendeesMap.get(rsvp.event_id)[bucket].push({
                                user_id: rsvp.user_id,
                                profile: rsvp.profile,
                                isFriend: friendIdSet.has(rsvp.user_id),
                            });
                        }
                        // friends first within each bucket
                        for (const { going, maybe } of newAllAttendeesMap.values()) {
                            going.sort((a, b) => b.isFriend - a.isFriend);
                            maybe.sort((a, b) => b.isFriend - a.isFriend);
                        }

                        setClubFriendRsvpMap(newFriendRsvpMap);
                        setClubAllAttendeesMap(newAllAttendeesMap);
                    } catch (err) {
                        console.error('Failed to fetch club RSVPs:', err);
                    }
                }
            }
            if (pageResult?.status === 'fulfilled') {
                setPageData(pageResult.value);
                setDraft(buildDraft(pageResult.value, club));
            }
            if (approvedResult?.status === 'fulfilled') {
                setMyRole(approvedResult.value?.role ?? null);
                setRequestPending(Boolean(approvedResult.value?.joinRequestPending));
            }

            setHydrated(true);
        }

        // Marks hydrated even if fetchAll throws, so a failed load shows the (empty) page
        // rather than a skeleton that never resolves.
        fetchAll().catch((err) => {
            console.error('Failed to load club page:', err);
            setHydrated(true);
        });
    }, [id, animationDone, club]);

    // Approved editors: load the club's pending user-submitted FAQ questions.
    useEffect(() => {
        if (!isApproved) return;
        let alive = true;
        apiFetch(`/clubs/${id}/questions`)
            .then((qs) => { if (alive) setUserFaqs(qs || []); })
            .catch(() => {});
        return () => { alive = false; };
    }, [isApproved, id]);

    async function handleMembership() {
        if (!user || memberLoading) return;
        setMemberLoading(true);
        try {
            if (isMember) {
                await apiFetch(`/clubs/${club.id}/members/me`, { method: 'DELETE' });
                setMyRole(null);
                if (onMembershipChange) onMembershipChange(club.id, false);
            } else if (requestPending) {
                await apiFetch(`/clubs/${club.id}/join-requests/me`, { method: 'DELETE' });
                setRequestPending(false);
            } else {
                const result = await apiFetch(`/clubs/${club.id}/members/me`, { method: 'POST' });
                // A request-to-join club answers with a status instead of a role — the
                // user is queued, not admitted, so membership must not flip yet.
                if (result?.status === 'requested') {
                    setRequestPending(true);
                } else {
                    setMyRole(result?.role ?? 'member');
                    if (onMembershipChange) onMembershipChange(club.id, true);
                }
            }
        } catch (err) {
            console.error('Error updating membership:', err);
        }
        setMemberLoading(false);
    }

    async function handleJoinPolicyToggle() {
        const next = joinPolicy === 'request' ? 'open' : 'request';
        setJoinPolicy(next); // optimistic; reverted below if the call fails
        try {
            await apiFetch(`/clubs/${club.id}/join-policy`, {
                method: 'PATCH',
                body: { join_policy: next },
            });
        } catch (err) {
            console.error('Error updating join policy:', err);
            setJoinPolicy(joinPolicy);
        }
    }

    const handleModuleChange = useCallback((type, updatedData) => {
        setDraft(prev => prev.map(m =>
            m.type === type ? { ...m, data: updatedData } : m
        ));
    }, []);

    const handleModuleReorder = useCallback((reorderedAccordionModules) => {
        setDraft(() => applyAccordionOrder(reorderedAccordionModules));
    }, []);

    const handleToggleDisplayed = useCallback((type) => {
        setDraft((prev) => prev.map((m) =>
            m.type === type ? { ...m, isDisplayed: m.isDisplayed === false } : m
        ));
    }, []);

    const handleClubRsvp = async (eventId, isCurrentlyGoing) => {
        if (!user) return;
        try {
            if (isCurrentlyGoing) {
                await apiFetch(`/clubs/${id}/events/${eventId}/rsvp`, { method: 'DELETE' });
                setClubMyRsvpSet((prev) => { const next = new Set(prev); next.delete(eventId); return next; });
            } else {
                await apiFetch(`/clubs/${id}/events/${eventId}/rsvp`, { method: 'POST' });
                setClubMyRsvpSet((prev) => new Set([...prev, eventId]));
                setClubMyMaybeSet((prev) => { const next = new Set(prev); next.delete(eventId); return next; });
            }
        } catch (err) {
            console.error('RSVP failed:', err);
        }
    };

    const handleClubMaybe = async (eventId, isCurrentlyMaybe) => {
        if (!user) return;
        try {
            if (isCurrentlyMaybe) {
                await apiFetch(`/clubs/${id}/events/${eventId}/maybe`, { method: 'DELETE' });
                setClubMyMaybeSet((prev) => { const next = new Set(prev); next.delete(eventId); return next; });
            } else {
                await apiFetch(`/clubs/${id}/events/${eventId}/maybe`, { method: 'POST' });
                setClubMyMaybeSet((prev) => new Set([...prev, eventId]));
                setClubMyRsvpSet((prev) => { const next = new Set(prev); next.delete(eventId); return next; });
            }
        } catch (err) {
            console.error('Maybe failed:', err);
        }
    };

    const handleAddEvent = async (eventData) => {
        const newEvent = await apiFetch('/events', {
            method: 'POST',
            body: {
                clubId: id,
                clubName: club.club_name,
                eventName: eventData.eventName ?? undefined,
                description: eventData.description,
                where: eventData.where ?? undefined,
                startTime: eventData.startTime,
                endTime: eventData.endTime,
                imageUrl: eventData.imageUrl ?? undefined,
                isMembersOnly: eventData.isMembersOnly ?? false,
            },
        });
        setClubEvents((prev) =>
            [...prev, newEvent].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        );
    };

    const handleEditEvent = async (eventId, eventData) => {
        const updated = await apiFetch(`/events/${eventId}`, {
            method: 'PUT',
            body: {
                eventName: eventData.eventName ?? undefined,
                description: eventData.description,
                where: eventData.where ?? undefined,
                startTime: eventData.startTime,
                endTime: eventData.endTime,
                imageUrl: eventData.imageUrl ?? undefined,
                isMembersOnly: eventData.isMembersOnly ?? false,
            },
        });
        setClubEvents((prev) =>
            prev.map((e) => (e.id === eventId ? updated : e))
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        );
    };

    const handleDeleteEvent = async (eventId) => {
        await apiFetch(`/events/${eventId}`, { method: 'DELETE' });
        setClubEvents((prev) => prev.filter((e) => e.id !== eventId));
    };

    const handleDeleteReview = useCallback(async (reviewId) => {
        set_reviews(prev => prev.filter(r => r.id !== reviewId));
        try {
            await apiFetch(`/reviews/${reviewId}`, { method: 'DELETE' });
        } catch (err) {
            console.error('Failed to delete comment:', err);
        }
    }, []);

    const moduleWarnings = isEditing ? getModuleWarnings(draft) : {};
    const isDraftValid = Object.values(moduleWarnings).every(w => w == null);
    // Accept a user question: append {q,a} to the faqs module draft and mark the row to delete on Save.
    const onAcceptQuestion = useCallback((qid, answer) => {
        const q = userFaqs.find((x) => x.id === qid);
        if (!q) return;
        setDraft(prev => prev.map(m =>
            m.type === 'faqs'
                ? { ...m, data: { ...m.data, faqs: [...(m.data?.faqs || []), { q: q.question, a: answer }] } }
                : m
        ));
        setQuestionDeletes(prev => new Set(prev).add(qid));
    }, [userFaqs]);

    // Dismiss a user question: mark the row to delete on Save.
    const onDeleteQuestion = useCallback((qid) => {
        setQuestionDeletes(prev => new Set(prev).add(qid));
    }, []);

    const handleSave = async () => {
        if (!isDraftValid) return;
        setIsSaving(true);
        setSaveError(null);
        let finalDraft = draft;
        try {
            if (pendingLogoFile) {
                const { signedUrl, publicUrl } = await apiFetch('/storage/club-logo-upload-url', {
                    method: 'POST',
                    body: { club_id: id, ext: pendingLogoFile.type.split('/')[1] },
                });
                const uploadRes = await fetch(signedUrl, { method: 'PUT', body: pendingLogoFile, headers: { 'Content-Type': pendingLogoFile.type } });
                if (!uploadRes.ok) throw new Error(`Logo upload failed (${uploadRes.status})`);

                const verification = await apiFetch('/storage/verify-image', {
                    method: 'POST',
                    body: { publicUrl },
                });
                if (!verification.ok) {
                    throw new Error(verification.error || 'Logo rejected by content policy');
                }

                const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;
                finalDraft = draft.map(m =>
                    m.type === 'basic_info' ? { ...m, data: { ...m.data, logo_url: cacheBustedUrl } } : m
                );
            }
            await apiFetch(`/clubs/${id}/page`, {
                method: 'PUT',
                body: { modules: finalDraft },
            });
            setPageData(prev => ({ ...prev, modules: finalDraft }));
            setDraft(finalDraft);

            // Save club interests only if something changed — avoids a spurious
            // PUT on every save when the user didn't touch the interests panel.
            const interestsChanged = JSON.stringify(clubInterestsDraft) !== JSON.stringify(clubInterestsSaved);
            if (interestsChanged) {
                if (clubInterestsDraft?.category_id) {
                    await apiFetch(`/clubs/${id}/interests`, {
                        method: 'PUT',
                        body: {
                            category_id: clubInterestsDraft.category_id,
                            subcategory_ids: clubInterestsDraft.subcategory_ids || [],
                        },
                    });
                    setClubInterestsSaved(clubInterestsDraft);
                } else if (clubInterestsSaved?.category_id) {
                    // Category was cleared — remove the row entirely
                    await apiFetch(`/clubs/${id}/interests`, { method: 'DELETE' });
                    setClubInterestsSaved(null);
                }
            }

            // The prefetch cache now holds the pre-edit page. Drop it so reopening this
            // club shows what was just saved rather than a stale copy for up to a minute.
            invalidateClubPage(id);

            // Commit pending hide/show changes for comments
            if (Object.keys(hideDraft).length > 0) {
                await Promise.allSettled(
                    Object.entries(hideDraft).map(([reviewId, hidden]) =>
                        apiFetch(`/reviews/${reviewId}`, { method: 'PATCH', body: { isHidden: hidden } })
                    )
                );
                set_reviews(prev => prev.map(r =>
                    r.id in hideDraft ? { ...r, is_hidden: hideDraft[r.id] } : r
                ));
                setHideDraft({});
            }

            // Commit accepted/dismissed FAQ questions: delete their rows now that the page is saved.
            if (questionDeletes.size) {
                await Promise.allSettled(
                    [...questionDeletes].map((qid) =>
                        apiFetch(`/clubs/${id}/questions/${qid}`, { method: 'DELETE' })
                    )
                );
                setUserFaqs((prev) => prev.filter((q) => !questionDeletes.has(q.id)));
                setQuestionDeletes(new Set());
            }

            setIsEditing(false);
            setPendingLogoFile(null);
            refetchClubs();
        } catch (err) {
            console.error('Error saving:', err);
            setSaveError(err?.message || 'Save failed. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    // for the cancel button- disables editing and reverts the draft back to the current state of the data
    const handleCancel = () => {
        setDraft(normalizeModules(pageData?.modules ?? []));
        setPendingLogoFile(null);
        setSaveError(null);
        setQuestionDeletes(new Set()); // restore optimistically-removed questions
        setHideDraft({});
        setClubInterestsDraft(clubInterestsSaved);
        setIsEditing(false);
    };

    const sortedDraft = [...(draft ?? [])].sort((a, b) => a.order - b.order);
    const basicInfoModule = sortedDraft.find((m) => m.type === 'basic_info');
    // Calendar ("Coming Up") is pinned above the accordion/view stream and rendered
    // unconditionally, not toggleable/reorderable like the other modules — exclude it here.
    const accordionModules = sortedDraft.filter((m) => m.type !== 'calendar');
    // Links has no separate public section of its own (see renderModule) — exclude it from the
    // view-mode stream entirely so it doesn't leave a stray divider where its content would be.
    const viewModules = sortedDraft.filter((m) => m.isDisplayed !== false && m.type !== 'links' && m.type !== 'calendar');
    // Its checkbox instead controls whether the action-bar link buttons show at all.
    const linksModuleEntry = sortedDraft.find((m) => m.type === 'links');
    const linksDisplayed = linksModuleEntry ? linksModuleEntry.isDisplayed !== false : true;

    // Action row rendered inside the basic_info module (between the banner and the About text)
    const actionRow = (
        <div className="exp-action-row">
            <div className="exp-action-row-inner">
                {user && (isMember || hasOwner) && (
                    <div className="duo-btn-wrap">
                        <div className="duo-btn-pill" aria-hidden="true" />
                        <button
                            className={`membership-btn duo-btn ${isMember ? 'leave' : 'join'}`}
                            style={{ '--duo-shadow': isMember ? 'rgb(90, 20, 20)' : 'rgb(76, 102, 57)' }}
                            onClick={isMember ? () => setShowLeaveConfirm(true) : handleMembership}
                            disabled={memberLoading}
                        >
                            {memberLoading ? '...' : membershipAction.label}
                        </button>
                    </div>
                )}

                {GlobalValue && (
                    <div className="duo-btn-wrap">
                        <div className="duo-btn-pill" aria-hidden="true" />
                        <button
                            className="exp-favorite-btn duo-btn"
                            style={{ '--duo-shadow': 'rgb(122, 48, 47)' }}
                            onClick={handleHeartClick}
                            disabled={heartAnimating}
                        >
                            {liked ? 'Unfavorite' : 'Favorite'}
                        </button>
                    </div>
                )}

                {isMember && (isClicked
                    ? <img src={logImage} className="log-btn" alt="Clicked state" />
                    : (
                        <div className="duo-btn-wrap">
                            <div className="duo-btn-pill" aria-hidden="true" />
                            <button
                                className="review-btn exp-make-post-btn duo-btn"
                                style={{ '--duo-shadow': 'rgb(49, 90, 116)' }}
                                onClick={handleClick}
                            >
                                Make Post
                            </button>
                        </div>
                    )
                )}

                {favError && <div className="exp-fav-error">{favError}</div>}
            </div>
        </div>
    );

    const renderModule = (module, part = 'full') => {
        if (module.type === 'basic_info') {
            return (
                <BasicInfoModule
                    key={`basic_info-${part}`}
                    club={club}
                    data={module.data}
                    editing={isEditing}
                    onChange={(updatedData) => handleModuleChange('basic_info', updatedData)}
                    onLogoChange={(file) => setPendingLogoFile(file)}
                    actions={actionRow}
                    warning={moduleWarnings.basic_info ?? null}
                    part={part}
                    linksDisplayed={linksDisplayed}
                    taxonomy={taxonomy}
                    clubInterests={clubInterestsDraft}
                    onInterestsChange={setClubInterestsDraft}
                    onSubcategoryCreated={(newSub) => setTaxonomy(prev => prev.map(cat =>
                      cat.id === newSub.category_id
                        ? { ...cat, subcategories: [...cat.subcategories, newSub].sort((a, b) => a.name.localeCompare(b.name)) }
                        : cat
                    ))}
                    currentUserId={user?.id ?? null}
                />
            );
        }
        if (module.type === 'links') {
            // Links has no separate public "full" section of its own — the actual link
            // buttons always live in the action bar (rendered via basic_info's hero), so its
            // order in the module stream is irrelevant. Only show its editing UI/preview here.
            if (!isEditing) return null;
            const basicInfo = draft.find((m) => m.type === 'basic_info');
            return (
                <LinksModule
                    key="links"
                    data={basicInfo?.data}
                    editing={isEditing}
                    onChange={(updatedData) => handleModuleChange('basic_info', updatedData)}
                    warning={moduleWarnings.links ?? null}
                />
            );
        }
        if (module.type === 'join') {
            return (
                <JoinModule
                    key="join"
                    club={club}
                    data={module.data}
                    editing={isEditing}
                    onChange={(updatedData) => handleModuleChange('join', updatedData)}
                    warning={moduleWarnings.join ?? null}
                />
            );
        }
        if (module.type === 'stats') {
            return (
                <StatsModule
                    key="stats"
                    data={module.data}
                    editing={isEditing}
                    onChange={(updatedData) => handleModuleChange('stats', updatedData)}
                    warning={moduleWarnings.stats ?? null}
                />
            );
        }
        if (module.type === 'club_media') {
            return (
                <ClubMediaModule
                    key="club_media"
                    data={module.data}
                    editing={isEditing}
                    warning={moduleWarnings.club_media ?? null}
                    onChange={(updatedData) => handleModuleChange('club_media', updatedData)}
                />
            );
        }
        if (module.type === 'faqs') {
            return (
                <FaqModule
                    key="faqs"
                    club={club}
                    data={module.data}
                    editing={isEditing}
                    onChange={(updatedData) => handleModuleChange('faqs', updatedData)}
                    warning={moduleWarnings.faqs ?? null}
                    canAsk={!!user && !isApproved}
                    userQuestions={userFaqs.filter((q) => !questionDeletes.has(q.id))}
                    onAcceptQuestion={onAcceptQuestion}
                    onDeleteQuestion={onDeleteQuestion}
                />
            );
        }
        if (module.type === 'member_roster') {
            return (
                <MemberRosterModule
                    key="member_roster"
                    club={club}
                    data={module.data}
                    editing={isEditing}
                    onChange={(updatedData) => handleModuleChange('member_roster', updatedData)}
                    warning={moduleWarnings.member_roster ?? null}
                />
            );
        }
        if (module.type === 'comments') {
            return (
                <ReviewList
                    key="comments"
                    reviews={reviews}
                    editing={isEditing}
                    members={clubMembers}
                    hideDraft={hideDraft}
                    onToggleHide={(reviewId, hidden) =>
                        setHideDraft(prev => ({ ...prev, [reviewId]: hidden }))
                    }
                    warning={moduleWarnings.comments ?? null}
                    onDelete={handleDeleteReview}
                />
            );
        }
        return null;
    };

    return (
        <>
        <motion.div
            className="expanded-card"
            style={{ pointerEvents: isClosing ? "none" : "auto" }}
            // A plain scale-and-fade rather than a layoutId morph from the grid card.
            // The shared-element version had to interpolate between a small square card
            // and this full-viewport panel, which distorted the contents mid-flight and
            // went visibly wrong whenever the grid reflowed underneath it.
            //
            // A fixed-duration tween instead of a spring: springs overshoot by design and
            // their settle time varies with whatever interrupted them, which is the other
            // half of why this felt unpredictable.
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setAnimationDone(true)}
        >
            {/* Shown only on a cold open — hovering a card warms the page, so this is the
                keyboard, touch and very-fast-click path. Rendered inside the same
                motion.div as the real page, so the container and the open animation are
                identical and the content swaps in without the layout moving. */}
            {!hydrated ? (
                <div className="club-modules" role="status" aria-busy="true" aria-label="Loading club page">
                    <button className="close-btn" onClick={handleClose}>×</button>

                    {/* Hero: colour band, club name, logo, action links */}
                    <div className="content-col">
                        <Skeleton height="120px" radius={2} />
                        <div className="text-flex" style={{ marginTop: 18 }}>
                            <Skeleton width="55%" height="2.6rem" />
                        </div>
                        <div className="image-stack" style={{ marginTop: 18 }}>
                            <Skeleton width="180px" height="180px" radius={4} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                            <Skeleton width="110px" height="2.1rem" radius={999} />
                            <Skeleton width="90px" height="2.1rem" radius={999} />
                            <Skeleton width="130px" height="2.1rem" radius={999} />
                        </div>
                        <SkeletonText lines={3} />
                    </div>

                    {/* Two module blocks, roughly the height of a stats or calendar module */}
                    {[0, 1].map((i) => (
                        <div key={i} style={{ marginTop: 34 }}>
                            <Skeleton width="200px" height="1.6rem" />
                            <Skeleton height="9rem" radius={4} style={{ marginTop: 14 }} />
                        </div>
                    ))}
                </div>
            ) : (
            <>
            {!isApproved && (
                <button className="close-btn" onClick={handleClose}>×</button>
            )}

            {isApproved && (
                <div className="exp-editor-header">
                    <div className="club-tab-switcher">
                        <button
                            className={`club-tab-btn${activeTab === 'page' ? ' club-tab-btn--active' : ''}`}
                            onClick={() => setActiveTab('page')}
                        >
                            Page
                        </button>
                        <button
                            className={`club-tab-btn${activeTab === 'members' ? ' club-tab-btn--active' : ''}`}
                            onClick={() => setActiveTab('members')}
                        >
                            Members
                        </button>
                    </div>

                    <div className="exp-toolbar">
                        {!isEditing ? (
                            <>
                                <div className="duo-btn-wrap">
                                    <div className="duo-btn-pill" aria-hidden="true" />
                                    <button
                                        className="exp-edit-btn duo-btn"
                                        style={{ '--duo-shadow': '#1c2a44' }}
                                        onClick={async () => {
                                            if (!pageData?.modules?.length) {
                                                try {
                                                    const result = await apiFetch(`/clubs/${id}/page/init`, { method: 'POST' });
                                                    if (result?.modules?.length) {
                                                        setPageData(result);
                                                        setDraft(normalizeModules(result.modules));
                                                    }
                                                } catch (err) {
                                                    console.error('Failed to initialize page defaults:', err);
                                                }
                                            }
                                            setIsEditing(true);
                                        }}
                                    >
                                        Edit Page
                                    </button>
                                </div>
                                <InviteLinkButton clubId={id} />
                                <QrFlyerButton club={club} />
                            </>
                        ) : (
                            <>
                                <div className="duo-btn-wrap">
                                    <div className="duo-btn-pill" aria-hidden="true" />
                                    <button
                                        className="save-btn duo-btn"
                                        style={{ '--duo-shadow': 'rgb(0, 0, 0)' }}
                                        onClick={handleSave}
                                        disabled={isSaving || !isDraftValid}
                                    >
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                                <div className="duo-btn-wrap">
                                    <div className="duo-btn-pill" aria-hidden="true" />
                                    <button
                                        className="cancel-btn duo-btn"
                                        style={{ '--duo-shadow': 'rgb(120, 120, 120)' }}
                                        onClick={handleCancel}
                                        disabled={isSaving}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {isEditing ? (
                        <>
                            <p className="exp-header-greeting">
                                You're in edit mode! Email explorethebackyard2025@gmail.com with any questions!
                            </p>
                            {saveError && (
                                <p className="exp-save-error">{saveError}</p>
                            )}
                        </>
                    ) : (
                        <p className="exp-header-greeting">Hello, Club Moderator!</p>
                    )}

                    <button className="close-btn close-btn--header" onClick={handleClose}>×</button>
                </div>
            )}

            {activeTab === 'members' ? (
                <ClubMembersPanel
                    clubId={id}
                    joinPolicy={joinPolicy}
                    myRole={myRole}
                    currentUserId={user?.id ?? null}
                    onMembershipChange={(newRole) => {
                        setMyRole(newRole);
                        if (onMembershipChange) onMembershipChange(club.id, newRole !== null);
                    }}
                    onJoinPolicyChange={handleJoinPolicyToggle}
                />
            ) : (

            <div className="club-modules">
                {basicInfoModule && renderModule(basicInfoModule, 'hero')}
                {!isApproved && clubEvents.length > 0 && (
                    <CalendarModule
                        club={club}
                        editing={false}
                        events={clubEvents}
                        myRsvpSet={clubMyRsvpSet}
                        myMaybeSet={clubMyMaybeSet}
                        friendRsvpMap={clubFriendRsvpMap}
                        allAttendeesMap={clubAllAttendeesMap}
                        onRsvp={handleClubRsvp}
                        onMaybe={handleClubMaybe}
                        userId={user?.id ?? null}
                    />
                )}
                {(isApproved || clubEvents.length > 0) && (
                    <div className="module-view-divider">
                        <div className="divider" style={{ backgroundImage: `url(${dividerLineImg})` }} aria-hidden="true" />
                    </div>
                )}
                <AddEventPanel
                    isApproved={isApproved}
                    club={club}
                    events={clubEvents}
                    onAddEvent={handleAddEvent}
                    onEditEvent={handleEditEvent}
                    onDeleteEvent={handleDeleteEvent}
                    myRsvpSet={clubMyRsvpSet}
                    myMaybeSet={clubMyMaybeSet}
                    friendRsvpMap={clubFriendRsvpMap}
                    allAttendeesMap={clubAllAttendeesMap}
                    onRsvp={handleClubRsvp}
                    onMaybe={handleClubMaybe}
                    userId={user?.id ?? null}
                />
                {isApproved && (
                    <div className="module-view-divider">
                        <div className="divider" style={{ backgroundImage: `url(${dividerLineImg})` }} aria-hidden="true" />
                    </div>
                )}
                {isEditing ? (
                    <ModuleAccordion
                        modules={accordionModules}
                        onReorder={handleModuleReorder}
                        onToggleDisplayed={handleToggleDisplayed}
                        renderContent={(module) =>
                            renderModule(module, module.type === 'basic_info' ? 'about' : 'full')
                        }
                    />
                ) : (
                    <>
                        {viewModules.map((module, index) => (
                            <React.Fragment key={module.type}>
                                {index > 0 && (
                                    <div className="module-view-divider">
                                        <div className="divider" style={{ backgroundImage: `url(${dividerLineImg})` }} aria-hidden="true" />
                                    </div>
                                )}
                                {renderModule(
                                    module,
                                    module.type === 'basic_info' ? 'about' : 'full'
                                )}
                            </React.Fragment>
                        ))}
                    </>
                )}
            </div>

            )} {/* end activeTab === 'page' */}

            {isOpen && (
                <div>
                    <ReviewPage clubId={club.id} onClose={() => setIsOpen(false)} />
                </div>
            )}
            </>
            )}
        </motion.div>

        {showLeaveConfirm && (
            <div className="leave-confirm-overlay" onClick={() => setShowLeaveConfirm(false)}>
                <div className="leave-confirm-modal" onClick={(e) => e.stopPropagation()}>
                    <p className="leave-confirm-title">Leave {club.club_name}?</p>
                    <p className="leave-confirm-body">
                        You'll lose your membership and any role you hold in this club.
                    </p>
                    {joinPolicy === 'request' && (
                        <p className="leave-confirm-warning">
                            This club requires approval to join — you'll have to submit a new request and wait to be let back in.
                        </p>
                    )}
                    <div className="leave-confirm-actions">
                        <button
                            className="leave-confirm-btn leave-confirm-cancel"
                            onClick={() => setShowLeaveConfirm(false)}
                        >
                            Cancel
                        </button>
                        <button
                            className="leave-confirm-btn leave-confirm-confirm"
                            onClick={() => { setShowLeaveConfirm(false); handleMembership(); }}
                        >
                            Leave Club
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

export default ExpandedTile;
