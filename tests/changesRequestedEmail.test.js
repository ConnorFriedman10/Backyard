import { describe, it, expect } from 'vitest';
import { renderChangesRequestedEmail } from '../server/lib/emails/changesRequestedEmail.js';

const note = 'Could you add a bit more detail about when you meet?';

describe('renderChangesRequestedEmail', () => {
    it('names the club in the subject', () => {
        expect(renderChangesRequestedEmail({ clubName: 'Chess Club', note }).subject)
            .toContain('Chess Club');
    });

    // The note is the entire point of the message.
    it('includes the note in both the HTML and the text part', () => {
        const { html, text } = renderChangesRequestedEmail({ clubName: 'Chess Club', note });
        expect(html).toContain(note);
        expect(text).toContain(note);
    });

    // A club should be able to tell what to fix from the inbox preview line.
    it('puts the note in the preheader', () => {
        const { html } = renderChangesRequestedEmail({ clubName: 'Chess', note });
        const preheader = html.split('</div>')[0];
        expect(preheader).toContain(note.slice(0, 40));
    });

    it('greets by first name when there is one', () => {
        expect(renderChangesRequestedEmail({ clubName: 'Chess', firstName: 'Alex', note }).html)
            .toContain('Hi Alex');
    });

    // The note is typed by a reviewer, but it still lands in rendered HTML.
    it('escapes HTML in the note', () => {
        const { html } = renderChangesRequestedEmail({
            clubName: 'Chess', note: '<script>alert(1)</script>',
        });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML in the club name', () => {
        const { html } = renderChangesRequestedEmail({ clubName: '<b>Chess</b>', note });
        expect(html).not.toContain('<b>Chess</b>');
    });

    it('tells them their answers are still there', () => {
        const { html, text } = renderChangesRequestedEmail({ clubName: 'Chess', note });
        expect(html).toMatch(/still be there/i);
        expect(text).toMatch(/still be there/i);
    });

    it('reads without images and without a style block', () => {
        const { html, text } = renderChangesRequestedEmail({ clubName: 'Chess', note });
        expect(html).not.toContain('<style');
        expect(text).not.toContain('<');
    });
});

// The whole point of the resume link: a club should not have to go hunting through an
// inbox for a claim link that has probably expired by the time a review comes back.
describe('renderChangesRequestedEmail resume link', () => {
    const RESUME = 'https://claim.example.com/resume';

    it('renders a button and the bare URL when a resume link is supplied', () => {
        const { html, text } = renderChangesRequestedEmail({
            clubName: 'Chess Club', note, resumeUrl: RESUME,
        });
        expect(html).toContain(`href="${RESUME}"`);
        expect(html).toContain('Open your page');
        // Shown as text too, for clients that strip the anchor styling.
        expect(html.split(`href="${RESUME}"`)[1]).toContain(RESUME);
        expect(text).toContain(RESUME);
    });

    // ONBOARD_URL is optional and appUrls refuses to invent one, so the sender passes
    // null rather than a broken origin. Falling back beats shipping a button to nowhere.
    it('falls back to the old wording when there is no resume link', () => {
        for (const resumeUrl of [null, undefined, '']) {
            const { html, text } = renderChangesRequestedEmail({ clubName: 'Chess', note, resumeUrl });
            expect(html).not.toContain('Open your page');
            expect(html).not.toContain('href="null"');
            expect(html).not.toContain('undefined');
            expect(text).toContain('Open the setup link we sent you');
        }
    });

    it('escapes the resume URL rather than interpolating it raw', () => {
        const { html } = renderChangesRequestedEmail({
            clubName: 'Chess', note, resumeUrl: 'https://x.example/resume?a="><script>',
        });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });
});
