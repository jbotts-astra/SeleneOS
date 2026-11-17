const { test } = require("node:test");
const assert = require("node:assert/strict");
const Data = require("../data.js");
const { NOW, weather, event, schedule } = require("./fixtures.cjs");
function memory(initial = {}) {
  return {
    getItem: (k) => initial[k] || null,
    setItem: (k, v) => (initial[k] = v),
    values: initial
  };
}
function harness(storage = memory(), responses = {}) {
  const calls = [],
    pending = [];
  let now = NOW;
  const service = Data.createService({
    storage,
    now: () => now,
    onChange: () => {},
    request: (url, cb) => {
      const request = {
        url,
        cb,
        aborted: false,
        abort() {
          this.aborted = true;
          cb(new Error("aborted"));
        }
      };
      calls.push(request);
      pending.push(request);
      return request;
    }
  });
  function complete(fail = false) {
    while (pending.length) {
      const r = pending.shift();
      if (!r.aborted)
        r.cb(
          fail ? new Error("offline") : null,
          r.url.includes("open-meteo") ? weather : responses[r.url] || schedule
        );
    }
  }
  return { service, calls, complete, advance: (ms) => (now += ms) };
}
test("weather accepts zero, rejects null and incomplete data; all WMO groups map", () => {
  assert.equal(Data.normalizeWeather(weather).temperature, 38);
  assert.equal(
    Data.normalizeWeather({
      ...weather,
      current: { ...weather.current, temperature_2m: 0 }
    }).temperature,
    0
  );
  assert.throws(() =>
    Data.normalizeWeather({ current: { temperature_2m: null } })
  );
  assert.equal(Data.weatherLabel(0, false), "Clear night");
  assert.equal(Data.weatherLabel(95, true), "Thunderstorms");
  assert.equal(Data.weatherLabel(73, false), "Snow");
});
test("schedule filters unrelated teams, supports both score shapes and picks earliest future", () => {
  const raw = {
    events: [
      event("later", 120),
      event("unrelated", 3, "pre", "777"),
      event("next", 48),
      event("old", -100, "post")
    ]
  };
  raw.events[3].competitions[0].competitors[0].score = "0";
  const normalized = Data.normalizeEvents(raw, Data.teams[0]);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].ownScore, "0");
  assert.equal(Data.selectEvents(normalized, NOW).next.id, "next");
  assert.equal(Data.selectEvents(normalized, NOW).ticker.id, "next");
  assert.equal(normalized[1].broadcast, "NBC");
});
test("live > recent final > next; postponed and canceled games never become next kickoff", () => {
  const canceled = event("canceled", 24, "pre", "17", {
    status: {
      type: { state: "pre", name: "STATUS_CANCELED", description: "Canceled" }
    }
  });
  const postponed = event("postponed", -1, "pre", "17", {
    status: {
      type: {
        state: "pre",
        name: "STATUS_POSTPONED",
        description: "Postponed"
      }
    }
  });
  const events = Data.normalizeEvents(
    {
      events: [...schedule.events, canceled, postponed, event("live", -2, "in")]
    },
    Data.teams[0]
  );
  assert.equal(Data.selectEvents(events, NOW).live.id, "live");
  assert.equal(Data.selectEvents(events, NOW).next.id, "next");
  assert.equal(
    Data.selectEvents(
      events.filter((e) => e.state !== "in"),
      NOW
    ).ticker.id,
    "postponed"
  );
  assert.equal(
    Data.selectEvents(Data.normalizeEvents(schedule, Data.teams[0]), NOW).ticker
      .id,
    "last"
  );
  assert.equal(
    Data.selectEvents(Data.normalizeEvents({ events: [] }, Data.teams[0]), NOW)
      .next,
    null
  );
});
test("unknown state and stale past kickoff are not presented as upcoming", () => {
  const events = Data.normalizeEvents(
    {
      events: [
        event("past", -1),
        event("unknown", 1, "unknown"),
        event("future", 48)
      ]
    },
    Data.teams[0]
  );
  assert.equal(Data.selectEvents(events, NOW).next.id, "future");
});
test("failed refresh retains cache with explicit cached status and backoff; services pause", () => {
  const h = harness();
  try {
    h.service.start();
    assert.equal(h.calls.length, 5);
    h.complete();
    assert.equal(h.service.state.weather.status, "fresh");
    h.advance(16000);
    h.service.refresh();
    h.complete(true);
    assert.equal(h.service.state.weather.status, "cached");
    assert.equal(h.service.state.weather.data.temperature, 38);
    assert.equal(h.service.state.weather.next, NOW + 16000 + 60000);
    h.service.pause();
    h.service.start();
    assert.equal(h.calls.length, 10);
    h.advance(61000);
    h.service.pause();
    h.service.start();
    assert.equal(h.calls.length, 15);
    h.service.pause();
    assert.ok(h.calls.slice(-5).every((r) => r.aborted));
  } finally {
    h.service.pause();
  }
});
test("invalid, future-dated and >24h caches are discarded; blocked storage is safe", () => {
  for (const content of [
    "invalid",
    "{}",
    JSON.stringify({ version: 1, fetched: NOW - 90000000, raw: weather }),
    JSON.stringify({ version: 1, fetched: NOW + 10000, raw: weather })
  ]) {
    const h = harness(memory({ "selene-v3-weather": content }));
    assert.equal(h.service.state.weather.data, null);
    h.service.pause();
  }
  const h = harness({
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("full");
    }
  });
  try {
    h.service.start();
    h.complete();
    assert.equal(h.service.state.weather.status, "fresh");
  } finally {
    h.service.pause();
  }
});
test("offline on startup shows no fake data; warm cache revalidates", () => {
  const cold = harness();
  cold.service.offline();
  assert.equal(cold.service.state.weather.status, "unavailable");
  const warm = harness(
    memory({
      "selene-v3-weather": JSON.stringify({
        version: 1,
        fetched: NOW - 60000,
        raw: weather
      })
    })
  );
  try {
    assert.equal(warm.service.state.weather.status, "cached");
    warm.service.start();
    warm.complete();
    assert.equal(warm.service.state.weather.status, "fresh");
  } finally {
    warm.service.pause();
  }
});
test("refresh deduplicates inflight requests, throttles presses, expires old cache and recovers", () => {
  const h = harness();
  try {
    h.service.start();
    h.service.refresh();
    assert.equal(h.calls.length, 5);
    assert.equal(h.service.refresh(), false);
    h.complete();
    h.advance(90000001);
    h.service.pause();
    h.service.start();
    h.complete(true);
    assert.equal(h.service.state.weather.data, null);
    h.advance(61000);
    h.service.pause();
    h.service.start();
    h.complete();
    assert.equal(h.service.state.weather.status, "fresh");
  } finally {
    h.service.pause();
  }
});
test("live events poll at 60 seconds and a bad sports response does not discard weather", () => {
  const h = harness();
  try {
    h.service.start();
    h.calls[0].cb(null, weather);
    h.calls[1].cb(null, { events: [event("live", -1, "in")] });
    h.calls[2].cb(null, { bad: true });
    assert.equal(h.service.state.patriots.next, NOW + 60000);
    assert.equal(h.service.state.celtics.status, "unavailable");
    assert.equal(h.service.state.weather.status, "fresh");
  } finally {
    h.service.pause();
  }
});
