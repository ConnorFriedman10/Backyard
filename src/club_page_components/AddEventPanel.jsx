import { useState, useRef, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { apiFetch } from '../lib/api';
import newEventBtnImg from '../assets/New_Event_Btn.png';
import newEventBtnHoverImg from '../assets/New_Event_Btn_On_Hover.png';
import newAddPosterImg from '../assets/New_add_poster.png';
import borderImg from '../assets/border.svg';
import borderHorizontalImg from '../assets/border-horizontal.svg';
import EventPosterCropModal from './EventPosterCropModal';
import PortraitTitle from '../uni_components/PortraitTitle';
import FriendRsvpCallout from '../components/FriendRsvpCallout';
import '../uni_components/EventInfoRow.css';
import './AddEventPanel.css';

const EMPTY_FORM = { eventName: '', start: '', end: '', where: '', description: '', membersOnly: false, allDay: false };

// Cropping (EventPosterCropModal) re-compresses to JPEG at 0.92 quality, which would
// bring nearly any phone photo under this — but cropping is optional here, so an
// uncropped raw camera photo (easily 8-10MB+ on a modern phone) can go straight to
// the PUT and get rejected by the bucket's own size limit with a bare "upload failed".
// This catches it up front with an actionable message instead.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// datetime-local inputs need "YYYY-MM-DDTHH:mm" (no seconds/timezone)
function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Fixed event-management row — pinned at the top of the club page, right below
 * CalendarModule's "Coming Up" read-only list, for approved club owners only.
 * Lists the club's existing events (to the right of the add slot) so editors
 * can edit or delete them.
 *
 * @param {boolean}  isApproved   - true for approved club owners; renders nothing otherwise
 * @param {Object}   club         - club record (used for its image_url, as a
 *                                   poster placeholder for events with no image)
 * @param {Array}    events       - the club's events (same list CalendarModule shows)
 * @param {Function} onAddEvent   - ({ eventName, description, where, startTime, endTime, imageUrl, isMembersOnly }) => Promise<void>
 * @param {Function} onEditEvent  - (eventId, { ...same shape as onAddEvent }) => Promise<void>
 * @param {Function} onDeleteEvent - (eventId) => Promise<void>
 * @param {Set}      myRsvpSet    - event IDs the current user (an approved editor) has RSVPd to
 * @param {Map}      friendRsvpMap - event ID → [{ username, ... }]
 * @param {Function} onRsvp       - (eventId, isCurrentlyGoing) => void
 * @param {string}   userId       - null if not logged in
 */
export default function AddEventPanel({
  isApproved = false,
  club,
  events = [],
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  myRsvpSet = new Set(),
  friendRsvpMap = new Map(),
  onRsvp,
  userId,
}) {
  const imageInputRef = useRef(null);

  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [formWarning, setFormWarning] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  // Every card in the row — the "new event" button and each existing event —
  // lives in its own .cal-add-slot, so any one of them can independently morph
  // into the (shared) cal-form. Only one slot is ever expanded at a time.
  // Height is animated between the collapsed card's compact size and the
  // form's real (measured) height — same technique as the comment card's
  // More/Less, itself derived from the module accordion's grid-template-rows
  // 0fr/1fr trick.
  const addSlotRef = useRef(null);
  const [addSlotHeight, setAddSlotHeight] = useState(null);
  const editSlotRefs = useRef({});
  const [editSlotHeight, setEditSlotHeight] = useState(null);

  // Compact <-> expanded toggle for read-only event cards (More/Less), same
  // measured max-height technique as the edit-form morph above — several
  // cards can be expanded at once, so heights are tracked per event id.
  const [expandedEventIds, setExpandedEventIds] = useState(() => new Set());
  const [cardHeights, setCardHeights] = useState({});

  const toggleCardExpanded = (eventId) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  useEffect(() => {
    if (expandedEventIds.size === 0) return;
    const next = {};
    expandedEventIds.forEach((id) => {
      const el = editSlotRefs.current[id];
      if (el) next[id] = el.scrollHeight;
    });
    setCardHeights((prev) => ({ ...prev, ...next }));
  }, [expandedEventIds]);

  // Re-measure the add-slot whenever it's the one open and its content
  // changes shape (image added/removed, warning appears, etc.).
  useEffect(() => {
    if (showForm && !editingEventId && addSlotRef.current) {
      setAddSlotHeight(addSlotRef.current.scrollHeight);
    }
  }, [showForm, editingEventId, imagePreview, formWarning]);

  // Same, but for whichever existing event's slot is currently being edited.
  useEffect(() => {
    if (editingEventId && editSlotRefs.current[editingEventId]) {
      setEditSlotHeight(editSlotRefs.current[editingEventId].scrollHeight);
    }
  }, [editingEventId, imagePreview, formWarning]);

  function validateForm() {
    const { start: startVal, end: endVal, description, allDay } = formData;
    if (description.length > 200) { setFormWarning('Description must be 200 characters or fewer.'); return false; }
    if (!startVal) { setFormWarning('Please fill in a start date.'); return false; }
    if (!allDay && !endVal) { setFormWarning('Please fill in the start and end times.'); return false; }
    if (allDay) {
      const start = new Date(`${startVal}T00:00:00`);
      if (isNaN(start)) { setFormWarning('Invalid date format.'); return false; }
      if (start < new Date(new Date().toDateString())) { setFormWarning('Event cannot begin in the past.'); return false; }
    } else {
      const start = new Date(startVal);
      const end = new Date(endVal);
      if (isNaN(start) || isNaN(end)) { setFormWarning('Invalid date or time format.'); return false; }
      if (start < new Date()) { setFormWarning('Event cannot begin in the past.'); return false; }
      if (start >= end) { setFormWarning('Start time must be before end time.'); return false; }
      if (end - start > 12 * 60 * 60 * 1000) { setFormWarning('Event cannot last more than 12 hours.'); return false; }
    }
    setFormWarning('');
    return true;
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Not rejected here even if oversized: Scale/Crop (still reachable below, since it
    // only needs imageFile set) re-compresses to JPEG and usually brings a raw phone
    // photo well under the limit. The real gate is in handleSubmit, after cropping has
    // had its chance.
    setFormWarning('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleCropConfirm = (newFile) => {
    setImageFile(newFile);
    setImagePreview(URL.createObjectURL(newFile));
    setShowCropModal(false);
  };

  // When editing an existing event the poster is a remote URL, not a local File.
  // Fetch it as a blob so the crop modal (which needs a File) can work with it.
  const handleScaleClick = async () => {
    if (imageFile) { setShowCropModal(true); return; }
    if (!imagePreview) return;
    try {
      const res = await fetch(imagePreview);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const fetched = new File([blob], 'poster.jpg', { type: blob.type || 'image/jpeg' });
      setImageFile(fetched);
      setShowCropModal(true);
    } catch {
      setFormWarning('Could not load the existing poster for cropping. Try uploading a new image instead.');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingEventId(null);
    setFormData(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
    setFormWarning('');
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    // Checked here rather than at file-select: cropping (optional, via Scale/Crop)
    // re-compresses to JPEG and usually shrinks a raw phone photo well under this —
    // by submit time that's already happened if it was going to. Without this check,
    // an oversized file reaches the PUT and comes back as a bare "Image upload failed."
    if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
      setFormWarning('That image is too large. Use Scale/Crop to shrink it before sending.');
      return;
    }
    setIsSubmitting(true);
    try {
      let imageUrl = null;
      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'jpg';
        const { signedUrl, publicUrl } = await apiFetch('/storage/event-poster-upload-url', {
          method: 'POST',
          body: { ext, club_id: club.id },
        });
        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          body: imageFile,
          headers: { 'Content-Type': imageFile.type || 'application/octet-stream' },
        });
        if (!uploadRes.ok) throw new Error('Image upload failed.');
        imageUrl = publicUrl;
      } else if (imagePreview) {
        // editing an event whose poster wasn't changed — keep the existing URL
        imageUrl = imagePreview;
      }

      const payload = {
        eventName: formData.eventName,
        description: formData.description,
        where: formData.where,
        startTime: formData.allDay ? `${formData.start}T00:00:00` : `${formData.start}:00`,
        endTime: formData.allDay ? `${formData.start}T23:59:00` : `${formData.end}:00`,
        imageUrl,
        isMembersOnly: formData.membersOnly,
      };

      if (editingEventId) {
        await onEditEvent?.(editingEventId, payload);
      } else {
        await onAddEvent?.(payload);
      }
      resetForm();
    } catch (err) {
      setFormWarning(err.message || 'Failed to save event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (event) => {
    setEditingEventId(event.id);
    setFormData({
      eventName: event.event_name || '',
      start: toDatetimeLocalValue(event.start_time),
      end: toDatetimeLocalValue(event.end_time),
      where: event.where || '',
      description: event.event_description || '',
      membersOnly: !!event.is_members_only,
    });
    setImageFile(null);
    setImagePreview(event.event_image_url || null);
    setFormWarning('');
  };

  if (!isApproved) return null;

  // The add-btn and cal-form occupy the same slot — clicking the button
  // morphs it into the form in place (see .cal-add-slot below).
  const addEventButton = (
    <button
      className="cal-add-btn"
      onClick={() => setShowForm(true)}
      style={{ '--cal-add-btn-bg': `url(${newEventBtnImg})`, '--cal-add-btn-bg-hover': `url(${newEventBtnHoverImg})` }}
    >
      <img src={borderImg} alt="" className="cal-add-btn-border cal-add-btn-border-left" />
      <img src={borderImg} alt="" className="cal-add-btn-border cal-add-btn-border-right" />
      <div
        className="cal-add-btn-border-h cal-add-btn-border-h-top"
        style={{ backgroundImage: `url(${borderHorizontalImg})` }}
      />
      <div
        className="cal-add-btn-border-h cal-add-btn-border-h-bottom"
        style={{ backgroundImage: `url(${borderHorizontalImg})` }}
      />
    </button>
  );

  const addEventForm = (
    <div className="cal-form">
      <img src={borderImg} alt="" className="cal-form-border cal-form-border-left" />
      <img src={borderImg} alt="" className="cal-form-border cal-form-border-right" />
      <div
        className="cal-form-border-h cal-form-border-h-top"
        style={{ backgroundImage: `url(${borderHorizontalImg})` }}
      />
      <div
        className="cal-form-border-h cal-form-border-h-bottom"
        style={{ backgroundImage: `url(${borderHorizontalImg})` }}
      />

      <div className="cal-form-header">
        <button
          type="button"
          className="cal-form-close-btn"
          onClick={resetForm}
          disabled={isSubmitting}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Sits above the upload tile, not overlaid on it — same reasoning as the
          comment carousel's toolbar (avoids swallowing the tile's own click) */}
      {(imageFile || imagePreview) && (
        <div className="cal-image-toolbar">
          <button
            type="button"
            className="cal-image-scale-btn"
            onClick={handleScaleClick}
            aria-label="Scale poster"
          >
            SCALE
          </button>
          <button
            type="button"
            className="cal-image-remove-btn"
            onClick={handleRemoveImage}
            aria-label="Remove poster"
          >
            REMOVE
          </button>
        </div>
      )}

      <button
        type="button"
        className="cal-image-trigger"
        onClick={() => imageInputRef.current?.click()}
      >
        {imagePreview ? (
          <img className="cal-poster-preview" src={imagePreview} alt="" />
        ) : (
          <div className="cal-poster-placeholder-wrap">
            <img className="cal-poster-placeholder" src={newAddPosterImg} alt="Upload event poster" />
            <span className="cal-poster-plus">+</span>
          </div>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageChange}
        />
      </button>

      <div className="cal-divider" />

      <input
        className="cal-input"
        type="text"
        name="eventName"
        value={formData.eventName}
        onChange={handleFormChange}
        placeholder="Event Name (Optional)"
      />
      <label className="cal-allday-label">
        <input
          type="checkbox"
          name="allDay"
          checked={formData.allDay}
          onChange={(e) => setFormData(prev => ({ ...prev, allDay: e.target.checked, start: '', end: '' }))}
        />
        <span>All Day</span>
      </label>
      <div className="cal-datetime-field">
        <span className="cal-datetime-label">Start</span>
        <input
          className="cal-input"
          type={formData.allDay ? 'date' : 'datetime-local'}
          name="start"
          value={formData.start}
          onChange={handleFormChange}
          data-empty={!formData.start ? 'true' : undefined}
        />
      </div>
      {!formData.allDay && (
        <div className="cal-datetime-field">
          <span className="cal-datetime-label">End</span>
          <input
            className="cal-input"
            type="datetime-local"
            name="end"
            value={formData.end}
            onChange={handleFormChange}
            data-empty={!formData.end ? 'true' : undefined}
          />
        </div>
      )}
      <input
        className="cal-input"
        type="text"
        name="where"
        value={formData.where}
        onChange={handleFormChange}
        placeholder="Where (Optional)"
      />
      <input
        className="cal-input"
        type="text"
        name="description"
        value={formData.description}
        onChange={handleFormChange}
        placeholder="About (Optional)"
        maxLength={200}
      />

      {formWarning && <p className="cal-form-warning">{formWarning}</p>}

      <div className="cal-form-footer">
        <label className="cal-members-only-label">
          <input
            type="checkbox"
            name="membersOnly"
            checked={formData.membersOnly}
            onChange={(e) => setFormData(prev => ({ ...prev, membersOnly: e.target.checked }))}
          />
          <span>Members Only</span>
        </label>

        <div className="duo-btn-wrap cal-submit-wrap">
          <div className="duo-btn-pill" aria-hidden="true" />
          <button
            className="cal-submit-btn duo-btn"
            style={{ '--duo-shadow': 'rgb(150, 150, 150)' }}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? (editingEventId ? 'Saving...' : 'Adding...')
              : (editingEventId ? 'Save Changes' : 'Add Event')}
          </button>
        </div>
      </div>
    </div>
  );

  const sortedEvents = [...events].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  return (
    <div className="add-event-panel">
      <p className="divider-header">Coming Up</p>
      <p className="about-edit-help">Add, manage, and edit your club events here.</p>

      <div className="add-event-row">
        <div
          className="cal-add-slot"
          ref={addSlotRef}
          style={showForm && !editingEventId && addSlotHeight ? { maxHeight: `${addSlotHeight}px` } : undefined}
        >
          {showForm && !editingEventId ? addEventForm : addEventButton}
        </div>

        {sortedEvents.map((event) => {
          const isEditingThis = editingEventId === event.id;
          const start = parseISO(event.start_time);
          const end = parseISO(event.end_time);
          const friends = friendRsvpMap.get(event.id);
          const isGoing = myRsvpSet.has(event.id);
          const isExpandedThis = expandedEventIds.has(event.id);
          return (
            <div
              key={event.id}
              className="cal-add-slot"
              ref={(el) => { editSlotRefs.current[event.id] = el; }}
              style={
                isEditingThis && editSlotHeight
                  ? { maxHeight: `${editSlotHeight}px` }
                  : (isExpandedThis && cardHeights[event.id] ? { maxHeight: `${cardHeights[event.id]}px` } : undefined)
              }
            >
              {isEditingThis ? addEventForm : (
                <div className={`add-event-card${isExpandedThis ? ' add-event-card--expanded' : ''}`}>
                  <img src={borderImg} alt="" className="add-event-card-border add-event-card-border-left" />
                  <img src={borderImg} alt="" className="add-event-card-border add-event-card-border-right" />
                  <div
                    className="add-event-card-border-h add-event-card-border-h-top"
                    style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                  />
                  <div
                    className="add-event-card-border-h add-event-card-border-h-bottom"
                    style={{ backgroundImage: `url(${borderHorizontalImg})` }}
                  />

                  <div className="add-event-card-actions">
                    <button
                      type="button"
                      className="cal-image-scale-btn"
                      onClick={() => handleEditClick(event)}
                      aria-label="Edit event"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      className="cal-image-remove-btn"
                      onClick={() => onDeleteEvent?.(event.id)}
                      aria-label="Delete event"
                    >
                      DELETE
                    </button>
                  </div>

                  <img
                    className={`add-event-card-img${!event.event_image_url ? ' add-event-card-img--default' : ''}`}
                    src={event.event_image_url || club?.image_url || '/raccoon_pfp.png'}
                    alt=""
                  />

                  {isExpandedThis ? (
                    <div className="add-event-card-body">
                      <PortraitTitle text={event.event_name} />
                      {event.where && (
                        <p className="cal-info-row">
                          <span className="cal-info-label">where</span>
                          <span className="cal-info-value">{event.where}</span>
                        </p>
                      )}
                      <p className="cal-info-row">
                        <span className="cal-info-label">when</span>
                        <span className="cal-info-value">
                          {format(start, 'EEE MMM d')} {format(start, 'h:mm a')}–{format(end, 'h:mm a')}
                        </span>
                      </p>
                      {event.event_description && (
                        <p className="cal-info-row">
                          <span className="cal-info-label">about</span>
                          <span className="cal-info-value">{event.event_description}</span>
                        </p>
                      )}
                      {event.is_members_only && (
                        <span className="cal-members-badge">Members only</span>
                      )}
                      <FriendRsvpCallout friends={friends} />
                      {userId && (
                        <button
                          className={`rsvp-button${isGoing ? ' rsvp-going' : ''}`}
                          onClick={() => onRsvp?.(event.id, isGoing)}
                        >
                          {isGoing ? 'Going ✓' : "I'm going!"}
                        </button>
                      )}
                      <div className="add-event-card-toggle-row">
                        <button
                          type="button"
                          className="add-event-expand-btn"
                          onClick={() => toggleCardExpanded(event.id)}
                        >
                          Less
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="add-event-card-body">
                      <p className="add-event-card-date">{format(start, 'EEE, MMM d').toUpperCase()}</p>
                      <PortraitTitle text={event.event_name} />
                      <div className="add-event-card-toggle-row">
                        <button
                          type="button"
                          className="add-event-expand-btn"
                          onClick={() => toggleCardExpanded(event.id)}
                        >
                          More
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCropModal && imageFile && (
        <EventPosterCropModal
          file={imageFile}
          onCancel={() => setShowCropModal(false)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
