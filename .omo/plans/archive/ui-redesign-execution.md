> 🗄️ **ARCHIVED — SUPERSEDED. Do NOT execute.** Pre-bake-off 24-item neumorphic execution plan (G-01..G-32). Its OMC restructure was built as Pass-1, denied by Glen ("trash"), and reverted (`8d9575f9`). Replaced by the cherry-pick bake-off. Live successor: `.omo/plans/mvp-bakeoff-plan.md` · `.omo/bakeoff/VERDICTS.md` · `docs/adr/ADR-011-ui-cherrypick-bakeoff-method.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Element UI/UX Redesign + Re-Verify — Executable Multi-Agent Plan

## TL;DR

> **Quick Summary**: Execute the remaining 24 Element webview UI/UX redesign items (G-01..G-32 minus the 7 already shipped), shelve 3 out-of-scope features, add Bus Send/Receive C++ nodes, then run a bug/perf re-verify over the redesigned surface — all on the locked neumorphic design system, gated per-wave by automated tests + Chromatic + Glen's runtime confirm.
>
> **Deliverables**:
> - Wave-0.5 single-writer foundation (density tokens, shell/nav IA, Records, demoGraph fixtures) + 3 discovery spikes (G-29 C++ arch, BlockEmbed Tier-2 live-preview, G-30 native-menu bridge).
> - 3 shelved features hidden (code/stores intact): DashboardBuilder, MacroDashboard, SceneLauncher.
> - Redesigned components: VirtualKeyboard, LiveHealth IO, SessionTree, ToolPalette, SnippetShelf(relocated), QuickAccess, BusInspector, BlockEmbed (ground-up), Cables, CommentFrame, GraphCanvas, CommandPalette.
> - New C++ Bus Send/Receive nodes (replace wireless bus) + bridge data + Boost.Test.
> - Bug/perf re-verify: numeric engine/perf regression guard + UI re-audit over `done` components (28-bug reconciliation + new findings, fix P0/P1).
> - Per-component Storybook stories + `run-story-tests` + Chromatic baselines + addon-designs refs.
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — Wave 0.5 + 6 redesign waves + re-verify wave + final review wave; combined Glen+Chromatic gate per wave boundary.
> **Critical Path**: W0.5(foundation+G29 discovery) → Gate0.5 → WA pilots → WB nav/IA ∥ WC(G-29 C++ → BlockEmbed) → WD cables/canvas → WE re-verify → Final review → Gate B.

---

## Context

### Original Request
Audit the current Element UI/UX redesign plan + implementation status, research goals/feedback/project state, and rebuild it into a fully-specced executable plan optimized for maximum multi-agent parallel execution and optimum tool utilization — plus a fresh-session kickoff prompt.

### Reality update (what is already DONE + committed)
Branch `chromatic-ui-review`, **5 commits ahead of `origin/chromatic-ui-review`, NOT pushed** (`17600ce9` → `8408f6c5 docs: changelog + handover for Waves 0-2 + 2.2.0.17 release`). **Working tree is DIRTY and pre-existing** (NOT from this plan): `src/nodes/reroutenode.hpp` + `test/integration/SessionChangedTest.cpp` modified, plus many untracked WIP test files (`test/*Tests.cpp`). → orchestrator MUST run the Pre-Wave-0.5 Hygiene step (below) before any sub-agent reads `reroutenode.hpp` (task 5/14), and F4 diffs against a captured baseline SHA, not `HEAD~N`.
- `ff023feb` boot-hang / blank-UI / large-session fixes (+ `f85e246c` 6 earlier UI bugs).
- Wave 0 spec docs (CLAUDE.md + ELEMENT_UNIFIED_BLUEPRINT.md + DESIGN.md → 4-cat taxonomy, Module tier, shelved backlog).
- `a29ebbfc` Wave 1 quick-wins: G-02/G-03 NeuFader, G-04 NeuToggle, G-07/G-16 "smp" labels, G-19 mode persist.
- `dadc2c67` Wave 2 4-category taxonomy (G-18): instrument/audiofx/midifx/modulator, 3-axis CSS tokens (category/signal/accent), modulator purple #A87FE0 + hexagon, C++ `mapBlockCategory` 4-string emit + Boost.Test.

### Remaining scope = 24 open G-items (this plan)
Source notes: `.omo/audit/ui-comments.jsonl` (G-01..G-32). Shipped already: G-02,03,04,07,16,18,19.

| G-id | Component | Ask | Sev |
|---|---|---|---|
| G-01 | VirtualKeyboard | keys cut off (black keys unreachable), octave +/- control, velocity-by-Y, Mod + assignable-CC sliders | P1 |
| G-05 | BusInspector | tiny/contextless text → larger redesign, drag-drop add signals, highlight all senders/receivers | P2 |
| G-06 | DashboardBuilder | SHELVE (hide UI, keep code) | P2 |
| G-08 | LiveHealth | IO in/out activity too vague → detailed at-a-glance signal type + where | P2 |
| G-09 | MacroDashboard | SHELVE | P2 |
| G-10 | QuickAccess | needs far more useful info | P2 |
| G-11 | SceneLauncher | SHELVE | P0 |
| G-12 | SessionTree | show signal flow, component type, user-tagged name + instrument type, routing info | P0 |
| G-13 | SessionTree | drop "Graphs" term; boards/nodes/modules hierarchical/breadcrumb/multi-use (Module tier) | P0 |
| G-14 | (global) | everything too small — global sizing/density pass on every panel | P0 |
| G-15 | SnippetShelf | clarify what snippets are (prebuilt molecules); relocate into left project nav | P0 |
| G-17 | ToolPalette | full UI/UX redesign; fast component browsing (plugins/molecules/presets/templates); remove CPU load | P0 |
| G-20-23 | BlockEmbed | ground-up rebuild — fake demo controls; want bespoke-per-type UI → live plugin preview → useful info card | P0 |
| G-24 | Cable (Audio) | signal direction + channel; ports more visible/differentiated; fix overlap/auto-draw | P2 |
| G-25 | Cable (MIDI) | direction + channel; hover reveals live data; differentiate note/CC/channel | P2 |
| G-26 | Cable (Surround) | redundant → REMOVE | P2 |
| G-27 | Cable (Sidechain) | differentiate midi vs audio vs multi/parallel sidechain | P2 |
| G-28 | Cable (Active) | expand active-signal differentiation by type + data at a glance | P2 |
| G-29 | Cable (Wireless) | replace wireless-bus with Bus Send/Receive nodes (2-node or single in/out w/ mix) | P2 |
| G-30 | CommandPalette | mirror native JUCE right-click menu layout + content | P1 |
| G-31 | CommentFrame | grouping UX: shared color/movement, wrap as molecules, breadcrumb layers | P2 |
| G-32 | GraphCanvas | auto-layout/overlap broken → must never look like a mess | P2 |

### Ratified decisions (from corpus — do NOT re-litigate)
- **D1** 4-cat taxonomy DONE. **D2** Block/Container/Cable + "Module" tier. **D3** shelve = hide UI / keep code+stores (reversible). **D4** RATIFIED: remove Surround cables + Wireless→Bus Send/Receive. **D5** taxonomy `category` never persisted to `.els` (no migration). CSS token Option A (semantic rename + 3-axis) DONE.

### Grounded architecture (from explore agents this session)
- **Shell/composition**: `webview/src/App.tsx` mounts all panels into slot props (edit: SessionTree `App.tsx:89`, ToolPalette `:92`, InspectorHub `:96`, SnippetShelf `:97`; perform: QuickAccess `:98`, LiveHealth `:99`, PerformBottomPanel `:100`). `AppShell.tsx:150-284` = slot shell. **No nav registry** — slot-based. Visibility in `useAppStore.ts` (`leftPanelOpen`/`rightPanelOpen`/`bottomPanelOpen`, `togglePanel`). Shelve mechanism = conditional render at App.tsx mount + optional `useAppStore.hiddenPanels:Set`. DashboardBuilder+MacroDashboard mounted via `PerformBottomPanel` (`App.tsx:44` tab list, `:62` switch `tab==="macros" ? <MacroDashboard/> : <DashboardBuilder/>`); SceneLauncher **mounted** at `MacroDashboard.tsx:216` (`{activeTab === "scenes" && <SceneLauncher />}`) — NOT line 10 (that is the import); BusInspector embedded in `InspectorHub.tsx:52`.
- **Canvas**: `GraphCanvas.tsx:136` ReactFlow (`nodeTypes={block:Block,comment:CommentFrame}`, `edgeTypes={cable:Cable}` :51-52); zoom-tier debounce `:421-456` (compact/standard/expanded via `useGraphStore` thresholds :55-59). `Block.tsx:301` (memo :605); ports via `PortHandle` :171-217 + `PortShape` SVG :54-98 (audio circle / midi diamond / value square; colors :46-50). `BlockEmbed.tsx:339-366` category-driven content (ParamStrip always; Meter for instrument/audiofx; Spectrum audiofx) — **these are the fake demo controls to rebuild**. `Cable.tsx:18-32` signal→color/width, sidechain dash :184, wireless ghost :138-159, manhattan fan :101-114, glow :164-175. `CommentFrame.tsx:16-40` independent z-0 node, **no xyflow parent/child grouping** (G-31 must add a group model). `demoGraph.ts:741-763` (15 blocks/18 cables/2 comments). `useGraphStore`, `useBusStore` (cable→bus map), `useCableMeterStore`.
- **C++ Bus node (G-29) UNVERIFIED** — explore returned empty. Start refs only: `src/nodes/reroutenode.hpp` (**header-only — NO .cpp; pattern inlined in the .hpp**), plus the 2-file analogs `src/nodes/audiorouter.{hpp,cpp}` + `src/nodes/midirouter.{hpp,cpp}` (closest send/route templates with both files), `src/engine/nodefactory.cpp`, `include/element/nodefactory.hpp`, `.claude/skills/add-node/SKILL.md`, emit site `src/ui/element_webview_host.cpp` (`mapBlockCategory` ~:184, block snapshot ~:4271). → **discovery task 5 must verify before implementation**.

### Metis review — incorporated
Wave-0.5 single-writer foundation for hot files; cable cluster = single owner; G-29→BlockEmbed coupling; completion-manifest-gated re-verify; combined Glen+Chromatic gate per wave; sonnet-spawn mitigations; G-14 density tokenized FIRST; G-31 before G-32; spikes for Tier-2 + native-menu. Defaults applied for open Glen questions (see Decisions section at handoff).

---

## Work Objectives

### Core Objective
Ship the remaining 24 UI/UX redesign items on the locked neumorphic system, replace wireless bus with real Bus Send/Receive nodes, shelve 3 out-of-scope features, and re-verify functional + performance health over the redesigned surface — each change automated-tested, Chromatic-snapshotted, and Glen runtime-confirmed.

### Concrete Deliverables
- Foundation: density token scale (`index.css`), shell/nav IA (`App.tsx`/`AppShell.tsx`), Records field set, per-task demoGraph fixtures, discovery reports (`.omo/audit/g29-busnode-spec.md`, `.omo/audit/blockembed-tier2-spike.md`, `.omo/audit/g30-native-menu-bridge.md`).
- Redesigned component files + new/updated Storybook stories + Vitest tests + Chromatic baselines.
- New C++ `BusSendNode`/`BusReceiveNode` (or single send/receive node) + NodeFactory registration + bridge data + Boost.Test.
- `.omo/audit/completion-manifest.md` (per-component state), `.omo/audit/reverify-findings.md`, `.omo/audit/perf-baselines.md`.

### Definition of Done
- [ ] All 24 G-items implemented OR explicitly deferred-with-reason in the completion manifest. **No P0 item may be deferred; any deferral requires Glen's explicit sign-off** (logged in the manifest).
- [ ] `cd webview && npm run build` exit 0; `npm run test:all` 0 failures; `npx vitest run --project storybook` green.
- [ ] `cmake -B build-merged -DELEMENT_BUILD_TESTS=ON && cmake --build build-merged --target element_app -j8` exit 0; new C++ node Boost.Test passes.
- [ ] Chromatic baselines reviewed per wave; addon-designs ref attached per redesigned story.
- [ ] Re-verify: numeric perf within baselines; 28-bug reconciliation complete; new P0/P1 fixed.
- [ ] Zero fake/placeholder BlockEmbed controls survive (grep gate passes).
- [ ] Gate B: Glen runtime-confirms each wave batch; logged in `.omo/audit/confirmation-log.md`.

### Must Have
- Single-writer foundation landed + committed before component fan-out.
- G-29 discovery report before any C++ node code.
- BlockEmbed Tier-2 feasibility verdict before BlockEmbed rebuild commits to live-preview.
- Completion manifest gating the UI re-verify (never audit in-flight/shelved UI).
- Sub-agent execution protocol followed (no sonnet context-limit failures).

### Must NOT Have (Guardrails)
- **No off-spec styling**: neumorphism ONLY via `neumorphism-generator` skill + locked seed. No glass/blur/transparency, no decorative gradients, no color outside the 4-cat taxonomy tokens. Never free-generate tokens or re-seed mid-flight.
- **No web/cloud deploy** of the webview (Vercel et al. banned — C++ audio app).
- **No oracle / ultrabrain agents** (Glen ban). Review/verify = unspecified-high / deep / code-reviewer / qa-tester / verifier. Momus allowed for plan review only.
- **No re-touching shipped waves** (Wave 1/2) or already-committed fixes.
- **No shared-file edits by component tasks**: `index.css`, taxonomy Records, `App.tsx`/`AppShell.tsx`, **`webview/src/stores/useAppStore.ts`**, another task's demoGraph fixture are READ-ONLY after Wave 0.5 owners land them. Task 2 owns ALL `useAppStore` writes for the plan's duration; a downstream task needing new app-level state requests it through the orchestrator (which routes a small edit back to the task-2 owner), never extends the store itself.
- **No fake/placeholder controls** surviving in BlockEmbed (build-failing grep gate).
- **No persistence/migration code** (D5).
- **No cable-cluster split across agents** — G-24..G-28 = ONE owner of `Cable.tsx`.
- **No GraphCanvas layout refactor inside cable tasks** (that is G-32).
- **No alloc/lock/blocking-IO on the audio callback path** (G-29 node process()) — `.cursor/rules/element-audio-path.mdc`.
- **No `using namespace juce;` in headers.** New `.cpp` → cmake reconfigure (GLOB_RECURSE).
- **No premature abstraction** — extract a shared util only when ≥2 G-items provably need it.
- **No git ops by sub-agents** — sub-agents EDIT FILES ONLY; the main orchestrator does all commits (one `git add … && git commit` bash call per wave boundary).

### Banned-Agent Substitution
`oracle` + `ultrabrain` BANNED. Prometheus phase gates ran as non-oracle self-review + Metis (documented). Plan hard-gate = Momus (allowed). Execution review wave = `unspecified-high`/`code-reviewer`/`qa-tester`/`deep`.

---

## Sub-Agent Execution Protocol (CRITICAL — engineer out the sonnet context-limit failure)

> Known failure: `/start-work` sub-agents on claude sonnet error with "context limit / needs extra usage enabled" (the 1M-context-beta tier). This protocol guarantees error-free spawning.

0. **Pre-Wave-0.5 Hygiene (orchestrator, BEFORE the canary)** — (a) `git status` — the working tree is currently DIRTY with pre-existing files NOT from this plan (`src/nodes/reroutenode.hpp`, `test/integration/SessionChangedTest.cpp` modified + untracked `test/*Tests.cpp`). Resolve them FIRST: commit/stash/or record each on an explicit allow-list in `.omo/audit/plan-baseline-allowlist.md` with rationale. **`reroutenode.hpp` MUST be in a known state before task 5/14 read it.** (b) Capture the baseline: `git rev-parse HEAD > .omo/audit/plan-baseline-sha.txt` — F4 diffs against THIS SHA, never `HEAD~N`. (c) Re-sync the commit inventory (`git log --oneline origin/chromatic-ui-review..HEAD`) and confirm `8408f6c5` is the tip. Do NOT start the canary until (a)-(c) are done. **⚠️ Glen decision required**: the orchestrator PAUSES for Glen to choose commit / stash / allow-list for `reroutenode.hpp` + `SessionChangedTest.cpp` + the untracked `test/*Tests.cpp` before the canary runs.
1. **Model pinning** — Never invoke a sub-agent that requests the 1M-context sonnet variant. In OMC category routing, prefer `quick`/`visual-engineering`/`unspecified-high`/`deep` (standard 200k context). If the harness defaults heavy categories to a 1M-beta model, pin a concrete non-beta model (e.g. a standard claude opus/sonnet) in the Task call. Do NOT use `ultrabrain`/oracle (also banned). For the plan-review gate, use the **Claude Opus `critic`** agent (NOT Momus — it routed to a non-Claude model and aborted).
2. **Surgical scoping** — Each task prompt passes ONLY: its own TODO section text + the listed `file:line`/symbol references. NEVER paste the whole plan, never "read the whole component dir", never broad globs. Agents read only the files named in their References.
3. **≤3 files per task** — If a task touches 4+ files or 2 unrelated concerns, it is already split in this plan; do not re-merge.
4. **Pre-flight canary (per wave)** — Before fanning out a wave, spawn ONE trivial throwaway sub-agent (e.g. "echo the repo branch + confirm you can read webview/src/index.css first 5 lines"). If it errors, fix model/scoping before launching the wave. Abort fan-out on canary failure.
5. **Capped width** — Launch only as many concurrent sub-agents as the canary proved stable (start ≤4; raise only after a clean wave).
6. **Split heavy items** — BlockEmbed rebuild + G-29 are split into sub-tasks so no single agent needs large context.
7. **Orchestrator owns git + shared files** — sub-agents return diffs/edits; the main thread stages+commits in ONE bash call per wave; `rm -f .git/index.lock` if a stale lock blocks.
8. **tmpfs guard** — if a sub-agent's tool output corrupts (ENOSPC), redirect verbose command output to repo-local `.tmp/` (gitignored) and read that; truncate `*.output` in place if needed.
9. **Webview build sync** — after `npx vite build`, force-copy dist into the app bundle (`cp -R webview/dist/. <Element.app>/Contents/Resources/webview/`) — webview-only builds do NOT trigger POST_BUILD copy.

---

## Verification Strategy (MANDATORY — zero-human automated layer + Glen design gate ON TOP)

### Test Decision
- **Infrastructure exists**: YES (Vitest unit+storybook, Playwright, `mockJuceBridge.ts`, Boost.Test, AX harness, Chromatic, addon-designs, 💬 panel).
- **Automated tests**: every redesigned component ships a Storybook story + `run-story-tests` (interaction + a11y) + Vitest where logic exists; every C++ node ships Boost.Test; perf asserted with numeric budgets.
- **Frameworks**: `vitest` (`npm run test:all`, `npx vitest run --project storybook`), Playwright headless, Boost.Test (`ctest`), Chromatic, `tools/automation/element_verify.py` (AX).

### QA Policy
Every task includes agent-executed QA scenarios (happy + failure). Evidence → `.omo/evidence/task-{N}-{slug}.{png,json,txt}`.
- **UI component**: Storybook story renders + Playwright screenshot of `/iframe.html?id=<storyId>` + `run-story-tests` asserting concrete selectors/text (NOT integration proof — mock data).
- **Integration/bridge/C++**: run in `build-merged` Element.app; AX assertions + screenshot; Boost.Test invoking the native + asserting JSON/audio routing.
- **Perf**: numeric budget (boot ms / large-session ms / main-thread % / frame time) asserted by command + screenshot-diff within tolerance.
- **Build**: command exits 0.

### Tool Utilization Matrix (apply per task)
| Need | Tool | When |
|---|---|---|
| Real component props (no hallucination) | **Storybook MCP** `get-documentation` | before editing any component |
| Locked-palette layout exploration | **Stitch MCP** (seed `docs/stitch-reference/DESIGN.md`) | new layouts: ToolPalette, BlockEmbed, SessionTree |
| Neu CSS (shadows/gradients) | **neumorphism-generator** skill (`neu()`) | every surface needing depth |
| Icons / category shapes / textures / mockups | **HF Qwen image-gen** + creative-asset-pipeline | shapes, cable glyphs, empty-state art |
| Brand SVGs | **magic `logo_search`** | format/brand badges |
| Component scaffolding accelerator | **magic 21st builder** (fresh non-FleetView session) | optional kickstart, then reskin to neu/ |
| Community patterns | **uiverse-galaxy** (109 neu), **reactbits** (motion) | toggles/loaders/cards; text/scroll motion |
| Per-story design ref | **@storybook/addon-designs** `parameters.design` | attach DESIGN.md/Stitch/HF ref per redesigned story |
| Validate (interaction+a11y, self-heal) | **Storybook MCP** `run-story-tests` | every component, until green |
| Visual gate | **Chromatic** (local token in `webview/.env`) | wave boundary, on merged build |
| Human design review | **💬 panel** → `ui-comments.jsonl` | Glen flips note `fixed` at runtime |

### Human Gate Protocol (combined, per wave boundary)
- **One review event per component**: automated AC must pass FIRST (story + run-story-tests + Chromatic diff generated); THEN Glen runtime-confirms behavior AND accepts the Chromatic baseline → component marked `done` in the completion manifest.
- **Gate at wave boundaries, not per-task.** Chromatic preview-only during dev; baseline accept batched at the boundary.
- **Max wave width = components Glen can review in one batch** (default 4-6; Glen adjustable). Excess builds a confirm backlog → stalls merges.
- **Pipeline**: while Glen reviews wave N, agents start wave N+1's independent non-gated prep (tokens, C++ discovery, story scaffolding).
- **Fix-lane**: a rejected component goes to a fix-lane; it does NOT block the rest of the wave's merge.
- **Confirmation-invalidation**: a later task touching a confirmed component re-enters the confirm queue.

---

## Execution Strategy

### Parallel Execution Waves

```
WAVE 0.5 — Foundation (single-writer hot files + discovery) [after Pre-Wave-0.5 Hygiene + canary; ≤4 concurrent. Prioritise launching the two HIGH-LATENCY critical-path spikes 5 (G-29 C++) + 6 (Tier-2/menu) EARLY alongside 1-4 as slots free — they gate Waves C/D. Throttle only if the harness caps concurrency]:
├── 1: Density/sizing token scale in index.css (G-14 foundation)        [visual-engineering] owns index.css tokens
├── 2: Shell + nav IA: App.tsx/AppShell — shelve G-06/09/11, left-nav container, SnippetShelf relocation wiring, Module-tier nav scaffolding (G-13) [visual-engineering] owns App.tsx/AppShell
├── 3: Taxonomy Records audit + add fields needed by G-12/G-17, then freeze [unspecified-high] owns Records
├── 4: demoGraph per-task fixture strategy + Storybook/Chromatic config check [quick] owns demoGraph
├── 5: G-29 Bus Send/Receive C++ DISCOVERY → .omo/audit/g29-busnode-spec.md  [deep] read-only
└── 6: Spikes — BlockEmbed Tier-2 live-preview feasibility + G-30 native-menu bridge enumeration [deep] read-only

── GATE 0.5: orchestrator commits foundation; canary spawn-check; review spike verdicts ──

WAVE A — Independent pilots (prove pipeline) [parallel]:
├── 7: G-01 VirtualKeyboard redesign            [visual-engineering] (read-only foundation)
└── 8: G-08 LiveHealth IO detail                [visual-engineering]

── Gate A: Glen+Chromatic batch confirm WA ──

WAVE B — Nav/IA components (read-only shell/Records/tokens) [parallel]:
├── 9:  G-12/G-13 SessionTree redesign          [visual-engineering]
├── 10: G-17 ToolPalette rebuild                [visual-engineering]
├── 11: G-15 SnippetShelf new look (in left nav) [visual-engineering]
├── 12: G-10 QuickAccess info upgrade           [visual-engineering]
└── 13: G-05 BusInspector redesign              [visual-engineering]

WAVE C — C++ Bus node → Block system (sequential within wave) [runs ∥ WB]:
├── 14: G-29 Bus Send/Receive C++ node impl + NodeFactory + bridge data + Boost.Test + cmake reconfigure [deep] (dep 5)
├── 15: G-29 cmake build + bundle sync + runtime evidence                 [quick] (dep 14)
└── 16: G-20-23 BlockEmbed ground-up rebuild (fallback ladder; info-card reads G-29 bridge data) [visual-engineering] (dep 6,15)

── Gate B-C: Glen+Chromatic batch confirm WB+WC ──

WAVE D — Cable system + canvas [single cable owner; G-31 before G-32]:
├── 17: G-24/25/26/27/28 cable redesign — SINGLE owner of Cable.tsx (direction, channel, hover-data, sidechain variants, active-signal, remove Surround, bus send/receive repr) [visual-engineering] (dep 15)
├── 18: G-31 CommentFrame grouping/molecule data model + UX            [visual-engineering] (dep 2)
├── 19: G-32 GraphCanvas auto-layout / overlap fix (group-aware)       [deep] (dep 18)
└── 20: G-30 CommandPalette → native-JUCE menu mirror                  [visual-engineering] (dep 6)

── Gate D: Glen+Chromatic batch confirm WD ──

WAVE E — Bug/perf re-verify (completion-manifest gated) [parallel]:
├── 21: Capture numeric perf baselines + engine/perf regression guard (boot/large-session/memory/RT) [unspecified-high]
└── 22: UI re-verify over `done` components — 28-bug reconciliation + new findings, fix P0/P1 [deep] (dep manifest)

WAVE FINAL — review (parallel, non-oracle) then GATE B(final):
├── F1: Plan-compliance + Must-NOT grep audit        [unspecified-high]
├── F2: Code quality + RT-safety review              [code-reviewer]
├── F3: Real manual QA (all scenarios, integration)  [qa-tester + playwright]
└── F4: Scope-fidelity / contamination check         [deep]
── GATE B(final): Glen batched runtime-confirm all waves → confirmation-log.md ──

Critical path: Pre-W0.5 hygiene (baseline SHA + dirty-tree resolved) → canary → 1/2/5/6 → Gate0.5 → 7 → 14 → 15 → 16 → 17 → 19 → 22 → F1-F4 → GateB
Max concurrent: ≤4 (Wave 0.5, canary-gated), then 4-6 per gated wave.
```

### Agent Dispatch Summary
- **W0.5**: 1→visual-engineering, 2→visual-engineering, 3→unspecified-high, 4→quick, 5→deep, 6→deep
- **WA**: 7→visual-engineering, 8→visual-engineering
- **WB**: 9→visual-engineering, 10→visual-engineering, 11→visual-engineering, 12→visual-engineering, 13→visual-engineering
- **WC**: 14→deep, 15→quick, 16→visual-engineering
- **WD**: 17→visual-engineering, 18→visual-engineering, 19→deep, 20→visual-engineering
- **WE**: 21→unspecified-high, 22→deep
- **Final**: F1→unspecified-high, F2→code-reviewer, F3→qa-tester, F4→deep

### Dependency Matrix
| Task | Depends on | Blocks |
|---|---|---|
| 1-6 | — | all component waves |
| 7,8 | 1,2 | Gate A |
| 9,10 | 1,2,3,4 | Gate B-C |
| 11,12 | 1,2 | Gate B-C |
| 13 | 1,2,5 (g29 terminology; story-level, NOT 14) | Gate B-C |
| 14 | 5 | 15,16,17 |
| 15 | 14 | 16,17 |
| 16 | 6,15 | Gate B-C |
| 17 | 15 | Gate D |
| 18 | 2 | 19 |
| 19 | 18 | Gate D |
| 20 | 6 | Gate D |
| 21 | — (baselines early) | 22, Final |
| 22 | completion-manifest (post WD) | Final |
| F1-F4 | all impl | Gate B(final) |

---

## TODOs

- [ ] 1. Density/sizing token scale in `index.css` (G-14 foundation; single-writer)

  **What to do**:
  - Add an explicit density/spacing/font-size token ramp to `webview/src/index.css` `@theme` (e.g. `--space-1..8`, `--text-xs..lg`, `--control-h-sm/md/lg`, panel padding tokens) so "everything too small" (G-14) is fixed by tokens components READ, not per-component magic numbers.
  - Use the `neumorphism-generator` skill (`neu()`) to (re)generate any shadow/gradient helpers needed at the new sizes; keep the LOCKED neu look.
  - Document the ramp + intended usage at top of the token block so component tasks consume tokens (G-14 later = verify adoption only, no structural change).

  **Must NOT do**:
  - Do NOT restyle individual components here (token layer only). Do NOT alter the 4-cat taxonomy tokens or signal/accent axes (Wave 2, frozen). No new colors. No glass/blur.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — design-token authoring on the locked neu system.
  - **Skills**: `neumorphism-generator` (generate exact neu CSS at new sizes).
    - Omitted: `ui-ux-pro-max` (token ramp is mechanical, not layout design).

  **Parallelization**: **Wave 0.5**, parallel with 2-6. **Owns** `index.css`. **Blocks**: every component task (read tokens). **Blocked By**: none.

  **References**:
  - `webview/src/index.css` `@theme` block (existing 3-axis tokens from Wave 2 — line ~18-60) — add density tokens alongside; do NOT touch existing category/signal/accent vars.
  - `.claude/skills/neumorphism-generator/SKILL.md` + `webview/src/lib/neu.ts` — `neu()` helper to emit shadows.
  - `docs/stitch-reference/DESIGN.md` — locked palette/spacing reference.

  **Acceptance Criteria**:
  - [ ] New density/size tokens present in `@theme`; documented; `npx tsc -b` + `npm run build` exit 0.
  - [ ] A demo story (or existing panel story) visibly larger via tokens; Chromatic diff generated.

  **QA Scenarios**:
  ```
  Scenario: Tokens exist and build is green
    Tool: Bash
    Steps: 1. rg "--space-|--control-h-|--text-" webview/src/index.css | tee .omo/evidence/task-1-tokens.txt
           2. cd webview && npm run build; echo EXIT=$?
    Expected Result: tokens listed; EXIT=0.
    Evidence: .omo/evidence/task-1-tokens.txt, task-1-build.txt
  Scenario: No taxonomy token regression
    Tool: Bash (git diff)
    Steps: 1. git diff webview/src/index.css | rg "color-(instrument|audiofx|midifx|modulator|audio|midi|value|accent)"
    Expected Result: zero changes to those lines (only additions of density tokens).
    Evidence: .omo/evidence/task-1-no-taxonomy-diff.txt
  ```
  **Commit**: NO (orchestrator commits Wave 0.5 at Gate 0.5)

- [ ] 2. Shell + nav IA — `App.tsx`/`AppShell.tsx` (shelve G-06/09/11, left-nav container, SnippetShelf relocation, Module-tier nav scaffolding G-13; single-writer)

  **What to do**:
  - **Shelve (D3, reversible)**: add `useAppStore.hiddenPanels: Set<string>` (default-hidden the 3) so it's a FLAG, not a delete. Gate the **MOUNT sites** (never the imports): `App.tsx:44` (remove `"dashboard"` from the tab list) + `App.tsx:62` (the `tab==="macros" ? <MacroDashboard/> : <DashboardBuilder/>` switch → render nothing/hidden) for DashboardBuilder+MacroDashboard; `MacroDashboard.tsx:216` (`{activeTab === "scenes" && <SceneLauncher />}`) for SceneLauncher. Keep all imports + components + stores intact (compile-clean). If both perform-bottom tabs are hidden, hide the PerformBottomPanel container too.
  - **Left-nav container**: restructure the edit-mode left slot (`App.tsx:88-94`) into a project-nav container that hosts SessionTree + a relocated SnippetShelf section (G-15 wiring — move SnippetShelf out of bottom slot `App.tsx:97`). ToolPalette stays in left lower.
  - **Module-tier nav scaffolding (G-13)**: provide the nav shell hooks/slots for boards/nodes/modules breadcrumb hierarchy that SessionTree (task 9) fills — define the container + breadcrumb slot only, not SessionTree internals.

  **Must NOT do**:
  - Do NOT redesign SessionTree/SnippetShelf internals (tasks 9/11). Do NOT delete shelved code/stories. Do NOT edit `index.css` tokens (task 1) or Records (task 3).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — app-shell composition + nav IA.
  - **Skills**: none required.

  **Parallelization**: **Wave 0.5**, parallel with 1,3-6. **Owns** `App.tsx`/`AppShell.tsx`/`useAppStore` panel slots. **Blocks**: 7-13 (read shell), 18. **Blocked By**: none.

  **References**:
  - `webview/src/App.tsx:34-66` (`PerformBottomPanel` tabs — shelve DashboardBuilder/MacroDashboard), `:88-94` (edit left split), `:96-100` (slots).
  - `webview/src/components/layout/AppShell.tsx:150-284` (slot props shell).
  - `webview/src/stores/useAppStore.ts:19-21,89-99` (panel flags/toggle) — add `hiddenPanels`.
  - `webview/src/components/layout/MacroDashboard.tsx:216` (SceneLauncher MOUNT — gate this, not the `:10` import).
  - `webview/src/App.tsx:32,44,62` (`PerformTab` type, tab list, render switch — gate dashboard/macros here).
  - Blueprint Module-tier definition (Wave 0 docs) for breadcrumb/board/node terminology.

  **Acceptance Criteria**:
  - [ ] DashboardBuilder/MacroDashboard/SceneLauncher absent from rendered UI (flag-hidden), components/stores still compile.
  - [ ] SnippetShelf mounts inside left project nav (not bottom slot); edit layout intact.
  - [ ] `npm run build` exit 0; story for AppShell (or App smoke) renders without shelved panels.

  **QA Scenarios**:
  ```
  Scenario: Shelved panels hidden, code intact
    Tool: Bash + Storybook/Playwright
    Steps: 1. rg "hiddenPanels" webview/src/stores/useAppStore.ts
           2. Build + screenshot perform mode; assert no Dashboard/Macro/Scene tab.
    Expected Result: flag present; panels not rendered; build EXIT=0.
    Evidence: .omo/evidence/task-2-perform.png, task-2-flag.txt
  Scenario: SnippetShelf relocated
    Tool: Playwright (storybook AppShell story)
    Steps: 1. Render edit mode; assert SnippetShelf node inside left-nav container, not bottom slot.
    Expected Result: relocated.
    Evidence: .omo/evidence/task-2-leftnav.png
  ```
  **Commit**: NO

- [ ] 3. Taxonomy Records audit + add fields needed by G-12/G-17, then freeze (single-writer)

  **What to do**:
  - Audit the category Record sites (BlockEmbed CATEGORY_COLOR, QuickAddPopup CAT_ICON, ConnectionEditor/QuickAccess dots, InspectorHub, Block `catConfig` `Block.tsx:14-42`) for any NEW field SessionTree (G-12) or ToolPalette (G-17) will need (e.g. per-category display label, icon glyph, short description). Add those fields ONCE to the canonical category config, then declare it frozen/read-only for component tasks.
  - If no new field is required, record that verdict (the Records stay as-is) so downstream tasks consume read-only with confidence.

  **Must NOT do**:
  - Do NOT change taxonomy semantics/colors (Wave 2 frozen). Do NOT edit component layouts. Do NOT add fields not provably needed by G-12/G-17.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — cross-file schema reconciliation.
  - **Skills**: none.

  **Parallelization**: **Wave 0.5**, parallel. **Owns** category Records schema. **Blocks**: 9, 10. **Blocked By**: none.

  **References**:
  - `webview/src/components/canvas/Block.tsx:14-42` `catConfig` (canonical per-category map).
  - `webview/src/data/types.ts:2` `BlockCategory` union + `:18,:106` usages.
  - Record sites: BlockEmbed, QuickAddPopup, ConnectionEditor, QuickAccess, InspectorHub (per wave2 manifest).

  **Acceptance Criteria**:
  - [ ] `.omo/audit/records-schema.md` states the final category-config field set + "frozen" note; any added field has 4 exhaustive entries (instrument/audiofx/midifx/modulator).
  - [ ] `npx tsc -b` exit 0 (exhaustiveness holds).

  **QA Scenarios**:
  ```
  Scenario: Records exhaustive + typed
    Tool: Bash
    Steps: 1. npx tsc -b 2>&1 | tee .omo/evidence/task-3-tsc.txt
    Expected Result: 0 errors; schema doc lists 4 entries per field.
    Evidence: .omo/evidence/task-3-tsc.txt, .omo/audit/records-schema.md
  ```
  **Commit**: NO

- [ ] 4. demoGraph per-task fixture strategy + Storybook/Chromatic config check

  **What to do**:
  - Split fixture usage so component tasks never mutate the shared `webview/src/data/demoGraph.ts`: create small per-component fixture files (e.g. `webview/src/data/fixtures/{sessiontree,toolpalette,cable,blockembed}.ts`) derived from demoGraph, OR document an append-only rule. Each Wave-B/C/D task imports its own fixture.
  - Verify Storybook + Chromatic config is ready: `addon-designs` wired (`.storybook/main.ts`), Chromatic local token in `webview/.env`, `run-story-tests` runnable. Record the exact commands in `.omo/audit/storybook-chromatic-ready.md`.

  **Must NOT do**:
  - Do NOT change demoGraph semantics used by shipped stories. Do NOT commit secrets (`.env` stays gitignored).

  **Recommended Agent Profile**:
  - **Category**: `quick` — fixture scaffolding + config verification.
  - **Skills**: none.

  **Parallelization**: **Wave 0.5**, parallel. **Owns** demoGraph + fixtures. **Blocks**: 9,10,16,17. **Blocked By**: none.

  **References**:
  - `webview/src/data/demoGraph.ts:741-763` (DemoGraph shape: blocks/cables/commentBoxes/scenes/macros).
  - `webview/.storybook/main.ts` (addon-designs `^11.1.3`), `webview/.env` (Chromatic `chpt_` token, proven), `webview/package.json` scripts.
  - `.omo/audit/creative-toolchain-validation.md` (proven commands).

  **Acceptance Criteria**:
  - [ ] Per-component fixtures exist (or append-only rule documented); `npx tsc -b` exit 0.
  - [ ] `.omo/audit/storybook-chromatic-ready.md` lists working `run-story-tests` + Chromatic publish commands; `npx vitest run --project storybook` green.

  **QA Scenarios**:
  ```
  Scenario: Storybook test harness runs
    Tool: Bash
    Steps: 1. cd webview && npx vitest run --project storybook 2>&1 | tail -20 | tee .omo/evidence/task-4-storytests.txt
    Expected Result: suite runs green.
    Evidence: .omo/evidence/task-4-storytests.txt
  ```
  **Commit**: NO

- [ ] 5. G-29 Bus Send/Receive C++ DISCOVERY → `.omo/audit/g29-busnode-spec.md` (read-only)

  **What to do**:
  - Architecture is UNVERIFIED. Investigate and WRITE A MINI-SPEC (no code): (a) the exact NodeFactory registration pattern + file:line; (b) the existing "wireless bus" mechanism being replaced (grep `useBusStore`, `busName`, wireless cable path) and what removing it breaks; (c) the closest analog node (reroute/audio-router) to copy; (d) the **identity model** for Send↔Receive (matched by name? id? dropdown?); (e) **cycle handling** (does the engine guard Send→Receive→Send feedback?); (f) channel-count/mismatch behavior; (g) the bridge surface to expose node runtime data (name/type/color/cpu/activity) to the webview block snapshot; (h) RT-safety constraints for the new node's `process()`.
  - Decide single-node (in/out + mix) vs 2-node (Send + Receive) per G-29; record rationale + Glen-facing open question if ambiguous.

  **Must NOT do**:
  - Do NOT write/modify C++ here (spec only). Do NOT guess file:line — verify by reading.

  **Recommended Agent Profile**:
  - **Category**: `deep` — cross-cutting C++/engine architecture synthesis.
  - **Skills**: none (consult JUCE/Element docs per project rule).

  **Parallelization**: **Wave 0.5**, parallel. **Blocks**: 14. **Blocked By**: none.

  **References**:
  - `src/nodes/reroutenode.hpp` — closest CONCEPT analog (header-only, NO .cpp; inlined). For a full 2-file processor+editor template use `src/nodes/audiorouter.{hpp,cpp}` (+ `audioroutereditor.{hpp,cpp}`) and `src/nodes/midirouter.{hpp,cpp}` — these have real `.cpp` files to copy.
  - `src/engine/nodefactory.cpp` + `include/element/nodefactory.hpp` — registration site.
  - `.claude/skills/add-node/SKILL.md` — node scaffolding workflow.
  - `src/ui/element_webview_host.cpp` `mapBlockCategory` ~:184 + block snapshot ~:4271 — bridge emit (where node metadata surfaces).
  - `webview/src/stores/useBusStore.ts` (cable→bus map) — the wireless concept being replaced.
  - `.cursor/rules/element-audio-path.mdc` — RT-safety rules.

  **Acceptance Criteria**:
  - [ ] `.omo/audit/g29-busnode-spec.md` answers (a)-(h) with file:line citations + a chosen node shape + a back-compat note for old wireless sessions.

  **QA Scenarios**:
  ```
  Scenario: Spec is grounded not guessed
    Tool: Read
    Steps: 1. Confirm each claim in the spec cites a real file:line (spot-check 3 by opening them).
    Expected Result: citations resolve to real code.
    Evidence: .omo/audit/g29-busnode-spec.md
  ```
  **Commit**: NO

- [ ] 6. Spikes — BlockEmbed Tier-2 live-preview feasibility + G-30 native-menu bridge enumeration (read-only)

  **What to do**:
  - **Tier-2 spike**: determine whether a JUCE plugin editor can render inside the WebBrowserComponent webview (true live preview) vs only a parameter snapshot/screenshot. Write verdict → `.omo/audit/blockembed-tier2-spike.md` with the fallback decision (if not feasible, BlockEmbed Tier-2 = scaled screenshot or skip to Tier-3 info-card).
  - **G-30 spike**: determine whether the native JUCE right-click menu content is already exposed over the `element*` bridge, or if a new native menu-enumeration function is required. Write → `.omo/audit/g30-native-menu-bridge.md` with the menu item list source + whether task 20 needs a C++ bridge add (and its contract if so).

  **Must NOT do**:
  - Do NOT implement either feature (spike/verdict only). Do NOT invent a bridge fn without confirming the consumer need.

  **Recommended Agent Profile**:
  - **Category**: `deep` — feasibility investigation across C++/webview boundary.
  - **Skills**: none.

  **Parallelization**: **Wave 0.5**, parallel. **Blocks**: 16 (Tier-2 verdict), 20 (menu source). **Blocked By**: none.

  **References**:
  - `src/ui/element_webview_host.cpp` (`element*` native registry) — what's already bridged.
  - `webview/src/bridge/nativePluginEditor.ts` (`nativePluginEditorOpen`) — current editor-open path.
  - Native menu source: classic JUCE context menu in `src/ui/**` (grep `PopupMenu` / node context menu).
  - `webview/src/components/canvas/CommandPalette.tsx` + `QuickAddPopup.tsx` — current palette (the consumer).

  **Acceptance Criteria**:
  - [ ] Two verdict docs exist with a clear feasible/not-feasible + chosen fallback + (for G-30) whether a new native is needed and its contract.

  **QA Scenarios**:
  ```
  Scenario: Verdicts are actionable
    Tool: Read
    Steps: 1. Confirm each doc ends with a concrete "task 16/20 will therefore do X" instruction.
    Expected Result: downstream tasks unambiguous.
    Evidence: .omo/audit/blockembed-tier2-spike.md, .omo/audit/g30-native-menu-bridge.md
  ```
  **Commit**: NO

- [ ] 7. G-01 VirtualKeyboard redesign (pilot)

  **What to do**:
  - Fix the vertical layout so black keys are fully reachable (currently cut off — keys must render full and hittable).
  - Add octave add/remove controls (user sets range, not fixed 2 octaves).
  - Velocity scaled by vertical press position (press bottom = max velocity, top = min) — map Y within key to velocity 0-127.
  - Add a Modulation slider + at least one assignable-CC slider (user picks CC#).
  - Reskin with `neu()` + density tokens from task 1. Update/extend the Storybook stories (Default/FullVelocity/SoftVelocity + new octave/CC states).

  **Must NOT do**:
  - Do NOT edit `index.css` tokens (read-only), Records, or shell. No glass/blur. Fix the `VirtualKeyboard.tsx:49` sparse-array hole as part of the rebuild (no missing keys).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — interactive component redesign.
  - **Skills**: `neumorphism-generator` (key/slider neu surfaces). Optional `reactbits` for press feedback motion.
    - Omitted: Stitch (single component, not a layout system).

  **Parallelization**: **Wave A**, parallel with 8. **Blocked By**: 1,2.

  **References**:
  - `webview/src/components/layout/VirtualKeyboard.tsx` (current; sparse array `:49`).
  - `webview/src/components/layout/__stories__` or `VirtualKeyboard.stories.tsx` (states Default/FullVelocity/SoftVelocity).
  - Bridge for note/CC out: `webview/src/bridge/nativeKeyboard.ts`.
  - Storybook MCP `get-documentation` for current props before editing.

  **Acceptance Criteria**:
  - [ ] Black keys fully visible + clickable; octave +/- changes rendered range; velocity varies with Y; Mod + assignable-CC sliders present and emit values.
  - [ ] `run-story-tests` green (interaction asserts a black-key element is hittable + CC slider present); Chromatic diff generated; addon-designs ref attached.

  **QA Scenarios**:
  ```
  Scenario: Black keys reachable + velocity-by-Y
    Tool: Storybook + Playwright
    Steps: 1. Render keyboard story. 2. Assert >=1 element with black-key class is fully in viewport + clickable.
           3. Simulate press near bottom vs top of a key; assert emitted velocity high vs low.
    Expected Result: black keys hittable; velocity gradient by Y.
    Evidence: .omo/evidence/task-7-keys.png, task-7-velocity.txt
  Scenario: Octave control + CC slider
    Tool: Playwright
    Steps: 1. Click octave "+"; assert rendered key count increases. 2. Set CC slider; assert value emitted.
    Expected Result: range grows; CC emits.
    Evidence: .omo/evidence/task-7-octave.png
  ```
  **Commit**: NO (orchestrator commits Wave A at Gate A)

- [ ] 8. G-08 LiveHealth IO detail (pilot)

  **What to do**:
  - Replace the vague aggregate I/O activity with a detailed at-a-glance view: per-input / per-output activity with signal-type differentiation (audio vs midi vs value) and direction, so the user can see what kind of signal is happening and where.
  - Source real per-I/O data if available; if the bridge only emits one aggregate peak, show honest per-channel breakdown where data exists and a clear "no data" state otherwise (coordinate any new metering field with task 5/contract — do NOT fabricate).
  - Reskin with density tokens + `neu()`. Update LiveHealth stories (Nominal/Warning/Critical/Empty).

  **Must NOT do**:
  - Do NOT fabricate per-I/O values from an aggregate. No shell/token/Records edits. (Note: "smp" buffer label already fixed in Wave 1 — don't touch.)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`; HF image-gen optional for signal-type glyphs.

  **Parallelization**: **Wave A**, parallel with 7. **Blocked By**: 1,2.

  **References**:
  - `webview/src/components/layout/LiveHealth.tsx` (IO display).
  - `webview/src/stores/usePerformStore.ts:214-235` (`onMetering` `liveHealth`) — current metering shape.
  - `webview/src/components/layout/QuickAccess.tsx` (sibling consumer of metering, for parity).

  **Acceptance Criteria**:
  - [ ] Per-I/O activity with audio/midi/value differentiation + direction visible; honest empty/no-data state.
  - [ ] `run-story-tests` green (asserts distinct input vs output rows + signal-type marker); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Per-I/O signal detail visible
    Tool: Storybook + Playwright
    Steps: 1. Render LiveHealth Warning with mixed signals. 2. Assert separate input/output entries + a signal-type indicator (audio/midi/value).
    Expected Result: detailed, differentiated.
    Evidence: .omo/evidence/task-8-io.png
  Scenario: Empty state honest
    Tool: Playwright
    Steps: 1. Render Empty story. 2. Assert explicit no-data state, not fake values.
    Expected Result: honest idle.
    Evidence: .omo/evidence/task-8-empty.png
  ```
  **Commit**: NO

- [ ] 9. G-12/G-13 SessionTree redesign

  **What to do**:
  - Redesign SessionTree to clearly show signal flow, component type, BOTH user-tagged name and instrument/plugin type, and routing info (what routes where).
  - Replace "Graphs" terminology with the ratified boards/nodes/modules hierarchy (Module tier) — breadcrumb-navigable, multi-use (G-13). Plug into the nav container/breadcrumb slot from task 2.
  - Apply density tokens (larger, navigable — addresses "too small"). Reskin with `neu()`. Use Stitch MCP to explore the tree/list layout on the locked palette; reuse real props via Storybook MCP.
  - Update stories (WithGraphs→rename, Empty, SingleGraph, DirtyFile) + new Module/breadcrumb states.

  **Must NOT do**:
  - Do NOT edit `App.tsx`/`AppShell` (read the nav container task 2 built), `index.css` tokens, or Records (read-only). No "Graphs" label left.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`; `ui-ux-pro-max` (tree/IA layout patterns).

  **Parallelization**: **Wave B**, parallel with 10-13. **Blocked By**: 1,2,3,4.

  **References**:
  - `webview/src/components/layout/SessionTree.tsx` (current) + its `.stories.tsx`.
  - Nav container + breadcrumb slot from task 2 (`App.tsx`/`AppShell`).
  - `webview/src/bridge/nativeSession.ts` (`elementSessionGetGraphTree`) — real tree data.
  - `webview/src/components/canvas/Block.tsx:14-42` `catConfig` (read-only — type icon/colour).
  - Blueprint Module-tier definition (Wave 0 docs).

  **Acceptance Criteria**:
  - [ ] Tree shows user name + type + signal-flow/routing per entry; breadcrumb/Module hierarchy works; zero "Graphs" strings; visibly larger.
  - [ ] `run-story-tests` green (asserts a node row exposes both name + type, and a breadcrumb element); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Names + types + routing visible, no "Graphs"
    Tool: Storybook + Playwright + Bash
    Steps: 1. rg -i "graphs" webview/src/components/layout/SessionTree.tsx (expect none as UI label)
           2. Render WithGraphs story; assert a row shows user-name AND instrument type AND a routing/flow cue.
    Expected Result: no "Graphs" label; rich rows.
    Evidence: .omo/evidence/task-9-tree.png, task-9-nograph.txt
  Scenario: Breadcrumb/Module nav
    Tool: Playwright
    Steps: 1. Drill into a module; assert breadcrumb updates + back works.
    Expected Result: hierarchical nav.
    Evidence: .omo/evidence/task-9-breadcrumb.png
  ```
  **Commit**: NO

- [ ] 10. G-17 ToolPalette rebuild

  **What to do**:
  - Full UI/UX rebuild focused on FAST component browsing across types: plugins, molecules, presets, templates. Make finding/inserting a component fast and obvious (search + 4-cat taxonomy filters + favorites/recent).
  - REMOVE the CPU-load display from ToolPalette (not its job per Glen).
  - Use Stitch MCP for the browser layout on the locked palette; Storybook MCP for real props; `neu()` + density tokens. Use the 4-cat taxonomy Records (read-only) for category icons/colours.
  - Update stories (Populated, Empty, PluginsNoExtras; drop HighCpu).

  **Must NOT do**:
  - Do NOT keep CPU load. Do NOT edit Records/tokens/shell. Do NOT change taxonomy.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`; `ui-ux-pro-max` (browser/list/search patterns); `uiverse-galaxy` (neu list/card patterns).

  **Parallelization**: **Wave B**, parallel. **Blocked By**: 1,2,3,4.

  **References**:
  - `webview/src/components/layout/ToolPalette.tsx` + `.stories.tsx` (states incl. HighCpu to drop).
  - `webview/src/stores/usePluginBrowserStore.ts` (`inferBlockCategory`, list data).
  - `webview/src/components/canvas/QuickAddPopup.tsx` (sibling inserter — reuse search/category patterns).
  - `webview/src/components/canvas/Block.tsx:14-42` `catConfig` (read-only).

  **Acceptance Criteria**:
  - [ ] Fast browse: search + category filter + types (plugins/molecules/presets/templates) reachable; NO CPU load shown.
  - [ ] `run-story-tests` green (asserts search input + category filter controls + no CPU element); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Fast browsing, no CPU
    Tool: Storybook + Playwright + Bash
    Steps: 1. rg -i "cpu" webview/src/components/layout/ToolPalette.tsx (expect none)
           2. Render Populated; type in search; assert results filter; assert category filter present.
    Expected Result: search filters; no CPU; categories shown.
    Evidence: .omo/evidence/task-10-browse.png, task-10-nocpu.txt
  ```
  **Commit**: NO

- [ ] 11. G-15 SnippetShelf new look (in left nav)

  **What to do**:
  - Redesign SnippetShelf for its NEW home in the left project nav (task 2 relocated it). Make clear what snippets ARE (prebuilt/connected node molecules) — add a label/affordance. Present them as browsable items consistent with the project-nav IA.
  - Reskin with `neu()` + density tokens; reuse real props via Storybook MCP. Update stories (WithSnippets, Empty, SingleSnippet, ManySnippets) for the new container context.

  **Must NOT do**:
  - Do NOT re-add SnippetShelf to the bottom slot. Do NOT edit shell/tokens/Records.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`; `uiverse-galaxy` (neu list/card).

  **Parallelization**: **Wave B**, parallel. **Blocked By**: 1,2.

  **References**:
  - `webview/src/components/layout/SnippetShelf.tsx` + `.stories.tsx`.
  - Left-nav container from task 2.
  - Molecule concept: `webview/src/bridge/nativeGraph.ts` (`nativeMoleculeInsert`).

  **Acceptance Criteria**:
  - [ ] SnippetShelf renders in left-nav context with a clear "molecules/snippets" explanation + browsable items.
  - [ ] `run-story-tests` green (asserts label clarifying snippets + an item action); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Snippets clarified + browsable in left nav
    Tool: Storybook + Playwright
    Steps: 1. Render WithSnippets in left-nav story; assert explanatory label + an insert/use affordance per item.
    Expected Result: clear + actionable.
    Evidence: .omo/evidence/task-11-snippets.png
  ```
  **Commit**: NO

- [ ] 12. G-10 QuickAccess info upgrade

  **What to do**:
  - Make QuickAccess (perform-mode left panel) genuinely useful: surface meaningful per-block info (name, type, activity, key controls) instead of the current unhelpful tiles. Decide the highest-value info set for live performance and present it densely + legibly using density tokens.
  - Reskin with `neu()`; reuse real props via Storybook MCP. Update stories (WithBlocks, Empty, HighCpu).

  **Must NOT do**:
  - Do NOT edit shell/tokens/Records. No glass/blur.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`.

  **Parallelization**: **Wave B**, parallel. **Blocked By**: 1,2.

  **References**:
  - `webview/src/components/layout/QuickAccess.tsx` + `.stories.tsx`.
  - `webview/src/stores/usePerformStore.ts` (perform data), `useEngineSnapshotStore.ts` (activity).
  - `webview/src/components/canvas/Block.tsx:14-42` `catConfig` (read-only type icon/colour).

  **Acceptance Criteria**:
  - [ ] Each QuickAccess item shows name + type + a live-useful metric/control; legible at perform density.
  - [ ] `run-story-tests` green (asserts richer per-item content vs prior); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Useful info per block
    Tool: Storybook + Playwright
    Steps: 1. Render WithBlocks; assert each tile shows name + type + at least one live metric/control.
    Expected Result: informative tiles.
    Evidence: .omo/evidence/task-12-quickaccess.png
  ```
  **Commit**: NO

- [ ] 13. G-05 BusInspector redesign

  **What to do**:
  - Redesign BusInspector (embedded in InspectorHub) from tiny/contextless text into a larger, intuitive panel: drag-and-drop to add signals to/from buses, and a clear way to highlight + visually identify all components sending to / receiving from a bus.
  - Coordinate visual language with the new Bus Send/Receive model (G-29) — present buses in terms of send/receive endpoints. Reskin with `neu()` + density tokens; Storybook MCP for props; Stitch for the panel layout.
  - Update stories (Empty, SingleBus, MultipleBuses, OrphanEndpoint).

  **Must NOT do**:
  - Do NOT edit InspectorHub shell wiring beyond the embed slot, tokens, or Records. Do NOT implement the C++ bus node here (that's G-29/task 14).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`; `ui-ux-pro-max` (drag-drop + highlight patterns).

  **Parallelization**: **Wave B**, parallel. **Blocked By**: 1,2,5 (reads g29-busnode-spec for send/receive terminology). Story-level/fixture work — does NOT require the C++ node (task 14); the drag-drop + highlight are validated on a Storybook fixture, with live-app wiring confirmed at Gate B-C after task 15.

  **References**:
  - `webview/src/components/layout/BusInspector.tsx` (embedded `InspectorHub.tsx:52`) + `.stories.tsx`.
  - `webview/src/stores/useBusStore.ts` (bus model).
  - `.omo/audit/g29-busnode-spec.md` (task 5 — send/receive terminology).

  **Acceptance Criteria**:
  - [ ] Larger legible panel; drag-drop add signal works (story-level); selecting a bus highlights its senders/receivers; OrphanEndpoint handled.
  - [ ] `run-story-tests` green (asserts drag target + highlight affordance); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Drag-drop + highlight senders/receivers
    Tool: Storybook + Playwright
    Steps: 1. Render MultipleBuses; drag a signal onto a bus (assert it attaches in story state).
           2. Select a bus; assert connected sender/receiver items get a highlight class.
    Expected Result: intuitive add + highlight.
    Evidence: .omo/evidence/task-13-businspector.png
  ```
  **Commit**: NO

- [ ] 14. G-29 Bus Send/Receive C++ node implementation + NodeFactory + bridge data + Boost.Test

  **What to do**:
  - Implement the Bus Send/Receive node(s) EXACTLY per `.omo/audit/g29-busnode-spec.md` (task 5): processor class(es) following the reroute-node analog, NodeFactory registration, the chosen identity model (name/id/dropdown), and the agreed shape (2-node Send+Receive, or single in/out + mix).
  - Expose node runtime data (name/type/category/cpu/activity) to the webview block snapshot so BlockEmbed Tier-3 (task 16) can read it (per spec bridge surface).
  - Add a Boost.Test asserting actual audio routing send→receive (+ edge cases from spec: Receive-no-Send silence, cycle guard, channel mismatch).
  - RT-safety: node `process()` has NO alloc/lock/blocking-IO (`.cursor/rules/element-audio-path.mdc`).

  **Must NOT do**:
  - Do NOT add capabilities beyond the spec. No persistence/migration (D5). No `using namespace juce;` in headers. No opportunistic engine refactors. Do NOT build the cable UI here (task 17).

  **Recommended Agent Profile**:
  - **Category**: `deep` — C++/JUCE engine + threading correctness.
  - **Skills**: none (consult JUCE docs per project rule).

  **Parallelization**: **Wave C** (sequential within wave). **Blocks**: 15,16,17. **Blocked By**: 5.

  **References**:
  - `.omo/audit/g29-busnode-spec.md` (task 5 — the authoritative spec).
  - `src/nodes/reroutenode.hpp` (header-only concept analog), `src/nodes/audiorouter.{hpp,cpp}` + `src/nodes/midirouter.{hpp,cpp}` (2-file processor/editor templates to copy), `src/engine/nodefactory.cpp`, `include/element/nodefactory.hpp`.
  - `src/ui/element_webview_host.cpp` block snapshot ~:4271 (bridge emit).
  - `test/` Boost.Test pattern (e.g. `test/engine/BlockCategoryMapTest.cpp` from Wave 2) + `test/CMakeLists.txt`.
  - `.cursor/rules/element-audio-path.mdc` (RT rules).
  - Legacy back-compat fixture: use or CREATE `test/fixtures/legacy-wireless.els` (a minimal pre-existing session with ≥1 wireless-bus connection — spec the bus name + sender/receiver count) for the back-compat AC.

  **Acceptance Criteria**:
  - [ ] Node(s) registered + appear in the add menu under the correct taxonomy category.
  - [ ] Boost.Test: audio routes send→receive; Receive-no-Send = silence (no crash); cycle handled per spec.
  - [ ] No alloc/lock in `process()` (review + comment justifying any escape hatch).
  - [ ] **Back-compat**: loading a pre-existing `.els` session that used the old wireless-bus mechanism does NOT crash; the spec's documented behavior (graceful drop or auto-convert) holds — verified by opening a legacy session (re-checked in task 22).

  **QA Scenarios**:
  ```
  Scenario: Send→Receive routes audio
    Tool: Bash (ctest)
    Steps: 1. cmake -B build-merged -DELEMENT_BUILD_TESTS=ON && cmake --build build-merged --target test_element -j8
           2. ctest --test-dir build-merged -R "BusNode" --output-on-failure | tee .omo/evidence/task-14-ctest.txt
    Expected Result: routing test passes.
    Evidence: .omo/evidence/task-14-ctest.txt
  Scenario: Receive with no Send is safe
    Tool: Bash (ctest)
    Steps: 1. Run the no-send test case.
    Expected Result: silence, no crash.
    Evidence: .omo/evidence/task-14-nosend.txt
  ```
  **Commit**: NO (orchestrator commits Wave C)

- [ ] 15. G-29 cmake reconfigure + build + bundle sync + runtime evidence

  **What to do**:
  - Reconfigure for the new `.cpp` (GLOB_RECURSE): `cmake -B build-merged -DELEMENT_BUILD_TESTS=ON`; build `element_app` (and `test_element`).
  - If webview changed alongside, `cd webview && npx vite build` then force-cp dist into the `.app` bundle.
  - Launch `build-merged/...Element.app`; add a Send + Receive node; capture runtime evidence that the nodes appear and route (agent-complete; Glen confirms at gate).

  **Must NOT do**:
  - Do NOT skip the reconfigure. Do NOT hand-edit `webview/dist`.

  **Recommended Agent Profile**:
  - **Category**: `quick` — build orchestration + evidence capture.
  - **Skills**: none.

  **Parallelization**: **Wave C** (after 14). **Blocks**: 16,17. **Blocked By**: 14.

  **References**:
  - Build chain: `CMakeLists.txt` POST_BUILD; `.claude/skills/element-build-and-package/SKILL.md`.
  - Bundle sync note (creative-toolchain-validation / handover): `cp -R webview/dist/. <Element.app>/Contents/Resources/webview/`.

  **Acceptance Criteria**:
  - [ ] `cmake --build build-merged --target element_app -j8` exit 0; ctest BusNode passes.
  - [ ] Screenshot: Send + Receive nodes present in running app; block snapshot JSON shows new node metadata.

  **QA Scenarios**:
  ```
  Scenario: App builds + nodes present
    Tool: Bash
    Steps: 1. cmake -B build-merged -DELEMENT_BUILD_TESTS=ON && cmake --build build-merged --target element_app -j8; echo EXIT=$?
           2. Launch app; add Send+Receive; screenshot.
    Expected Result: EXIT=0; nodes visible.
    Evidence: .omo/evidence/task-15-build.txt, task-15-nodes.png
  ```
  **Commit**: NO

- [ ] 16. G-20-23 BlockEmbed ground-up rebuild (fallback ladder)

  **What to do**:
  - DELETE the fake demo controls (current ParamStrip/Meter/Spectrum that are identical across plugins and control nothing) and rebuild BlockEmbed on a deterministic fallback ladder — every block resolves to EXACTLY ONE tier:
    - **Tier 1 (bespoke)**: for the enumerated built-in/simple types (e.g. reroute, bus send/receive, midi utility, value/modulator nodes) render a real, functional mini-UI that controls the node.
    - **Tier 2 (live/scaled preview)**: ONLY if task-6 spike confirmed feasible — else a scaled screenshot of the plugin editor, else skip to Tier 3.
    - **Tier 3 (info card)**: useful info — activity, CPU, audio/midi/effect type, plugin name, taxonomy colour, user name — sourced from the G-29 bridge data (task 14) + existing snapshot fields.
  - Reskin with `neu()` + density tokens; Storybook MCP for props; HF image-gen for any glyphs. Per-tier stories + fixtures.

  **Must NOT do**:
  - Do NOT keep any fake/placeholder control (build-failing grep gate). Do NOT commit to Tier-2 live preview unless task-6 verdict says feasible. Do NOT edit tokens/Records/shell.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — component rebuild with real data wiring.
  - **Skills**: `neumorphism-generator`; `ui-ux-pro-max` (info-card/control layout).

  **Parallelization**: **Wave C** (after 15). **Blocked By**: 6 (Tier-2 verdict), 15 (bridge data). Split into Tier-1+Tier-3 first, Tier-2 only if feasible — keep ≤3 files per sub-agent.

  **References**:
  - `webview/src/components/canvas/BlockEmbed.tsx:339-366` (category-driven content — the fake controls to delete) + `:111-151` ParamStrip / `:212-240` Meter / `:244-309` Spectrum.
  - `.omo/audit/blockembed-tier2-spike.md` (task 6 — Tier-2 decision).
  - G-29 bridge fields (task 14) for the info card.
  - `webview/src/stores/useParameterStore.ts`, `useEngineSnapshotStore.ts` (activity/cpu), `Block.tsx:14-42` `catConfig` (read-only colour/type).
  - `BlockEmbed.stories.tsx` + per-tier fixtures (task 4).

  **Acceptance Criteria**:
  - [ ] Every block resolves to exactly one tier; ZERO fake controls remain (grep gate passes); info-card shows real activity/CPU/type/name/colour.
  - [ ] Per-tier stories + `run-story-tests` green (Tier-3 story asserts a CPU text node + taxonomy colour class; NoEditorPlugin → Tier-3 not a fake control); Chromatic diff; addon-designs ref.
  - [ ] **If task-6 spike says Tier-2 NOT feasible**: `.omo/audit/completion-manifest.md` records the affected block-types now served by Tier-3 only, and this scope reduction (live-preview deferred) is explicitly surfaced for Glen's approval at Gate B-C — NOT silently absorbed.

  **QA Scenarios**:
  ```
  Scenario: No fake controls survive
    Tool: Bash (grep gate)
    Steps: 1. rg -n "ParamStripEmbed|SpectrumEmbed" webview/src/components/canvas/BlockEmbed.tsx (expect removed/replaced)
    Expected Result: legacy fake-control identifiers gone.
    Evidence: .omo/evidence/task-16-no-fake.txt
  Scenario: Info card shows real data
    Tool: Storybook + Playwright (Tier-3 fixture)
    Steps: 1. Render a no-editor plugin block. 2. Assert CPU text + plugin name + taxonomy colour class present; no interactive fake fader.
    Expected Result: honest info card.
    Evidence: .omo/evidence/task-16-infocard.png
  Scenario: Bespoke tier controls the node
    Tool: Playwright (running app, Tier-1 node)
    Steps: 1. Add a bus-send node; adjust its embed control; assert the node param actually changes.
    Expected Result: real control.
    Evidence: .omo/evidence/task-16-bespoke.png
  ```
  **Commit**: NO

- [ ] 17. G-24/25/26/27/28 cable redesign — SINGLE owner of `Cable.tsx`

  **What to do** (ONE cohesive task — do NOT split across agents):
  - **G-24 audio**: clearer signal direction + channel count; make ports more visible/differentiated on blocks (coordinate with `Block.tsx` PortHandle — read-only there, style via cable/handle props).
  - **G-25 midi**: direction + channel; hover reveals live transmitted data (note on/off, common CC values, channel); differentiate signal subtypes.
  - **G-26 surround**: REMOVE the Surround (six-channel) cable variant entirely (ratified D4).
  - **G-27 sidechain**: differentiate sidechain variations — midi vs audio vs multi/parallel.
  - **G-28 active**: expand active-signal differentiation by type + data at a glance.
  - **G-29 representation**: render Bus Send/Receive endpoints (the new node model) instead of wireless ghost; remove/retire the wireless-bus cable rendering per spec.
  - Reskin with `neu()`; HF image-gen for any direction/glyph assets; update Cable stories (Audio, Midi, Sidechain variants, ActiveWithSignal; DELETE SurroundSixChannel + WirelessBusBadge).

  **Must NOT do**:
  - Do NOT refactor GraphCanvas layout/auto-layout (that's task 19/G-32). Do NOT edit `Block.tsx` internals (read-only for port geometry). Keep wireless removal scoped to `Cable.tsx` rendering — stop CONSUMING the `useBusStore` wireless `cableBus` map in the cable renderer, but do NOT delete `useBusStore` (task 13 BusInspector + the new bus model still use it); record any now-dead wireless store code as a follow-up in the completion manifest rather than deleting it here. No tokens/Records edits.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: `neumorphism-generator`; HF image-gen via creative-asset-pipeline for glyphs.

  **Parallelization**: **Wave D**, parallel with 18,20 (different files). **Blocked By**: 15 (bus node exists). **Owns** `Cable.tsx`.

  **References**:
  - `webview/src/components/canvas/Cable.tsx:18-32` (type→color/width), `:101-114` (manhattan fan), `:138-159` (wireless ghost — remove), `:164-175` (glow), `:184` (sidechain dash).
  - `webview/src/components/canvas/Block.tsx:54-98,171-217` (PortShape/PortHandle — read-only; differentiate via props).
  - `webview/src/stores/useCableMeterStore.ts` (live levels for hover data), `useBusStore.ts` (retire wireless map).
  - `webview/src/data/fixtures/cable.ts` (task 4) + `Cable.stories.tsx`.
  - `.omo/audit/g29-busnode-spec.md` (send/receive representation).

  **Acceptance Criteria**:
  - [ ] Direction + channel shown; midi hover reveals data; sidechain variants distinct; Surround + Wireless variants removed; bus shown via send/receive.
  - [ ] `run-story-tests` green (asserts direction marker + a sidechain variant class; SurroundSixChannel/WirelessBusBadge stories gone); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Direction/channel + midi hover data
    Tool: Storybook + Playwright
    Steps: 1. Render Cable Midi; assert a direction indicator + channel label. 2. Hover; assert a tooltip with note/CC data.
    Expected Result: informative cable.
    Evidence: .omo/evidence/task-17-cable-midi.png
  Scenario: Surround + Wireless removed
    Tool: Bash
    Steps: 1. rg -i "surround|wireless" webview/src/components/canvas/Cable.tsx (expect none as variants)
    Expected Result: variants gone.
    Evidence: .omo/evidence/task-17-removed.txt
  ```
  **Commit**: NO

- [ ] 18. G-31 CommentFrame grouping/molecule data model + UX

  **What to do**:
  - Make commenting behave like grouping: items moved/arranged inside a comment frame share attributes (color, movement) and can be wrapped/saved as molecules with breadcrumb layers for multi-use.
  - Add the GROUP DATA MODEL (membership: which blocks belong to a frame; shared transform) since xyflow parent/child grouping is NOT currently used (`CommentFrame.tsx` independent z-0 node). This data model is consumed by G-32 auto-layout (task 19).
  - Reskin with `neu()`; update CommentFrame stories (Blue/Orange/Teal/Unlabeled + Grouped state).

  **Must NOT do**:
  - Do NOT implement auto-layout (task 19). Do NOT edit shell/tokens. Coordinate the molecule-save bridge with existing `nativeMoleculeInsert` — don't invent a new native without confirming need.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — component + local state/data model.
  - **Skills**: `neumorphism-generator`.

  **Parallelization**: **Wave D**, parallel with 17,20. **Blocks**: 19. **Blocked By**: 2.

  **References**:
  - `webview/src/components/canvas/CommentFrame.tsx:16-40` (independent node, no grouping).
  - `webview/src/components/canvas/GraphCanvas.tsx:78-95` (comment node conversion), `:296-342` (drag handling).
  - `webview/src/stores/useGraphStore.ts` (comments, selection) — add group membership.
  - `webview/src/bridge/nativeGraph.ts` (`nativeMoleculeInsert`, `nativeGraphCommentUpsert`).

  **Acceptance Criteria**:
  - [ ] A comment frame has member blocks; moving the frame moves members; members share frame color; "save as molecule" affordance present.
  - [ ] Group membership exposed in store for task 19; `run-story-tests` green; Chromatic diff.

  **QA Scenarios**:
  ```
  Scenario: Frame groups + moves members
    Tool: Storybook + Playwright
    Steps: 1. Render Grouped story; drag the frame; assert member blocks move with it + share color.
    Expected Result: grouping behavior.
    Evidence: .omo/evidence/task-18-group.png
  ```
  **Commit**: NO

- [ ] 19. G-32 GraphCanvas auto-layout / overlap fix (group-aware)

  **What to do**:
  - Fix the broken auto-draw/layout/overlap so the canvas is never a cluttered mess: implement (or repair) auto-layout + cable-overlap reduction so blocks and cables arrange readably. Must be GROUP-AWARE — respect CommentFrame groupings from task 18 (members laid out together).
  - Preserve user-saved positions (do NOT clobber manual layout silently — auto-layout is an explicit action/option). Reuse existing alignment/distribute utilities in `useGraphStore`.
  - Add a GraphCanvas story (or harness) demonstrating before/after tidiness.

  **Must NOT do**:
  - Do NOT mutate user-saved node positions without an explicit trigger. Do NOT edit `Cable.tsx` (task 17). No tokens/Records/shell edits.

  **Recommended Agent Profile**:
  - **Category**: `deep` — layout algorithm + xyflow integration.
  - **Skills**: `neumorphism-generator` (only if surface chrome changes).

  **Parallelization**: **Wave D** (after 18). **Blocked By**: 18 (group model).

  **References**:
  - `webview/src/components/canvas/GraphCanvas.tsx:419` (zoom debounce), `:441` (viewport), `:296-342` (drag), `:78-95` (comment nodes).
  - `webview/src/stores/useGraphStore.ts` (alignment/distribution helpers, positions, group membership from task 18).
  - `@xyflow/react` layout patterns (consult docs; optionally a layout lib already in deps).

  **Acceptance Criteria**:
  - [ ] Auto-layout produces non-overlapping readable arrangement; group members stay together; manual positions preserved unless auto-layout invoked.
  - [ ] Story/harness shows tidy result; `run-story-tests`/Vitest assert no overlapping bounding boxes after layout; Chromatic diff.

  **QA Scenarios**:
  ```
  Scenario: Auto-layout removes overlap, respects groups
    Tool: Vitest / Playwright
    Steps: 1. Load a messy fixture; invoke auto-layout; assert 0 overlapping block bounding boxes + group members adjacent.
    Expected Result: tidy, grouped.
    Evidence: .omo/evidence/task-19-layout.png, task-19-overlap.txt
  Scenario: Manual positions preserved
    Tool: Vitest
    Steps: 1. Set manual positions; reload WITHOUT invoking auto-layout; assert positions unchanged.
    Expected Result: no silent clobber.
    Evidence: .omo/evidence/task-19-preserve.txt
  ```
  **Commit**: NO

- [ ] 20. G-30 CommandPalette → native-JUCE menu mirror

  **What to do**:
  - Make the right-click/command menu mirror the native JUCE UI menu layout + content. Use the menu source identified in `.omo/audit/g30-native-menu-bridge.md` (task 6). **The task-6 verdict selects the branch:**
    - **Branch 20a (menu already bridged)** — consume the existing bridge; pure webview reskin. Agent `visual-engineering`, no build step.
    - **Branch 20b (new native enumeration fn required)** — this becomes a HYBRID C++ + webview task: agent `deep`; implement the native message-thread per the task-6 contract; then a sibling build step (`cmake -B build-merged` reconfigure + `element_app` build + bundle force-cp, mirroring task 15) MUST run before the palette is validated in-app.
  - Reskin the palette with `neu()` + density tokens; keep search if present. Update CommandPalette stories (Open, EmptyResults) to reflect the native menu structure.

  **Must NOT do**:
  - Do NOT invent menu items not in the native menu. Do NOT add a bridge fn beyond the task-6 contract. No tokens/Records/shell edits. (20b) No alloc/lock on audio thread — the menu enumeration native is message-thread.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` (Branch 20a) OR `deep` (Branch 20b, C++ native + webview) — **orchestrator picks the category from the task-6 verdict before dispatch**.
  - **Skills**: `neumorphism-generator`.

  **Parallelization**: **Wave D**, parallel with 17,18. **Blocked By**: 6 (verdict + branch selection). Branch 20b adds a cmake/build/bundle-sync sibling before validation.

  **References**:
  - `.omo/audit/g30-native-menu-bridge.md` (task 6 — menu source + any contract).
  - `webview/src/components/canvas/CommandPalette.tsx` + `.stories.tsx`.
  - Native menu: `src/ui/**` PopupMenu / node context menu (per spike).
  - `webview/src/bridge/*` (consume bridged menu if available).

  **Acceptance Criteria**:
  - [ ] Palette layout + items match the native JUCE menu (verified against the spike's enumerated list).
  - [ ] `run-story-tests` green (asserts the expected native menu items present); Chromatic diff; addon-designs ref.

  **QA Scenarios**:
  ```
  Scenario: Menu mirrors native
    Tool: Storybook + Playwright + Read
    Steps: 1. Render Open; assert items match the list in g30-native-menu-bridge.md (same labels/order/grouping).
    Expected Result: parity.
    Evidence: .omo/evidence/task-20-palette.png
  ```
  **Commit**: NO

- [ ] 21. Capture numeric perf baselines + engine/perf regression guard

  **What to do**:
  - Capture numeric baselines NOW (against current committed build) → `.omo/audit/perf-baselines.md`: boot time (with 1996-plugin fixture), large-session load time, idle main-thread CPU, memory, and the high-freq loop budgets (engine snapshot poll, ~60Hz cable metering, ~15Hz param delta).
  - Define a repeatable regression check (script/command) asserting each metric stays within budget; this is UI-independent and runs after each wave merge + finally here. Includes shelved code (hidden code still ships in bundle).
  - Verify perf-sensitive loops weren't regressed by the redesign (Cable metering after task 17; canvas after task 19).

  **Must NOT do**:
  - Do NOT change perf frequency without proving visual parity + data correctness. Do NOT audit UI bugs here (task 22).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — measurement + numeric assertion.
  - **Skills**: none (Playwright/Chrome DevTools perf trace via Bash).

  **Parallelization**: **Wave E**, parallel with 22. **Blocked By**: none (baselines early); final pass after WD.

  **References**:
  - `webview/src/stores/useEngineSnapshotStore.ts:109` (poll), `useJuceBridge.ts:431` (cable 60Hz), `:441` (param 15Hz).
  - Boot fixture: 1996-plugin/~700KB (handover ROOT CAUSE #1).
  - `tools/automation/element_verify.py` (AX), `cmake --build` timing.

  **Acceptance Criteria**:
  - [ ] `.omo/audit/perf-baselines.md` has numeric baselines + budgets; a regression command exists and passes on the redesigned build.
  - [ ] Cable metering + canvas within budget post-redesign (trace evidence).

  **QA Scenarios**:
  ```
  Scenario: Boot within budget
    Tool: Bash (sample) + fixture
    Steps: 1. Boot with 1996-plugin fixture; sample at T+10s; assert main thread idle + boot < budget.
    Expected Result: within baseline.
    Evidence: .omo/evidence/task-21-boot.txt
  Scenario: Metering within budget after redesign
    Tool: Playwright + perf trace
    Steps: 1. Load ~20-cable graph w/ signal; 10s trace; assert no long tasks > 50ms, main-thread < 60%.
    Expected Result: within budget.
    Evidence: .omo/evidence/task-21-trace.json
  ```
  **Commit**: NO

- [ ] 22. UI re-verify over `done` components — 28-bug reconciliation + new findings (fix P0/P1)

  **What to do**:
  - Build/refresh `.omo/audit/completion-manifest.md` listing every component's state (done / in-flight / shelved). **Start condition (orchestrator-enforced): the fix-lane is EMPTY and the manifest is committed before task 22 launches.** Read the manifest ONCE at start; any state changes during the pass are OUT OF SCOPE for this pass (next pass picks them up). Re-verify the running app — but ONLY components marked `done` (never in-flight or shelved-hidden UI).
  - Re-test the prior 28-bug list (`docs/REACT_UI_AUDIT_2026-05-24.md`) against the redesigned `done` surface → `.omo/audit/28-bug-reconciliation.md` (still-present / fixed / artifact / superseded). Log NEW findings → `.omo/audit/reverify-findings.md` with severity + repro + evidence.
  - FIX all P0/P1 (each with a regression test + evidence). Record P2/P3 in a backlog with rationale.

  **Must NOT do**:
  - Do NOT audit in-flight or shelved-hidden UI. Do NOT silently defer a P0/P1. Do NOT expand into new redesign scope (log it instead).

  **Recommended Agent Profile**:
  - **Category**: `deep` — systematic runtime re-audit + targeted fixes.
  - **Skills**: none (Playwright/AX via Bash).

  **Parallelization**: **Wave E**, parallel with 21 (audit), then serial fixes. **Blocked By**: all Wave-D orchestrator commits landed + fix-lane EMPTY + `.omo/audit/completion-manifest.md` committed.

  **References**:
  - `docs/REACT_UI_AUDIT_2026-05-24.md` (28 bugs), `.omo/audit/findings.md` (prior), `.omo/audit/coverage-manifest.md` (if present).
  - Running `build-merged` Element.app; `tools/automation/element_verify.py`.

  **Acceptance Criteria**:
  - [ ] Completion manifest complete; re-verify covers only `done`; 28 bugs all classified; new P0/P1 fixed with tests; P2/P3 backlogged.

  **QA Scenarios**:
  ```
  Scenario: Manifest gates the audit
    Tool: Read
    Steps: 1. Confirm every audited surface is marked `done` in the manifest; no in-flight/shelved audited.
    Expected Result: gated correctly.
    Evidence: .omo/audit/completion-manifest.md
  Scenario: A P0/P1 no longer reproduces
    Tool: Playwright (running app)
    Steps: 1. Follow a fixed finding's repro post-fix.
    Expected Result: no repro; regression test added.
    Evidence: .omo/evidence/task-22-fixed.png
  ```
  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents in PARALLEL (non-oracle per Glen's ban). ALL must APPROVE. Then GATE B(final): present consolidated results + per-wave confirm checklist to Glen, get explicit runtime "okay" per batch. Do NOT auto-proceed. Never check F1-F4 before Glen's okay.

- [ ] F1. **Plan-compliance + Must-NOT grep audit** — `unspecified-high`
  Read plan end-to-end. Each "Must Have": verify it exists (read file / invoke native / run command). Each "Must NOT Have": grep for the forbidden pattern (off-spec styling: `backdrop-blur`/`rgba(.*0\.[0-9]` transparency in component CSS; fake BlockEmbed control identifiers; component edits to index.css/Records/AppShell/useAppStore; sub-agent git commits; `using namespace juce` in headers; alloc/lock in node process(); **any `oracle`/`ultrabrain` agent invocation** — banned; grep `\boracle\b`/`\bultrabrain\b` across `.omo/audit/**`, `.omo/evidence/**`, `.omo/state/sessions/**`) — REJECT with file:line if found. Confirm evidence files exist. Compare deliverables vs plan + completion manifest.
  Output: `Must Have [N/N] | Must NOT [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code quality + Realtime-safety review** — `code-reviewer`
  Run `cd webview && npx tsc -b` + `npm run lint` + `npm run test:all` + `npx vitest run --project storybook`; build `cmake --build build-merged --target element_app`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, dead code, generic names. For `src/nodes/**`/`src/engine/**` touches (G-29): assert no alloc/lock/blocking-IO on the callback path; new node process() is RT-safe; new natives are message-thread.
  Output: `Build [P/F] | Lint [P/F] | Tests [N/N] | RT-safety [P/F] | VERDICT`

- [ ] F3. **Real manual QA (all scenarios, integration)** — `qa-tester` (+ `playwright` skill)
  From clean state, run EVERY task's QA scenario against running `build-merged` Element.app — exact steps, capture evidence. Cross-task integration: shelved features absent from nav; SnippetShelf in left nav; add Bus Send + Receive → audio routes → BlockEmbed info-card shows real data; cable direction/hover; SessionTree shows names+types. Edge cases: empty graph, no plugins, plugin w/o editor, Receive w/o Send. Save → `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N] | Integration [N/N] | Edge [N] | VERDICT`

- [ ] F4. **Scope-fidelity / contamination check** — `deep`
  Per task: read "What to do", read actual diff. **Diff against the captured baseline** (`git diff $(cat .omo/audit/plan-baseline-sha.txt)`), NOT `HEAD~N` — and treat any path on `.omo/audit/plan-baseline-allowlist.md` as pre-existing (do NOT flag the dirty `reroutenode.hpp`/`SessionChangedTest.cpp`/untracked WIP tests). Verify 1:1 — everything specced built, nothing beyond (no creep, no redesign of shipped waves, no extra C++/bridge fns). Check "Must NOT do" per task. Detect cross-task contamination (task N touching task M's files; component task editing a hot file) + unaccounted changes (excluding the allow-list).
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

— then **GATE B(final)**: Glen batched runtime-confirm per wave → log to `.omo/audit/confirmation-log.md`.

## Commit Strategy
- **Orchestrator-only commits**, one per wave boundary after that wave's automated AC pass (sub-agents never commit). Stage+commit in ONE bash call (`git add <files> && git commit -F - <<'EOF' … EOF`); `rm -f .git/index.lock` first if present.
- Suggested messages (repo style): `feat(webview): Wave 0.5 foundation — density tokens + shell/nav IA`; `feat(webview): Wave A — VirtualKeyboard + LiveHealth IO`; `feat(webview): Wave B — nav/IA redesign (SessionTree/ToolPalette/SnippetShelf/QuickAccess/BusInspector)`; `feat(host,nodes,webview): Wave C — Bus Send/Receive nodes + BlockEmbed rebuild`; `feat(webview): Wave D — cable/canvas/comment/palette redesign`; `chore(webview): Wave E — re-verify fixes`.
- **Do NOT push** (Glen's standing rule — Glen decides push).

## Success Criteria

### Verification Commands
```bash
cd webview && npm run build                                   # exit 0
cd webview && npm run test:all                                # 0 failures
cd webview && npx vitest run --project storybook              # green
cmake -B build-merged -DELEMENT_BUILD_TESTS=ON                # reconfigure (new C++)
cmake --build build-merged --target element_app -j8           # exit 0
ctest --test-dir build-merged -R "BusNode|BlockCategory" --output-on-failure  # node tests pass
python3 tools/automation/element_verify.py --suite all        # AX on Web shell
```

### Final Checklist
- [ ] All "Must Have" present; all "Must NOT Have" absent (F1 grep clean).
- [ ] F1-F4 APPROVE; every wave Glen-confirmed + Chromatic-accepted; logged.
- [ ] Completion manifest: 24 items `done` or `deferred-with-reason`; 3 shelved hidden; zero fake BlockEmbed controls.
