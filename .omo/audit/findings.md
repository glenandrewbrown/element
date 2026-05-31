# Element Web-Shell Re-Audit — Findings (Wave 3, salvaged)

**Date:** 2026-05-29 · **Branch:** local-enhancements · **Build:** post-`ff023feb` (fixes #1 boot-hang, #2 blank-UI, #3 getGraphState all landed; Gate A passed).
**Subject:** `BRASS_4Horns.els` driven live in `Element.app`, plus Edit/Perform/modal surfaces.
**Method:** Synthesis from 17 captured screenshots (`.omo/evidence/task-11-*.png`) + targeted code cross-reference. **No live driving performed** (salvage of a crashed live-audit agent). Where a screenshot cannot decide and code cannot either, the row is marked `needs-live = yes`.

**Evidence index (screenshots that carry signal):**
- `task-11-brass-canvas-full.png` — clearest Edit-mode canvas, all 4 blocks badged, overlap visible. **Primary evidence.**
- `task-11-brass-blocks.png` / `task-11-brass-front-2.png` / `task-11-brass-window-3.png` — full React shell (toolbar metrics, panels, inspector, browser).
- `task-11-brass-overlap.png` / `task-11-brass-canvas-crop.png` — zoomed overlap detail.
- `task-11-perform-mode.png` — Perform mode with Preferences modal open.
- `task-11-about-modal.png` / `task-11-preferences-modal.png` / `task-11-prefs-zoom.png` — modals.
- `task-11-brass-window.png` — **native JUCE pre-paint window** (old native toolbar + native status bar); NOT the React shell. Use only for native-side device/engine facts.
- `task-11-brass-front-1.png` / `task-11-brass-prelaunch-fullscreen.png` — the `/team` orchestration TUI in iTerm, i.e. meta-evidence of the crash, not an app surface.
- `task-11-brass-header-zoom*.png` — trivial fader-label crops, no signal.

Severity: **P0** blocker · **P1** high (major usability, no data loss) · **P2** medium · **P3** cosmetic.

---

## Findings table

| id | sev | surface | summary | repro | evidence | needs-live |
|----|-----|---------|---------|-------|----------|------------|
| F-01 | P1 | GraphCanvas / Block + BlockEmbed | **Block overlap at expanded zoom tier.** Same-column blocks (MIDI IN -> DIVISIMATE CORE -> INFINITE BRASS 4 HORNS -> 4th SIGNAL PROCESSING block) pile vertically and obscure each other once zoomed in past 0.8 (expanded tier). Root-caused: expanded `BlockEmbed` height ~170px exceeds the legacy ~140-151px saved Y-gaps. Glen: "not usable." App-wide for legacy-authored sessions, not BRASS-specific. | Open `BRASS_4Horns.els`, Edit mode, zoom in to read blocks -> blocks in the x~403 column overlap. Zoom out (compact/standard tier) -> clean. | `task-11-brass-canvas-full.png`, `task-11-brass-overlap.png`, `task-11-brass-front-2.png`; root cause in `.omo/audit/layout-finding.md` sec.3; `BlockEmbed.tsx:318-345`, `Block.tsx:532-534`, `useGraphStore.ts:138` | no |
| F-02 | P1 | Block badge (all blocks) | **Every block shows the "INT" format badge** regardless of real format. `inferFormat()` is hardcoded `return "INT"` (`useJuceBridge.ts:181-183`) and the C++ graph-state block loop (`element_webview_host.cpp:4218-4271`) emits no `format` field, so `mapBlock` (`useJuceBridge.ts:206`) always falls through to the stub. (= prior BUG-013, "item 15" emit gap; still unfixed in this build.) `format`/`category` ARE emitted, but only in the *plugin-list* builder at `:4392/:4394`, not the graph-state loop. | Any loaded session: read each block header -- all read "INT". | `task-11-brass-canvas-full.png` (AUDIO IN / MIDI IN / DIVISIMATE CORE / INFINITE BRASS 4 HORNS all "INT"); `useJuceBridge.ts:181`, `element_webview_host.cpp:4218-4271` | no |
| F-03 | P2 | Block category shape/colour | **Block category mis-inferred** -- `inferCategory()` (`useJuceBridge.ts:167-179`) guesses from the name. "AUDIO IN" -> modifier (orange diamond) though it is an I/O node; "DIVISIMATE CORE" and "INFINITE BRASS 4 HORNS" -> modifier (orange diamond) though they are instruments/generators. Same root gap as F-02 (no C++ `category` emit on the block loop). (= prior BUG-012.) | Inspect block icon colour/shape vs the block's real role. | `task-11-brass-canvas-full.png` (AUDIO IN orange diamond "modifier"); `useJuceBridge.ts:167-179`, `element_webview_host.cpp:4218-4271` | no |
| F-04 | P2 | Toolbar — SAMPLE metric | **"SAMPLE" toolbar metric shows transport position, not sample rate.** Renders `{live.timecode || "—"}` (`Toolbar.tsx:413`) under a "SAMPLE" label -> displays "1.1.0" (bars.beats.ticks) instead of "48.0 KHz". Native status bar of the same session correctly shows "Sample Rate: 48.0 KHz". Wrong field wired to the label. | Edit mode toolbar -> SAMPLE reads "1.1.0". | `task-11-brass-canvas-full.png`, `task-11-brass-blocks.png` (SAMPLE = "1.1.0"); `task-11-brass-window.png` (native: 48.0 KHz); `Toolbar.tsx:411-414` | no |
| F-05 | P2 | LiveHealth (perform right) — latency | **Latency rendered unformatted** in the perform Live Health panel: `{health.latency} ms` (`LiveHealth.tsx:127`) with no `.toFixed(1)`. The toolbar copy of latency WAS fixed (`Toolbar.tsx:419` uses `.toFixed(1)` -> "23.2ms") but LiveHealth was not, so the two diverge in formatting. (= prior BUG-015, only partially fixed.) | Perform mode -> Live Health -> Latency shows a long raw float. | `LiveHealth.tsx:124-127`; toolbar-formatted value visible `task-11-brass-canvas-full.png` (LATENCY 23.2MS) | yes (to see the raw float string in the panel) |
| F-06 | P2 | LiveHealth (perform right) — I/O | **Perform I/O activity shows "(n/a)".** `LiveHealth.tsx:92` hardcodes `INPUT (n/a)` with the meter ladder dimmed; the metering push provides a single aggregate peak, not the per-input/output breakdown the component wants. (= prior BUG-022; still present in code.) | Perform mode -> Live Health -> INPUT reads "(n/a)". | `LiveHealth.tsx:92-95` | yes (to confirm rendered text in host) |
| F-07 | P2 | SnippetShelf (edit bottom) | **No "save as molecule/snippet" action exists.** `SnippetShelf.tsx` only imports `nativeMoleculeInsert` (load); the empty-state text "No snippets saved — select blocks and save as molecule" (`:31`) describes an action with no UI affordance and no create bridge. (= prior BUG-017; still present.) | Select blocks -> no "save as molecule" anywhere (shelf, canvas/node context menu). | `SnippetShelf.tsx:3,10,31` | no |
| F-08 | P3 | PreferencesModal — MIDI learn | **MIDI-learn now has an active-state toggle but map management unconfirmed.** `PreferencesModal.tsx:244-252` toggles `nativeMappingSetLearning(!learning)` with a visible "Stop MIDI learn"/"MIDI learn" label (the active-indicator half of prior BUG-016 is improved). Whether learned mappings can be viewed/edited/removed is not decidable from the modal screenshot. | Preferences -> Mapping -> toggle MIDI learn; try to view/remove a learned map. | `task-11-preferences-modal.png`, `task-11-perform-mode.png` (modal open); `PreferencesModal.tsx:244-252` | yes (map list / edit-remove) |
| F-09 | P2 | ToolPalette / Browser / CommandPalette / QuickAdd | **Plugin-driven surfaces remain data-gated on a host plugin scan.** There is no plugin-scan trigger UI or bridge in the React layer (prior BUG-001/002). Per `.omo/audit/bridge-contract.md`, the 7 "missing natives" are unbuilt on BOTH sides (not registration gaps), so the in-app scan feature genuinely does not exist; browser/palette/quick-add are only as full as a host-side scan makes them. Notepad reports the host cold-booted 1996 plugins, so in-host these may populate. | Open Browser / Cmd+K / right-click canvas -> results depend on host scan; no in-app "Scan" button. | `task-11-brass-window-3.png` (browser panel); `.omo/audit/bridge-contract.md` sec.0/sec.5; prior BUG-001/002 | yes (confirm browser populated with the 1996 host plugins) |
| F-10 | P1 | GraphCanvas — newly-added blocks | **Webview-added blocks pile at origin (0,0).** Secondary layout defect: the add path writes only relative coords; `buildActiveGraphJson` emits (0,0) for any node never opened in the legacy editor, with no auto-layout fallback. Distinct from F-01 (legacy saved positions + tall embeds). Masked once a node is dragged (drag writes absolute x/y). | Add a plugin via QuickAdd -> it lands at canvas origin, stacked on prior adds. | `.omo/audit/layout-finding.md` sec.5; `element_webview_host.cpp:1277`, `engineservice.cpp:549-555,624`, `graphmanager.cpp:385-409` | yes (observe stacking live; root-cause is code-confirmed) |
| F-11 | P2 | StatusBar (React, edit bottom) | **StatusBar device/engine/SR correctness — needs the React-shell bottom strip.** Code is wired to live sources: `deviceName` falls back to "Default Device" only when `health.clock` is em-dash (`StatusBar.tsx:18-19`); engine state ORs snapshot + isPlaying (`:16`); SR from `health.sampleRateLabel` (`:20`). The native pre-paint window (`brass-window.png`) shows real device/engine but is NOT this component. The React-shell full screenshots are too low-res to read the bottom strip. (prior BUG-024/025 are dev-mode-only per their own notes.) | Edit mode -> read React StatusBar bottom strip (device / RUNNING / SR / timecode). | `StatusBar.tsx:16-20,58-67,104`; full shell `task-11-brass-window-3.png` (strip illegible) | yes |
| F-12 | P3 | Perform mode canvas | **Perform-mode canvas appears empty — cannot distinguish broken from expected.** In `task-11-perform-mode.png` the canvas shows no blocks, but a Preferences modal is open over it and, per `layout-finding.md`, blocks render as tiny compact pills when zoomed out, so emptiness is plausibly occlusion/zoom, not a defect. Not asserting a bug. | Enter Perform mode on a loaded board (no modal) -> check blocks render. | `task-11-perform-mode.png` (modal occludes canvas) | yes |
| F-13 | P3 | Toolbar — Board dropdown switch | **Board (graph) selector may not switch graphs** (prior BUG-027: `elementSessionSetActiveGraph` returned undefined -> no switch). Not exercised in any screenshot; BRASS has a single visible "Graph 1". Cannot confirm or refute. | Toolbar -> Board dropdown -> pick a second graph -> observe canvas change. | breadcrumb "Graph 1" in `task-11-brass-canvas-full.png`; prior BUG-027 | yes |
| F-14 | P2 | Inspector / parameters | **Per-block parameter loading unverified at runtime.** `elementGetNodeParameters` path exists; inspector shows PROJECT OVERVIEW fields populated in `brass-front-2`, but no screenshot selects a block and shows its parameter list. (prior BUG-007.) | Select a plugin block -> Inspector -> check automatable parameters list. | `task-11-brass-front-2.png` (inspector = project overview, no node params shown); prior BUG-007 | yes |

---

## Confirmed-improved since prior audit (host build now shows real data) — context, not findings

- **Toolbar metrics populate** (BPM 120.00, BUFFER 512, LATENCY 23.2ms formatted) — `task-11-brass-blocks.png`, `task-11-brass-canvas-full.png`.
- **About modal shows "Version 1.1.0"** (prior BUG-009 em-dash gone in host) — `task-11-about-modal.png`.
- **Preferences audio dropdowns populate from store** (`PreferencesModal.tsx:15,86-147`) — prior BUG-003.
- **BPM field editable** (`Toolbar.tsx:350-387`) — prior BUG-026.
- **SessionTree calls graph tree on mount** (`SessionTree.tsx:182-188`) — prior BUG-006.
- **VirtualKeyboard sparse array removed** (`VirtualKeyboard.tsx:49` uses explicit `null`) — prior BUG-020.

---

## Severity counts (14 findings)

| Severity | Count | IDs |
|----------|-------|-----|
| P0 | 0 | — |
| P1 | 3 | F-01, F-02, F-10 |
| P2 | 8 | F-03, F-04, F-05, F-06, F-07, F-09, F-11, F-14 |
| P3 | 3 | F-08, F-12, F-13 |

**Top usability priorities:** F-01 (overlap, "not usable") and F-02 (every block "INT") are the two that most degrade the Edit-mode experience and are both code-confirmed and fixable React/C++-side without redesign.
