# V3 UI — Per-Component PORT ROADMAP (post-Block)

> **Status:** planning doc only. READ-ONLY on code — no `src/`, `webview/`, `include/`, or CMake edits.
> **Build spec:** the 37 locked verdicts in `.omo/bakeoff/VERDICTS.md`.
> **Method:** `.omo/plans/mvp-bakeoff-plan.md` (cherry-pick best-of-both, re-house on Element's real
> Zustand+JUCE-bridge+React Flow architecture; mockup supplies design language, never architecture).
> **Objective tracker:** `.omo/HORIZON-v3-ui.md`.
> **Reference pattern:** the V3 Block — `webview/src/components/canvas/Block.tsx` — is now a faithful
> port of the mockup's NodeBlock, styled via the scoped CSS design system in `webview/src/index.css`
> under `.nodeblock-v3`. **Every component below adopts that same pattern.** Authored 2026-05-31.

---

## 0. The `.nodeblock-v3` design system — what every port adopts

Grounded in `webview/src/index.css` lines 296–389 (scoped to the `.nodeblock-v3` subtree) and
`webview/src/components/canvas/Block.tsx`. The reusable surface the Block established:

| Token / class | Value (index.css) | Use in ported components |
|---|---|---|
| `--cat-instrument / -midifx / -audiofx / -modulator` | HSL `210 65% 57%` / `180 65% 47%` / `38 80% 56%` / `266 64% 69%` | category accents (block tint, chips, list dots, minimap bars) |
| `--sig-audio / -midi / -value` | HSL `210 65% 57%` / `180 65% 47%` / `38 80% 56%` | port pips, cable colour, signal-typed UI |
| `--status-ok / -warn / -clip` | HSL `142 69% 58%` / `38 80% 56%` / `358 75% 59%` | LEDs, load bars, meters, health |
| `.neu-sculpt` / `.neu-sculpt-hover` | raised chassis gradient + paired shadows | every panel/card/button surface (raised) |
| `.port-well` / `.port-sidechain` | recessed circular socket | any connectable socket UI |
| `.neu-glow-{cat}` | 1.5px ring + 24px category glow | selected/active state on any category-bearing element |
| `.t-precision` | (line 389) precision type/feature flag | dense readouts |

**Adoption rule for each port:** wrap the component subtree in `.nodeblock-v3` (or lift the same
tokens into a sibling scope) so the HSL `--cat-*/--sig-*/--status-*` tokens + helper classes apply
**verbatim**, exactly as Block does. Keep Element's existing `neu/` primitives and Tailwind tokens
(Canvas/Panel/Surface/Elevated/Pressed) for the chassis; use `.nodeblock-v3` tokens for the
category/signal/status accents. Never hand-roll new shadow values — pull from `.neu-sculpt`.
**Global adaptation (VERDICTS §"Global"):** Perform mode is shelved — strip every EDIT/PERFORM
toggle and perform-only branch; any component importing `usePerformStore` carries a "strip perform
state" task and uses the edit/default variant only.

**Mockup story id convention (grounded):** mockup metas carry NO explicit `title:`
(verified by grep across all 44 `*.stories.tsx`), so Storybook auto-titles from the file path under
`src/`. Per the task brief the mockup Storybook (:6008) exposes `components-*` ids, i.e. autotitle
includes the `components/` path segment. Therefore `src/components/<Name>.stories.tsx` →
id `components-<name>`, and `src/components/<sub>/<Name>.stories.tsx` → `components-<sub>-<name>`
(docs id = `<id>--docs`). IDs below are derived from real file paths
(`/Volumes/Projects/Development_Projects/Github_Repos/mindful-studio/src/components/...`); confirm
live against `:6008` before authoring a story, since the composed-ref index is point-in-time.

---

## 1. Per-component port table

Effort: **S** ≈ ≤0.5 day (restyle/token swap) · **M** ≈ 1–2 days (merge + re-wire) · **L** ≈ 3+ days
(new structure or cross-cutting). "Wiring to preserve" = the Element stores/bridge already wired in
the live webview file (grounded by import grep) that the port must NOT break.

### Core canvas

| # | Component | Element file | Mockup component / `:6008` id | How it adopts `.nodeblock-v3` | Wiring to preserve | Effort | Depends on |
|---|---|---|---|---|---|---|---|
| 2 | **Cable** | `canvas/Cable.tsx` | `CableConnection` / `components-cableconnection` | Use `--sig-*` for the curve colour + endpoint plugs/arrowhead; flow-pulse keyed to `--status-ok`; bus badge already matches Block's BusBadge | `useCableMeterStore` (live RMS glow), `useBusStore` (wireless), `useGraphStore` (edges), `useAppStore` (routing mode); real connect/disconnect via React Flow | **M** | Block (done) — shares port geometry |
| 3 | **Board / GraphCanvas** | `canvas/GraphCanvas.tsx` | `GraphCanvas` / `components-graphcanvas` | Canvas bg = Canvas token; ADD select-to-trace spotlight (dim non-traced, `--cat` highlight) + floating arrange toolbar as `.neu-sculpt` pill; nested-board chrome (v24) | `useGraphStore` (nodes/edges/viewport/minimap), `useAppStore`, `useHostExtrasStore`, `nativeGraph*` (connect/disconnect/move/rename/comment/viewport), `nativePluginEditorOpen`; React Flow `MiniMap` | **L** | Block, Cable |
| 24 | **Breadcrumb + Navigation** ⭐ | `layout/Breadcrumb.tsx` + GraphCanvas | `TopToolbar`/`GraphCanvas` nav (no isolated breadcrumb story) / `components-graphcanvas` | depth-tinted breadcrumb pills using `--cat`; nested-canvas-frame border + left depth-ribbon + animated depth-banner + EXIT button on canvas | `useGraphStore` (`selectBreadcrumbs`), Container/Portal dive gesture, `nativeGraphSetActiveGraph`/session-graph nav | **L** | Board (nested chrome lives on canvas) |
| 21 | **Minimap** | inside `GraphCanvas.tsx` (`MiniMap`) | `MinimapViewport` / `components-minimapviewport` | restyle node bars to `--cat-*` category colours + viewport frame; keep RF auto-sync | React Flow `MiniMap` wired to `useGraphStore` nodes + viewport; `minimapVisible` | **S** | Board |
| 27 | **QuickAdd** | `canvas/QuickAddPopup.tsx` | `QuickAddPopup` / `components-canvas-quickaddpopup` | `.neu-sculpt` popup; format badges reuse NeuBadge; port-type filter header tinted by `--sig-*` | `nativeGraphAddPlugin` insert-at-cursor, `usePluginBrowserStore` (favourites/recents), port-type-aware filtering on drag-off | **M** | Board (cursor/port context) |

### Shell + chrome

| # | Component | Element file | Mockup component / `:6008` id | How it adopts `.nodeblock-v3` | Wiring to preserve | Effort | Depends on |
|---|---|---|---|---|---|---|---|
| 23 | **App shell / layout** | `layout/AppShell.tsx` | `AppShell` / `components-layout-appshell` | rebuild on mockup's generic slot primitive (topBar/leftRail/main/rightRail/bottomBar); slot chrome = `.neu-sculpt` panels | mounts existing panels; **strip Perform layout branch** (`usePerformStore`) | **L** | — (placement gate for all panels) |
| 4 | **Toolbar** | `layout/Toolbar.tsx` | `TopToolbar` / `components-toptoolbar` | adopt mockup's filled/solid **button** style (verdict 12); fresh Edit-only top bar; **DROP EDIT/PERFORM toggle** | `useGraphStore` (breadcrumbs), `useEngineSnapshotStore`, `nativeTransport*` (panic/play/stop/rewind/tempo/record), `nativeUndo/Redo`, `nativeSession*`; **strip `usePerformStore`** | **M** | AppShell (top slot) — needs a design pass |
| 22 | **Bottom strip** | `layout/StatusBar.tsx` | `BottomStrip` / `components-bottomstrip` | merge 50/50: mockup transport + master meter (meter = `--status-*`) + keep Element's slim status-field styling | `useEngineSnapshotStore` (device/SR/buffer/latency/timecode/RUNNING) — wire real engine data; **strip perform state** | **M** | AppShell (bottom slot) |
| 5 | **Plugin Browser** | `layout/ToolPalette.tsx` | `ToolPalette` / `components-toolpalette` | mockup search-first flat list + category filter chips (`--cat-*`) on `.neu-sculpt` rows | `usePluginBrowserStore`, `nativeGraphAddPlugin`, `nativeMoleculeInsert`, `useSessionStore`, `useHostExtrasStore`; **BUILD scan/rescan/paths controls (#1 native gap, in MVP)** | **L** | AppShell (left rail) |
| 6 | **Inspector** | `layout/InspectorHub.tsx` (+ `LiveHealth.tsx` → Health tab) | `InspectorPanel`/`InspectorHub` / `components-inspectorpanel`, `components-layout-inspectorhub` | mockup docked tabbed shell (Block/Bus/Cable/Health) as `.neu-sculpt`; tab accents `--cat-*` | `useGraphStore`, `useEngineSnapshotStore`, `nativeGetNodeParameters`/`nativeSetNodeParameter`, `nativePreset*` (A/B compare), `nativeGraphSetNodeNote`, `useHostExtrasStore`, `useCableMeterStore`; **strip perform** | **L** | AppShell (right rail) |

### Secondary surfaces & dialogs

| # | Component | Element file | Mockup component / `:6008` id | How it adopts `.nodeblock-v3` | Wiring to preserve | Effort | Depends on |
|---|---|---|---|---|---|---|---|
| 7 | **Command palette** | `canvas/CommandPalette.tsx` | `CommandPalette` / `components-commandpalette` | mockup 4-mode bar (+Block/@Board/>Command) + category result tiles (`--cat-*`) on `.neu-sculpt` | `useGraphStore`, `useAppStore`, `usePluginBrowserStore`, `useHostExtrasStore`, `nativeGraphAddPlugin/SetBypass`, `nativeUndo/Redo`, `nativeTransport*`, `nativeSession*`, `nativeMappingSetLearning`; **drop scene/perform commands** | **M** | neu primitives, Inspector/Board commands |
| 28 | **NodeContextMenu** | `canvas/NodeContextMenu.tsx` | `NodeContextMenu` / `components-canvas-nodecontextmenu` | keep Element's menu look; `.neu-sculpt` surface; category dot accents | merge both action sets + **add native-parity items** from `src/ui/contextmenus.hpp` (Disconnect submenu, Color, Oversample, Replace, Connect-via, rich Presets, Enable/Disable, Rename) | **M** | Board |
| 29 | **EdgeContextMenu** | `canvas/EdgeContextMenu.tsx` | `EdgeContextMenu` / `components-canvas-edgecontextmenu` | adopt mockup cable menu on `.neu-sculpt` | re-wire to real disconnect/bus ops; native-parity check for dropped cable/arc items | **S** | Cable, Board |
| 31 | **ConnectionEditor** | `layout/ConnectionEditor.tsx` | `ConnectionEditor` / `components-layout-connectioneditor` | adopt nicer mockup styling; `--sig-*` type filters | Element's full cable-list + add-form + type-filters + wiring (keep) | **S** | Cable |
| 32 | **BusInspector** | `layout/BusInspector.tsx` | `BusInspector` / `components-layout-businspector` | mockup detail-card styling (`.neu-sculpt`, `--sig-*` name/type/level/mute-solo) | `useBusStore` + cable-ghost preview (keep) | **S** | Inspector (Bus tab), Cable |
| 26 | **CommentFrame** | `canvas/CommentFrame.tsx` | `CommentFrame` / `components-canvas-commentframe` | mockup rounded frame + label-tab; `--cat-*`/neutral colour-coding; keep Element inline label | re-wire CRUD + colour-coding via `nativeGraphComment*` | **S** | Board |
| 20 | **Snippets / presets** | `layout/SnippetShelf.tsx` | `BlockPresetsPanel` / `components-blockpresetspanel` | one unified panel, mockup tag/filter/save UX on `.neu-sculpt` | merge single-block presets AND multi-block group snippets into one save/recall store path | **M** | neu primitives |
| 19 | **Multi-instance / Mirror** | *(new — none yet)* | `InstanceSwitcher`/`MirrorPanel`/`InstancesPanel` / `components-instanceswitcher`, `components-mirrorpanel`, `components-instancespanel` | `.neu-sculpt` switcher + live read-only mirror; `--status-*` for availability | **NEW** — build InstanceSwitcher + MirrorPanel on Branch-A in-process C++ registry (reuses `buildGraphSnapshotJson`); defer InstancesPanel roster polish post-MVP | **L** | C++ Branch-A registry (Lane A) |
| 18 | **VirtualKeyboard** | `layout/VirtualKeyboard.tsx` | `VirtualKeyboard` / `components-layout-virtualkeyboard` | mockup 5-octave + octave/channel steppers; `--sig-midi` accents | re-add velocity control + real MIDI note-on/off bridge wiring (`nativeKeyboard`) | **M** | neu primitives |
| 25 | **BlockEmbed** | `canvas/BlockEmbed.tsx` | `BlockEmbed` / `components-canvas-blockembed` | adopt mockup in-block expanded embed; re-add real meter/spectrum | already wired into Block expanded tier (`useParameterStore`/`useCableMeterStore`) | **S** | Block (done) |
| 36 | **ScriptEditor** | `canvas/ScriptEditor.tsx` | `ScriptEditor` / `components-canvas-scripteditor` | mockup code surface (syntax + line numbers) on `.neu-sculpt` | keep SAVE & COMPILE + real Lua engine wiring | **M** | neu primitives |
| 37 | **BlockTabStrip** | `layout/BlockTabStrip.tsx` | `BlockTabStrip` / `components-layout-blocktabstrip` | mockup tab styling (badges/active-state, `--cat-*`) | keep wired open-block tabs | **S** | AppShell |
| 30 | **Keyboard shortcuts** | `hooks/useKeyboard.ts` + new `?`-overlay | `KeyboardShortcuts` / `components-keyboardshortcuts` | mockup `?`-overlay reference sheet on `.neu-sculpt` | wire to real shortcuts; **PLUS build full key-command assignment in Prefs** (resurrect native JUCE keymap-editor) — editable shortcuts in MVP | **L** | Preferences |
| 33 | **Preferences** | `layout/PreferencesModal.tsx` | `PreferencesModal` / `components-layout-preferencesmodal` | mockup tabbed shell (Appearance/Audio/MIDI/Shortcuts) as `.neu-sculpt` | keep wired audio/OSC/MIDI-map settings; **build native gaps: audio-device enumeration + plugin scan/paths/format-toggles + Shortcuts tab** | **L** | shortcuts (v30), plugin-scan (v5) |
| 35 | **NeuPromptModal** | `layout/NeuPromptModal.tsx` | `NeuPromptModal` / `components-layout-neupromptmodal` | adopt any nicer detail from mockup on `.neu-sculpt` | keep wired single-field prompt | **S** | — |
| 34 | **About** | `layout/AboutModal.tsx` | `AboutModal` / `components-layout-aboutmodal` | **keep Element's** (verdict 34) — light token alignment only | version/JUCE/WebView + check-for-updates (keep) | **S** | — |

### Neu primitives (verdicts 8–17) — foundational, fast

| # | Component | Element file | Mockup id | Adopt | Effort |
|---|---|---|---|---|---|
| 8 | NeuKnob | `neu/NeuKnob.tsx` | `components-neu-knob` | **add purple (4th cat)** colour only; skip mockup readout string; keep dial/drag | **S** |
| 9 | NeuToggle | `neu/NeuToggle.tsx` | `components-neu-toggle` | use mockup green 'Active' toggle | **S** |
| 10 | NeuFader | `neu/NeuFader.tsx` | `components-neu-fader` | use mockup fader | **S** |
| 11 | NeuDisplay | `neu/NeuDisplay.tsx` | `components-neu-display` | use mockup display (small label / big value) | **S** |
| 12 | NeuButton | `neu/NeuButton.tsx` | `components-neu-button` | keep Element variants/colours; adopt mockup filled/solid **style** | **S** |
| 13 | NeuBadge | `neu/NeuBadge.tsx` | `components-neu-badge` | **keep Element's** format chips | **S** |
| 14 | NeuInput | `neu/NeuInput.tsx` | `components-neu-input` | **keep Element's** | **S** |
| 15 | NeuIcon | `neu/Icon.tsx` | `components-neu-icon` | **keep Element's** lucide allowlist | **S** |
| 16 | NeuEmptyState | `neu/EmptyState.tsx` | `components-neu-emptystate` | use mockup empty-board + round-icon | **S** |
| 17 | NeuSkeleton | `neu/Skeleton.tsx` | `components-neu-skeleton` | merge both shimmer sets (line/circle/card/block) | **S** |

> All neu primitives are leaf dependencies of nearly every panel above. They carry the `--cat-*`
> purple extension (v8) needed before Inspector/Block knob banks read all 4 categories correctly.

---

## 2. OUT / shelved / deferred — explicitly NOT ported (on record, not silently dropped)

Per CLAUDE.md decision **D3** and `mvp-bakeoff-plan.md` §5. These have live webview files but are
**out of the MVP port scope**. Hide-UI / keep-code: leave stores + C++ intact (reversible backlog).
**Do NOT assign port effort or wire them into new UI/nav.**

- `layout/DashboardBuilder.tsx`, `layout/MacroDashboard.tsx`, `layout/SceneLauncher.tsx`,
  `layout/QuickAccess.tsx` — **Dashboard/Macro/Scene system, shelved (D3).**
- `layout/SessionTree.tsx` — **rail-tree / SessionTree navigator, OUT of MVP** (nav is breadcrumb-only,
  plan §4). Module tier also OUT.
- `usePerformStore` / `nativePerform` / `usePerformStore`-driven branches — **Perform mode shelved**;
  strip from every ported component (global adaptation).
- `components/reactbits/BlurText.tsx` — **no verdict**; motion primitive, keep as-is (no port).

---

## 3. Coverage check — all 37 verdicts accounted for

Ports: 2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37 (36).
Verdict **1 (Block)** = DONE (reference pattern). → **37/37 verdicts mapped.** LiveHealth folds into
Inspector Health tab (v6); StatusBar = Bottom strip (v22); Breadcrumb = v24 (cross-cutting).

---

## 4. Recommended build ORDER (what unblocks what)

Ordered by dependency, not verdict number. Block (v1) is done.

1. **Neu primitives sweep (v8–v17)** — leaf deps of every panel; mostly S; unblocks all knob banks,
   buttons, badges, empties. Do the purple/v8 extension first (Block's `catToKnob` TODO depends on it).
2. **AppShell slot model (v23)** — the placement gate; every panel slots into it. Until this exists,
   panel ports have nowhere to live.
3. **Cable (v2)** — shares Block's port geometry; the other half of the canvas core; unblocks Edge
   menu / ConnectionEditor / BusInspector.
4. **Board / GraphCanvas (v3)** — hosts Block+Cable, trace spotlight, arrange toolbar; gate for
   Breadcrumb nested-chrome, Minimap, QuickAdd, context menus, CommentFrame.
5. **Breadcrumb + Navigation (v24)** ⭐ — Glen's flagged TOP priority; depends on Board's nested-board
   chrome being in place (depth ribbon/banner/EXIT live on the canvas).

Then, in rough order: Toolbar (v4) + BottomStrip (v22) into the shell slots → Plugin Browser (v5,
includes the #1 native scan/paths gap) → Inspector (v6) → QuickAdd (v27) + context menus (v28/v29) →
Command palette (v7) → Minimap (v21) → the dialog/secondary cluster (Snippets, VirtualKeyboard,
ScriptEditor, BlockTabStrip, Prefs+shortcuts, BusInspector, ConnectionEditor, modals). Multi-instance
(v19) runs parallel, gated on the Lane-A C++ registry, not on UI ports.
