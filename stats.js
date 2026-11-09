/*! Mogul cookieless stats beacon. No cookies. Skips bots client-side lightly; server drops known crawlers. */
(function () {
  var cfg = window.MOGUL_STATS || {};
  var endpoint = cfg.endpoint;
  var site = cfg.site;
  if (!endpoint || !site) return;

  var FLAG = "mogul_stats_internal";
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get("internal") === "1") localStorage.setItem(FLAG, "1");
  } catch (e) {}

  function isInternal() {
    try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return false; }
  }

  function send(event, extra) {
    if (isInternal()) return;
    var body = {
      site: site,
      event: event,
      path: location.pathname + location.search,
      referrer: document.referrer || "",
      target: (extra && extra.target) || ""
    };
    var payload = JSON.stringify(body);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (e) {}
    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: payload,
        mode: "cors",
        keepalive: true,
        credentials: "omit"
      }).catch(function () {});
    } catch (e) {}
  }

  var fired = false;
  function pageview() {
    if (fired) return;
    fired = true;
    send("pageview");
  }

  // Prefer first real interaction; fall back after a short delay so quiet humans still count.
  ["scroll", "pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, pageview, { once: true, passive: true });
  });
  setTimeout(pageview, 2500);

  // Outbound clicks (camp / lender / manager sites). Keep normal links.
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return;
      var url;
      try { url = new URL(href, location.href); } catch (err) { return; }
      if (url.origin === location.origin) return;
      send("outbound", { target: url.href });
    },
    true
  );

  // Completed alert sign-ups on kids camps: wrap fetch once.
  if (site === "kids-camps" && typeof window.fetch === "function") {
    var orig = window.fetch;
    window.fetch = function () {
      var args = arguments;
      var input = args[0];
      var init = args[1] || {};
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = (init.method || (input && input.method) || "GET").toUpperCase();
      var p = orig.apply(this, args);
      try {
        var signup = (window.SITE_CONFIG && window.SITE_CONFIG.signupEndpoint) || "";
        if (method === "POST" && signup && url.indexOf(signup) === 0) {
          p.then(function (res) {
            if (res && res.ok) send("signup");
          }).catch(function () {});
        }
      } catch (e) {}
      return p;
    };
  }

  window.mogulStats = { track: send, isInternal: isInternal };
})();
