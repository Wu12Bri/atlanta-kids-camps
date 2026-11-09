/* EDIT ME — site config. Empty values keep the feature hidden/disabled (nothing fake goes live). */
window.SITE_CONFIG = {
  // Cookieless visit counts (Cloudflare Worker → Analytics Engine). No cookies; internal browsers use ?internal=1 once.
  statsEndpoint: "https://mogul-stats.atlantakidscamps.workers.dev",
  statsSite: "kids-camps",
  activityHeroAffiliateUrl: "",   // TODO(Bri): your ActivityHero affiliate link after approval
  // Cloudflare Worker → Resend Contacts (segment + topics). Free-tier Workers.
  signupEndpoint: "https://atlanta-kids-camps-signup.atlantakidscamps.workers.dev",
  signupMode: "ajax",
  signupHoneypot: "_honey",
  signupTags: "",
  contactEmail: "",               // TODO(Bri): e.g. hello@atlantakidscamps.com
  featuredStartingRate: "$49/month (proposed, editable)", // TODO(Bri): set or confirm
  preferencesUrl: "https://atlantakidscamps.com/preferences/",
  // Topic keys parents can pick; mapped to Resend topics by the signup processor.
  activityChoices: [
    { id: "stem", label: "STEM / LEGO / coding" },
    { id: "sports", label: "Sports and outdoors" },
    { id: "arts", label: "Arts and theatre" },
    { id: "day", label: "Day camps" },
    { id: "library", label: "Free library and community" },
    { id: "break", label: "School-break camps" }
  ]
};
