> 🗄️ **ARCHIVED — SUPERSEDED / DEAD. Do NOT execute.** Pass-1 built from this 28-lane OMC plan was denied by Glen ("trash") and reverted (`8d9575f9`). The UI method is now the **cherry-pick bake-off** (not Stitch-first). Live successor: `.omo/plans/mvp-bakeoff-plan.md` · `.omo/bakeoff/VERDICTS.md` · `docs/adr/ADR-011-ui-cherrypick-bakeoff-method.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Element UI/UX Redesign — OMC-Orchestration Execution Plan (Maximum Parallelism)

> **Purpose**: Drive the remaining 24 Element webview UI/UX redesign items (G-01..G-32 minus the 7 shipped) to done via OMC multi-agent orchestration — restructured into concurrent **WAVES → LANES** with per-wave verification GATES, runnable by `/oh-my-claudecode:team`, the native **Workflow** tool, `/oh-my-claudecode:ultrawork`, or `/oh-my-claudecode:ralph`.
>
> **Source lineage** (derived 2026-05-30, scope-preserving restructure — nothing dropped):
> - `.omo/plans/ui-redesign-execution.md` (1178 lines — critic-approved canonical plan: 22 tasks + F1–F4, waves 0.5/A/B/C/D/E/Final)
> - `.omo/plans/ui-redesign-KICKOFF.md` (fresh-session kickoff + 5 non-negotiable execution rules)
> - `.omo/plans/wave2-taxonomy-execution.md` (D5 no-persist; Option-A 3-axis token split — already shipped, read-only constraint)
> - `CLAUDE.md` (project conventions, neumorphic design system, terminology)
> - `docs/CHROMATIC_FEEDBACK_WORKFLOW.md` (visual governance gate)
>
> **Status**: `pending approval`
>
> **How to run this plan** (pick ONE primary surface):
> 1. **Primary** → `/oh-my-claudecode:team` with the shared task list in §6.1 (single git-writer orchestrator; honors the per-component Glen+Chromatic human gate).
> 2. **Deterministic fan-out** → native **Workflow** tool script in §6.2 (`phase()` + `pipeline()`/`parallel()`, `isolation:'worktree'` on file-mutating lanes, schema'd findings).
> 3. **Loop-until-green hardening** → `/oh-my-claudecode:ralph` recipe in §6.3 for each wave's GATE.

---

## 0. Scope Ledger (what this plan covers — auditable, zero-drop)

**24 open G-items** (severity from source; P0 may NOT be deferred without logged Glen sign-off):

| G-id | Component | Ask (verbatim intent) | Sev | New Lane |
|---|---|---|---|---|
| G-01 | VirtualKeyboard | keys cut off; octave +/-; velocity-by-Y; Mod + assignable-CC sliders | P1 | A1 |
| G-05 | BusInspector | larger text; drag-drop add signals; highlight all senders/receivers | P2 | B5 |
| G-06 | DashboardBuilder | SHELVE (hide UI, keep code) | P2 | F0 |
| G-08 | LiveHealth | per-I/O signal type + direction at a glance | P2 | A2 |
| G-09 | MacroDashboard | SHELVE | P2 | F0 |
| G-10 | QuickAccess | far more useful info | P2 | B4 |
| G-11 | SceneLauncher | SHELVE | P0 | F0 |
| G-12 | SessionTree | signal flow, type, user-name + instrument type, routing | P0 | B1 |
| G-13 | SessionTree | drop "Graphs"; boards/nodes/modules breadcrumb (Module tier) | P0 | B1 |
| G-14 | (global) | global sizing/density pass | P0 | F1 |
| G-15 | SnippetShelf | clarify = prebuilt molecules; relocate into left project nav | P0 | F2+B3 |
| G-17 | ToolPalette | full rebuild; fast browsing (plugins/molecules/presets/templates); remove CPU | P0 | B2 |
| G-20-23 | BlockEmbed | ground-up rebuild; remove fake controls; bespoke-per-type → live preview → info card | P0 | C3 |
| G-24 | Cable (Audio) | direction + channel; ports visible/differentiated; fix overlap/auto-draw | P2 | D1 |
| G-25 | Cable (MIDI) | direction + channel; hover live data; differentiate note/CC/channel | P2 | D1 |
| G-26 | Cable (Surround) | REMOVE | P2 | D1 |
| G-27 | Cable (Sidechain) | differentiate midi/audio/multi-parallel | P2 | D1 |
| G-28 | Cable (Active) | active-signal differentiation by type + data at a glance | P2 | D1 |
| G-29 | Cable (Wireless) | replace wireless-bus with Bus Send/Receive C++ nodes | P2 | F3+C1+C2 |
| G-30 | CommandPalette | mirror native JUCE right-click menu layout + content | P1 | F4+D4 |
| G-31 | CommentFrame | grouping UX: shared color/move-together, wrap-as-molecule, breadcrumb layers | P2 | D2 |
| G-32 | GraphCanvas | auto-layout/overlap fix; never look like a mess | P2 | D3 |

**Plus**: new C++ `BusSendNode`/`BusReceiveNode` (+ NodeFactory + bridge + Boost.Test), 3 shelved features (hide-UI/keep-code), and a bug/perf re-verify wave (numeric perf guard + 28-bug reconciliation). Source TODOs preserved: **22 tasks + 4 final-review tasks = 26 → mapped 1:1 to lanes in §8. Zero dropped.**

**Ratified decisions (do NOT re-litigate)**: D1 4-cat taxonomy DONE; D2 Block/Container/Cable + Module tier; D3 shelve = hide-UI/keep-code+stores (reversible); D4 remove Surround cables + Wireless→Bus Send/Receive; **D5 taxonomy `category` never persisted to `.els` (no migration code)**; CSS token Option A (3-axis category/signal/accent) DONE & frozen.

---

## 1. Already-shipped baseline (READ-ONLY — do NOT re-touch)

Branch `chromatic-ui-review`, 5 commits ahead of origin, **NOT pushed** (`17600ce9` → `8408f6c5`). Working tree is **pre-existingly DIRTY** (`src/nodes/reroutenode.hpp`, `test/integration/SessionChangedTest.cpp` modified + untracked `test/*Tests.cpp`) — NOT from this plan.

- Boot-hang / blank-UI / large-session fixes (`ff023feb`, `f85e246c`).
- Wave 0 spec docs (CLAUDE.md, ELEMENT_UNIFIED_BLUEPRINT.md, DESIGN.md → 4-cat taxonomy, Module tier, shelved backlog).
- `a29ebbfc` Wave 1 quick-wins: G-02/G-03 NeuFader, G-04 NeuToggle, G-07/G-16 "smp" labels, G-19 mode persist.
- `dadc2c67` Wave 2 4-category taxonomy (G-18): instrument/audiofx/midifx/modulator, 3-axis CSS tokens, modulator purple `#A87FE0` + hexagon, C++ `mapBlockCategory` 4-string emit + Boost.Test.

**G-items already shipped (skip)**: G-02, G-03, G-04, G-07, G-16, G-18, G-19.

---

## 2. Orchestration Model

### 2.1 OMC surfaces — which to use

| Surface | What it is | Use here for |
|---|---|---|
| **`/oh-my-claudecode:team`** | N coordinated native sub-agents on one shared task list; canonical OMC orchestration surface | **PRIMARY.** Broad parallel waves where a single orchestrator stays the **sole git writer** and runs the per-component Glen+Chromatic human gate. The kickoff explicitly chose single-writer over worktree-parallel `team` workers because hot files collide — so run `team` with file-mutating lanes serialized at commit, OR pair with worktrees per §2.2. |
| **`/oh-my-claudecode:ultrawork`** | Parallel high-throughput engine for fanning many independent tasks | The genuinely independent, **non-gated prep** lanes (token ramp, C++ discovery, story scaffolding, perf-baseline capture) and Wave B's 5 independent component lanes once the canary proves the pipeline. |
| **`/oh-my-claudecode:ralph`** | Self-referential loop until completion **with a verification reviewer** | **Loop-until-green hardening** of each wave's GATE (typecheck + verify-stories + run-story-tests + build/ctest) and the final F1–F4 review wave. Reviewer = Claude `code-reviewer`/`verifier` (NEVER oracle/ultrabrain — Glen ban). |
| **Native Workflow tool** | Deterministic JS: `agent()`, `parallel()`, `pipeline()`, `phase()`, schema'd structured output, `isolation:'worktree'` | Deterministic fan-out/pipeline with hard verification gates and machine-readable findings (e.g., the cable cluster `pipeline(design→review→verify)`, the C++ node `pipeline(spec→impl→build→verify)`). |

### 2.2 Routing rule (independence → parallelism)

1. **Independent file sets → parallel lanes** (same wave, concurrent agents).
2. **Lanes mutating overlapping files → isolate via git worktrees** (`isolation:'worktree'` in Workflow; or serialize the commit through the single orchestrator in `team`). The **hot files are single-writer-owned in Wave F (foundation) then READ-ONLY**: `webview/src/index.css`, `webview/src/App.tsx`, `webview/src/components/layout/AppShell.tsx`, `webview/src/stores/useAppStore.ts`, the 4-cat taxonomy Records, and each task's `demoGraph` fixture. After Wave F lands them, component lanes never collide → no worktrees needed for Waves A/B/C/D component lanes.
3. **Dependent work → sequential wave gates** (Wave N+1 starts only after Wave N's GATE passes; pipelined prep allowed — see §5).
4. **Sub-agents EDIT FILES ONLY.** The orchestrator does ALL git commits — one `git add … && git commit -F -` per wave boundary; `rm -f .git/index.lock` if stale. (Project gotcha: a repo hook runs a no-op `git reset` between calls → batching git with other tool calls drops the stage. Keep git in ONE shell call, alone.)
5. **Concurrency cap**: ≤4 until a wave proves stable via canary; then 4–6 (bounded by what Glen can review in one gate batch).

---

## 3. Parallelism Architecture (WAVES → LANES → GATES)

> Each wave runs its lanes **concurrently** and ends in a **GATE** (separate reviewer/verifier pass — §5). Agent model legend: `executor` (code edits; `opus` for architecture/complex, `sonnet` standard), `designer` (visual/neu component work), `explore` (read-only investigation), `architect`/`deep` (cross-cutting synthesis, `opus`), `writer` (docs/specs), `code-reviewer`/`verifier`/`test-engineer` (review/QA pass). Pin **standard 200k-context** Claude models per sub-agent — NEVER the 1M-beta variant (causes the "context limit / needs extra usage" spawn failure). **Banned: oracle, ultrabrain, any non-Claude model.**

### WAVE F — Foundation (single-writer hot files + read-only discovery) — ≤4 concurrent

> Run AFTER Pre-Flight Hygiene (§4) + canary. Launch the two **high-latency critical-path spikes** (F3 C++ discovery, F5 Tier-2/menu spikes) EARLY alongside F1–F2 as slots free — they gate Waves C/D.

| Lane | Scope (files) | Agent + model | Inputs | Outputs / Deliverables | Acceptance (testable) | Deps | Worktree |
|---|---|---|---|---|---|---|---|
| **F0** | Shelve mounts: `App.tsx:44,62`, `MacroDashboard.tsx:216`; `useAppStore.ts` `hiddenPanels:Set` | **F2's first sub-step** (same agent) `sonnet` | App.tsx, MacroDashboard.tsx, useAppStore.ts | 3 features flag-hidden (Dashboard/Macro/Scene), imports+stores intact | `rg "hiddenPanels" useAppStore.ts` present; perform-mode screenshot shows NO Dashboard/Macro/Scene tab; `npm run build` exit 0; components still compile | — | **NOT a concurrent lane — F0 runs FIRST inside F2's single writer + worktree, then F2 does slot work. One writer of App.tsx/useAppStore eliminates the in-file race.** |
| **F1** | Density/size token ramp in `webview/src/index.css` `@theme` (G-14 foundation) | designer `sonnet` + `neumorphism-generator` | index.css `@theme` (~L18-60), `neu.ts`, DESIGN.md | `--space-1..8`, `--text-xs..lg`, `--control-h-sm/md/lg`, panel-padding tokens; documented | `rg "--space-|--control-h-|--text-" index.css` lists tokens; `npx tsc -b` + `npm run build` exit 0; **git diff touches ZERO `color-(instrument\|audiofx\|midifx\|modulator\|audio\|midi\|value\|accent)` lines** | — | owns index.css |
| **F2** | Shell + nav IA: `App.tsx`/`AppShell.tsx` left-nav container, SnippetShelf relocation wiring, Module-tier breadcrumb scaffold (G-13 shell). **Does F0 shelve FIRST, then slot work** | designer/executor `sonnet` | App.tsx (`:34-66,:88-94,:96-100`), AppShell.tsx (`:150-284`), useAppStore.ts (`:19-21,89-99`) | F0 shelve + left project-nav container hosting SessionTree + relocated SnippetShelf slot; Module breadcrumb slot (shell only) | F0 ACs met; SnippetShelf mounts in left nav (not bottom slot); breadcrumb slot present; `npm run build` exit 0; AppShell story renders w/o shelved panels | — | **SOLE writer of App.tsx/AppShell/useAppStore (F0+F2 = one agent, one worktree — no co-edit race)** |
| **F3** | **G-29 C++ DISCOVERY** → `.omo/audit/g29-busnode-spec.md` (READ-ONLY, no code) | architect/deep `opus` | reroutenode.hpp, audiorouter.{hpp,cpp}, midirouter.{hpp,cpp}, nodefactory.cpp, nodefactory.hpp, add-node SKILL, element_webview_host.cpp (`mapBlockCategory ~:184`, snapshot `~:4271`), useBusStore.ts, element-audio-path.mdc | mini-spec answering (a) NodeFactory reg pattern+line, (b) wireless-bus mechanism being replaced + breakage, (c) closest analog, (d) Send↔Receive identity model, (e) cycle handling, (f) channel mismatch, (g) bridge surface for node runtime data, (h) RT-safety; single-node vs 2-node verdict + rationale | spec answers (a)–(h) with **real file:line citations** (spot-check 3 resolve); chosen node shape + back-compat note for old wireless `.els` | — | read-only |
| **F4** | Taxonomy Records audit + add fields G-12/G-17 need, then FREEZE → `.omo/audit/records-schema.md` | explore/executor `sonnet` | Block.tsx `catConfig` (`:14-42`), types.ts `BlockCategory` (`:2,:18,:106`), Record sites (BlockEmbed/QuickAddPopup/ConnectionEditor/QuickAccess/InspectorHub) | final category-config field set + "frozen" note; any added field has 4 exhaustive entries | schema doc lists 4 entries (instrument/audiofx/midifx/modulator) per added field; `npx tsc -b` exit 0 (exhaustiveness holds) | — | owns Records schema |
| **F5** | Spikes: BlockEmbed Tier-2 live-preview feasibility + G-30 native-menu bridge enumeration (READ-ONLY) | architect/deep `opus` | element_webview_host.cpp (`element*` registry), nativePluginEditor.ts, JUCE `PopupMenu` sites in src/ui, CommandPalette.tsx, QuickAddPopup.tsx | `.omo/audit/blockembed-tier2-spike.md` (feasible? else fallback: scaled screenshot or Tier-3 info-card) + `.omo/audit/g30-native-menu-bridge.md` (menu source; new native fn needed? + contract) | both docs end with a concrete "task C3/D4 will therefore do X" instruction | — | read-only |
| **F6** | demoGraph per-task fixtures + Storybook/Chromatic config check → `.omo/audit/storybook-chromatic-ready.md` | executor `sonnet`/quick | demoGraph.ts (`:741-763`), `.storybook/main.ts` (addon-designs `^11.1.3`), `webview/.env` (Chromatic `chpt_` token), package.json | `webview/src/data/fixtures/{sessiontree,toolpalette,cable,blockembed}.ts` (or append-only rule); ready-doc with working commands | per-component fixtures exist; `npx tsc -b` exit 0; `npx vitest run --project storybook` green; doc lists run-story-tests + Chromatic publish commands | — | owns demoGraph + fixtures |
| **F7** | Numeric perf baselines + engine/perf regression guard → `.omo/audit/perf-baselines.md` (run EARLY, independent) | test-engineer/verifier `sonnet` | `tools/automation/element_verify.py`, perf harness | boot-ms / large-session-ms / main-thread-% / frame-time budgets + re-runnable guard command | `.omo/audit/perf-baselines.md` has numeric budgets + a re-runnable guard cmd | — | read-only/append |

**━━ GATE F**: orchestrator commits foundation (ONE git call); canary spawn-check; review F3/F5/F7 verdicts; F1/F2/F4/F6 hot files declared READ-ONLY for the rest of the plan. ━━

### WAVE A — Independent pilots (prove the pipeline) — 2 concurrent

| Lane | Scope | Agent | Inputs | Deliverables | Acceptance | Deps | Worktree |
|---|---|---|---|---|---|---|---|
| **A1** | G-01 VirtualKeyboard redesign — `VirtualKeyboard.tsx` (+ fix sparse-array hole `:49`), stories | designer `sonnet` + `neumorphism-generator` | VirtualKeyboard.tsx, its stories, nativeKeyboard.ts, Storybook MCP `get-documentation` | full+hittable black keys; octave +/-; velocity-by-Y (0-127); Mod + assignable-CC sliders; neu+density reskin; new stories | run-story-tests asserts a black-key element fully in viewport + clickable AND velocity high@bottom/low@top AND CC slider emits; Chromatic diff; addon-designs ref | F1,F2 | none (reads frozen foundation) |
| **A2** | G-08 LiveHealth IO detail — `LiveHealth.tsx`, stories | designer `sonnet` + `neumorphism-generator` | LiveHealth.tsx, usePerformStore.ts (`:214-235` `onMetering`), QuickAccess.tsx (parity) | per-I/O activity w/ audio/midi/value + direction; honest "no data" state (NO fabricated values); reskin; stories Nominal/Warning/Critical/Empty | run-story-tests asserts distinct input vs output rows + signal-type marker AND Empty shows explicit no-data; Chromatic; addon-designs ref | F1,F2 | none |

**━━ GATE A**: automated AC pass → Glen+Chromatic batch confirm WA → mark `done` in completion manifest. ━━

### WAVE B — Nav/IA components (read-only shell/Records/tokens) — 5 concurrent

| Lane | Scope | Agent | Inputs | Deliverables | Acceptance | Deps | Worktree |
|---|---|---|---|---|---|---|---|
| **B1** | G-12/G-13 SessionTree — `SessionTree.tsx`, stories | designer `sonnet` + `neumorphism-generator` + `ui-ux-pro-max` + Stitch MCP | SessionTree.tsx, nav container/breadcrumb slot (F2), nativeSession.ts (`elementSessionGetGraphTree`), Block.tsx catConfig (RO) | rows show user-name + type + signal-flow/routing; boards/nodes/modules breadcrumb (Module tier); zero "Graphs" label; larger via tokens; new Module/breadcrumb stories | `rg -i "graphs" SessionTree.tsx` → none as UI label; run-story-tests asserts a row exposes name AND type AND routing cue + breadcrumb element; Chromatic; addon-designs | F1,F2,F4,F6 | none |
| **B2** | G-17 ToolPalette rebuild — `ToolPalette.tsx`, stories | designer `sonnet` + `neumorphism-generator` + `ui-ux-pro-max` + `uiverse-galaxy` + Stitch MCP | ToolPalette.tsx (+stories, drop HighCpu), usePluginBrowserStore.ts (`inferBlockCategory`), QuickAddPopup.tsx (reuse search/cat), Block.tsx catConfig (RO) | fast browsing: search + 4-cat filters + plugins/molecules/presets/templates + favorites/recent; **CPU-load REMOVED** | `rg -i "cpu" ToolPalette.tsx` → none; run-story-tests asserts search input + category filter + NO CPU element + results filter on type; Chromatic; addon-designs | F1,F2,F4,F6 | none |
| **B3** | G-15 SnippetShelf new look (in left nav) — `SnippetShelf.tsx`, stories | designer `sonnet` + `neumorphism-generator` + `uiverse-galaxy` | SnippetShelf.tsx, left-nav container (F2), nativeGraph.ts (`nativeMoleculeInsert`) | renders in left-nav context; clear "snippets = prebuilt molecules" label; browsable items; stories for new container | NOT re-added to bottom slot; run-story-tests asserts explanatory label + actionable snippet item; Chromatic; addon-designs | F1,F2 | none |
| **B4** | G-10 QuickAccess info upgrade — `QuickAccess.tsx`, stories | designer `sonnet` + `neumorphism-generator` | QuickAccess.tsx, usePerformStore.ts (`:214-235`), LiveHealth.tsx (consistent treatment) | richer labeled params/macros/targets with values (not sparse); coordinate metering contract w/ A2 | run-story-tests asserts labeled info rows w/ values, not sparse; Chromatic; addon-designs | F1,F2 | none |
| **B5** | G-05 BusInspector redesign — `BusInspector.tsx` (embedded `InspectorHub.tsx:52`), `useBusStore.ts` (read), stories | designer `sonnet` + `neumorphism-generator` + `ui-ux-pro-max` | InspectorHub.tsx (`:52`), useBusStore.ts, **`.omo/audit/g29-busnode-spec.md` (F3 — present buses as send/receive endpoints)** | larger contextful text; drag-drop add signals; highlight all senders/receivers; OrphanEndpoint handled; story-level (live wiring confirmed at GATE B-C after C2, does NOT block on C++ node) | run-story-tests asserts drag target + sender/receiver highlight class + larger labeled text; Chromatic; addon-designs | **F1,F2,F3** | none |

**━━ GATE B**: automated AC pass → Glen+Chromatic batch confirm (may combine with GATE C). ━━

### WAVE C — C++ Bus node → Block system (PIPELINE within wave; runs ∥ Wave B) — sequential C1→C2→C3

| Lane | Scope | Agent | Inputs | Deliverables | Acceptance | Deps | Worktree |
|---|---|---|---|---|---|---|---|
| **C1** | G-29 Bus node impl — `src/nodes/bussendnode.{hpp,cpp}` + `busreceivenode.{hpp,cpp}` (or single per F3 verdict), `nodefactory.cpp`, `include/element/nodefactory.hpp`, bridge in `element_webview_host.cpp` (~:4271), Boost.Test + `test/fixtures/legacy-wireless.els` | executor `opus` (architecture) | F3 spec (authoritative), audiorouter/midirouter.{hpp,cpp}, reroutenode.hpp, nodefactory.*, element_webview_host.cpp:4271, `test/engine/BlockCategoryMapTest.cpp` (Boost pattern) + `test/CMakeLists.txt`, element-audio-path.mdc | RT-safe `render()` (no alloc/lock/IO); identity model wired; node metadata over bridge; Boost.Test: routing send→receive, Receive-no-Send=silence(no crash), cycle guard, channel mismatch | `cmake -B build-merged -DELEMENT_BUILD_TESTS=ON` reconfig (GLOB_RECURSE picks new .cpp); Boost.Test routing/no-send/cycle pass; **no `using namespace juce` in headers**; node appears in add-menu under correct taxonomy category; **back-compat: opening `test/fixtures/legacy-wireless.els` (old wireless-bus session) does NOT crash — graceful drop/auto-convert per spec** | F3 | **YES** (C++ build dir; isolate from webview lanes) |
| **C2** | G-29 cmake build + bundle sync + runtime evidence | executor/quick `sonnet` | C1 output | `cmake --build build-merged --target element_app -j8`; **force-cp `webview/dist/.` → `build-merged/element_app_artefacts/Element.app/Contents/Resources/webview/`**; launch + AX/screenshot node appears + routes | build exit 0; AX/screenshot evidence node present + routes | C1 | YES |
| **C3** | G-20-23 BlockEmbed ground-up rebuild — `BlockEmbed.tsx`, per-tier stories+fixtures | designer `opus` (split Tier-1+Tier-3 first, Tier-2 only if feasible — ≤3 files/sub-agent) | F5 Tier-2 verdict, C1 bridge fields, BlockEmbed.tsx (`:339-366` content, `:111-151` ParamStrip / `:212-240` Meter / `:244-309` Spectrum = the fakes to delete), useParameterStore.ts, useEngineSnapshotStore.ts, Block.tsx catConfig (RO), Storybook MCP | every block resolves to EXACTLY ONE tier; remove ALL fake controls; Tier-1 bespoke real mini-UI (reroute/bus/midi-util/modulator); Tier-2 live preview IF F5-feasible ELSE scaled screenshot ELSE Tier-3; Tier-3 info-card (activity/CPU/type/name/taxonomy-colour/user-name) from real G-29 bridge data | **build-failing grep gate**: `rg -n "ParamStripEmbed\|MeterEmbed\|SpectrumEmbed" BlockEmbed.tsx` → none (all THREE current fake controls — `BlockEmbed.tsx:111/212/244` — must be gone, not just two); Tier-3 story asserts CPU text node + taxonomy colour class (NOT a fake fader); Tier-1 node embed control actually changes the node param (running app); run-story-tests green; Chromatic; addon-designs. **If F5 says Tier-2 infeasible → record affected types as Tier-3-only in completion-manifest + surface scope reduction for Glen at GATE B-C (NOT silently absorbed)** | F5,C2 | none (after C2 lands) |

**━━ GATE B-C**: automated AC pass → Glen+Chromatic batch confirm WB+WC. ━━

### WAVE D — Cable system + canvas (single cable owner; D2 before D3) — up to 4 concurrent (D3 after D2)

| Lane | Scope | Agent | Inputs | Deliverables | Acceptance | Deps | Worktree |
|---|---|---|---|---|---|---|---|
| **D1** | G-24/25/26/27/28 cable redesign — **SINGLE owner of `Cable.tsx`** (do NOT split across agents); ports styled via props (Block.tsx PortShape/PortHandle READ-ONLY), stories | designer `sonnet` + `neumorphism-generator` + HF image-gen (glyphs) | Cable.tsx (`:18-32` signal→color/width, `:101-114` manhattan fan, `:138-159` wireless ghost→bus repr, `:164-175` glow, `:184` sidechain dash), Block.tsx (`:54-98,171-217` ports — RO), useCableMeterStore.ts (hover levels), useBusStore.ts, g29 spec | direction + channel; ports visible/differentiated; fix overlap/auto-draw; MIDI hover live data (note/CC/channel); REMOVE Surround; sidechain midi/audio/multi-parallel variants; active-signal differentiation; bus send/receive repr (retire wireless ghost). Stop CONSUMING useBusStore wireless `cableBus` map in the renderer but **do NOT delete useBusStore** (B5 + bus model still use it) — record now-dead wireless store code as a follow-up entry in `.omo/audit/completion-manifest.md` (owner: closed/verified by E2 + R4), do NOT delete here | `rg -i "surround\|wireless" Cable.tsx` → none as variants; SurroundSixChannel/WirelessBusBadge stories gone; run-story-tests asserts direction marker + channel label + MIDI hover tooltip(note/CC) + a sidechain variant class; Chromatic; addon-designs | C2 | none |
| **D2** | G-31 CommentFrame grouping/molecule data model — `CommentFrame.tsx`, stories | designer `sonnet` + `neumorphism-generator` | CommentFrame.tsx (`:16-40` independent z-0, no grouping), demoGraph comments | GROUP model: shared color + move-together + wrap-as-molecule + breadcrumb layers (xyflow has no parent/child here) | run-story-tests asserts group shares color + moves together + wrap-as-molecule affordance; Chromatic; addon-designs | F2 | none |
| **D3** | G-32 GraphCanvas auto-layout/overlap fix (group-aware) — `GraphCanvas.tsx` + layout util, stories | architect/deep `opus` | GraphCanvas.tsx (`:136` ReactFlow, `:421-456` zoom-tier debounce), D2 group model | auto-layout that never overlaps; respects D2 groups | run-story-tests asserts NO overlapping nodes after auto-layout on demoGraph + groups respected; Chromatic | D2 | none |
| **D4** | G-30 CommandPalette → native-JUCE menu mirror — `CommandPalette.tsx`, stories (**+ C++ native + cmake/bundle-sync if Branch 20b**) | **orchestrator picks from F5 verdict**: designer `sonnet` (Branch 20a) OR architect `opus` (Branch 20b) | F5 `g30-native-menu-bridge.md`, CommandPalette.tsx, QuickAddPopup.tsx, `src/ui/**` PopupMenu sites (20b) | palette mirrors native right-click menu sections/items. **Branch 20a (already bridged)**: consume bridge; pure webview reskin, no build. **Branch 20b (new native enum fn required)**: HYBRID — implement message-thread native per F5 contract (NO alloc/lock; message-thread only), then sibling `cmake -B build-merged` reconfigure + `element_app` build + bundle force-cp (mirror C2) BEFORE in-app validation | run-story-tests asserts palette items match the F5-enumerated native menu (labels/order/grouping); Chromatic; addon-designs; (20b) build exit 0 + node-menu present in app | F5 | none (20b touches own C++; serialize commit) |

**━━ GATE D**: automated AC pass → Glen+Chromatic batch confirm WD. ━━

### WAVE E — Bug/perf re-verify (completion-manifest gated) — 2 concurrent

| Lane | Scope | Agent | Inputs | Deliverables | Acceptance | Deps | Worktree |
|---|---|---|---|---|---|---|---|
| **E1** | (continuation of F7 guard) re-run numeric perf vs baselines | test-engineer/verifier `sonnet` | `.omo/audit/perf-baselines.md`, element_verify.py | post-redesign perf within budgets | numeric perf within F7 budgets (boot/large-session/main-thread/frame) | F7 (early) | read-only |
| **E2** | UI re-verify over `done` components — 28-bug reconciliation + new findings → `.omo/audit/reverify-findings.md` | architect/deep `opus` | `.omo/audit/28-bug-reconciliation.md`, `findings.md`, completion-manifest | reconciliation complete; new P0/P1 fixed (or logged w/ Glen sign-off) | only `done` components audited (manifest-gated); 28-bug reconciliation complete; new P0/P1 resolved/logged | completion-manifest (post-WD) | none |

**━━ GATE E**: re-verify findings reviewed; P0/P1 closed or signed off. ━━

### WAVE FINAL — review (parallel, non-oracle) then GATE B(final)

| Lane | Scope | Agent | Deliverables | Acceptance |
|---|---|---|---|---|
| **R1** | Plan-compliance + Must-NOT grep audit | verifier `sonnet` | pass/fail table over every guardrail w/ evidence paths | grep-clean: `backdrop-blur`/`rgba(.*0\.[0-9]` transparency in component CSS (glass/blur); off-taxonomy color; `ParamStripEmbed`/`MeterEmbed`/`SpectrumEmbed` (ALL THREE fake BlockEmbed controls); Surround/wireless cable variants; `using namespace juce` in new headers; alloc/lock in node `process()`; web/cloud deploy config (Vercel); component edits to index.css/Records/AppShell/useAppStore; sub-agent git commits; **D5 persistence drift** — `category` must NOT be written to `.els`: `rg -n "\"category\"\|'category'\|setProperty.*category" src/ src/ui/element_webview_host.cpp` shows NO save-path write of the taxonomy category (read/emit only); **`\boracle\b`/`\bultrabrain\b` across `.omo/audit/**`, `.omo/evidence/**`, `.omo/state/sessions/**` (banned-agent invocation)**; shelved code intact (hidden, not deleted). Output: `Must Have [N/N] \| Must NOT [N/N] \| Tasks [N/N] \| VERDICT` |
| **R2** | Code quality + RT-safety review (C++ Bus node) | code-reviewer `opus` | RT-safety verdict + issues list | no alloc/lock/IO in `render()`; no P0 code-quality issues open |
| **R3** | Real manual QA (all scenarios, integration in build-merged) | test-engineer + Playwright `sonnet` | all scenarios pass on real app; evidence | every task QA scenario passes on the real app (integration, not mock) |
| **R4** | Scope-fidelity / contamination check | architect/deep `opus` | scope-clean verdict; drift flagged | **diff vs captured baseline** (`git diff $(cat .omo/audit/plan-baseline-sha.txt)`, NOT `HEAD~N`); treat any path on `.omo/audit/plan-baseline-allowlist.md` as pre-existing (do NOT flag dirty reroutenode.hpp/SessionChangedTest.cpp/untracked WIP tests); 1:1 — everything specced built, nothing beyond (no creep, no shipped-wave redesign, no extra C++/bridge fns); no cross-task contamination (task N editing task M's files; component task editing a hot file). Output: `Tasks [N/N] \| Contamination [CLEAN/N] \| Unaccounted [CLEAN/N] \| VERDICT` |

**━━ GATE B(final)**: orchestrator commits final wave (ONE git call); Glen batched runtime-confirm ALL waves → `.omo/audit/confirmation-log.md`. Do NOT push (Glen decides). ━━

---

## 4. Pre-Flight Hygiene (orchestrator, BEFORE the canary — BLOCKING)

1. `git status` — working tree is pre-existingly DIRTY (`src/nodes/reroutenode.hpp`, `test/integration/SessionChangedTest.cpp` modified + untracked `test/*Tests.cpp`), NOT from this plan. **PAUSE for Glen** to choose commit / stash / allow-list each in `.omo/audit/plan-baseline-allowlist.md` with rationale. **`reroutenode.hpp` MUST be in a known state before F3/C1 read it.**
2. Capture baseline: `git rev-parse HEAD > .omo/audit/plan-baseline-sha.txt` — R4 diffs against THIS SHA, never `HEAD~N`.
3. Re-sync inventory: `git log --oneline origin/chromatic-ui-review..HEAD`; confirm `8408f6c5` is tip.
4. Canary: spawn ONE trivial throwaway sub-agent ("echo repo branch + read first 5 lines of `webview/src/index.css`"). If it errors (1M-context spawn failure), fix model pin/scoping before any fan-out. Abort the wave on canary failure.
5. **TMPDIR (BLOCKING + verified):** `mkdir -p .omo/tmp && export TMPDIR="$PWD/.omo/tmp"` (the project volume `/Volumes/Projects` was measured 12% used / 3.2 TiB free this session — safe). Then ASSERT free space before any worker fan-out: `df -h .omo/tmp` must show ≥several GB. Worker-spawn output corruption from a full temp FS silently elides tool output, so do not skip this. Add `.omo/tmp/` to `.gitignore` if not already ignored. (Background: tool output can corrupt under ENOSPC; `.omo/tmp` on the project volume avoids it.)
6. **`test:all` baseline:** run `cd webview && npm run test:all` NOW and record pass/fail counts in `.omo/audit/plan-baseline-sha.txt` alongside the SHA. Project memory notes a sibling branch carried ~147 pre-existing unit failures; if any are live on `chromatic-ui-review`, the DoD's "0 failures" is reframed to **no NEW failures vs this baseline** (§5.5).

---

## 5. Verification Gates (per wave + final — SEPARATE reviewer pass, never self-approve)

> Authoring and review are separate lanes. A wave's GATE is a **distinct `code-reviewer`/`verifier` pass** (or a `ralph` loop with a reviewer) — the lane that wrote the code never approves its own work.

### 5.1 Per-component automated layer (must pass FIRST, before any human gate)

```bash
# Typecheck
cd webview && npx tsc -b
# Mount-time throw catcher (tsc cannot see these)
cd webview && npm run verify-stories
# Storybook test harness (interaction + a11y)
cd webview && npx vitest run --project storybook
```
Plus **Storybook MCP `run-story-tests`** (interaction + a11y, self-healing loop — iterate until green; requires `cd webview && npm run storybook` on `:6006`). Use `get-documentation` BEFORE editing any component (real props — do NOT invent components/props).

### 5.2 Visual governance

**Chromatic UI Review** (per-component comments) — preview-only during dev; baseline accept batched at the wave boundary. Local token in `webview/.env` (`chpt_…`, gitignored). Per redesigned story, attach an `@storybook/addon-designs` `parameters.design` ref (DESIGN.md / Stitch export / HF image). Workflow: `docs/CHROMATIC_FEEDBACK_WORKFLOW.md`. Human design review also flows through the in-Storybook 💬 panel → `.omo/audit/ui-comments.jsonl` (Glen flips a note `fixed` at runtime).

### 5.3 Native build + AX (before ANY "done" claim)

```bash
cmake -B build-merged -DELEMENT_BUILD_TESTS=ON
cmake --build build-merged -j8            # or: --target element_app -j8
cd build-merged && ctest --output-on-failure
# Webview-only change? force-copy dist into the bundle (POST_BUILD copy only runs on element_app relink):
cp -R webview/dist/. build-merged/element_app_artefacts/Element.app/Contents/Resources/webview/
# AX UI verification (Element must be running) — no screenshots:
cd tools/automation && python3 element_verify.py --suite all
```

### 5.4 Human Gate Protocol (combined, per wave boundary)

- **One review event per component**: automated AC pass FIRST → THEN Glen runtime-confirms behavior AND accepts the Chromatic baseline → component marked `done` in `.omo/audit/completion-manifest.md`.
- **Gate at wave boundaries, not per-task.** Max wave width = what Glen can review in one batch (default 4–6; adjustable).
- **Pipeline**: while Glen reviews wave N, agents start wave N+1's independent **non-gated** prep (tokens, C++ discovery, story scaffolding).
- **Fix-lane**: a rejected component goes to a fix-lane — it does NOT block the rest of the wave's merge.
- **Confirmation-invalidation**: a later task touching a confirmed component re-enters the confirm queue.

### 5.5 Definition of Done (final gate)

> **`test:all` is baseline-relative.** §4 step 6 captures pre-existing failure counts; the bar below is **no NEW failures vs that baseline** (target 0), so a branch with known pre-existing unit failures does not make the DoD unmeetable.

- [ ] All 24 G-items implemented OR deferred-with-reason in the manifest. **No P0 deferred without logged Glen sign-off.**
- [ ] `cd webview && npm run build` exit 0; `npm run test:all` shows **no NEW failures vs the §4-step-6 baseline** (target 0; if the branch carries pre-existing failures they are recorded in the baseline and must not grow); `npx vitest run --project storybook` green.
- [ ] `cmake -B build-merged -DELEMENT_BUILD_TESTS=ON && cmake --build build-merged --target element_app -j8` exit 0; new C++ node Boost.Test passes.
- [ ] Chromatic baselines reviewed per wave; addon-designs ref per redesigned story.
- [ ] Re-verify: numeric perf within baselines; 28-bug reconciliation complete; new P0/P1 fixed.
- [ ] Zero fake/placeholder BlockEmbed controls (grep gate passes).
- [ ] Gate B(final): Glen runtime-confirms each wave batch → `.omo/audit/confirmation-log.md`.

---

## 6. Invocation Recipes (copy-paste-ready)

### 6.1 `/oh-my-claudecode:team` (PRIMARY)

```
/oh-my-claudecode:team

GOAL: Execute .omo/plans/ui-redesign-OMC-execution.md as a single-git-writer team. Read the plan in full first (critic-approved, self-contained). Honor the per-component Glen+Chromatic human gate at every wave boundary.

NON-NEGOTIABLE RULES:
1. AGENTS: Claude models ONLY (opus/sonnet). BANNED: oracle, ultrabrain, Momus, any non-Claude model. Pin standard 200k-context models (NOT the 1M-beta variant). Review/verify lanes use code-reviewer / verifier / qa-tester / test-engineer.
2. GIT: sub-agents EDIT FILES ONLY. The team lead does ALL commits — one `git add … && git commit -F -` per wave boundary, in ONE shell call, alone (a repo hook runs no-op `git reset` between calls). `rm -f .git/index.lock` if stale.
3. HOT FILES single-writer in Wave F then READ-ONLY: index.css, App.tsx, AppShell.tsx, useAppStore.ts, 4-cat Records, per-task demoGraph fixtures.
4. NEU ONLY via neumorphism-generator skill + locked seed; never free-generate tokens. No glass/blur. No web/cloud deploy. New .cpp → cmake reconfigure. Webview-only build → force-cp dist into Element.app. Do NOT push.
5. SURGICAL SCOPING (prevents the sonnet 1M-context spawn failure): give each spawned worker ONLY its own lane row + the file:line References listed for that lane — NEVER the whole plan, never broad globs, ≤3 files per worker. If a lane needs 4+ files it is already split here; do not re-merge. Read the per-lane source-task body in `.omo/plans/ui-redesign-execution.md` for that lane's full Must-NOT-do + QA detail before dispatch.

SHARED TASK LIST (lane → wave → agent → deps):
- F1 density token ramp index.css [Wave F, designer, deps:-]
- F2 shell+nav IA App.tsx/AppShell — INCLUDES F0 shelve (Dashboard/Macro/Scene via useAppStore.hiddenPanels) as its FIRST sub-step; F2 is the SOLE writer of App.tsx+useAppStore [Wave F, designer, deps:-]
- F3 G-29 C++ discovery spec [Wave F, architect-opus READ-ONLY, deps:-]
- F4 Records audit+freeze [Wave F, executor, deps:-]
- F5 BlockEmbed Tier-2 + G-30 menu spikes [Wave F, architect-opus READ-ONLY, deps:-]
- F6 demoGraph fixtures + SB/Chromatic config [Wave F, executor, deps:-]
- F7 perf baselines + guard [Wave F, test-engineer, deps:-]
- (GATE F: lead commits foundation; canary; freeze hot files. Waves A, B, C all fork from HERE in parallel.)
- A1 G-01 VirtualKeyboard [Wave A, designer, deps:F1,F2]
- A2 G-08 LiveHealth IO [Wave A, designer, deps:F1,F2]
- (GATE A: Glen+Chromatic — SOFT: confirms the pilot pattern; does NOT block Wave B/C, which already started off GATE F)
- B1 G-12/13 SessionTree [Wave B, designer, deps:F1,F2,F4,F6]
- B2 G-17 ToolPalette [Wave B, designer, deps:F1,F2,F4,F6]
- B3 G-15 SnippetShelf [Wave B, designer, deps:F1,F2]
- B4 G-10 QuickAccess [Wave B, designer, deps:F1,F2]
- B5 G-05 BusInspector [Wave B, designer, deps:F1,F2,F3]
- C1 G-29 Bus node C++ impl+factory+bridge+Boost.Test [Wave C, executor-opus WORKTREE, deps:F3] (runs ∥ Waves A+B)
- C2 G-29 cmake build+bundle sync+evidence [Wave C, executor WORKTREE, deps:C1]
- C3 G-20-23 BlockEmbed rebuild [Wave C, designer-opus, deps:F5,C2]
- (GATE B-C: Glen+Chromatic — confirm B5 runtime wiring AFTER C2 has landed in this batch)
- D1 G-24/25/26/27/28 cable (SINGLE Cable.tsx owner) [Wave D, designer, deps:C2]
- D2 G-31 CommentFrame grouping [Wave D, designer, deps:F2]
- D3 G-32 GraphCanvas auto-layout (group-aware) [Wave D, architect-opus, deps:D2]
- D4 G-30 CommandPalette native-menu mirror [Wave D, designer, deps:F5]
- (GATE D: Glen+Chromatic)
- E1 perf re-verify vs baselines [Wave E, test-engineer, deps:F7]
- E2 UI re-verify 28-bug reconciliation [Wave E, architect-opus, deps:completion-manifest]
- (GATE E)
- R1 plan-compliance+Must-NOT grep [Final, verifier]
- R2 code-quality+RT-safety [Final, code-reviewer-opus]
- R3 real manual QA all scenarios [Final, test-engineer+Playwright]
- R4 scope-fidelity vs baseline SHA [Final, architect-opus]
- (GATE B-final: lead commits; Glen confirms all → confirmation-log.md)

START: run Pre-Flight Hygiene (§4); report git state + proposed allow-list to Glen; PAUSE before the canary.
```

### 6.2 Native Workflow tool (deterministic fan-out + pipeline + worktree isolation)

> Real Workflow-tool API: `agent(prompt, opts?)` returns a string, or the validated object when `opts.schema` is set; `phase(title)` just opens a progress group (no callback); `parallel(thunks)` takes an array of `() => Promise` and is a BARRIER; `pipeline(items, stage1, stage2, …)` runs each item through all stages with NO barrier between stages (each stage gets `(prevResult, originalItem, index)`); `meta` MUST be a pure literal. `opts`: `{ label, phase, schema, model, isolation:'worktree', agentType }`. There is NO `role`/`task`/`outputs` field — model the lane in the prompt string and request structure via `schema`. Human GATEs are NOT agent calls — they are commit/confirm points the orchestrator runs between phases (shown as comments).

```js
export const meta = {
  name: 'element-ui-redesign-omc',
  description: 'Element UI/UX redesign — waves F→A→B→C→D→E→Final, gated.',
  phases: [
    { title: 'wave-F' }, { title: 'wave-A' }, { title: 'wave-B' },
    { title: 'wave-C' }, { title: 'wave-D' }, { title: 'wave-E' },
    { title: 'wave-final' },
  ],
};

// Schema'd structured outputs so discovery + gate findings are machine-readable.
const SPEC_SCHEMA = {
  type: 'object', required: ['summary', 'citations'],
  properties: {
    summary:       { type: 'string' },
    nodeShape:     { type: 'string' },   // 'single' | '2-node' (F3)
    identityModel: { type: 'string' },
    citations:     { type: 'array', items: { type: 'string' } }, // file:line
  },
};
const VERDICT_SCHEMA = {
  type: 'object', required: ['pass', 'evidence'],
  properties: {
    pass:     { type: 'boolean' },
    evidence: { type: 'array', items: { type: 'string' } },
    failures: { type: 'array', items: { type: 'string' } },
  },
};

// Separate reviewer pass — NEVER self-approves (the author lane did not write this).
const verify = (lane, phase) => agent(
  `Verify lane ${lane}: run \`cd webview && npx tsc -b && npm run verify-stories && npx vitest run --project storybook\`, then Storybook MCP run-story-tests until green. You are the SEPARATE reviewer pass. Return {pass, evidence, failures}.`,
  { label: `verify:${lane}`, phase, schema: VERDICT_SCHEMA, model: 'sonnet' },
);

// ── WAVE F: foundation. Read-only spikes ∥ hot-file writers (worktree-isolated to avoid collisions). ──
phase('wave-F');
const foundation = await parallel([
  () => agent('F1 density token ramp in webview/src/index.css @theme (--space/--text/--control-h tokens); do NOT touch the taxonomy category/signal/accent color vars.',
    { label: 'F1-tokens', phase: 'wave-F', isolation: 'worktree', model: 'sonnet' }),
  () => agent('F2 shell+nav IA App.tsx/AppShell: left project-nav container + Module breadcrumb slot + F0 shelve Dashboard/Macro/Scene via useAppStore.hiddenPanels (hide-UI, keep code).',
    { label: 'F2-shell', phase: 'wave-F', isolation: 'worktree', model: 'sonnet' }),
  () => agent('F3 G-29 Bus node C++ DISCOVERY → .omo/audit/g29-busnode-spec.md (READ-ONLY, no code). Answer (a)-(h) with file:line citations; pick single-node vs 2-node.',
    { label: 'F3-g29spec', phase: 'wave-F', model: 'opus', agentType: 'Explore', schema: SPEC_SCHEMA }),
  () => agent('F4 taxonomy Records audit + freeze → .omo/audit/records-schema.md; any added field has 4 exhaustive entries (instrument/audiofx/midifx/modulator).',
    { label: 'F4-records', phase: 'wave-F', isolation: 'worktree', model: 'sonnet' }),
  () => agent('F5 spikes: BlockEmbed Tier-2 live-preview feasibility + G-30 native-menu bridge enumeration → two .omo/audit verdict docs, each ending in a concrete "C3/D4 will do X" instruction.',
    { label: 'F5-spikes', phase: 'wave-F', model: 'opus', agentType: 'Explore' }),
  () => agent('F6 demoGraph per-task fixtures (webview/src/data/fixtures/*) + Storybook/Chromatic config check → .omo/audit/storybook-chromatic-ready.md.',
    { label: 'F6-fixtures', phase: 'wave-F', isolation: 'worktree', model: 'sonnet' }),
  () => agent('F7 numeric perf baselines + re-runnable regression guard → .omo/audit/perf-baselines.md (boot / large-session / main-thread% / frame-time budgets).',
    { label: 'F7-perf', phase: 'wave-F', model: 'sonnet' }),
]);
// ━━ GATE F (HUMAN, not an agent): orchestrator commits foundation in ONE git call; run canary; freeze hot files READ-ONLY. ━━

// ── WAVE A: 2 pilots. pipeline runs each item through design→review→verify with NO cross-stage
//    barrier (A2 may reach verify while A1 still designs) — author≠reviewer is enforced PER ITEM.
//    The human GATE is NOT in the script: `await pipeline(...)` settles ALL items first, THEN the
//    orchestrator runs the GATE A confirm below. (For a strict cross-item barrier before verify,
//    swap to `parallel(items.map(c => () => /* design→review→verify thunk */))`.) ──
phase('wave-A');
const waveA = await pipeline(
  ['A1-VirtualKeyboard', 'A2-LiveHealth'],
  (c) => agent(`Redesign ${c} on the FROZEN foundation (read-only index.css/App.tsx/Records/fixtures). Storybook MCP get-documentation FIRST (real props). neu()+density tokens; new stories; addon-designs ref.`,
    { label: `design:${c}`, phase: 'wave-A', model: 'sonnet' }),
  (_design, c) => agent(`Review ${c}: neu-only (no glass/blur/transparency), a11y, and ZERO edits to frozen hot files.`,
    { label: `review:${c}`, phase: 'wave-A', model: 'sonnet' }),
  (_review, c) => verify(c, 'wave-A'),
);
// ━━ GATE A (HUMAN): Glen + Chromatic batch confirm WA → mark done in completion-manifest. ━━

// ── WAVE B: 5 genuinely-independent nav/IA components (true fan-out). Same per-item pipeline +
//    post-await human GATE as Wave A. NOTE: in a single Workflow run, Waves A/B/C all execute
//    sequentially as written here — to run them concurrently off GATE F (the DAG intent), launch
//    A, B and the C chain from one `parallel([...])` instead of three awaited phases. ──
phase('wave-B');
const waveB = await pipeline(
  ['B1-SessionTree', 'B2-ToolPalette', 'B3-SnippetShelf', 'B4-QuickAccess', 'B5-BusInspector'],
  (c) => agent(`Redesign ${c}; read-only shell/Records/tokens/fixtures; neu()+density; new stories; addon-designs ref. (B5 reads .omo/audit/g29-busnode-spec.md for send/receive terminology.)`,
    { label: `design:${c}`, phase: 'wave-B', model: 'sonnet' }),
  (_design, c) => agent(`Review ${c}: neu-only, a11y, no hot-file edits, no taxonomy changes.`,
    { label: `review:${c}`, phase: 'wave-B', model: 'sonnet' }),
  (_review, c) => verify(c, 'wave-B'),
);
// ━━ GATE B (HUMAN): may combine with GATE C. ━━

// ── WAVE C: C++ pipeline (worktree) → BlockEmbed. STRICTLY sequential (build-artifact + bridge-data dep). ──
phase('wave-C');
const c1 = await agent('C1 implement Bus Send/Receive C++ node per .omo/audit/g29-busnode-spec.md: RT-safe render() (no alloc/lock/blocking-IO); NodeFactory reg; bridge node metadata ~element_webview_host.cpp:4271; Boost.Test (routing send→receive, Receive-no-Send=silence, cycle guard, channel mismatch); cmake reconfigure (GLOB_RECURSE). No `using namespace juce` in headers.',
  { label: 'C1-busnode', phase: 'wave-C', isolation: 'worktree', model: 'opus' });
const c2 = await agent('C2 cmake --build build-merged --target element_app -j8; force-cp webview/dist/. → build-merged/element_app_artefacts/Element.app/Contents/Resources/webview/; AX/screenshot evidence the node appears + routes.',
  { label: 'C2-build', phase: 'wave-C', isolation: 'worktree', model: 'sonnet' });
const c3 = await agent('C3 BlockEmbed ground-up rebuild: DELETE all fake controls (build-failing grep gate: no ParamStripEmbed/MeterEmbed/SpectrumEmbed — all three at BlockEmbed.tsx:111/212/244); Tier-1 bespoke real mini-UI / Tier-2 per F5 verdict / Tier-3 info-card from C1 bridge data. Split Tier-1+Tier-3 first, Tier-2 only if feasible (≤3 files/sub-agent).',
  { label: 'C3-blockembed', phase: 'wave-C', model: 'opus' });
const waveC = await verify('wave-C', 'wave-C');
// ━━ GATE B-C (HUMAN): Glen + Chromatic batch confirm WB+WC. ━━

// ── WAVE D: cable single-owner + canvas. D1/D2/D4 ∥; D3 AFTER D2 (group-model dep). ──
phase('wave-D');
const [d1, d2, d4] = await parallel([
  () => agent('D1 SINGLE owner of Cable.tsx — G-24/25/26/27/28: direction+channel; MIDI hover live data (note/CC/channel); sidechain midi/audio/multi-parallel variants; REMOVE Surround; active-signal differentiation; bus send/receive repr (retire wireless ghost). Stop CONSUMING the useBusStore wireless map in the renderer but do NOT delete useBusStore (B5 + bus model still use it).',
    { label: 'D1-cable', phase: 'wave-D', model: 'sonnet' }),
  () => agent('D2 G-31 CommentFrame GROUP model: shared color + move-together + wrap-as-molecule + breadcrumb layers; expose group membership in useGraphStore for D3 (xyflow parent/child not used here).',
    { label: 'D2-comment', phase: 'wave-D', model: 'sonnet' }),
  () => agent('D4 G-30 CommandPalette mirror the native JUCE right-click menu per F5 verdict — Branch 20a (already bridged → webview reskin only) OR Branch 20b (new native enum fn → hybrid C++ + cmake/build/bundle-sync before in-app validation).',
    { label: 'D4-palette', phase: 'wave-D', model: 'sonnet' }),
]);
const d3 = await agent('D3 G-32 GraphCanvas auto-layout/overlap fix, GROUP-AWARE (respects D2 membership); preserve user-saved positions unless auto-layout is explicitly invoked.',
  { label: 'D3-canvas', phase: 'wave-D', model: 'opus' });
const waveD = await verify('wave-D', 'wave-D');
// ━━ GATE D (HUMAN): Glen + Chromatic batch confirm WD. ━━

// ── WAVE E: bug/perf re-verify (completion-manifest gated). ──
phase('wave-E');
const waveE = await parallel([
  () => agent('E1 re-run numeric perf vs .omo/audit/perf-baselines.md (boot / large-session / main-thread% / frame-time); assert within F7 budgets.',
    { label: 'E1-perf', phase: 'wave-E', model: 'sonnet', schema: VERDICT_SCHEMA }),
  () => agent('E2 UI re-verify over DONE components ONLY (manifest-gated, never in-flight/shelved): 28-bug reconciliation + new findings; fix P0/P1 → .omo/audit/reverify-findings.md.',
    { label: 'E2-reverify', phase: 'wave-E', model: 'opus' }),
]);
// ━━ GATE E (HUMAN): re-verify findings reviewed; P0/P1 closed or Glen-signed-off. ━━

// ── WAVE FINAL: 4 adversarial review lanes ∥ (non-oracle, non-ultrabrain — Claude only). ──
phase('wave-final');
const final = await parallel([
  () => agent('R1 Must-NOT grep audit: backdrop-blur / rgba transparency in component CSS (glass); off-taxonomy color; ParamStripEmbed/MeterEmbed/SpectrumEmbed (ALL THREE fake BlockEmbed controls); Surround/wireless cable variants; `using namespace juce` in new headers; alloc/lock in node render(); D5 persistence drift (category NOT written to .els — read/emit only); Vercel/web-deploy config; component edits to index.css/Records/AppShell/useAppStore; sub-agent git commits; \\boracle\\b/\\bultrabrain\\b across .omo/audit, .omo/evidence, .omo/state/sessions; shelved code intact (hidden not deleted). Output Must-Have[N/N] | Must-NOT[N/N] | VERDICT.',
    { label: 'R1-compliance', phase: 'wave-final', model: 'sonnet', schema: VERDICT_SCHEMA }),
  () => agent('R2 C++ Bus node RT-safety review: no alloc/lock/blocking-IO in render(); message-thread-only natives; code quality. VERDICT.',
    { label: 'R2-rtsafety', phase: 'wave-final', model: 'opus', schema: VERDICT_SCHEMA }),
  () => agent('R3 real manual QA — run EVERY task QA scenario against the build-merged Element.app (Playwright + AX), integration not mock. VERDICT.',
    { label: 'R3-qa', phase: 'wave-final', model: 'sonnet', schema: VERDICT_SCHEMA }),
  () => agent('R4 scope-fidelity: `git diff $(cat .omo/audit/plan-baseline-sha.txt)` (NOT HEAD~N); honor .omo/audit/plan-baseline-allowlist.md; flag creep / shipped-wave redesign / cross-task contamination / unaccounted changes. VERDICT.',
    { label: 'R4-scope', phase: 'wave-final', model: 'opus', schema: VERDICT_SCHEMA }),
]);
// ━━ GATE B(final) (HUMAN): orchestrator commits final wave (ONE git call); Glen batched runtime-confirm ALL waves → .omo/audit/confirmation-log.md. Do NOT push. ━━

return { foundation, waveA, waveB, c1, c2, c3, waveC, d1, d2, d3, d4, waveD, waveE, final };
```

### 6.3 `/oh-my-claudecode:ralph` (loop-until-green hardening of a GATE)

```
/oh-my-claudecode:ralph

TASK: Harden the GATE for <WAVE_ID> until green. Loop: run
  cd webview && npx tsc -b && npm run verify-stories && npx vitest run --project storybook
then Storybook MCP run-story-tests (interaction + a11y) for the wave's stories; then
  cmake -B build-merged -DELEMENT_BUILD_TESTS=ON && cmake --build build-merged -j8 && (cd build-merged && ctest --output-on-failure)
On any failure: fix the offending lane's files (NEVER touch frozen hot files: index.css/App.tsx/AppShell/useAppStore/Records/fixtures), re-run. Repeat until ALL pass.
VERIFICATION REVIEWER (separate pass, REQUIRED): code-reviewer (Claude opus). BANNED: oracle/ultrabrain/non-Claude.
STOP when: tsc + verify-stories + vitest storybook + run-story-tests + ctest all green AND the reviewer signs off. Do NOT commit (orchestrator commits at the wave boundary). Do NOT push.
```

### 6.4 When to pick each

- **`team`** — default; gated waves needing a single git writer + batched Glen review. The kickoff explicitly chose this model over worktree-parallel workers for the hot-file collision risk.
- **`ultrawork`** — Wave B's 5 independent component lanes and the non-gated F-prep, when you want maximum throughput and the canary already proved the pipeline.
- **Workflow tool** — when you want deterministic gates + machine-readable findings (schema'd `g29Spec`/`tier2Verdict`/`gateReports`) and worktree isolation for the C++ lanes.
- **`ralph`** — bolt onto any wave's GATE for autonomous loop-until-green hardening with a reviewer.

---

## 7. Risks & Mitigations (project-specific gotchas)

| Risk | Mitigation |
|---|---|
| **Webview-only build leaves Element.app's embedded webview stale** (dist→bundle copy only runs on `element_app` relink) | After `vite build`/webview-only change: `cp -R webview/dist/. build-merged/element_app_artefacts/Element.app/Contents/Resources/webview/`, or touch a `.cpp` to force the relink + POST_BUILD copy. (C2 does this explicitly.) |
| **Zustand v5 derived array/object selectors infinite-loop at mount** (blank-webview bug) | Any new derived array/object selector MUST use `useShallow`. Verify-stories catches the mount throw that tsc misses — required in every GATE. |
| **Repo git hook runs no-op `git reset` between calls** (unstages) | `git add … && git commit` must be ONE shell call, alone. NEVER batch git with other tool calls. Orchestrator-only commits. |
| **Stale `.git/index.lock`** from cancelled parallel calls blocks commits | `rm -f .git/index.lock` before the commit. Never run parallel git. |
| **Temp FS can fill (ENOSPC) → corrupts/elides tool output** | `export TMPDIR="$PWD/.omo/tmp"` (project volume `/Volumes/Projects`, measured 3.2 TiB free this session) for ALL worker spawns; `df -h .omo/tmp` to confirm free space first (§4 step 5, blocking). Redirect verbose command output to a gitignored repo-local file (`.omo/tmp/*`) then read that. (Earlier drafts cited a "2GB /private/tmp on disk3s7 100% full" — that was a transient/misread; the actual `/private/tmp` is on the data volume with ample space. The mitigation — pin TMPDIR to a verified-free dir — stands regardless.) |
| **Element is a desktop C++ app** | NEVER propose cloud/Vercel hosting of the webview. Keep all UI tooling local (Storybook :6006, Chromatic local token, 💬 panel → jsonl). Vercel/web-deploy = build-failing guardrail in R1. |
| **`file(GLOB_RECURSE)` sources** | New `.cpp` (Bus node) requires `cmake -B build-merged` reconfigure before build — C1 does this. |
| **JUCE headers** | NEVER `using namespace juce;` in headers (qualify `juce::`). `.cpp` only. Checked in R1. |
| **Sonnet 1M-context spawn failure** ("context limit / needs extra usage") | Pin standard 200k-context Claude models per sub-agent; canary before each fan-out; surgical scoping (≤3 files/task, only the lane's References — never the whole plan/broad globs); cap concurrency ≤4 until a wave proves stable. |
| **Hot-file write collisions** across parallel lanes | Single-writer in Wave F, then READ-ONLY; component lanes never edit index.css/App.tsx/AppShell/useAppStore/Records/another task's fixture. C++ lanes use worktree isolation. |
| **Cable cluster split across agents** | G-24..G-28 = ONE owner of Cable.tsx (lane D1). GraphCanvas layout (D3) is NOT inside cable tasks. |
| **Fake BlockEmbed controls surviving** | Build-failing grep gate in C3 + R1 (identical pattern in all 3 sections): `rg -n "ParamStripEmbed\|MeterEmbed\|SpectrumEmbed" BlockEmbed.tsx` → none. NOTE: there are **three** fakes (`:111` ParamStripEmbed, `:212` MeterEmbed, `:244` SpectrumEmbed) — gate ALL three so an executor can't delete two and leave a fake meter wired. |
| **Persistence/migration drift** | D5: taxonomy `category` never persisted to `.els`; NO migration code. **R1 now greps the save-path** (`rg -n "category" src/ + element_webview_host.cpp` → read/emit only, no `setProperty`/serialize of category) — not prose-only. |
| **Re-touching shipped Wave 1/2 work** | READ-ONLY (§1). R4 scope-fidelity diff vs baseline SHA flags any drift. |
| **Audio-path RT-safety** (G-29 `render()`) | No alloc/lock/blocking-IO on the audio callback path (`.cursor/rules/element-audio-path.mdc`). R2 reviews; C1 Boost.Test asserts routing/identity/cycle. |

---

## 8. Mapping Table (source → OMC; lineage audit — zero dropped)

| Source (ui-redesign-execution.md) | New OMC lane(s) | Wave |
|---|---|---|
| Task 1 (density tokens index.css, G-14) | F1 | F |
| Task 2 (shell+nav IA, shelve, SnippetShelf relocate wiring, G-13 scaffold) | F2 (+ F0 shelve split out) | F |
| Task 3 (Records audit+freeze) | F4 | F |
| Task 4 (demoGraph fixtures + SB/Chromatic config) | F6 | F |
| Task 5 (G-29 C++ discovery spec) | F3 | F |
| Task 6 (BlockEmbed Tier-2 + G-30 menu spikes) | F5 | F |
| Task 7 (G-01 VirtualKeyboard) | A1 | A |
| Task 8 (G-08 LiveHealth) | A2 | A |
| Task 9 (G-12/13 SessionTree) | B1 | B |
| Task 10 (G-17 ToolPalette) | B2 | B |
| Task 11 (G-15 SnippetShelf look) | B3 | B |
| Task 12 (G-10 QuickAccess) | B4 | B |
| Task 13 (G-05 BusInspector) | B5 | B |
| Task 14 (G-29 C++ impl+factory+bridge+Boost.Test) | C1 | C |
| Task 15 (G-29 cmake build+bundle sync+evidence) | C2 | C |
| Task 16 (G-20-23 BlockEmbed rebuild) | C3 | C |
| Task 17 (G-24/25/26/27/28 cable single-owner) | D1 | D |
| Task 18 (G-31 CommentFrame grouping) | D2 | D |
| Task 19 (G-32 GraphCanvas auto-layout) | D3 | D |
| Task 20 (G-30 CommandPalette native-menu) | D4 | D |
| Task 21 (perf baselines + guard) | F7 (capture early) + E1 (re-run) | F/E |
| Task 22 (UI re-verify 28-bug reconciliation) | E2 | E |
| Shelve G-06/G-09/G-11 (within Task 2) | F0 | F |
| F1 plan-compliance + Must-NOT grep | R1 | Final |
| F2 code-quality + RT-safety | R2 | Final |
| F3 real manual QA | R3 | Final |
| F4 scope-fidelity vs baseline SHA | R4 | Final |
| KICKOFF Pre-Wave-0.5 Hygiene + canary + protocol | §4 Pre-Flight Hygiene + §2.2 rules | pre-F |

**Count**: 22 source TODOs + 4 final-review (F1–F4) = **26 source tasks → 28 OMC lanes** (F0–F7 = 8, A1–A2 = 2, B1–B5 = 5, C1–C3 = 3, D1–D4 = 4, E1–E2 = 2, R1–R4 = 4 → **8+2+5+3+4+2+4 = 28**). **Zero dropped; +2 lanes are both additive splits, not new scope**: (i) F0 split out of source Task 2's shelve sub-step; (ii) source Task 21 maps to F7 (capture baselines early) + E1 (re-run after Wave D). Every source TODO maps to ≥1 lane in §8.

---

## 9. Dependency DAG (safe-parallelism for the scheduler)

```
Pre-Flight Hygiene (baseline SHA + dirty tree resolved) ─▶ CANARY
   │
   ▼
WAVE F (≤4 concurrent): F1  F2(+F0)  F3  F4  F5  F6  F7
   │   (F3,F5,F7 read-only; F1/F2/F4/F6 own hot files → then FROZEN.
   │    F0 = F2's FIRST sub-step, SAME single writer + worktree — NOT concurrent with F2's slot work.)
   ▼  GATE F (lead commits foundation; canary; freeze hot files)
   ├───────────────────────────┬──────────────────────────────────┐
   ▼ (∥)                        ▼ (∥)                               ▼ (∥)
WAVE A (pilots):          WAVE B (nav/IA, 5 ∥):              WAVE C (pipeline):
  A1(F1,F2)                 B1(F1,F2,F4,F6) B2(F1,F2,F4,F6)    C1(F3) ─▶ C2(C1) ─▶ C3(F5,C2)
  A2(F1,F2)                 B3(F1,F2) B4(F1,F2) B5(F1,F2,F3)
   │                            │                                 │
   ▼ GATE A                     └──────────────┬──────────────────┘
 (Glen+Chromatic — SOFT:                       ▼  GATE B-C (Glen+Chromatic;
  promotes the proven pilot                       B5 runtime-confirm AFTER C2 in this batch)
  pattern; does NOT gate B/C
  start — they are dep-ready at GATE F)
WAVE D:  D1(C2)   D2(F2) ─▶ D3(D2)   D4(F5)      (D1,D2,D4 ∥; D3 after D2)
                          ▼  GATE D (Glen+Chromatic)
WAVE E:  E1(F7)   E2(completion-manifest, post-WD)
                          ▼  GATE E
WAVE FINAL (∥): R1  R2  R3  R4  ─▶  GATE B(final): Glen confirms all → confirmation-log.md
```

**Critical path** (longest pole = the C++ chain, NOT the pilots): Hygiene → canary → GATE F → **C1 → C2 → C3** → D1 → (D2→D3) → E2 → R1–R4 → GATE B(final). Waves A and B run **∥ with Wave C** off GATE F; the 2-pilot GATE A is a soft throttle on the *pattern*, never a hard gate on B/C.
**Cross-lane edges to watch**: **F0 = F2's first sub-step** (one writer, F0 runs first → NO concurrent `App.tsx`/`useAppStore` edit; this is the fix for the prior "serialize commit" hazard, which did not prevent in-file races); B5 dep **F3** (g29 send/receive terminology), not GATE A; C1→C2→C3 strictly sequential (build artifact + bridge-data dependency); D2→D3 (group model before layout); E2 gated by the completion manifest (only audit `done` components).

---

## 10. Open Questions / Assumptions (reconciled conflicts + assumptions)

**Conflicts reconciled (KICKOFF vs execution):**
1. **Orchestration surface.** The KICKOFF prescribes `/start-work` + native sub-agents and argues AGAINST `team`/`autopilot`/`ultrawork` (hot-file collisions + the per-component human gate). This OMC plan's REMIT is to make it OMC-orchestration-ready, so it maps onto OMC surfaces while **preserving the KICKOFF's rationale**: `team` is run in **single-git-writer mode** (sub-agents edit only; lead commits) — which is functionally the KICKOFF's single-orchestrator model — and worktree isolation is reserved for the C++ lanes only. `ultrawork` is scoped to genuinely independent non-gated lanes. The human gate cadence (per-wave Glen+Chromatic) is preserved verbatim. **No scope or guardrail is weakened.**
2. **Agent vocabulary.** The sources use OMC category names (`visual-engineering`, `unspecified-high`, `deep`, `quick`, `code-reviewer`, `qa-tester`). The task brief asked for executor/designer/explore/architect/writer/code-reviewer/verifier/test-engineer. Mapping applied: `visual-engineering`→designer; `deep`→architect (opus); `quick`/`unspecified-high`→executor (sonnet); `qa-tester`→test-engineer; `code-reviewer`/`verifier` unchanged; read-only investigation→explore. Source category names retained in lane "Inputs/notes" where load-bearing.
3. **`/start-work` vs OMC native.** `/start-work` is not an OMC skill in the available registry; its tracked-boulder + batched-confirm semantics are reproduced by `team` (shared task list + wave gates) and `ralph` (loop-until-green). Documented, not silently dropped.

**Assumptions:**
- The dirty-tree resolution (Pre-Flight Hygiene §4) is a **blocking human decision** (Glen) — the plan PAUSES, does not auto-resolve.
- F3's single-node-vs-2-node verdict and F5's Tier-2 feasibility are genuine unknowns gating C1/C3 — those lanes consume the verdicts; if F5 says Tier-2 live-preview is infeasible, C3 falls back to scaled-screenshot/Tier-3 info-card (per source).
- `npm run verify-stories` and `npm run test:all` exist (verified: `package.json` `"test:all": "vitest run"`, `"verify-stories"` present). The DoD "0 failures" is baseline-relative (§4 step 6 / §5.5) because project memory records pre-existing unit failures on a sibling branch — capture the baseline before judging.
- TMPDIR must point at a verified-free dir; `.omo/tmp` on `/Volumes/Projects` (3.2 TiB free this session) is the recommended default. §4 step 5 makes the `df` check blocking before fan-out.
- **Known granularity reduction (disclosed, not a scope drop).** The canonical source `.omo/plans/ui-redesign-execution.md` carries a full `What to do` / `Must NOT do` / `References` / `Acceptance Criteria` / `QA Scenarios` block for every one of tasks 1–22. This OMC plan **intentionally compresses** each into one §3 lane row (scope + testable AC + deps + worktree) plus the §7 risk table and the R1 grep gate. The G-item *scope* is fully preserved (§0 ledger + §8 map, 1:1), but the per-task **Must-NOT-do bullets and QA-scenario steps are NOT duplicated here**. Therefore: **every executor MUST read its lane's source-task body** (mapped in §8) before editing — that is the authoritative Must-NOT/QA detail, and §6.1 rule 5 (surgical scoping) requires handing each worker exactly that source-task section. Do not treat this OMC file as a self-sufficient replacement for the per-task guardrails.

---

## 11. ADR — OMC orchestration of the UI redesign (consensus output)

**Decision.** Restructure the canonical `ui-redesign-execution.md` (22 tasks + F1–F4) into a WAVE→LANE→GATE plan (28 lanes) runnable on OMC surfaces, **augment-in-place as a new file** (Option A). Primary surface = `/oh-my-claudecode:team` in single-git-writer mode for the human-gated cadence; the native **Workflow** script (§6.2) is the deterministic, worktree-isolated fan-out for file-mutating lanes; `ralph` hardens each GATE; `ultrawork` fans the non-gated prep. Scope, guardrails, and the per-wave Glen+Chromatic gate are preserved verbatim.

**Drivers.** (1) User asked for an OMC-skill/Workflow-ready plan maximizing output + parallelism. (2) Hot-file write collisions (index.css, App.tsx/AppShell, useAppStore, taxonomy Records, demoGraph) are the real limiter on parallelism. (3) The sources carry hard-won, non-obvious gotchas (sonnet 1M-context spawn failure, temp-FS ENOSPC, git-hook `reset`/`index.lock`, webview-bundle-stale, Zustand `useShallow`) that must survive the restructure.

**Alternatives considered.**
- **B — single deterministic Workflow script only.** Rejected as *sole* surface: a pure script has no ergonomic seam for the interactive per-wave Glen+Chromatic runtime review (its GATEs are out-of-band operator steps). The Architect's antithesis (Workflow is the *more* deterministic enforcement surface) is honoured by **adopting it for the file-mutating fan-out** (§6.2 + synthesis), not by making it primary.
- **C — keep KICKOFF `/start-work` + bolt-on OMC notes.** Rejected: not "OMC-orchestration-ready" per the remit, and `/start-work` is not in the available OMC skill registry; its tracked-boulder + batched-confirm semantics are reproduced by `team` (shared task list + wave GATEs) and `ralph` (loop-until-green).

**Why chosen.** Option A maps onto OMC native surfaces (the remit) while functionally preserving the KICKOFF's single-orchestrator/single-git-writer model and the human-gate cadence — no scope or guardrail weakened. The hybrid-by-phase synthesis (Workflow for isolation-critical lanes, team for gated cadence) captures B's determinism where it matters without losing A's review ergonomics.

**Consequences.**
- (+) Genuine concurrency: off GATE F, Waves A ∥ B ∥ C all start (B/C no longer gated behind the 2-pilot GATE A — fixed this iteration); the C++ chain (C1→C2→C3) is the critical path, not the pilots.
- (+) Collision safety is now *structural*, not advisory: F0 folded into F2 as one writer of App.tsx/useAppStore; C++ lanes worktree-isolated; team workers restricted to non-git tools.
- (−) This OMC file is a **lane index, not a self-sufficient task spec**: per-task Must-NOT/QA detail lives in the source — every worker must be handed its mapped source-task body (§6.1 rule 5, §10).
- (−) Three orchestration surfaces to understand (team/Workflow/ralph); §6.4 routes when to use each.

**Follow-ups.** (1) Resolve the dirty-tree decision with Glen (§4 — blocking). (2) F3 (single-vs-2-node) + F5 (Tier-2 feasibility) verdicts gate C1/C3 — capture before those lanes. (3) Capture `test:all` baseline (§4 step 6) so the DoD is baseline-relative. (4) Pin a verified-free TMPDIR (`.omo/tmp`) before fan-out. (5) D1's now-dead wireless-store code logged in the completion manifest, closed by E2/R4.

---

## 12. Changelog — improvements applied from Architect + Critic consensus (iteration 1)

Consensus: **Architect SOUND-WITH-CHANGES** + **Critic ITERATE** (both Claude Opus; oracle/ultrabrain/Momus banned per Glen). All listed fixes applied:

1. **Workflow API (pre-review fix).** §6.2 rewritten from a fictional `agent({role,task})` API to the real `agent(prompt, opts)` / `phase(title)` / `parallel(thunks)` / `pipeline(items,…stages)` / pure-literal `meta`; schema'd `SPEC_SCHEMA`/`VERDICT_SCHEMA`; separate `verify()` reviewer lane.
2. **DAG over-serialization (Arch #1 / Critic-confirmed).** §9 redrawn so Waves A ∥ B ∥ C fork from **GATE F**; GATE A demoted to a soft pilot-pattern throttle; critical path corrected to the C++ chain. Mirrored in §6.1 task list.
3. **F0↔F2 hot-file race (Arch #2 / Critic-confirmed).** F0 folded into F2 as its first sub-step — one writer of App.tsx/useAppStore (§3 F0/F2 rows, §6.1 list, §9 edges). Removed the "separate concurrent lane / serialize commit" framing that didn't prevent in-file races.
4. **MeterEmbed gate gap (Critic B-2).** All three grep gates (C3 AC, R1, §7) now forbid `ParamStripEmbed|MeterEmbed|SpectrumEmbed` (was only 2 of 3 fakes — a fake meter could have survived).
5. **§7 weak/inconsistent grep (Critic B-1).** §7's `ParamStrip|fakeParams|demo` replaced with the exact C3/R1 pattern (the `fakeParams|demo` alternates were dead).
6. **False fidelity claim (Critic B-3).** §10 line corrected: the per-task Must-NOT/QA granularity is an *intentional, disclosed* reduction (source has full blocks for tasks 1–22); executors MUST read the mapped source-task body.
7. **D5 "Checked in R1" unbacked (Critic B-4).** R1 + §7 now carry a concrete D5 save-path grep (`category` not persisted to `.els`), not a prose claim.
8. **Surgical-scoping non-negotiable (Arch fidelity weakening).** Added as §6.1 rule 5 (≤3 files / own-References-only / read source-task body) — the rule that prevents the sonnet 1M-context spawn failure.
9. **pipeline-as-gate framing (Arch #3 / Critic minor).** §6.2 Wave A/B comments clarified: per-item design→review→verify, no cross-stage barrier; the human GATE runs after `await` settles; how to swap to a strict barrier noted.
10. **Concrete bundle path (Critic NB-1).** Every `<Element.app>` placeholder → `build-merged/element_app_artefacts/Element.app/Contents/Resources/webview/` (verified path).
11. **TMPDIR correction (Critic NB-3).** Stale "2 GB /private/tmp on disk3s7 100% full" replaced — measured `/Volumes/Projects` 3.2 TiB free; §4 step 5 now a blocking `df` check on `.omo/tmp`.
12. **test:all baseline (Critic B-5).** §4 step 6 captures the pre-existing failure baseline; DoD reframed to "no NEW failures vs baseline".
13. **B5↔C2 ordering + D1 dead-store owner (Critic NB-2/NB-5).** B5 runtime-confirm sequenced after C2 within GATE B-C; D1's dead wireless-store code assigned to the completion manifest, closed by E2/R4.
14. **Lane count (self-audit).** §8 corrected 27→28 with explicit arithmetic; both extra lanes are additive splits (F0; F7+E1), zero dropped.

**Residual (not blocking, disclosed):** this file is a lane index over the source, not a replacement; the interactive Glen+Chromatic GATEs are operator-run, not script-enforced (by design).

---

*End of plan. Status: pending approval. Run via §6.1 (team), §6.2 (Workflow), or §6.3 (ralph). Consensus: Architect SOUND-WITH-CHANGES + Critic ITERATE → all fixes applied (§12).*
