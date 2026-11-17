const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const acorn = require("acorn");
const { NOW, weather, event } = require("./fixtures.cjs");
const root = path.join(__dirname, "..");
function boot({
  tizen,
  blockedStorage = false,
  offline = false,
  stored = {},
  malicious = false
} = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "index.html"), "utf8"),
    {
      url: "https://selene.test",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: console
    }
  );
  const w = dom.window;
  w.Date.now = () => NOW;
  if (blockedStorage)
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new Error("blocked");
      }
    });
  else Object.entries(stored).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.matchMedia = () => ({ matches: false, addListener() {} });
  if (tizen) w.tizen = tizen;
  if (offline) Object.defineProperty(w.navigator, "onLine", { value: false });
  w.XMLHttpRequest = class {
    open(method, url) {
      this.url = url;
    }
    send() {
      this.status = 200;
      const id = this.url.includes("football")
        ? "17"
        : this.url.includes("hockey")
          ? "1"
          : "2";
      const game = event("next", 48, "pre", id);
      if (malicious)
        game.competitions[0].competitors[1].team.shortDisplayName =
          "<img src=x onerror=alert(1)>";
      this.responseText = JSON.stringify(
        this.url.includes("open-meteo") ? weather : { events: [game] }
      );
      this.onload();
    }
    abort() {
      if (this.onabort) this.onabort();
    }
  };
  for (const file of ["apps.js", "data.js", "main.js"])
    w.eval(fs.readFileSync(path.join(root, file), "utf8"));
  function key(code, repeat = false) {
    w.document.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        keyCode: code,
        which: code,
        repeat,
        bubbles: true,
        cancelable: true
      })
    );
  }
  return {
    dom,
    w,
    doc: w.document,
    errors,
    key,
    focus: () => w.document.activeElement.id,
    close: () => dom.window.close()
  };
}
test("runtime scripts parse as ES5 for the older TV engine", () => {
  for (const file of ["apps.js", "data.js", "main.js"])
    acorn.parse(fs.readFileSync(path.join(root, file), "utf8"), {
      ecmaVersion: 5
    });
});
test("remote reaches every app, partial final row clamps, Back restores selection", () => {
  const h = boot();
  try {
    assert.equal(h.doc.querySelectorAll(".tile").length, 19);
    assert.equal(h.doc.querySelectorAll(".app-row")[0].children.length, 5);
    assert.equal(h.focus(), "app-0");
    for (let i = 1; i < 19; i++) {
      h.key(39);
      assert.equal(h.focus(), "app-" + i);
    }
    h.key(39);
    assert.equal(h.focus(), "app-18");
    h.key(40);
    assert.equal(h.focus(), "app-18");
    assert.equal(
      h.doc.getElementById("apps").style.transform,
      "translateY(-450px)"
    );
    assert.equal(h.doc.getElementById("apps-viewport").scrollTop, 0);
    h.key(10009);
    assert.equal(h.focus(), "fast");
    h.key(10009);
    assert.equal(h.focus(), "app-18");
    for (let i = 0; i < 3; i++) h.key(38);
    assert.equal(h.focus(), "app-3");
    h.key(38);
    assert.equal(h.focus(), "gear");
    h.key(13);
    assert.equal(h.focus(), "fast");
    h.key(27);
    assert.equal(h.focus(), "gear");
    h.key(40);
    assert.equal(h.focus(), "app-3");
    assert.equal(h.doc.querySelectorAll(".tile.selected").length, 1);
    assert.deepEqual(h.errors, []);
  } finally {
    h.close();
  }
});
test("v0.2 installed app IDs and order are preserved exactly", () => {
  const h = boot();
  try {
    assert.equal(h.w.SeleneApps[0].id, "9Ur5IzDKqV.TizenYouTube");
    assert.equal(h.w.SeleneApps[3].id, "rJyOSqC6Up.CBSAllAccess");
    assert.equal(h.w.SeleneApps[18].id, "9TYrSHWbaB.klyq");
  } finally {
    h.close();
  }
});
test("settings migrate existing preferences, persist, trap focus, ignore held OK", () => {
  const h = boot({
    stored: { "selene-fast": "true", "selene-motion": "false" }
  });
  try {
    assert.ok(h.doc.getElementById("stage").classList.contains("no-motion"));
    h.key(8);
    assert.equal(h.focus(), "fast");
    assert.equal(h.doc.getElementById("fast-value").textContent, "ON");
    h.key(13, true);
    assert.equal(h.w.localStorage.getItem("selene-fast"), "true");
    h.key(13);
    assert.equal(h.w.localStorage.getItem("selene-fast"), "false");
    h.key(40);
    h.key(13);
    assert.equal(h.w.localStorage.getItem("selene-motion"), "true");
    assert.ok(!h.doc.getElementById("stage").classList.contains("no-motion"));
    h.key(9);
    assert.equal(h.focus(), "refresh");
    h.key(9);
    assert.equal(h.focus(), "close");
    h.key(9);
    assert.equal(h.focus(), "fast");
    h.key(27);
    assert.equal(h.focus(), "app-0");
  } finally {
    h.close();
  }
});
test("Tizen launch passes the original ID, prevents repeated launch and reports errors without alert", () => {
  const calls = [];
  const h = boot({
    tizen: {
      application: {
        launch(id, ok, fail) {
          calls.push({ id, ok, fail });
        }
      }
    }
  });
  try {
    h.key(13);
    h.key(13);
    h.key(13, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, "9Ur5IzDKqV.TizenYouTube");
    calls[0].fail({ message: "not installed" });
    assert.match(
      h.doc.getElementById("toast").textContent,
      /Could not open YouTube/
    );
    h.key(39);
    h.key(13);
    assert.equal(calls[1].id, "JjZTaUrV204.Twitch");
    calls[1].ok();
    assert.ok(h.doc.getElementById("toast").classList.contains("hidden"));
    assert.equal(h.focus(), "app-1");
  } finally {
    h.close();
  }
});
test("browser preview and blocked storage remain navigable; sync launch exceptions handled", () => {
  const h = boot({ blockedStorage: true, offline: true });
  try {
    h.key(13);
    assert.match(h.doc.getElementById("toast").textContent, /Browser preview/);
    assert.equal(h.doc.getElementById("temperature").textContent, "—");
    assert.equal(
      h.doc.getElementById("connection-label").textContent,
      "Offline"
    );
    h.key(27);
    h.key(13);
    h.key(40);
    h.key(13);
    h.key(27);
    h.key(40);
    assert.equal(h.focus(), "app-5");
    assert.deepEqual(h.errors, []);
  } finally {
    h.close();
  }
  const other = boot({
    tizen: {
      application: {
        launch() {
          throw new Error("denied");
        }
      }
    }
  });
  try {
    other.key(13);
    assert.match(
      other.doc.getElementById("toast").textContent,
      /Could not open/
    );
  } finally {
    other.close();
  }
});
test("feed text cannot inject markup; clock is Eastern; four-team ticker has no unrelated teams", () => {
  const h = boot({ malicious: true });
  try {
    assert.equal(h.doc.querySelector("#game-title img"), null);
    assert.match(h.doc.getElementById("game-title").textContent, /<img/);
    assert.equal(h.doc.querySelectorAll("#ticker .ticker-team").length, 4);
    assert.deepEqual(
      [...h.doc.querySelectorAll("#ticker .ticker-team")].map(
        (e) => e.textContent
      ),
      ["PATRIOTS", "CELTICS", "BRUINS", "RED SOX"]
    );
    assert.equal(h.doc.getElementById("temperature").textContent, "38");
    assert.equal(
      h.doc.getElementById("connection-label").textContent,
      "Connected"
    );
    assert.match(h.doc.getElementById("game-time").textContent, /ET/);
    assert.deepEqual(h.errors, []);
  } finally {
    h.close();
  }
});
test("hidden app pauses requests/animation and resumes focus; network loss labels cached data", () => {
  const h = boot();
  try {
    h.key(39);
    Object.defineProperty(h.doc, "hidden", { value: true, configurable: true });
    h.doc.dispatchEvent(new h.w.Event("visibilitychange"));
    assert.ok(h.doc.getElementById("stage").classList.contains("suspended"));
    Object.defineProperty(h.doc, "hidden", {
      value: false,
      configurable: true
    });
    h.doc.dispatchEvent(new h.w.Event("visibilitychange"));
    assert.equal(h.focus(), "app-1");
    assert.ok(!h.doc.getElementById("stage").classList.contains("suspended"));
    h.w.dispatchEvent(new h.w.Event("offline"));
    assert.match(h.doc.getElementById("weather-source").textContent, /Cached/);
    assert.equal(
      h.doc.getElementById("connection-label").textContent,
      "Offline"
    );
    h.key(40);
    assert.equal(h.focus(), "app-6");
  } finally {
    h.close();
  }
});
