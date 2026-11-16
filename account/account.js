/* My camp calendar — optional passwordless account. Talks only to our signup Worker (config.js signupEndpoint).
   The session token lives in localStorage (akc_session); sign-in links put a one-time token in the URL fragment. */
(function () {
  "use strict";
  var cfg = window.SITE_CONFIG || {};
  var API = String(cfg.signupEndpoint || "").replace(/\/$/, "");
  var CAMPS = window.CAMPS || [];
  var SK = "akc_session", PK = "akc_pending_saves", NK = "akc_saved_names", PLK = "akc_planner_v1", PTS = "akc_planner_ts";
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var me = null, view = "month", cursor = null, PRI = { signup: 0, cov: 1, gap: 2, session: 3 };
  function $(i) { return document.getElementById(i); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function D(s) { return new Date(s + "T00:00:00Z"); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function add(d, n) { return new Date(d.getTime() + n * 864e5); }
  function todayIso() { var n = new Date(); return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); }
  function monday(d) { var w = (d.getUTCDay() + 6) % 7; return add(d, -w); }
  function short(d) { return MON[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCDate(); }
  function byName(n) { for (var i = 0; i < CAMPS.length; i++) if (CAMPS[i].name === n) return CAMPS[i]; return null; }
  function msg(id, t, bad) { var el = $(id); if (!el) return; el.textContent = t || ""; el.hidden = !t; el.classList.toggle("bad", !!bad); }

  function api(path, body, method) {
    var h = { "Content-Type": "application/json", Accept: "application/json" }, s = ls(SK);
    if (s) h.Authorization = "Bearer " + s;
    return fetch(API + path, { method: method || (body ? "POST" : "GET"), headers: h, body: body ? JSON.stringify(body) : undefined, credentials: "omit" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; if (r.status === 401 && path.indexOf("/auth/") !== 0) { ls(SK, null); } return j; }); });
  }

  /* ---------- sign in ---------- */
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var em = $("login-email").value.trim();
    $("login-err").textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { $("login-err").textContent = "Enter a valid email address."; $("login-email").focus(); return; }
    $("login-btn").disabled = true; $("login-msg").textContent = "Sending…";
    api("/auth/request", { email: em }).then(function (j) {
      $("login-btn").disabled = false;
      if (j.success) { $("login-msg").innerHTML = "Check your inbox for an email from <strong>signup@atlantakidscamps.com</strong> and tap the link on this device. It expires in 15 minutes."; try { if (window.mogulStats) window.mogulStats.track("account_link"); } catch (_e) {} }
      else $("login-msg").textContent = j.error || "Something went wrong. Please try again.";
    }).catch(function () { $("login-btn").disabled = false; $("login-msg").textContent = "Couldn’t reach our server. Please try again."; });
  });

  function verifyFromHash() {
    var m = location.hash.match(/^#login=([A-Za-z0-9_.-]+)$/);
    if (!m) return Promise.resolve(false);
    history.replaceState(null, "", location.pathname + location.search);
    msg("app-msg", "");
    return api("/auth/verify", { token: m[1] }).then(function (j) {
      if (j.success && j.session) { ls(SK, j.session); return j; }
      $("login-msg").textContent = j.error || "That sign-in link didn’t work. Request a new one.";
      return false;
    });
  }

  /* ---------- data ---------- */
  function savedNames() { return (me && me.camps || []).map(function (c) { return c.camp; }); }
  function cacheNames() { ls(NK, JSON.stringify(savedNames())); }
  function planner() {
    var p = null; try { p = JSON.parse(ls(PLK) || "null"); } catch (e) {}
    return p || (me && me.planner) || null;
  }
  function plannerWeeks(p) {
    var out = { gaps: [], covered: [] }; if (!p) return out;
    var cov = (p.covered || []).filter(function (c) { return c && /^\d{4}-\d\d-\d\d$/.test(c.start) && /^\d{4}-\d\d-\d\d$/.test(c.end); });
    out.covered = cov;
    for (var w = D("2027-05-31"); w <= D("2027-08-09"); w = add(w, 7)) {
      var n = 0; for (var i = 0; i < 5; i++) { var d = iso(add(w, i)); if (cov.some(function (c) { return c.start <= d && d <= c.end; })) n++; }
      if (n < 5) out.gaps.push(iso(w));
    }
    return out;
  }
  function events() {
    var ev = [];
    (me && me.camps || []).forEach(function (s) {
      var c = byName(s.camp); if (!c) return;
      (c.sessions || []).forEach(function (x) { ev.push({ type: "session", start: x.start, end: x.end, title: c.name, camp: c }); });
      (c.reg_dates || []).forEach(function (r) { ev.push({ type: "signup", start: r.date, end: r.date, title: r.label + ": " + c.name, camp: c }); });
    });
    var p = planner(), pw = plannerWeeks(p);
    if (p && ((p.covered || []).length || (p.needs && p.needs.age))) {
      pw.covered.forEach(function (c) { ev.push({ type: "cov", start: c.start, end: c.end, title: c.label || "Covered" }); });
      pw.gaps.forEach(function (w) { ev.push({ type: "gap", start: w, end: iso(add(D(w), 4)), title: "Gap week: need camp" }); });
    }
    return ev;
  }

  /* ---------- calendar ---------- */
  function firstEventMonth(ev) {
    var t = todayIso(), up = ev.filter(function (e) { return e.end >= t; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var d = up.length ? D(up[0].start < t ? t : up[0].start) : D(t);
    return d;
  }
  function chip(e, short) {
    var lbl = e.type === "signup" ? "🔔 " + (short ? e.camp.name : e.title) : e.title;
    var href = e.camp ? ' href="' + esc(e.camp.source_url) + '" target="_blank" rel="noopener"' : (e.type === "gap" || e.type === "cov" ? ' href="../planner/"' : "");
    return '<a class="ev ev-' + e.type + '"' + href + ' title="' + esc(e.title) + '">' + esc(lbl) + "</a>";
  }
  function renderCal() {
    var ev = events(), cal = $("cal"), t = todayIso();
    if (!cursor) cursor = firstEventMonth(ev);
    var html = "";
    if (view === "month") {
      var first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)), start = monday(first);
      $("cal-title").textContent = MON[first.getUTCMonth()] + " " + first.getUTCFullYear();
      html += '<div class="cal-grid month" role="grid"><div class="cal-dow" role="row">' + DOW.map(function (d) { return '<span role="columnheader">' + d + "</span>"; }).join("") + "</div>";
      for (var w = 0; w < 6; w++) {
        var ws = add(start, w * 7); if (w > 3 && ws.getUTCMonth() !== first.getUTCMonth()) break;
        html += '<div class="cal-week" role="row">';
        for (var i = 0; i < 7; i++) {
          var d = add(ws, i), di = iso(d), out = d.getUTCMonth() !== first.getUTCMonth();
          var todays = ev.filter(function (e) { return e.start <= di && di <= e.end && (e.type === "signup" || i < 5); }).sort(function (a, b) { return PRI[a.type] - PRI[b.type]; });
          html += '<div role="gridcell" class="cal-day' + (out ? " out" : "") + (di === t ? " today" : "") + '"><span class="dnum">' + d.getUTCDate() + "</span>" + todays.slice(0, 3).map(function (x) { return chip(x, true); }).join("") + (todays.length > 3 ? '<span class="more">+' + (todays.length - 3) + " more</span>" : "") + "</div>";
        }
        html += "</div>";
      }
      html += "</div>";
      // agenda for the month (shown under the grid on phones, where day cells only show coloured marks)
      var mStart = iso(first), mEnd = iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)));
      var ag = ev.filter(function (e) { return e.start <= mEnd && e.end >= mStart; }).sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : PRI[a.type] - PRI[b.type]; });
      html += '<ul class="cal-agenda">' + (ag.length ? ag.map(function (e) { var d1 = D(e.start), d2 = D(e.end); return "<li><span class=\"when\">" + (e.start === e.end ? short(d1) : short(d1) + "–" + short(d2)) + "</span>" + chip(e) + "</li>"; }).join("") : '<li class="small muted">Nothing on your calendar this month.</li>') + "</ul>";
    } else {
      var ms = monday(cursor), me2 = add(ms, 6);
      $("cal-title").textContent = "Week of " + short(ms) + ", " + ms.getUTCFullYear();
      html += '<ol class="cal-list">';
      for (var k = 0; k < 7; k++) {
        var dd = add(ms, k), dk = iso(dd), list = ev.filter(function (e) { return e.start <= dk && dk <= e.end && (e.type === "signup" || k < 5); }).sort(function (a, b) { return PRI[a.type] - PRI[b.type]; });
        html += '<li class="' + (dk === t ? "today" : "") + '"><strong>' + DOW[k] + " " + short(dd) + "</strong>" + (list.length ? list.map(chip).join("") : '<span class="small muted">Nothing scheduled</span>') + "</li>";
      }
      html += "</ol>";
      void me2;
    }
    cal.innerHTML = html;
    // camps with nothing published yet
    var und = (me && me.camps || []).map(function (s) { return byName(s.camp); }).filter(function (c) { return c && !(c.sessions && c.sessions.length) && !(c.reg_dates && c.reg_dates.length); });
    $("undated").innerHTML = und.length ? '<h3>Saved camps without published dates</h3><ul class="undated">' + und.map(function (c) { return "<li><strong>" + esc(c.name) + "</strong> · 2027 dates: <em>not announced yet</em> · Sign-up: " + esc(c.registration) + ' <a href="' + esc(c.source_url) + '" target="_blank" rel="noopener">Provider page ↗</a></li>'; }).join("") + "</ul>" : "";
  }
  $("v-month").onclick = function () { view = "month"; $("v-month").setAttribute("aria-pressed", "true"); $("v-week").setAttribute("aria-pressed", "false"); renderCal(); };
  $("v-week").onclick = function () { view = "week"; $("v-week").setAttribute("aria-pressed", "true"); $("v-month").setAttribute("aria-pressed", "false"); renderCal(); };
  $("cal-prev").onclick = function () { cursor = view === "month" ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1)) : add(cursor, -7); renderCal(); };
  $("cal-next").onclick = function () { cursor = view === "month" ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)) : add(cursor, 7); renderCal(); };
  $("cal-today").onclick = function () { cursor = D(todayIso()); renderCal(); };

  /* ---------- saved camps ---------- */
  function renderSaved() {
    var list = me.camps || [];
    $("saved-count").textContent = list.length ? "(" + list.length + ")" : "";
    $("saved").innerHTML = list.length ? list.map(function (s, i) {
      var c = byName(s.camp) || { name: s.camp, dates: "", registration: "", source_url: "" };
      var dated = c.sessions && c.sessions.length ? c.sessions.map(function (x) { return short(D(x.start)) + "–" + short(D(x.end)); }).join(", ") + ", 2027" : "2027 dates: not announced yet";
      var reg = c.reg_dates && c.reg_dates.length ? c.reg_dates.map(function (r) { return r.label + " " + short(D(r.date)) + ", " + r.date.slice(0, 4); }).join("; ") : "Sign-up date: not announced yet";
      return '<li class="saved-item" data-i="' + i + '"><div><strong>' + esc(c.name) + "</strong>" + (c.source_url ? ' <a class="small" href="' + esc(c.source_url) + '" target="_blank" rel="noopener">Provider page ↗</a>' : "") +
        '<p class="small">' + esc(dated) + " · " + esc(reg) + (c.last_checked ? " · checked " + esc(c.last_checked) : "") + "</p>" +
        '<label class="chk small"><input type="checkbox" class="t-open"' + (s.alert_open ? " checked" : "") + "> Email me when sign-ups open</label>" +
        '<label class="chk small"><input type="checkbox" class="t-remind"' + (s.alert_remind ? " checked" : "") + "> Reminder before sign-up day</label></div>" +
        '<button type="button" class="linkish rm" aria-label="Remove ' + esc(c.name) + '">Remove</button></li>';
    }).join("") : '<li class="small muted">No saved camps yet. Add one above, or tap ☆ Save on a camp card.</li>';
  }
  $("saved").addEventListener("change", function (e) {
    var li = e.target.closest(".saved-item"); if (!li) return; var s = me.camps[+li.getAttribute("data-i")];
    api("/me/camps", { camp: s.camp, alert_open: li.querySelector(".t-open").checked, alert_remind: li.querySelector(".t-remind").checked }).then(accept);
  });
  $("saved").addEventListener("click", function (e) {
    var b = e.target.closest(".rm"); if (!b) return; var s = me.camps[+b.closest(".saved-item").getAttribute("data-i")];
    api("/me/camps/remove", { camp: s.camp }).then(accept);
  });
  $("camp-list").innerHTML = CAMPS.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join("");
  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("add-camp").value.trim(); if (!n) return;
    if (!byName(n)) { msg("app-msg", "Pick a camp from the list (start typing its name).", true); return; }
    api("/me/camps", { camp: n }).then(function (j) { if (accept(j)) { $("add-camp").value = ""; msg("app-msg", "Saved " + n + "."); } });
  });

  /* ---------- feed / ics ---------- */
  function icsText() {
    var stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z", L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlanta Kids Camps//My camp calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:My camp calendar (Atlanta Kids Camps)"];
    function e(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    events().forEach(function (x, i) {
      L.push("BEGIN:VEVENT", "UID:acct-" + x.type + "-" + i + "-" + x.start + "@atlantakidscamps.com", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + x.start.replace(/-/g, ""), "DTEND;VALUE=DATE:" + iso(add(D(x.end), 1)).replace(/-/g, ""),
        "SUMMARY:" + e(x.type === "session" ? x.title + " (published 2027 dates)" : x.title));
      if (x.camp) L.push("DESCRIPTION:" + e("From the provider page, checked " + x.camp.last_checked + ". Confirm with the provider."), "URL:" + x.camp.source_url);
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR"); return L.join("\r\n") + "\r\n";
  }
  $("ics-dl").onclick = function () {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([icsText()], { type: "text/calendar" })); a.download = "my-camp-calendar.ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  $("ics-copy").onclick = function () {
    var v = $("ics-url").value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { $("ics-copy").textContent = "Copied"; }, function () { $("ics-url").select(); });
  };

  /* ---------- alerts / pause / delete ---------- */
  $("al-cats").innerHTML = (cfg.activityChoices || []).map(function (c) { return '<label class="chk"><input type="checkbox" name="al-cat" value="' + esc(c.label) + '"> ' + esc(c.label) + "</label>"; }).join("");
  function fillAlerts() {
    var a = me.alerts || {};
    $("al-area").value = a.area || "";
    var acts = String(a.activities || "").split(",").map(function (x) { return x.trim(); });
    [].forEach.call(document.querySelectorAll("input[name=al-cat]"), function (b) { b.checked = acts.indexOf(b.value) > -1; });
    var ss = String(a.seasons || "").split(",").map(function (x) { return x.trim(); });
    [].forEach.call(document.querySelectorAll("input[name=al-season]"), function (b) { b.checked = ss.indexOf(b.value) > -1; });
  }
  $("alerts-form").addEventListener("submit", function (e) {
    e.preventDefault(); $("al-msg").textContent = "Saving…";
    api("/me/alerts", {
      area: $("al-area").value,
      activities: [].filter.call(document.querySelectorAll("input[name=al-cat]"), function (b) { return b.checked; }).map(function (b) { return b.value; }),
      seasons: [].filter.call(document.querySelectorAll("input[name=al-season]"), function (b) { return b.checked; }).map(function (b) { return b.value; }).join(", ")
    }).then(function (j) { if (accept(j)) $("al-msg").textContent = "Saved."; else $("al-msg").textContent = j.error || "Couldn’t save."; });
  });
  $("pause-btn").onclick = function () {
    var p = !me.paused; $("danger-msg").textContent = "Saving…";
    api("/me/pause", { paused: p }).then(function (j) { if (accept(j)) $("danger-msg").textContent = p ? "All emails are paused." : "Emails resumed."; });
  };
  $("delete-btn").onclick = function () {
    if (!window.confirm("Delete your account? This removes your saved camps, planner copy and sign-ins, and removes your email from our list. This can’t be undone.")) return;
    $("danger-msg").textContent = "Deleting…";
    api("/me/delete", {}).then(function (j) {
      if (!j.success) { $("danger-msg").textContent = j.error || "Couldn’t delete. Please try again."; return; }
      ls(SK, null); ls(NK, null); ls(PK, null); ls(PTS, null);
      $("app").hidden = true; $("signin").hidden = true; $("deleted").hidden = false;
      $("deleted-detail").textContent = "We removed your account" + (j.rows ? " (" + j.rows.saved_camps + " saved camp" + (j.rows.saved_camps === 1 ? "" : "s") + ", " + j.rows.sessions + " sign-in session" + (j.rows.sessions === 1 ? "" : "s") + ")" : "") + (j.resend_contact === "deleted" ? " and deleted your address from our email list." : ". Your address wasn’t on our email list.") + " Your Summer Planner is still saved in this browser only.";
      document.title = "Account deleted — Atlanta Kids Camps";
    });
  };
  $("logout").onclick = function () { api("/auth/logout", {}).then(function () { ls(SK, null); ls(NK, null); location.reload(); }); };

  /* ---------- planner sync ---------- */
  function syncPlanner() {
    var local = ls(PLK), lts = +(ls(PTS) || 0), sts = me.planner_updated || 0;
    if (me.planner && sts > lts) { ls(PLK, JSON.stringify(me.planner)); ls(PTS, String(sts)); $("plan-status").textContent = "Loaded your saved Summer Planner from your account."; return; }
    if (local && (!me.planner || lts > sts)) {
      var p; try { p = JSON.parse(local); } catch (e) { return; }
      api("/me/planner", { planner: p }).then(function (j) { if (j.success) { ls(PTS, String(j.planner_updated)); me.planner = p; me.planner_updated = j.planner_updated; $("plan-status").textContent = "Your Summer Planner is synced to your account."; } });
      return;
    }
    $("plan-status").textContent = me.planner ? "Your Summer Planner is synced to your account." : "Plan your summer in the Planner and it’ll sync here, with its gap weeks on your calendar.";
  }

  /* ---------- render ---------- */
  function accept(j) {
    if (!j || j._status === 401) { showSignin("Your sign-in expired. Request a new link."); return false; }
    if (j.error) { msg("app-msg", j.error, true); return false; }
    if (j.email) { me = j; render(); }
    return true;
  }
  function render() {
    $("signin").hidden = true; $("app").hidden = false; $("deleted").hidden = true;
    $("me-email").textContent = me.email; $("pause-banner").hidden = !me.paused;
    $("pause-btn").textContent = me.paused ? "Resume emails" : "Pause all emails";
    $("ics-url").value = me.ics_url || "";
    $("ics-sub").href = String(me.ics_url || "").replace(/^https:/, "webcal:");
    cacheNames(); renderSaved(); renderCal(); fillAlerts();
  }
  function showSignin(t) { $("app").hidden = true; $("signin").hidden = false; if (t) $("login-msg").textContent = t; }
  function flushPending() {
    var pend = []; try { pend = JSON.parse(ls(PK) || "[]"); } catch (e) {}
    if (!pend.length) return Promise.resolve();
    ls(PK, null);
    return pend.reduce(function (p, n) { return p.then(function () { return api("/me/camps", { camp: n }); }); }, Promise.resolve()).then(function () { msg("app-msg", "Saved " + pend.join(", ") + "."); });
  }
  function load() {
    if (!ls(SK)) { showSignin(); var pend = []; try { pend = JSON.parse(ls(PK) || "[]"); } catch (e) {} if (pend.length) $("login-msg").textContent = "Sign in to save " + pend.join(", ") + " to your calendar."; return; }
    api("/me").then(function (j) {
      if (j._status === 401 || !j.email) { showSignin(j._status === 401 ? "Please sign in again." : "Couldn’t load your account. Please try again."); return; }
      me = j; return flushPending().then(function () { return api("/me"); }).then(function (j2) { if (j2 && j2.email) me = j2; render(); syncPlanner(); });
    }).catch(function () { showSignin("Couldn’t reach our server. Please try again."); });
  }
  verifyFromHash().then(function (v) {
    if (v && v.linked && v.linked.alert_contact) msg("app-msg", "Welcome! We linked your existing sign-up alerts to this account" + (v.linked.camp ? " and saved " + v.linked.camp : "") + ".");
    else if (v) msg("app-msg", "You’re signed in. Save camps to build your calendar.");
    load();
  });
})();
