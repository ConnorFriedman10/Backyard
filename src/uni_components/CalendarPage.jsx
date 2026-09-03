import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  startOfDay, addDays, format, isSameDay, parseISO,
  getDay, getDaysInMonth, isToday, isBefore,
} from 'date-fns';
import ColorThief from 'colorthief';
import { apiFetch } from '../lib/api';
import { useClubData } from '../context/useClubData';
import { prefetchCalendar, readCalendar } from '../lib/calendarCache';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import FriendRsvpCallout from '../components/FriendRsvpCallout';
import '../club_page_components/CalendarModule.css';
import './CalendarPage.css';
import './EventInfoRow.css';
import PortraitTitle from './PortraitTitle';
import treeImg from '/src/assets/tree.png';
import borderImg from '../assets/border.svg';
import borderHorizontalImg from '../assets/border-horizontal.svg';
import { TbCropPortrait } from 'react-icons/tb';
import { GiHamburgerMenu } from 'react-icons/gi';
import { IoChevronDownCircle } from 'react-icons/io5';

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const EVENT_DAY_COLORS = ['#382825', '#56758b', '#BE0D00', '#FC7200', '#ffcc13'];
const randomEventDayColor = () => EVENT_DAY_COLORS[Math.floor(Math.random() * EVENT_DAY_COLORS.length)];

export function CalendarPage() {
  const { allData, friendsArray, profile: viewerProfile } = useClubData();
  const clubImageById = useMemo(
    () => new Map(allData.map(club => [club.id, club.image_url])),
    [allData]
  );
  const clubNameById = useMemo(
    () => new Map(allData.map(club => [club.id, club.club_name])),
    [allData]
  );

  // Minimized event rows use the club's own image's dominant color as their
  // background (same pastel-toning technique BasicInfoModule uses for its hero
  // rectangle), keyed by club_id and computed once per club, not per event.
  const [dominantColorByClubId, setDominantColorByClubId] = useState({});

  const todayDate = startOfDay(new Date());

  // Warmed by prefetchCalendar when the calendar button was hovered. Read synchronously
  // during render rather than in an effect — an effect runs after the first paint, so the
  // panel would still flash "Loading events…" before swapping to content, which is the
  // exact seam this removes.
  const warmed = readCalendar();

  const [status, setStatus] = useState(() => {
    if (!warmed) return 'loading';
    return warmed.userId ? 'ready' : 'unauthed';
  });
  const [userId, setUserId] = useState(() => warmed?.userId ?? null);

  const [weeklyEvents, setWeeklyEvents] = useState(() => warmed?.events ?? []);
  const [myRsvpSet, setMyRsvpSet] = useState(() => new Set(
    (warmed?.rsvps ?? [])
      .filter((r) => r.user_id === warmed?.userId)
      .map((r) => r.event_id)
  ));
  const [weeklyRsvps, setWeeklyRsvps] = useState(() => warmed?.rsvps ?? []); // raw { user_id, event_id } rows, so friend RSVPs can be derived alongside myRsvpSet

  useEffect(() => {
    const clubIds = [...new Set(weeklyEvents.map(e => e.club_id).filter(Boolean))];
    const missing = clubIds.filter(id => !(id in dominantColorByClubId) && clubImageById.get(id));
    if (missing.length === 0) return;

    missing.forEach((clubId) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const [r, g, b] = new ColorThief().getColor(img);
          const factor = (r + (255 - r) * 0.85 >= 240 &&
                          g + (255 - g) * 0.85 >= 240 &&
                          b + (255 - b) * 0.85 >= 240) ? 0.5 : 0.85;
          const pastel = `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`;
          setDominantColorByClubId(prev => ({ ...prev, [clubId]: pastel }));
        } catch {
          setDominantColorByClubId(prev => ({ ...prev, [clubId]: 'rgb(211, 211, 211)' }));
        }
      };
      img.onerror = () => {
        setDominantColorByClubId(prev => ({ ...prev, [clubId]: 'rgb(211, 211, 211)' }));
      };
      img.src = clubImageById.get(clubId);
    });
  }, [weeklyEvents, clubImageById, dominantColorByClubId]);

  // Same derivation ExpandedTile uses for a club page's "X is going" callouts —
  // cross-reference the raw rsvp rows against the current user's friends list.
  const weeklyFriendRsvpMap = useMemo(() => {
    const friendIdSet = new Set(friendsArray.map(f => f.id));
    const friendProfileMap = new Map(friendsArray.map(f => [f.id, f]));
    const map = new Map();
    for (const rsvp of weeklyRsvps) {
      if (friendIdSet.has(rsvp.user_id)) {
        if (!map.has(rsvp.event_id)) map.set(rsvp.event_id, []);
        map.get(rsvp.event_id).push(friendProfileMap.get(rsvp.user_id));
      }
    }
    return map;
  }, [weeklyRsvps, friendsArray]);

  const [viewMode, setViewMode] = useState('week');
  // Week-view-only: whether each event renders as a tall poster card or a
  // shrunken single-line row. Toggled via the two icon buttons above the
  // Week/Month button.
  const [posterSize, setPosterSize] = useState('maximized'); // 'maximized' | 'minimized'

  // Above 700px, only the minimized (single-line) layout is allowed — the full poster
  // isn't an option there, so force it rather than let the toggle disagree with what's
  // actually rendered. At or below 700px both modes are available and this leaves
  // posterSize alone, so the toggle buttons (hidden above 700px, see the CSS) work
  // normally.
  useEffect(() => {
    const checkWidth = () => {
      if (window.innerWidth > 700) setPosterSize('minimized');
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth() + 1);
  const [monthlyEvents, setMonthlyEvents] = useState([]);
  const [monthlyMyRsvpSet, setMonthlyMyRsvpSet] = useState(new Set());
  const [nextMonthlyEvents, setNextMonthlyEvents] = useState([]);
  const [nextMonthlyMyRsvpSet, setNextMonthlyMyRsvpSet] = useState(new Set());
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  // { type: 'month', year, month, day } | { type: 'week', date: Date } | null
  const [selectedOverlay, setSelectedOverlay] = useState(null);

  const containerRef = useRef(null);

  // There was a non-passive wheel listener here that mirrored horizontal deltas
  // into scrollLeft by hand. overflow-x:auto already does exactly that natively,
  // and writing scrollLeft per wheel event inside a mandatory snap container
  // makes the browser re-resolve the snap position every frame — visible
  // trackpad stutter. overscroll-behavior-x:contain (CalendarPage.css) covers
  // the other thing it was doing, keeping the gesture off the page behind.

  // Tracks which day column sits closest to the row's horizontal center as the
  // user scrolls, so its label can highlight the same way the day dots do.
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  // Under 700px the week view is sized to fit .calpg-card exactly — the card
  // itself never scrolls, the day tabs stay in view, and the active day's event
  // list scrolls inside its own box with each poster filling that box. All of it
  // is now a plain flex height chain in CalendarPage.css (see "NARROW WEEK VIEW
  // LAYOUT"): the card's height is definite, so the row, the events box and the
  // event card can each just take what's left of it. The poster's width follows
  // from its height via a fixed aspect-ratio.
  //
  // This used to be measured here (card − header − day title − padding, written
  // out as --calpg-day-events-h, plus a per-image width set from its laid-out
  // height). That was only necessary because the poster's ratio was `auto`,
  // which makes width↔height circular; pinning the ratio breaks the cycle and
  // CSS can do the whole thing on its own.

  // Populates state when the calendar was opened without a prior hover (keyboard, touch,
  // a very fast click). On a warm cache prefetchCalendar resolves from memory, so this
  // re-sets the same values and nothing flashes.
  //
  // Freshness is handled at the edges rather than by refetching on every open: the TTL is
  // 30s, RSVPs made inside this component update local state directly, and AuthListener
  // drops the cache on sign-in and sign-out — which is the only case where the payload
  // would otherwise belong to a different user.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const data = await prefetchCalendar();
      if (cancelled) return;

      if (!data || !data.userId) {
        setStatus('unauthed');
        return;
      }

      setUserId(data.userId);
      setWeeklyEvents(data.events);
      setWeeklyRsvps(data.rsvps);
      setMyRsvpSet(new Set(
        data.rsvps.filter((r) => r.user_id === data.userId).map((r) => r.event_id)
      ));
      setStatus('ready');
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(todayDate, i);
      const dayEvents = weeklyEvents
        .filter(e => isSameDay(parseISO(e.start_time), date))
        .sort((a, b) => parseISO(a.start_time) - parseISO(b.start_time));
      return { date, label: format(date, 'EEE'), fullLabel: format(date, 'EEEE'), sublabel: format(date, 'd'), isToday: i === 0, events: dayEvents };
    });
  }, [weeklyEvents, todayDate]);

  // One poster fills the whole events box, so a day with several events shows
  // nothing below the fold and the scrollbar is hidden — without a cue there's
  // no way to tell the extra events are there. Mirrors .cal-overlay-more-arrow
  // in CalendarModule, including its 10px slack for sub-pixel rounding.
  const [dayHasMore, setDayHasMore] = useState(false);
  const updateDayHasMore = useCallback(() => {
    const el = containerRef.current?.querySelector('.calpg-week-day-events--active');
    setDayHasMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 10);
  }, []);

  // Observed rather than only recomputed on state change: the box's height is
  // CSS-derived now, so it moves for reasons React never sees (font loading,
  // rotation, the header's own responsive sizing) — and whether anything
  // overflows moves with it. `status` and `weekDays` are in the deps because on
  // a cold load this component returns the skeleton branch first, so the ref
  // isn't attached yet and there'd be nothing to observe.
  useLayoutEffect(() => {
    updateDayHasMore();
    const el = containerRef.current?.querySelector('.calpg-week-day-events--active');
    if (!el) return;
    const ro = new ResizeObserver(updateDayHasMore);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateDayHasMore, status, activeDayIndex, viewMode, weekDays, posterSize]);

  useEffect(() => {
    const row = containerRef.current;
    if (!row || viewMode !== 'week') return;
    let ticking = false;
    const updateActiveDay = () => {
      const dayEls = row.querySelectorAll('.calpg-week-day');
      // Below 700px .calpg-week-row has scroll padding sized so the first/last
      // day can actually reach true center — nearest-to-center math alone is
      // enough. Above that breakpoint there's no such padding, so the
      // first/last day's center can never reach the row's center; clamp it
      // at either scroll extreme instead.
      if (window.innerWidth > 700) {
        const maxScroll = row.scrollWidth - row.clientWidth;
        if (row.scrollLeft <= 1) {
          setActiveDayIndex(0);
          ticking = false;
          return;
        }
        if (row.scrollLeft >= maxScroll - 1) {
          setActiveDayIndex(dayEls.length - 1);
          ticking = false;
          return;
        }
      }
      const rowRect = row.getBoundingClientRect();
      const center = rowRect.left + rowRect.width / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;
      dayEls.forEach((dayEl, i) => {
        const rect = dayEl.getBoundingClientRect();
        const distance = Math.abs(center - (rect.left + rect.width / 2));
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      });
      setActiveDayIndex(closestIndex);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateActiveDay);
        ticking = true;
      }
    };
    updateActiveDay();
    row.addEventListener('scroll', onScroll);
    return () => row.removeEventListener('scroll', onScroll);
  }, [viewMode, weekDays]);

  useEffect(() => {
    if (viewMode !== 'month' || !userId) return;
    let cancelled = false;
    const nextDate = new Date(displayYear, displayMonth, 1); // displayMonth is 1-based, so this rolls to next month
    const nextYear = nextDate.getFullYear();
    const nextMonthNum = nextDate.getMonth() + 1;

    // One batched request instead of one per club. Fanning out client-side meant a user
    // in N clubs fired 2N requests every time this view opened, which was a large part of
    // what tripped the rate limiter.
    async function fetchClubEventsForMonth(memberList, year, month) {
      const events = await apiFetch(
        `/clubs/events/monthly-batch?clubIds=${memberList.join(',')}&year=${year}&month=${month}`
      );
      return events || [];
    }

    async function buildRsvpSet(events) {
      if (!events.length) return new Set();
      const ids = events.map(e => e.id);
      const rsvps = await apiFetch(`/events/rsvps?eventIds=${ids.join(',')}`);
      return new Set((rsvps || []).filter(r => r.user_id === userId).map(r => r.event_id));
    }

    async function fetchMonthly() {
      setMonthlyLoading(true);
      try {
        // member_list comes from the shared profile; this used to be yet another
        // /me/profile request, fired every time the month view opened.
        const memberList = viewerProfile?.member_list || [];
        if (!memberList.length) {
          if (!cancelled) {
            setMonthlyEvents([]);
            setNextMonthlyEvents([]);
            setMonthlyLoading(false);
          }
          return;
        }
        const [currentEvents, nextEvents] = await Promise.all([
          fetchClubEventsForMonth(memberList, displayYear, displayMonth),
          fetchClubEventsForMonth(memberList, nextYear, nextMonthNum),
        ]);
        if (cancelled) return;
        setMonthlyEvents(currentEvents);
        setNextMonthlyEvents(nextEvents);
        const [currentRsvp, nextRsvp] = await Promise.all([
          buildRsvpSet(currentEvents),
          buildRsvpSet(nextEvents),
        ]);
        if (!cancelled) {
          setMonthlyMyRsvpSet(currentRsvp);
          setNextMonthlyMyRsvpSet(nextRsvp);
        }
      } catch (err) {
        console.error('Monthly events fetch failed:', err);
      } finally {
        if (!cancelled) setMonthlyLoading(false);
      }
    }
    fetchMonthly();
    return () => { cancelled = true; };
  }, [viewMode, displayYear, displayMonth, userId, viewerProfile]);

  const handleWeeklyRsvp = async (eventId, isGoing) => {
    const event = weeklyEvents.find(e => e.id === eventId);
    if (!event?.club_id) return;
    try {
      if (isGoing) {
        await apiFetch(`/clubs/${event.club_id}/events/${eventId}/rsvp`, { method: 'DELETE' });
        setMyRsvpSet(prev => { const s = new Set(prev); s.delete(eventId); return s; });
      } else {
        await apiFetch(`/clubs/${event.club_id}/events/${eventId}/rsvp`, { method: 'POST' });
        setMyRsvpSet(prev => new Set([...prev, eventId]));
      }
    } catch (err) { console.error('Weekly RSVP failed:', err); }
  };

  const handleMonthlyRsvpFor = (eventsPool, setRsvpSet) => async (eventId, isGoing) => {
    const event = eventsPool.find(e => e.id === eventId);
    if (!event?.club_id) return;
    try {
      if (isGoing) {
        await apiFetch(`/clubs/${event.club_id}/events/${eventId}/rsvp`, { method: 'DELETE' });
        setRsvpSet(prev => { const s = new Set(prev); s.delete(eventId); return s; });
      } else {
        await apiFetch(`/clubs/${event.club_id}/events/${eventId}/rsvp`, { method: 'POST' });
        setRsvpSet(prev => new Set([...prev, eventId]));
      }
    } catch (err) { console.error('Monthly RSVP failed:', err); }
  };
  const handleMonthlyRsvp = handleMonthlyRsvpFor(monthlyEvents, setMonthlyMyRsvpSet);
  const handleNextMonthlyRsvp = handleMonthlyRsvpFor(nextMonthlyEvents, setNextMonthlyMyRsvpSet);

  function buildEventsByDay(events, year, month) {
    const map = new Map();
    for (const event of events) {
      const d = parseISO(event.start_time);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const dayNum = d.getDate();
        if (!map.has(dayNum)) map.set(dayNum, []);
        map.get(dayNum).push(event);
      }
    }
    for (const [, evts] of map) evts.sort((a, b) => parseISO(a.start_time) - parseISO(b.start_time));
    return map;
  }

  function navigateMonth(delta) {
    const d = new Date(displayYear, displayMonth - 1 + delta, 1);
    setDisplayYear(d.getFullYear());
    setDisplayMonth(d.getMonth() + 1);
    setSelectedOverlay(null);
  }

  function getMonthGrid(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const offset = getDay(firstDay);
    const totalDays = getDaysInMonth(firstDay);
    return [...Array(offset).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];
  }

  // year/month/eventsByDay are passed explicitly (not read off displayYear/displayMonth/
  // monthlyEventsByDay) because this is also used for the next-month panel, whose cells
  // need nextYear/nextMonthNum/nextMonthlyEventsByDay instead.
  function getDayClass(year, month, dayNum, eventsByDay) {
    const date = new Date(year, month - 1, dayNum);
    const hasEvents = eventsByDay.has(dayNum);
    if (isBefore(date, todayDate)) return 'cal-day-past';
    if (isToday(date)) return hasEvents ? 'cal-day-today-events' : 'cal-day-today';
    return hasEvents ? 'cal-day-has-events' : 'cal-day-normal';
  }

  const monthDisplayDate = new Date(displayYear, displayMonth - 1, 1);
  const nextMonthDate = new Date(displayYear, displayMonth, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonthNum = nextMonthDate.getMonth() + 1;

  const monthlyEventsByDay = buildEventsByDay(monthlyEvents, displayYear, displayMonth);
  const nextMonthlyEventsByDay = buildEventsByDay(nextMonthlyEvents, nextYear, nextMonthNum);

  const cells = getMonthGrid(displayYear, displayMonth);
  const nextCells = getMonthGrid(nextYear, nextMonthNum);

  const isWeekOverlay = selectedOverlay?.type === 'week';
  const isSelectedInNextMonth = selectedOverlay?.type === 'month' && selectedOverlay.year === nextYear && selectedOverlay.month === nextMonthNum;
  const selectedDayEvents = !selectedOverlay
    ? []
    : isWeekOverlay
      ? (weekDays.find(d => isSameDay(d.date, selectedOverlay.date))?.events || [])
      : (isSelectedInNextMonth
          ? (nextMonthlyEventsByDay.get(selectedOverlay.day) || [])
          : (monthlyEventsByDay.get(selectedOverlay.day) || []));
  const selectedDayFriendRsvpMap = isWeekOverlay ? weeklyFriendRsvpMap : new Map();
  const selectedDayRsvpSet = isWeekOverlay ? myRsvpSet : (isSelectedInNextMonth ? nextMonthlyMyRsvpSet : monthlyMyRsvpSet);
  const selectedDayRsvpHandler = isWeekOverlay ? handleWeeklyRsvp : (isSelectedInNextMonth ? handleNextMonthlyRsvp : handleMonthlyRsvp);
  const selectedOverlayDate = !selectedOverlay
    ? null
    : isWeekOverlay
      ? selectedOverlay.date
      : new Date(selectedOverlay.year, selectedOverlay.month - 1, selectedOverlay.day);

  if (status === 'loading') {
    return (
      <SkeletonRegion className="calpg-card" label="Loading events">
        <div className="calendar-container">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="cal-day-col">
              <Skeleton width="60%" height="1rem" style={{ margin: '0 auto 12px' }} />
              <Skeleton height="9rem" radius={4} />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    );
  }

  if (status === 'unauthed') {
    return (
      <div className="calpg-card">
        <p className="cal-unauthed-msg">Sign in to see your club events.</p>
      </div>
    );
  }

  const headerDate = viewMode === 'month' ? monthDisplayDate : todayDate;

  return (
    <>
      <div className={`calpg-card${viewMode === 'week' ? ' calpg-card--week' : ''}`}>
        <div className="calpg-header">
          <div className="calpg-tree-wrap">
            <img src={treeImg} alt="" className="calpg-tree-img" />
          </div>
          <div className={`calpg-month-row calpg-align-row${viewMode === 'month' ? ' calpg-month-row-monthly' : ''}`}>
            <h1 className={`calpg-month${viewMode === 'month' ? ' calpg-month-monthly' : ''}`}>
              <span className="calpg-month-full">{format(headerDate, 'MMMM')}</span>
              <span className="calpg-month-abbr">{format(headerDate, 'MMM').toUpperCase()}</span>
              {viewMode === 'month' && (
                <span className="calpg-month-range">
                  {format(monthDisplayDate, 'MMMM')} – {format(nextMonthDate, 'MMMM')}
                </span>
              )}
            </h1>
              {viewMode === 'day' && (
                <div className="cal-month-nav">
                  <button className="cal-nav-btn" onClick={() => navigateMonth(-1)}>‹</button>
                  <button className="cal-nav-btn" onClick={() => navigateMonth(1)}>›</button>
                </div>
              )}
          </div>
        </div>
        {viewMode === 'week' && (
          <div
            className="calendar-container calpg-week-row"
            ref={containerRef}
          >
            {weekDays.map((day, i) => (
              <div key={day.date.toISOString()} className={`calendar-day calpg-week-day${day.isToday ? ' today' : ''}`}>
                <div className="day-title-number calpg-day-title">
                  <span className={`calpg-day-label${i === activeDayIndex ? ' calpg-day-label--active' : ''}`}>
                    {day.isToday ? 'Today' : (
                      <>
                        <span className="calpg-day-full">{day.fullLabel}</span>
                        <span className="calpg-day-abbr">{day.label}</span>
                      </>
                    )}
                  </span>
                  <span className={`calpg-day-num${i === activeDayIndex ? ' calpg-day-num--active' : ''}`}>{day.sublabel}</span>
                </div>
                <div
                  className={`calpg-week-day-events${i === activeDayIndex ? ' calpg-week-day-events--active' : ''}${posterSize === 'maximized' && day.events.length > 1 ? ' calpg-week-day-events--paged' : ''}`}
                  onScroll={i === activeDayIndex ? updateDayHasMore : undefined}
                >
                {day.events.length === 0 ? (
                  /* Looks exactly like the bare "No events" text it replaces —
                     .calendar-event is a button reset, so no background, border
                     or padding — but sized like a real poster card so an empty
                     day still offers a full-height target for the horizontal
                     day swipe, rather than only the slider strip at the top. */
                  <div
                    className="calendar-event calendar-event--empty"
                  >
                    <p>No events</p>
                  </div>
                ) : (
                  day.events.map(event => {
                    // clubNameById (live, from demo_club_data) wins over event.club_name — the
                    // latter is a snapshot stored at event-creation time (events.js), so it goes
                    // stale the moment a club renames itself; falls back to it only for events
                    // whose club_id no longer resolves (e.g. the club was deleted).
                    const clubName = clubNameById.get(event.club_id) || event.club_name || '';
                    const eventName = event.event_name || '';
                    const titleText = clubName && eventName
                      ? `${clubName} • ${eventName}`
                      : (clubName || eventName);
                    const friends = weeklyFriendRsvpMap.get(event.id);
                    const posterUrl = event.event_image_url || event.image_url || clubImageById.get(event.club_id);
                    const isMinimized = posterSize === 'minimized';
                    return (
                      <button
                        type="button"
                        key={event.id}
                        className={`calendar-event${isMinimized ? ' calendar-event--minimized' : ''}`}
                        style={isMinimized ? { '--dominant-color': dominantColorByClubId[event.club_id] || 'rgb(211, 211, 211)' } : undefined}
                        onClick={() => setSelectedOverlay({ type: 'week', date: day.date })}
                      >
                        {isMinimized ? (
                          <div className="calendar-event-min-row">
                            <img
                              src={posterUrl || '/raccoon_pfp.png'}
                              alt=""
                              className={`calendar-event-min-thumb${posterUrl ? '' : ' calendar-event-min-thumb--default'}`}
                            />
                            <div className="calendar-event-min-text">
                              <PortraitTitle text={eventName} />
                              <p className="calendar-event-min-club">{clubName}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="cal-portrait-img-wrap">
                            <img src={borderImg} alt="" className="cal-portrait-card-border cal-portrait-card-border-left" />
                            <img src={borderImg} alt="" className="cal-portrait-card-border cal-portrait-card-border-right" />
                            <div
                              className="cal-portrait-card-border-h cal-portrait-card-border-h-top"
                              style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                            />
                            <div
                              className="cal-portrait-card-border-h cal-portrait-card-border-h-bottom"
                              style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                            />
                            <img
                              src={posterUrl || '/raccoon_pfp.png'}
                              alt=""
                              className={`cal-portrait-img${posterUrl ? '' : ' cal-portrait-img--default'}`}
                            />
                            <PortraitTitle text={titleText} />
                            <FriendRsvpCallout friends={friends} />
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
                </div>
                {i === activeDayIndex && dayHasMore && (
                  <IoChevronDownCircle className="calpg-day-more-arrow" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        )}
        {viewMode === 'month' && (
          monthlyLoading ? (
            <SkeletonRegion label="Loading month">
              <Skeleton height="14rem" radius={4} />
            </SkeletonRegion>
          ) : (
            <div className="calpg-align-row calpg-dual-grid-row">
              <div className="calpg-grid-col calpg-grid-panel">
                <div className="calpg-grid-nav-row">
                  <button className="cal-nav-btn" onClick={() => navigateMonth(-1)}>‹</button>
                  <span className="calpg-grid-nav-label">{format(monthDisplayDate, 'MMMM')}</span>
                  <button className="cal-nav-btn calpg-fwd-narrow" onClick={() => navigateMonth(1)}>›</button>
                </div>
                <div className="cal-grid">
                  {WEEK_DAYS.map((d, i) => <div key={i} className="cal-weekday-label calpg-weekday-label">{d}</div>)}
                  {cells.map((dayNum, i) => (
                    <div
                      key={i}
                      className={`cal-day-cell${dayNum ? ` ${getDayClass(displayYear, displayMonth, dayNum, monthlyEventsByDay)}` : ' cal-day-empty'}`}
                      style={dayNum && monthlyEventsByDay.has(dayNum) ? { color: randomEventDayColor() } : undefined}
                      onClick={dayNum && monthlyEventsByDay.has(dayNum) ? () => setSelectedOverlay({ type: 'month', year: displayYear, month: displayMonth, day: dayNum }) : undefined}
                    >
                      {dayNum || ''}
                    </div>
                  ))}
                </div>
              </div>
              <div className="calpg-grid-divider" aria-hidden="true" />
              <div className="calpg-grid-col calpg-grid-panel calpg-grid-panel-next">
                <div className="calpg-grid-nav-row calpg-grid-nav-row--right">
                  <span className="calpg-grid-nav-label">{format(nextMonthDate, 'MMMM')}</span>
                  <button className="cal-nav-btn" onClick={() => navigateMonth(1)}>›</button>
                </div>
                <div className="cal-grid">
                  {WEEK_DAYS.map((d, i) => <div key={`next-${i}`} className="cal-weekday-label calpg-weekday-label">{d}</div>)}
                  {nextCells.map((dayNum, i) => (
                    <div
                      key={i}
                      className={`cal-day-cell${dayNum ? ` ${getDayClass(nextYear, nextMonthNum, dayNum, nextMonthlyEventsByDay)}` : ' cal-day-empty'}`}
                      style={dayNum && nextMonthlyEventsByDay.has(dayNum) ? { color: randomEventDayColor() } : undefined}
                      onClick={dayNum && nextMonthlyEventsByDay.has(dayNum) ? () => setSelectedOverlay({ type: 'month', year: nextYear, month: nextMonthNum, day: dayNum }) : undefined}
                    >
                      {dayNum || ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Outside .calpg-card on purpose. The card is a container-query container
          (container-type, CalendarPage.css) and a clipping box (overflow:hidden)
          in the narrow week layout; per spec container-type implies layout
          containment, which would make the card the containing block for this
          position:fixed backdrop and then clip it. Chromium does not do that for
          inline-size, but rather than depend on that, the overlay lives out here
          with the toggles, where inset:0 can only ever mean the viewport. */}
      {selectedOverlay !== null && (
        <div className="cal-overlay-backdrop" onClick={() => setSelectedOverlay(null)}>
          <div className="cal-overlay-portrait" onClick={e => e.stopPropagation()}>
            <button className="cal-overlay-close" onClick={() => setSelectedOverlay(null)}>✕</button>
            <h2 className="cal-overlay-date">
              {format(selectedOverlayDate, 'EEE d').toUpperCase()}
            </h2>
            <div className="cal-portrait-scroll">
              {selectedDayEvents.map(event => {
                // See the comment at the other clubName assignment above: live club data
                // wins over the stale creation-time snapshot stored on the event itself.
                const clubName = clubNameById.get(event.club_id) || event.club_name || '';
                const eventName = event.event_name || '';
                const titleText = clubName && eventName
                  ? `${clubName} • ${eventName}`
                  : (clubName || eventName);
                const friends = selectedDayFriendRsvpMap.get(event.id);
                const posterUrl = event.event_image_url || event.image_url || clubImageById.get(event.club_id);
                return (
                <div key={event.id} className="cal-portrait-event">
                  <div className="cal-portrait-img-wrap">
                    <img src={borderImg} alt="" className="cal-portrait-card-border cal-portrait-card-border-left" />
                    <img src={borderImg} alt="" className="cal-portrait-card-border cal-portrait-card-border-right" />
                    <div
                      className="cal-portrait-card-border-h cal-portrait-card-border-h-top"
                      style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                    />
                    <img
                      src={posterUrl || '/raccoon_pfp.png'}
                      alt="Event"
                      className={`cal-portrait-img${posterUrl ? '' : ' cal-portrait-img--default'}`}
                    />
                  </div>
                  <div className="cal-portrait-info">
                    <img src={borderImg} alt="" className="cal-portrait-info-border cal-portrait-info-border-left" />
                    <img src={borderImg} alt="" className="cal-portrait-info-border cal-portrait-info-border-right" />
                    <div
                      className="cal-portrait-card-border-h cal-portrait-card-border-h-bottom"
                      style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                    />
                    <PortraitTitle text={titleText} />
                    <FriendRsvpCallout friends={friends} />
                    {event.where && (
                      <p className="cal-info-row">
                        <span className="cal-info-label">where</span>
                        <span className="cal-info-value">{event.where}</span>
                      </p>
                    )}
                    <p className="cal-info-row">
                      <span className="cal-info-label">when</span>
                      <span className="cal-info-value">
                        {format(parseISO(event.start_time), 'EEE MMM d')} {format(parseISO(event.start_time), 'h:mm a')}–{format(parseISO(event.end_time), 'h:mm a')}
                      </span>
                    </p>
                    {event.event_description && (
                      <p className="cal-info-row">
                        <span className="cal-info-label">about</span>
                        <span className="cal-info-value">{event.event_description}</span>
                      </p>
                    )}
                    {userId && event.club_id && (
                      <button
                        className="rsvp-button"
                        onClick={() => selectedDayRsvpHandler(event.id, selectedDayRsvpSet.has(event.id))}
                      >
                        {selectedDayRsvpSet.has(event.id) ? 'Going ✓' : "I'm going!"}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="calpg-poster-size-toggle">
          <button
            type="button"
            className={`calpg-poster-size-btn calpg-poster-size-btn--min${posterSize === 'minimized' ? ' calpg-poster-size-btn--active' : ''}`}
            aria-label="Row view"
            aria-pressed={posterSize === 'minimized'}
            onClick={() => setPosterSize('minimized')}
          >
            <GiHamburgerMenu />
            <span className="calpg-poster-size-label">Row</span>
          </button>
          <button
            type="button"
            className={`calpg-poster-size-btn${posterSize === 'maximized' ? ' calpg-poster-size-btn--active' : ''}`}
            aria-label="Card view"
            aria-pressed={posterSize === 'maximized'}
            onClick={() => setPosterSize('maximized')}
          >
            <TbCropPortrait />
            <span className="calpg-poster-size-label">Card</span>
          </button>
        </div>
      )}

      <button
        className="calpg-toggle-btn"
        type="button"
        onClick={() => setViewMode(v => (v === 'week' ? 'month' : 'week'))}
      >
        {viewMode === 'week' ? 'Month' : 'Week'}
      </button>
    </>
  );
}

export default React.memo(CalendarPage);
