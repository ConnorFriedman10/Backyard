import React, { useState } from 'react';
import { sanitizeBioHtml } from '../lib/sanitizeHtml';
import './JoinModule.css';
import borderBlackImg from '/src/assets/border.svg';
import borderHorizontalBlackImg from '/src/assets/border-horizontal.svg';

/**
 * Join module — lets a club advertise recruiting info.
 *
 * data shape:
 *   {
 *     tabs: [{ title: string, body: string }, ...],
 *     applicationLink: string,   // empty => "Apply" button hidden
 *     contactLink: string        // empty => "Contact recruiter" button hidden
 *   }
 *
 * @param {Object} data - module data (see shape above).
 * @param {boolean} editing - whether the page-level edit mode is on (only ever true for approved accounts).
 * @param {Function} onChange - callback receiving the full updated data object (preserved by parent useCallback).
 */
const isValidUrl = (url) => {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

const normalizeContactLink = (v) => {
  const s = v.trim();
  if (!s) return '';
  try { new URL(s); return s; } catch {}
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/^[+\d][\d\s\-().]{6,}$/.test(s)) return `tel:${s}`;
  return s;
};

// Contact links accept web URLs, mailto:/tel: URIs, bare email addresses, and phone numbers.
const isValidContactLink = (url) => {
  const v = url.trim();
  try {
    const u = new URL(v);
    if (u.protocol === 'http:' || u.protocol === 'https:') return true;
    if (u.protocol === 'mailto:') return u.pathname.includes('@');
    if (u.protocol === 'tel:') return u.pathname.trim().length > 0;
    return false;
  } catch { /* not a full URI — check bare email / phone below */ }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;       // bare email
  if (/^[+\d][\d\s\-().]{6,}$/.test(v)) return true;           // bare phone
  return false;
};

function JoinModule({ data, editing, onChange, warning }) {
  const [active, setActive] = useState(0);
  const [appLinkWarning, setAppLinkWarning] = useState('');
  const [contactLinkWarning, setContactLinkWarning] = useState('');

  const tabs = data?.tabs ?? [];
  const applicationLink = data?.applicationLink || '';
  const contactLink = data?.contactLink || '';

  // Clamp the active index so a deletion can't leave us pointing past the end.
  const activeIndex = tabs.length ? Math.min(active, tabs.length - 1) : 0;

  const updateTab = (idx, field, value) =>
    onChange({ ...data, tabs: tabs.map((t, i) => (i === idx ? { ...t, [field]: value } : t)) });

  const addTab = () =>
    onChange({ ...data, tabs: [...tabs, { title: '', body: '' }] });

  const removeTab = (idx) =>
    onChange({ ...data, tabs: tabs.filter((_, i) => i !== idx) });

  const updateLink = (field, value) =>
    onChange({ ...data, [field]: value });

  // Nothing to show if empty and not editing
  if (!editing && tabs.length === 0 && !applicationLink && !contactLink) return null;

  return (
    <div className={`join-module${editing ? ' join-module--editing' : ''}`}>
      <p className="divider-header">How to Join</p>

      {editing && (
        <p className="about-edit-help">
          These tabs help potential new members learn about your club's joining process. Optional: Enter your application link and your recruiter email.
        </p>
      )}
      {editing && warning && <p className="module-warning">{warning}</p>}

      {/* Live preview — always visible, updates as you edit */}
      {tabs.length > 0 && (
        <>
          <div className="join-tabs" role="tablist">
            {tabs.map((t, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === activeIndex}
                className={`mr-cat-tab ${i === activeIndex ? 'active' : ''}`}
                onClick={() => setActive(i)}
              >
                {t.title || 'Untitled'}
              </button>
            ))}
          </div>
          {/* Sanitized at render as well as on write. Rows stored before server-side
              sanitization existed are still in the database, and a future write path
              could forget — neither layer should be the only thing standing here. */}
          <div
            className="join-tab-content"
            dangerouslySetInnerHTML={{ __html: sanitizeBioHtml(tabs[activeIndex]?.body || '') }}
          />
        </>
      )}

      {(isValidUrl(applicationLink) || isValidContactLink(contactLink)) && (
        <div className="join-actions">
          {isValidUrl(applicationLink) && (
            <div className="duo-btn-wrap">
              <div className="duo-btn-pill" aria-hidden="true" />
              <a
                className="apply-link-btn duo-btn"
                style={{ '--duo-shadow': 'rgb(52, 32, 0)' }}
                href={applicationLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={editing ? (e) => e.preventDefault() : undefined}
              >
                Apply
              </a>
            </div>
          )}
          {isValidContactLink(contactLink) && (
            <div className="duo-btn-wrap">
              <div className="duo-btn-pill" aria-hidden="true" />
              <a
                className="contact-link-btn duo-btn"
                style={{ '--duo-shadow': 'rgb(30, 85, 125)' }}
                href={normalizeContactLink(contactLink)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={editing ? (e) => e.preventDefault() : undefined}
              >
                Contact recruiter
              </a>
            </div>
          )}
        </div>
      )}

      {/* Edit controls */}
      {editing && (
        <>
          <div className="join-card-row">
            {tabs.map((t, idx) => (
              <div className="join-tab-card" key={idx}>
                <img src={borderBlackImg} alt="" className="join-tab-border join-tab-border-left" />
                <img src={borderBlackImg} alt="" className="join-tab-border join-tab-border-right" />
                <div
                  className="join-tab-border-h-wrap join-tab-border-top-wrap"
                  style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
                  aria-hidden="true"
                />
                <div
                  className="join-tab-border-h-wrap join-tab-border-bottom-wrap"
                  style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
                  aria-hidden="true"
                />
                <button
                  className="join-tab-remove-btn"
                  onClick={() => removeTab(idx)}
                  aria-label="Delete tab"
                >
                  X
                </button>
                <input
                  className="join-category"
                  value={t.title || ''}
                  onChange={(e) => updateTab(idx, 'title', e.target.value)}
                  placeholder="edit tab title ex: we're looking for"
                />
                <JoinTabEditor
                  value={t.body}
                  onChange={(html) => updateTab(idx, 'body', sanitizeBioHtml(html))}
                  placeholder="add about positions ex: we're looking for defenders"
                />
                {isEmptyHtml(t.body) && <p className="module-warning">Bio cannot be empty.</p>}
              </div>
            ))}
            <button className="join-add-card" onClick={addTab} aria-label="Add a tab">
              <img src={borderBlackImg} alt="" className="join-add-card-border join-add-card-border-left" />
              <img src={borderBlackImg} alt="" className="join-add-card-border join-add-card-border-right" />
              <div
                className="join-add-card-border-h-wrap join-add-card-border-top-wrap"
                style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
                aria-hidden="true"
              />
              <div
                className="join-add-card-border-h-wrap join-add-card-border-bottom-wrap"
                style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
                aria-hidden="true"
              />
              +
            </button>
          </div>

          <div className="join-link-inputs">
            <input
              className="join-link-application-input"
              value={applicationLink}
              onChange={(e) => {
                const v = e.target.value;
                updateLink('applicationLink', v);
                setAppLinkWarning(v && !isValidUrl(v) ? 'Application link must be a valid URL (https://...)' : '');
              }}
              placeholder="enter application link"
            />
            {appLinkWarning && <p className="module-warning">{appLinkWarning}</p>}
            <input
              className="join-link-contact-input"
              value={contactLink}
              onChange={(e) => {
                const v = e.target.value;
                updateLink('contactLink', v);
                setContactLinkWarning(v && !isValidContactLink(v) ? 'Must be a web link (https://...), email (mailto:you@...), or phone (tel:+1...)' : '');
              }}
              placeholder="enter contact link"
            />
            {contactLinkWarning && <p className="module-warning">{contactLinkWarning}</p>}
          </div>
        </>
      )}
    </div>
  );
}

const isEmptyHtml = (html) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent.trim() === '' && !tmp.querySelector('li, img, br');
};

/** Uncontrolled rich-text editor for join tabs — innerHTML is seeded once on mount. */
function JoinTabEditor({ value, onChange, placeholder }) {
  const ref = React.useRef(null);
  const [empty, setEmpty] = React.useState(() => isEmptyHtml(value));
  const [active, setActive] = React.useState({});
  const [charCount, setCharCount] = React.useState(() => (value || '').replace(/<[^>]*>/g, '').length);

  React.useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || '';
    try { document.execCommand('styleWithCSS', false, false); } catch { /* not supported */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshActive = () => {
    const next = {};
    ['bold', 'italic', 'underline'].forEach((c) => {
      try { next[c] = document.queryCommandState(c); } catch { /* ignore */ }
    });
    setActive(next);
  };

  const handleInput = () => {
    setEmpty(isEmptyHtml(ref.current?.innerHTML));
    setCharCount(ref.current?.textContent?.length ?? 0);
    onChange(ref.current?.innerHTML || '');
  };

  const exec = (cmd) => (e) => {
    e.preventDefault();
    ref.current?.focus();
    try { document.execCommand(cmd, false, null); } catch { /* ignore */ }
    handleInput();
    refreshActive();
  };

  return (
    <div className="mr-bio">
      <div
        ref={ref}
        className={`mr-editor ${empty ? 'is-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={handleInput}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        onFocus={refreshActive}
      />
      <div className="char-counter-wrap">
        <span className="char-counter">{charCount}/500</span>
      </div>
      <div className="mr-toolbar">
        <button type="button" className={`b ${active.bold ? 'active' : ''}`} onMouseDown={exec('bold')} title="Bold">B</button>
        <button type="button" className={`i ${active.italic ? 'active' : ''}`} onMouseDown={exec('italic')} title="Italic">I</button>
        <button type="button" className={`u ${active.underline ? 'active' : ''}`} onMouseDown={exec('underline')} title="Underline">U</button>
        <span className="sep" />
        <button type="button" onMouseDown={exec('insertUnorderedList')} title="Bulleted list">•</button>
        <button type="button" onMouseDown={exec('insertOrderedList')} title="Numbered list">1.</button>
      </div>
    </div>
  );
}

export default React.memo(JoinModule);