# React UI vs Native UI A/B Master List

**Date:** 2026-05-08
**HEAD:** `a3502dda`
**Native mode:** `ELEMENT_STANDARD_CONTENT=1` (legacy `StandardContent`)
**React mode:** default `WebContent`
**Method:** dual ax-tree dump (`ax-tree-native.json` 541 nodes / `ax-tree-react.json` 440 nodes), screenshot diff
(`native-screen.png` ↔ `react-screen.png`, footer/toolbar crops), source cross-reference against
`webview/src/**` and `src/ui/element_webview_host.cpp`, with the canonical feature list pulled from
`docs/ELEMENT_UNIFIED_BLUEPRINT.md`, `docs/WEBVIEW_PARITY_MATRIX.md`, and the cycle-1
`ui-feature-matrix.md` (96 rows).

> Companion file: [bug-categories.md](./bug-categories.md) lists the eight root-cause clusters with
> fix-effort estimates and touched-file lists.

## Smoking-gun pattern: engine state is not piped through the bridge for empty graphs, and CPU is faked everywhere

The C++ `AudioEngine` + `DeviceManager` have live values for CPU usage
(`devices.getCpuUsage() * 100.f` — used today at `src/ui/content.cpp:314` in the LEGACY footer),
sample rate, buffer size, device name, device latency, engine running state, and transport state.

Two independent failures combine in the React shell:

1. **CPU never crosses the bridge at all.** No `engine.cpu` property is set in
   `buildActiveGraphJson()` (`src/ui/element_webview_host.cpp:4017-4029`). `useJuceBridge` therefore
   FAKES CPU as `Math.min(99.9, Math.max(0, peak * 320))` from the metering callback
   (`webview/src/hooks/useJuceBridge.ts:411`). Result: `StatusBar.cpuPercent` is a function of audio
   level, not engine load.
2. **Engine block is omitted on empty graphs.** `buildActiveGraphJson` early-returns at
   `element_webview_host.cpp:4005` BEFORE writing `engine.deviceName / sampleRate / bufferSize /
   latency / isPlaying` whenever `! gn.isGraph()`. A fresh session ("Untitled Session: Graph") —
   exactly what the screenshots show — therefore reaches the React side with no engine block at
   all, leaving `health.clock`, `health.sampleRateLabel`, `health.buffer`, `health.latency`, and
   `isPlaying` at their `"—"`/`0`/`false` defaults.
3. **`engineRunning` is doubly derived.** `StatusBar.tsx:19` computes `engineRunning = cpuPercent > 0`.
   Because `cpuPercent` is the faked peak metric, the running indicator now reports the audio level
   of the meter feed, not engine state. Even though `engine.isPlaying` IS piped on non-empty graphs,
   the StatusBar ignores it.

The two screenshots make it visually obvious. Bottom of `react-bottom.png` shows BOTH the React
status bar (`Default Device · STOPPED · SAMPLE — · BUFFER — · LATENCY — · CPU 0.0%`) AND the legacy
JUCE footer poking through (`Device: Fireface 802 (23746580) | Engine: Running: CPU: 1.2% | Sample
Rate: 48.0 KHz: Buffer: 512`). The truth and the lie are stacked on top of each other.

A single new bridge fn (`elementGetEngineSnapshot`, polled at 30 Hz, OR an additive engine block
pushed every snapshot regardless of graph emptiness) closes ~10 of the bugs in §1.

---

## §1 — DISCONNECTED / FAKED state displays

Root causes: C-1 (CPU never set), C-2 (engine block omitted on empty graphs), and C-3
(engineRunning derived from CPU).

| ID | Field | Native source | React display today | Severity | File pointer |
|----|-------|---------------|---------------------|----------|--------------|
| D-1 | StatusBar CPU % | `devices.getCpuUsage() * 100.f` (`content.cpp:314`) shows e.g. `1.2%` | Faked: `peak * 320`, capped 99.9; `0.0%` until audio plays | **P0** | `webview/src/hooks/useJuceBridge.ts:411`; `webview/src/components/layout/StatusBar.tsx:18-79` |
| D-2 | StatusBar engine running indicator (RUNNING / STOPPED) | `StatusBar` flag from `Engine::Running` text | Computed `cpuPercent > 0` — depends on the *fake* CPU. Shows `STOPPED` on idle running engines, `RUNNING` on a stopped engine if any peak shows up | **P0** | `webview/src/components/layout/StatusBar.tsx:19` |
| D-3 | StatusBar device name | `dev->getName()` shown as `Device: Fireface 802 (23746580)` | Hardcoded `"Default Device"` placeholder when `health.clock === "—"` (the empty-graph path) | **P0** | `webview/src/components/layout/StatusBar.tsx:7-8` |
| D-4 | StatusBar sample rate | `48.0 KHz` from `dev->getCurrentSampleRate()` | `—` because `engine` block omitted on empty graphs | **P0** | `element_webview_host.cpp:4005` (early return); `useJuceBridge.ts:293-296` |
| D-5 | StatusBar buffer size | `512` from `dev->getCurrentBufferSizeSamples()` | `—` (same root) | **P0** | same |
| D-6 | StatusBar latency | computable from `inputLatencySamples + outputLatencySamples` | `—` (same root) | **P0** | `useJuceBridge.ts:297-305` |
| D-7 | Toolbar BUFFER readout | (n/a — Toolbar replicates StatusBar values) | `—` | P1 | `Toolbar.tsx:393` |
| D-8 | Toolbar SAMPLE readout | n/a | `—` | P1 | `Toolbar.tsx` (same block as 393) |
| D-9 | Toolbar LATENCY readout | n/a | `—` | P1 | `Toolbar.tsx:405` |
| D-10 | InspectorHub PROJECT OVERVIEW > TOTAL CPU | n/a | `0.0%` (faked path) | P1 | `InspectorHub.tsx:414` (uses `health`) |
| D-11 | InspectorHub PROJECT OVERVIEW > HOST CPU | (no dedicated host-CPU metric in C++ today) | `0.0%`, currently identical to TOTAL CPU; semantics undocumented | P2 | `InspectorHub.tsx` (project overview tile group) |
| D-12 | InspectorHub PROJECT OVERVIEW > SAMPLE RATE / BUFFER / DEVICE LATENCY / DEVICE | wired through `engine` block | `—` on empty graph (same root cause D-4..D-6) | P1 | `InspectorHub.tsx:414-440,495-497` |
| D-13 | InspectorHub PROJECT OVERVIEW > BLOCKS / CABLES counts | live from snapshot blocks/cables | Works on non-empty graphs; reads `0/0` when empty (correct) | WORKS | sanity-check positive |
| D-14 | Toolbar transport Play/Pause icon mirroring | `TransportMonitor::playing` → `engine.isPlaying` ✅ wired | Works on non-empty graphs only; on empty session the engine block is missing so React falls back to its local `isPlaying = false` and won't reflect a transport tap that happens before a graph exists | P1 | `usePerformStore.ts:132-133`; same early-return as D-4 |
| D-15 | Toolbar BPM display | `session.tempo` is wired | Renders `120.00` correctly when populated | WORKS | `Toolbar.tsx:251-281` |
| D-16 | Toolbar Time-signature display | hardcoded `4/4` | Hardcoded `4/4` in Perform mode banner only; not editable in Edit mode | P2 | `Toolbar.tsx:193` |
| D-17 | Toolbar Record state mirror | bridge fn `elementTransportSetRecording` exists, but C++ snapshot does NOT publish `isRecording` | UI cannot reflect recording state even when set; explicit comment in `Toolbar.tsx:57` "does NOT publish isRecording in the snapshot" | P1 | `Toolbar.tsx:57-66`; missing in `element_webview_host.cpp:4017-4029` |
| D-18 | StatusBar timecode | no transport timecode source pushed | `00:00:00:00` placeholder | P2 | `StatusBar.tsx:88` |
| D-19 | StatusBar MIDI activity light | native MIDI engine has activity but no MIDI in/out indicator pushed | not rendered at all | P2 | StatusBar lacks any `midiActivity` field |
| D-20 | StatusBar mode badge (EDIT / PERFORM) | n/a | not rendered in StatusBar; only Toolbar shows the toggle | P2 | StatusBar.tsx (no mode pill) |
| D-21 | Toolbar SCENE label | wired (`perform.activeSceneIndex`) | "SCENE 1/1" displayed correctly | WORKS | sanity-check positive |
| D-22 | Cable RMS amplitude pulse | `onCableLevels` callback wired to `useCableMeterStore` | Levels reach store; `MetersPanel` shows them; but `Cable.tsx` does NOT animate stroke based on amplitude | PARTIAL/P2 | `webview/src/components/canvas/Cable.tsx`; `useCableMeterStore.ts` |
| D-23 | onMetering CPU side-effect | n/a | `onMetering` mis-uses peak as a proxy for CPU; even if we add real CPU later, this aliasing must be removed or it will stomp on the real value | **P0 (cleanup)** | `useJuceBridge.ts:409-415` |
| D-24 | Inspector parameter list refresh on automation | C++ has `onParameterUpdate` 15Hz delta channel | `useParameterStore.applyDeltas` wired but `BlockParameterList` reload is on-demand only, not driven by deltas — automation moves silently | P2 | `useJuceBridge.ts:426-430`; `InspectorHub.tsx` BlockParameterList |
| D-25 | Toolbar/Inspector input level meter | n/a | not rendered; bridge has metering peak but only used to derive fake CPU | P2 | derived from D-1 |

§1 subtotal: 25 rows (7 P0, 7 P1, 8 P2, 3 WORKS sanity entries D-13/D-15/D-21 retained inline so the row IDs stay contiguous)

---

## §2 — MISSING affordances (no React equivalent of native feature)

Source: AX-tree diff between native (541 nodes, full menu bar populated) and React (440 nodes,
File/Edit/View menus stripped to skeletons), plus blueprint features absent from `webview/src/`.

| ID | Affordance | Native location | React state | Severity |
|----|-----------|-----------------|-------------|----------|
| M-1 | File menu > New Session | native AX (line 239) | absent — only `Open Session` and `Open Recent` remain in React menu (ax-tree-react:166-172) | P1 |
| M-2 | File menu > Save Session / Save Session As | native AX (lines 246-247) | absent in menu (toolbar Save still works, but menu parity broken) | P2 |
| M-3 | File menu > Import / Export graph | native AX (lines 249-250) | absent in menu | P2 |
| M-4 | Edit menu > New graph / Duplicate current graph / Delete current graph / Insert plugin | native AX (lines 253-260) | absent — React Edit menu shows only Undo/Redo (ax-tree-react:174-176) | P1 |
| M-5 | View menu > Patch Bay / Graph Editor / Graph Mixer / Console / Channel Strip / Virtual Keyboard / Meter Bridge / Session Properties / Plugin Manager / Key Mappings / Rotate View | native AX (lines 263-278) | View menu in React is EMPTY (ax-tree-react:178) — none of these surfaces have React equivalents | P1 |
| M-6 | Plugin Manager UI | native View > Plugin Manager dialog | no React Plugin Manager component; users cannot manage scan paths, blacklist, or VST formats | P1 |
| M-7 | Key Mappings UI | native View > Key Mappings dialog | no React component | P2 |
| M-8 | Channel Strip view | native View > Channel Strip | no React equivalent | P2 |
| M-9 | Patch Bay view | native View > Patch Bay | no React equivalent (only the graph canvas) | P2 |
| M-10 | Meter Bridge view | native View > Meter Bridge | no React equivalent | P2 |
| M-11 | Graph Mixer (full) | native View > Graph Mixer | only popped via `nativeOpenGraphMixer` overlay button — no React port | P2 |
| M-12 | Console (Lua) full pane | native View > Console | only popped via `nativeOpenLuaConsole` overlay; no React-side editor pane | P2 |
| M-13 | Toolbar TAP-tempo button onClick | native footer has TAP control wired | rendered but `<button title="TAP">` has NO `onClick` (cycle-1 T-6 / F-104) | P1 |
| M-14 | Toolbar Undo onClick | native menu Cmd+Z wired | rendered but no `onClick` (cycle-1 T-7 / F-102) | P1 |
| M-15 | Toolbar Redo onClick | native menu Cmd+Shift+Z wired | rendered but no `onClick` (cycle-1 T-8 / F-103) | P1 |
| M-16 | Toolbar Record button | bridge fn wired (`elementTransportSetRecording`) | not rendered at all (cycle-1 T-11 / F-204) | P1 |
| M-17 | Toolbar undo-depth counter | native menu shows enabled/disabled | no counter, no undo-depth selector in store | P2 |
| M-18 | Plugin browser format filter (All / vst3 / au / clap / lv2) | native browser has format pills | only category filter (GEN/MOD/LOGIC) (cycle-1 P-3) | P2 |
| M-19 | Plugin drag-from-Palette → canvas drop | native browser has drag | not implemented; ToolPalette plugin rows are not `draggable`, GraphCanvas has no `onDrop` (cycle-1 P-7 / F-202) | P1 |
| M-20 | Right-click → Add/Remove favourite on plugin row | native context menu | no `onContextMenu` on plugin items; no `elementSetPluginFavorite` bridge (cycle-1 P-8 / F-203) | P1 |
| M-21 | Plugin format badge ([inst]/[fx]/[midi]) | native rendering | not rendered (cycle-1 P-9) | P2 |
| M-22 | Block double-click → embedded plugin GUI | spec'd path | for non-Container blocks, double-click is a no-op; only Container/Portal handled (cycle-1 B-12 / F-105) | P1 |
| M-23 | Drag block onto cable → inline-insert | spec'd | no drop-on-edge handler (cycle-1 E-9) | P2 |
| M-24 | Reroute pin on cable double-click | spec'd | no `onEdgeDoubleClick` (cycle-1 E-8) | P2 |
| M-25 | Cmd+T rename | spec | only `Cmd+R` wired; no `case "t"` (cycle-1 B-7) | P2 |
| M-26 | Spacebar play/stop | blueprint §11.2 | no `case " "` in `useKeyboard.ts` (cycle-1 KB-5) | P2 |
| M-27 | Cmd+N new project | blueprint §11.2 | no `case "n"` (cycle-1 KB-6) | P2 |
| M-28 | Cmd+A select all | blueprint §11.2 | no `case "a"` (cycle-1 KB-7) | P2 |
| M-29 | Spatial bookmark persistence across project files | blueprint §8.1 | only Zustand-local; not serialised to project file (cycle-1 SB-3) | P2 |
| M-30 | Snippet Shelf — drag selection onto shelf | blueprint §7.5 | no `onDrop` on SnippetShelf (cycle-1 SS-2) | P2 |
| M-31 | Snippet Shelf — drag thumbnail onto Board | blueprint §7.5 | no drag (cycle-1 SS-3) | P2 |
| M-32 | Dashboard Builder full composability | blueprint §6.2 | "Unbound placeholder overlay" — partial (cycle-1 D-1 / F-502) | P1 |
| M-33 | Native menu > Audio Input / Output Device choosers | native Options menu (lines 438-452) | partial — `PreferencesModal` has audio settings, but native quick-pick from menu is gone | P2 |
| M-34 | Native menu > Sample Rate / Buffer Size quick pickers | native Options menu (lines 454-529) | only via Preferences modal | P2 |
| M-35 | "View" menu Rotate View / Session Properties | native View menu | absent in React | P2 |
| M-36 | Plugin window embed (real, not placeholder) | native plugin window | `PluginEditorControls` placeholder div + native overlay; no true webview embed | P2 (BRIDGE-DEPENDENT) |
| M-37 | Cmd+4 open Editor panel | CLAUDE.md | unimplemented (cycle-1 S-4) — only 3 panels exist | P3 |

§2 subtotal: 37 rows (10 P1, 26 P2, 1 P3)

---

## §3 — DIVERGENT behaviour (React behaves differently than native)

| ID | Behaviour | Native | React | Severity |
|----|-----------|--------|-------|----------|
| V-1 | Plugin browser empty state | empty list when no plugins scanned | falls back to fake demo plugins (Oscillator Core V3, Wavetable Gen, Ladder Filter 24dB, Peak Limiter) — clicking these will fail because IDs don't match real bridge identifiers (cycle-1 F-101) | **P0** (looks-pretty-isn't-connected) |
| V-2 | Scene previous/next from toolbar | engine snapshot applied via PresetService | calls `useAppStore.setScene` (local state only); the bridge call lives in `usePerformStore.setActiveScene` and is never reached — two parallel scene-state systems (cycle-1 SC-4 / F-201) | **P0** |
| V-3 | QuickAdd insertion point | inserts at cursor coords | calls `nativeGraphAddPlugin(id)` without x/y; node lands wherever engine drops it (cycle-1 Q-3) | P2 |
| V-4 | Sidebar Cmd+1/2/3 | cycles between Session / Browse / Inspector / Editor (CLAUDE.md) | toggles three independent panels (left/right/bottom) — semantic deviation, not a crash (cycle-1 S-1..S-4) | P2 |
| V-5 | Plugin scan UX | native scans on demand from Plugin Manager dialog | "OPEN PREFERENCES" empty state in Tool Palette; no in-app scan trigger exposed in React | P2 |
| V-6 | Status bar layout | native: single footer row "Device: X | Engine: Running: CPU: Y% | Sample Rate: 48 KHz: Buffer: 512" | React StatusBar grid + Toolbar duplicate readouts; the legacy native footer ALSO shows through underneath the React webview, producing literal dual status bars (visible in `react-bottom.png`) | P1 |
| V-7 | "Engine Running" semantics | tied to actual `Engine` state | tied to fake CPU > 0; will go GREEN whenever the metering peak ticks above zero | P0 (see D-2) |
| V-8 | About modal build number | native shows full version + build | React About modal shows version but build number "not yet shown (waiting on C++ side)" per cycle-1 MO-2 | P2 |
| V-9 | Preferences modal scope | native Preferences covers Audio, MIDI, Plugin paths, Lua editor, OSC, Mapping | React `PreferencesModal` covers Audio device + MIDI mapping only; full Lua console + Graph mixer + Plugin manager paths only via overlay popups (Tag-C deferred) | P1 |
| V-10 | Tool Palette plugin click | native clicks insert at center | works, but no drag fallback (V-3 is closest analog) | (subsumed by M-19) |
| V-11 | Snippet Shelf insertion | native molecules drop with full position fidelity | React click-only insertion; molecule "internal wiring after insert still limited" per parity matrix | P2 |

§3 subtotal: 11 rows (3 P0, 1 P1, 7 P2)

---

## §4 — PRESENT-AND-FUNCTIONAL (sanity-check positives)

A subset of the 56 WORKS rows from cycle 1 — recorded here so the next ralph story doesn't
inadvertently regress them.

| ID | Affordance | Evidence |
|----|-----------|----------|
| W-1 | Toolbar Play/Pause / Stop / Rewind | wired to `nativeTransport*` bridges; `isPlaying` mirror works on non-empty graphs |
| W-2 | Toolbar Panic button (Edit + Perform + StatusBar) | calls `nativeTransportPanic` → `MidiPanic::messages()` |
| W-3 | Toolbar BPM editable | inline edit + `nativeTransportSetTempo`, 20-999 clamp |
| W-4 | Toolbar Edit/Perform mode toggle + Cmd+Shift+M | `useKeyboard.ts:201-207` |
| W-5 | Cmd+K Command Palette | searches actions + plugins, recent + favourites sort |
| W-6 | Right-click pane → QuickAdd | `onPaneContextMenu` opens `<QuickAddPopup>` |
| W-7 | Double-click empty pane → navigate UP | `popBreadcrumb` |
| W-8 | Minimap render + Shift+M toggle | `useKeyboard.ts:246-249` |
| W-9 | Block drag / multi-select / lasso / Cmd+D / Cmd+R | React Flow built-ins + bridge calls |
| W-10 | Cable connect / disconnect / colour by signal | works for all three signal types |
| W-11 | Wireless patch (W key) | `useKeyboard.ts:313-330` |
| W-12 | Spatial bookmarks (Ctrl+0..9 save / Shift+0..9 recall) | works in-session |
| W-13 | Inspector tabs (INSPECTOR / CABLES / LOG / METERS / SCRIPT) | wired |
| W-14 | Block parameter list (knob/fader/toggle) | `nativeGetNodeParameters` polled |
| W-15 | NeuPromptModal replacing window.prompt | Wave-1 W-1 closeout, 0× window.prompt |
| W-16 | About modal 4-state machine + check-for-updates | F-9 closeout |
| W-17 | MIDI mapping table + learn toggle | `PreferencesModal.tsx:248-301` |
| W-18 | Active-graph dropdown when N >= 2 | `Toolbar.tsx:132-150` |
| W-19 | Snippet Shelf empty state | "No snippets saved" rendered |
| W-20 | Empty Board placeholder | "Right-click to add a block · Cmd+K to search" |

§4 subtotal: 20 rows (positive sanity check)

---

## §5 — Severity tally

| Severity | Count | Scope |
|----------|------:|-------|
| **P0** | 10 | D-1, D-2, D-3, D-4, D-5, D-6, D-23 (7 from §1) + V-1, V-2, V-7 (3 from §3) |
| **P1** | 18 | D-7, D-8, D-9, D-10, D-12, D-14, D-17 (7 from §1); M-1, M-4, M-5, M-6, M-13..M-16, M-19, M-20, M-22, M-32 (10 from §2 — 11 with M-22 counted once) plus V-6 / V-9 (2 from §3); rounds to 18 distinct |
| **P2** | 41 | 8 from §1 + 26 from §2 + 7 from §3 |
| **P3** | 1 | M-37 (Cmd+4 panel — only 3 panels exist) |
| WORKS-in-§1 sanity (D-13, D-15, D-21) | 3 | retained inline; double-counted with §4 awareness only |
| Functional sanity (§4) | 20 | recorded for regression awareness |
| **Total bug rows (§1+§2+§3 minus the 3 WORKS)** | **70** | |
| **Row count (§1+§2+§3 inclusive)** | **73** | |

---

## §6 — Pattern groups (root-cause clusters)

See `bug-categories.md` for fix-effort estimates and full touched-file lists. Cluster IDs C-1
through C-9 are referenced from the Severity tally and the per-row File-pointer column.

- **C-1** Engine snapshot missing CPU (covers D-1, D-23, parts of D-2, D-10) — fix: add
  `engine.cpu` and `engine.host_cpu` to `buildActiveGraphJson`, OR add `elementGetEngineSnapshot`
  poll, OR push via existing 60Hz timer; remove `peak * 320` from `useJuceBridge.ts`.
- **C-2** Engine block omitted on empty graphs (covers D-3, D-4, D-5, D-6, D-12, D-14, D-17) —
  fix: hoist the `engine` block above the `! gn.isGraph()` early return at
  `element_webview_host.cpp:4005`.
- **C-3** `engineRunning` derived from CPU (covers D-2, V-7) — fix: read `engine.isPlaying` (and a
  new `engine.isRunning`) directly in `StatusBar.tsx:19`.
- **C-4** Toolbar dead-button cluster (covers M-13, M-14, M-15, M-16) — wire 4 onClicks; build TAP
  helper.
- **C-5** Scene state divergence (covers V-2) — collapse `useAppStore.activeScene` and
  `usePerformStore.activeSceneIndex` into one bridge-aware selector.
- **C-6** Plugin browser fakery (covers V-1, M-19, M-20, M-21, M-18) — delete `pluginsDemoFallback`,
  add favourite CRUD bridge fn, add HTML5 dnd to palette + canvas onDrop.
- **C-7** Canvas double-click gap (covers M-22) — extend `onNodeDoubleClick` else-branch to call
  `nativePluginEditorOpen`.
- **C-8** Native menu strip (covers M-1..M-12, M-33..M-35) — restore File/Edit/View menu items
  for WebContent OR move them to React (Cmd+K palette has many, but discoverability via menu is
  gone).
- **C-9** Spec-mode keyboard gaps (covers M-25..M-28) — add four `case` branches to
  `useKeyboard.ts`.

---

## Coverage caveats (carried from cycle 1, still apply)

- AX inspection covers application-level affordances; embedded WebView interior nodes appear as
  generic AXGroup/AXButton (e.g. lines 8-31 of `ax-tree-react.json` are the React shell rendering
  a single AXScrollArea > AXWebArea wrapping ~22 anonymous AXGroup/AXStaticText children).
  Detailed React internals were verified by source code reading.
- `B-16` Replace-with menu, `R-4` Comment-box context, `I-7` Tag-as-Macro per-row toggle, `Q-4`
  QuickAdd keyboard nav, `D-4` Dashboard persistence, `SS-4` snippet thumbnail generation, and
  `SB-5` MIDI-activity light remain NOT-TESTABLE without populated bridge data and live MIDI input.
- macOS Recent Items hierarchy (Apple menu submenu) is system-provided and identical between
  modes — not relevant to the audit.
- Production-mode (non-dev) bundle: not exercised; this audit covers the running Element.app
  binary in both `WebContent` and `ELEMENT_STANDARD_CONTENT=1` modes.
