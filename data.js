/* No keys or runtime dependencies. Pure feed adapters also run in Node tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SeleneData = api;
})(this, function () {
  "use strict";
  var BASE = "https://site.api.espn.com/apis/site/v2/sports/";
  var TEAMS = [
    {
      key: "patriots",
      name: "Patriots",
      league: "football/nfl",
      id: "17",
      slug: "ne"
    },
    {
      key: "celtics",
      name: "Celtics",
      league: "basketball/nba",
      id: "2",
      slug: "bos"
    },
    {
      key: "bruins",
      name: "Bruins",
      league: "hockey/nhl",
      id: "1",
      slug: "bos"
    },
    {
      key: "redsox",
      name: "Red Sox",
      league: "baseball/mlb",
      id: "2",
      slug: "bos"
    }
  ];
  var WEATHER_URL =
    "https://api.open-meteo.com/v1/forecast?latitude=43.6884&longitude=-70.7937&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FNew_York&timeformat=unixtime&forecast_days=1";
  function finite(n) {
    return typeof n === "number" && isFinite(n);
  }
  function text(s) {
    return s == null ? "" : String(s).slice(0, 160);
  }
  function score(s) {
    if (s && typeof s === "object")
      s = s.displayValue != null ? s.displayValue : s.value;
    return s == null ? "—" : text(s);
  }
  function weatherLabel(code, day) {
    if (code === 0) return day ? "Clear skies" : "Clear night";
    if (code === 1) return "Mostly clear";
    if (code === 2) return "Partly cloudy";
    if (code === 3) return "Overcast";
    if (code === 45 || code === 48) return "Foggy";
    if (code >= 51 && code <= 57) return "Drizzle";
    if (code >= 61 && code <= 67) return "Rain";
    if (code >= 71 && code <= 77) return "Snow";
    if (code >= 80 && code <= 82) return "Rain showers";
    if (code === 85 || code === 86) return "Snow showers";
    if (code >= 95 && code <= 99) return "Thunderstorms";
    return "Conditions unavailable";
  }
  function normalizeWeather(raw) {
    var c = raw && raw.current,
      d = raw && raw.daily;
    if (!c || !finite(c.temperature_2m) || !finite(c.time))
      throw new Error("Incomplete weather response");
    return {
      temperature: Math.round(c.temperature_2m),
      feels: finite(c.apparent_temperature)
        ? Math.round(c.apparent_temperature)
        : null,
      code: finite(c.weather_code) ? c.weather_code : -1,
      day: c.is_day === 1,
      observed: c.time * 1000,
      high:
        d && d.temperature_2m_max && finite(d.temperature_2m_max[0])
          ? Math.round(d.temperature_2m_max[0])
          : null,
      low:
        d && d.temperature_2m_min && finite(d.temperature_2m_min[0])
          ? Math.round(d.temperature_2m_min[0])
          : null
    };
  }
  function normalizeEvents(raw, team) {
    if (!raw || !Array.isArray(raw.events))
      throw new Error("Incomplete schedule response");
    return raw.events
      .map(function (e) {
        var c = e.competitions && e.competitions[0];
        if (!c || !Array.isArray(c.competitors) || c.competitors.length !== 2)
          return null;
        var ours = c.competitors.filter(function (p) {
          return p.team && String(p.team.id) === team.id;
        })[0];
        var other = c.competitors.filter(function (p) {
          return p.team && String(p.team.id) !== team.id;
        })[0];
        var date = Date.parse(c.date || e.date);
        if (!ours || !other || !isFinite(date)) return null;
        var status = c.status || e.status || {},
          type = status.type || {},
          broadcast = c.broadcasts || [];
        var channels = [];
        broadcast.forEach(function (b) {
          if (b.media && b.media.shortName)
            channels.push(text(b.media.shortName));
          else if (b.names) channels = channels.concat(b.names.map(text));
        });
        var state = type.completed ? "post" : type.state;
        if (["pre", "in", "post"].indexOf(state) < 0) state = "unknown";
        var exceptional = /postpon|cancel|suspend|delay/i.test(
          [type.name, type.description, type.detail].join(" ")
        );
        return {
          id: text(e.id),
          date: date,
          state: state,
          exceptional: exceptional,
          status: text(type.shortDetail || type.detail || type.description),
          statusName: text(type.name),
          timeValid: e.timeValid !== false && c.timeValid !== false,
          home: ours.homeAway === "home",
          neutral: c.neutralSite === true,
          opponent: text(other.team.shortDisplayName || other.team.displayName),
          opponentCode: text(other.team.abbreviation),
          ownCode: text(ours.team.abbreviation),
          ownScore: score(ours.score),
          opponentScore: score(other.score),
          venue: text(c.venue && c.venue.fullName),
          broadcast: channels.join(" / "),
          week: text(e.week && e.week.text)
        };
      })
      .filter(function (e) {
        return !!e;
      })
      .sort(function (a, b) {
        return a.date - b.date;
      });
  }
  function selectEvents(events, now) {
    // Do not label a yesterday kickoff with a missing result as a future game.
    var live = events.filter(function (e) {
      return e.state === "in" && now - e.date < 18 * 3600000 && !e.exceptional;
    })[0];
    var next = events.filter(function (e) {
      return (
        e.state === "pre" &&
        !e.exceptional &&
        e.date >= now - (e.timeValid ? 0 : 86400000)
      );
    })[0];
    var finals = events.filter(function (e) {
      return e.state === "post" && !e.exceptional && e.date <= now;
    });
    var last = finals.length ? finals[finals.length - 1] : null;
    var interrupted = events.filter(function (e) {
      return e.exceptional && Math.abs(now - e.date) < 86400000;
    })[0];
    return {
      live: live || null,
      next: next || null,
      last: last,
      ticker:
        live ||
        interrupted ||
        (last && now - last.date < 86400000 ? last : next) ||
        last ||
        null
    };
  }
  function requestJSON(url, done) {
    var xhr = new XMLHttpRequest(),
      settled = false;
    function finish(err, value) {
      if (settled) return;
      settled = true;
      done(err, value);
    }
    xhr.open("GET", url, true);
    xhr.timeout = 10000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error("HTTP " + xhr.status));
        return;
      }
      try {
        finish(null, JSON.parse(xhr.responseText));
      } catch (e) {
        finish(e);
      }
    };
    xhr.onerror = xhr.ontimeout = function () {
      finish(new Error("Feed unavailable"));
    };
    xhr.onabort = function () {
      finish(new Error("Request paused"));
    };
    try {
      xhr.send();
    } catch (e) {
      finish(e);
    }
    return xhr;
  }
  function compactSchedule(events, team) {
    // Reconstruct only the provider fields consumed by normalizeEvents. ESPN's
    // original response can contain megabytes of logos, links and athlete data.
    return {
      events: events.map(function (e) {
        return {
          id: e.id,
          date: new Date(e.date).toISOString(),
          timeValid: e.timeValid,
          week: { text: e.week },
          competitions: [
            {
              neutralSite: e.neutral,
              status: {
                type: {
                  state: e.state,
                  completed: e.state === "post",
                  name: e.statusName,
                  shortDetail: e.status,
                  description: e.exceptional ? "Postponed / interrupted" : ""
                }
              },
              venue: { fullName: e.venue },
              broadcasts: e.broadcast ? [{ names: [e.broadcast] }] : [],
              competitors: [
                {
                  homeAway: e.home ? "home" : "away",
                  score: e.ownScore,
                  team: { id: team.id, abbreviation: e.ownCode }
                },
                {
                  homeAway: e.home ? "away" : "home",
                  score: e.opponentScore,
                  team: {
                    id: "opponent",
                    abbreviation: e.opponentCode,
                    shortDisplayName: e.opponent
                  }
                }
              ]
            }
          ]
        };
      })
    };
  }
  function createService(options) {
    var storage = options.storage,
      notify = options.onChange,
      request = options.request || requestJSON;
    var now = options.now || Date.now,
      timer = null,
      active = false,
      generation = 0,
      lastManual = 0;
    var feeds = [
      {
        key: "weather",
        url: WEATHER_URL,
        interval: 900000,
        maxAge: 86400000,
        parse: normalizeWeather
      }
    ];
    TEAMS.forEach(function (team) {
      feeds.push({
        key: team.key,
        team: team,
        url: BASE + team.league + "/teams/" + team.slug + "/schedule",
        interval: 300000,
        maxAge: 86400000,
        parse: function (raw) {
          return normalizeEvents(raw, team);
        }
      });
    });
    var state = {};
    function read(key) {
      try {
        return JSON.parse(storage.getItem("selene-v3-" + key));
      } catch (e) {
        return null;
      }
    }
    function write(key, value) {
      try {
        storage.setItem("selene-v3-" + key, JSON.stringify(value));
      } catch (e) {
        /* Memory cache still works. */
      }
    }
    feeds.forEach(function (feed) {
      var cached = read(feed.key),
        data = null,
        fetched = 0;
      if (
        cached &&
        cached.version === 1 &&
        finite(cached.fetched) &&
        cached.fetched <= now() &&
        now() - cached.fetched < feed.maxAge
      ) {
        // Cache raw provider JSON and revalidate, rather than trusting stored render data.
        try {
          data = feed.parse(cached.raw);
          fetched = cached.fetched;
        } catch (e) {
          /* Ignore corrupt cache. */
        }
      }
      state[feed.key] = {
        data: data,
        fetched: fetched,
        status: data ? "cached" : "loading",
        busy: false,
        next: 0,
        failures: 0
      };
    });
    function emit() {
      notify(state);
    }
    function refresh(force) {
      if (!active) return;
      feeds.forEach(function (feed) {
        var s = state[feed.key];
        if (s.data && now() - s.fetched >= feed.maxAge) {
          s.data = null;
          s.status = "unavailable";
        }
        if (s.busy || (!force && s.next > now())) return;
        s.busy = true;
        var run = generation;
        s.xhr = request(feed.url, function (err, raw) {
          if (run !== generation) return;
          s.busy = false;
          s.xhr = null;
          if (!err) {
            try {
              var parsed = feed.parse(raw);
              s.data = parsed;
              s.fetched = now();
              write(feed.key, {
                version: 1,
                fetched: s.fetched,
                raw: feed.team
                  ? compactSchedule(parsed, feed.team)
                  : { current: raw.current, daily: raw.daily }
              });
            } catch (e) {
              err = e;
            }
          }
          if (err) {
            s.failures++;
            s.status = s.data ? "cached" : "unavailable";
          } else {
            s.failures = 0;
            s.status = "fresh";
          }
          var interval = feed.interval;
          if (feed.team && s.data && selectEvents(s.data, now()).live)
            interval = 60000;
          s.next =
            now() +
            (err
              ? Math.min(60000 * Math.pow(2, s.failures - 1), 900000)
              : interval);
          emit();
        });
      });
      emit();
    }
    function start() {
      if (active) return;
      active = true;
      refresh(false);
      timer = setInterval(function () {
        refresh(false);
      }, 30000);
    }
    function pause() {
      active = false;
      generation++;
      clearInterval(timer);
      timer = null;
      feeds.forEach(function (f) {
        var s = state[f.key];
        var xhr = s.xhr;
        s.xhr = null;
        s.busy = false;
        if (xhr && xhr.abort) xhr.abort();
      });
    }
    function manual() {
      if (now() - lastManual < 15000) return false;
      lastManual = now();
      refresh(true);
      return true;
    }
    function offline() {
      pause();
      feeds.forEach(function (f) {
        var s = state[f.key];
        s.status = s.data ? "cached" : "unavailable";
        s.next = 0;
      });
      emit();
    }
    return {
      start: start,
      pause: pause,
      refresh: manual,
      offline: offline,
      state: state
    };
  }
  return {
    teams: TEAMS,
    weatherURL: WEATHER_URL,
    normalizeWeather: normalizeWeather,
    weatherLabel: weatherLabel,
    normalizeEvents: normalizeEvents,
    selectEvents: selectEvents,
    createService: createService
  };
});
