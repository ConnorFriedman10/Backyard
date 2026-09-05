import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import "./ReviewList.css";
import { apiFetch } from "../lib/api";
import { useClubData } from "../context/useClubData";
import borderImg from '/src/assets/border-green.svg';
import borderHorizontalImg from '/src/assets/border-horizontal-green.svg';
import borderHorizontalGrayImg from '/src/assets/border-horizontal-gray.svg';

/* ── Helpers ── */

function formatRelativeDate(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    if (days < 14) return '1 week';
    const d = new Date(dateStr);
    return `'${String(d.getFullYear()).slice(-2)} ${d.getMonth() + 1} ${d.getDate()}`;
}

function formatLikeCount(n) {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n ?? 0);
}

function getImages(review) {
    if (Array.isArray(review.review_images) && review.review_images.length > 0) return review.review_images;
    if (review.review_image) return [review.review_image];
    return [];
}

/* ── Image with fallback ── */

function Img({ src, alt, className, onLoad }) {
    const [failed, setFailed] = useState(false);
    if (failed || !src) return <div className={`comment-img-placeholder ${className || ''}`}>No image</div>;
    return (
        <img
            src={src}
            alt={alt || ''}
            className={className}
            onError={() => setFailed(true)}
            onLoad={onLoad}
        />
    );
}

/* ── Image carousel ── */

function ImageCarousel({ images, onOrientationChange }) {
    const [index, setIndex] = useState(0);
    const total = images.length;
    if (!total) return null;

    const goPrev = (e) => { e.stopPropagation(); setIndex((i) => (i - 1 + total) % total); };
    const goNext = (e) => { e.stopPropagation(); setIndex((i) => (i + 1) % total); };

    const handleLoad = (e) => {
        const { naturalWidth: nw, naturalHeight: nh } = e.target;
        if (nw && nh && onOrientationChange) {
            const ratio = nw / nh;
            onOrientationChange(ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square');
        }
    };

    return (
        <div className="commentCarousel">
            <div className="comment-carousel__frame">
                <Img
                    src={images[index]}
                    alt="comment image"
                    className="comment-carousel__img"
                    onLoad={handleLoad}
                />
                {total > 1 && (
                    <>
                        <button className="comment-carousel__nav comment-carousel__nav--left" onClick={goPrev} aria-label="Previous">‹</button>
                        <button className="comment-carousel__nav comment-carousel__nav--right" onClick={goNext} aria-label="Next">›</button>
                    </>
                )}
            </div>
            {total > 1 && (
                <div className="comment-carousel__dots">
                    {images.map((_, i) => (
                        <span key={i} className={`comment-carousel__dot ${i === index ? 'is-active' : ''}`} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Editable image carousel (compose mode) ──
   Same single-slide-visible carousel, but every image is a real @dnd-kit
   sortable item (same wiring as the module accordion, horizontal instead of
   vertical). Dragging the active slide displaces its neighbors the same way
   accordion rows do; a trailing non-sortable "add photo" slide always comes
   last. Per-image natural dimensions are cached so the aspect box updates
   instantly when navigating, matching the read-only carousel's behavior. */

function EditableSlide({ image, onLoad }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`comment-carousel__slide${isDragging ? ' dragging' : ''}`}
            {...attributes}
            {...listeners}
        >
            <Img src={image.url} alt="comment image" className="comment-carousel__img" onLoad={onLoad} />
        </div>
    );
}

function EditableImageCarousel({ images, onOrientationChange, onReorder, onAddFiles, onRemove, onScale }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [dimsById, setDimsById] = useState({});
    const fileInputRef = useRef(null);
    const total = images.length + 1; // +1 for the trailing add-photo slide
    const clampedIndex = Math.min(activeIndex, total - 1);

    const goPrev = (e) => { e.stopPropagation(); setActiveIndex((i) => (i - 1 + total) % total); };
    const goNext = (e) => { e.stopPropagation(); setActiveIndex((i) => (i + 1) % total); };

    const handleSlideLoad = (id) => (e) => {
        const { naturalWidth: nw, naturalHeight: nh } = e.target;
        if (nw && nh) setDimsById((prev) => ({ ...prev, [id]: { nw, nh } }));
    };

    // Recompute orientation for whichever image is currently active — mirrors
    // the read-only carousel re-firing onLoad on every nav, but since every
    // image is already mounted here, we just look up its cached dimensions.
    useEffect(() => {
        const activeImage = images[clampedIndex];
        if (!activeImage) return;
        const dims = dimsById[activeImage.id];
        if (!dims || !onOrientationChange) return;
        const ratio = dims.nw / dims.nh;
        onOrientationChange(ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square');
    }, [clampedIndex, images, dimsById, onOrientationChange]);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = images.findIndex((img) => img.id === active.id);
        const newIndex = images.findIndex((img) => img.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        onReorder(arrayMove(images, oldIndex, newIndex));
        setActiveIndex(newIndex);
    };

    const handleFilePick = (e) => {
        const addedAt = images.length;
        onAddFiles(e.target.files);
        e.target.value = '';
        setActiveIndex(addedAt);
    };

    const activeImage = images[clampedIndex];

    return (
        <>
            {/* Above the add-photo slide, not overlaid on it — nesting these inside the
                draggable slide made them need repeated clicks (dnd-kit's drag listeners
                on the slide were intercepting the first pointerdown). */}
            {activeImage && (
                <div className="comment-carousel-toolbar">
                    <button
                        type="button"
                        className="comment-carousel__scale-btn"
                        onClick={() => onScale(activeImage.id)}
                        aria-label="Scale and crop photo"
                    >
                        SCALE
                    </button>
                    <button
                        type="button"
                        className="comment-carousel__remove-btn"
                        onClick={() => onRemove(activeImage.id)}
                        aria-label="Remove photo"
                    >
                        REMOVE
                    </button>
                </div>
            )}
            <div className="commentCarousel comment-carousel--editable">
            <div className="comment-carousel__frame">
                <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={images.map((img) => img.id)} strategy={horizontalListSortingStrategy}>
                        <div
                            className="comment-carousel__track"
                            style={{ transform: `translateX(-${clampedIndex * 100}%)` }}
                        >
                            {images.map((img) => (
                                <EditableSlide
                                    key={img.id}
                                    image={img}
                                    onLoad={handleSlideLoad(img.id)}
                                />
                            ))}
                            <div className="comment-carousel__slide comment-add-slide-wrap">
                                <button
                                    type="button"
                                    className="comment-add-slide"
                                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                    aria-label="Add photo"
                                >
                                    <span className="comment-add-slide-plus">+</span>
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleFilePick}
                                    style={{ display: 'none' }}
                                />
                            </div>
                        </div>
                    </SortableContext>
                </DndContext>

                {total > 1 && (
                    <>
                        <button className="comment-carousel__nav comment-carousel__nav--left" onClick={goPrev} aria-label="Previous">‹</button>
                        <button className="comment-carousel__nav comment-carousel__nav--right" onClick={goNext} aria-label="Next">›</button>
                    </>
                )}
            </div>

            {total > 1 && (
                <div className="comment-carousel__dots">
                    {Array.from({ length: total }).map((_, i) => (
                        <span key={i} className={`comment-carousel__dot ${i === clampedIndex ? 'is-active' : ''}`} />
                    ))}
                </div>
            )}
            </div>
        </>
    );
}

/* ── Like button — stacked heart over count ── */

function LikeButton({ count, isLiked, onToggle }) {
    return (
        <div
            className={`comment-likes${isLiked ? ' comment-likes--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggle(isLiked); }}
            role="button"
            tabIndex={0}
            aria-label={isLiked ? 'Unlike' : 'Like'}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        >
            <span className="comment-like-btn">♥</span>
            <span className="comment-like-count">{formatLikeCount(count)}</span>
        </div>
    );
}

/* ── Comment card ── */

export function CommentCard({ review, userVote, onVote, onToggleHide, editing, composeProps, onDelete }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [needsExpand, setNeedsExpand] = useState(false);
    const [expandedHeight, setExpandedHeight] = useState(null);
    const [imageOrientation, setImageOrientation] = useState('');
    const bodyRef = useRef(null);
    const isCompose = !!composeProps;

    const title = isCompose ? composeProps.title : (review.review_title?.trim() || '');
    const text = isCompose ? composeProps.text : (review.review_text?.trim() || '');
    const images = isCompose ? composeProps.images : getImages(review);
    const date = isCompose ? null : review.created_at;

    // Re-measure once expanded: the expand button switches from an absolute
    // overlay to static/in-flow at that point (see .comment-card[data-expanded]
    // .comment-expand-btn in the CSS), adding its own height to the content —
    // measuring before that switch would clip the "Less" button itself under
    // the old max-height.
    useEffect(() => {
        if (isCompose || !isExpanded || !bodyRef.current) return;
        setExpandedHeight(bodyRef.current.scrollHeight);
    }, [isCompose, isExpanded]);

    // Measure body height after render to decide if More button is needed
    useEffect(() => {
        if (isCompose) return;
        const check = () => {
            if (bodyRef.current && bodyRef.current.scrollHeight > 500) setNeedsExpand(true);
        };
        const t = setTimeout(check, 150);
        return () => clearTimeout(t);
    }, [isCompose]);

    return (
        <div
            className={`comment-card${!isCompose && review._pendingHidden && editing ? ' comment-card--hidden' : ''}`}
            data-expanded={isExpanded || undefined}
        >
            <img src={borderImg} alt="" className="comment-border comment-border-left" />
            <img src={borderImg} alt="" className="comment-border comment-border-right" />
            <div
                className="comment-border-h-wrap comment-border-top-wrap"
                style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                aria-hidden="true"
            />
            <div
                className="comment-border-h-wrap comment-border-bottom-wrap"
                style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                aria-hidden="true"
            />

            {/* Body shrinks/expands; footer stays visible. Transitions max-height
                between two real measured pixel values (like the module accordion's
                grid-template-rows 0fr/1fr trick) instead of an arbitrary large
                ceiling, so the motion tracks the actual content height evenly
                instead of snapping early and coasting through empty space. */}
            <div
                className={`comment-card__body${isCompose ? ' comment-card__body--compose' : ''}`}
                ref={bodyRef}
                style={!isCompose && isExpanded && expandedHeight ? { maxHeight: `${expandedHeight}px` } : undefined}
            >
                {isCompose ? (
                    <input
                        type="text"
                        className="comment-title comment-title-input"
                        value={title}
                        onChange={(e) => composeProps.onTitleChange(e.target.value)}
                        placeholder="Comment title"
                    />
                ) : (
                    title && <h4 className="comment-title">{title}</h4>
                )}
                {(isCompose || (title && (images.length > 0 || text))) && (
                    <div className="comment-divider" style={{ backgroundImage: `url(${borderHorizontalGrayImg})` }} />
                )}

                {(isCompose || images.length > 0) && (
                    <div className={`comment-image${imageOrientation ? ` ${imageOrientation}` : ''}`}>
                        {isCompose ? (
                            <EditableImageCarousel
                                images={images}
                                onOrientationChange={setImageOrientation}
                                onReorder={composeProps.onReorder}
                                onAddFiles={composeProps.onAddFiles}
                                onRemove={composeProps.onRemove}
                                onScale={composeProps.onScale}
                            />
                        ) : (
                            <ImageCarousel images={images} onOrientationChange={setImageOrientation} />
                        )}
                    </div>
                )}
                {(isCompose || (images.length > 0 && text)) && (
                    <div className="comment-divider" style={{ backgroundImage: `url(${borderHorizontalGrayImg})` }} />
                )}

                {isCompose ? (
                    <textarea
                        className="comment-text comment-text-input"
                        value={text}
                        onChange={(e) => composeProps.onTextChange(e.target.value)}
                        placeholder={composeProps.bodyPlaceholder}
                    />
                ) : (
                    text && <p className="comment-text">{text}</p>
                )}

                {!isCompose && needsExpand && !isExpanded && <div className="comment-expand-fade" />}
                {!isCompose && needsExpand && (
                    <button
                        className="comment-expand-btn"
                        onClick={(e) => { e.stopPropagation(); setIsExpanded((v) => !v); }}
                    >
                        {isExpanded ? 'Less' : 'More'}
                    </button>
                )}
            </div>

            {!isCompose && (
                <div className="comment-footer">
                    <div className="comment-footer-left">
                        {date && <span className="comment-date">{formatRelativeDate(date)}</span>}
                        {onDelete && (
                            <button
                                className="comment-delete-btn"
                                onClick={() => onDelete(review.id)}
                            >
                                Delete
                            </button>
                        )}
                    </div>
                    <LikeButton
                        count={review._liveScore}
                        isLiked={userVote === 1}
                        onToggle={(currentlyLiked) => onVote(currentlyLiked ? 0 : 1)}
                    />
                </div>
            )}

            {!isCompose && editing && (
                <label className="comment-hide-label">
                    <input
                        type="checkbox"
                        checked={!!review._pendingHidden}
                        onChange={() => onToggleHide(review.id, !review._pendingHidden)}
                        onClick={(e) => e.stopPropagation()}
                    />
                    Hide comment
                </label>
            )}
        </div>
    );
}

/* ── ReviewList (main export) ── */

export default function ReviewList({ reviews, editing, members, hideDraft = {}, onToggleHide, onDelete }) {
    const [userVotes, setUserVotes] = useState({});
    const [reviewScores, setReviewScores] = useState({});
    const { userId } = useClubData();

    // Seed live scores and fetch user votes
    useEffect(() => {
        setReviewScores(prev => {
            const next = { ...prev };
            reviews.forEach(r => { if (!(r.id in next)) next[r.id] = r.upvotes ?? 0; });
            return next;
        });

        if (!userId || reviews.length === 0) { setUserVotes({}); return; }

        const ids = reviews.map(r => r.id);
        apiFetch(`/me/votes?reviewIds=${ids.join(',')}`)
            .then(data => {
                const votes = {};
                (data || []).forEach(v => { votes[v.review_id] = v.vote; });
                setUserVotes(votes);
            })
            .catch(err => console.error('Error fetching votes:', err));
    }, [reviews, userId]);

    const handleVote = useCallback(async (id, newVote) => {
        const currentVote = userVotes[id] || 0;
        const oldScore = reviewScores[id] ?? 0;

        setUserVotes(prev => ({ ...prev, [id]: newVote }));
        setReviewScores(prev => ({ ...prev, [id]: oldScore + (newVote - currentVote) }));

        try {
            const resp = newVote === 0
                ? await apiFetch(`/me/votes/${id}`, { method: 'DELETE' })
                : await apiFetch('/me/votes', { method: 'POST', body: { review_id: id, vote: newVote } });
            if (resp && typeof resp.upvotes === 'number') {
                setReviewScores(prev => ({ ...prev, [id]: resp.upvotes }));
            }
        } catch (err) {
            console.error('Vote error:', err);
            setUserVotes(prev => ({ ...prev, [id]: currentVote }));
            setReviewScores(prev => ({ ...prev, [id]: oldScore }));
        }
    }, [userVotes, reviewScores]);

    const handleToggleHide = useCallback((reviewId, hidden) => {
        onToggleHide?.(reviewId, hidden);
    }, [onToggleHide]);

    const enriched = reviews.map(r => ({
        ...r,
        _liveScore: reviewScores[r.id] ?? (r.upvotes ?? 0),
        _pendingHidden: r.id in hideDraft ? hideDraft[r.id] : (r.is_hidden || r.isHidden || false),
    }));
    const visible = editing ? enriched : enriched.filter(r => !r._pendingHidden);

    const memberIds = useMemo(() => new Set((members || []).map(m => m.user_id)), [members]);
    const activeReviews = visible.filter(r => memberIds.has(r.user_id));

    return (
        <div className="review-item">
            <p className="divider-header">Participant Posts</p>
            {editing && (
                <p className="about-edit-help">
                    Hide user comments you don't want people to see.
                </p>
            )}

            {activeReviews.length > 0 ? (
                <div className="rl-comments-row">
                    {activeReviews.map(review => (
                        <CommentCard
                            key={review.id}
                            review={review}
                            userVote={userVotes[review.id] || 0}
                            onVote={(val) => handleVote(review.id, val)}
                            onToggleHide={handleToggleHide}
                            editing={editing}
                            onDelete={userId && review.user_id === userId ? onDelete : undefined}
                        />
                    ))}
                </div>
            ) : (
                <p className="comment-empty">No comments yet</p>
            )}
        </div>
    );
}
