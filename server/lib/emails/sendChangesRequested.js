import { supabaseAdmin } from '../../supabaseAdmin.js';
import { renderChangesRequestedEmail } from './changesRequestedEmail.js';
import { ONBOARD_URL } from '../appUrls.js';

const FROM = 'Backyard <clubs@explorethebackyard.com>';

/**
 * Fire and forget, and never able to fail the reviewer's action.
 *
 * The club is looked up from claimed_by, since the person who set the page up is the one
 * who has to change it. Their address lives in auth.users rather than profiles, which is
 * why this goes through the admin auth API.
 */
export async function sendChangesRequestedEmail({ clubId, note }) {
    if (!process.env.RESEND_KEY) {
        console.warn('[email] RESEND_KEY is not set — the club was not told about the change request.');
        return { sent: false, reason: 'no-key' };
    }

    try {
        const { data: row } = await supabaseAdmin
            .from('club_onboarding')
            .select('claimed_by, demo_club_data(club_name)')
            .eq('club_id', clubId)
            .maybeSingle();

        if (!row?.claimed_by) {
            console.warn(`[email] change request for club ${clubId} has no claimed_by — nobody to tell.`);
            return { sent: false, reason: 'no-claimant' };
        }

        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.claimed_by);
        const to = authUser?.user?.email;
        if (!to) {
            console.warn(`[email] claimant ${row.claimed_by} of club ${clubId} has no email address.`);
            return { sent: false, reason: 'no-email' };
        }

        const { data: profile } = await supabaseAdmin
            .from('profiles').select('first_name').eq('id', row.claimed_by).maybeSingle();

        const { subject, html, text } = renderChangesRequestedEmail({
            clubName: row.demo_club_data?.club_name,
            firstName: profile?.first_name || null,
            note,
            // Not the original claim link: that is hashed and unrecoverable, and expires
            // 30 days after minting, so by review time it is usually dead. /resume is
            // keyed on the signed-in account instead.
            resumeUrl: ONBOARD_URL ? `${ONBOARD_URL}/resume` : null,
        });

        // Lazy, because server/lib/resend.js throws at import when the key is absent and
        // would otherwise take the server down at boot over an optional feature.
        const { default: resend } = await import('../resend.js');
        const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });

        if (error) {
            console.error('[email] change request email failed:', error.message ?? error);
            return { sent: false, reason: 'send-failed' };
        }
        return { sent: true };
    } catch (err) {
        console.error('[email] change request email threw:', err.message);
        return { sent: false, reason: 'threw' };
    }
}
