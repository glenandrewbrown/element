## [2026-05-08T02:05:14Z] Known Issues at Session Start

### Open Bug Classes
- Class 7: 13 icon-only buttons without title= (AX opacity bug)
- Class 10: 36 webview production files with zero tests
- Class 1 remnant: BlockEmbed.tsx fake VU defaults 0.62/0.58/0.78/0.74
- Codemod mismatches: <Icon name> sites with wrong lucide picks
- Stale AX suites: element_verify.py uses old "All/Favorites/Recent" labels

### Known Non-Issues (DO NOT CHASE)
- F-201 scene divergence: useAppStore.setScene calls usePerformStore.activateScene already — NOT A BUG
- 2 slow service tests (DeviceServiceController/SessionServiceFileOps): not regressions
- Untracked package.json/package-lock.json at repo root: harmless, leave alone
- src/lua/src/lua/ build patches: NEVER touch

### Deferred (post-bug-catcher)
- F-block-2 panel parity (F-4 Preferences, F-5 LOG/METERS, F-6 Lua, F-7 OSC, F-8 plugin embed)
- Phase D / Wave 2 sandbox redesign (~2 weeks)
- Wireless bus + drag-rewire-cable React UI (~3-4h story)
- Per-block CPU instrumentation (US-006, requires juce::AudioProcessor changes)

## T2 — Stale AX suites rewrite (2026-05-08)

### Root cause
`_run_plugin_browser()` and `_run_session_browser()` in `tools/automation/element_verify.py` were asserting against tab labels from an old ToolPalette design that no longer exists in V3.0.

### Stale labels removed
- `"All"`, `"Favorites"`, `"Recent"` (plugin-browser suite)
- `"All Files"`, `"Recent"` (session-browser suite)

### Correct V3.0 labels (from ToolPalette.tsx)
- Tab buttons: `"Plugins"` and `"Projects"` (the only two tab buttons in V3.0)
- `"Boards"` is a **section header** inside the Plugins tab, not a tab button — no AXButton assertion needed
- `"Favourites"` (British spelling) is also a section header, not a tab button

### Dashboard-builder suite
No changes needed. Assertions use `"Perform"`, `"Dashboard"`, `"Edit"` which are unrelated to ToolPalette tabs.

### Fix applied
Commit `c0de1258` on branch `local-enhancements`.
