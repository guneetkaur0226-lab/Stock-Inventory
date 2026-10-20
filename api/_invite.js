// Shared logic for the staff-invite email (Vercel serverless function).
// Files that start with "_" inside /api are NOT exposed as routes by Vercel.
//
// Flow: the owner's browser sends its Firebase ID token + the staff name/email.
// We confirm with Firebase that the token is valid and belongs to the OWNER
// email, then send a plain invitation email that contains the app link.
// No Firebase Admin key is needed.

export const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tidy = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function cleanUrl(u) {
  if (!u) return '';
  let v = String(u).trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const p = new URL(v);
    return `${p.protocol}//${p.host}`;
  } catch {
    return '';
  }
}

/** The link put in the email: APP_URL, else the Vercel production domain, else where the request came from. */
export function resolveAppUrl(env, headers = {}) {
  return (
    cleanUrl(env.APP_URL) ||
    cleanUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ||
    cleanUrl(headers.origin) ||
    cleanUrl(headers['x-forwarded-host'] || headers.host)
  );
}

/** Returns { email } when the Firebase ID token is valid and verified, else null. */
export async function verifyIdToken(idToken, env, appUrl, fetchImpl = fetch) {
  const key = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
  if (!key || !idToken) return null;
  const res = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    // Referer lets this work even if the API key is restricted to your website address.
    headers: { 'Content-Type': 'application/json', ...(appUrl ? { Referer: `${appUrl}/` } : {}) },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const user = (await res.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { email: String(user.email).toLowerCase() };
}

export function buildMail({ name, to, appUrl, from, replyTo }) {
  const subject = 'You have been invited to Mayapuri Stock';
  const text = [
    `Hello ${name},`,
    '',
    'You have been given access to the Mayapuri Stock app (the shop stock book).',
    '',
    `Open the app: ${appUrl}`,
    '',
    `Sign in with this same email address: ${to}`,
    '1. Tap "Sign in with Google" and choose that account (or use "Email me a link").',
    '2. Tip: on your phone, open the link in Chrome and choose menu (3 dots) > "Install app" to add it to your home screen.',
    '',
    'If you were not expecting this email, you can ignore it.',
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#14202b;line-height:1.5">
<h2 style="color:#0f4c5c;margin:0 0 12px">Mayapuri Stock</h2>
<p>Hello ${esc(name)},</p>
<p>You have been given access to the <b>Mayapuri Stock</b> app (the shop stock book).</p>
<p style="margin:22px 0"><a href="${esc(appUrl)}" style="background:#0f4c5c;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold;display:inline-block">Open the app</a></p>
<p style="word-break:break-all">Or copy this link: <a href="${esc(appUrl)}">${esc(appUrl)}</a></p>
<p>Sign in with this same email address: <b>${esc(to)}</b></p>
<ol><li>Tap <b>Sign in with Google</b> and choose that account (or use <b>Email me a link</b>).</li>
<li>Tip: on your phone, open the link in Chrome and choose menu (3 dots) &rarr; <b>Install app</b> to add it to your home screen.</li></ol>
<p style="color:#667;font-size:13px">If you were not expecting this email, you can ignore it.</p></div>`;
  return { from, to, replyTo, subject, text, html };
}

/** Reads an env value safely: trims, drops wrapping quotes (a common copy/paste slip in Vercel). */
const envText = (v) => String(v ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();

/**
 * SMTP settings from the Vercel variables. Gmail shows an App Password as four groups of letters
 * separated by spaces ("abcd efgh ijkl mnop"); the spaces are not part of the password, so they are removed.
 */
export function smtpSettings(env) {
  const user = envText(env.SMTP_USER) || envText(env.OWNER_EMAIL);
  const host = envText(env.SMTP_HOST) || 'smtp.gmail.com';
  const isGmail = /(^|\.)(gmail|googlemail)\.com$/i.test(host);
  const rawPass = envText(env.SMTP_PASS);
  const pass = isGmail ? rawPass.replace(/\s+/g, '') : rawPass;
  const port = Number(envText(env.SMTP_PORT)) || 465;
  return { user, pass, host, port, isGmail };
}

async function sendWithNodemailer(env, mail) {
  const { default: nodemailer } = await import('nodemailer');
  const { user, pass, host, port } = smtpSettings(env);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail(mail);
}

/** A plain-words reason for the owner, never including the password or server text. */
export function mailFailureReason(e, isGmail = true) {
  const code = e?.code || '';
  if (code === 'EAUTH' || e?.responseCode === 535 || e?.responseCode === 534) {
    return isGmail
      ? 'Gmail refused the login. SMTP_PASS must be a 16-letter Google App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal Gmail password, and SMTP_USER must be the Gmail address that created it.'
      : 'The email login was refused. Check SMTP_USER and SMTP_PASS in Vercel.';
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'EDNS'].includes(code)) return 'Could not reach the email server. Please try again in a minute.';
  return 'The email provider did not accept the message.';
}

export function createHandler({ env = process.env, fetchImpl = fetch, send = sendWithNodemailer } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const reply = (code, body) => res.status(code).json(body);

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(405, { ok: false, error: 'Method not allowed.' });
    }

    const appUrl = resolveAppUrl(env, req.headers || {});

    // 1) who is calling? must be the owner
    const ownerEmail = String(env.OWNER_EMAIL || '').trim().toLowerCase();
    if (!ownerEmail) return reply(500, { ok: false, error: 'Server setting OWNER_EMAIL is missing in Vercel.', appUrl });
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ''));
    let caller = null;
    try {
      caller = await verifyIdToken(m?.[1], env, appUrl, fetchImpl);
    } catch {
      return reply(502, { ok: false, error: 'Could not verify your login with Firebase. Please try again.', appUrl });
    }
    if (!caller) return reply(401, { ok: false, error: 'Please sign in again and retry.' });
    if (caller.email !== ownerEmail) return reply(403, { ok: false, error: 'Only the owner can send invitations.' });

    // 2) validate input
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    const name = tidy(body?.name, 80);
    const to = tidy(body?.email, 254).toLowerCase();
    if (!name) return reply(400, { ok: false, error: 'Name is missing.' });
    if (!EMAIL_RE.test(to)) return reply(400, { ok: false, error: 'That email address does not look right.' });
    if (!appUrl) return reply(500, { ok: false, error: 'Server setting APP_URL is missing in Vercel.' });

    // 3) email provider settings
    const smtp = smtpSettings(env);
    if (!smtp.user || !smtp.pass) {
      return reply(503, { ok: false, error: 'Email sending is not set up yet (SMTP_USER / SMTP_PASS are missing in Vercel).', appUrl });
    }
    const from = tidy(envText(env.MAIL_FROM), 200) || `"Mayapuri Stock" <${smtp.user}>`;

    try {
      await send(env, buildMail({ name, to, appUrl, from, replyTo: ownerEmail }));
    } catch (e) {
      const why = mailFailureReason(e, smtp.isGmail);
      console.error('send-invite failed:', e?.code || '', e?.responseCode || '', String(e?.message || '').slice(0, 200));
      return reply(502, { ok: false, error: why, appUrl });
    }
    return reply(200, { ok: true, appUrl });
  };
}
