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
