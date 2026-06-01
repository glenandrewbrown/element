# FINISH-APP PLAN — Element V3: all 37 components + Bitwig-grade reliability → Ship

> **STATUS: ✅ RATIFIED BY GLEN — EXECUTING (2026-06-01). Wave 0 launched: R-SPIKE (worktree, 3-day timebox) ‖ UI-HIDE ‖ W0-TOKENS ‖ release build.** (v5 = v4 + code-verified Architect fixes + Critic fold-ins.) Two full consensus loops: [scope-A] Planner→Arch(SWC)→Critic(ITER)→Critic(APPROVE); [Glen-corrected scope] v4→Arch(SOUND-WITH-CHANGES)→v5→**Critic APPROVE** (zero CRITICAL, every code claim verified true).
> v4 rebuilt after Glen corrected scope (2026-06-01): MVP = **all 37 bake-off verdicts built + integrated + FULLY REAL (no placeholder)**, gated on **full Bitwig-grade reliability incl. out-of-process plugin editor GUI**. Baseline = `local-enhancements` (chromatic-ui-review = +20 commits). HEAD `c4e7c61a`.
> Prior v1–v3 (5-component "Edit-mode slice") were built on the RECOVERY-PLAN's un-ratified re-scope — **superseded**. The bake-off (`bakeoff/VERDICTS.md`, all 37 locked) + this plan are canonical.

---

## 0. Verified ground truth (fresh code audit, this session)

**Baseline:** `chromatic-ui-review` = `local-enhancements` + 20 commits. local-enhancements = working app (React webview wired, runtime audits, boot/blank fixes). NOT 348-ahead-of-main.

**Glen's locked decisions (2026-06-01):** Reliability = **Full Bitwig before ship** · Verdicts = **all 35 stand + VU-on/Solo-off** · **Hide** Perform/Macro/Dashboard/Scene · **Reliability gates ship** · Stereo = **two L/R ports** · Build = **background-only**.

**37-component state (audited):** ~20 DONE+real · ~9 PARTIAL · 3 NOT-STARTED. See §3 backlog.

**Fake/placeholder data (the #1 historical failure — "beautiful but doesn't work"):**
| Item | Evidence | Fix |
|---|---|---|
| Block VU permanently idle | `Block.tsx:992-1001` RmsMeter gets no `level` (defaults 0) | per-block level bridge (`Q-VU-PER-BLOCK`) |
| BlockEmbed meter = 0, spectrum = fake static curve | `BlockEmbed.tsx:212-256,349-363` | meter bridge + FFT bridge (or drop spectrum until real) |
| MacroDashboard knobs fake + read-only | `MacroDashboard.tsx:137-163`, `usePerformStore.ts:96` | **hidden** (shelved, Glen) — removes in one move |
| LiveHealth INPUT meter dead | `LiveHealth.tsx:96-105` (`Q-VU-INPUT`) | input-meter bridge |
| Master VU L==R, per-node CPU=0 | `useJuceBridge.ts:41-43` (`Q-VU-LR`, per-node CPU) | L/R + per-node CPU bridge |
| Demo graph | `useGraphStore.ts:40-45` | safely double-gated (DEV+env) — fine |

**Reliability reality:** Element's out-of-process sandbox (`sandboxhost.hpp`/`sandboxworker.hpp`/`sandboxipc.hpp`) is **fully built + tested but DEAD CODE** — default OFF, `shouldSandboxPlugin()`/`createSandboxedGraphNode()` have **zero callers** (`graphmanager.cpp:318` createFilter never branches to sandbox). Every plugin runs in-process → a plugin crash kills Element today. Recovery design exists (heartbeat, auto-restart+state-restore, ~70% stress recovery) but unwired + no crash UI. Sandbox has **zero editor plumbing**. CF1 (Element-AU crashes Logic via AX use-after-free in teardown) is a **class** — same UAF still open on child plugin windows (`pluginwindow.cpp:320`); fix unverified; installed plugin stale `2.2.0`.

**Out-of-process editor (the long pole):** seam = `nodeeditorfactory.cpp:218`. macOS has **no public cross-process view embed** except **AUv3 RequestViewController** (JUCE already implements → AU = S–M). VST3/CLAP/AU2 need **CARemoteLayer/CALayerHost** (private API) + manual input/focus/IME/resize forwarding = **L–XL bespoke subsystem**; even REAPER ships this "best-effort, may not work with all plugins." Tracer-bullet spike required before committing.

---

## 1. RALPLAN-DR

### Principles (ranked)
1. **Nothing fake — ever.** A component is DONE only when it shows REAL engine data via the JUCE bridge. No stub/idle/placeholder in the shipped app. (This has been the #1 failure: beautiful UI that doesn't work.) **Mechanically enforced, not by manual audit:** an interaction test feeds a signal and asserts the meter reads > 0; a lint fails if a meter/level primitive renders without a store-bound `level`/`value`. Human eyeballing missed this 8×; CI must catch it.
2. **See before you claim.** No "done" without `shot.mjs` evidence + stories-mount-green + review-wizard pass. (8 prior denials = couldn't *see* quality.)
3. **All 37 verdicts, exactly as locked.** Build to `bakeoff/VERDICTS.md` (35 as-locked + VU-on/Solo-off). No re-scope, no silent cuts, no silent additions.
4. **Reliability is a co-equal ship pillar, Bitwig-grade.** A crash — in a hosted plugin OR in Element-as-plugin — must not kill Element or its host. Out-of-process plugins incl. editor. Ship-gated.
5. **Keep every native feature; architecture held constant.** Three-UI rule (look=mockup C, keep every native-JUCE feature A, run on B's React/Zustand/JUCE-bridge/React-Flow engine). Mockup supplies design + pure-logic only, never architecture.
6. **One continuous chassis.** Neumorphic coherence outranks per-component local fidelity → shared tokens frozen first; lead coherence pass before Glen.
7. **De-risk the long pole first.** The out-of-process editor is XL + private-API + "may not work with all plugins." Prove the tracer bullet before committing the full build.

### Decision drivers (top 3)
1. **Finish to a real, shippable instrument** — all 37 real + reliable. ASAP, but "real + reliable" is non-negotiable over speed.
2. **No host/self crashes** — 99% plugin use; Bitwig-grade isolation.
3. **No 9th UI rejection** — proven designer→lead-screenshot→Glen-wizard gate; mandatory design tools.

### Viable options (≥2)
- **A — Full V3 + Full Bitwig reliability before ship (CHOSEN — Glen).** All 37 real + out-of-process incl. editor + CF1 class closed. Largest scope; matches the owner's bar.
- **B — Phased reliability (crash-safe processing now, editor isolation fast-follow).** ❌ **Rejected by Glen explicitly** (chose "Full Bitwig before ship" over this). Retained only as the fallback if the editor spike proves the XL tier infeasible in acceptable time → re-decision to Glen.
- **C — UI-complete first, harden reliability after.** ❌ Rejected by Glen ("reliability gates ship").
- **D — Greenfield UI from mockup.** ❌ Discards working wiring; violates Principle 5.

*Invalidation:* B/C deliver less than the owner's stated bar; D is slower and violates the architecture mandate. A is the owner's explicit choice. **Honest note:** A is a multi-pillar program, not a quick MVP — the out-of-process editor alone is weeks of bespoke macOS subsystem work. The spike (REL-SPIKE) is the early go/no-go that could force a B re-decision.

### Pre-mortem (deliberate — 3 scenarios)
1. **Out-of-process editor doesn't work for real plugins** (REAPER's "may not work with all plugins"; private-API breakage; input/focus/IME/resize/**teardown-across-dying-process** rabbit hole). → reliability ship-gate unmeetable. **Mitigation:** R-SPIKE tracer bullet FIRST against ≥3 real commercial VST3/CLAP + AU; AUv3 tier (Apple-supported) as the guaranteed subset; **numeric go/no-go — if the spike's HARD criteria (crash-while-editor-open · close-while-crashing · focus round-trip vs live webview · AU+VST3 in one session) are not ALL green within its timebox, Option-B fallback AUTO-ESCALATES to Glen**: ship crash-safe processing (R1–R3, R8) **WITH AU-first sandbox default-ON (scoped R6 — otherwise isolation is available-but-OFF and NOT actually crash-safe)** + REAPER-style separate-window editor for hard plugins; the R8 crash-injection harness runs against the default-ON config.
2. **9th UI rejection / fake data ships.** → trust collapse, the historical failure. **Mitigation:** Principle-1 hard gate (real-data check per component) + Principle-2 screenshot/story-mount gate + mandatory design tools + lead coherence pass before Glen.
3. **Scope never converges** (37 components × real-data × reliability program = sprawl). **Mitigation:** strict per-component done-criteria; 3 pillars tracked independently; ship = explicit checklist (§4); reliability spike bounds the unknown early; weekly Glen-batched review cadence.

### Expanded test plan (deliberate)
- **Unit:** 0-new-vitest-fails per component; fix/quarantine 115 `__tests__` tsc errors + brittle vitest in STABILISE; sandbox unit suites (`test/engine/Sandbox*`) stay green; quarantine corrupted-batch C++ tests.
- **Integration:** wired loop (session save/load + add-block→audio + transport) re-verified on fresh build; **sandboxed-plugin loop** (load/process/param/state/bypass round-trip through worker) green; per-component real-data assertions (meter reflects signal, not 0).
- **E2E / interaction:** `run-story-tests` (interaction + a11y) per component; all touched stories mount green pre-wizard; drive lovable preview for nav/cable/trace; Glen wizard per component.
- **Reliability / observability (the new bar):** **crash-injection harness** — SIGKILL a hosted plugin worker, assert Element survives + shows "plugin crashed — reload" + recovers state; editor crash isolated; CF1 host-verify protocol (VoiceOver ON, ≥20 open/close, save-with-editor-open, AU/AU-FX/AU-MFX, zero new `.ips`) AFTER fresh build+install; out-of-process editor verified live against ≥3 real commercial plugins per format.
- **Ship:** fresh build **installed** + launched; nothing fake (audit re-run clean).

---

## 2. Program structure — 3 ship-gating pillars (run in PARALLEL)

```
PILLAR 1  UI-COMPLETE   (webview/*.tsx)        all 37 verdicts, real, gated
PILLAR 2  REAL-DATA     (C++ bridge + engine)  kill every fake; build missing wires
PILLAR 3  RELIABILITY   (C++ sandbox/editor)   Bitwig-grade; LONG POLE
   + STABILISE          (tests/perf/cleanup)   supporting, parallel
SHIP = ALL THREE pillars done + verified.  Critical path = PILLAR 3 (out-of-process editor).
```

Pillars 1 & 2 are coupled (real-data wires feed UI components); Pillar 3 is mostly disjoint C++ (sandbox/editor/teardown) and is the schedule definer.

---

## 3. Work breakdown (with agent / tools / done-when)

### PILLAR 1 — UI complete (per-component designer→lead-screenshot→Glen-wizard gate; mandatory tools **Stitch+ui-ux-pro-max+uiverse+image-gen**)
**Quick win first:** **UI-HIDE** — strip Perform/Macro/Dashboard/Scene from `App.tsx` + nav (`executor`; removes the fake dead Macro knobs; code/stores stay). Done-when: shelved UI not mounted; D3 satisfied.

**~20 DONE (verified real) — HOLD, re-verify Wave 3:** Cable, Board/canvas, CommandPalette, NeuToggle/Fader/Display/Button/Badge/Input/Icon/EmptyState/Skeleton, VirtualKeyboard, Snippets(SnippetShelf), Minimap, AppShell, CommentFrame, EdgeContextMenu, ConnectionEditor, BusInspector, About, NeuPromptModal, ScriptEditor, BlockTabStrip, BottomStrip(=StatusBar+shelf).

**~9 PARTIAL — finish to verdict (`designer`, +`executor` for native wiring):**
| ID | Component (#) | Gap | Done-when |
|---|---|---|---|
| U1 | Block (#1) | VU fed REAL level (Pillar-2 `Q-VU-PER-BLOCK`); confirm B/M (Solo off), stereo L/R ports | VU animates on signal; ports stereo |
| U2 | ⭐ Breadcrumb+Nav (#24) | MISSING nested chrome — nested-canvas-frame + left depth-ribbon + animated depth-banner "Nested·Level N·{board} inside {parent}" + EXIT; depth-tinted pills (port mockup CSS `.nested-canvas-frame/.depth-ribbon/.depth-banner-in/--depth-0..4`). On existing `string[]`+`navigateToBreadcrumb(index)` | full nested-state UX; wizard pass |
| U3 | Toolbar (#4) | Edit-only layout (drop EDIT/PERFORM toggle); fix SAMPLE mislabel (`Toolbar.tsx:421`) | Edit-only; real SR field |
| U4 | Plugin Browser (#5) | in-panel scan/rescan/paths/format-toggles (native gap #1) | scan UI wired to real scanner |
| U5 | Inspector (#6) | exact tab split Block/Bus/Cable/Health | tabs match verdict |
| U6 | QuickAdd (#27) | port-type-aware filter ("ADD BLOCK ACCEPTING <type>") | type-filtered on port drag |
| U7 | NodeContextMenu (#28) | native-parity: Disconnect/Color/Oversample/Replace/Connect-via/Presets(full)/Enable | all native items present + wired |
| U8 | Preferences (#33) | tabbed Appearance/Audio/MIDI/Shortcuts + device-enum + scan/paths | tabbed shell + real settings |
| U9 | KeyboardShortcuts (#30) | ?-overlay (real shortcuts) + **keymap editor** (resurrect native JUCE keymap-editor in Prefs/Shortcuts) | editable key-commands persist |

**3 NOT-STARTED — build (`designer`+`executor`):**
| ID | Component (#) | Scope | Done-when |
|---|---|---|---|
| U10 | NeuKnob purple (#8) | add modulator/purple to color set (`NeuKnob.tsx:3-7,41`); retire dead-taxonomy comment | purple knob renders |
| U11 | Multi-instance (#19) | InstanceSwitcher + MirrorPanel (read-only) on Branch-A in-process registry (C++: `std::vector<PluginProcessor*>` + `buildGraphSnapshotJson`) | live switch/mirror real data |
| U12 | (keymap editor — see U9) | — | — |

### PILLAR 2 — Real data (kill every fake; `executor` opus, RT-safe; files `element_webview_host.cpp`, `useJuceBridge.ts`, new stores)
> Interface-first: freeze each payload (clone the proven `useCableMeterStore` epsilon-diff+rAF pattern **verbatim** incl. length-guard+`LEVEL_EPSILON`).
| ID | Wire | Feeds | Effort |
|---|---|---|---|
| D1 | **Fast path:** Block VU = **max(level) over the block's outgoing edges** from the EXISTING `useCableMeterStore` (keyed by edgeId) 60Hz stream (unblocks U1 NOW, no new C++); blocks with **zero outgoing edges show idle + are EXCLUDED from the Principle-1 signal→meter>0 lint** until the follow-up lands. **Correctness follow-up:** per-block RMS (`Q-VU-PER-BLOCK`)→`useNodeMeterStore` covers terminal/unconnected blocks | U1 Block VU, BlockEmbed meter | fast=S, full=S–M |
| D2 | input metering (`Q-VU-INPUT`) | LiveHealth INPUT | S–M |
| D3 | per-channel L/R split (`Q-VU-LR`) | master VU | S |
| D4 | per-node CPU (engine measure) | Inspector per-node CPU | M |
| D5 | spectrum/FFT stream | BlockEmbed spectrum (else drop until real) | M–L |
| D6 | macros hydration | N/A — MacroDashboard hidden (UI-HIDE) → **drop** | — |

### PILLAR 3 — Bitwig-grade reliability (LONG POLE; `debugger`+`executor` opus + `architect` for R5 design; C++/JUCE/macOS)
> **Sequencing (Architect-corrected):** R1-min + W0-EDITOR-CONTRACT precede R-SPIKE (the spike needs a live worker hosting a real plugin + the compositing seam). R8 runs EARLY (against R1–R3) so processing-crash-safety is proven independent of the editor → the B-fallback is a shippable state. R5-teardown is UNIFIED with R7 as ONE AX-teardown-ordering discipline.

| ID | Task | Done-when | Effort |
|---|---|---|---|
| **R1-min** | Minimal sandbox route: `createFilter`→`createSandboxedGraphNode` for ONE test plugin (or instantiate `SandboxedProcessorNode` directly) so a worker actually hosts a plugin | one plugin runs in a worker | S |
| **W0-EDITOR-CONTRACT** | (`architect` owns + ratifies) Freeze the editor compositing+focus SEAM: the `Component` adapter BOTH tiers produce (AU `RequestViewController` view / VST3-CLAP `CALayerHost` proxy) + a single **z-order/focus arbiter** in the embed region mediating webview↔embed-editor first-responder. Both drop into the existing `pluginEmbedEditor` slot (`element_webview_host.cpp:3837-3912`). | interface frozen + builds green; ONE seam, not two divergent paths | S–M |
| **R-SPIKE** | **Tracer bullet — GATES editor build; needs R1-min + W0-EDITOR-CONTRACT.** Worker publishes editor NSView via `CAContext`→host `CALayerHost` at `nodeeditorfactory.cpp:218`. **HARD criteria (ALL must pass):** interactive (mouse/key/IME/resize forwarded) · **crash worker WHILE editor open → host survives + region blanks** · **close-editor-while-worker-crashing race clean** · **focus round-trip with live webview present** · **one AU + one VST3 in ONE session**. vs ≥3 real commercial plugins/format. | all HARD criteria green → lock R5 approach; OR timebox hit → B-fallback auto-escalates to Glen | M (timebox: **3 working days**) |
| R1 | Full wire: `createFilter`→`shouldSandboxPlugin`→`createSandboxedGraphNode` | sandboxed plugins route through worker | S–M |
| R2 | Fix real-AU load-time message-thread hang (BRASS_4Horns) — blocker to default-on | real AUs load sandboxed without hang | M |
| R3 | Crash-recovery UX: surface `sandboxCrashed`/`Restarted`/`Error` → webview; "plugin crashed — reload" on Block; wire `restartSandbox()` | crash shows UI + manual reload | M |
| **R8** (EARLY) | Crash-injection harness vs R1–R3 (processing only): SIGKILL worker → Element survives + recovers + crash UI; worker load-watchdog; raise ~70%→rock-solid. Proves crash-safe PROCESSING **before R5 exists**. | host survives+recovers, editor-independent | M |
| R4 | Editor AU tier: **AUv3 (+ AU2 that support RequestViewController)** via Apple RequestViewController (JUCE-supported) through the W0-EDITOR-CONTRACT adapter — the Apple-guaranteed subset; AU2 without RVC falls to the R5 / separate-window path | AUv3 plugins show isolated editor | S–M |
| R5 | Editor VST3/CLAP tier: CARemoteLayer cross-process editor + input/focus/IME/resize forwarding (per R-SPIKE approach), **incl. cross-process teardown ordering (unified w/ R7)** | VST3/CLAP show isolated editor, teardown-safe | **L–XL** |
| **R5+R7 teardown** | ONE AX-teardown-ordering discipline (pattern = `plugineditor.cpp:356-366`) across in-process (R7: `~PluginWindow` `setAccessible(false)` `pluginwindow.cpp:320` + CF1 host-verify + systematic AX pass) AND cross-process (R5: host `CALayerHost` survives worker death without UAF). `debugger`-led. | CF1 class closed (zero new `.ips`) + cross-process editor teardown UAF-free | M |
| **R6** ⚠boundary | Default-on isolation (AU-first, then all) once R1–R5 land — **ARCHITECTURE-BOUNDARY event**: changes execution semantics for EVERY plugin (+1-buffer IPC latency, IPC state round-trip, pass-through bypass `sandboxedprocessor.hpp:244,268`). Gate behind full sandboxed-loop integration suite + **IPC-latency perf re-verify** + Pillars-2&3 JOINT integration + **R8 crash-injection re-run against default-ON** | sandboxed-by-default; integration + perf + R8 green; revert = settings flag (trivially reversible) | M *(was mislabeled S)* |

### STABILISE (supporting, parallel; `test-engineer`/`executor`)
S1 ctest triage (29 fails = test-side; quarantine corrupted batch; engine-green) · S2 fix/quarantine 115 webview `__tests__` tsc errs + brittle vitest · S3 perf session-drift runtime verify (Glen 20-min repro + `scientist`) · S4 confirm `:6008` env-gating (`main.ts:6-19`, confirm-only) · S5 fresh build+sign+install (background, for CF1 + final).

---

## 4. Acceptance — "finished" (ALL must hold)
**UI:** all 37 verdicts built to spec + each Glen-wizard + Chromatic + coherence pass + stories-mount-green. **Real:** fake-data audit re-run CLEAN (no idle/stub/placeholder); every meter/stat reflects real engine. **Reliability:** sandbox default-on; SIGKILL-a-plugin → Element survives + recovers + shows crash UI; out-of-process editor live for AU + VST3 + CLAP (≥3 real plugins each); CF1 class closed + host-verified (zero new `.ips`). **No-regression:** session save/load + add-block→audio + transport on fresh build. **Tests:** engine-green; webview build exit 0. **Ship:** fresh build INSTALLED + launched.

---

## 5. Ultra-parallel execution design

### File-ownership (parallel-safe)
- **Pillar 1 disjoint .tsx (concurrent designers):** `Cable`(hold)·`ToolPalette`(U4)·`InspectorHub`(U5)·`Toolbar`(U3)·`QuickAddPopup`(U6)·`NodeContextMenu`(U7)·`PreferencesModal`(U8)·`NeuKnob`(U10) — disjoint files, parallel. **Serialised on `GraphCanvas.tsx`:** U2 Breadcrumb nested-chrome (after any Board touch). `App.tsx` UI-HIDE = single owner, early.
- **Pillar 2 C++:** `useJuceBridge.ts` + new `useNodeMeterStore.ts` + the meter-emit region of `element_webview_host.cpp`. ⚠️ **`element_webview_host.cpp` is touched by 3 workstreams** (P2 meter-emit ~4396 · P3 editor-compositing ~3837-3912 · breadcrumb hydration) → **split into `*_meters.cpp` / `*_pluginembed.cpp` TUs in WAVE 0** before fan-out (split gate: 3 TUs compile + build green BEFORE Wave 1); until split, it is a shared serialization point with sub-locks per region.
- **Pillar 3 C++ (disjoint from P1/2 EXCEPT the editor-compositing region of `element_webview_host.cpp` — see above):** `sandboxhost/worker/ipc.hpp`, `nodeeditorfactory.cpp`, `graphmanager.cpp`, `pluginmanager.cpp`, `plugineditor.cpp`, `pluginwindow.cpp`. R-SPIKE in a **worktree** (prototype isolation).
- **Shared discipline:** `index.css` append-only per-component vs frozen W0-TOKENS; worktree-isolate concurrent shared-file work; integrate to ONE Storybook before any wizard.

### Waves
```
WAVE 0  (start now, parallel) — DE-RISK + UNBLOCK
  R1-min (sandbox route, 1 plugin) → R-SPIKE (long-pole tracer bullet, HARD criteria — HIGHEST priority)
  ‖ W0-EDITOR-CONTRACT (compositing/focus seam) ‖ W0-TOKENS ‖ split element_webview_host.cpp (*_pluginembed / *_meters TUs)
  ‖ D1-fast (derive-from-cable) ‖ S5 build+install(bg) ‖ UI-HIDE ‖ R7 host-verify prep[Glen]

WAVE 1  (parallel fan-out)
  Pillar1 designers: U3 ‖ U4 ‖ U5 ‖ U6 ‖ U7 ‖ U8 ‖ U10   (disjoint .tsx, vs W0-TOKENS)
  Pillar2: D1-full ‖ D2 ‖ D3 ‖ D4 ‖ D5  (executor; *_meters.cpp TU)
  Pillar3: R1 ‖ R2 ‖ R3 ‖ R8-early (processing crash-safety) ‖ R5+R7 teardown track (debugger)
  STABILISE: S1 ‖ S2 ‖ S3 ‖ S4
  → R-SPIKE completes → go/no-go: locks R4/R5 OR triggers B-fallback to Glen

WAVE 2  (post-spike / serialisation-sensitive)
  Pillar3 LONG POLE: R4 (AU editor) → R5 (VST3/CLAP editor, XL) → R6 default-on (boundary: +integration +perf gate)
  Pillar1: U1 (Block VU via D1-fast) ‖ U2 Breadcrumb (GraphCanvas) ‖ U9 keymap ‖ U11 multi-instance(+C++ registry)

WAVE 3  (gates — batched)
  integrate → ONE Storybook → run-story-tests green
  ├─ lead coherence pass + shot.mjs pre-clear  → batched Glen wizard + Chromatic (all components)
  ├─ fake-data audit re-run CLEAN
  ├─ reliability: crash-injection harness + out-of-process editor verify (real plugins) + CF1 host-verify
  └─ fresh build + INSTALL + launch + loop re-verify
```
**Critical path:** R-SPIKE → R5 (out-of-process VST3/CLAP editor, L–XL) → R8 → ship. UI + data are large-but-known and finish inside the reliability long pole. **Ship ≈ max(Pillar-3 editor+verify, Pillar-1 all-37 gated + Pillar-2 real).**

### Orchestration & per-task tooling
- **`/oh-my-claudecode:team`** for Wave-1 fan-out (per-agent file ownership), or **Workflow** to `pipeline()` UI components through design→integrate→screenshot→verify with worktree isolation. Pillar 3 runs as its own focused C++ track (not part of the designer fan-out).
- **UI reskin** → `designer` + **Stitch/21st-magic/uiverse/image-gen** + Storybook MCP (`get-documentation`, `get-storybook-story-instructions`, `run-story-tests`, `preview-stories`) + `shot.mjs` + lovable preview via chrome-devtools. Skill `/storybook:*`.
- **Bridge / RT-safe C++** → `executor` opus + LSP + graphify query + RT-safety hook.
- **Reliability subsystem** → `debugger` (crash/AX, radare2 symbolicate) + `executor` opus (sandbox wiring, CARemoteLayer, JUCE); `architect` for R5 design; Context7 for JUCE docs; R-SPIKE in worktree.
- **Tests** → `test-engineer`. **Review/verify** → `code-reviewer`/`verifier` (separate lane, never self-approve). **Search** → `explore`/graphify.

---

## 6. Risk register
| Risk | L | I | Mitigation |
|---|---|---|---|
| Out-of-process VST3/CLAP editor infeasible/partial (REAPER caveat; private-API) | High | High | R-SPIKE FIRST vs real plugins; AUv3 guaranteed tier; Glen B-fallback (separate-window for hard plugins) pre-described |
| Private-API (CAContext/CALayerHost) notarization/macOS-version breakage | Med | High | confirm acceptable for notarized DMG in spike; isolate behind one adapter; accept per-macOS maintenance |
| Fake data ships / 9th rejection | Med | High | Principle-1 real-data gate + screenshot/story-mount gate + design tools |
| Real-AU sandbox load hang blocks default-on | Med | Med | R2 dedicated fix; AU-first default |
| Scope sprawl (37 × real × reliability) | Med | High | per-component done-criteria; 3-pillar tracking; spike bounds unknown; batched Glen cadence |
| Coherence break (patchwork) | Med | Med | W0-TOKENS + coherence pass before Glen |
| Parallel shared-file corruption | Med | Med | ownership map; worktree isolation; per-component build+story gate |

---

## 7. ADR
- **Decision:** Option A — finish ALL 37 verdicts to real-data spec (no placeholder) AND deliver Bitwig-grade reliability (out-of-process plugins incl. editor GUI, crash-recovery UI, CF1 class closed), all ship-gated, executed as 3 parallel pillars via `/team` + a focused C++ reliability track, with R-SPIKE de-risking the long pole first.
- **Drivers:** real shippable instrument; no host/self crash (99% plugin use); no 9th rejection.
- **Alternatives:** B phased-reliability (rejected by Glen; retained as spike-fallback), C UI-first-harden-later (rejected by Glen), D greenfield (rejected: violates architecture-held-constant).
- **Why chosen:** Glen's explicit bar. Components mostly wired → UI is finish-not-rebuild; sandbox mostly built → reliability is wire+editor-not-greenfield; the genuine new build is the out-of-process editor (gated by spike).
- **Architecture-boundary events (2, both ship-path):** (1) out-of-process editor transport (new IPC `OpenEditor` + CALayerHost host-side) — isolated behind the `nodeeditorfactory.cpp:218` seam + the W0-EDITOR-CONTRACT adapter; (2) **sandbox-default-on (R6)** — changes execution semantics for EVERY plugin (IPC latency/state/bypass), gated behind the full sandboxed-loop integration suite + IPC-latency perf re-verify + joint Pillars-2&3 integration. (Breadcrumb schema migration DEFERRED — nav works on `string[]`.)
- **Consequences:** this is a multi-pillar program, not a quick MVP — reliability-editor (L–XL) defines the schedule; requires Glen for review batches + CF1/reliability host-verify; spike may force a B re-decision.
- **Follow-ups:** push 20 local commits on ratification; remaining native-parity orphans; post-MVP polish.

---

## 8. Consensus record
- **v1–v3** (5-component "Edit-mode slice") — built on the RECOVERY-PLAN's un-ratified re-scope; **superseded** when Glen corrected scope (2026-06-01): all 37 + full Bitwig reliability.
- **v4** (corrected scope) → **Architect: SOUND-WITH-CHANGES** (10 code-verified fixes; 3 priority: spike sequencing/scope, editor-compositing contract + unified teardown, numeric go/no-go + R8-early).
- **v5** (Architect fixes folded) → **Critic: APPROVE** (deliberate mode; zero CRITICAL; 2 MAJOR + gaps folded in: B-fallback default-on, derive-from-cable VU mapping, W0-EDITOR-CONTRACT owner, split gate, R4 AUv3 wording, R6 rollback).
- **Verified spine:** dead-code sandbox (zero callers), editor seam `nodeeditorfactory.cpp:218`, CF1 teardown pattern + child-window gap, fake-data sites, 37 verdicts, +20-commit baseline — all code-confirmed across both Architect and Critic.

**Open confirmations for Glen / Wave-0 setup:** R-SPIKE concrete timebox (day-count); commercial test-plugin inventory on the build machine (≥3 VST3/CLAP + AU for the spike); S5 background build+install kicked at t=0 so CF1 host-verify is ready.

*No execution, no source edits, no implementation delegation until Glen approves.*
