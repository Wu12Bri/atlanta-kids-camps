(function () {
  var cfg = window.SITE_CONFIG || {};
  var form = document.getElementById("pref-form");
  var endpoint =
    cfg.signupEndpoint || "https://formsubmit.co/ajax/signup@atlantakidscamps.com";
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var em = document.getElementById("p-email").value.trim();
    var cats = [].map.call(form.querySelectorAll("input[name=cat_opt]:checked"), function (b) {
      return b.value;
    });
    document.getElementById("p-activities").value = cats.join(", ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
      document.getElementById("p-msg").textContent = "Enter a valid email.";
      return;
    }
    var unsub = document.getElementById("p-unsub").checked ? "yes" : "no";
    var payload = {
      EMAIL: em,
      AREA: document.getElementById("p-area").value,
      ACTIVITIES: cats.join(", "),
      SEASON: [].map.call(form.querySelectorAll("input[name=season_opt]:checked"), function (b) { return b.value; }).join(", "),
      UNSUBSCRIBE: unsub,
      _subject: "Alert preference update — Atlanta Kids Camps",
      _template: "table",
      _captcha: "false",
      _honey: "",
      _replyto: em,
      INTENT: "preference_update"
    };
    function mailtoFallback() {
      var body = [
        "INTENT: preference_update",
        "EMAIL: " + em,
        "AREA: " + payload.AREA,
        "ACTIVITIES: " + payload.ACTIVITIES,
        "UNSUBSCRIBE: " + unsub
      ].join("\n");
      document.getElementById("p-msg").textContent =
        "Web form relay is busy — opening your email app. Or email signup@atlantakidscamps.com.";
      window.location.href =
        "mailto:signup@atlantakidscamps.com?subject=" +
        encodeURIComponent("Alert preference update — Atlanta Kids Camps") +
        "&body=" +
        encodeURIComponent(body);
      document.getElementById("p-submit").disabled = false;
    }
    document.getElementById("p-submit").disabled = true;
    document.getElementById("p-msg").textContent = "Saving…";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.text().then(function (txt) {
          var j = null;
          try {
            j = JSON.parse(txt);
          } catch (err) {}
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (x.ok || (x.j && (x.j.success === "true" || x.j.success === true))) {
          document.getElementById("p-msg").textContent =
            "Got it. We will apply this to your alerts shortly.";
        } else {
          mailtoFallback();
        }
      })
      .catch(function () {
        mailtoFallback();
      });
  });
})();
