# Parent alert signup pipeline

## Resend resources (atlantakidscamps.com)
- Domain ID: `a7a2254a-d395-4404-b972-c5e92de07c08` (sending + receiving verified)
- Segment: `Atlanta Kids Camps parent alerts` / `e38b3e6f-a6e3-4fea-b39c-b9e70ea1b6bc`
- Inbox: `signup@atlantakidscamps.com` / `48975f7c-ffdf-48a0-8377-418587166db7`
- From for alerts: `Atlanta Kids Camps Alerts <alerts@atlantakidscamps.com>`
- Contact properties: `preferred_area`, `watched_camp`, `preferred_seasons`, `preferred_activities`
- Topics:
  - Camp registration alerts `57c56578-806b-4b34-9332-5251097c7e82` (default opt_in)
  - STEM / LEGO / coding `cc3e88f5-f25f-4ba1-9b37-dfdfeed406d9`
  - Sports and outdoors `541b94a0-f965-4e95-b71a-7fe8b6f1c566`
  - Arts and theatre `246f8b40-6bd7-4870-9375-6f0b7433fc2e`
  - Day camps `26a4e3c5-2e7a-4a0a-bd73-16a0540da7a0`
  - Free library and community `8eec2573-a1ae-4ba6-911b-ef093f96e767`
  - School-break camps `fe6c1592-a52e-4116-8718-3c79f9cb5299`

## Public form path (no new paid account)
Static site POSTs JSON to FormSubmit AJAX → FormSubmit emails `signup@atlantakidscamps.com` →
agent (camp sign-up scanner routine) reads the Resend inbox and upserts a Resend contact.

FormSubmit requires a one-time confirmation click on the first submission (activation email lands in the signup inbox).
After confirm, FormSubmit may provide a random alias URL — put that alias in `config.js` `signupEndpoint` so the address is not in page source.

## Processor steps (routine / agent)
1. `list-inbox-threads` on signup inbox (folder inbox, unread).
2. For each new FormSubmit / preference message, `get-inbox-thread-email` and parse EMAIL, CAMP, ACTIVITY, ACTIVITIES, SEASON, AREA, UNSUBSCRIBE, INTENT.
3. `create-contact` (or update) with:
   - segmentIds: `[e38b3e6f-a6e3-4fea-b39c-b9e70ea1b6bc]`
   - properties: preferred_area, watched_camp, preferred_seasons, preferred_activities
   - topics: always opt_in general alerts; opt_in matching category topics from ACTIVITIES; opt_out the rest
   - if UNSUBSCRIBE=yes → update contact `unsubscribed: true`
4. Mark thread read / label processed.
5. Parent alert *sends* still go to Bri for approval until she grants standing send permission.
6. Every outbound alert must include Resend `{{{RESEND_UNSUBSCRIBE_URL}}}` (broadcasts) or a List-Unsubscribe header + link to https://atlantakidscamps.com/preferences/

## Why FormSubmit
Resend has no public browser signup endpoint (no CORS; API key must stay server-side). No Cloudflare/Netlify/Vercel account exists on this box. FormSubmit needs no account and no card.

## Status notes (2026-11-05)
- FormSubmit.co returned HTTP 522 from this box during setup (service outage). Site form falls back to `mailto:signup@atlantakidscamps.com` when the relay fails.
- Optional upgrade: deploy `tools/signup-worker.js` on Cloudflare Workers (free) with a Resend API key secret, then point `signupEndpoint` at the worker. Needs Bri to create a free Cloudflare account + Resend API key (no card required for CF free tier).

## Cloudflare Worker (live 2026-11-05)
- Script: `atlanta-kids-camps-signup`
- URL: `https://atlanta-kids-camps-signup.atlantakidscamps.workers.dev`
- Secret: `RESEND_API_KEY` (Resend key name `atlanta-kids-camps-signup-worker`; value never committed)
- CORS: `https://atlantakidscamps.com` and `https://www.atlantakidscamps.com`
- Site `config.js` `signupEndpoint` points here with `signupMode: "ajax"`

## Welcome email (added 2026-11-13)
- Sent by the Worker itself right after a successful signup, from `Atlanta Kids Camps <signup@atlantakidscamps.com>` (reply-to the same inbox), subject "You're on the list: Atlanta Kids Camps alerts".
- Only for a **brand-new** contact (Worker looks the address up first; 404 = new), only for `INTENT=signup` from the site form (browser `Origin` present). Preference updates, unsubscribes and repeat signups never send it. Resend `Idempotency-Key` per address blocks double sends.
- Body (plain HTML + text) lists the parent's choices: watched camp, area, seasons, categories; links to https://atlantakidscamps.com/preferences/ and a signed one-click unsubscribe link.
- Unsubscribe: `GET <worker>/unsubscribe?e=<email>&t=<token>` shows a confirm button; `POST` (button or RFC 8058 one-click from `List-Unsubscribe-Post`) PATCHes the Resend contact to `unsubscribed: true`. Token = HMAC-SHA256(email) keyed by SHA-256 of `RESEND_API_KEY` (no extra secret; bad tokens get 400).
- A failed welcome send never fails the signup; the JSON response carries `welcome: true|false`.
- Redeploy: Cloudflare `PUT /accounts/{id}/workers/scripts/atlanta-kids-camps-signup` (multipart, `main_module: signup-worker.js`, `compatibility_date: 2024-11-05`, `keep_bindings: ["secret_text"]`) so `RESEND_API_KEY` is kept.
- Contacts that signed up before 2026-11-13 never got a welcome; there is no automatic backfill (any catch-up note goes to Bri for approval first).

## Alert path and preference matching (written down 2026-11-13)
1. **Scanner** (scheduled agent routine) rechecks provider pages, commits new official dates to `data.json` and a `scan-YYYY-MM-DD.json` log.
2. **Match** every new/changed date against the segment's contacts (non-unsubscribed). A contact matches a camp when EITHER
   - `watched_camp` equals the camp `name` (by-name match: always alert), OR
   - the camp's category maps to a topic the contact opted into (STEM / LEGO / coding, Sports and outdoors, Arts and theatre, Day camps, Free library and community, School-break camps) **and** the event's season is in `preferred_seasons` (blank = any) **and** the camp's county matches `preferred_area` ("Anywhere" or blank = all; metro-wide providers match every area).
   Interest tag → topic: stem→STEM; sports/tennis/swim/gym/outdoor/nature/horse/farm/survival→Sports and outdoors; art/theatre/dance→Arts and theatre; day→Day camps; library/free→Free library and community; break→School-break camps.
   Area → county: "Cobb (Marietta, Smyrna, Kennesaw, East Cobb)"→cobb; "North Fulton"→north-fulton; metro and day-trip camps match every area; "Atlanta / DeKalb"→atlanta; "Gwinnett"→gwinnett.
3. **Draft** one email per contact (or a broadcast to a filtered segment) listing only that contact's matches, with official source links.
4. **Bri approves** the draft (no standing send permission yet).
5. **Send** from `Atlanta Kids Camps Alerts <alerts@atlantakidscamps.com>` with `{{{RESEND_UNSUBSCRIBE_URL}}}` or List-Unsubscribe + the preferences link.

Planned alerts wired to this rule:
| Event | Date | Camp county / tags | Matches |
|---|---|---|---|
| Josh Powell JPC Outpost (ages 9–12) | registration open now (opened Tue Nov 10, 2026 at noon) | cobb · day, nature | by name, or Day camps / Sports and outdoors + Summer + Cobb/Anywhere |
| Josh Powell Classic | Thu Jan 21, 2027 at noon | cobb · day, nature | same as above |
| Zoo Atlanta Summer Safari Camp | Fri Jan 22, 2027 | atlanta · day, farm, stem | by name, or Day camps / Sports and outdoors / STEM + Summer + Atlanta/DeKalb/Anywhere |
