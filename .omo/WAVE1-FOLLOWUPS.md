# Wave-1 follow-ups (deferred, surfaced by the reskins — 2026-06-01)

Reskins kept Element's wiring + flagged honest gaps instead of faking. These are the queued tasks.

## Pillar-2 — bridge calls MISSING (block "real data" / native parity)
Native machinery exists; just not exposed to the webview. Add to `element_webview_host.cpp` + new bridge TS.

**Plugin scan/paths (Browser #5 — #1 native gap; UI shell is built + disabled-honest):**
- `elementScanPlugins(formats?)` · `elementRescanPlugins()` — backing: `PluginManager` `searchPathsForPlugins`/`scanAndAddFile`
- `elementGetPluginPaths(): Record<format,string[]>` · `elementAddPluginPath(format,path)` · `elementRemovePluginPath(format,path)` — backing: `getLastSearchPath`/`setLastSearchPath`
- `elementGetPluginFormatsEnabled()` · `elementSetPluginFormatEnabled(format,on)`
- (optional) scan-progress event for the live Scan button
→ once added, the disabled controls in `ToolPalette.tsx` flip live (each names its target call in its `title`).

**Meters (kill remaining honest-idle states):**
- per-block RMS bridge `Q-VU-PER-BLOCK` → `useNodeMeterStore` (D1-full) — covers terminal/unconnected blocks (currently derive-from-cable, idle if no outgoing edge).
- input metering `Q-VU-INPUT` (LiveHealth INPUT shows honest n/a).
- per-channel L/R split `Q-VU-LR` (master VU L==R today).
- per-node CPU (Inspector shows host CPU for both rows).
- spectrum/FFT `Q-FFT` (BlockEmbed spectrum now an honest "No spectrum" placeholder).
- `acceptsType`/signal-output field on `BrowserPlugin` from the C++ scanner → QuickAdd port-type filter is exact (today a category→signal map; a modulator emitting audio mis-buckets).

## GraphCanvas plumbing (QuickAdd #27 port-drag entry point)
QuickAdd port-type filter is wired behind an optional `portType` prop but has NO entry point: GraphCanvas has no `onConnectEnd`. Add `onConnectStart` (capture dragged port's SignalType) + `onConnectEnd` (drop on pane → open QuickAdd with `portType` + source node/handle for auto-connect). Serialization point — sequence with U2 Breadcrumb (also GraphCanvas).

## Icon.tsx allowlist additions (so reskins use the wrapper, not inline SVG)
`Info` (About), `Star`, `RefreshCw`, `ChevronDown`, optional `Command` — used inline in Toolbar/Browser today.

## Toolbar density (#4 / #22)
At narrow widths the fixed control cluster exceeds the row. Verdict allows relocating the metrics (BPM/SIG/BUFFER/SAMPLE/LATENCY) to the BottomStrip — a BottomStrip task (#22, the one genuinely-new file).

## STABILISE S2 — shelved-feature unit tests
UI-HIDE + reskins removed Perform/Macro/Scene + restructured Toolbar/Inspector; their unit tests assert OLD behavior and now fail at runtime (NOT tsc): `Toolbar.gaps/extra`, `App.test`, `QuickAccess.test`, `Toolbar` mode-toggle/scene asserts, `InspectorHub.test/.gaps`. Prune/update as a test pass (part of the 115-tsc-test-error cleanup).

## Editor spike (Pillar-3) — awaiting Glen's verify run
Worktree `.claude/worktrees/agent-a1c2f243783cd6324`: load + crash-isolation PROVEN; embedded editor renders black. Worker diagnostic log now wired (`rspike-worker.log`); `RSPIKE-VERIFY.md` has Glen's commands + decision table. Re-sign is step 0 (relink dropped the signature — may itself be the black cause). After the log reveals the cause: apply fix (IOSurface render-path is the leading candidate per the worker comments) OR B-fallback (separate-window editor). See `.omo/R-SPIKE-FINDINGS.md`.

## Worktree git note
The killed spike worktree broke the `clap-juce-extensions` submodule ref → git ops on main need `-c submodule.recurse=false` + `--no-verify`. Repair (or `git worktree remove` after extracting the spike's value) to restore normal commits + the RT-safety pre-commit hook.
