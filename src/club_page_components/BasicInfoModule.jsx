import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useClubData } from '../context/useClubData';
import { apiFetch } from '../lib/api';
import { roleColorStyle } from '../lib/roleColor';
import ColorThief from 'colorthief';
import { FaSearch, FaTimes, FaInstagram, FaFacebookF } from 'react-icons/fa';
import { FaTiktok, FaSlack, FaLinkedinIn } from 'react-icons/fa6';
import { IoIosMail } from 'react-icons/io';
import { SlSocialSpotify } from 'react-icons/sl';
import { SiLinktree } from 'react-icons/si';
import { TbBrandDiscord } from 'react-icons/tb';
import { FiYoutube } from 'react-icons/fi';
import './BasicInfoModule.css';
import Avatar from '../components/Avatar';

/**
 * @param {Object} props
 * @param {Object} props.club - object passed down which contains the id used for queries and api fetches.
 * @param {Object} props.data - arbitrary but relevant data passed to the module. This particular module contains the logo url, description, and
 * name of the club, but for other modules the data field would hold different, relevant info (see other modules for info).
 * @param {boolean} props.editing - determines whether or not the user is in edit mode or not (should never be true for non approved accounts)
 * @param {Function} props.onChange - callback function that preserves the function and its references from being rerendered every well, rerender.
 * @param {Function} props.onLogoChange - simple function that sets the value of a logo file equal to the current pending file if there 
 * is a change- meant to allow ExpandedTile to handle file uploads since they have to be uploaded using signed URL's since files
 * @param {React.ReactNode} props.actions - action row slot rendered between hero and about in full/hero mode
 * @param {string|null} props.warning - validation message shown in edit mode
 * @param {'full'|'hero'|'about'} props.part - which slice to render; hero is fixed above the accordion
 * @param {boolean} props.linksDisplayed - whether the Links module's visibility checkbox is on; hides the action-bar link buttons entirely when false
 */
function BasicInfoModule({ club, data, editing, onChange, onLogoChange, actions, warning, part = 'full', linksDisplayed = true, taxonomy = [], clubInterests = null, onInterestsChange, onSubcategoryCreated }) {
  const [dominantColor, setDominantColor] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  const [nameMarquee, setNameMarquee] = useState(false);
  const [nameDur, setNameDur] = useState(20);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [friendsSearch, setFriendsSearch] = useState('');
  const [imageWarning, setImageWarning] = useState('');
  const [linksExpanded, setLinksExpanded] = useState(false);
  // club interests edit state (only used when editing=true)
  const [subText, setSubText] = useState(['', '']);
  const [subDropdown, setSubDropdown] = useState(null); // 0 | 1 | null
  // Whether the user has typed since opening the dropdown. False until typing starts,
  // so opening a field that already holds a saved subcategory shows every option first.
  const [subFiltering, setSubFiltering] = useState([false, false]);
  const [subCreating, setSubCreating] = useState([false, false]);
  const [clubRoster, setClubRoster] = useState([]);
  // Drives how many links show before "More" — 2 on narrow viewports, 5 otherwise.
  // Tracked reactively (not just read once) so resizing across the breakpoint updates it.
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 500);

  const imgRef = useRef(null);
  const descRef = useRef(null);
  const nameWrapRef = useRef(null);
  const nameRef = useRef(null);

  const displayName = data?.club_name || club.club_name || '';
  const displayDescription = data?.description || club.club_description || '';
  const logoUrl = data?.logo_url || club.image_url || '/raccoon_pfp.png';
  // Truncate the description to 50 words in view mode; the full text opens in a modal.
  const descWords = displayDescription.trim() ? displayDescription.trim().split(/\s+/) : [];
  const isLongDesc = descWords.length > 50;
  const descPreview = isLongDesc ? descWords.slice(0, 50).join(' ') : displayDescription;

  const { friendMembershipMap } = useClubData();
  const friendsInClub = friendMembershipMap?.get(club.id) || [];

  // Roster (with each member's custom role/tag) is fetched lazily — only needed
  // once the friends modal is actually open, not on every club page load.
  useEffect(() => {
    if (!friendsModalOpen) return;
    let cancelled = false;
    apiFetch(`/clubs/${club.id}/members`)
      .then((data) => { if (!cancelled) setClubRoster(data || []); })
      .catch((err) => console.error('Failed to fetch club roster:', err));
    return () => { cancelled = true; };
  }, [friendsModalOpen, club.id]);

  const customRoleByUserId = new Map(
    clubRoster
      .filter((m) => m.club_custom_roles?.name)
      .map((m) => [m.user_id, m.club_custom_roles])
  );

  const q = friendsSearch.toLowerCase();
  const filteredInClub = friendsInClub.filter(f => f.username.toLowerCase().includes(q));

  const links = data?.links ?? [];
  const enabledLinks = links.filter(l => l.enabled && l.url);
  // Collapsed count differs by breakpoint; expanding always reveals the rest
  // in the same row (it just scrolls further) — never a second row or a modal.
  const collapsedCount = isNarrow ? 2 : 5;
  const visibleLinks = linksExpanded ? enabledLinks : enabledLinks.slice(0, collapsedCount);
  const showMoreToggle = enabledLinks.length > collapsedCount;

  const getLinkKeyword = (name) => {
    const n = (name || '').toLowerCase().trim();
    const keywords = ['instagram', 'facebook', 'discord', 'email', 'spotify', 'slack', 'tiktok', 'linktree', 'youtube', 'linkedin'];
    return keywords.find(k => n === k) || 'default';
  };

  // Each of these renders a logo instead of the platform name text. Icons default to
  // 1em, so they auto-match .link-btn's font-size at every breakpoint.
  const LINK_ICONS = {
    instagram: FaInstagram,
    facebook: FaFacebookF,
    email: IoIosMail,
    youtube: FiYoutube,
    discord: TbBrandDiscord,
    spotify: SlSocialSpotify,
    tiktok: FaTiktok,
    linktree: SiLinktree,
    slack: FaSlack,
    linkedin: FaLinkedinIn,
  };
  // Spotify's icon keeps the same green .link-btn--spotify already uses for its text,
  // instead of the white used everywhere else.
  const LINK_ICON_COLORS = { spotify: '#65D46E' };

  const handleMoreLinks = () => setLinksExpanded(prev => !prev);


  const getPastelColor = (r, g, b) => {
    const factor = (r + (255 - r) * 0.85 >= 240 &&
                    g + (255 - g) * 0.85 >= 240 &&
                    b + (255 - b) * 0.85 >= 240) ? 0.5 : 0.85;
    return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`;
  };

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 500);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const colorThief = new ColorThief();
    const img = imgRef.current;

    const getColor = () => {
      try {
        const [r, g, b] = colorThief.getColor(img);
        setDominantColor(getPastelColor(r, g, b));
      } catch {
        setDominantColor('rgb(211, 211, 211)');
      }
    };

    if (!img || !img.src) { setDominantColor('rgb(211, 211, 211)'); return; }

    if (img.complete) {
      getColor();
    } else {
      img.addEventListener('load', getColor);
      img.addEventListener('error', () => setDominantColor('rgb(211, 211, 211)'));
      return () => {
        img.removeEventListener('load', getColor);
        img.removeEventListener('error', () => setDominantColor('rgb(211, 211, 211)'));
      };
    }
  }, [club.image_url]);

  useLayoutEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto';
      descRef.current.style.height = `${descRef.current.scrollHeight}px`;
    }
  }, [data?.description, editing]);

  // Club name is one line; if it overflows its container, scroll it like a marquee.
  useLayoutEffect(() => {
    const wrap = nameWrapRef.current;
    const el = nameRef.current;
    if (!wrap || !el) { setNameMarquee(false); return; }
    const over = el.scrollWidth > wrap.clientWidth + 1;
    setNameMarquee(over);
    if (over) setNameDur(Math.max(6, el.scrollWidth / 40)); // ~40px/s
  }, [displayName, editing]);

  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validity = await new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ratio = img.naturalWidth / img.naturalHeight;
        resolve(ratio >= 0.25 && ratio <= 4.0 ? 'ok' : 'proportions');
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve('load'); };
      img.src = url;
    });

    if (validity === 'load') {
      setImageWarning('This file format isn\'t supported. Save your image as JPEG, PNG, or WebP and try again.');
      return;
    }
    if (validity === 'proportions') {
      setImageWarning('Image has unusual proportions. Please use an aspect ratio between 1:4 and 4:1.');
      return;
    }

    setImageWarning('');
    setLogoPreview(URL.createObjectURL(file));
    onLogoChange(file);
  };

  const showHero = part === 'full' || part === 'hero';
  const showAbout = part === 'full' || part === 'about';

  // Sync subcategory text inputs when editing opens or the category changes.
  useEffect(() => {
    if (!editing) return;
    if (!clubInterests?.category_id || !taxonomy.length) { setSubText(['', '']); return; }
    const cat = taxonomy.find(c => c.id === clubInterests.category_id);
    if (!cat) { setSubText(['', '']); return; }
    const names = (clubInterests.subcategory_ids || []).slice(0, 2).map(subId => {
      const sub = (cat.subcategories || []).find(s => s.id === subId);
      return sub?.name || '';
    });
    setSubText([names[0] || '', names[1] || '']);
    setSubFiltering([false, false]);
  }, [editing, clubInterests?.category_id, taxonomy]);

  const selectedCat = taxonomy.find(c => c.id === clubInterests?.category_id) || null;

  // Rendered twice (once under the name for web, once in the rectangle for mobile,
  // same pattern as club-tag1--inline/--block below) — only one shows per breakpoint.
  const interestsTagline = selectedCat && [
    selectedCat.name,
    ...(clubInterests.subcategory_ids || []).map(subId => {
      const sub = selectedCat.subcategories?.find(s => s.id === subId);
      return sub?.name;
    }).filter(Boolean)
  ].join(' · ');

  const getSuggestions = useCallback((index) => {
    if (!selectedCat) return { matches: [], showAdd: false };
    const subs = selectedCat.subcategories || [];
    const text = subText[index].trim();
    // Show the full list until the user starts typing. Once they type,
    // filter to names that contain the typed text.
    const matches = (subFiltering[index] && text)
      ? subs.filter(s => s.name.toLowerCase().includes(text.toLowerCase()))
      : subs;
    // Show "+ Add" when there's enough text and no exact match already exists.
    const exactMatch = text.length >= 2 &&
      subs.some(s => s.name.toLowerCase() === text.toLowerCase());
    const showAdd = text.length >= 2 && !exactMatch;
    return { matches, showAdd };
  }, [selectedCat, subText, subFiltering]);

  const openSubDropdown = useCallback((index) => {
    setSubDropdown(index);
    setSubFiltering(prev => prev.map((v, i) => (i === index ? false : v)));
  }, []);

  const handleCategoryChange = useCallback((e) => {
    const catId = e.target.value || null;
    onInterestsChange?.({ category_id: catId, subcategory_ids: [] });
    setSubText(['', '']);
    setSubFiltering([false, false]);
    setSubDropdown(null);
  }, [onInterestsChange]);

  const handleSubTextChange = useCallback((index, value) => {
    // Update the displayed text immediately (this was the bug: subText wasn't updated on typing)
    setSubText(prev => prev.map((t, i) => (i === index ? value : t)));
    setSubDropdown(index);
    setSubFiltering(prev => prev.map((v, i) => (i === index ? true : v)));
    // Clearing the text removes that slot's selection
    if (!value.trim()) {
      const newSubs = [...(clubInterests?.subcategory_ids || [])];
      newSubs[index] = undefined;
      onInterestsChange?.({ category_id: clubInterests?.category_id, subcategory_ids: newSubs.filter(Boolean) });
    }
  }, [clubInterests, onInterestsChange]);

  const handleSubSelect = useCallback((index, sub) => {
    const newSubs = [...(clubInterests?.subcategory_ids || [])];
    newSubs[index] = sub.id;
    // Deduplicate: same sub selected in both slots is not meaningful
    const deduped = newSubs.filter((id, i, arr) => id && arr.indexOf(id) === i);
    onInterestsChange?.({ category_id: clubInterests?.category_id, subcategory_ids: deduped });
    // Sync both text inputs to match the deduped IDs
    setSubText(prev => prev.map((t, i) => {
      const savedId = deduped[i];
      if (!savedId) return '';
      if (i === index) return sub.name;
      const existing = selectedCat?.subcategories?.find(s => s.id === savedId);
      return existing?.name ?? t;
    }));
    setSubFiltering([false, false]);
    setSubDropdown(null);
  }, [clubInterests, onInterestsChange, selectedCat]);

  const handleSubAdd = useCallback(async (index) => {
    const name = subText[index].trim();
    if (!name || !clubInterests?.category_id) return;
    setSubCreating(prev => prev.map((v, i) => (i === index ? true : v)));
    try {
      const newSub = await apiFetch('/interests/subcategories', {
        method: 'POST',
        body: { category_id: clubInterests.category_id, name },
      });
      onSubcategoryCreated?.(newSub);
      handleSubSelect(index, newSub);
    } catch (err) {
      console.error('Failed to create subcategory:', err);
    } finally {
      setSubCreating(prev => prev.map((v, i) => (i === index ? false : v)));
    }
  }, [subText, clubInterests?.category_id, onSubcategoryCreated, handleSubSelect]);

  return (
    <>
      {showHero && (
      <div className="content-col">
        <div className="rectangle" style={{ backgroundColor: dominantColor }}>
          <img
            ref={imgRef}
            src={club.image_url}
            crossOrigin="anonymous"
            alt=""
            style={{ display: 'none' }}
          />
        </div>
        <div className="text-flex">
          {editing
            ? <input
                className="club-name-exp club-name-input"
                value={data?.club_name || ''}
                onChange={(e) => onChange({ ...data, club_name: e.target.value })}
                placeholder="Club name"
              />
            : <div className="club-name-wrap" ref={nameWrapRef}>
                <div
                  className={`club-name-track ${nameMarquee ? 'on' : ''}`}
                  style={nameMarquee ? { '--name-dur': `${nameDur}s` } : undefined}
                >
                  <h2 className="club-name-exp" ref={nameRef}>{displayName}</h2>
                  {nameMarquee && <h2 className="club-name-exp" aria-hidden="true">{displayName}</h2>}
                </div>
              </div>
          }
          {!editing && selectedCat && (
            <p className="club-interests-tagline club-interests-tagline--inline">
              {interestsTagline}
            </p>
          )}
          {editing && (
            <div className="club-interests-edit">
              <label className="interests-edit-label">
                Category
                <select
                  className="interests-edit-select"
                  value={clubInterests?.category_id || ''}
                  onChange={handleCategoryChange}
                >
                  <option value="">— None —</option>
                  {taxonomy.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </label>

              {selectedCat && [0, 1].map(index => {
                const { matches, showAdd } = getSuggestions(index);
                const hasDropdown = subDropdown === index && (matches.length > 0 || showAdd);
                return (
                <div key={index} className="interests-edit-sub-wrap">
                  <label className="interests-edit-label">
                    Subcategory {index + 1}
                    <div className="interests-edit-autocomplete">
                      <input
                        className="interests-edit-input"
                        type="text"
                        value={subText[index]}
                        placeholder={`Search or add a ${selectedCat.name} subcategory…`}
                        role="combobox"
                        aria-expanded={hasDropdown}
                        aria-controls={`sub-listbox-${index}`}
                        disabled={subCreating[index]}
                        onChange={e => handleSubTextChange(index, e.target.value)}
                        onFocus={() => openSubDropdown(index)}
                        onBlur={() => setTimeout(() => setSubDropdown(null), 150)}
                      />
                      <span className="interests-edit-caret" aria-hidden="true" />
                      {hasDropdown && (
                        <div className="interests-edit-dropdown" id={`sub-listbox-${index}`} role="listbox">
                          {matches.map(sub => (
                            <button
                              key={sub.id}
                              type="button"
                              className="interests-edit-suggestion"
                              onMouseDown={() => handleSubSelect(index, sub)}
                            >
                              {sub.name}
                            </button>
                          ))}
                          {showAdd && (
                            <button
                              type="button"
                              className="interests-edit-suggestion interests-edit-add-option"
                              onMouseDown={() => handleSubAdd(index)}
                            >
                              + Add &ldquo;{subText[index].trim()}&rdquo;
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="image-stack">
          <div className="rectangle_min" style={{ '--dominant-color': dominantColor }}>
            {!editing && selectedCat && (
              <p className="club-interests-tagline club-interests-tagline--block">
                {interestsTagline}
              </p>
            )}
            <div
              className="club-img-exp"
              style={{ backgroundImage: `url(${logoPreview || logoUrl})`, marginTop: '1rem' }}
              role="img"
              aria-label={club.club_name}
            >
              {editing && (
                <label className="logo-upload-label">
                  Change Logo
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,.png,.jpg,.jpeg,.webp,.gif,.avif" hidden onChange={handleLogoChange} />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {showHero && editing && imageWarning && <p className="module-warning">{imageWarning}</p>}

      {showHero && (
      <div className="action-links-wrapper">
        <div className="action-links-track">
          {actions}
          {linksDisplayed && enabledLinks.length > 0 && (
            <>
              <span className="links-sep">|</span>
              <div className="links-bar">
                {visibleLinks.map((link, i) => {
                  const keyword = getLinkKeyword(link.name);
                  const Icon = LINK_ICONS[keyword];
                  return (
                  <div className="duo-btn-wrap" key={link.id || i}>
                    <div className="duo-btn-pill" aria-hidden="true" />
                    <a
                      className={`review-btn link-btn link-btn--${keyword}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {Icon ? <Icon size="1.6rem" color={LINK_ICON_COLORS[keyword] || '#fff'} /> : link.name}
                    </a>
                  </div>
                  );
                })}
                {showMoreToggle && (
                  <div className="duo-btn-wrap">
                    <div className="duo-btn-pill" aria-hidden="true" />
                    <button className="review-btn link-btn links-toggle-btn" onClick={handleMoreLinks}>
                      {linksExpanded ? 'Less' : 'More'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {showAbout && (
      <div className="about-section">
        <h2 className="divider-header">About</h2>
        {editing && (
          <p className="about-edit-help">
            {part === 'about'
              ? 'Think of this like your bio. Also if you want to hide your memmbers, hide this section.'
              : "This is your club's basic info section. Feel free to edit your club's name, profile photo, and a description telling users about your club."}
          </p>
        )}
        <div className="about-meta-row" style={friendsInClub.length === 0 ? { marginLeft: '-4px' } : undefined}>
          {friendsInClub.length > 0 && (
            <button className="friend-avatars-btn" onClick={() => setFriendsModalOpen(true)}>
              {friendsInClub.slice(0, 3).map((friend) => (
                <Avatar
                  key={friend.id}
                  className="friend-avatar-img-bio"
                  url={friend.avatar_url}
                  firstName={friend.first_name}
                  lastName={friend.last_name}
                  username={friend.username}
                />
              ))}
              <span className="friend-names-text">
                {friendsInClub.length === 1
                ? (
    <>
      <span>{friendsInClub[0].username}</span>
      <span> is a member</span>
    </>
  )
                  : friendsInClub.length === 2
                    ? `${friendsInClub[0].username} and ${friendsInClub[1].username} are members`
                    : (
    <>
      {friendsInClub.slice(0, 2).map((friend, idx) => (
        <span key={friend.id}>
          {friend.username}
          {idx === 0 ? ', ' : ''}
        </span>
      ))}
      <span> + {friendsInClub.length - 2} are members</span>
    </>
  )}
              </span>
            </button>
          )}
        </div>

        {editing && warning && (
          <p className="module-warning">{warning}</p>
        )}
        {editing
          ? <textarea
              ref={descRef}
              className="club-description-exp club-desc-input"
              value={data?.description || ''}
              onChange={(e) => onChange({ ...data, description: e.target.value })}
              placeholder="Club description"
            />
          : <p className="club-description-exp">
                {descOpen ? displayDescription : descPreview}
              {isLongDesc && (
                <>
                  {!descOpen && '… '}
                <button
                  type="button"
                  className="desc-more-btn"
                  onClick={() => setDescOpen(d => !d)}
                >
                    {descOpen ? 'LESS' : 'MORE'}
                </button>
                </>
              )}
            </p>
        }
      </div>
      )}

      {showAbout && friendsModalOpen && (
        <div className="friends-modal-overlay-basic-info" onClick={() => { setFriendsModalOpen(false); setFriendsSearch(''); }}>
          <div className="friends-modal" onClick={(e) => e.stopPropagation()}>
            <div className="friends-modal-header">
              <h3 className="friends-modal-title">Friends in {displayName}</h3>
              <button className="friends-modal-close" onClick={() => { setFriendsModalOpen(false); setFriendsSearch(''); }}>
                <FaTimes />
              </button>
            </div>

            <div className="friend-search-wrapper">
              <FaSearch className="friend-search-icon" />
              <input
                placeholder="Search friends"
                value={friendsSearch}
                onChange={(e) => setFriendsSearch(e.target.value)}
                autoFocus
              />
            </div>

            {filteredInClub.length > 0 && (
              <>
                <div className="friends-modal-section-title">In This Club</div>
                <div className="friends-modal-list">
                  {filteredInClub.map((friend) => {
                    const customRole = customRoleByUserId.get(friend.id);
                    return (
                      <div className="friend-modal-row" key={friend.id}>
                        <Avatar className="friend-avatar-sm" url={friend.avatar_url} firstName={friend.first_name} lastName={friend.last_name} username={friend.username} />
                        <span className="friend-result-name">{friend.username}</span>
                        {customRole && (
                          <span className="role-badge friend-result-badge" style={roleColorStyle(customRole.role_color)}>
                            {customRole.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {filteredInClub.length === 0 && (
              <p className="friends-empty">No friends found.</p>
            )}
          </div>
        </div>
      )}

    </>
  );
}

export default React.memo(BasicInfoModule);
