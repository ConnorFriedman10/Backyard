import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import FeatheredBlob from './FeatheredBlob';
import { apiFetch } from '../lib/api';
import { uploadVideo } from '../lib/uploadVideo';
import './ClubMediaModule.css';
import borderImg from '/src/assets/border-green.svg';
import borderHorizontalImg from '/src/assets/border-horizontal-green.svg';
import borderBlackImg from '/src/assets/border.svg';
import borderHorizontalBlackImg from '/src/assets/border-horizontal.svg';

const REVEAL_MS = 1600;
const MAX_VIDEO_SECONDS = 15;
const VIDEO_WIDTHS = ['50', '70', '100'];

/**
 * Club Media module — a horizontal row of poster cards that expand into a
 * full-height portrait modal of media/text/title blocks.
 *
 * data shape:
 *   {
 *     posters: [{
 *       order,           // per-poster display order (distinct from the module-level order)
 *       blob_image_url, blob_aspect, poster_color, poster_text, poster_text_color,
 *       content: [ { type:'title', value } | { type:'text', value }
 *                | { type:'media', items:[{ kind:'image'|'video', url }] }
 *                | { type:'uploaded_video', url, width:'50'|'70'|'100' } ]
 *     }]
 *   }
 *
 * Edit mode (`editing` true, approved accounts only) lets editors manage posters and their
 * content via an edit card that sits BELOW each poster; changes flow up through `onChange`
 * into the page draft and are saved by ExpandedTile. Images upload immediately via
 * /storage/review-upload-url; short videos (≤15 s) upload via
 * /storage/club-media-video-upload-url; longer YouTube-style videos are pasted links.
 *
 * @param {Object} data - module data (see shape above).
 * @param {boolean} editing - page-level edit mode.
 * @param {Function} onChange - receives the full updated data object.
 */
function ClubMediaModule({ data, editing, onChange, warning }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [reveal, setReveal] = useState(null); // { rect, scale, active }
  const [localWarning, setLocalWarning] = useState('');
  const posters = data?.posters ?? [];

  const orderOf = (p, i) => (typeof p.order === 'number' ? p.order : i);

  // Display order without ever reordering the underlying array (keeps keys/inputs stable);
  // each entry keeps its original array index for update/open/delete handlers.
  const ordered = posters
    .map((p, i) => ({ p, i, order: orderOf(p, i) }))
    .sort((a, b) => a.order - b.order);

  const updatePoster = (i, patch) =>
    onChange?.({ ...data, posters: posters.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });

  // Move a poster to display position newPos0, renumbering everyone contiguously.
  const setPosterOrder = (origIndex, newPos0) => {
    const seq = posters
      .map((p, i) => ({ i, order: orderOf(p, i) }))
      .sort((a, b) => a.order - b.order)
      .map((e) => e.i);
    const from = seq.indexOf(origIndex);
    if (from === -1) return;
    seq.splice(from, 1);
    seq.splice(newPos0, 0, origIndex);
    const orderByIndex = {};
    seq.forEach((idx, pos) => { orderByIndex[idx] = pos; });
    onChange?.({ ...data, posters: posters.map((p, i) => ({ ...p, order: orderByIndex[i] })) });
  };

  const addPoster = () => {
    if (posters.length >= 15) { setLocalWarning('Maximum of 15 posters reached.'); return; }
    setLocalWarning('');
    onChange?.({ ...data, posters: [...posters, newPoster(posters.length)] });
  };

  const removePoster = (origIndex) => {
    const remaining = posters.filter((_, i) => i !== origIndex);
    const seq = remaining
      .map((p, i) => ({ i, order: orderOf(p, i) }))
      .sort((a, b) => a.order - b.order)
      .map((e) => e.i);
    const orderByIndex = {};
    seq.forEach((idx, pos) => { orderByIndex[idx] = pos; });
    onChange?.({ ...data, posters: remaining.map((p, i) => ({ ...p, order: orderByIndex[i] })) });
    setOpenIndex(null);
    setReveal(null);
  };

  const openPoster = (index, rect, skipReveal = false) => {
    setOpenIndex(index);
    if (skipReveal) {
      setReveal(null);
      return;
    }
    const { scale70, scaleFinal } = blobRevealMetrics(rect);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setReveal({
      rect,
      scale70,
      scaleFinal,
      dx: cx - window.innerWidth / 2,
      dy: cy - window.innerHeight / 2,
    });
  };

  const closePoster = () => {
    setOpenIndex(null);
    setReveal(null);
  };

  // Unmount the flying blob once the portal expansion finishes.
  useLayoutEffect(() => {
    if (!reveal) return undefined;
    const done = setTimeout(() => setReveal(null), REVEAL_MS);
    return () => clearTimeout(done);
  }, [reveal?.rect]);

  // Nothing to show publicly when empty; in edit mode we still render so the add card appears.
  if (posters.length === 0 && !editing) return null;

  const open = openIndex != null ? posters[openIndex] : null;

  return (
    <div className="club-media-module">
      <p className="divider-header">Media</p>
      {editing && (localWarning || warning) && <p className="module-warning">{localWarning || warning}</p>}
      {editing && (
          <p className="about-edit-help">
            Think of these like your highlights. When user's click on your highlights, they will see a scrap book where you can tell them a story.
          </p>
        )}
      <div className="club-media-row">
        {ordered.map(({ p, i }, rank) => (
          <PosterCard
            key={i}
            poster={p}
            editing={editing}
            rank={rank}
            count={posters.length}
            onOpen={(rect) => openPoster(i, rect, editing)}
            isPosterOpen={openIndex === i}
            onUpdate={(patch) => updatePoster(i, patch)}
            onSetOrder={(newPos0) => setPosterOrder(i, newPos0)}
            onDelete={() => removePoster(i)}
            onError={setLocalWarning}
          />
        ))}

        {editing && (
          <button className="cm-add-poster" onClick={addPoster} aria-label="Add poster">
            <img src={borderBlackImg} alt="" className="cm-add-poster-border cm-add-poster-border-left" />
            <img src={borderBlackImg} alt="" className="cm-add-poster-border cm-add-poster-border-right" />
            <div
              className="cm-add-poster-border-h-wrap cm-add-poster-border-top-wrap"
              style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
              aria-hidden="true"
            />
            <div
              className="cm-add-poster-border-h-wrap cm-add-poster-border-bottom-wrap"
              style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
              aria-hidden="true"
            />
            +
          </button>
        )}
      </div>

      {open && (
        <PosterModal
          poster={open}
          editing={editing}
          revealing={!!reveal}
          onClose={closePoster}
          onUpdate={(patch) => updatePoster(openIndex, patch)}
          onWarning={setLocalWarning}
        />
      )}

      {open && reveal && (
        <BlobRevealLayer poster={open} reveal={reveal} />
      )}
    </div>
  );
}

/* ─────────────────────────── Poster card (+ edit card below) ─────────────────────────── */

function PosterCard({ poster, editing, rank, count, onOpen, isPosterOpen, onUpdate, onSetOrder, onDelete, onError }) {
  const wrapRef = useRef(null);
  const copyRef = useRef(null);
  const stageRef = useRef(null);
  const [marquee, setMarquee] = useState(false);
  const [dur, setDur] = useState(20);

  // Only scroll when the text is wider than the poster. When it does, it's an infinite
  // right-to-left ticker (the text is duplicated and the track translates -50%). Duration
  // scales with the text width so the speed stays constant at 20px/s.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const copy = copyRef.current;
    if (!wrap || !copy) return;
    const textW = copy.scrollWidth;
    const over = textW > wrap.clientWidth + 1;
    setMarquee(over);
    if (over) setDur(Math.max(6, textW / 20));
  }, [poster.poster_text, editing]);

  const fit = fitBlob(poster.blob_aspect || '1 / 1', CARD_BLOB_W, CARD_BLOB_H);

  const handleBlobClick = (e) => {
    if (!editing && !poster.blob_image_url) return;
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) onOpen(rect);
  };

  const handleBlobUpload = async (e) => {
    const file = e.target.files?.[0];
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
      onError?.('Image upload unsuccessful. Please try a different file.');
      return;
    }
    if (validity === 'proportions') {
      onError?.('Image proportions are too extreme. Use an aspect ratio between 1:4 and 4:1.');
      return;
    }

    try {
      onError?.('');
      onUpdate({ blob_image_url: await uploadImage(file) });
    } catch (err) {
      console.error('Blob image upload failed:', err);
      onError?.('Image upload unsuccessful. Please try again.');
    }
  };

  return (
    <div className="cm-poster-unit">
      <div
        className={`cm-poster-card ${editing ? 'cm-poster-card--editing' : ''}`}
        style={{ background: poster.poster_color || '#1e2630' }}
      >
        <img src={borderImg} alt="" className="cm-poster-border cm-poster-border-left" />
        <img src={borderImg} alt="" className="cm-poster-border cm-poster-border-right" />
        <div
          className="cm-poster-border-h-wrap cm-poster-border-top-wrap"
          style={{ backgroundImage: `url(${borderHorizontalImg})` }}
          aria-hidden="true"
        />
        <div
          className="cm-poster-border-h-wrap cm-poster-border-bottom-wrap"
          style={{ backgroundImage: `url(${borderHorizontalImg})` }}
          aria-hidden="true"
        />

        {editing && (
          <button
            className="cm-poster-delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete poster"
          >
            x
          </button>
        )}

        <div
          className={`cm-poster-stage ${isPosterOpen ? 'cm-poster-stage--hidden' : ''}`}
          style={fit}
          ref={stageRef}
          onClick={handleBlobClick}
          onKeyDown={(e) => { if (e.key === 'Enter') handleBlobClick(e); }}
          role={poster.blob_image_url || editing ? 'button' : undefined}
          tabIndex={poster.blob_image_url || editing ? 0 : undefined}
          aria-label={
            poster.blob_image_url || editing
              ? `${editing ? 'Edit' : 'Open'} ${poster.poster_text || 'poster'}`
              : undefined
          }
        >
          {poster.blob_image_url ? (
            <FeatheredBlob
              image={poster.blob_image_url}
              aspectRatio={poster.blob_aspect || '1 / 1'}
              color={poster.poster_color || '#1e2630'}
              feather={BLOB_FEATHER}
              className="cm-float"
            />
          ) : (
            <div className="cm-poster-empty">No image</div>
          )}
        </div>

        {poster.poster_text && (
          <div className="cm-poster-text" ref={wrapRef}>
            <div
              className={`cm-marquee-track ${marquee ? 'cm-marquee-on' : ''}`}
              style={{ color: poster.poster_text_color || '#fff', '--cm-dur': `${dur}s` }}
            >
              <span ref={copyRef} className="cm-marquee-copy">{poster.poster_text}</span>
              {marquee && <span className="cm-marquee-copy" aria-hidden="true">{poster.poster_text}</span>}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="cm-poster-edit">
          <img src={borderBlackImg} alt="" className="cm-edit-border cm-edit-border-left" />
          <img src={borderBlackImg} alt="" className="cm-edit-border cm-edit-border-right" />
          <div
            className="cm-edit-border-h-wrap cm-edit-border-top-wrap"
            style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
            aria-hidden="true"
          />
          <div
            className="cm-edit-border-h-wrap cm-edit-border-bottom-wrap"
            style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
            aria-hidden="true"
          />

          <div className="cm-edit-hint">click poster to edit content</div>

          <div className="cm-row">
            <div className="cm-row-left">
              <div className="cm-stack">
                <label className="cm-color" style={{ background: poster.poster_color || '#1e2630' }}>
                  <input
                    type="color"
                    value={poster.poster_color || '#1e2630'}
                    onChange={(e) => onUpdate({ poster_color: e.target.value })}
                    hidden
                  />
                </label>
                <div className="cm-label">Poster</div>
              </div>

              <div className="cm-stack">
                <label className="cm-color title" style={{ background: poster.poster_text_color || '#ffffff' }}>
                  <input
                    type="color"
                    value={poster.poster_text_color || '#ffffff'}
                    onChange={(e) => onUpdate({ poster_text_color: e.target.value })}
                    hidden
                  />
                </label>
                <div className="cm-label">Title</div>
              </div>
            </div>

            <div className="cm-stack">
              <select
                className="cm-order"
                value={rank + 1}
                onChange={(e) => onSetOrder(Number(e.target.value) - 1)}
              >
                {Array.from({ length: count }, (_, n) => (
                  <option key={n} value={n + 1}>{n + 1}</option>
                ))}
              </select>
              <div className="cm-muted">order</div>
            </div>
          </div>

          <div>
            <input
              className="cm-edit-text"
              value={poster.poster_text || ''}
              onChange={(e) => onUpdate({ poster_text: e.target.value })}
              placeholder="Enter Poster Title"
              maxLength={40}
            />
            <div className="char-counter-wrap">
              <span className="char-counter">{(poster.poster_text || '').length}/40</span>
            </div>
          </div>

          <div className="cm-bottom">
            <label className="cm-edit-upload">
              EDIT BLOB IMAGE
              <input type="file" accept="image/*" hidden onChange={handleBlobUpload} />
            </label>

            <div className="cm-stack">
              <select
                className="cm-aspect"
                value={poster.blob_aspect || '1 / 1'}
                onChange={(e) => onUpdate({ blob_aspect: e.target.value })}
              >
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>{a.replace(/ /g, '')}</option>
                ))}
              </select>
              <div className="cm-muted">aspect ratio</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Expanded modal ─────────────────────────── */

function PosterModal({ poster, editing, revealing, onClose, onUpdate, onWarning }) {
  const content = poster.content ?? [];
  const setContent = (next) => onUpdate({ content: next });
  const addBlock = (block) => setContent([block, ...content]); // newest on top
  const updateBlock = (bi, patch) => setContent(content.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const removeBlock = (bi) => setContent(content.filter((_, i) => i !== bi));

  const revealCls = revealing ? ' cm-reveal' : '';

  return (
    <div
      className={`cm-modal-overlay${revealCls}`}
      style={{ '--cm-reveal-ms': `${REVEAL_MS}ms` }}
      onClick={onClose}
    >
      <div className="cm-modal-card">
        <div className={`cm-modal${revealCls}`} onClick={(e) => e.stopPropagation()}>
          <img src={borderImg} alt="" className="cm-modal-border cm-modal-border-left" />
          <img src={borderImg} alt="" className="cm-modal-border cm-modal-border-right" />
          <div
            className="cm-modal-border-h-wrap cm-modal-border-top-wrap"
            style={{ backgroundImage: `url(${borderHorizontalImg})` }}
            aria-hidden="true"
          />
          <div
            className="cm-modal-border-h-wrap cm-modal-border-bottom-wrap"
            style={{ backgroundImage: `url(${borderHorizontalImg})` }}
            aria-hidden="true"
          />

          <button type="button" className="cm-modal-close" onClick={onClose} aria-label="Close">X</button>

          <div className="cm-modal-header">
            <span className="cm-modal-title" style={{ color: poster.poster_text_color || '#fff' }}>
              {poster.poster_text || 'Untitled'}
            </span>
          </div>

          <div className="cm-modal-body">
            {editing && <BlockAdder onAdd={addBlock} onWarning={onWarning} />}

            {content.map((block, bi) =>
              editing ? (
                <BlockEditor
                  key={bi}
                  block={block}
                  onChange={(patch) => updateBlock(bi, patch)}
                  onRemove={() => removeBlock(bi)}
                />
              ) : (
                <ContentBlock key={bi} block={block} />
              )
            )}

            {content.length === 0 && !editing && <p className="cm-modal-empty">No media yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlobRevealLayer({ poster, reveal }) {
  const { rect, scale70, scaleFinal, dx, dy } = reveal;

  return createPortal(
    <div
      className="cm-blob-reveal"
      style={{
        '--cm-reveal-ms': `${REVEAL_MS}ms`,
        '--cm-blob-w': `${rect.width}px`,
        '--cm-blob-h': `${rect.height}px`,
        '--cm-blob-dx': `${dx}px`,
        '--cm-blob-dy': `${dy}px`,
        '--cm-blob-scale-70': scale70,
        '--cm-blob-scale': scaleFinal,
      }}
      aria-hidden="true"
    >
      <FeatheredBlob
        image={poster.blob_image_url}
        aspectRatio={poster.blob_aspect || '1 / 1'}
        color={poster.poster_color || '#1e2630'}
        feather={BLOB_FEATHER}
      />
    </div>,
    document.body,
  );
}

function BlockAdder({ onAdd, onWarning }) {
  const [open, setOpen] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const addImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      onWarning?.('');
      const items = [];
      for (const f of files) items.push({ kind: 'image', url: await uploadImage(f) });
      onAdd({ type: 'media', items });
    } catch (err) {
      console.error('Image upload failed:', err);
    }
    setOpen(false);
  };

  const addShortVideo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      onWarning?.('');
      const duration = await getVideoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) {
        onWarning?.(`Videos must be ${MAX_VIDEO_SECONDS} seconds or shorter. This file is ${Math.ceil(duration)} seconds.`);
        return;
      }
      const url = await uploadVideo(file);
      onAdd({ type: 'uploaded_video', url, width: '100' });
      setOpen(false);
    } catch (err) {
      console.error('Video upload failed:', err);
      onWarning?.('Video upload unsuccessful. Please try again.');
    }
  };

  const addVideo = () => {
    const url = videoUrl.trim();
    if (!url) return;
    onAdd({ type: 'media', items: [{ kind: 'video', url }] });
    setVideoUrl('');
    setVideoMode(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="cm-block-adder">
        <div className="duo-btn-wrap">
          <div className="duo-btn-pill" aria-hidden="true" />
          <button
            className="cm-add-btn duo-btn"
            style={{ '--duo-shadow': '#1c2a44' }}
            onClick={() => setOpen(true)}
          >
            + Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-block-adder cm-add-menu">
      <img src={borderBlackImg} alt="" className="cm-add-menu-border cm-add-menu-border-left" />
      <img src={borderBlackImg} alt="" className="cm-add-menu-border cm-add-menu-border-right" />
      <div
        className="cm-add-menu-border-h-wrap cm-add-menu-border-top-wrap"
        style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
        aria-hidden="true"
      />
      <div
        className="cm-add-menu-border-h-wrap cm-add-menu-border-bottom-wrap"
        style={{ backgroundImage: `url(${borderHorizontalBlackImg})` }}
        aria-hidden="true"
      />
      <button onClick={() => { onAdd({ type: 'title', value: '' }); setOpen(false); }}>Title</button>
      <button onClick={() => { onAdd({ type: 'text', value: '' }); setOpen(false); }}>Text</button>
      <label className="cm-add-upload">
        Image(s)
        <input type="file" accept="image/*" multiple hidden onChange={addImages} />
      </label>
      <label className="cm-add-upload">
        Short Video (≤{MAX_VIDEO_SECONDS}s)
        <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={addShortVideo} />
      </label>
      {!videoMode ? (
        <button onClick={() => setVideoMode(true)}>Video Link</button>
      ) : (
        <span className="cm-add-video">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="paste video link"
          />
          <button onClick={addVideo}>Add</button>
        </span>
      )}
      <button className="cm-add-cancel" onClick={() => { setOpen(false); setVideoMode(false); }} aria-label="Cancel">✕</button>
    </div>
  );
}

function BlockEditor({ block, onChange, onRemove }) {
  return (
    <div className="cm-block-edit">
      <button type="button" className="cm-poster-delete" onClick={onRemove} aria-label="Remove block">X</button>

      {block.type === 'title' && (
        <div>
          <input
            className="cm-block-title-input"
            value={block.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Title"
            maxLength={100}
          />
          <div className="char-counter-wrap">
            <span className="char-counter">{(block.value || '').length}/100</span>
          </div>
        </div>
      )}
      {block.type === 'text' && (
        <div>
          <textarea
            className="cm-block-text-input"
            value={block.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Text"
            maxLength={500}
          />
          <div className="char-counter-wrap">
            <span className="char-counter">{(block.value || '').length}/500</span>
          </div>
        </div>
      )}
      {block.type === 'media' && <MediaCarousel items={block.items} />}
      {block.type === 'uploaded_video' && (
        <>
          <UploadedVideoBlock block={block} />
          <div className="cm-video-width-row">
            <select
              className="cm-video-width cm-aspect"
              value={block.width || '100'}
              onChange={(e) => onChange({ width: e.target.value })}
            >
              {VIDEO_WIDTHS.map((w) => (
                <option key={w} value={w}>{w}%</option>
              ))}
            </select>
            <span className="cm-muted">width</span>
          </div>
        </>
      )}
    </div>
  );
}

function UploadedVideoBlock({ block }) {
  if (!block?.url) return null;
  const width = VIDEO_WIDTHS.includes(block.width) ? block.width : '100';
  return (
    <div className={`cm-video-block cm-video-block--${width}`}>
      <video className="cm-media-video" src={block.url} controls playsInline />
    </div>
  );
}

function ContentBlock({ block }) {
  if (block?.type === 'title') return <h3 className="cm-block-title">{block.value}</h3>;
  if (block?.type === 'text') return <p className="cm-block-text">{block.value}</p>;
  if (block?.type === 'media') return <MediaCarousel items={block.items} />;
  if (block?.type === 'uploaded_video') return <UploadedVideoBlock block={block} />;
  return null;
}

/* ─────────────────────────── Swipeable media carousel ─────────────────────────── */

function MediaCarousel({ items }) {
  const [active, setActive] = useState(0);
  const total = items?.length ?? 0;

  const onScroll = (e) => {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  if (!total) return null;

  return (
    <div className="cm-carousel">
      <div className="cm-carousel-track" onScroll={onScroll}>
        {items.map((it, i) => (
          <div className="cm-carousel-slide" key={i}>{renderMediaItem(it)}</div>
        ))}
      </div>
      {total > 1 && (
        <div className="cm-carousel-dots">
          {items.map((_, d) => (
            <span key={d} className={`cm-carousel-dot ${d === active ? 'is-active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

const BLOB_FEATHER = 4;
const ASPECTS = ['1 / 1', '4 / 3', '3 / 4', '16 / 9', '9 / 16', '3 / 2', '2 / 3'];

// Card inner area reserved for the blob (the .cm-poster-card is 300x450 with ~14px insets).
const CARD_BLOB_W = 272;
const CARD_BLOB_H = 422;

const newPoster = (order = 0) => ({
  blob_image_url: '',
  blob_aspect: '1 / 1',
  poster_color: '#1e2630',
  poster_text: 'New Poster',
  poster_text_color: '#ffffff',
  content: [],
  order,
});

function blobRevealMetrics(rect) {
  const scale70 = Math.min(
    (window.innerWidth * 0.7) / rect.width,
    (window.innerHeight * 0.7) / rect.height,
  );
  const scaleFinal = Math.min(
    (window.innerWidth * 0.9) / rect.width,
    (window.innerHeight * 0.9) / rect.height,
  );
  return { scale70, scaleFinal: Math.max(scaleFinal, scale70 * 1.08) };
}

// Largest aspect-correct box that fits within boxW x boxH — fills the card maximally
// without overflowing, for any blob aspect.
function fitBlob(aspect, boxW, boxH) {
  const [aw, ah] = aspect.split('/').map((s) => parseFloat(s));
  if (!aw || !ah) return { width: `${boxW}px`, height: `${boxH}px` };
  const scale = Math.min(boxW / aw, boxH / ah);
  return { width: `${aw * scale}px`, height: `${ah * scale}px` };
}

// Two-step signed upload (same flow as ReviewPage): get a URL, PUT bytes, return the public URL.
async function uploadImage(file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const { signedUrl, publicUrl } = await apiFetch('/storage/review-upload-url', {
    method: 'POST',
    body: { ext },
  });
  const res = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return publicUrl;
}

// Pull the 11-char id out of common YouTube URL shapes.
function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video file'));
    };
    video.src = url;
  });
}

function renderMediaItem(item) {
  if (!item?.url) return null;
  if (item.kind === 'video') {
    const id = youtubeId(item.url);
    if (id) {
      return (
        <iframe
          className="cm-media-frame"
          src={`https://www.youtube.com/embed/${id}`}
          title="video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return <video className="cm-media-video" src={item.url} controls />;
  }
  return <img className="cm-media-img" src={item.url} alt="" />;
}

export default React.memo(ClubMediaModule);
