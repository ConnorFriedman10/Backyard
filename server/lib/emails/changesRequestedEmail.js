// Sent when a reviewer asks a club to change something before their page goes live.
//
// Same construction as the submission email: tables and inline styles, readable with
// images blocked, plain text alongside.
//
// The note is the point of the message, so it gets its own block rather than being
// buried in a paragraph. A club should be able to see what to fix from the preview line
// in their inbox.

const SITE = 'https://explorethebackyard.com';

const SAND = '#E2C9B0';
const PAPER = '#f5f1ea';
const RED = '#C53B3F';
const INK = '#2b2724';
const MUTED = '#6f6862';

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderChangesRequestedEmail({ clubName, firstName, note, resumeUrl }) {
    const club = escapeHtml(clubName || 'your club');
    const greeting = firstName ? `Hi ${escapeHtml(firstName)}` : 'Hi';
    const subject = `One thing to change on ${clubName || 'your club'}'s page`;

    // Telling a club to "open the setup link we sent you" asked them to go digging through
    // an inbox for a message that may be weeks old — and that original link expires after
    // 30 days, so by the time a review comes back it is often dead. /resume is keyed on
    // who they sign in as rather than on a token, so it keeps working.
    //
    // Nullable: ONBOARD_URL is optional and appUrls refuses to invent one. Without it the
    // email falls back to the old wording rather than shipping a button to nowhere.
    const resume = resumeUrl || null;

    const text = [
        `${firstName ? `Hi ${firstName}` : 'Hi'},`,
        '',
        `We read through ${clubName || 'your club'}'s page. Before it goes live, one thing:`,
        '',
        note,
        '',
        ...(resume
            ? [
                'Pick up where you left off:',
                resume,
                '',
                'Sign in with the same account you used to claim the club and your answers',
                'will all still be there. Change what you need and send it back.',
            ]
            : [
                'Open the setup link we sent you and your answers will all still be there.',
                'Change what you need and send it back, and we will take another look.',
            ]),
        '',
        'Reply to this email if anything is unclear.',
        '',
        'Backyard',
        SITE,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${SAND};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${escapeHtml(note).slice(0, 140)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${SAND};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:600px;background-color:${PAPER};border-radius:14px;overflow:hidden;">

          <tr>
            <td align="center" style="padding:36px 32px 4px 32px;">
              <img src="${SITE}/assets/email/logo.png" width="220" alt="Backyard"
                   style="display:block;width:220px;max-width:70%;height:auto;border:0;">
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 0 32px;">
              <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;color:${INK};font-weight:700;">
                ${greeting}
              </h1>
              <p style="margin:10px 0 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
                We read through ${club}'s page. Before it goes live, one thing:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#ffffff;border-left:4px solid ${RED};border-radius:6px;padding:16px 18px;">
                    <p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
                      ${escapeHtml(note)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;">
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${MUTED};">
                ${resume
                    ? `Sign in with the same account you used to claim ${club} and your answers
                       will all still be there. Change what you need and send it back.`
                    : `Open the setup link we sent you and your answers will all still be there.
                       Change what you need and send it back, and we'll take another look.`}
              </p>
            </td>
          </tr>
${resume ? `
          <tr>
            <td align="center" style="padding:22px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${RED}" style="border-radius:8px;">
                    <a href="${escapeHtml(resume)}"
                       style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;
                              font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Open your page
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:10px 0 0 0;font-family:${FONT};font-size:12px;color:${MUTED};word-break:break-all;">
                ${escapeHtml(resume)}
              </p>
            </td>
          </tr>` : ''}

          <tr>
            <td style="padding:18px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #ddd6c9;padding-top:18px;">
                    <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">
                      Lost the link, or not sure what we mean? Reply to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:26px 32px 34px 32px;">
              <p style="margin:0;font-family:${FONT};font-size:13px;color:${MUTED};">
                <span style="color:${RED};font-weight:700;letter-spacing:0.08em;">BACKYARD</span><br>
                <a href="${SITE}" style="color:${MUTED};text-decoration:underline;">explorethebackyard.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
}
