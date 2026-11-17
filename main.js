/* SELENE OS 0.3 — remote-first shell on the v0.2 app-launch foundation. */
(function () {
  "use strict";
  var apps = window.SeleneApps,
    Data = window.SeleneData;
  var selected = 0,
    firstRow = 0,
    gearFocused = false,
    settingsOpen = false,
    settingsIndex = 0;
  var settingIds = ["fast", "motion", "refresh", "close"],
    tiles = [],
    rows = [];
  var launchPending = false,
    launchTimer,
    toastTimer,
    clockTimer,
    staticTickerTimer,
    tickerIndex = 0,
    tickerItems = [];
  var lastFeedState,
    lastTickerSignature = "",
    storage = {
      getItem: function (key) {
        try {
          return window.localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      setItem: function (key, value) {
        try {
          window.localStorage.setItem(key, value);
        } catch (e) {
          /* Optional persistence. */
        }
      }
    };
  var fast = storage.getItem("selene-fast") === "true";
  var motion = storage.getItem("selene-motion") !== "false";
  var reduceQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  function el(id) {
    return document.getElementById(id);
  }
  function put(id, value) {
    el(id).textContent = value;
  }
  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }
  function focus(node) {
    node.focus({ preventScroll: true });
    // Older TV engines may ignore FocusOptions; keep navigation transform-only.
    el("apps-viewport").scrollTop = 0;
    el("stage").scrollTop = 0;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }
  function formatDate(date, options) {
    options.timeZone = "America/New_York";
    return new Date(date).toLocaleString("en-US", options);
  }
  function time(date) {
    return formatDate(date, { hour: "numeric", minute: "2-digit" });
  }
  function gameDate(e) {
    var date = formatDate(e.date, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    return date + " · " + (e.timeValid ? time(e.date) + " ET" : "Time TBD");
  }
  function clock() {
    var date = new Date(),
      display = time(date),
      period = display.match(/AM|PM/);
    put("clock", display.replace(/\s*(AM|PM)/, ""));
    put("period", period ? period[0] : "");
    put(
      "date",
      formatDate(date, { weekday: "long", month: "long", day: "numeric" })
    );
    var hour =
      Number(formatDate(date, { hour: "numeric", hour12: false })) % 24;
    put(
      "greeting",
      hour >= 5 && hour < 12
        ? "A LITTLE SPACE TO START YOUR DAY."
        : hour >= 12 && hour < 18
          ? "SETTLE IN. STAY A WHILE."
          : "YOUR EVENING, ELEVATED."
    );
    // Refresh age labels and event selection even when a provider is unreachable.
    if (lastFeedState) renderFeeds(lastFeedState);
  }
  function resize() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080),
      stage = el("stage");
    stage.style.transform = "scale(" + scale + ")";
    stage.style.left =
      Math.max(0, (window.innerWidth - 1920 * scale) / 2) + "px";
    stage.style.top =
      Math.max(0, (window.innerHeight - 1080 * scale) / 2) + "px";
  }
  var play =
    '<svg viewBox="0 0 64 46" aria-hidden="true"><rect x="1" y="2" width="62" height="42" rx="12" fill="#ff3344"/><path d="M26 13l19 10-19 10z" fill="white"/></svg>';
  function logo(app) {
    var body = "",
      css = app.brand;
    if (css === "youtube" || css === "youtubetv") {
      body =
        play +
        '<span class="wordmark">' +
        (css === "youtube" ? "YouTube" : "YouTube TV") +
        "</span>";
      css = "youtube";
    } else if (css === "twitch") body = "twitch";
    else if (css === "peacock")
      body =
        '<span class="wordmark">peacock</span><span class="peacock-dots"><i style="background:#f5d43e"></i><i style="background:#f49d45"></i><i style="background:#e76a63"></i><i style="background:#ac78c4"></i><i style="background:#729bd3"></i><i style="background:#77bf9d"></i></span>';
    else if (css === "paramount")
      body =
        '<svg viewBox="0 0 70 48" aria-hidden="true"><path d="M9 37a27 27 0 1 1 52 0" fill="none" stroke="#c5d9ff" stroke-width="2" stroke-dasharray="2 5"/><path d="M15 40L35 11l20 29z" fill="#d9e5ff"/><path d="M35 11l-6 21 8-5 3 13h15z" fill="#40578a"/></svg><span class="wordmark">Paramount+</span>';
    else if (css === "disney")
      body =
        '<span class="disney-arc"></span><span class="wordmark">Disney+</span>';
    else if (css === "netflix") body = "NETFLIX";
    else if (css === "prime")
      body =
        '<span class="wordmark">prime video</span><span class="prime-smile"></span>';
    else if (css === "hulu") body = "hulu";
    else if (css === "fox") body = "FOX<span>ONE</span>";
    else if (css === "tubi") body = "tubi";
    else {
      var paths = {
        xbox: '<circle cx="24" cy="24" r="20"/><path d="M11 10c15 6 21 17 27 28M37 10C22 16 16 27 10 38"/>',
        browser:
          '<circle cx="24" cy="24" r="20"/><ellipse cx="24" cy="24" rx="9" ry="20"/><path d="M5 17h38M5 31h38"/>',
        instagram:
          '<rect x="5" y="5" width="38" height="38" rx="11"/><circle cx="24" cy="24" r="9"/><circle cx="35" cy="13" r="2"/>',
        manual:
          '<path d="M24 10C15 4 6 7 4 9v30c9-4 15-2 20 2 5-4 11-6 20-2V9c-6-4-14-4-20 1v31"/>',
        promotion:
          '<rect x="5" y="10" width="38" height="27" rx="4"/><path d="M14 44h20M24 37v7M18 18l13 6-13 6z"/>',
        security:
          '<path d="M24 3L7 10v14c0 11 17 21 17 21s17-10 17-21V10zM15 23l6 6 12-13"/>',
        glance: '<circle cx="24" cy="24" r="19"/><path d="M24 11v14l10 7"/>',
        klyq: '<path d="M12 5v38M36 8L18 24l20 17"/>'
      };
      body =
        '<svg viewBox="0 0 48 48" aria-hidden="true">' +
        paths[css] +
        "</svg><span>" +
        escapeHTML(
          {
            xbox: "Xbox",
            browser: "Browser",
            instagram: "Instagram",
            manual: "e-Manual",
            promotion: "Samsung",
            security: "Security",
            glance: "Glance",
            klyq: "klyq"
          }[css]
        ) +
        "</span>";
      css = "secondary";
    }
    return (
      '<span class="app-logo logo-' +
      css +
      '" aria-hidden="true">' +
      body +
      "</span>"
    );
  }
  function buildApps() {
    apps.forEach(function (app, i) {
      if (i % 5 === 0) {
        var row = document.createElement("div");
        row.className = "app-row";
        row.setAttribute("role", "row");
        el("apps").appendChild(row);
        rows.push(row);
      }
      var tile = document.createElement("button");
      tile.className = "tile";
      tile.id = "app-" + i;
      tile.setAttribute("role", "gridcell");
      tile.setAttribute("aria-label", "Launch " + app.name);
      tile.setAttribute("tabindex", "-1");
      tile.style.setProperty("--glow", app.color);
      tile.style.setProperty("--halo", app.halo);
      tile.style.setProperty("--tile-tint", app.tint);
      tile.innerHTML =
        '<span class="tile-face">' +
        logo(app) +
        '</span><span class="tile-label">' +
        escapeHTML(app.name) +
        '<span class="tile-selected-mark"></span></span>';
      tile.addEventListener("click", function () {
        if (settingsOpen) return;
        selected = i;
        gearFocused = false;
        paintSelection();
        launch();
      });
      rows[rows.length - 1].appendChild(tile);
      tiles.push(tile);
    });
    for (var r = 0; r < rows.length; r++) {
      var dot = document.createElement("span");
      dot.className = "page-dot";
      el("pages").appendChild(dot);
    }
    paintSelection();
  }
  function paintSelection() {
    var row = Math.floor(selected / 5);
    if (row < firstRow) firstRow = row;
    if (row > firstRow + 1) firstRow = row - 1;
    el("apps").style.transform = "translateY(" + -firstRow * 225 + "px)";
    tiles.forEach(function (tile, i) {
      var chosen = i === selected && !gearFocused;
      tile.classList.toggle("selected", chosen);
      tile.setAttribute("aria-selected", String(chosen));
      tile.tabIndex = chosen && !settingsOpen ? 0 : -1;
    });
    rows.forEach(function (node, i) {
      node.setAttribute(
        "aria-hidden",
        String(i < firstRow || i > firstRow + 1)
      );
    });
    el("gear").classList.toggle("selected", gearFocused);
    el("gear").tabIndex = gearFocused && !settingsOpen ? 0 : -1;
    put("counter", pad(selected + 1) + " / " + apps.length);
    Array.prototype.forEach.call(el("pages").children, function (dot, i) {
      dot.classList.toggle("current", i === row);
    });
    if (!settingsOpen) focus(gearFocused ? el("gear") : tiles[selected]);
  }
  function toast(message) {
    clearTimeout(toastTimer);
    put("toast", message);
    el("toast").classList.remove("hidden");
    toastTimer = setTimeout(function () {
      el("toast").classList.add("hidden");
    }, 4500);
  }
  function launch() {
    if (launchPending) return;
    var app = apps[selected];
    if (!window.tizen || !window.tizen.application) {
      toast("Browser preview · " + app.name + " launches on your Samsung TV.");
      return;
    }
    launchPending = true;
    clearTimeout(launchTimer);
    launchTimer = setTimeout(function () {
      launchPending = false;
    }, 5000);
    toast("Opening " + app.name + "…");
    function failed() {
      launchPending = false;
      clearTimeout(launchTimer);
      toast(
        "Could not open " +
          app.name +
          ". Check that it is installed on this TV."
      );
    }
    try {
      // These IDs and this Tizen launch path are unchanged from v0.2.
      window.tizen.application.launch(
        app.id,
        function () {
          launchPending = false;
          clearTimeout(launchTimer);
          el("toast").classList.add("hidden");
        },
        failed
      );
    } catch (e) {
      failed();
    }
  }
  function motionEnabled() {
    return motion && !(reduceQuery && reduceQuery.matches);
  }
  function applyMotion() {
    var enabled = motionEnabled();
    el("apps").classList.toggle("wiggle", enabled);
    el("stage").classList.toggle("no-motion", !enabled);
    lastTickerSignature = "";
    if (lastFeedState) renderTicker(lastFeedState);
  }
  function openSettings() {
    settingsOpen = true;
    settingsIndex = 0;
    el("settings").classList.remove("hidden");
    paintSelection();
    paintSettings();
  }
  function closeSettings() {
    settingsOpen = false;
    el("settings").classList.add("hidden");
    paintSelection();
  }
  function paintSettings() {
    put("fast-value", fast ? "ON" : "OFF");
    put("motion-value", motionEnabled() ? "ON" : "OFF");
    el("fast").setAttribute("aria-pressed", String(fast));
    el("motion").setAttribute("aria-pressed", String(motionEnabled()));
    settingIds.forEach(function (id, i) {
      var chosen = i === settingsIndex;
      el(id).classList.toggle("active", chosen);
      el(id).tabIndex = chosen && settingsOpen ? 0 : -1;
    });
    if (settingsOpen) focus(el(settingIds[settingsIndex]));
  }
  function chooseSetting() {
    if (settingsIndex === 0) {
      fast = !fast;
      storage.setItem("selene-fast", String(fast));
    } else if (settingsIndex === 1) {
      motion = !motion;
      storage.setItem("selene-motion", String(motion));
      applyMotion();
    } else if (settingsIndex === 2) {
      toast(
        service.refresh()
          ? "Refreshing weather and Boston sports…"
          : "Already refreshing. Try again in a moment."
      );
    } else {
      closeSettings();
      return;
    }
    paintSettings();
  }
  function dismissSplash() {
    el("splash").classList.add("hide-splash");
  }
  function key(e) {
    var k = e.keyCode || e.which;
    if ([37, 38, 39, 40, 13, 10009, 27, 8, 9].indexOf(k) < 0) return;
    e.preventDefault();
    dismissSplash();
    var back = k === 10009 || k === 27 || k === 8;
    // Holding OK must not toggle repeatedly or relaunch an application.
    if (e.repeat && (k === 13 || back)) return;
    if (settingsOpen) {
      if (k === 38) settingsIndex = Math.max(0, settingsIndex - 1);
      else if (k === 40 || k === 9)
        settingsIndex = (settingsIndex + 1) % settingIds.length;
      else if (k === 13) {
        chooseSetting();
        return;
      } else if (back) {
        closeSettings();
        return;
      }
      paintSettings();
      return;
    }
    if (back) {
      openSettings();
      return;
    }
    if (gearFocused) {
      if (k === 13) openSettings();
      else if (k === 40 || k === 37 || k === 9) {
        gearFocused = false;
        paintSelection();
      }
      return;
    }
    if (k === 13) {
      launch();
      return;
    }
    if (k === 37) selected = Math.max(0, selected - 1);
    else if (k === 39 || k === 9)
      selected = Math.min(apps.length - 1, selected + 1);
    else if (k === 38) {
      if (selected < 5) gearFocused = true;
      else selected -= 5;
    } else if (k === 40 && Math.floor(selected / 5) < rows.length - 1)
      selected = Math.min(apps.length - 1, selected + 5);
    paintSelection();
  }
  function age(fetched) {
    var minutes = Math.max(0, Math.floor((Date.now() - fetched) / 60000));
    return minutes < 1
      ? "just now"
      : minutes < 60
        ? minutes + "m ago"
        : Math.floor(minutes / 60) + "h ago";
  }
  function feedStatus(s) {
    if (!s || !s.data)
      return s && s.status === "loading" ? "Connecting" : "Unavailable";
    if (Date.now() - s.fetched >= 86400000) return "Unavailable";
    var maxFresh = s === lastFeedState.weather ? 1800000 : 600000;
    if (s === lastFeedState.weather && Date.now() - s.data.observed > maxFresh)
      return "Cached · " + age(s.data.observed);
    return s.status === "fresh" && Date.now() - s.fetched < maxFresh
      ? "Updated " + age(s.fetched)
      : "Cached · " + age(s.fetched);
  }
  function weatherIcon(w) {
    var path =
      '<path d="M12 34h31a9 9 0 0 0 0-18 15 15 0 0 0-28-2 10 10 0 0 0-3 20z"/>';
    if (w.code <= 1 && w.code >= 0)
      path = w.day
        ? '<circle cx="29" cy="27" r="12"/><path d="M29 5v5m0 34v5M7 27h5m34 0h5M13 11l4 4m24 24 4 4m0-32-4 4M17 39l-4 4"/>'
        : '<path d="M40 8a22 22 0 1 0 11 32A24 24 0 0 1 40 8z"/>';
    else if (w.code >= 51 && w.code <= 99)
      path += '<path d="M18 42l-3 7m15-7-3 7m15-7-3 7"/>';
    return '<svg viewBox="0 0 64 56">' + path + "</svg>";
  }
  function renderWeather(s) {
    var w = s.data;
    if (w && Date.now() - w.observed > 86400000) w = null;
    if (!w) {
      put("temperature", "—");
      put(
        "weather-description",
        s.status === "loading"
          ? "Connecting to the weather"
          : "Weather unavailable"
      );
      put("weather-range", "We’ll try again automatically");
      put("weather-source", "Open-Meteo · " + feedStatus(s));
      return;
    }
    put("temperature", w.temperature);
    el("weather-icon").innerHTML = weatherIcon(w);
    put("weather-description", Data.weatherLabel(w.code, w.day));
    var range =
      (w.high === null ? "" : "H " + w.high + "°") +
      (w.low === null ? "" : "   L " + w.low + "°");
    if (w.feels !== null) range += "   ·   Feels " + w.feels + "°";
    put("weather-range", range);
    put("weather-source", "Open-Meteo · " + feedStatus(s));
  }
  function renderGame(s) {
    var usable = s.data && Date.now() - s.fetched < 86400000;
    var choice = usable ? Data.selectEvents(s.data, Date.now()) : {},
      game = choice.live || choice.next;
    put("sports-source", "ESPN · " + feedStatus(s));
    if (!game) {
      put("game-title", usable ? "Awaiting kickoff" : "Patriots football");
      put("game-badge", "NEXT UP");
      put(
        "game-kicker",
        usable ? "NO UPCOMING GAME IN THE FEED" : "NEW ENGLAND, ALWAYS."
      );
      put(
        "game-time",
        s.status === "loading"
          ? "Finding the next kickoff"
          : usable
            ? "Schedule to be announced"
            : "Schedule unavailable"
      );
      put("game-detail", "Updates automatically");
      return;
    }
    var cached = feedStatus(s).indexOf("Cached") === 0;
    put(
      "game-badge",
      choice.live ? (cached ? "CACHED" : "IN PLAY") : "NEXT UP"
    );
    put(
      "game-kicker",
      game.week
        ? game.week.toUpperCase()
        : game.neutral
          ? "NEUTRAL SITE"
          : game.home
            ? "HOME FIELD"
            : "ON THE ROAD"
    );
    put(
      "game-title",
      (game.home || game.neutral ? "vs " : "at ") + game.opponent
    );
    put(
      "game-time",
      choice.live
        ? game.ownCode +
            " " +
            game.ownScore +
            " — " +
            game.opponentCode +
            " " +
            game.opponentScore +
            " · " +
            game.status
        : gameDate(game)
    );
    put(
      "game-detail",
      game.broadcast || game.venue || (game.home ? "Home game" : "Away game")
    );
  }
  function tickerMarkup(team, s) {
    var usable = s.data && Date.now() - s.fetched < 86400000;
    var game = usable && Data.selectEvents(s.data, Date.now()).ticker,
      headline,
      status;
    if (!game) {
      headline = usable
        ? "Schedule to be announced"
        : s.status === "loading"
          ? "Connecting"
          : "Scores unavailable";
      status = "";
    } else if (game.exceptional) {
      headline = game.ownCode + " vs " + game.opponentCode;
      status = game.status;
    } else if (game.state === "in" || game.state === "post") {
      headline =
        game.ownCode +
        " " +
        game.ownScore +
        "  —  " +
        game.opponentCode +
        " " +
        game.opponentScore;
      status =
        game.status +
        (Date.now() - game.date > 86400000
          ? " · " + formatDate(game.date, { month: "short", day: "numeric" })
          : "");
    } else {
      headline =
        game.ownCode +
        (game.home || game.neutral ? " vs " : " at ") +
        game.opponentCode;
      status = gameDate(game);
    }
    if (feedStatus(s).indexOf("Cached") === 0)
      status += (status ? " · " : "") + feedStatus(s);
    return (
      '<span class="ticker-item"><span class="ticker-team">' +
      escapeHTML(team.name.toUpperCase()) +
      '</span><span class="ticker-score">' +
      escapeHTML(headline) +
      '</span><span class="ticker-state">' +
      escapeHTML(status) +
      "</span></span>"
    );
  }
  function renderTicker(state) {
    tickerItems = Data.teams.map(function (team) {
      return tickerMarkup(team, state[team.key]);
    });
    var signature = tickerItems.join("") + motionEnabled();
    if (signature !== lastTickerSignature) {
      lastTickerSignature = signature;
      // Both equal-width groups produce a seamless transform-only loop.
      el("ticker").innerHTML = motionEnabled()
        ? tickerItems.join("")
        : tickerItems[tickerIndex % tickerItems.length];
      el("ticker-copy").innerHTML = motionEnabled() ? tickerItems.join("") : "";
    }
    var fresh = Data.teams.filter(function (team) {
      return feedStatus(state[team.key]).indexOf("Updated") === 0;
    }).length;
    put("ticker-status", fresh === 4 ? "ESPN" : fresh ? "PARTIAL" : "OFFLINE");
  }
  function renderFeeds(state) {
    lastFeedState = state;
    renderWeather(state.weather);
    renderGame(state.patriots);
    renderTicker(state);
    var count = Object.keys(state).filter(function (key) {
      return feedStatus(state[key]).indexOf("Updated") === 0;
    }).length;
    var pending = Object.keys(state).some(function (key) {
      return state[key].busy || state[key].status === "loading";
    });
    put(
      "connection-label",
      count === 5
        ? "Connected"
        : count
          ? "Limited connection"
          : pending
            ? "Connecting"
            : "Offline"
    );
    el("connection-dot").classList.toggle("offline", count < 5 && !pending);
  }
  var service = Data.createService({ storage: storage, onChange: renderFeeds });
  function startTimers() {
    clearInterval(clockTimer);
    clearInterval(staticTickerTimer);
    clock();
    clockTimer = setInterval(clock, 30000);
    staticTickerTimer = setInterval(function () {
      if (!motionEnabled() && tickerItems.length) {
        tickerIndex++;
        lastTickerSignature = "";
        renderTicker(lastFeedState);
      }
    }, 10000);
  }
  function resume() {
    launchPending = false;
    el("stage").classList.remove("suspended");
    startTimers();
    paintSelection();
    if (navigator.onLine === false) service.offline();
    else service.start();
  }
  document.addEventListener("keydown", key);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      service.pause();
      clearInterval(clockTimer);
      clearInterval(staticTickerTimer);
      el("stage").classList.add("suspended");
    } else resume();
  });
  window.addEventListener("offline", function () {
    service.offline();
  });
  window.addEventListener("online", function () {
    if (!document.hidden) {
      service.start();
      service.refresh();
    }
  });
  window.addEventListener("resize", resize);
  if (reduceQuery && reduceQuery.addListener)
    reduceQuery.addListener(function () {
      applyMotion();
      if (settingsOpen) paintSettings();
    });
  el("gear").addEventListener("click", function () {
    if (!settingsOpen) {
      gearFocused = true;
      openSettings();
    }
  });
  settingIds.forEach(function (id, i) {
    el(id).addEventListener("click", function () {
      settingsIndex = i;
      chooseSetting();
    });
  });
  // Directional, Enter and Back are mandatory Samsung keys; no registration needed.
  resize();
  buildApps();
  applyMotion();
  resume();
  setTimeout(dismissSplash, fast ? 80 : 1400);
})();
