import { FieldGroup, Field, Text, Area, Repeater } from './fields.jsx';
import ImageUpload from './ImageUpload.jsx';
import { EVENT_LIMITS } from '../../../shared/clubEventsValidation.js';

// Optional, and said so plainly. Most clubs will not have their semester planned when
// they claim their page, and a step that feels mandatory when it is not is a step people
// abandon on.
//
// Events are staged in the draft like everything else and only become real rows when the
// page is approved. An event created here immediately would show on the public calendar
// before anyone had reviewed the club.
export default function Events({ wizard, clubId }) {
    const events = wizard.draft.events ?? [];
    const setEvents = (next) => wizard.setEvents(next);
    const update = (i, patch) =>
        setEvents(events.map((e, j) => (j === i ? { ...e, ...patch } : e)));

    return (
        <>
            <h2 className="ob-h1">Events</h2>
            <p className="ob-lede">
                Anything students can turn up to: a first meeting, tryouts, a showcase.
                Skip this if you do not have dates yet. You can add events any time
                once your page is live.
            </p>

            <Repeater
                items={events}
                label="Event"
                addLabel={events.length === 0 ? '+ Add an event' : '+ Add another event'}
                max={EVENT_LIMITS.MAX_EVENTS}
                onAdd={() => setEvents([...events, blankEvent()])}
                onRemove={(i) => setEvents(events.filter((_, j) => j !== i))}
            >
                {(ev, i) => (
                    <>
                        <Field label="Name" value={ev.event_name} max={EVENT_LIMITS.NAME_MAX}>
                            <Text
                                value={ev.event_name}
                                onChange={(v) => update(i, { event_name: v })}
                                placeholder="First meeting of the semester"
                            />
                        </Field>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Starts">
                                <input
                                    type="datetime-local"
                                    className="ob-input"
                                    autoComplete="off"
                                    value={ev.start_time ?? ''}
                                    onChange={(e) => update(i, { start_time: e.target.value })}
                                />
                            </Field>
                            <Field label="Ends">
                                <input
                                    type="datetime-local"
                                    className="ob-input"
                                    autoComplete="off"
                                    value={ev.end_time ?? ''}
                                    // Default the end to an hour after the start the first
                                    // time a start is picked, since almost nobody wants to
                                    // type the same date twice.
                                    onChange={(e) => update(i, { end_time: e.target.value })}
                                />
                            </Field>
                        </div>

                        <Field label="Where" value={ev.where} max={EVENT_LIMITS.WHERE_MAX}>
                            <Text
                                value={ev.where}
                                onChange={(v) => update(i, { where: v })}
                                placeholder="Curry Student Center 333"
                            />
                        </Field>

                        <Field label="Details" value={ev.description} max={EVENT_LIMITS.DESCRIPTION_MAX}>
                            <Area
                                value={ev.description}
                                onChange={(v) => update(i, { description: v })}
                                rows={2}
                                placeholder="Come meet the e-board, we will have snacks and a few boards set up."
                            />
                        </Field>

                        <ImageUpload
                            label="Event Poster"
                            hint="Optional. A flyer or graphic students will recognise. Wide images look best."
                            shape="wide"
                            value={ev.image_url}
                            endpoint="/storage/event-poster-upload-url"
                            // Required by the endpoint since it started gating on
                            // requireModerator — without it the upload 400s with
                            // "club_id is required". Same shape as Basics.jsx.
                            body={{ club_id: clubId }}
                            onChange={(url) => update(i, { image_url: url })}
                        />

                        <FieldGroup label="Who can see it">
                            <label className="ob-check">
                                <input
                                    type="checkbox"
                                    checked={ev.is_members_only === true}
                                    onChange={(e) => update(i, { is_members_only: e.target.checked })}
                                />
                                <span>Members only</span>
                            </label>
                        </FieldGroup>
                    </>
                )}
            </Repeater>
        </>
    );
}

function blankEvent() {
    // Start at the next round hour tomorrow, running an hour, so a club that just wants
    // to adjust a date is not typing a full timestamp from scratch.
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
        event_name: '',
        where: '',
        description: '',
        start_time: toLocalInput(start),
        end_time: toLocalInput(end),
        image_url: '',
        is_members_only: false,
    };
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time. toISOString would convert to
// UTC and show the club a time they did not pick.
function toLocalInput(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
