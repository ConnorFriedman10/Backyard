import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { isUuid, slugifyUniversity, slugMatches } from '../../shared/slug';
import { UniSearchBar } from './UniSearchBar';
import './UniversityPage.css';
import { ClubList } from './ClubList';
import { CalendarPage } from './CalendarPage';
import { useGlobalStore } from "../lib/store";
import { useClubData } from '../context/useClubData';
import { useCardSize } from '../lib/useCardSize';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';

// Import your images
import ghibliBackground from '/src/assets/ghibili_background.jpg';
import ghibliPlant from '/src/assets/ghibliPlant.png';
import headerLogo from '/src/assets/header_logo.png';
import neuFlag from '/src/assets/neu_flag.png';
import borderImg from '/src/assets/border.svg';
import borderHorizontalImg from '/src/assets/border-horizontal.svg';

export const UniversityPage = () => {
  // Either a slug ("Northeastern") or a UUID — the API resolves both, and old UUID links
  // are rewritten to the slug once the name is known.
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoExpandId = searchParams.get('club') || null;
  const [university, setUniversity] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  let GlobalValue = useGlobalStore((state) => state.GlobalValue);
  const setCalendarViewActive = useGlobalStore((state) => state.setCalendarViewActive);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMounted, setCalendarMounted] = useState(false);
  const [calendarRevealed, setCalendarRevealed] = useState(false);

  const { allData, favoritesCache } = useClubData();
  const [cardSize, setCardSize] = useCardSize();

  useEffect(() => {
    if (showCalendar) setCalendarMounted(true);
  }, [showCalendar]);

  // The panel used to mount with uni-calendar-visible already on it, so the browser had
  // no previous opacity to interpolate from and it simply appeared on first open. Later
  // opens did fade, because the element was still mounted from the time before — so the
  // same action animated differently depending on whether you had opened it already.
  // Flipping the class one frame after mount gives the transition a starting value.
  useEffect(() => {
    if (!calendarMounted) return;
    if (!showCalendar) { setCalendarRevealed(false); return; }
    const raf = requestAnimationFrame(() => setCalendarRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [calendarMounted, showCalendar]);

  // NavBar lives outside this page and has no other way to know which view
  // is showing, since that's local state here.
  useEffect(() => {
    setCalendarViewActive(showCalendar);
  }, [showCalendar, setCalendarViewActive]);

  // Clear it on the way out, or the flag outlives the page: leaving the
  // calendar for /profile would leave the nav bar's calendar icon lit on a
  // route where neither view exists.
  useEffect(() => () => setCalendarViewActive(false), [setCalendarViewActive]);

  useEffect(() => {
    const html = document.documentElement;
    html.style.backgroundImage = `url(${ghibliBackground})`;
    html.style.backgroundSize = 'cover';
    html.style.backgroundPosition = 'center';
    html.style.backgroundAttachment = 'fixed';
    return () => {
      html.style.backgroundImage = '';
      html.style.backgroundSize = '';
      html.style.backgroundPosition = '';
      html.style.backgroundAttachment = '';
    };
  }, []);

  useEffect(() => {
    if (!selectedCategory) setResults(allData);
  }, [allData]);

  const getClubsBasedOnCategory = (newCategory) => {
    console.log("Category received from function: " + newCategory);

    // Nav bar view switches. These are destinations, not filters, so they are
    // handled before the same-category toggle below and are idempotent:
    // clicking the section you are already in leaves you there. Toggling made
    // sense for the search bar's calendar button, but that button is gone, and
    // a nav item that navigates away from itself reads as a misfire — the
    // calendar would close and the Clubs icon would light up instead.
    if (newCategory === "calendar") {
      setShowCalendar(true);
      setSelectedCategory("calendar");
      return;
    }

    if (newCategory === "clubs") {
      setShowCalendar(false);
      setSelectedCategory(null);
      setResults(allData);
      return;
    }

    // Everything below comes from the search bar's category chips, where
    // clicking the active chip to clear the filter is the point.
    if (newCategory === selectedCategory) {
      console.log("Same category clicked- defaulting");
      setShowCalendar(false);
      setSelectedCategory(null);
      setResults(allData);
    } else if (newCategory === "favorites") {
      console.log("If triggering");
      setShowCalendar(false);
      setSelectedCategory(newCategory);
      const newdata = allData.filter(club => favoritesCache?.has(club.id));
      setResults(newdata);
    } else {
      console.log("Else triggering");
      setShowCalendar(false);
      setSelectedCategory(newCategory);
      const normalizeCategory = s => s?.toLowerCase().replace(/[\s-]+/g, '_') ?? '';
      const newdata = allData.filter(club => normalizeCategory(club.category) === normalizeCategory(newCategory));
      setResults(newdata);
    }
  }

  useEffect(() => {
    const handler = (e) => {
      const category = e?.detail?.category;
      if (!category) return;
      getClubsBasedOnCategory(category);
    };
    window.addEventListener("backyard-category-select", handler);
    return () => window.removeEventListener("backyard-category-select", handler);
  }, [selectedCategory, allData, showCalendar, favoritesCache]);

  // NavBar's calendar button dispatches backyard-category-select directly when
  // already on this page, but when clicked from elsewhere it has to navigate
  // here first — it flags that via router state since there's no listener
  // mounted yet to catch the event.
  useEffect(() => {
    if (location.state?.openCalendar) {
      getClubsBasedOnCategory("calendar");
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);
  
  useEffect(() => {
    let cancelled = false;

    async function fetchUniversity() {
      try {
        const data = await apiFetch(`/universities/${id}`, { auth: false });
        if (!cancelled) setUniversity(data);
        return;
      } catch (err) {
        // A backend that predates slug support only accepts a UUID here and rejects a
        // slug outright ("invalid input syntax for type uuid"). Fall back to the list
        // endpoint, which every version of the API serves, and resolve it client-side
        // with the same shared slug logic the server uses.
        //
        // Keeps the app working against a Railway deploy that is behind this branch,
        // and costs one extra request only on that path.
        if (isUuid(id)) {
          if (!cancelled) console.error('Error fetching university:', err);
          return;
        }
      }

      try {
        const all = await apiFetch('/universities', { auth: false });
        const match = (all || []).find((u) => slugMatches(id, u.uni_name));
        if (cancelled) return;
        if (match) setUniversity(match);
        else console.error(`No university matches the slug "${id}"`);
      } catch (err) {
        if (!cancelled) console.error('Error fetching university:', err);
      }
    }

    fetchUniversity();
    return () => { cancelled = true; };
  }, [id]);

  // Falsy until the school resolves, so the tab does not flash a placeholder first.
  useDocumentTitle(university?.uni_name ? `Backyard | ${university.uni_name}` : null);

  // Rewrite a legacy UUID URL to the readable slug once the name resolves. `replace` so
  // it does not add a history entry the back button has to step through.
  useEffect(() => {
    if (!university?.uni_name || !isUuid(id)) return;
    const slug = university.slug || slugifyUniversity(university.uni_name);
    navigate(`/university/${slug}`, { replace: true });
  }, [university, id, navigate]);

  // The whole page shell, so the header and search row do not jump into place once the
  // school resolves.
  if (!university) {
    return (
      <SkeletonRegion className="UniPage" label="Loading university">
        <div className="uni-background-layer" />
        <div className="uni-layout">
          <header className="uni-header-spacer">
            <Skeleton width="320px" height="4rem" style={{ margin: '0 auto' }} />
          </header>
          <div className="uni-search-row">
            <div className="uni-search-shell">
              <Skeleton height="2.6rem" radius={999} />
            </div>
          </div>
          <main className="uni-club-stage">
            <div className="uni-club-viewport">
              <div className="clubs-list" data-size={cardSize}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="club-card">
                    <div className="flex-card">
                      <div className="image-container">
                        <Skeleton width="100%" height="100%" radius={2} />
                      </div>
                      <Skeleton width="80%" height="1.6rem" style={{ marginTop: 15 }} />
                      <Skeleton width="55%" height="1rem" style={{ marginTop: 8 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </SkeletonRegion>
    );
  }

  return (
    <div className="UniPage">
      <div className="uni-background-layer" />
      <img
        src={ghibliPlant}
        alt=""
        className="uni-plant-layer"
      />

      <div className="uni-layout">
        <header className="uni-header-spacer">
          <img src={neuFlag} alt="" className="uni-neu-flag" />
          <img src={headerLogo} alt="Backyard" className="uni-header-logo" />
        </header>

        <div className={`uni-search-row${showCalendar ? ' uni-fade-hidden' : ''}`}>
          <div className="uni-search-shell">
            <UniSearchBar
              setResults={setResults}
              university={university.uni_name}
              cardSize={cardSize}
              onCardSizeChange={setCardSize}
            />
          </div>
        </div>

        <main className={`uni-club-stage${showCalendar ? ' uni-fade-hidden' : ''}`}>
          <div className="uni-club-viewport">
            <ClubList results={results} cardSize={cardSize} autoExpandId={autoExpandId} />
          </div>
        </main>

        {calendarMounted && (
          <div
            className={`uni-calendar-inline${calendarRevealed ? ' uni-calendar-visible' : ''}`}
            onTransitionEnd={(e) => {
              if (e.propertyName === 'opacity' && !showCalendar) setCalendarMounted(false);
            }}
          >
            <img src={borderImg} alt="" className="uni-calendar-border uni-calendar-border-left" />
            <img src={borderImg} alt="" className="uni-calendar-border uni-calendar-border-right" />
            <div
              className="uni-calendar-border-h-wrap uni-calendar-border-top-wrap"
              style={{ backgroundImage: `url(${borderHorizontalImg})` }}
              aria-hidden="true"
            />
            <div
              className="uni-calendar-border-h-wrap uni-calendar-border-bottom-wrap"
              style={{ backgroundImage: `url(${borderHorizontalImg})` }}
              aria-hidden="true"
            />
            <CalendarPage onClose={() => { setShowCalendar(false); setSelectedCategory(null); }} />
          </div>
        )}
      </div>
    </div>
  );
};