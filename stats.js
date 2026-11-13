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
    // text/plain keeps this a CORS "simple" request: no preflight, no credentials.
    // (sendBeacon always sends credentials, and an application/json beacon needs a
    // credentialed preflight the Worker never allowed, so Chrome silently dropped it.)
    var sent = false;
    try {
      if (typeof fetch === "function") {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: payload,
          mode: "cors",
          keepalive: true,
          credentials: "omit"
        }).catch(function () {});
        sent = true;
      }
    } catch (e) {}
    if (!sent) {
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
      } catch (e) {}
    }
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

  // Completed alert sign-ups are tracked explicitly by app.js on the success path
  // (window.mogulStats.track("signup")), so preference changes/unsubscribes are not counted.

  window.mogulStats = { track: send, isInternal: isInternal };
})();
