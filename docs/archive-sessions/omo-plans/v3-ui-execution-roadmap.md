# V3 UI — Sequenced Execution Roadmap (merged)

> **Status:** planning doc only. **READ-ONLY on code** — no edits to `src/`, `webview/`,
> `include/`, or CMake (other agents are building C++ + the webview concurrently). Authored 2026-05-31.
> **Merges three audits into one dependency-ordered plan:**
> - `.omo/plans/component-port-roadmap.md` — per-component port table + build order (the **spine**).
> - `.omo/audit/parity-vs-native.md` — MISSING/orphan parity set (where lost native features land).
> - `.omo/plans/criticality-scale-plan.md` — the #1 native gap (plugin scan) C++-gated critical path.
>
> **Build spec:** 37 locked verdicts (`.omo/bakeoff/VERDICTS.md`). **Method:** `.omo/plans/mvp-bakeoff-plan.md`
> (faithful port of the mindful-studio mockup, re-housed on Element's Zustand + JUCE-bridge + React Flow
> arch; mockup = design language, never architecture). **Objective:** `.omo/HORIZON-v3-ui.md`.
> **Reference pattern (SIGNED-OFF gate):** the V3 Block — `webview/src/components/canvas/Block.tsx`
> + the `.nodeblock-v3` design system in `webview/src/index.css` (`.neu-sculpt` / `.neu-sculpt-hover`
> / `.port-well` / `.neu-glow-*` / HSL `--cat-*`/`--sig-*`/`--status-*`). **Every component below
> faithfully ports the mockup using that same scoped vocabulary.** No fan-out wave starts until Glen +
> Chromatic sign off the Block (currently 97%, awaiting feedback round 2 per HORIZON session log).

---

## 0. Two lanes, three reconciliations

The work splits into two concurrent lanes that meet at integration:

- **Lane A — C++ / bridge backend.** New `element*` natives + host→JS push receivers. **All of it
  funnels through one file: `src/ui/element_webview_host.cpp` (+ its header).** The concurrent C++
  build lane is *already* in that file → **Lane A is single-owner and internally serial.** It has
  **no UI dependency**, so it starts at day 0, in parallel with everything else.
- **Lane B — React faithful-port UI.** The 36 component ports. Fans out into parallel waves once the
  Block is signed off, bounded only by the chokepoint files in §1.

Three reconciliations the three source docs never make explicit (resolved here):

1. **C++-gated features are TWO pieces, not one.** "Plugin Browser (#5)" = a **backend** half
   (scan natives + bridge, criticality-plan S1–S3 — Lane A, day 0) and a **UI** half (ToolPalette
   rebuild — Lane B, panel wave). The port-roadmap buries #5 "late"; the criticality plan starts its
   C++ at day 0. Both are right: **backend runs ahead, the UI consumer waits for its slot.** Same
   shape for keymap (#30) and multi-instance (#19).
2. **AppShell (#23) is a PARALLEL track, not a hard serial gate.** Port-roadmap calls it "the
   placement gate," but the criticality plan reskins ToolPalette/InspectorHub **in place** (their own
   files) without waiting on it — correct, because panel *internals* are disjoint from AppShell's
   *slot model* (`AppShell.tsx`). **Resolution:** panel reskins proceed in parallel with the AppShell
   rebuild; **only final slotting** (panels sitting in mockup slots) serializes after AppShell lands.
3. **Orphans get a proposed home, not a silent assignment.** The 10 at-risk native features
   (parity §4) each need a Glen decision (assign / schedule / accept-regression). They are carried
   here as **proposals teed to Glen**, not committed wave items.

### Chokepoint files — these bound every parallel wave
Components with different verdict numbers still collide if they share a file. Single-owner or serialize:

| File | Why it serializes | Rule |
|---|---|---|
| `src/ui/element_webview_host.cpp` (+hpp) | the entire Lane-A bridge funnels here; concurrent C++ lane already in it | **single owner; author all new natives sequentially** |
| `webview/src/hooks/useJuceBridge.ts` | every host→JS push receiver lands in the one `ElementNativeHooks` type (l.397) + one `window.__elementNative={...}` block (l.424) | **single owner per integration batch** |
| `webview/src/index.css` (`.nodeblock-v3`) | v8's purple-category extension edits the shared token block | **do v8 FIRST, serially; then ports fan out** |
| `webview/src/components/layout/AppShell.tsx` | the slot-model rebuild | **single owner (#23)** |

---

## 1. Wave-by-wave plan

Fan-out model: **barrier between waves** (a wave's chokepoint-file edits land + tsc/stories green
before the next fans out), **continuous within a wave** (disjoint-file ports run as parallel
faithful-port workflows). Lane A runs continuously underneath, gated only by its own single-file serialization.

### GATE 0 — Block sign-off (BLOCKS all fan-out)
Block (#1) is code-complete + screenshot-verified (HORIZON). **No Lane-B wave fans out until Glen +
Chromatic approve.** Lane A may start immediately (no UI dep).

### Wave 1 — Foundations (serial-ish; unblocks the field)
Order matters here; small.
1. **Neu purple/category token extension (#8)** — edit `.nodeblock-v3` in `index.css` to add the 4th
   (purple/modulator) category to NeuKnob; clears Block's `catToKnob` TODO. **Serial — touches the
   shared CSS chokepoint. Must land before any panel reads all 4 categories.**
2. **AppShell slot model (#23)** — single owner, rebuild on mockup's slot primitive
   (topBar/leftRail/main/rightRail/bottomBar). **Parallel track** — starts now, runs alongside Waves
   2–3; panels only *slot into* it once it lands. Strip the Perform layout branch (`usePerformStore`).
- **Lane A (parallel):** begin the plugin-scan backend — criticality-plan **S1** (6+1 natives +
  timer push in `element_webview_host.cpp`) → **S2** (`nativePluginScan.ts` + tests) → **S3**
  (`useJuceBridge` receivers + `useScanStore` + split `usePluginBrowserStore.applyListPayload`).

### Wave 2 — Neu primitives fan-out (clean parallel)
After #8's CSS edit lands. Each primitive is its own file in `neu/` → **fan out as N parallel
faithful-port workflows**: #9 NeuToggle, #10 NeuFader, #11 NeuDisplay, #12 NeuButton (filled style),
#16 NeuEmptyState, #17 NeuSkeleton. (Keep-yours, near-zero: #13 NeuBadge, #14 NeuInput, #15 NeuIcon.)
All **S**. These are leaf deps of every panel below.

### Wave 3 — Canvas core (HARD SERIAL chain)
Cannot parallelize — each depends on the prior:
1. **Cable (#2)** — shares Block's port geometry; the other canvas half. (M)
2. **Board / GraphCanvas (#3)** — hosts Block+Cable; adds select-to-trace spotlight + floating
   arrange toolbar (covers parity G15 auto-arrange). (L)
3. **Breadcrumb + nested-board navigation (#24) ⭐** — Glen's flagged TOP priority; nested-canvas
   chrome (frame / depth-ribbon / depth-banner / EXIT) lives on the canvas, so it needs Board first.
   Covers parity G16/G17. (L)

### Wave 4 — Shell panels (parallel reskins; slot after AppShell)
All **reskinned in place** (own files, disjoint) → **fan out**. Final slotting serializes behind AppShell (#23).
- **Toolbar (#4)** — fresh Edit-only top bar, drop EDIT/PERFORM toggle, mockup filled buttons. (M)
- **Bottom strip (#22)** — mockup transport + master meter; wire real `useEngineSnapshotStore`. (M)
- **Plugin Browser UI (#5)** — ToolPalette rebuild: mockup search-first list + filter chips + **the
  scan/rescan/paths controls** (consumes Lane-A scan backend; criticality-plan S4). **C++-gated:
  waits for Lane-A S3.** (L)
- **Inspector (#6)** — docked tabbed shell (Block/Bus/Cable/Health); data already wired, reskin only;
  **no C++ dep — runs fully parallel** (criticality-plan P1). LiveHealth folds into Health tab. (L)

> **Integration note:** Plugin Browser + any other panel adding push receivers must batch their
> `useJuceBridge.ts` edits under one owner (chokepoint).

### Wave 5 — Canvas interactions (parallel after Board)
Disjoint files, all depend on Board (#3) / Cable (#2) → **fan out**:
- **QuickAdd (#27)** (M) · **NodeContextMenu (#28)** — merge action sets + **add native-parity items**
  (Disconnect submenu, Color, Oversample, Replace, Connect-via, full Presets/program — parity
  P10/P11/P12/G12/G13/G14) (M) · **EdgeContextMenu (#29)** (S) · **CommentFrame (#26)** (S) ·
  **Minimap (#21)** restyle (S) · **Command palette (#7)** — 4-mode bar, drop scene/perform (M).

### Wave 6 — Secondary / dialog cluster (CLEANEST fan-out)
Self-contained, disjoint files → **fan out as the largest parallel wave of independent faithful-port
workflows**: **ConnectionEditor (#31)** (S) · **BusInspector (#32)** (S) · **Snippets/presets (#20)**
merge single+group (M) · **VirtualKeyboard (#18)** re-add velocity + MIDI bridge (M) ·
**BlockEmbed (#25)** (S) · **ScriptEditor (#36)** (M) · **BlockTabStrip (#37)** (S) ·
**NeuPromptModal (#35)** (S) · **About (#34)** keep-yours, token align (S).

### Wave 7 — C++-gated consumers + prefs (Lane-A-dependent)
These wait on their Lane-A backend halves:
- **Preferences (#33)** — tabbed shell + **Plugins tab** (paths + format toggles + scan; criticality
  S5, consumes Lane-A scan backend) + **Shortcuts tab**. Covers parity P5/P6, A1/A2/A3. (L)
- **Keyboard shortcuts (#30)** — `?`-overlay **+ keymap editor** (parity A7; resurrect native JUCE
  keymap-editor via a new Lane-A bridge fn). **C++-gated.** (L)
- **Multi-instance / Mirror (#19)** — InstanceSwitcher + MirrorPanel. **Gated on a Lane-A Branch-A
  in-process C++ registry** (reuses `buildGraphSnapshotJson`), NOT on UI ports → its Lane-A piece can
  start any time; the UI lands here. Defer InstancesPanel roster polish post-MVP. (L)

---

## 2. Where each MISSING native feature lands

**MISSING-mapped (a verdict owns it — built in the waves above):**

| Parity ref | Feature | Lands in | Wave |
|---|---|---|---|
| P4/P5/P6 | Plugin scan/rescan · search paths · format toggles | #5 (browser scan controls) + #33 (Plugins tab) | Lane A → Wave 4/7 |
| P10/P11/P12, G12/G13/G14 | Replace · Oversample · full Presets · Color · Disconnect · Connect-via | #28 NodeContextMenu | Wave 5 |
| A7 / B4 | Key-command customisation (keymap editor) + `?`-overlay | #30 (+ #33 Shortcuts tab) | Wave 7 (C++-gated) |
| A4 | Virtual-keyboard velocity control | #18 | Wave 6 |
| M4 | Multi-instance / mirror | #19 | Wave 7 (C++-gated) |
| G8 | Insert-plugin-into-wire (inline) | #2 Cable | Wave 3 |
| G15 | Auto-align / arrange toolbar | #3 Board | Wave 3 |
| G16/G17 | Breadcrumb + nested-board nav | #24 | Wave 3 |
| B3 | Connection grid / patch matrix (partial) | #31 ConnectionEditor + #32 BusInspector | Wave 6 |

**MISSING-orphan (NO verdict owns it → Glen-decision, proposed homes — see §3).**

---

## 3. Orphan at-risk set — PROPOSALS teed to Glen (not auto-assigned)

These 10 native UI features ship today but have **no verdict**. Per parity §4 each needs an explicit
decision: **assign / schedule / accept-regression.** Proposed homes (plain terms, for Glen to ratify):

| # | Orphan | Plain description | Proposed home | Effort if assigned |
|---|---|---|---|---|
| 1 | Meter bridge (M1) | per-interface-channel input/output level meters | extend #22 Bottom strip *or* new monitoring panel | M–L |
| 2 | Graph mixer port (M2) | a fader mixer per node; today only opens the **native** window | confirm native-window stopgap OK for MVP, *or* schedule a React port | L |
| 3 | External MIDI clock sync (A8) | follow incoming MIDI clock | extend #33 Preferences → MIDI tab | S–M |
| 4 | MIDI clock send (A9) | send MIDI clock out | extend #33 Preferences → MIDI tab | S–M |
| 5 | Keyboard splits (A10) | per-range note routing | extend #18 VirtualKeyboard *or* #33 | M |
| 6 | Velocity curves (A11) | editable velocity-response curves | extend #18 *or* #33 | M |
| 7 | Controller file .elc (S6) | save/load MIDI-map files | extend #33 → MIDI tab | S |
| 8 | Per-node CPU + xrun (M3) | per-block CPU load + xrun indicator | extend #22 *or* Block overlay | M |
| 9 | MIDI Program Map editor (B1) | specialised native node editor | **confirm BACKLOG** (HORIZON: MVP = generic editor only) | — |
| 10 | MIDI Set List editor (B2) | specialised native node editor | **confirm BACKLOG** | — |

**Recommendation:** ratify B1/B2 as accepted BACKLOG now (matches HORIZON drift-watch); route A8/A9/S6
into the #33 MIDI tab (cheap, single panel); decide M1/M2/M3 (the monitoring cluster) as one bundle —
these are the only orphans large enough to need a real schedule slot.

---

## 4. Recommended swarm-execution shape

- **GATE 0 = the only hard human gate before fan-out.** Block sign-off (Glen + Chromatic).
- **Lane A (C++/bridge): a single persistent worker**, never fanned out — every new native edits the
  one host file. It runs continuously from day 0, *ahead* of its UI consumers.
- **Lane B (React ports): fan out per wave, barrier between waves.** Within a wave, each disjoint-file
  port is one **faithful-port workflow** (mockup `:6008` story → reskin on `.nodeblock-v3` → preserve
  the listed Zustand/bridge wiring → strip Perform → tsc + `verify-stories` + Storybook MCP
  `run-story-tests` → Chromatic). Recommended fan-widths:
  - **Wave 1:** serial (CSS #8 then AppShell #23 as a parallel solo track).
  - **Wave 2:** up to ~6 parallel (neu primitives).
  - **Wave 3:** **serial=1** (Cable→Board→Breadcrumb hard chain — do NOT fan out).
  - **Wave 4:** ~4 parallel reskins; **Inspector #6 is the safe lead** (no C++ dep); Plugin Browser
    #5 fans in only after Lane-A scan backend (S3) is green.
  - **Wave 5:** ~6 parallel (canvas interactions, all post-Board).
  - **Wave 6:** widest fan-out (~9 parallel) — the dialog/modal cluster, fully disjoint.
  - **Wave 7:** ~3, each fanned in behind its Lane-A backend half.
- **One serialization rule overrides fan-out:** any two ports in the same wave that both add
  `useJuceBridge.ts` receivers (or both edit `index.css`) get a **single owner** for that file — split
  the receiver edits into one integration commit, not N parallel ones.

### Critical path (longest serial chain)
`Block sign-off → #8 CSS → Cable(#2) → Board(#3) → Breadcrumb(#24)` on Lane B, with
`scan natives(S1) → bridge(S2/S3) → Plugin Browser(#5) / Preferences(#33)` as the parallel Lane-A
critical chain. The two chains converge at integration; neither blocks the other until then.

---

*Grounded in the three source plans + verified chokepoints (`useJuceBridge.ts` l.397/424 single
receiver block; `index.css` `.nodeblock-v3`; `element_webview_host.cpp` single bridge file). Read-only;
no code modified.*
