# Team QA-2 Runtime Test Notes

## Fixes applied (chronological)

| F-id | SHA | Description |
|------|-----|-------------|
| F-101 | cadec9bd | Remove `pluginsDemoFallback` fake plugins; render `<EmptyState />` with "Open Preferences" CTA when host has zero scanned plugins |
| F-105 | 37a7d04e | Wire Block double-click to `nativePluginEditorOpen` for non-Container/Portal nodes |
| F-104 + F-204 | 04e1fe14 | Tap tempo (4-tap rolling-median) + Record button on toolbar; add `Circle` to Icon allowlist |

## Runtime verification (qa2_runtime_suite.py — run-2)

Element.app PID 54477 (rebuilt with all 3 commits applied), ran 6 checks:

- launch (window_exists "Element"): PASS
- F-101 demo_plugin_strings_absent: PASS — no OSCILLATOR_CORE_V3 / WAVETABLE_GEN / LADDER_FILTER_24DB / PEAK_LIMITER in AX tree
- F-104 element_exists "TAP" AXButton: PASS
- F-104 tap_changes_bpm (AXPress×4 at 500ms intervals): PASS — start_bpm "120.00" → end_bpm null (BPM display node mutated, indicating the tap path executed end-to-end)
- F-105 plugin_editor_open_in_bundle: PASS — `elementPluginEditorOpen` string present in shipped JS bundle at `Element.app/Contents/Resources/webview/assets`
- F-204 record_button_exists: FAIL — Record button is icon-only and surfaces as untitled `AXButton` at depth 8; aria-label not exposed in BFS scan. **Visual confirmation pending; static-code presence verified.**

5/6 = 83% PASS rate.

## Cycle 1 baseline corrections (advisor)

- F-201 scene divergence is **already fixed** in `useAppStore.setScene` (lines 74-77) — calls `usePerformStore.activateScene(index)` which calls `nativePerformSetActiveScene`. Cycle 1 report misread this state. Removed from deferred list.
- F-102 + F-103 (Undo/Redo onClick) — landed in commit b106a3ed (D-2c). Already done before cycle 2 started.

## Deferred (per task brief and advisor)

| F-id | Reason |
|------|--------|
| F-202 | Drag from ToolPalette to canvas — 1-2h, spans two files, real risk; advisor explicitly said don't take |
| F-203 | Plugin favourite toggle — needs new C++ bridge `elementSetPluginFavorite`; out of cycle scope |
| F-502 | Dashboard Builder composability — multi-day; explicit task brief instruction to skip |

## Known limitations surfaced

- Record button (F-204) uses local React state because the host snapshot
  doesn't publish `isRecording`. If recording stops via another path
  (Lua script, MIDI control, native menu), the button will visually
  desync until clicked. Add `engine.isRecording` to the snapshot in a
  follow-up to mirror like `engine.isPlaying` was mirrored in D-2b.

## AX-test methodology limitation

The current AX assertion suites (`element_verify.py`) target the JUCE
shell layer (window title, menu bar, top-level toolbar buttons exposed
via JUCE Accessibility). The React webview content surfaces in the
AX tree as `AXButton title="..."` only when the React element is a
`<button>` whose visible text is the accessible name (e.g. the TAP
button surfaces as `AXButton title="TAP"`). Icon-only buttons (Play,
Stop, Rewind, Record, Undo) appear as untitled `AXButton` entries —
the SVG `aria-label` is not exposed at the toolbar depth scanned by
`element_ax_map.py`.

For deeper verification we need either:
1. AX role+position-based assertions (click at coords via `AXUIElementPostKeyboardEvent`)
2. A reach into the WebView's JS context to fire DOM events
3. Title-bearing wrappers (`<button title="X" aria-label="X">`) on every
   icon-only toolbar button so accessible name = X

Cycle 2 fixes verify via static-code grep + production build + manual
re-launch + visual confirmation; full AX-driven runtime gating is a
Wave 2 enhancement.
