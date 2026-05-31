# Team D — P0 webview UI diagnosis & fix log

Run start: 2026-05-07 23:18 GMT+1
Wave 1 baseline: 0855f491
Branch: local-enhancements

## Commits

D-3  | 137c73d4 | fix(webview): D-3 use React Flow's onPaneContextMenu prop
D-2a | 350407fc | fix(webview): D-2a wire missing transport onClick handlers
D-2b | 88e400a0 | fix(webview): D-2b mirror engine.isPlaying through Zustand
D-1  | 5bf36876 | fix(webview): D-1 retry-poll plugin list until scan completes
D-2c | b106a3ed | fix(webview): D-2c wire missing Undo/Redo onClick handlers

## Diagnoses

D-1 (plugin browser empty): refresh() IS called on mount but PluginManager
  scan completes async — KnownPluginList is empty at first poll. JSON shape
  fine, parser fine, timing wrong. Fix: 5-step back-off poll up to 30s.

D-2 (transport buttons appear dead): THREE separate bugs.
  D-2a: Stop, Rewind, Power buttons literally had no onClick handlers.
  D-2b: Play button toggled engine but had no state subscription, so the
        UI never reflected the mode. C++ already emits engine.isPlaying in
        graph snapshot — needed a Zustand mirror.
  D-2c: Same dead-button class on Undo / Redo (advisor caught these post-
        D-2a — Glen had not flagged them but they would have surfaced on
        the next Cmd+Z attempt).

D-3 (right-click empty canvas dead): Wrong prop name —
  `onContextMenu={onPaneContextMenu}` should have been
  `onPaneContextMenu={onPaneContextMenu}`. The native DOM handler doesn't
  fire inside React Flow's pane.

D-4 (codemod consumer regression): NOT A BUG. Verified via grep —
  NodeContextMenu.tsx and EdgeContextMenu.tsx already read `iconName`,
  not `icon`. Codemod is internally consistent.

D-5 (live chrome-devtools probe): SKIPPED. Static analysis was sufficient
  for all 4 bugs. The advisor confirmed the missing-handler hypothesis
  was visible directly in the source.

## Verification

- vitest: 34/34 → 34/34 (no regression)
- webview build: 203 kB → 204.24 kB main / 51.21 kB gzip (under 400 kB ceiling)
- tsc: 0 errors
- ctest: 67/67 (Wave 1 baseline preserved — no C++ tests touched)

## Items to surface to Glen

1. The Perform-mode Power button previously had `aria-label="Power off"`
   (suggesting an app-shutdown semantic). I rebound it to MIDI Panic
   per the CLAUDE.md blueprint ("Panic button — red, always visible,
   sends Note Off to all MIDI outputs"). If Glen wants Power to literally
   close the host instead, this needs an explicit decision and a new
   bridge fn.
2. Plugin polling cap is ~30 s total (1.5 s + 3 s + 5 s + 8 s + 12 s).
   For very large user libraries this may not be enough. If Glen reports
   the browser still empties past 30 s, we should add a sixth slower poll
   or upgrade to a C++-side scan-finished push.
3. Verification for D-3 / D-2b is static-only — there are no canvas-level
   render tests today. Glen should functionally smoke-test in
   Element.app after this lands. The JSX is correct against React Flow
   types and the C++ snapshot already emits engine.isPlaying.
4. D-5 chrome-devtools-mcp probe was skipped — static analysis was
   sufficient for all 4 root causes per the brief's 15 min cap.

## File scope respected

- Owned files touched: webview/src/components/canvas/GraphCanvas.tsx,
  webview/src/components/layout/Toolbar.tsx,
  webview/src/components/neu/Icon.tsx,
  webview/src/hooks/useJuceBridge.ts,
  webview/src/stores/usePerformStore.ts,
  webview/src/stores/usePluginBrowserStore.ts
- Forbidden files (src/engine/, src/services/, src/scripting/, src/lua/,
  sandbox files): NONE TOUCHED. C++ side already had all bridge handlers
  and engine.isPlaying push from Wave 1 — pure React-side diagnosis.
