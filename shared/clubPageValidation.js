// Validation for the club_page_data.modules JSONB blob.
//
// These rules lived only in src/uni_components/ExpandedTile.jsx, which meant
// PUT /clubs/:clubId/page enforced none of them — it checked Array.isArray(modules),
// ran profanity checks, and stored whatever it was handed. Every length cap and URL
// check was bypassable by calling the API directly. Sharing them lets the server
// enforce exactly what the editor displays.
//
// The per-module validators are moved verbatim from ExpandedTile so behaviour is
// unchanged for existing editors; validateModules and LIMITS are new.

export const LIMITS = {
    CLUB_NAME_MAX: 80,
    DESCRIPTION_MAX: 2000,
    LINK_NAME_MAX: 15,
    TAB_TITLE_MAX: 60,
    TAB_BODY_MAX: 500,
    FAQ_Q_MAX: 200,
    FAQ_A_MAX: 500,
    MEMBER_NAME_MAX: 50,
    MEMBER_BIO_MAX: 500,
    CATEGORY_NAME_MAX: 25,
    POSTER_TITLE_MAX: 100,
    CONTENT_TEXT_MAX: 500,
    MAX_MODULES: 16,
    MAX_POSTERS: 24,
    MAX_MEMBERS: 200,
    MAX_FAQS: 30,
    MAX_TABS: 10,
    // Comfortably under the global express.json({ limit: '100kb' }) so an oversized
    // payload produces a message someone can act on rather than an opaque 413.
    MAX_SERIALIZED_BYTES: 80_000,
};

export const KNOWN_MODULE_TYPES = new Set([
    'basic_info', 'links', 'club_media', 'join',
    'faqs', 'stats', 'member_roster', 'calendar', 'comments',
]);

// Available in every browser and in Node 11+, so one implementation serves both sides.
const encoder = new TextEncoder();
const utf8Bytes = (s) => encoder.encode(s).length;

// A same-origin path or an absolute http(s) URL. Still blocks javascript: and data:,
// which is the point — this value lands in demo_club_data.image_url and renders as
// <img src>. Relative paths have to pass because ExpandedTile seeded '/raccoon_pfp.png'
// as the default logo and clubs persisted it; rejecting those would disable Save on
// every page created before /page/init existed, with a warning they could not clear.
export const isSafeImageRef = (value) => {
    if (typeof value !== 'string') return false;
    if (value.startsWith('//')) return false; // protocol-relative — off-origin
    if (value.startsWith('/')) return true;
    return isValidUrl(value);
};

// Entities and tags are markup, not characters a club typed. Measuring the raw string
// meant sanitizing '&' into '&amp;' inflated a 480-character body past the 500 cap that
// the wizard's own counter had just called fine.
export function visibleLength(html) {
    return String(html ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, 'x')
        .trim().length;
}

// Strict: the value has to carry its own scheme. Used for image sources, where a bare
// "example.com/a.png" would be read as a relative path and quietly 404.
export const isValidUrl = (url) => {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
};

// Anything with a scheme already, e.g. "https:", "javascript:", "mailto:".
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * What a club types, turned into a URL, or null if it cannot be one.
 *
 * new URL() throws without a scheme, so validating raw input rejected
 * "instagram.com/neuchess", "www.instagram.com" and every other form anyone actually
 * types. Only a pasted, fully-qualified address passed, which is not how people write
 * their own Instagram down. Clubs read that as "the site says my link is wrong".
 *
 * A missing scheme is assumed to be https. A scheme that IS present is left alone and
 * then checked, so javascript: and data: are still rejected rather than being wrapped
 * into something that looks safe.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    // An address in a link field means "write to us", so it becomes a mailto rather than
    // being mangled. Assuming https turned "chess@northeastern.edu" into
    // "https://chess@northeastern.edu", which parses, keeps the address as userinfo, and
    // sends anyone clicking it to northeastern.edu.
    if (!HAS_SCHEME.test(raw) && LOOKS_LIKE_EMAIL.test(raw)) return `mailto:${raw}`;

    try {
        const u = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`);

        if (u.protocol === 'mailto:') return u.toString();
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

        // Reject credentials in the authority. "https://explorethebackyard.com@evil.com"
        // reads as our domain to anyone glancing at it and resolves to evil.com, which is
        // the oldest link-spoofing trick there is and has no legitimate use here.
        if (u.username || u.password) return null;

        // A hostname with no dot is a typo or a bare word, not a site. Without this,
        // "chess club" becomes https://chess%20club and passes.
        if (!u.hostname.includes('.')) return null;

        return u.toString();
    } catch {
        return null;
    }
}

/** For links a person typed, where the scheme is optional. */
export const isValidLinkUrl = (value) => normalizeUrl(value) !== null;

// Every validator takes { partial }. A draft autosave fires while someone is still
// typing, so "you have not filled this in yet" is not an error there — only "what you
// typed is not allowed" is. Completeness is enforced once, at submit, by
// shared/onboardingDraft.js. Without this split the wizard 400s on the first keystroke
// of every step.
export function validateBasicInfo(data, { partial = false } = {}) {
    console.log(data);
    if (!partial && !data?.club_name?.trim()) return 'Club name cannot be empty.';
    if ((data?.club_name ?? '').trim().length > LIMITS.CLUB_NAME_MAX) return 'Club name must be 80 characters or fewer.';
    if (!partial && !data?.description?.trim()) return 'Description cannot be empty.';
    // Matches DESCRIPTION_MAX in clubDetailsValidation. approve copies this into
    // demo_club_data.club_description, where that cap applies — so without it here an
    // over-long description submitted cleanly and then 400'd the admin on every
    // approve attempt, with no way for the club to know.
    if ((data?.description ?? '').trim().length > LIMITS.DESCRIPTION_MAX) {
        return 'Description must be 2000 characters or fewer.';
    }
    // logo_url was never checked, and PUT /page copies it into demo_club_data.image_url,
    // from which it is rendered as an <img src>. Restricting it to http(s) keeps
    // javascript: and data: URLs out of a column that is read back into markup.
    // ?. like its siblings. Without it, validateModules([{type:'basic_info'}], {partial})
    // threw a TypeError and the draft-save path 500'd — reachable from the wizard the
    // moment a module exists with no data yet.
    if (data?.logo_url && !isSafeImageRef(data.logo_url)) return 'The logo address is not a valid link.';
    for (const l of (data?.links ?? [])) {
        if ((l.name ?? '').length > LIMITS.LINK_NAME_MAX) return 'Link names must be 15 characters or fewer.';
        // Lenient on the scheme: a club writing "instagram.com/ourclub" means a link.
        if (l.url && !isValidLinkUrl(l.url)) return 'One or more link URLs are invalid.';
    }
    return null;
}

export function validateLinks(basicInfoData) {
    for (const l of (basicInfoData?.links ?? [])) {
        if ((l.name ?? '').length > LIMITS.LINK_NAME_MAX) return 'Link names must be 15 characters or fewer.';
        // Lenient on the scheme: a club writing "instagram.com/ourclub" means a link.
        if (l.url && !isValidLinkUrl(l.url)) return 'One or more link URLs are invalid.';
    }
    return null;
}

export function validateJoin(data, { partial = false } = {}) {
    const tabs = data?.tabs ?? [];
    if (tabs.length > LIMITS.MAX_TABS) return 'Too many tabs.';
    for (const tab of tabs) {
        if (!partial && !tab.title?.trim()) return 'Each tab must have a title.';
        if ((tab.title ?? '').trim().length > LIMITS.TAB_TITLE_MAX) return 'Tab titles must be 60 characters or fewer.';
        if (!partial && !tab.body?.trim()) return 'Each tab must have body text.';
        if (visibleLength(tab?.body) > LIMITS.TAB_BODY_MAX) return 'Tab body must be 500 characters or fewer.';
    }
    return null;
}

export function validateStats(data, { partial = false } = {}) {
    const stats = data?.stats ?? [];
    for (const s of stats) {
        if (s.value < 0) return 'Stat values cannot be negative.';
        if (s.value % 1 !== 0) return 'Stat value must be a whole number.';
        if (s.type === 'quantitative') {
            if (!partial && !s.unit1?.trim()) return 'Each quantitative stat must have a unit.';
        }
        if (s.type === 'qualitative') {
            if (!partial && !s.label?.trim()) return 'Each qualitative stat must have a name.';
            const max = s.max ?? 10;
            if (max < 1) return 'Max must be at least 1.';
            if (s.value > max) return 'A stat value exceeds its max.';
            if (max % 1 !== 0) return 'Max must be a whole number.';
        }
    }
    return null;
}

export function validateFaq(data, { partial = false } = {}) {
    const faqs = data?.faqs ?? [];
    if (faqs.length > LIMITS.MAX_FAQS) return 'Too many FAQs.';
    for (const f of faqs) {
        if (!partial && !f.q?.trim()) return 'Each FAQ must have a question.';
        if ((f.q ?? '').trim().length > LIMITS.FAQ_Q_MAX) return 'FAQ questions must be 200 characters or fewer.';
        if (f.a && f.a.length > LIMITS.FAQ_A_MAX) return 'FAQ answers must be 500 characters or fewer.';
    }
    return null;
}

export function validateMemberRoster(data, { partial = false } = {}) {
    const categories = data?.categories ?? [];
    const members = data?.members ?? [];
    if (members.length > LIMITS.MAX_MEMBERS) return 'Too many members.';
    for (const c of categories) {
        if (!partial && !c?.trim()) return 'Category names cannot be empty.';
        if ((c ?? '').trim().length > LIMITS.CATEGORY_NAME_MAX) return 'Category names must be 25 characters or fewer.';
    }
    for (const m of members) {
        if (!partial && !m?.name?.trim()) return 'Each member must have a name.';
        if ((m?.name ?? '').trim().length > LIMITS.MEMBER_NAME_MAX) return 'Member names must be 50 characters or fewer.';
        // Measured on visible text, so neither formatting tags nor entity-escaping eat
        // into the budget the editor's counter is showing.
        if (visibleLength(m?.bio) > LIMITS.MEMBER_BIO_MAX) return 'Member bios must be 500 characters or fewer.';
    }
    return null;
}

export function validateComments() { return null; }
export function validateCalendar() { return null; }

export function validateClubMedia(data) {
    const posters = data?.posters ?? [];
    if (posters.length > LIMITS.MAX_POSTERS) return 'Too many posters.';
    const validWidths = new Set(['50', '70', '100']);
    for (const p of posters) {
        if (p.poster_text && p.poster_text.length > LIMITS.POSTER_TITLE_MAX) return 'Poster titles must be 100 characters or fewer.';
        for (const block of (p.content ?? [])) {
            if (block.type === 'title' && block.value && block.value.length > LIMITS.POSTER_TITLE_MAX) return 'Content headings must be 100 characters or fewer.';
            if (block.type === 'text' && block.value && block.value.length > LIMITS.CONTENT_TEXT_MAX) return 'Content text must be 500 characters or fewer.';
            if (block.type === 'uploaded_video' && block.width && !validWidths.has(String(block.width))) {
                return 'Video width must be 50%, 70%, or 100%.';
            }
        }
    }
    return null;
}

const VALIDATORS = {
    basic_info: validateBasicInfo,
    join: validateJoin,
    stats: validateStats,
    faqs: validateFaq,
    member_roster: validateMemberRoster,
    club_media: validateClubMedia,
    comments: validateComments,
    calendar: validateCalendar,
};

export function getModuleWarnings(draft) {
    const w = {};
    const basicInfo = draft.find((m) => m.type === 'basic_info');
    for (const m of draft) {
        if (m.type === 'links') { w.links = validateLinks(basicInfo?.data); continue; }
        const fn = VALIDATORS[m.type];
        if (fn) w[m.type] = fn(m.data);
    }
    return w;
}

/**
 * Server entry point. Returns every violation rather than the first, so a caller can
 * surface all the steps that need attention at once.
 *
 * @param {unknown} modules
 * @returns {{ valid: boolean, errors: Array<{ module: string, message: string }> }}
 */
export function validateModules(modules, { partial = false } = {}) {
    const errors = [];

    if (!Array.isArray(modules)) {
        return { valid: false, errors: [{ module: '_root', message: 'modules must be an array.' }] };
    }

    if (modules.length > LIMITS.MAX_MODULES) {
        errors.push({ module: '_root', message: `A page cannot have more than ${LIMITS.MAX_MODULES} modules.` });
    }

    let serialized = '';
    try {
        serialized = JSON.stringify(modules);
    } catch {
        return { valid: false, errors: [{ module: '_root', message: 'modules could not be serialized.' }] };
    }
    // Byte length, not character count — multi-byte content still counts against the cap.
    // TextEncoder rather than Buffer.byteLength: this module is imported by the wizard's
    // Review step, and Buffer does not exist in the browser. It ended up in the shipped
    // bundle, where it would have thrown on the final screen and stopped every club from
    // submitting.
    if (utf8Bytes(serialized) > LIMITS.MAX_SERIALIZED_BYTES) {
        errors.push({ module: '_root', message: 'Page content is too large.' });
    }

    const basicInfo = modules.find((m) => m?.type === 'basic_info');

    for (const m of modules) {
        const type = m?.type;
        if (!KNOWN_MODULE_TYPES.has(type)) {
            errors.push({ module: String(type), message: `Unknown module type: ${type}` });
            continue;
        }
        const message = type === 'links'
            ? validateLinks(basicInfo?.data)
            : VALIDATORS[type]?.(m.data, { partial }) ?? null;
        if (message) errors.push({ module: type, message });
    }

    return { valid: errors.length === 0, errors };
}
