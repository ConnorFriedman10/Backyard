import React, { useState, useRef, useLayoutEffect } from 'react';
import { format, parseISO } from 'date-fns';
import borderImg from '../assets/border.svg';
import borderHorizontalImg from '../assets/border-horizontal.svg';
import { CalendarExportRow } from './CalendarExportRow';
import { useClubData } from '../context/useClubData';
import FriendRsvpCallout from '../components/FriendRsvpCallout';
import './CalendarModule.css';

/**
 * Calendar / Events module — simplified "Coming Up" list. Read-only display
 * (RSVP + lightbox) only — adding events lives in the separate, always-on-top
 * AddEventPanel so the two can't be confused with each other.
 *
 * data shape: { filterByMembership: boolean }
 * @param {Object}   club          - club record (used for its image_url, as a
 *                                    poster placeholder for events with no image)
 * @param {Object}   data          - module data
 * @param {boolean}  editing       - page edit mode
 * @param {Function} onChange      - (updatedData) => void
 * @param {string}   warning       - displays a warning for invalid fields not entered in by page editor
 * @param {Array}    events        - upcoming events fetched by ExpandedTile, sorted by start_time
 * @param {Set}      myRsvpSet     - event IDs the current user has RSVPd to
 * @param {Map}      friendRsvpMap - event ID → [{ username, ... }]
 * @param {Function} onRsvp        - (eventId, isCurrentlyGoing) => void
 * @param {string}   userId        - null if not logged in
 */
export function CalendarModule({
  club,
  editing,
  warning,
  events = [],
  myRsvpSet = new Set(),
  friendRsvpMap = new Map(),
  onRsvp,
  userId,
}) {
  const [overlayEvent, setOverlayEvent] = useState(null);
  const [overlayHasMore, setOverlayHasMore] = useState(false);

  // Which format "Add to calendar" uses, set in Settings. Read from the shared profile
  // rather than fetched here — this was another copy of /me/profile. Defaults to 'ics',
  // which every calendar app imports, so it is correct before the profile loads and for
  // signed-out visitors, who have no profile at all.
  const { profile: viewerProfile } = useClubData();
  const calendarPreference = viewerProfile?.calendar_preference || 'ics';


  const overlayScrollRef = useRef(null);
  const overlayItemRefs = useRef({});

  useLayoutEffect(() => {
    if (!overlayEvent || !overlayScrollRef.current) return;
    const el = overlayItemRefs.current[overlayEvent.id];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    // check after scroll settles
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

  const sorted = [...events].sort((a, b) => parseISO(a.start_time) - parseISO(b.start_time));

  // ── render ─────────────────────────────────────────────────────────────
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
            const isGoing = myRsvpSet.has(event.id);

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
                  <FriendRsvpCallout friends={friends} />
                  {userId && (
                    <button
                      className={`rsvp-button${isGoing ? ' rsvp-going' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onRsvp?.(event.id, isGoing); }}
                    >
                      {isGoing ? 'Going ✓' : "I'm going!"}
                    </button>
                  )}
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
                const evIsGoing = myRsvpSet.has(ev.id);
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
                      <FriendRsvpCallout friends={evFriends} />
                      {userId && (
                        <button
                          className={`rsvp-button${evIsGoing ? ' rsvp-going' : ''}`}
                          onClick={() => onRsvp?.(ev.id, evIsGoing)}
                        >
                          {evIsGoing ? 'Going ✓' : "I'm going!"}
                        </button>
                      )}
                    </div>
                    <CalendarExportRow event={ev} preference={calendarPreference} />
                  </div>
                );
              })}
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
