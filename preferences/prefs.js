/* Alert preferences. Changes are only accepted with proof the parent controls the address:
   the signed token (?e=&t=) from any of our emails, or a signed-in My camp calendar session. */
(function () {
  var cfg = window.SITE_CONFIG || {};
  var form = document.getElementById("pref-form");
  var API = String(cfg.signupEndpoint || "").replace(/\/$/, "");
  function $(i) { return document.getElementById(i); }
  var q = new URLSearchParams(location.search), token = q.get("t") || "", qEmail = (q.get("e") || "").toLowerCase(), session = null, sessEmail = "";
  try { session = localStorage.getItem("akc_session"); } catch (e) {}
  if (token || qEmail) history.replaceState(null, "", location.pathname); // keep the token out of history and referrers
  function setAuth(html) { $("p-auth").innerHTML = html; }
  function mode() {
    if (token && qEmail) { $("p-email").value = qEmail; $("p-email").readOnly = true; setAuth("Using the personal link from your email for <strong>" + esc(qEmail) + "</strong>."); $("p-linkbox").hidden = true; return; }
    if (sessEmail) { $("p-email").value = sessEmail; $("p-email").readOnly = true; setAuth("Signed in as <strong>" + esc(sessEmail) + "</strong>. You can also manage per-camp alerts in <a href=\"../account/\">My camp calendar</a>."); $("p-linkbox").hidden = true; return; }
    setAuth("Open this page from the <strong>Preferences</strong> link in any of our emails, or <a href=\"../account/\">sign in</a>, to change your settings.");
    $("p-linkbox").hidden = false;
  }
  function prefill(a) {
    if (!a || !a.contact) return;
    $("p-area").value = a.area || "";
    var acts = String(a.activities || "").split(",").map(function (x) { return x.trim(); }), ss = String(a.seasons || "").split(",").map(function (x) { return x.trim(); });
    [].forEach.call(form.querySelectorAll("input[name=cat_opt]"), function (b) { b.checked = acts.indexOf(b.value) > -1; });
    [].forEach.call(form.querySelectorAll("input[name=season_opt]"), function (b) { b.checked = ss.indexOf(b.value) > -1; });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  mode();
  if (session && !token && /^https:/.test(API)) {
    fetch(API + "/me", { headers: { Authorization: "Bearer " + session }, credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.email) { sessEmail = j.email; mode(); prefill(j.alerts); } }).catch(function () {});
  }
  $("p-sendlink").addEventListener("click", function () {
    var em = $("p-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { $("p-msg").textContent = "Enter a valid email first."; return; }
    $("p-sendlink").disabled = true;
    fetch(API + "/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }), credentials: "omit" })
      .then(function (r) { return r.json(); }).then(function (j) { $("p-msg").textContent = j.success ? "Check your inbox for a sign-in link from signup@atlantakidscamps.com. It expires in 15 minutes." : (j.error || "Couldn’t send. Try again."); })
      .catch(function () { $("p-msg").textContent = "Couldn’t reach our server. Try again, or email signup@atlantakidscamps.com."; })
      .then(function () { $("p-sendlink").disabled = false; });
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var em = $("p-email").value.trim().toLowerCase();
    var cats = [].map.call(form.querySelectorAll("input[name=cat_opt]:checked"), function (b) { return b.value; });
    $("p-activities").value = cats.join(", ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { $("p-msg").textContent = "Enter a valid email."; return; }
    if (!(token && qEmail === em) && !(sessEmail && sessEmail === em)) { $("p-msg").textContent = "Use the personal link from one of our emails, or request a sign-in link below, to change settings for this address."; $("p-linkbox").hidden = false; return; }
    var unsub = $("p-unsub").checked ? "yes" : "no";
    var payload = {
      EMAIL: em, AREA: $("p-area").value, ACTIVITIES: cats.join(", "),
      SEASON: [].map.call(form.querySelectorAll("input[name=season_opt]:checked"), function (b) { return b.value; }).join(", "),
      UNSUBSCRIBE: unsub, INTENT: "preference_update", _honey: "", t: token && qEmail === em ? token : ""
    };
    var h = { "Content-Type": "application/json", Accept: "application/json" };
    if (sessEmail === em && session) h.Authorization = "Bearer " + session;
    $("p-submit").disabled = true; $("p-msg").textContent = "Saving…";
    fetch(API, { method: "POST", headers: h, body: JSON.stringify(payload), credentials: "omit" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (x) {
        $("p-submit").disabled = false;
        if (x.ok && x.j.success) $("p-msg").textContent = unsub === "yes" ? "Done. You won’t get any more alert emails." : "Saved. Your alerts now use these settings.";
        else if (x.status === 401) { $("p-msg").textContent = "That link has expired or doesn’t match this address. Request a sign-in link below."; $("p-linkbox").hidden = false; }
        else $("p-msg").textContent = "Couldn’t save just now. Please try again, or email signup@atlantakidscamps.com.";
      })
      .catch(function () { $("p-submit").disabled = false; $("p-msg").textContent = "Couldn’t reach our server. Please try again, or email signup@atlantakidscamps.com."; });
  });
})();
