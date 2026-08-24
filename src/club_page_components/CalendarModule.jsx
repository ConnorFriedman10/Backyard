import React, { useState, useRef, useLayoutEffect } from 'react';
import { format, parseISO } from 'date-fns';
import borderImg from '../assets/border.svg';
import borderHorizontalImg from '../assets/border-horizontal.svg';
import { CalendarExportRow } from './CalendarExportRow';
import { useClubData } from '../context/useClubData';
import Avatar from '../components/Avatar';
import './CalendarModule.css';

/**
 * Calendar / Events module — simplified "Coming Up" list. Read-only display
 * (RSVP + lightbox) only — adding events lives in the separate, always-on-top
 * AddEventPanel so the two can't be confused with each other.
 *
 * data shape: { filterByMembership: boolean }
 * @param {Object}   club              - club record (used for its image_url, as a
 *                                        poster placeholder for events with no image)
 * @param {Object}   data              - module data
 * @param {boolean}  editing           - page edit mode
 * @param {Function} onChange          - (updatedData) => void
 * @param {string}   warning           - displays a warning for invalid fields not entered in by page editor
 * @param {Array}    events            - upcoming events fetched by ExpandedTile, sorted by start_time
 * @param {Set}      myRsvpSet         - event IDs the current user has RSVPd to ('going')
 * @param {Set}      myMaybeSet        - event IDs the current user has marked 'maybe'
 * @param {Map}      friendRsvpMap     - event ID → [{ username, ... }] for going friends
 * @param {Map}      allAttendeesMap   - event ID → { going: [{ user_id, profile, isFriend }], maybe: [...] }
 * @param {Function} onRsvp            - (eventId, isCurrentlyGoing) => void
 * @param {Function} onMaybe           - (eventId, isCurrentlyMaybe) => void
 * @param {string}   userId            - null if not logged in
 */
export function CalendarModule({
  club,
  editing,
  warning,
  events = [],
  myRsvpSet = new Set(),
  myMaybeSet = new Set(),
  friendRsvpMap = new Map(),
  allAttendeesMap = new Map(),
  onRsvp,
  onMaybe,
  userId,
}) {
  const [overlayEvent, setOverlayEvent] = useState(null);
  const [overlayHasMore, setOverlayHasMore] = useState(false);
  const [attendeesEvent, setAttendeesEvent] = useState(null);
  const [attendeesTab, setAttendeesTab] = useState('going');

  const { profile: viewerProfile } = useClubData();
  const calendarPreference = viewerProfile?.calendar_preference || 'ics';

  const overlayScrollRef = useRef(null);
  const overlayItemRefs = useRef({});

  useLayoutEffect(() => {
    if (!overlayEvent || !overlayScrollRef.current) return;
    const el = overlayItemRefs.current[overlayEvent.id];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    const el2 = overlayScrollRef.current;
    setTimeout(() => {
      setOverlayHasMore(el2.scrollHeight - el2.scrollTop - el2.clientHeight > 10);
    }, 50);
  }, [overlayEvent]);

  const handleOverlayScroll = () => {
    const el = overlayScrollRef.current;
    if (!el) return;
    setOverlayHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > 10);
  };

  const openAttendeesOverlay = (event, tab = 'going') => {
    setAttendeesEvent(event);
    setAttendeesTab(tab);
  };

  const sorted = [...events].sort((a, b) => parseISO(a.start_time) - parseISO(b.start_time));

  // ── helpers ────────────────────────────────────────────────────────────────

  // Renders the small stacked avatar row for an event.
  // Shows up to 4 circles (friends first), then a +N count.
  function AttendeeAvatarRow({ event, onClick }) {
    const buckets = allAttendeesMap.get(event.id);
    if (!buckets) return null;
    const all = [...buckets.going, ...buckets.maybe];
    if (all.length === 0) return null;

    const shown = all.slice(0, 4);
    const extra = all.length - shown.length;

    return (
      <button
        className="cal-attendee-row"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        aria-label={`See who's going (${all.length})`}
      >
        <div className="cal-attendee-avatars">
          {shown.map((a, i) => (
            <span key={a.user_id} className="cal-attendee-avatar-wrap" style={{ zIndex: shown.length - i }}>
              <Avatar
                url={a.profile?.avatar_url}
                firstName={a.profile?.first_name}
                lastName={a.profile?.last_name}
                username={a.profile?.username}
                className="cal-attendee-avatar"
              />
            </span>
          ))}
        </div>
        {extra > 0 && <span className="cal-attendee-extra">+{extra}</span>}
      </button>
    );
  }

  // ── action buttons (shared between list card and overlay) ──────────────────

  function RsvpButtons({ event, stopProp = false }) {
    const isGoing = myRsvpSet.has(event.id);
    const isMaybe = myMaybeSet.has(event.id);
    if (!userId) return null;
    const wrap = (fn) => stopProp ? (e) => { e.stopPropagation(); fn(); } : fn;
    return (
      <div className="cal-action-row">
        <button
          className={`rsvp-button${isGoing ? ' rsvp-going' : ''}`}
          onClick={wrap(() => onRsvp?.(event.id, isGoing))}
        >
          {isGoing ? 'Interested ✓' : 'Interested'}
        </button>
        <button
          className={`rsvp-button rsvp-maybe${isMaybe ? ' rsvp-maybe--active' : ''}`}
          onClick={wrap(() => onMaybe?.(event.id, isMaybe))}
        >
          {isMaybe ? 'Maybe ✓' : 'Maybe'}
        </button>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cal-module">
      <p className="divider-header">Coming Up</p>
      {editing && warning && <p className="module-warning">{warning}</p>}

      {sorted.length === 0 ? (
        <p className="cal-empty">No upcoming events.</p>
      ) : (
        <div className="cal-event-list">
          {sorted.map((event) => {
            const start = parseISO(event.start_time);
            const end = parseISO(event.end_time);
            const friends = friendRsvpMap.get(event.id);

            return (
              <div
                key={event.id}
                className="cal-event-item cal-event-item--clickable"
                onClick={() => setOverlayEvent(event)}
              >
                <img src={borderImg} alt="" className="cal-event-item-border cal-event-item-border-left" />
                <img src={borderImg} alt="" className="cal-event-item-border cal-event-item-border-right" />
                <div
                  className="cal-event-item-border-h cal-event-item-border-h-top"
                  style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                />
                <div
                  className="cal-event-item-border-h cal-event-item-border-h-bottom"
                  style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                />
                <img
                  className="cal-event-img"
                  src={event.event_image_url || club?.image_url || '/raccoon_pfp.png'}
                  alt=""
                />
                <div className="cal-event-body">
                  <p className="cal-event-date">{format(start, 'EEE, MMM d').toUpperCase()}</p>
                  <p className="cal-event-time">
                    {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
                  </p>
                  <p className="cal-event-desc">{event.event_description}</p>
                  {event.is_members_only && (
                    <span className="cal-members-badge">Members only</span>
                  )}
                  {friends && friends.length > 0 && (
                    <p className="friend-rsvp-callout">
                      {friends.length === 1
                        ? `${friends[0].username} is going`
                        : `${friends[0].username} and ${friends.length - 1} ${friends.length - 1 === 1 ? 'other' : 'others'} you know are going`}
                    </p>
                  )}
                  <AttendeeAvatarRow
                    event={event}
                    onClick={() => openAttendeesOverlay(event, 'going')}
                  />
                  <RsvpButtons event={event} stopProp />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event lightbox overlay — scrollable portrait stack */}
      {overlayEvent && (
        <div
          className="cal-overlay-backdrop"
          onClick={() => setOverlayEvent(null)}
        >
          <div
            className="cal-overlay-portrait"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="cal-overlay-close"
              onClick={() => setOverlayEvent(null)}
              aria-label="Close"
            >✕</button>

            {overlayHasMore && (
              <div className="cal-overlay-more-arrow" aria-hidden="true">&#8964;</div>
            )}
            <div className="cal-portrait-scroll" ref={overlayScrollRef} onScroll={handleOverlayScroll}>
              {sorted.map((ev) => {
                const evStart = parseISO(ev.start_time);
                const evEnd = parseISO(ev.end_time);
                const evFriends = friendRsvpMap.get(ev.id);
                return (
                  <div
                    key={ev.id}
                    className="cal-portrait-event"
                    ref={(el) => { overlayItemRefs.current[ev.id] = el; }}
                  >
                    {ev.event_image_url ? (
                      <div className="cal-portrait-img-wrap">
                        <img className="cal-portrait-img" src={ev.event_image_url} alt="" />
                      </div>
                    ) : null}
                    <div className="cal-portrait-info">
                      <p className="cal-overlay-date-line">
                        {format(evStart, 'EEEE, MMMM d')}
                      </p>
                      <p className="cal-overlay-time">
                        {format(evStart, 'h:mm a')} – {format(evEnd, 'h:mm a')}
                      </p>
                      <p className="cal-overlay-desc">{ev.event_description}</p>
                      {ev.is_members_only && (
                        <span className="cal-members-badge">Members only</span>
                      )}
                      {evFriends && evFriends.length > 0 && (
                        <p className="friend-rsvp-callout">
                          {evFriends.length === 1
                            ? `${evFriends[0].username} is going`
                            : `${evFriends[0].username} and ${evFriends.length - 1} ${evFriends.length - 1 === 1 ? 'other' : 'others'} you know are going`}
                        </p>
                      )}
                      <AttendeeAvatarRow
                        event={ev}
                        onClick={() => openAttendeesOverlay(ev, 'going')}
                      />
                      <RsvpButtons event={ev} />
                    </div>
                    <CalendarExportRow event={ev} preference={calendarPreference} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Attendees overlay — INTERESTED / MAYBE tabs */}
      {attendeesEvent && (
        <div
          className="cal-overlay-backdrop"
          onClick={() => setAttendeesEvent(null)}
        >
          <div
            className="cal-attendees-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cal-attendees-header">
              <div className="cal-attendees-tabs">
                <button
                  className={`cal-attendees-tab${attendeesTab === 'going' ? ' cal-attendees-tab--active' : ''}`}
                  onClick={() => setAttendeesTab('going')}
                >
                  Interested
                </button>
                <button
                  className={`cal-attendees-tab${attendeesTab === 'maybe' ? ' cal-attendees-tab--active' : ''}`}
                  onClick={() => setAttendeesTab('maybe')}
                >
                  Maybe
                </button>
              </div>
              <button
                className="cal-overlay-close"
                onClick={() => setAttendeesEvent(null)}
                aria-label="Close"
              >✕</button>
            </div>

            <div className="cal-attendees-list">
              {(() => {
                const buckets = allAttendeesMap.get(attendeesEvent.id);
                const list = buckets?.[attendeesTab] || [];
                if (list.length === 0) {
                  return (
                    <p className="cal-attendees-empty">
                      No one has marked {attendeesTab === 'going' ? 'interested' : 'maybe'} yet.
                    </p>
                  );
                }
                return list.map((a) => (
                  <div key={a.user_id} className={`cal-attendee-row-item${a.isFriend ? ' cal-attendee-row-item--friend' : ''}`}>
                    <Avatar
                      url={a.profile?.avatar_url}
                      firstName={a.profile?.first_name}
                      lastName={a.profile?.last_name}
                      username={a.profile?.username}
                      className="cal-attendees-avatar"
                    />
                    <span className="cal-attendees-name">
                      {a.profile?.first_name && a.profile?.last_name
                        ? `${a.profile.first_name} ${a.profile.last_name}`
                        : a.profile?.username || 'Unknown'}
                    </span>
                    {a.isFriend && <span className="cal-attendees-mutual">friend</span>}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* The monthly view and day-detail overlay that lived here were unreachable:
          viewMode was initialised to 'week' and setViewMode was never called, and the
          day overlay could only be opened from a cell inside the month grid. Between
          them they referenced five identifiers declared nowhere in the file
          (monthDisplayDate, WEEK_DAYS, cells, selectedDayEvents), so rendering either
          would have thrown. CalendarPage owns the month view now; removed rather than
          left as a trap for whoever adds a Week/Month toggle here. */}
    </div>
  );
}

export default React.memo(CalendarModule);
