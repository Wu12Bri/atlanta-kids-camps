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

const RL_MAX = 8;
const RL_WINDOW_SEC = 60;
const MAX_FIELD = 200;

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://atlantakidscamps.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
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
  if (!res.ok && res.status !== 404) {
    return page("Something went wrong", `<p>We couldn't process that just now. Please try again, or email <a href="mailto:signup@atlantakidscamps.com">signup@atlantakidscamps.com</a> with "unsubscribe".</p>`, 502);
  }
  return page("You're unsubscribed", `<p>You won't get any more camp alert emails from us. Changed your mind? Sign up again any time at <a href="${SITE}/">atlantakidscamps.com</a>.</p>`);
}

function welcomeContent(p, unsubUrl) {
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
    `Change your preferences: ${PREFS_URL}\nUnsubscribe: ${unsubUrl}\n\n` +
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
    `<p style="margin:0 0 4px"><a href="${PREFS_URL}" style="color:#1f5f5b;font-weight:bold">Change your preferences</a></p>` +
    `</td></tr><tr><td style="padding:14px 24px;border-top:1px solid #e8e0d2;font-size:12px;color:#5b6b69;line-height:1.5">` +
    `You're getting this because this address was entered in the alert form on <a href="${SITE}/" style="color:#5b6b69">atlantakidscamps.com</a>. ` +
    `If that wasn't you, <a href="${esc(unsubUrl)}" style="color:#5b6b69">unsubscribe</a>. · <a href="${PREFS_URL}" style="color:#5b6b69">Preferences</a>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

async function sendWelcome(env, headers, email, properties, base) {
  const unsubUrl = await unsubLink(env, base, email);
  const { text, html } = welcomeContent(properties, unsubUrl);
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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/unsubscribe" && (req.method === "GET" || req.method === "POST")) {
      return handleUnsubscribe(req, env, url);
    }
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

    const origin = req.headers.get("Origin") || "";
    // Browser requests must come from the site; allow missing Origin for server-side tests.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(req, { error: "origin not allowed" }, 403);
    }

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

    if (unsub) {
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

    const intent = clip(body.INTENT) || "signup";
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

    // Is this a brand-new subscriber? (Only they get a welcome.)
    let isNew = false;
    if (intent === "signup" && origin) {
      const look = await fetch("https://api.resend.com/contacts/" + encodeURIComponent(email), { headers });
      isNew = look.status === 404;
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
