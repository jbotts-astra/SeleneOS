# SELENE OS 0.3

A remote-first Samsung Tizen TV launcher with a black and midnight-purple lunar interface, designed on a 1920 × 1080 canvas. Built on the existing v0.2 launcher; all 19 installed app IDs, the Tizen launch API, app ordering, application identity, and preference keys are preserved.

Development is on **`dev-v0.3`**. `main` is the existing version and is not modified by this work. SELENE is a standalone launcher app, not replacement firmware; Samsung's Home button continues to open Samsung Home.

## Interface

- Five branded tiles per row, two visible rows, four rows total. D-pad navigation scrolls additional rows into view.
- Per-app selection glow, slight enlargement and one short arrival wiggle. No perpetual tile animation.
- Large Eastern Time clock/date, Limerick weather, and the next Patriots matchup (or an in-progress score).
- Bottom ticker restricted to Patriots, Celtics, Bruins and Red Sox games. Opponents appear only as part of those matchups.
- Discreet settings for startup, motion and manual data refresh. Preferences survive updates using the original `selene-fast` and `selene-motion` keys.
- Text/SVG branding is bundled locally; no external fonts, image requests, ads, analytics, frameworks, or runtime packages.

## Remote

| Key | Action |
| --- | --- |
| Left / Right | Previous / next app, continuing across row boundaries |
| Up / Down | Move five apps, revealing rows as needed |
| Up from the first row | Focus the settings gear |
| Down or Left from the gear | Return to the selected app |
| OK / Enter | Launch the selected app or activate a setting |
| Back / Return (`10009`) | Open settings; close settings when already open |
| Samsung Home | Samsung's native Home interface |

Escape and Backspace emulate Return in a browser. Tab provides a browser testing fallback. Settings contain focus, and closing them restores the previous selection. The four-row indicator tracks the selected row. Failed launches show a temporary message without blocking remote navigation.

## Live data and offline behavior

**Weather:** [Open-Meteo](https://open-meteo.com/en/docs), Limerick coordinates `43.6884, -70.7937`, Fahrenheit, `America/New_York`. Updates every 15 minutes; includes current temperature, feels-like, condition and daily high/low. Open-Meteo reports modeled current conditions, not a personal weather station. Data attribution is visible in the app and settings: Open-Meteo, CC BY 4.0.

**Sports:** ESPN public team schedule JSON endpoints for NFL `ne`, NBA `bos`, NHL `bos`, and MLB `bos`. Updates every 5 minutes, or every 60 seconds while a returned game is in progress. The adapter handles schedule-style score objects, finals, TBD start times, neutral venues, postponements and empty schedules. It chooses the earliest future game rather than assuming the first schedule item is next. The ticker prefers a live game, a nearby postponed game, a final from the last 24 hours, then the next game. A season's last final is dated explicitly when no upcoming game is supplied.

ESPN's public JSON service is **undocumented and best-effort**, with no availability or schema guarantee. Schedule availability and season coverage are determined by ESPN. No API key is embedded. `data.js` isolates these adapters for replacement if the provider changes.

Requests time out after 10 seconds. Each feed has its own last-good cache; a failed team feed cannot blank the other teams or weather. Only fields used by the UI are cached, not provider images/links. Cached data is labeled with its age, and data older than 24 hours is hidden. No placeholder scores or weather are presented as live. Failed feeds retry with backoff up to 15 minutes. Reconnection and a remote-accessible refresh can revalidate sooner; manual refresh has a 15-second throttle. Network requests, timers and animations pause while the launcher is hidden.

Both provider origins are explicitly allowed in `config.xml` and the HTML content-security policy. No wildcard network permission is used. Actual DNS, TLS and provider availability still need validation on the television.

## Get the development version

From your existing repository checkout (save or commit any local changes first):

```sh
git fetch origin
git switch dev-v0.3
git pull --ff-only origin dev-v0.3
```

There is **no frontend build step**. Use your existing local signing/deployment workflow with the updated source. Keep the same author certificate to update the installed app; the application ID stays `SeleneOS01.SeleneOS` and the package ID stays `SeleneOS01`.

To prepare a clean runtime directory with Python 3, including in Termux:

```sh
python3 tools/stage.py
```

This creates `dist/tizen` with exactly the seven runtime files. The original splash image remains in the repository for history but is no longer required or packaged. Tests, development packages, documentation and signing material are excluded by an explicit allowlist. If signing output already exists there, the staging script stops so it cannot accidentally include or overwrite it.

Sign and install the staged directory using your existing Samsung/Tizen tools and locally stored security profile. This repository does not contain a certificate, private key, security profile, signed WGT, or device credentials. It does not automatically deploy to a television.

## Preview and tests

For an ordinary browser preview:

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765`, use arrow keys/Enter/Escape, and resize freely. The 1080p canvas scales and letterboxes proportionately. Browser preview cannot launch Samsung apps; it displays a preview message instead.

Development checks require Node 18+ (test tools are never shipped to the TV):

```sh
npm ci
npm run check
npm test
python3 tools/stage.py
```

The tests cover feed selection, score parsing, cache expiry, storage failure, retry/backoff, independent failure recovery, navigation through all 19 apps, settings focus/persistence, Tizen success/error/throw callbacks, launch deduplication, feed-text injection, suspension and ES5 syntax compatibility.

## TU7000 performance and validation

Runtime scripts use ES5 syntax. CSS avoids `color-mix`, backdrop filters, individual `rotate` properties and flex-gap reliance. Only transforms and opacity animate; ambient gradients and shadows are static. App tiles are created once; keypresses change focus/classes rather than replacing the entire grid. The ticker uses two equal-width groups and a single transform animation. Motion-off mode rotates a single static team item every 10 seconds so all teams remain available. System reduced-motion preferences are respected.

Automated DOM checks are not a rendering/performance test. This implementation has not been visually verified on a TU7000 or through a rendered browser in the development environment. Complete the [device validation checklist](docs/TV-VALIDATION.md) before calling it a tested TV release.

App and team names/marks belong to their respective owners. SELENE is not affiliated with Samsung, ESPN, or the listed services.
