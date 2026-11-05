/**
 * Cloudflare Worker: public signup / preferences / unsubscribe → Resend Contacts.
 * Secrets: RESEND_API_KEY
 * Deploy free-tier; CORS limited to atlantakidscamps.com (+www).
 *
 * Point window.SITE_CONFIG.signupEndpoint at this Worker's URL
 * and set signupMode: "ajax".
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

export default {
  async fetch(req, env) {
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

    const payload = {
      email,
      unsubscribed: false,
      segments: [{ id: SEGMENT }],
      properties: {
        preferred_area: clip(body.AREA),
        watched_camp: clip(body.CAMP),
        preferred_seasons: clip(body.SEASON),
        preferred_activities: activities.join(", "),
      },
      topics: buildTopics(activities),
    };

    const res = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(req, { error: data.message || "resend error" }, 502);
    return json(
      req,
      {
        success: true,
        id: data.id,
        intent: clip(body.INTENT) || "signup",
      },
      200
    );
  },
};
