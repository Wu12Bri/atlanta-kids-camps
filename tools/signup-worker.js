/**
 * Cloudflare Worker: public signup / preferences / unsubscribe → Resend Contacts.
 * Secrets: RESEND_API_KEY
 * Deploy free-tier; CORS limited to atlantakidscamps.com (+www).
 *
 * Point window.SITE_CONFIG.signupEndpoint at this Worker's URL
 * and set signupMode: "ajax".
 *
 * Welcome email: sent once, only for a brand-new contact created by a signup
 * from the site form (intent "signup", browser Origin present). Preference
 * updates, unsubscribes and repeat signups never trigger it. A failed send
 * never fails the signup. Every welcome carries a signed one-click
 * unsubscribe link (GET shows a confirm page, POST unsubscribes; also used
 * by the List-Unsubscribe / List-Unsubscribe-Post headers) plus a link to
 * the preferences page. The signing key is derived from RESEND_API_KEY, so no
 * extra secret is needed and the key itself is never exposed.
 *
 * Parent accounts (added 2026-11-16, optional, passwordless):
 *   POST /auth/request {email}      emails a signed 15-minute sign-in link (only to the address typed in)
 *   POST /auth/verify  {token}      single-use; creates the account on first use, links an existing
 *                                   alert contact by email, returns a 30-day session token
 *   POST /auth/logout               (Bearer session)
 *   GET  /me                        account, saved camps + alert toggles, planner, .ics feed URL
 *   POST /me/camps {camp, alert_open, alert_remind}   save / update a camp
 *   POST /me/camps/remove {camp}
 *   POST /me/planner {planner}      Summer Planner sync
 *   POST /me/alerts {area, activities[], seasons}     signed-in preference change
 *   POST /me/pause {paused}         pause / resume all email
 *   POST /me/delete                 deletes D1 rows + the Resend contact
 *   GET  /ics/<token>.ics           private calendar feed (published dates only)
 * Binding: DB (D1 akc-accounts). Sessions and sign-in nonces are stored only as SHA-256 hashes.
 * Preference changes / unsubscribes through POST / now need the signed token (t) from an email link
 * or a signed-in session for the same address; anonymous repeat signups never overwrite a contact.
 */
const ALLOWED_ORIGINS = new Set([
  "https://atlantakidscamps.com",
  "https://www.atlantakidscamps.com",
]);

const TOPIC_BY_LABEL = {
  "STEM / LEGO / coding": "cc3e88f5-f25f-4ba1-9b37-dfdfeed406d9",
  "Sports and outdoors": "541b94a0-f965-4e95-b71a-7fe8b6f1c566",
  "Arts and theatre": "246f8b40-6bd7-4870-9375-6f0b7433fc2e",
  "Day camps": "26a4e3c5-2e7a-4a0a-bd73-16a0540da7a0",
  "Free library and community": "8eec2573-a1ae-4ba6-911b-ef093f96e767",
  "School-break camps": "fe6c1592-a52e-4116-8718-3c79f9cb5299",
};
const GENERAL_TOPIC = "57c56578-806b-4b34-9332-5251097c7e82";
const SEGMENT = "e38b3e6f-a6e3-4fea-b39c-b9e70ea1b6bc";

const SITE = "https://atlantakidscamps.com";
const PREFS_URL = SITE + "/preferences/";
const WELCOME_FROM = "Atlanta Kids Camps <signup@atlantakidscamps.com>";
const ACCOUNT_URL = SITE + "/account/";
const LOGIN_TTL_SEC = 15 * 60;
const SESSION_TTL_SEC = 30 * 24 * 3600;
const MAX_SAVED = 100;
const MAX_PLANNER = 16000;

const RL_MAX = 8;
const RL_WINDOW_SEC = 60;
const MAX_FIELD = 200;

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://atlantakidscamps.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req, obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function clientIp(req) {
  return (
    req.headers.get("CF-Connecting-IP") ||
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function rateLimitOk(ip) {
  try {
    const cache = caches.default;
    const key = new Request("https://signup-rl.internal/" + encodeURIComponent(ip));
    const existing = await cache.match(key);
    let count = 0;
    if (existing) count = Number(await existing.text()) || 0;
    if (count >= RL_MAX) return false;
    await cache.put(
      key,
      new Response(String(count + 1), {
        headers: { "Cache-Control": "max-age=" + RL_WINDOW_SEC },
      })
    );
    return true;
  } catch {
    return true; // fail open if Cache API unavailable
  }
}

function clip(v) {
  return String(v == null ? "" : v).trim().slice(0, MAX_FIELD);
}

function buildTopics(activities) {
  const topics = [{ id: GENERAL_TOPIC, subscription: "opt_in" }];
  for (const [label, id] of Object.entries(TOPIC_BY_LABEL)) {
    topics.push({
      id,
      subscription: activities.includes(label) ? "opt_in" : "opt_out",
    });
  }
  return topics;
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function unsubToken(env, email) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("akc-unsub-v1:" + env.RESEND_API_KEY));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(email));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function unsubLink(env, base, email) {
  return base + "/unsubscribe?e=" + encodeURIComponent(email) + "&t=" + (await unsubToken(env, email));
}

// Signed preferences link (same token as unsubscribe): lets the preferences page change alerts without a login.
async function prefsLink(env, email) {
  return PREFS_URL + "?e=" + encodeURIComponent(email) + "&t=" + (await unsubToken(env, email));
}

function page(title, bodyHtml, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Atlanta Kids Camps</title></head>` +
      `<body style="margin:0;background:#fbf7f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2a2a"><main style="max-width:520px;margin:48px auto;padding:24px;background:#fff;border:1px solid #e8e0d2;border-radius:12px">` +
      `<p style="margin:0 0 12px;font-weight:700;color:#1f5f5b">Atlanta Kids Camps</p><h1 style="font-size:1.3rem;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

async function handleUnsubscribe(req, env, url) {
  const email = clip(url.searchParams.get("e")).toLowerCase();
  const t = clip(url.searchParams.get("t"));
  if (!email || !env.RESEND_API_KEY || t !== (await unsubToken(env, email))) {
    return page("Link not valid", `<p>This unsubscribe link is incomplete or expired. You can unsubscribe on the <a href="${PREFS_URL}">preferences page</a> or email <a href="mailto:signup@atlantakidscamps.com">signup@atlantakidscamps.com</a>.</p>`, 400);
  }
  if (req.method === "GET") {
    return page("Stop camp alert emails?", `<form method="post"><p>Click below and we'll stop sending Atlanta Kids Camps alerts to this address.</p><button type="submit" style="background:#1f5f5b;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:1rem;cursor:pointer">Unsubscribe</button></form><p style="font-size:.9rem;color:#5b6b69">Prefer fewer emails instead? <a href="${PREFS_URL}">Change your preferences</a>.</p>`);
  }
  const res = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(email), {
    method: "PATCH",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ unsubscribed: true }),
  });
  if (env.DB) {
    try { await env.DB.prepare("UPDATE accounts SET paused = 1 WHERE email = ?").bind(email).run(); } catch {}
  }
  if (!res.ok && res.status !== 404) {
    return page("Something went wrong", `<p>We couldn't process that just now. Please try again, or email <a href="mailto:signup@atlantakidscamps.com">signup@atlantakidscamps.com</a> with "unsubscribe".</p>`, 502);
  }
  return page("You're unsubscribed", `<p>You won't get any more camp alert emails from us. Changed your mind? Sign up again any time at <a href="${SITE}/">atlantakidscamps.com</a>.</p>`);
}

function welcomeContent(p, unsubUrl, prefsUrl = PREFS_URL) {
  const rows = [
    ["Camp you're watching", p.watched_camp || "None picked (we'll use your categories)"],
    ["Area", p.preferred_area || "Anywhere"],
    ["Seasons", p.preferred_seasons || "Any"],
    ["Categories", p.preferred_activities || "All categories"],
  ];
  const text =
    "Thanks for signing up for Atlanta Kids Camps registration alerts.\n\n" +
    "Here's what you asked us to watch:\n" +
    rows.map(([k, v]) => `- ${k}: ${v}`).join("\n") +
    "\n\nWe only email when a camp that matches your choices posts a registration date or opens sign-ups, " +
    "and every date comes from the camp's own official page.\n\n" +
    `Change your preferences: ${prefsUrl}\nOptional free account (saved camps calendar): ${ACCOUNT_URL}\nUnsubscribe: ${unsubUrl}\n\n` +
    "Atlanta Kids Camps · atlantakidscamps.com\nYou're getting this because this address was entered in the alert form on atlantakidscamps.com. If that wasn't you, use the unsubscribe link above.";
  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#fbf7f0">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7f0"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e0d2;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#1d2a2a">` +
    `<tr><td style="padding:20px 24px;border-bottom:4px solid #f2a541"><span style="font-size:18px;font-weight:bold;color:#1f5f5b">Atlanta Kids Camps</span></td></tr>` +
    `<tr><td style="padding:20px 24px;font-size:15px;line-height:1.5">` +
    `<p style="margin:0 0 12px">Thanks for signing up for camp registration alerts.</p>` +
    `<p style="margin:0 0 8px">Here's what you asked us to watch:</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;margin:0 0 16px">` +
    rows.map(([k, v]) => `<tr><td style="padding:6px 8px 6px 0;color:#5b6b69;vertical-align:top;width:42%">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join("") +
    `</table>` +
    `<p style="margin:0 0 16px">We only email when a camp that matches your choices posts a registration date or opens sign-ups, and every date comes from the camp's own official page.</p>` +
    `<p style="margin:0 0 4px"><a href="${esc(prefsUrl)}" style="color:#1f5f5b;font-weight:bold">Change your preferences</a></p>` +
    `<p style="margin:0 0 4px;font-size:14px">Want a calendar of the camps you're watching? <a href="${ACCOUNT_URL}" style="color:#1f5f5b">Create a free account</a> (no password).</p>` +
    `</td></tr><tr><td style="padding:14px 24px;border-top:1px solid #e8e0d2;font-size:12px;color:#5b6b69;line-height:1.5">` +
    `You're getting this because this address was entered in the alert form on <a href="${SITE}/" style="color:#5b6b69">atlantakidscamps.com</a>. ` +
    `If that wasn't you, <a href="${esc(unsubUrl)}" style="color:#5b6b69">unsubscribe</a>. · <a href="${esc(prefsUrl)}" style="color:#5b6b69">Preferences</a>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

async function sendWelcome(env, headers, email, properties, base) {
  const unsubUrl = await unsubLink(env, base, email);
  const { text, html } = welcomeContent(properties, unsubUrl, await prefsLink(env, email));
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "akc-welcome-" + (await unsubToken(env, email)) },
    body: JSON.stringify({
      from: WELCOME_FROM,
      to: [email],
      reply_to: "signup@atlantakidscamps.com",
      subject: "You're on the list: Atlanta Kids Camps alerts",
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:signup@atlantakidscamps.com?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "type", value: "welcome" }],
    }),
  });
  return res.ok;
}

// ---------------------------------------------------------------- parent accounts (2026-11-16)
const enc = new TextEncoder();
function b64u(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
function randomToken(n = 32) {
  return b64u(crypto.getRandomValues(new Uint8Array(n)));
}
async function sha256hex(v) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(v));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function loginKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("akc-login-v1:" + env.RESEND_API_KEY));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeLoginToken(env, email) {
  const payload = b64u(enc.encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + LOGIN_TTL_SEC, n: randomToken(12) })));
  const sig = await crypto.subtle.sign("HMAC", await loginKey(env), enc.encode(payload));
  return payload + "." + b64u(sig);
}
async function readLoginToken(env, token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig || token.length > 600) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await loginKey(env), b64uDecode(sig), enc.encode(payload)); } catch { ok = false; }
  if (!ok) return null;
  let p;
  try { p = JSON.parse(new TextDecoder().decode(b64uDecode(payload))); } catch { return null; }
  if (!p || typeof p.e !== "string" || typeof p.n !== "string" || !(p.x > 0)) return null;
  return p;
}
function nowSec() { return Math.floor(Date.now() / 1000); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254; }

async function sessionAccount(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (!m || !env.DB) return null;
  const h = await sha256hex("sess:" + m[1]);
  const row = await env.DB.prepare(
    "SELECT a.*, s.token_hash AS sess FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?"
  ).bind(h, nowSec()).first();
  return row || null;
}

let campCache = null;
async function siteCamps() {
  if (campCache && campCache.at > Date.now() - 600000) return campCache.camps;
  try {
    const r = await fetch(SITE + "/data.json", { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!r.ok) throw new Error("data " + r.status);
    const d = await r.json();
    campCache = { at: Date.now(), camps: d.camps || [] };
  } catch {
    if (!campCache) return null;
  }
  return campCache.camps;
}

function loginEmail(link, unsubUrl) {
  const text =
    "Here's your sign-in link for Atlanta Kids Camps. It works once and expires in 15 minutes:\n\n" + link +
    "\n\nIf you didn't ask for this, you can ignore this email; nobody can sign in without the link.\n\n" +
    "Stop all Atlanta Kids Camps email: " + unsubUrl + "\n\nAtlanta Kids Camps · atlantakidscamps.com";
  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#fbf7f0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7f0"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e8e0d2;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#1d2a2a">` +
    `<tr><td style="padding:20px 24px;border-bottom:4px solid #f2a541"><span style="font-size:18px;font-weight:bold;color:#1f5f5b">Atlanta Kids Camps</span></td></tr>` +
    `<tr><td style="padding:20px 24px;font-size:15px;line-height:1.5"><p style="margin:0 0 16px">Tap the button to sign in to your camp calendar. The link works once and expires in 15 minutes.</p>` +
    `<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#1f5f5b;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Sign in to My camp calendar</a></p>` +
    `<p style="margin:0;font-size:13px;color:#5b6b69">If you didn't ask for this, ignore this email. Nobody can sign in without the link.</p></td></tr>` +
    `<tr><td style="padding:14px 24px;border-top:1px solid #e8e0d2;font-size:12px;color:#5b6b69">Sent because this address was entered on the sign-in page at atlantakidscamps.com. <a href="${esc(unsubUrl)}" style="color:#5b6b69">Stop all emails</a></td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

async function handleAuthRequest(req, env, url, body) {
  const email = clip(body.email).toLowerCase();
  if (!validEmail(email)) return json(req, { error: "bad email" }, 400);
  const eh = await sha256hex("req:" + email);
  const t = nowSec();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(at) AS last FROM link_requests WHERE email_hash = ? AND at > ?").bind(eh, t - 3600).first();
  // Same answer either way, so the endpoint never reveals whether an address has an account.
  if ((recent && recent.n >= 5) || (recent && recent.last && t - recent.last < 60)) return json(req, { success: true, sent: true }, 200);
  await env.DB.prepare("INSERT INTO link_requests (email_hash, at) VALUES (?, ?)").bind(eh, t).run();
  await env.DB.prepare("DELETE FROM link_requests WHERE at < ?").bind(t - 86400).run();
  const token = await makeLoginToken(env, email);
  const link = ACCOUNT_URL + "#login=" + token;
  const unsubUrl = await unsubLink(env, url.origin, email);
  const { text, html } = loginEmail(link, unsubUrl);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: WELCOME_FROM, to: [email], reply_to: "signup@atlantakidscamps.com",
      subject: "Your Atlanta Kids Camps sign-in link", text, html,
      headers: { "List-Unsubscribe": `<${unsubUrl}>, <mailto:signup@atlantakidscamps.com?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [{ name: "type", value: "login" }],
    }),
  });
  if (!res.ok) return json(req, { error: "could not send the email, please try again" }, 502);
  return json(req, { success: true, sent: true }, 200);
}

async function resendContact(env, email) {
  const r = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(email), { headers: { Authorization: "Bearer " + env.RESEND_API_KEY } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("resend " + r.status);
  return r.json();
}

async function handleAuthVerify(req, env, body) {
  const p = await readLoginToken(env, clip(body.token).length ? String(body.token) : "");
  if (!p) return json(req, { error: "This sign-in link isn't valid. Request a new one." }, 400);
  if (p.x < nowSec()) return json(req, { error: "This sign-in link has expired. Request a new one." }, 400);
  const t = nowSec();
  const used = await env.DB.prepare("INSERT OR IGNORE INTO used_links (nonce_hash, used_at) VALUES (?, ?)").bind(await sha256hex("nonce:" + p.n), t).run();
  if (!used.meta || used.meta.changes !== 1) return json(req, { error: "This sign-in link was already used. Request a new one." }, 400);
  await env.DB.prepare("DELETE FROM used_links WHERE used_at < ?").bind(t - 86400).run();
  const email = p.e;
  let acct = await env.DB.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first();
  let linked = null;
  if (!acct) {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO accounts (id, email, created_at, last_login, paused, ics_token) VALUES (?, ?, ?, ?, 0, ?)").bind(id, email, t, t, randomToken(24)).run();
    acct = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first();
  }
  if (!acct.contact_linked) {
    // First login: link an existing alert sign-up for the same address.
    try {
      const c = await resendContact(env, email);
      if (c) {
        const camp = c.properties && (c.properties.watched_camp && (c.properties.watched_camp.value ?? c.properties.watched_camp));
        if (camp && typeof camp === "string") {
          await env.DB.prepare("INSERT OR IGNORE INTO saved_camps (account_id, camp, alert_open, alert_remind, added_at) VALUES (?, ?, 1, 1, ?)").bind(acct.id, camp.slice(0, MAX_FIELD), t).run();
        }
        if (c.unsubscribed) await env.DB.prepare("UPDATE accounts SET paused = 1 WHERE id = ?").bind(acct.id).run();
        linked = { alert_contact: true, camp: camp || null };
      } else linked = { alert_contact: false };
      await env.DB.prepare("UPDATE accounts SET contact_linked = 1 WHERE id = ?").bind(acct.id).run();
    } catch { linked = null; }
  }
  const sess = randomToken(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256hex("sess:" + sess), acct.id, t, t + SESSION_TTL_SEC).run();
  await env.DB.prepare("UPDATE accounts SET last_login = ? WHERE id = ?").bind(t, acct.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t).run();
  return json(req, { success: true, session: sess, email, linked }, 200);
}

async function meJson(env, url, a) {
  const camps = (await env.DB.prepare("SELECT camp, alert_open, alert_remind, added_at FROM saved_camps WHERE account_id = ? ORDER BY added_at").bind(a.id).all()).results || [];
  let alerts = null;
  try {
    const c = await resendContact(env, a.email);
    const pv = (k) => { const v = c && c.properties && c.properties[k]; return v && typeof v === "object" ? v.value ?? "" : v ?? ""; };
    alerts = c ? { contact: true, unsubscribed: !!c.unsubscribed, area: pv("preferred_area"), activities: pv("preferred_activities"), seasons: pv("preferred_seasons"), watched_camp: pv("watched_camp") } : { contact: false };
  } catch { alerts = null; }
  let planner = null;
  try { planner = a.planner ? JSON.parse(a.planner) : null; } catch { planner = null; }
  return {
    email: a.email, paused: !!a.paused, created_at: a.created_at,
    camps: camps.map((c) => ({ camp: c.camp, alert_open: !!c.alert_open, alert_remind: !!c.alert_remind })),
    planner, planner_updated: a.planner_updated || 0,
    ics_url: url.origin + "/ics/" + a.ics_token + ".ics",
    alerts,
  };
}

// Make sure an account with alerts on has a Resend contact (so every alert email carries the unsubscribe and the
// paused state is honoured). Never re-subscribes a contact the parent unsubscribed or paused.
async function ensureContact(env, a) {
  const c = await resendContact(env, a.email);
  if (c) return c;
  const r = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, unsubscribed: !!a.paused, segments: [{ id: SEGMENT }], topics: [{ id: GENERAL_TOPIC, subscription: "opt_in" }] }),
  });
  if (!r.ok) throw new Error("resend create " + r.status);
  return r.json();
}

async function handleMe(req, env, url, a, body) {
  const p = url.pathname;
  const t = nowSec();
  if (p === "/me" && req.method === "GET") return json(req, await meJson(env, url, a), 200);
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  if (p === "/me/camps") {
    const camp = clip(body.camp);
    if (!camp) return json(req, { error: "camp required" }, 400);
    const list = await siteCamps();
    if (list && !list.some((c) => c.name === camp)) return json(req, { error: "unknown camp" }, 400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM saved_camps WHERE account_id = ?").bind(a.id).first();
    const exists = await env.DB.prepare("SELECT 1 FROM saved_camps WHERE account_id = ? AND camp = ?").bind(a.id, camp).first();
    if (!exists && n.n >= MAX_SAVED) return json(req, { error: "You can save up to " + MAX_SAVED + " camps." }, 400);
    const ao = body.alert_open === undefined ? 1 : body.alert_open ? 1 : 0;
    const ar = body.alert_remind === undefined ? 1 : body.alert_remind ? 1 : 0;
    await env.DB.prepare(
      "INSERT INTO saved_camps (account_id, camp, alert_open, alert_remind, added_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, camp) DO UPDATE SET alert_open = excluded.alert_open, alert_remind = excluded.alert_remind"
    ).bind(a.id, camp, ao, ar, t).run();
    if (ao || ar) { try { await ensureContact(env, a); } catch {} }
    return json(req, await meJson(env, url, a), 200);
  }
  if (p === "/me/camps/remove") {
    await env.DB.prepare("DELETE FROM saved_camps WHERE account_id = ? AND camp = ?").bind(a.id, clip(body.camp)).run();
    return json(req, await meJson(env, url, a), 200);
  }
  if (p === "/me/planner") {
    const s = JSON.stringify(body.planner || null);
    if (s.length > MAX_PLANNER) return json(req, { error: "planner too large" }, 400);
    await env.DB.prepare("UPDATE accounts SET planner = ?, planner_updated = ? WHERE id = ?").bind(s, Date.now(), a.id).run();
    return json(req, { success: true, planner_updated: Date.now() }, 200);
  }
  if (p === "/me/alerts") {
    const activities = (Array.isArray(body.activities) ? body.activities : String(body.activities || "").split(","))
      .map((x) => clip(x)).filter((x) => TOPIC_BY_LABEL[x]).slice(0, 12);
    const props = { preferred_area: clip(body.area), preferred_activities: activities.join(", "), preferred_seasons: clip(body.seasons) };
    const c = await resendContact(env, a.email);
    const r = await fetch("https://api.resend.com/contacts" + (c ? "/" + encodeURIComponent(a.email) : ""), {
      method: c ? "PATCH" : "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(c ? { properties: props } : { email: a.email, unsubscribed: !!a.paused, segments: [{ id: SEGMENT }], properties: props }),
    });
    if (!r.ok) return json(req, { error: "could not save alert settings" }, 502);
    await fetch("https://api.resend.com/contacts/" + encodeURIComponent(a.email) + "/topics", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(buildTopics(activities)),
    }).catch(() => null);
    return json(req, await meJson(env, url, a), 200);
  }
  if (p === "/me/pause") {
    const paused = body.paused ? 1 : 0;
    await env.DB.prepare("UPDATE accounts SET paused = ? WHERE id = ?").bind(paused, a.id).run();
    a.paused = paused;
    const c = await resendContact(env, a.email).catch(() => null);
    if (c) {
      const r = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(a.email), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ unsubscribed: !!paused }),
      });
      if (!r.ok) return json(req, { error: "could not update email status" }, 502);
    }
    return json(req, await meJson(env, url, a), 200);
  }
  if (p === "/me/logout" || p === "/auth/logout") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(a.sess).run();
    return json(req, { success: true }, 200);
  }
  if (p === "/me/delete") {
    let resend = "none";
    const c = await resendContact(env, a.email).catch(() => undefined);
    if (c === undefined) return json(req, { error: "couldn't reach the email provider; nothing was deleted, please try again" }, 502);
    if (c) {
      const r = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(a.email), { method: "DELETE", headers: { Authorization: "Bearer " + env.RESEND_API_KEY } });
      if (!r.ok && r.status !== 404) return json(req, { error: "couldn't delete the email contact; nothing was deleted, please try again" }, 502);
      resend = "deleted";
    }
    const out = await env.DB.batch([
      env.DB.prepare("DELETE FROM saved_camps WHERE account_id = ?").bind(a.id),
      env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(a.id),
      env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(a.id),
      env.DB.prepare("DELETE FROM link_requests WHERE email_hash = ?").bind(await sha256hex("req:" + a.email)),
    ]);
    return json(req, { success: true, deleted: true, resend_contact: resend, rows: { saved_camps: out[0].meta.changes, sessions: out[1].meta.changes, accounts: out[2].meta.changes } }, 200);
  }
  return json(req, { error: "not found" }, 404);
}

// ---- private .ics feed: saved camps' published session dates + sign-up dates, plus Planner gap weeks
function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsDay(iso) { return iso.replace(/-/g, ""); }
function nextDay(iso) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function fold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); } out.push(line); return out.join("\r\n"); }
function plannerGaps(pl) {
  const cov = (pl && Array.isArray(pl.covered)) ? pl.covered.filter((c) => c && /^\d{4}-\d\d-\d\d$/.test(c.start) && /^\d{4}-\d\d-\d\d$/.test(c.end)) : [];
  const gaps = [];
  for (let w = new Date("2027-05-31T00:00:00Z"); w <= new Date("2027-08-09T00:00:00Z"); w.setUTCDate(w.getUTCDate() + 7)) {
    let n = 0;
    for (let i = 0; i < 5; i++) { const d = new Date(w.getTime() + i * 864e5).toISOString().slice(0, 10); if (cov.some((c) => c.start <= d && d <= c.end)) n++; }
    if (n < 5) gaps.push(w.toISOString().slice(0, 10));
  }
  return { gaps, covered: cov.slice(0, 40) };
}
async function handleIcs(env, token) {
  const a = await env.DB.prepare("SELECT * FROM accounts WHERE ics_token = ?").bind(token).first();
  if (!a) return new Response("Not found", { status: 404 });
  const saved = (await env.DB.prepare("SELECT camp FROM saved_camps WHERE account_id = ?").bind(a.id).all()).results || [];
  const camps = (await siteCamps()) || [];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlanta Kids Camps//My camp calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:My camp calendar (Atlanta Kids Camps)", "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"];
  const ev = (uid, start, endIncl, summary, desc, link) => {
    L.push("BEGIN:VEVENT", "UID:" + uid + "@atlantakidscamps.com", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + icsDay(start), "DTEND;VALUE=DATE:" + icsDay(nextDay(endIncl)), fold("SUMMARY:" + icsEsc(summary)));
    if (desc) L.push(fold("DESCRIPTION:" + icsEsc(desc)));
    if (link) L.push(fold("URL:" + link));
    L.push("TRANSP:TRANSPARENT", "END:VEVENT");
  };
  let i = 0;
  for (const s of saved) {
    const c = camps.find((x) => x.name === s.camp);
    if (!c) continue;
    i++;
    for (const se of c.sessions || []) ev("s" + i + "-" + se.start + "-" + a.ics_token.slice(0, 6), se.start, se.end, c.name + " (published 2027 dates)", "Dates from the provider page, checked " + c.last_checked + ". Confirm with the provider.", c.source_url);
    for (const r of c.reg_dates || []) ev("r" + i + "-" + r.date + "-" + a.ics_token.slice(0, 6), r.date, r.date, r.label + ": " + c.name, (c.registration || "") + " (checked " + c.last_checked + ")", c.source_url);
  }
  let pl = null;
  try { pl = a.planner ? JSON.parse(a.planner) : null; } catch {}
  if (pl) {
    const g = plannerGaps(pl);
    g.covered.forEach((c, k) => ev("cov" + k + "-" + c.start + "-" + a.ics_token.slice(0, 6), c.start, c.end, String(c.label || "Covered").slice(0, 60), "From your Summer Planner", ""));
    g.gaps.forEach((w) => ev("gap-" + w + "-" + a.ics_token.slice(0, 6), w, nextDay(nextDay(nextDay(nextDay(w)))).slice(0, 10), "Gap week: need camp", "Open week in your Summer Planner: " + SITE + "/planner/", ""));
  }
  L.push("END:VCALENDAR");
  return new Response(L.join("\r\n") + "\r\n", { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=600", "Content-Disposition": 'inline; filename="my-camp-calendar.ics"', "X-Robots-Tag": "noindex" } });
}

async function routeAccounts(req, env, url) {
  if (!env.DB) return json(req, { error: "accounts not configured" }, 503);
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { return json(req, { error: "invalid json" }, 400); } }
  if (url.pathname === "/auth/request" && req.method === "POST") {
    if (!(await rateLimitOk(clientIp(req)))) return json(req, { error: "too many requests" }, 429);
    return handleAuthRequest(req, env, url, body);
  }
  if (url.pathname === "/auth/verify" && req.method === "POST") {
    if (!(await rateLimitOk(clientIp(req)))) return json(req, { error: "too many requests" }, 429);
    return handleAuthVerify(req, env, body);
  }
  const a = await sessionAccount(req, env);
  if (!a) return json(req, { error: "Please sign in again." }, 401);
  return handleMe(req, env, url, a, body);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/unsubscribe" && (req.method === "GET" || req.method === "POST")) {
      return handleUnsubscribe(req, env, url);
    }
    const icsM = url.pathname.match(/^\/ics\/([A-Za-z0-9_-]{20,64})\.ics$/);
    if (icsM && req.method === "GET") {
      if (!env.DB) return new Response("Not found", { status: 404 });
      return handleIcs(env, icsM[1]);
    }
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    const origin = req.headers.get("Origin") || "";
    // Browser requests must come from the site; allow missing Origin for server-side tests.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(req, { error: "origin not allowed" }, 403);
    }
    if (url.pathname.startsWith("/auth/") || url.pathname === "/me" || url.pathname.startsWith("/me/")) {
      if (!env.RESEND_API_KEY) return json(req, { error: "not configured" }, 503);
      return routeAccounts(req, env, url);
    }
    if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

    if (!(await rateLimitOk(clientIp(req)))) {
      return json(req, { error: "too many requests" }, 429);
    }

    if (!env.RESEND_API_KEY) {
      return json(req, { error: "not configured" }, 503);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid json" }, 400);
    }

    // Honeypot: bots fill hidden fields; pretend success.
    if (body._honey || body.website || body.url) {
      return json(req, { success: true }, 200);
    }

    const email = clip(body.EMAIL || body.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return json(req, { error: "bad email" }, 400);
    }

    const activities = clip(body.ACTIVITIES)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);

    const unsub =
      String(body.UNSUBSCRIBE || "").toLowerCase() === "yes" ||
      String(body.unsubscribed || "").toLowerCase() === "true";

    const headers = {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    };

    const intent = clip(body.INTENT) || "signup";
    // Changing someone's alerts (preferences or unsubscribe) needs proof the parent controls the address:
    // the signed token from an email link, or a signed-in session for the same address.
    if (unsub || intent === "preference_update") {
      let authed = clip(body.t || body.TOKEN) === (await unsubToken(env, email));
      if (!authed) {
        const a = await sessionAccount(req, env).catch(() => null);
        authed = !!(a && a.email === email);
      }
      if (!authed) return json(req, { error: "sign-in required", auth_required: true }, 401);
    }

    if (unsub) {
      if (env.DB) { try { await env.DB.prepare("UPDATE accounts SET paused = 1 WHERE email = ?").bind(email).run(); } catch {} }
      const res = await fetch(
        "https://api.resend.com/contacts/" + encodeURIComponent(email),
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ unsubscribed: true }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Contact may not exist yet — create as unsubscribed.
        if (res.status === 404) {
          const create = await fetch("https://api.resend.com/contacts", {
            method: "POST",
            headers,
            body: JSON.stringify({
              email,
              unsubscribed: true,
              segments: [{ id: SEGMENT }],
            }),
          });
          const created = await create.json().catch(() => ({}));
          if (!create.ok) {
            return json(req, { error: created.message || "resend error" }, 502);
          }
          return json(req, { success: true, id: created.id, unsubscribed: true }, 200);
        }
        return json(req, { error: data.message || "resend error" }, 502);
      }
      return json(req, { success: true, unsubscribed: true }, 200);
    }

    const properties = {
      preferred_area: clip(body.AREA),
      watched_camp: clip(body.CAMP),
      preferred_seasons: clip(body.SEASON),
      preferred_activities: activities.join(", "),
    };
    // The preferences page has no camp field and seasons are optional there:
    // don't wipe a parent's saved camp/seasons when those fields are left blank.
    if (intent === "preference_update") {
      if (!properties.watched_camp) delete properties.watched_camp;
      if (!properties.preferred_seasons) delete properties.preferred_seasons;
    }

    // Is this a brand-new subscriber? (Only they get a welcome.) An anonymous signup for an address that is
    // already on the list never overwrites its choices or re-subscribes it; the parent signs in to change them.
    let isNew = false;
    if (intent === "signup") {
      const look = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(email), { headers });
      if (look.ok) return json(req, { success: true, existing: true, intent }, 200);
      if (look.status !== 404) return json(req, { error: "resend error" }, 502);
      isNew = !!origin;
    }

    const payload = {
      email,
      unsubscribed: false,
      segments: [{ id: SEGMENT }],
      properties,
      topics: buildTopics(activities),
    };

    const res = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(req, { error: data.message || "resend error" }, 502);
    if (intent === "preference_update" && env.DB) {
      // A verified preference save re-subscribes the address (as before), so keep the account in step.
      try { await env.DB.prepare("UPDATE accounts SET paused = 0 WHERE email = ?").bind(email).run(); } catch {}
    }
    let welcome = false;
    if (isNew) {
      try {
        welcome = await sendWelcome(env, headers, email, properties, url.origin);
      } catch {
        welcome = false; // never fail the signup because the welcome failed
      }
    }
    return json(
      req,
      {
        success: true,
        id: data.id,
        intent,
        welcome,
      },
      200
    );
  },
};
