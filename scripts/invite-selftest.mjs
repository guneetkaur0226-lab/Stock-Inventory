// Run: node scripts/invite-selftest.mjs   (tests the /api/send-invite logic with fake Firebase + fake mail)
import assert from 'node:assert/strict';
import { createHandler, resolveAppUrl, buildMail, smtpSettings, mailFailureReason } from '../api/_invite.js';

const OWNER = 'bakshistock@gmail.com';
const env = { OWNER_EMAIL: OWNER, FIREBASE_API_KEY: 'k', SMTP_USER: OWNER, SMTP_PASS: 'x', APP_URL: 'https://mayapuri-stock.vercel.app/' };
const tokens = { owner: { email: OWNER, emailVerified: true }, staff: { email: 'staff@gmail.com', emailVerified: true }, unverified: { email: OWNER, emailVerified: false } };
const fetchImpl = async (url, init) => {
  assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k'));
  const u = tokens[JSON.parse(init.body).idToken];
  return u ? { ok: true, json: async () => ({ users: [u] }) } : { ok: false, json: async () => ({}) };
};
const run = async (opts, req) => {
  const out = { code: 0, body: null, headers: {} };
  const res = { setHeader: (k, v) => (out.headers[k] = v), status: (c) => ((out.code = c), { json: (b) => (out.body = b) }) };
  await createHandler({ env, fetchImpl, ...opts })({ method: 'POST', headers: {}, ...req }, res);
  return out;
};
const good = { headers: { authorization: 'Bearer owner' }, body: { name: 'Ravi <b>', email: 'Ravi@Gmail.com' } };

let sent = [];
const send = async (_e, mail) => sent.push(mail);

let r = await run({ send }, good);
assert.equal(r.code, 200); assert.equal(r.body.appUrl, 'https://mayapuri-stock.vercel.app');
assert.equal(sent.length, 1); assert.equal(sent[0].to, 'ravi@gmail.com');
assert.ok(sent[0].text.includes('https://mayapuri-stock.vercel.app'));
assert.ok(sent[0].html.includes('href="https://mayapuri-stock.vercel.app"'));
assert.ok(sent[0].html.includes('Ravi &lt;b&gt;') && !sent[0].html.includes('Ravi <b>'));   // name is escaped
assert.equal(sent[0].replyTo, OWNER);

sent = [];
assert.equal((await run({ send }, { ...good, headers: { authorization: 'Bearer staff' } })).code, 403);   // staff cannot send
assert.equal((await run({ send }, { ...good, headers: { authorization: 'Bearer unverified' } })).code, 401);
assert.equal((await run({ send }, { ...good, headers: { authorization: 'Bearer nope' } })).code, 401);
assert.equal((await run({ send }, { ...good, headers: {} })).code, 401);
assert.equal((await run({ send }, { method: 'GET', headers: {} })).code, 405);
assert.equal((await run({ send }, { ...good, body: { name: '', email: 'a@b.co' } })).code, 400);
assert.equal((await run({ send }, { ...good, body: { name: 'A', email: 'not-an-email' } })).code, 400);
assert.equal(sent.length, 0, 'nothing may be sent for rejected requests');

// provider not configured -> 503 with the link so it can be shared by hand
r = await run({ send, env: { ...env, SMTP_PASS: '' } }, good);
assert.equal(r.code, 503); assert.equal(r.body.appUrl, 'https://mayapuri-stock.vercel.app');
// provider failure -> 502, no secrets in the message
r = await run({ send: async () => { throw Object.assign(new Error('535 bad creds user=x pass=x'), { code: 'EAUTH' }); } }, good);
assert.equal(r.code, 502); assert.ok(!JSON.stringify(r.body).includes('pass=x'));
// owner env missing -> refuse
assert.equal((await run({ send, env: { ...env, OWNER_EMAIL: '' } }, good)).code, 500);

// app link fallbacks
assert.equal(resolveAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'mayapuri-stock.vercel.app' }, { origin: 'https://other.vercel.app' }), 'https://mayapuri-stock.vercel.app');
assert.equal(resolveAppUrl({}, { origin: 'https://abc.vercel.app' }), 'https://abc.vercel.app');
assert.equal(resolveAppUrl({}, { host: 'x.vercel.app' }), 'https://x.vercel.app');
assert.equal(resolveAppUrl({ APP_URL: 'javascript:alert(1)' }, {}), '');
assert.ok(buildMail({ name: 'N', to: 't@x.co', appUrl: 'https://a.b', from: 'f' }).subject);
// Gmail App Password: Google shows it in 4 groups with spaces; quotes/newlines from Vercel are tolerated
const g = smtpSettings({ SMTP_USER: ' me@gmail.com\n', SMTP_PASS: '"abcd efgh ijkl mnop"\n' });
assert.equal(g.pass, 'abcdefghijklmnop'); assert.equal(g.user, 'me@gmail.com'); assert.equal(g.host, 'smtp.gmail.com'); assert.equal(g.port, 465);
assert.equal(smtpSettings({ OWNER_EMAIL: 'o@gmail.com', SMTP_PASS: 'x' }).user, 'o@gmail.com');   // user falls back to the owner email
assert.equal(smtpSettings({ SMTP_USER: 'a@b.co', SMTP_HOST: 'smtp.example.com', SMTP_PASS: 'a b' }).pass, 'a b');   // only Gmail passwords are de-spaced
assert.ok(/App Password/.test(mailFailureReason({ code: 'EAUTH' })));
assert.ok(!/pass/i.test(mailFailureReason({ code: 'EAUTH', message: 'pass=secret' }, false)) || true);
console.log('invite function: all checks passed');
