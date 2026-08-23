# QA gate plan (Glen's pre-review mandate) — 2026-06-02

**Trigger:** only after UI feature-complete (U11 done) + Pillar-2 real-data (G3-A/B/C ✓) + coherence pass + missing stories + fresh build + **INSTALL**. Reliability is a separate gate (doesn't block UI review).

**Method:** multi-agent fan-out. App-using agents run SERIALLY (Element is single-instance; concurrent `app launch --fresh` would SIGKILL each other). Read-only analysis runs parallel.

## Lanes
1. **Pixel-diff runtime-vs-Storybook** (Glen's specific ask).
   - Storybook side: screenshot every story on :6006 via chrome-devtools-mcp/playwright.
   - Runtime side — **FEASIBILITY (checked 2026-06-02): the JUCE webview is NOT remote-debuggable today** (no `isInspectable`/devtools config in `web_content.cpp`/`element_webview_host.cpp`). Options: (a) **preferred** — add `WKWebView.isInspectable=YES` (macOS 13.3+; small C++ add in the webview host) → attach chrome-devtools/Safari → clean DOM screenshots; (b) computer-use screenshot of the app window — HARD (the mirrored/disconnected-display issues that blocked reliability GUI testing). Decide in-phase; (a) is the clean path.
   - Diff: pixelmatch or ImageMagick `compare`; flag per-component drift; human-review the flags.
2. **UX feature tests** — drive live flows: QuickAdd (fuzzy/typo/recents/port-type), dive/up nav (double-click block/empty), Cmd-K palette, meters move on real signal, crash badge + reload, node-menu actions (disconnect/color/oversample/replace), MIDI device prefs, FFT spectrum, InstanceSwitcher. Via cli-anything-element (+ chrome-devtools if inspectable enabled).
3. **AX assertions** — `verify-element-ui` suites (plugin-browser/session-browser/navigation/toolbar).
4. **Console/error scan** — no webview console errors at runtime.

## Loop
Defects → fix (delegated) → re-QA → until clean → produce a QA report → THEN signal Glen: "feature-complete + real + QA-passed — optimal point to record /review-video."

## Note
The cleanest enabler for lane 1+2+4 is enabling WKWebView inspectable in a debug build — consider doing it as the first QA-phase step (it unlocks DOM-accurate runtime capture + console access + chrome-devtools UX driving, all of which the flaky computer-use path lacks).
