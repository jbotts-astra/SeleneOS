# v0.3 television validation

Use `dev-v0.3`, the existing author certificate, and a TU7000-series TV. Main is not changed. This checklist records work that needs the actual device; unchecked items are not claimed as verified.

- [ ] Install as an update to `SeleneOS01.SeleneOS` using the existing signing profile.
- [ ] Confirm the 1920 × 1080 composition, safe margins, clock and app labels are readable from the couch; verify the lower app labels and remote hints do not overlap the ticker.
- [ ] Press Left/Right through all 19 apps; press Down to the partial fourth row. No missing focus, native page scrolling, or clipped selection borders.
- [ ] Move Up from the first row to settings; OK opens it. Back closes it and restores focus. Back from an app opens settings as in v0.2.
- [ ] Launch YouTube, Twitch, Peacock, Paramount+, Disney+ and the remaining installed apps. App availability and IDs remain device-specific.
- [ ] Return to SELENE after launching another app. Selection is retained; timers and feeds resume.
- [ ] Hold a direction, then hold OK. Direction navigation stays responsive; OK does not repeatedly launch or toggle.
- [ ] Remove/disallow an app or use a known unavailable app: one nonblocking error appears, and the remote keeps working.
- [ ] Confirm the weather and all four team schedules load through the TV's actual TLS/network stack. Verify a kickoff and a current score against the provider.
- [ ] Disconnect Wi-Fi after a good refresh: last-good data is labeled Cached, with age. Close/reopen offline and repeat with an empty cache; no invented readings appear.
- [ ] Reconnect Wi-Fi and use Refresh live data. Check the individual feed statuses recover.
- [ ] Toggle motion off: no wiggle or ticker scrolling; each team appears in turn. Confirm both preferences persist after closing/reopening the app.
- [ ] Leave the launcher running through a long session; check D-pad latency, memory stability and ticker smoothness. Verify behavior after standby/wake.
- [ ] Test a live game, a postponed game, a TBD kickoff and the offseason as these states become available.

## Development evidence

The committed Node tests exercise feed adapters and the shell in JSDOM with controlled provider/Tizen responses. They do not use or require signing certificates. Real Open-Meteo and all four ESPN endpoints were fetched successfully during implementation; browser CORS headers were also checked. A rendered browser preview was unavailable in this workspace, and no connected physical TV was available.
