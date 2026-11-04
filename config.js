/* EDIT ME — site config. Empty values keep the feature hidden/disabled (nothing fake goes live). */
window.SITE_CONFIG = {
  activityHeroAffiliateUrl: "",   // TODO(Bri): your ActivityHero affiliate link after approval
  // Mailchimp embedded-form POST URL, e.g. "https://XXXX.us21.list-manage.com/subscribe/post?u=AAAA&id=BBBB&f_id=CCCC"
  // The audience needs text merge fields CAMP, ACTIVITY, SEASON, AREA (Audience > Settings > Merge fields).
  // While empty, the alert form shows "launching soon" and submits nothing.
  signupEndpoint: "",
  signupHoneypot: "",             // Mailchimp anti-bot field name from the embed code, e.g. "b_AAAA_BBBB"
  signupTags: "",                 // optional: Mailchimp numeric tag ID(s) from the embed code, e.g. "1234567"
  contactEmail: "",               // TODO(Bri): e.g. hello@atlantakidscamps.com
  featuredStartingRate: "$49/month (proposed, editable)" // TODO(Bri): set or confirm
};
