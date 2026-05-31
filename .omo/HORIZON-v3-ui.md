# HORIZON — Element V3 UI (long-horizon objective tracker)

> Spans many sessions. Companion to `.omo/PROJECT-STATE.md` (state) +
> `.omo/bakeoff/VERDICTS.md` (build spec) + `.omo/plans/mvp-bakeoff-plan.md` (method).
> On UI-method conflict, VERDICTS + mvp-bakeoff-plan WIN over PROJECT-STATE §2/§3 (pre-bakeoff, stale).

## Objective

Ship the **V3 Instrument UI**: looks like the `mindful-studio` mockup (C), keeps every native
JUCE feature (A), runs on the real engine (B). Built by **cherry-pick best-of-{B,C} per component,
build-new where both weak (mandatory design tools), re-house every winner on Element arch**
(Zustand + JUCE bridge + React Flow). Method ratified in ADR-011.

- **Created:** 2026-05-30
- **Target date:** TBD — Glen to set. (No date in source; not fabricated.)
- **Branch:** `chromatic-ui-review` (not pushed). Tip `7c1aa509`.

## Current position (2026-05-30)

- **Bake-off COMPLETE** — all **37 component verdicts locked** (`VERDICTS.md`). Tally ~Element 5 ·
  Mockup 9 · Merge 19 · Adopt-model 4.
- **UI LOC shipped this objective = 0.** Pass-1 redesign was built, denied, reverted. Net code = 0.
- **Lanes run in PARALLEL now** (disjoint files `src/*.cpp` ‖ `webview/*.tsx`). CF1 = HARD SHIP
  GATE, **not** a start gate → the UI lane does NOT wait on the crash fix.
- Rig: both Storybooks (:6006 hub + :6008 mockup ref) need relaunch in a fresh session.

## Milestones

### M0 — Stabilise (C++ lane ‖, ship gate) — status: pending
- m0.1 **CF1** Element-AU crashes Logic (AX-peer use-after-free, `src/plugineditor.cpp`) — repro → fix → verify host stable. HIGH.
- m0.2 28-bug reconcile + new findings (close/triage P0/P1).
- m0.3 Numeric perf re-verify vs `audit/perf-baselines.md` on fresh build.
- m0.4 `test:all` 1058/0 + `ctest` green on fresh `build-merged`.
- **Exit:** crash-free standalone + plugin; tests green; perf in budget.

### M1 — V3 UI build (frontend lane ‖) — status: pending
Per-component: convert mockup→React on Element stores+bridge+RF per its verdict → wire →
neu tokens → Storybook story w/ `addon-designs` ref → verify (tsc -b · vitest storybook ·
**static** verify-stories · run-story-tests) → per-component Glen + Chromatic gate.

- m1.0 **Foundation** — app-shell slot model (verdict 23) + tokens; **task #9: env-gate/remove the
  `:6008` composition `refs` in `webview/.storybook/main.ts`** before any merge (breaks SB without mockup server).
- m1.1 **PILOT = Block** (Glen's call, 2026-05-30) — the merge-lighter Block end-to-end → method sign-off.
  Mockup knobs + B/M/S + labeled ports + active LED + type icon, on YOUR engine (real ports/params/zoom);
  DROP on-block RMS meter. **Prereq (pulls 1 C++ add forward into the pilot):** bridge **`category` emit**
  feeds the type-icon colour — schedule it first in the C++ lane so the pilot isn't blocked. Re-house clean
  (copy only pure `getChassisShape`); don't inherit mockup's 4 duplicate knobs. **← per-component Glen + Chromatic gate.**
- m1.2 **⭐ Nav model** (Glen TOP priority) — adopt mockup's ENTIRE enter/exit + nested-state UX:
  block dive-gesture + Board nested-canvas chrome (frame + depth ribbon + depth banner + EXIT) +
  depth-tinted breadcrumb. Cross-cutting (Block+Board+Breadcrumb) → its OWN milestone after pilot, NOT inside it.
- m1.3 **Core graph** — Block (merge-lighter) · Cable · Board (RF + trace + arrange toolbar).
- m1.4 **Criticality scale** — plugin scan/rescan/paths/format-toggles (**#1 native gap, no app without it**) →
  Browser → Inspector (docked tabs) → Toolbar (Edit-only) → QuickAdd → palette.
- m1.5 **Remainder of 37** — neu primitives (toggle/fader/display/knob-purple/button/skeleton/etc.) ·
  context menus + native-parity (`contextmenus.hpp`: Disconnect/Color/Oversample/Replace/Presets/…) ·
  Prefs (tabs + **keymap-editor** + device/scan) · Snippets · Minimap · BottomStrip · CommentFrame ·
  BusInspector · ScriptEditor · VirtualKeyboard · BlockTabStrip · About · modals ·
  **Multi-instance Branch-A** (in-process C++ registry, reuse `buildGraphSnapshotJson`).
- **Exit / SHIP:** all approved components live + wired, gates passed, M0 green.

### C++ adds that FEED the UI lane (small, in stabilise lane)
- G-29 Bus node (Package B hidden-arcs) + bridge **`category` emit** → feeds Block / BusInspector.
- Branch-A in-process instance registry (`static std::vector<PluginProcessor*>` + id/name + 1 bridge method).

## Open decisions (tee to Glen)
1. ~~Pilot component~~ **RESOLVED 2026-05-30: Block** (Glen). Pulls bridge `category` emit forward as prereq.
2. Target date for the objective. (still TBD)

## Drift watch
- If M0 (CF1) slips, UI lane must keep moving (parallel) — do NOT stall M1 behind the crash.
- Scope creep: the ~10 specialised node editors stay BACKLOG (MVP = generic param editor only). Re-confirm before building any.
- Doc drift: keep PROJECT-STATE §2/§3 pointing here; bakeoff docs are newer truth.

## Session log
- **2026-05-30** — Bake-off completed (37 verdicts). This session: created this horizon, reconciled
  PROJECT-STATE staleness (pointer note §2/§3), **Glen picked pilot = Block** (pulls bridge `category`
  emit forward). No code. **Next session:** relaunch both Storybooks → build m1.0 foundation + the
  `category` emit C++ add → convert Block end-to-end → Glen+Chromatic gate.
- **2026-05-30 (cont.)** — GOAP plan + anti-drift swarm spun up (`swarm-1780178137497-qayxef`, 6
  agents, 8 gates; plan `.omo/plans/v3-ui-goap-tasklist.md`). **A5 found already-shipped** (bridge
  `category` emit live `element_webview_host.cpp:4271` + `blockcategory.hpp`) → pilot unblocked, no
  C++ prereq. **Pilot Block — code-complete** (verdict 1) in `webview/src/components/canvas/Block.tsx`:
  ① header **B/M wired to real engine** (`toggleBypass`/`toggleMute`) + signal LED (`led-pulse`
  keyframe added); ② **on-block knobs = real** — live read off `useParameterStore` 15 Hz delta,
  real write via `nativeSetNodeParameter`→`elementSetNodeParameter`→`setValueNotifyingHost`; NeuKnob
  extended w/ `xs`+`compact` tiers (Glen's call); ③ **labeled ports** (`port.label`, inward, hidden
  when wireless bus). **S dropped** (Glen: no engine solo; don't fake). On-block RMS already absent.
  ✅ tsc clean (Block+NeuKnob) · ✅ unit 32/32. **NOT yet** built into Element.app / visually verified
  / Chromatic. **Next:** Block story states (knobs/B-M/labels) + addon-designs ref → fresh build+install
  (POST_BUILD bundle-copy gotcha) → separate-context verify (gate #8) → Glen + Chromatic gate.
- **2026-05-30 (autopilot)** — 3 autopilot iters: (1) env-gated the `:6008` SB composition ref
  (`main.ts`, task #9 done — opt-in `ELEMENT_SB_MOCKUP_REF`); (2) added pilot gate stories
  (PilotKnobs/Muted/LabeledPorts + addon-designs ref, 11/11 render-green); (3) **separate-context
  review (gate #8) = PASS-WITH-NITS** — 0 Critical/High, real-engine wiring verified end-to-end;
  fixed the 1 MEDIUM (knob labels were name-guesses "Gain/Mix/Freq" → now generic `P{n}`) + 1 LOW
  (story seed effect churn). tsc clean · units 32/32 · stories 11/11. Autopilot **disabled** — remaining
  work (fresh build+install, Chromatic, m1.0 slot-model) needs Glen. **Pilot = 98%, at the human gate.**
  Open LOW (Glen confirm): port labels now render on every standard-tier Block app-wide (verdict-1 intent — wanted everywhere?).
- **2026-05-31 (feedback round 1)** — Glen reviewed via in-SB 💬 panel (`ui-comments.jsonl`): UI elements
  overlapping / disproportionate / not context-aware (P1/P2) + muted/bypassed overlays too weak.
  **Systemic directive saved → memory `feedback_adaptive_contextual_layout`.** Reworked Block (screenshot-
  gated via `shot.mjs`): ① port labels moved OUTWARD to the canvas gutter, colour-coded chips, **reveal on
  hover/select** (no body overlap), truncated; ② latency/CPU → one **contextual** perf row (reveal-gated);
  ③ knobs xs 24→34px, centred, sized to body; ④ **muted = red+heavy+MUTED**, **bypassed = grey+heavy+
  BYPASSED** overlays (re-housed mockup), body-only so header B/M stay clickable. **Root-cause fix:** RF wraps
  nodes in `.react-flow__node { contain: content }` whose paint-clip hid outward labels/bus-badges/selection-
  glow → scoped override `.react-flow .react-flow__node-block { contain: layout style }` (index.css). Verified
  across clean/dense/muted/bypassed/labeled/4-category screenshots — no overlap. tsc clean · unit 33/33 (3
  state tests rewritten to new behavior) · stories 12/12. Pilot 97%, awaiting Glen feedback round 2.
- **2026-05-31 (roadmap merge)** — Merged the three post-Block audits (`component-port-roadmap.md`,
  `parity-vs-native.md`, `criticality-scale-plan.md`) into one sequenced plan →
  **`.omo/plans/v3-ui-execution-roadmap.md`**. Two lanes: **Lane A** (C++/bridge, single persistent
  worker — all natives funnel through `element_webview_host.cpp`, runs day 0 ahead of UI consumers)
  ‖ **Lane B** (36 React faithful-ports, fan out per wave after Block sign-off = GATE 0). 7 waves:
  W1 foundations (#8 CSS purple → #23 AppShell parallel; Lane-A scan backend S1–S3) · W2 neu
  primitives (~6 ∥) · W3 canvas core **hard-serial** Cable→Board→Breadcrumb · W4 shell panels
  (Inspector #6 is C++-free lead; Browser #5 fans in after scan backend) · W5 canvas interactions
  (~6 ∥) · W6 dialog cluster (widest, ~9 ∥) · W7 C++-gated consumers (#33 Prefs, #30 keymap, #19
  multi-instance). Chokepoint files that bound parallelism named (`useJuceBridge.ts` receiver block,
  `index.css` `.nodeblock-v3`, the host .cpp, `AppShell.tsx`). All 10 MISSING-mapped features placed;
  the 10 orphans carried as **Glen-decision proposals** (recommend: B1/B2→accept BACKLOG, A8/A9/S6→#33
  MIDI tab, M1/M2/M3 monitoring cluster = one scheduling decision). No code. **Next:** finish Block
  human gate (round 2) → spin up Wave-1 swarm.
