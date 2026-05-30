# Deep App Audit — Element React UI + Performance (full-stack)

## TL;DR

> **Quick Summary**: Confirm the two existing root-cause fixes at runtime, then run a fresh
> systematic audit of the now-rendering Element React webview, unblock the production build, close
> the C++↔React bridge gaps that block plugin/audio workflows, fix the triaged UI bugs, and tune
> the high-frequency performance loops — each fix verified by automated tests + Storybook/Playwright
> evidence and a batched runtime confirmation by Glen.
>
> **Deliverables**:
> - Runtime-confirmed fix #1 (boot-hang) + fix #2 (blank-UI loop), committed as the single task 0.
> - Authoritative JS↔C++ bridge contract spec + the missing native functions implemented.
> - Unblocked `npm run build` (147 failing webview tests triaged + repaired) + zustand-selector regression guard.
> - Fresh re-audit: coverage manifest + 28-bug reconciliation table + consolidated fix backlog.
> - Triaged UI bug fixes (P0→P2) + performance tuning of poll/telemetry loops with numeric budgets.
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 6 implementation waves + 1 final review wave, 2 human gates
> **Critical Path**: W1(build-causality / bridge-contract) → W2(build embedded + confirm #2) → Gate A → W3 re-audit → W4 C++ bridge → W5 React fixes → W6 perf → Final review → Gate B

---

# ⚠️ MAJOR SCOPE UPDATE — 2026-05-30 (Glen's 32-note UI/UX review)  ·  STATUS: PENDING APPROVAL

> This addendum **supersedes the original Waves 4–6 / Wave-5 task list below** for the UI surface.
> The lower document is preserved for history. The project pivots from **bug-fix + perf** to a
> **UI/UX redesign + design-language overhaul** driven by Glen's first-pass review (32 notes).
> Full worklist: `.omo/audit/ui-feedback.md` (G-01..G-32). Raw notes: `.omo/audit/ui-comments.jsonl`.
> Nothing here executes until Glen ratifies the Wave-0 decisions and approves the wave plan.

## Reality update (what's actually true now)
- **Gate A: PASSED** (Glen confirmed boot-hang / blank-UI / getGraphState; committed `ff023feb`).
- **Wave 4 (C++ bridge): ≈void** — bridge-contract proved no missing registrations; only item 15 (block format/category) was real.
- **W5a: committed `17600ce9`** — `element_webview_host.cpp` (format/category emit, F-02/F-03) + `graphmanager.cpp` (origin-pile, F-10). Built (exit 0), **pending runtime confirm**. ⚠ the **category** half is now obsoleted by G-18 (see freeze map).
- **Branches reconciled:** `local-enhancements` = `chromatic-ui-review` = `17600ce9` (one source of truth).
- **Feedback channel DELIVERED + proven:** in-Storybook "💬 Feedback" manager panel → `.omo/audit/ui-comments.jsonl`, with persistent per-component history + status tracking. 32 notes captured end-to-end. Files (uncommitted): `webview/.storybook/{manager.tsx,ui-comment-sink.ts,main.ts}`.

## 🚦 Wave 0 — Ratification + Freeze (NO CODE; gates everything)

### ✅ RULINGS — Glen, 2026-05-30 (via /plan)
- **D1 — Taxonomy: ADOPT 4 categories** replacing `Generator/Modifier/Logic`. **Proposed tokens (await final sign-off):**

  | Category | Shape | Colour | Note |
  |---|---|---|---|
  | **Virtual Instruments** | ● circle | `#4A90D9` blue | sound generators / synths / samplers |
  | **MIDI Effects** | ▲ triangle | `#2BC4C4` teal | incl. MIDI processing/logic/routing |
  | **Audio Effects** | ◆ diamond | `#E8A838` orange | EQ / dynamics / reverb / fx |
  | **Modulators / Utilities** | ⬢ hexagon | `#A87FE0` purple | LFO/env + control/utility nodes that fit nowhere else |

  Colour-blind safety carried by the 4 distinct **shapes** (● ▲ ◆ ⬢); purple↔blue separated by shape. *(Alt if more colour separation wanted: magenta `#D96AB5` for Modulators.)*
- **D2 — Terminology: Block/Container/Cable STAYS + add a "Module" tier.** "Module" = a distinct grouping/hierarchy tier (multi-use, breadcrumb-navigable) layered on top of Blocks; purge stale "Graphs"/"Nodes" usages. Update CLAUDE.md table + blueprint with the Module definition.
- **D3 — Shelve = HIDE UI, KEEP CODE.** Remove DashboardBuilder / MacroDashboard / Scene system from UI+nav; keep stores + the 7 C++ natives intact (reversible). Mark backlog in blueprint.
- **D6 — SMALL FIXES FIRST.** Do the cheap Group-F fixes before redesign waves (reordered below).

### ⏳ Still open (resolve during Wave 0/1, not blocking the plan)
- **D4 — Cables (G-26/G-29):** confirm removing Surround cables + Wireless→Bus Send/Receive overrides Blueprint §371-383. *(Cables are Wave 4 — decide before then.)*
- **D5 — Persisted `category`:** agent to check whether saved `.els` sessions store `category`; if yes, D1 taxonomy needs a back-compat migration + fixture test. *(Agent verifies in Wave 2.)*

**On approval, Wave 0 executes:** edit `CLAUDE.md` + `docs/ELEMENT_UNIFIED_BLUEPRINT.md` to the ratified deltas (4-cat taxonomy + tokens, Module tier, shelved-feature backlog notes) so spec = reality; refresh the design system (`docs/stitch-reference/DESIGN.md`) and seed Stitch via `create_design_system_from_design_md`.

### Freeze / supersession map (no throwaway work)
| New (G-id) | Supersedes / obsoletes |
|---|---|
| G-18 taxonomy | committed C++ `mapBlockCategory`; old plan task 19 + category-half of task 15; finding **F-03** |
| G-20–23 BlockEmbed rebuild | findings **F-01** (overlap) + **F-03**; old plan task 22 |
| G-12 SessionTree redesign | incremental SessionTree fixes (but **task 18 boot-fetch still needed** under the new UI) |
| G-05 BusInspector redesign | incremental BusInspector fixes |
| **STILL VALID** | **F-02** (INT badge = **format**, committed) · F-10 origin-pile (committed) · task 18 SessionTree boot-fetch · F-05/F-06/F-08 fold into G-07/G-08/G-16 |

## Revised waves (ordered per D6 = small fixes first; each ships with Storybook story + Chromatic gate + Glen 💬 re-review)
- **Wave 1 — Quick wins** (cheap Group-F fixes, no new design; D6): **G-02/G-03** NeuFader (clamp handle + horizontal inset backdrop), **G-04** NeuToggle dot centring, **G-07** LiveHealth "SPL"→"Samples", **G-16** StatusBar drop "SPL" from buffer, **G-19** Toolbar perform/edit persist. Also **runtime-confirm the committed F-02 (format badge) + F-10 (origin-pile)**.
- **Wave 2 — Foundation** (gates Block/ToolPalette): implement ratified **4-cat taxonomy** end-to-end (C++ `mapBlockCategory` rewrite, TS `BlockCategory` union + `inferCategory`/`inferBlockCategory`, `demoGraph`, badge colours+shapes), **D5** persisted-`category` check + migration; **G-14** global sizing/density pass (affects every panel — before per-component redesign); **Wave-0 spec edits** (CLAUDE.md + blueprint: taxonomy tokens, Module tier, shelved backlog); design-system refresh seeded to Stitch.
- **Wave 3 — Independent redesigns** (parallel, low coupling): **G-01** VirtualKeyboard (full-height keys, octave control, velocity-by-Y, Mod+CC sliders), **G-08** LiveHealth IO detail, **G-30** CommandPalette → native-JUCE-menu mirror.
- **Wave 4 — Block + Cable system** (depends Wave-2 taxonomy): **G-20–23** BlockEmbed rebuild (bespoke per-type UI / live-preview / info fallback), **G-24–28** Cable redesign, **G-29** Bus Send/Receive nodes, **G-32** GraphCanvas, **G-31** CommentFrame→molecule grouping.
- **Wave 5 — Nav / information architecture:** **G-12/G-13** SessionTree (signal-flow + names + Module tier), **G-15** SnippetShelf relocation into left project nav, **G-17** ToolPalette rebuild, **G-10** QuickAccess, **G-05** BusInspector (drag-drop + highlight).
- **Wave 6 — Shelve execution** (hide-UI per D3: DashboardBuilder / MacroDashboard / Scene) + story cleanup (keep the 160-story `verify-stories` gate green).

**Acceptance (per redesigned component):** matches ratified design system (neumorphic locked) · Storybook story updated + `run-story-tests` green (interaction + a11y) · design ref attached via `addon-designs` · Chromatic snapshot reviewed · Glen 💬 note flipped `fixed` at runtime.

## 🎨 Tooling matrix (asset/design creation — VALIDATED 2026-05-30, see `.omo/audit/creative-toolchain-validation.md`)
**Guardrail:** the neumorphic spec is LOCKED. Do NOT free-generate; always seed tools with the existing design system, then Chromatic-gate.

| Need | Items | Tool | Status |
|---|---|---|---|
| New layouts on locked palette | G-17 ToolPalette, G-20–23 BlockEmbed | **Stitch MCP** `create_design_system`/`apply_design_system` (seed `docs/stitch-reference/DESIGN.md`) | ✅ generate proven |
| Discrete component redesigns | G-12 SessionTree, G-05 BusInspector, G-01 VirtualKeyboard | **magic `21st_magic_component_builder`/`_refiner`** + reskin to `neu/` primitives; **Storybook MCP** for real props | ⚠️ magic timeout fix applied — **validate after session restart** |
| Icons / category shapes / textures / mockup refs | G-18 4 shapes, G-24–28 cable glyphs | **HF Qwen image-gen** + **creative-asset-pipeline** skill; **magic `logo_search`** for brand SVGs | ✅ image-gen + logo proven |
| Per-component design refs on PRs | all redesigns | **@storybook/addon-designs** `parameters.design` (DESIGN.md / edit-mode.html / Stitch export / HF image) | ✅ wired |
| Validation each change | all | **Storybook MCP** `run-story-tests` (self-heal) → **Chromatic** gallery → **💬 panel** Glen re-review | ✅ proven (⚠ Chromatic needs local `chpt_` token or CI) |

## Top risks
1. **Throwaway work** — old plan forbids redesign yet keeps shipping superseded fixes → Wave-0 freeze-list + pause (D6).
2. **Spec drift** — shelving + taxonomy desync blueprint/CLAUDE.md → edit both in Wave 0.
3. **Visual fragmentation** — uncontrolled Stitch/magic invent off-spec styles → always seed locked design system; Chromatic gates every PR.
4. **Persisted-data breakage** — taxonomy/category migration on old `.els` → back-compat map + fixture test (D5).
5. **160-story render gate** — shelved/redesigned components break `verify-stories` → update stories in the same wave.

---

## Context

### Original Request
Read the handover and write a plan for a deep app audit to continue finding and fixing UI bugs as
well as overall performance bugs. Google Stitch MCP + a Storybook playbook were installed to
facilitate collaborative UI/UX testing and debugging.

### Interview Summary
**Key Decisions**:
- Audit shape: **Fresh re-audit THEN fix** (the 28-bug audit predates fix #2 and was run against a
  blank UI with simulated data → stale; must re-triage against the now-rendering UI with real data).
- Scope: **Full-stack** (React + the missing C++ bridge functions + block-JSON format/category).
- Verification: **automated Vitest/Playwright tests** + **Storybook + Playwright screenshots**;
  **Glen runtime-confirms every UI fix** (standing rule). Stitch = reference-only (no redesign).
- Housekeeping: fix the blocked prod build (147 failing webview tests), include perf tuning, and
  commit fix #1/#2 — but the commit is gated on Glen's runtime confirm of #2 (Metis sequencing).

**Research Findings** (explore agents):
- Architecture map: 11 Zustand stores, bridge layer (`webview/src/bridge/*`, `useJuceBridge.ts`),
  AppShell component tree, perf loops inventory (below).
- **8 derived-selector infinite-loop risks beyond the fixed BlockEmbed**: `usePerformStore`
  (`selectActiveScene`:246, `selectAlerts`:252, `selectMappedParameters`:244), `useGraphStore`
  (`selectSelectedNode`:432, `selectSelectedEdge`:435), `usePluginBrowserStore` + `useHostExtrasStore`
  (no selectors / direct array+Set access), `useDashboardStore.selectWidgets`:154.
- Perf loops: `useEngineSnapshotStore.ts:109` (4Hz), `useJuceBridge.ts:431` (~60Hz cable meter),
  `:441` (~15Hz param delta), retry polls `:481`/`:495`, `ScriptEditor.tsx:55` (1Hz),
  `GraphCanvas.tsx:419` (zoom debounce), `:441` (viewport debounce).
- Tests: **147 FAIL / 671 PASS / 818 total** across 19 files. `nativeGraph.test.ts` 58 fails;
  bridge suite ~50; stores reference removed props (`breadcrumbs`/`favorites`/`params`/
  `SceneData.color`/`MacroControl.label`); `Block`/`CommandPalette`/`PresetStrip` component fails;
  `QuickAddPopup`/`GraphCanvas` test files empty. Canonical mock: `webview/src/test/mockJuceBridge.ts`
  (`installJuceBridgeMock`). vitest projects: `unit` (jsdom) + `storybook` (Playwright).
- AX harness: `tools/automation/element_verify.py --suite all` (8 suites). Build chain:
  `cd webview && npm run build` (or `npx vite build`) → `cmake -B build-merged` (reconfigure on new
  .cpp / new dist) → `cmake --build build-merged --target element_app` (POST_BUILD copies dist into
  `build-merged/element_app_artefacts/Element.app/Contents/Resources/webview`).

### Metis Review — gaps addressed in this plan
- "Done" defined per-wave with verifiable artifacts (manifest, reconciliation table, exit-0 builds).
- Re-audit GATED on runtime-confirmed render (W2/Gate A) so we never re-audit a blank screen.
- Build-block causality resolved as the literal first task (decides test-repair ordering).
- Authoritative bridge contract derived by call-site diff BEFORE building either side.
- Per-failing-test triage verdict (stale→rewrite/delete vs real-regression→restore) — no silent deletes.
- Per-selector verdict (reproduced loop→fix vs suspected→defer) — no speculative churn.
- `agent-complete` ≠ `confirmed`; human confirms batched; confirmation-invalidation rule; safe-to-
  progress-while-waiting set; #2 confirm flagged as critical-path SPOF with interim Playwright evidence.
- Numeric perf budgets required; Storybook ≠ integration evidence; thread model per bridge fn.

---

## Work Objectives

### Core Objective
Make the Element React UI demonstrably functional and performant: confirm/commit the existing
fixes, eliminate reproduced render-blocking selectors, unblock CI, close the bridge gaps, fix the
triaged UI bugs, and bring the high-frequency loops within stated numeric budgets — all verified.

### Concrete Deliverables
- `.omo/audit/build-block-triage.md` (147-test verdict table), `bridge-contract.md`,
  `selector-verdicts.md`, `coverage-manifest.md`, `28-bug-reconciliation.md`, `findings.md`.
- New/changed C++ in `src/ui/element_webview_host.cpp` (+ engine accessors) for the missing natives.
- React fixes across `webview/src/**`; new Storybook stories + Vitest/Playwright regression tests.
- Per-batch `confirmation-log.md` capturing Glen's runtime verdicts.
- Single commit (task 0) of fix #1/#2 (+ confirmed selector fixes) after Gate A.

### Definition of Done
- [ ] `cd webview && npm run build` exits 0 AND `cmake --build build-merged --target element_app` exits 0.
- [ ] `cd webview && npm run test:all` — 0 failures (or every remaining skip has a written verdict).
- [ ] Zustand-selector regression guard test present and passing.
- [ ] Re-audit coverage manifest exhausted; 28-bug reconciliation table complete; new P0/P1 findings fixed.
- [ ] All in-scope bridge functions invoke and return the contract-specified JSON shape (tested).
- [ ] Boot-hang regression test: boot completes < 10s with the 1996-plugin/~700KB fixture.
- [ ] Each perf loop within its stated numeric budget with visual parity + data-correctness preserved.
- [ ] Gate A (fix #1/#2) and Gate B (all UI fixes, batched) runtime-confirmed by Glen and logged.

### Must Have
- Runtime confirmation of #2 BEFORE the re-audit wave runs.
- Authoritative bridge contract before either bridge side is built.
- Per-test and per-selector written verdicts.
- Numeric perf budgets stated and asserted.

### Must NOT Have (Guardrails — from Metis)
- **No silent test deletion** to go green — every failing test gets a verdict (rewrite/restore/delete-with-reason).
- **No speculative selector fixes** — only fix selectors with a REPRODUCED loop matching the BlockEmbed identity-violation signature; others are documented + deferred.
- **No UI redesign / restyle** — bug + perf only. Stitch MCP is reference comparison ONLY.
- **No bridge functions beyond** the contract-confirmed missing set + block-JSON `format`/`category`. No new abstraction layers — follow the existing native-registration pattern.
- **No perf frequency change without proving** visual parity (screenshot-diff within tolerance) + data correctness. Frequency ≠ correctness.
- **No commits except task 0**, and only after Gate A (Glen confirms #2).
- **No Storybook-only evidence** to claim a bridge/integration fix verified (Storybook uses mock data).
- **No alloc/lock/blocking-IO on the audio callback path**; any `src/engine/**` or `src/nodes/**` edit triggers the realtime-safety rule. New bridge fns are message-thread, NOT audio-thread.
- **No native-only-as-final** UX (hybrid policy): bridge work must surface in the Web shell.
- **No self-approval** — review/verify is a separate lane (non-oracle agents; oracle + ultrabrain BANNED).

### Banned-Agent Substitution (Glen's standing rule)
`oracle` and `ultrabrain` are BANNED. All verification/review uses `unspecified-high`, `deep`,
`code-reviewer`, `qa-tester`, or `verifier`. High-accuracy plan review (if requested) uses `Momus`
(allowed). Prometheus's own phase gates were executed as non-oracle self-review + Metis.

---

## Verification Strategy (MANDATORY)

> **Two verification layers**: (1) agent-executed automated evidence (tests + Storybook/Playwright
> screenshots + AX assertions), (2) Glen's batched runtime confirmation on UI fixes. `agent-complete`
> (tests green) ≠ `confirmed` (Glen verified). Runtime-dependent dependents must NOT cascade off
> `agent-complete` alone.

### Test Decision
- **Infrastructure exists**: YES (Vitest 4 unit+storybook projects, Playwright, `mockJuceBridge.ts`, Boost.Test, AX harness).
- **Automated tests**: TDD-leaning where practical; every fix ships a regression test (Vitest and/or Playwright story smoke).
- **Framework**: `vitest` (`npm run test` / `test:stories` / `test:all`), Playwright headless, Boost.Test (`ctest`), AX (`element_verify.py`).

### QA Policy
Every task includes agent-executed QA scenarios (happy + failure). Evidence to `.omo/evidence/task-{N}-{slug}.{png,json,txt}`.
- **UI components**: Storybook story + Playwright headless screenshot of `/iframe.html?id=<storyId>` (renders mock data — NOT integration proof).
- **Integration / bridge**: run inside `build-merged` Element.app; AX assertions (`element_verify.py`) + screenshot of the running app; for C++ natives, Boost.Test invoking the function and asserting JSON shape.
- **Selectors**: mount test asserting NO `"Maximum update depth exceeded"` AND render-count ≤ expected, with populated AND empty store.
- **Perf**: assert the new timer frequency + numeric CPU/frame budget + screenshot-diff within tolerance + data-correctness unchanged.
- **Build**: command exits 0.

### Human Gate Protocol
- **Gate A** (after W2): Glen runtime-confirms fix #1 (no hang, plugin list populates) + fix #2 (UI paints w/ a populated session). Unlocks task 0 commit + the re-audit wave. Interim agent evidence (Playwright/AX screenshot of the running app) is collected first; Glen's verdict is final.
- **Gate B** (after Final review): Glen confirms all UI fixes in BATCHES (one runtime session per batch), logged in `confirmation-log.md` with {build commit, fixes, per-fix verdict, screenshot}.
- **Confirmation-invalidation rule**: if a later task touches a previously-confirmed component, that component re-enters the confirm queue.
- **Safe-to-progress while awaiting Glen**: W1 investigations, bridge-contract spec, coverage manifest, test triage. **Must-hold**: anything needing real runtime behavior.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 — Investigation & baseline (start immediately, fully parallel, no fix yet):
├── 1: Build-block causality + 147-test triage table          [unspecified-high]
├── 2: Authoritative JS↔C++ bridge-contract spec (call-site diff) [deep]
├── 3: Selector repro audit (8 flagged + structural sweep) → verdicts [unspecified-high]
├── 4: Boot-hang fixture (1996-plugin/700KB) + AX Web-shell coverage check [quick]
└── 5: Re-audit coverage manifest (enumerate every Web-shell surface) [unspecified-low]

Wave 2 — Build unblock + render confirmation (depends W1):
├── 6: Build embedded bundle + agent runtime-evidence of fix #1/#2 (populated session) [unspecified-high] (dep 4)
├── 7: Unblock prod build — repair tests per triage verdicts (no silent deletes) [unspecified-high] (dep 1)
├── 8: Fix REPRODUCED render-blocking selectors (useShallow per BlockEmbed) [unspecified-high] (dep 3)
└── 9: Zustand-selector regression guard test [unspecified-high] (dep 3)

── GATE A: Glen runtime-confirms fix #1/#2 ──
└── 10: Commit fix #1/#2 (+ confirmed selector fixes) as task 0 [quick] (dep 6,8,Gate A)

Wave 3 — Fresh re-audit (depends W2 + Gate A — stable render):
├── 11: Execute re-audit vs running app w/ real bridge data → findings.md [deep] (dep 6,8,5)
└── 12: 28-bug reconciliation table (still-present/fixed/artifact/superseded) [unspecified-high] (dep 6)

Wave 4 — C++ bridge gaps (depends contract spec 2 + stable build 7):
├── 13: Plugin-scan native fns (scan/paths/formats) — message-thread [deep] (dep 2)
├── 14: Audio-device enumeration native fn — message-thread [unspecified-high] (dep 2)
├── 15: block-JSON format/category fields + saved-session back-compat [unspecified-high] (dep 2)
└── 16: cmake reconfigure + build both groups + JSON-shape invoke tests [quick] (dep 13,14,15)

Wave 5 — React functional fixes (depends bridges W4 + render):
├── 17: Preferences plugin-scan UI + wire audio dropdowns to store (BUG-001/003) [visual-engineering] (dep 13,14)
├── 18: Plugin-browser populate + SessionTree boot fetch (BUG-005/006) [unspecified-high] (dep 13)
├── 19: mapBlock reads format/category, drop infer* (BUG-012/013) [quick] (dep 15)
├── 20: Inspector param fetch + session-op feedback (BUG-007/010) [unspecified-high] (dep 6)
├── 21: Unify engine-state truth + latency/BPM/board-dropdown (BUG-014/015/026/027) [unspecified-high] (dep 6)
├── 22: MIDI-learn feedback + molecule save + dbl-click + sparse keyboard (BUG-016/017/018/020) [visual-engineering] (dep 6)
└── 23: Triage NEW re-audit findings → fix P0/P1 in-plan [deep] (dep 11)

Wave 6 — Performance tuning (LAST; depends functional fixes):
├── 24: Engine snapshot 4Hz→20Hz (timecode/transport) within budget (BUG-028) [unspecified-high] (dep 21)
├── 25: Profile + tune 60Hz metering / 15Hz delta render cost (memoize hot paths) [deep] (dep 6)
└── 26: Per-I/O activity breakdown (BUG-022) [unspecified-high] (dep 25)

Wave FINAL — review (parallel, non-oracle), then Gate B:
├── F1: Plan-compliance audit                [unspecified-high]
├── F2: Code quality + realtime-safety review [code-reviewer]
├── F3: Real manual QA (all scenarios)        [qa-tester]
└── F4: Scope-fidelity / contamination check  [deep]
── GATE B: Glen batched runtime-confirm of all UI fixes ──

Critical path: 2 → 7 → 6 → GateA → 11 → 13 → 16 → 17 → 24 → F1-F4 → GateB
Max concurrent: 5 (Wave 1). Human gates serialize at A and B (batched to limit stalls).
```

### Agent Dispatch Summary
- **Wave 1**: 1→unspecified-high, 2→deep, 3→unspecified-high, 4→quick, 5→unspecified-low
- **Wave 2**: 6→unspecified-high, 7→unspecified-high, 8→unspecified-high, 9→unspecified-high; 10→quick
- **Wave 3**: 11→deep, 12→unspecified-high
- **Wave 4**: 13→deep, 14→unspecified-high, 15→unspecified-high, 16→quick
- **Wave 5**: 17→visual-engineering, 18→unspecified-high, 19→quick, 20→unspecified-high, 21→unspecified-high, 22→visual-engineering, 23→deep
- **Wave 6**: 24→unspecified-high, 25→deep, 26→unspecified-high
- **Final**: F1→unspecified-high, F2→code-reviewer, F3→qa-tester, F4→deep

---

## TODOs

- [ ] 1. Resolve build-block causality + triage all 147 failing webview tests

  **What to do**:
  - From `webview/`, run `npm run build`, capture exit code + first failing step. Determine WHY prod build fails: is `npm run build` (`tsc -b && vite build`) blocked by TYPE errors, or by the vitest suite? Record the exact blocking mechanism.
  - Run `npm run test:all` and `npx tsc -b`; collect the full failure list (19 files, ~147 failures).
  - For EVERY failing test, write a verdict in `.omo/audit/build-block-triage.md`: `stale` (references a legitimately removed prop → rewrite or delete-with-reason), `real-regression` (a prop/behavior was removed in error, possibly collateral of the uncommitted fixes → restore), or `out-of-scope`. Use `lsp_find_references` on removed props (`breadcrumbs`, `favorites`, `params`, `SceneData.color`, `MacroControl.label`) to decide stale-vs-real.
  - Note the two empty test files (`QuickAddPopup.test.tsx`, `GraphCanvas.test.tsx`): placeholder-to-fill vs delete.

  **Must NOT do**:
  - Do NOT fix any test here (investigation only — fixes happen in item 7).
  - Do NOT assume "stale" — confirm each removed prop was intentional via reference search.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — broad investigative read + structured verdict, no single domain.
  - **Skills**: none required.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** (with 2,3,4,5)
  - **Blocks**: 7 (test repair ordering depends on this)
  - **Blocked By**: None

  **References**:
  - `webview/package.json` scripts (`build`,`test`,`test:all`,`test:stories`,`lint`) — exact commands.
  - `webview/vitest.config.ts` — `unit`(jsdom) + `storybook`(playwright) projects.
  - `webview/src/test/mockJuceBridge.ts` — canonical mock used by bridge/store tests.
  - Failing files (from explore): `src/bridge/__tests__/nativeGraph.test.ts` (58), `nativeSession`(10), `nativePrefs`(9), `nativePerform`(5), `nativePluginEditor`(5), `nativeApp`(3), `nativeEngineSnapshot`(4), `juceBackend`(4), `nativeKeyboard`(2); `src/stores/__tests__/*`; `src/components/canvas/__tests__/{Block,CommandPalette}.test.tsx`; `src/components/layout/__tests__/{ConnectionEditor,PresetStrip.stale}.test.tsx`.

  **Acceptance Criteria**:
  - [ ] `.omo/audit/build-block-triage.md` exists with one verdict row per failing test ({file, test, failure reason, verdict, action}).
  - [ ] The build-block mechanism (type-error vs vitest) is stated in one sentence with the captured command output.

  **QA Scenarios**:
  ```
  Scenario: Build-block mechanism is captured with evidence
    Tool: Bash
    Steps:
      1. cd webview && npm run build; echo "EXIT=$?"  (tee to evidence)
      2. cd webview && npx tsc -b 2>&1 | tee .omo/evidence/task-1-tsc.txt
      3. cd webview && npm run test:all 2>&1 | tee .omo/evidence/task-1-tests.txt
    Expected Result: Evidence files show the exact first blocking error; triage.md classifies it.
    Evidence: .omo/evidence/task-1-tsc.txt, task-1-tests.txt, .omo/audit/build-block-triage.md

  Scenario: A "stale" verdict is justified by a reference search
    Tool: Bash (rg) + lsp_find_references
    Steps:
      1. Pick one test verdicted "stale" (e.g. references SceneData.color).
      2. Search the source tree for the prop; confirm zero non-test references.
    Expected Result: triage row cites the search result proving the prop is genuinely removed.
    Evidence: .omo/evidence/task-1-stale-proof.txt
  ```

  **Commit**: NO

- [ ] 2. Derive the authoritative JS↔C++ bridge contract (call-site diff)

  **What to do**:
  - Enumerate EVERY React native call: grep `webview/src/**` for `invokeNativeFunction("element` and `invokeElementNative(` / the `window.__elementNative` receiver callbacks.
  - Enumerate EVERY registered native: read `src/ui/element_webview_host.cpp` for each `registerFn`/`registerNativeFunction("element...")`.
  - Diff the two sets to produce the EXACT list of missing native functions (validate or correct the "~7" estimate from the audit: `elementScanPlugins`, `elementGetPluginPaths`, `elementAddPluginPath`, `elementRemovePluginPath`, `elementGetPluginFormats`, `elementSetPluginFormat`, `elementGetAudioDevices`).
  - For each missing fn AND each block-JSON gap (`format`, `category`), write `.omo/audit/bridge-contract.md`: {function name, argument shape, return JSON schema (exact keys/types), thread (message vs audio — all of these are message-thread), error/empty behavior, which store/component consumes it}.
  - Cross-check the return shapes against the React consumers (`usePluginBrowserStore`, `useHostExtrasStore.audioSetup`, `mapBlock`) so both sides agree.

  **Must NOT do**:
  - Do NOT implement any C++ or React here (spec only).
  - Do NOT invent functions beyond what a real React call site requires.

  **Recommended Agent Profile**:
  - **Category**: `deep` — authoritative cross-language contract synthesis; correctness-critical.
  - **Skills**: none required.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** (with 1,3,4,5)
  - **Blocks**: 13, 14, 15 (both bridge sides build against this)
  - **Blocked By**: None

  **References**:
  - `src/ui/element_webview_host.cpp` — native registration site (handler pattern, `postCompletion`).
  - `webview/src/bridge/*.ts` (`nativeGraph`, `nativePerform`, `nativeSession`, `nativeApp`, `nativePrefs`, `nativeEngineSnapshot`, `nativePluginEditor`, `nativeKeyboard`) + `webview/src/hooks/useJuceBridge.ts`.
  - `webview/src/bridge/juceBackend.ts` — `invokeElementNative` promise handshake (object-or-string tolerance from fix #1).
  - Consumers: `webview/src/stores/usePluginBrowserStore.ts`, `useHostExtrasStore.ts` (`audioSetup`), `useJuceBridge.ts` `mapBlock`/`inferFormat`/`inferCategory`.
  - `docs/REACT_UI_AUDIT_2026-05-24.md` "Bridge Function Coverage Matrix" (lines 170-198) — prior gap list to validate.

  **Acceptance Criteria**:
  - [ ] `.omo/audit/bridge-contract.md` lists the COMPLETE missing-native set (count justified by the call-site diff, not the estimate).
  - [ ] Each entry has arg shape + exact return JSON schema + thread + consumer.
  - [ ] block-JSON `format`/`category` field spec includes saved-session back-compat behavior.

  **QA Scenarios**:
  ```
  Scenario: Missing-native list is derived, not guessed
    Tool: Bash (rg)
    Steps:
      1. rg -o 'invokeNativeFunction\("(element[A-Za-z]+)"' webview/src | sort -u > /tmp/react-calls.txt
      2. rg -o 'register(Native)?Fn\w*\("(element[A-Za-z]+)"' src/ui/element_webview_host.cpp | sort -u > /tmp/cpp-natives.txt
      3. comm -23 /tmp/react-calls.txt /tmp/cpp-natives.txt  (React-only = missing in C++)
    Expected Result: The diff matches the contract's missing-fn list exactly.
    Evidence: .omo/evidence/task-2-call-diff.txt, .omo/audit/bridge-contract.md

  Scenario: A consumer can be satisfied by the spec'd return shape
    Tool: Read
    Steps:
      1. For elementGetAudioDevices, read useHostExtrasStore.audioSetup shape.
      2. Confirm the contract return schema supplies every field the store reads.
    Expected Result: No field the consumer needs is missing from the schema.
    Evidence: .omo/evidence/task-2-consumer-check.md
  ```

  **Commit**: NO

- [ ] 3. Selector repro audit — reproduce or refute each derived-selector loop

  **What to do**:
  - Run a structural sweep (`ast_grep_search` / rg) for ALL Zustand selectors that return derived objects/arrays (`.map`/`.filter`/`new Array`/object-literal/spread/`.find`) across `webview/src/**` — confirm the inventory is complete, not just the 9 named.
  - For each candidate (the 8 flagged + any newly found): build a minimal Storybook story OR Vitest mount test that drives the consuming component with a POPULATED store AND an EMPTY store, and observe whether `"getSnapshot should be cached"` / `"Maximum update depth exceeded"` throws at mount.
  - Record a verdict per selector in `.omo/audit/selector-verdicts.md`: `reproduced-loop → fix (item 8)` vs `suspected-only → document + defer` vs `safe (returns primitive / stable ref)`.
  - Flagged set to evaluate: `usePerformStore` (`selectActiveScene`:246, `selectAlerts`:252, `selectMappedParameters`:244), `useGraphStore` (`selectSelectedNode`:432, `selectSelectedEdge`:435), `usePluginBrowserStore` + `useHostExtrasStore` (direct array/Set access), `useDashboardStore.selectWidgets`:154.

  **Must NOT do**:
  - Do NOT apply any fix here (item 8 fixes only the REPRODUCED ones).
  - Do NOT mark a selector "fix needed" without a reproduced loop (avoid speculative churn).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — repro harness authoring + per-item verdict.
  - **Skills**: none required (Playwright optional via the storybook test project).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** (with 1,2,4,5)
  - **Blocks**: 8, 9
  - **Blocked By**: None

  **References**:
  - `webview/src/components/canvas/BlockEmbed.tsx` — the FIXED template (`useShallow` from `zustand/react/shallow`), the only confirmed offender so far.
  - `webview/src/stores/usePerformStore.ts:244-252`, `useGraphStore.ts:432-436`, `useDashboardStore.ts:154`, `usePluginBrowserStore.ts`, `useHostExtrasStore.ts`.
  - `docs/UI_DEBUGGING_STORYBOOK_STITCH.md` §1-2 — story-first repro + Playwright headless screenshot loop; `webview/.storybook/` config; existing stories `src/components/neu/*.stories.tsx`.
  - Memory `project-zustand-v5-selectors` (referenced in playbook) — the loop signature.

  **Acceptance Criteria**:
  - [ ] `.omo/audit/selector-verdicts.md` has a verdict per selector (reproduced/suspected/safe) with the repro story/test path.
  - [ ] The structural sweep output is attached (proves the inventory is exhaustive, not just the 9 named).

  **QA Scenarios**:
  ```
  Scenario: A reproduced loop is captured at story mount
    Tool: Storybook + Playwright (run from webview/)
    Preconditions: npm run storybook on :6006.
    Steps:
      1. Author a story mounting the suspect component with a POPULATED store decorator.
      2. Playwright goto /iframe.html?id=<storyId>&viewMode=story; capture console.
      3. Assert presence/absence of "Maximum update depth exceeded".
    Expected Result: Verdict row matches observed console (loop reproduced or not).
    Evidence: .omo/evidence/task-3-<selector>-console.txt, task-3-<selector>.png

  Scenario: Empty store does not hide a latent loop
    Tool: Vitest mount test
    Steps:
      1. Mount the same component with an EMPTY store; render twice.
      2. Assert render-count is bounded (loops often hide until arrays are non-empty).
    Expected Result: Verdict notes empty-vs-populated behavior difference if any.
    Evidence: .omo/evidence/task-3-<selector>-empty.txt
  ```

  **Commit**: NO

- [ ] 4. Boot-hang regression fixture + AX Web-shell coverage check

  **What to do**:
  - Synthesize or locate a `plugins.xml`-shaped fixture with ~1996 entries (~700KB) reproducing the fix #1 trigger, and define a repeatable measurement of boot completion time (main-thread returns to idle). Store the fixture under `webview/src/test/fixtures/` (or `test/webview/fixtures/`) + document how the regression test loads it.
  - Run `python3 tools/automation/element_verify.py --suite all` against the running app and confirm whether the 8 AX suites target the React **Web shell** (canonical) or only classic `StandardContent`; note any suite that needs re-pointing at the Web shell. This decides whether AX is usable as Web-shell QA evidence later.

  **Must NOT do**:
  - Do NOT change perf code here (fixture + coverage assessment only).

  **Recommended Agent Profile**:
  - **Category**: `quick` — fixture creation + one harness run + a short coverage note.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** (with 1,2,3,5)
  - **Blocks**: 6 (runtime confirm uses the fixture + AX)
  - **Blocked By**: None

  **References**:
  - HANDOFF-2026-05-29 §"ROOT CAUSE #1" — 1996 plugins / ~700KB / `elementGetPluginList`.
  - `tools/automation/element_verify.py` (8 suites), `element_ax_map.py`, venv `/tmp/element-verify-venv`.
  - `src/ui/element_webview_host.cpp` `elementGetPluginList` handler (fix #1 site).

  **Acceptance Criteria**:
  - [ ] A ~1996-entry/~700KB fixture exists with a documented load path for the boot regression test (item 6/16 consume it).
  - [ ] `.omo/audit/ax-webshell-coverage.md` states, per suite, whether it covers the Web shell; gaps listed.

  **QA Scenarios**:
  ```
  Scenario: AX harness runs and its target is identified
    Tool: Bash
    Steps:
      1. source /tmp/element-verify-venv/bin/activate (recreate if missing per handover)
      2. python3 tools/automation/element_verify.py --suite all 2>&1 | tee .omo/evidence/task-4-ax.json
    Expected Result: JSON output; coverage note records Web-shell vs classic per suite.
    Evidence: .omo/evidence/task-4-ax.json, .omo/audit/ax-webshell-coverage.md

  Scenario: Fixture has the expected scale
    Tool: Bash
    Steps:
      1. Count entries + byte size of the fixture.
    Expected Result: ~1996 entries, ~700KB (within ±10%).
    Evidence: .omo/evidence/task-4-fixture-stats.txt
  ```

  **Commit**: NO

- [ ] 5. Build the re-audit coverage manifest (enumerate every Web-shell surface)

  **What to do**:
  - From the component tree (App → AppShell → panels/canvas/modals), enumerate EVERY user-facing Web-shell surface as a checklist in `.omo/audit/coverage-manifest.md`: each view, panel, modal, tab, context menu, and primary interactive control, with its route/component and the bridge data it depends on.
  - For each surface, pre-write the columns the re-audit (item 11) will fill: {surface, repro steps placeholder, real-bridge-data needed, severity, evidence path, verdict}.
  - This is the artifact that makes "re-audit done" verifiable (= checklist exhausted in the running app with real data).

  **Must NOT do**:
  - Do NOT perform the audit here (manifest scaffolding only).
  - Do NOT include classic/native-only panels as audit targets (Web shell scope).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low` — structured enumeration from a known tree; light effort.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** (with 1,2,3,4)
  - **Blocks**: 11
  - **Blocked By**: None

  **References**:
  - Component tree (explore): `App.tsx` → `AppShell.tsx` → Toolbar, ToolPalette, SessionTree, InspectorHub, SnippetShelf, QuickAccess, LiveHealth, MacroDashboard, DashboardBuilder, StatusBar, VirtualKeyboard, GraphCanvas (+ Block, Cable, CommandPalette, QuickAddPopup, Minimap), PreferencesModal, About.
  - `docs/ELEMENT_UNIFIED_BLUEPRINT.md` — feature/UI source-of-truth for what each surface should do.
  - `docs/REACT_UI_AUDIT_2026-05-24.md` "Verified Working" + bug list — prior coverage to fold in.

  **Acceptance Criteria**:
  - [ ] `.omo/audit/coverage-manifest.md` lists every Web-shell surface with empty audit columns ready to fill.
  - [ ] Each surface notes the bridge data required to exercise it with real (non-mock) data.

  **QA Scenarios**:
  ```
  Scenario: Manifest covers the rendered component tree
    Tool: Bash (rg) + Read
    Steps:
      1. List components under webview/src/components/{layout,canvas} + modals.
      2. Confirm every top-level panel/modal appears as a manifest row.
    Expected Result: No rendered top-level surface is missing from the manifest.
    Evidence: .omo/evidence/task-5-manifest-coverage.txt

  Scenario: Manifest is fillable (schema valid)
    Tool: Read
    Steps:
      1. Inspect one row's columns.
    Expected Result: Columns {surface, repro, data-needed, severity, evidence, verdict} present.
    Evidence: .omo/audit/coverage-manifest.md
  ```

  **Commit**: NO

- [ ] 6. Build embedded bundle + collect runtime evidence of fix #1 + fix #2

  **What to do**:
  - Build the webview (`cd webview && npx vite build`) and the app (`cmake --build build-merged --target element_app -j8`); verify the POST_BUILD step copied `webview/dist` into `Element.app/Contents/Resources/webview` (cmake reconfigure if dist hash changed).
  - Launch `build-merged/element_app_artefacts/Element.app` with a session that HAS blocks (e.g. `BRASS_4Horns.els`). Collect agent evidence: (a) fix #2 — React UI paints (panels + canvas + embedded block faders), no infinite-loop console error; (b) fix #1 — plugin list populates, main thread idle (no ~150s spin, CPU returns low) using the item-4 fixture.
  - Use Playwright (attach to the WebView dev URL per playbook) and/or `element_verify.py` + `screencapture` for evidence. This produces INTERIM evidence; Glen's confirm at Gate A is final.

  **Must NOT do**:
  - Do NOT mark fix #2 `confirmed` — only `agent-complete`; `confirmed` requires Gate A.
  - Do NOT hand-edit `webview/dist`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — build orchestration + runtime evidence capture.
  - **Skills**: none (Playwright/AX via Bash).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 2** (with 7,8,9)
  - **Blocks**: Gate A → 10, 11, 12, and all runtime-dependent waves
  - **Blocked By**: 4 (fixture + AX coverage)

  **References**:
  - HANDOFF-2026-05-29 §"RUNTIME CONFIRMATION STILL OWED" (line 30) + diagnostic technique (lines 33-43, main.tsx overlay snippet, `ELEMENT_WEBVIEW_DEV_URL`).
  - Build chain: `CMakeLists.txt:113-125` POST_BUILD; `cmake/element_webview_dist.h.in`.
  - Settings: `~/Library/Application Support/Kushview/Element/Element.conf` (mainContentType=webview); logs `.../Element/log/element-verbose.log`.

  **Acceptance Criteria**:
  - [ ] Build commands exit 0; dist confirmed inside the app bundle.
  - [ ] Screenshot shows React panels + canvas + at least one embedded block fader rendered (fix #2).
  - [ ] Evidence shows plugin list populated + main thread idle / low CPU after boot (fix #1, with fixture).
  - [ ] `.omo/audit/confirmation-log.md` has a Gate-A row pending Glen's verdict (agent-complete recorded).

  **QA Scenarios**:
  ```
  Scenario: Populated session renders the React UI (fix #2)
    Tool: Bash (Playwright/AX) + screencapture
    Preconditions: Element.app built; a session with blocks available.
    Steps:
      1. Launch Element.app (or with ELEMENT_WEBVIEW_DEV_URL for console access).
      2. Capture console — assert NO "Maximum update depth exceeded".
      3. Screenshot the window — assert canvas + panels + an embedded fader present.
    Expected Result: UI paints; no loop error.
    Evidence: .omo/evidence/task-6-render.png, task-6-console.txt

  Scenario: Boot does not hang on the large plugin list (fix #1)
    Tool: Bash (sample / Activity Monitor) + the item-4 fixture
    Steps:
      1. Boot with the 1996-plugin fixture active.
      2. Sample the PID at T+10s; assert main thread NOT in String::replace spin, CPU low.
    Expected Result: Boot completes < 10s; plugin browser populated.
    Evidence: .omo/evidence/task-6-sample.txt, task-6-plugins.png
  ```

  **Commit**: NO (commit is item 10, after Gate A)

- [ ] 7. Unblock the production build — repair tests per the item-1 triage verdicts

  **What to do**:
  - Apply the per-test verdicts from `.omo/audit/build-block-triage.md`: rewrite `stale` tests to the current store shape (use `installJuceBridgeMock`), RESTORE behavior for any `real-regression`, and delete-with-documented-reason only where the verdict says so. Fill the two empty test files if the verdict was "placeholder-to-fill", else remove them.
  - Get `cd webview && npm run build` to exit 0 (resolve the type-error or test path identified in item 1) and `npm run test:all` to 0 failures.

  **Must NOT do**:
  - **Do NOT delete a failing test just to go green** — only per a written `delete` verdict with reason.
  - Do NOT change production source to satisfy a `stale` test (fix the test, not the code) unless the verdict is `real-regression`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — broad test repair across 19 files.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 2** (with 6,8,9)
  - **Blocks**: 13 (stable build needed for bridge work), Final F2
  - **Blocked By**: 1

  **References**:
  - `.omo/audit/build-block-triage.md` (item 1 output) — the verdict table.
  - `webview/src/test/mockJuceBridge.ts`, `webview/src/test/setup.ts` — mock + setup patterns.
  - Failing files list (item 1 / explore).

  **Acceptance Criteria**:
  - [ ] `cd webview && npm run build` exits 0.
  - [ ] `cd webview && npm run test:all` reports 0 failures (skips, if any, each carry a verdict comment).
  - [ ] No test deleted without a matching `delete` verdict in the triage doc.

  **QA Scenarios**:
  ```
  Scenario: Production build succeeds
    Tool: Bash
    Steps:
      1. cd webview && npm run build; echo "EXIT=$?"
    Expected Result: EXIT=0.
    Evidence: .omo/evidence/task-7-build.txt

  Scenario: Full test suite green
    Tool: Bash
    Steps:
      1. cd webview && npm run test:all 2>&1 | tee .omo/evidence/task-7-tests.txt
    Expected Result: 0 failed.
    Evidence: .omo/evidence/task-7-tests.txt

  Scenario: No silent deletions
    Tool: Bash (git diff --stat)
    Steps:
      1. git diff --stat webview/src/**/__tests__; cross-check each deleted file vs triage verdicts.
    Expected Result: Every removed test file has a "delete" verdict row.
    Evidence: .omo/evidence/task-7-delete-audit.txt
  ```

  **Commit**: NO

- [ ] 8. Fix the REPRODUCED render-blocking selectors (useShallow per BlockEmbed)

  **What to do**:
  - For ONLY the selectors verdicted `reproduced-loop` in `.omo/audit/selector-verdicts.md`, apply the BlockEmbed fix template: wrap the derived selector in `useShallow` (`import { useShallow } from "zustand/react/shallow"`) or otherwise return a stable/cached reference, so the `getSnapshot` caching contract holds.
  - Re-run each selector's repro story/test from item 3 to confirm the loop is gone (loopCount 0, root paints).

  **Must NOT do**:
  - Do NOT touch `suspected-only` or `safe` selectors (deferred per verdict).
  - Do NOT change the selector's returned data semantics — only its referential stability.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — targeted multi-store edits with repro verification.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 2** (with 6,7,9)
  - **Blocks**: 10 (confirmed fixes fold into task-0 commit), 11 (stable render)
  - **Blocked By**: 3

  **References**:
  - `webview/src/components/canvas/BlockEmbed.tsx` — exact `useShallow` template (already applied).
  - `.omo/audit/selector-verdicts.md` (item 3) — which selectors to fix.
  - Likely sites: `usePerformStore.ts:244-252`, `useGraphStore.ts:432-436`, `useDashboardStore.ts:154`, consumers of `usePluginBrowserStore`/`useHostExtrasStore`.

  **Acceptance Criteria**:
  - [ ] Every `reproduced-loop` selector is fixed; its repro test now passes (no loop).
  - [ ] `npx tsc -b` clean for changed files; no semantic change to returned values.

  **QA Scenarios**:
  ```
  Scenario: Previously-looping component now paints
    Tool: Vitest mount test / Storybook + Playwright
    Steps:
      1. Re-run the item-3 repro for a fixed selector with a populated store.
      2. Assert NO "Maximum update depth exceeded" and bounded render-count.
    Expected Result: loopCount 0; component renders.
    Evidence: .omo/evidence/task-8-<selector>-fixed.txt

  Scenario: Returned data unchanged (no semantic regression)
    Tool: Vitest
    Steps:
      1. Assert the selector returns the same contents pre/post fix for a fixed store state.
    Expected Result: deep-equal contents; only reference stability changed.
    Evidence: .omo/evidence/task-8-<selector>-semantics.txt
  ```

  **Commit**: NO (folds into item 10 after Gate A)

- [ ] 9. Add a zustand-selector regression guard test

  **What to do**:
  - Add an automated test (Vitest, or a lint rule) that fails CI if a Zustand selector returns an unmemoized derived array/object — the BlockEmbed-class bug. Approach options: (a) a structural AST test scanning `webview/src/**` for `useXStore((...) => ...)` whose body contains `.map`/`.filter`/`new Array`/array-literal/object-literal/spread WITHOUT `useShallow`; (b) a runtime guard test that mounts each store-bound component twice and asserts snapshot identity stability. Prefer (a) as a fast static guard; document allow-list exceptions inline.

  **Must NOT do**:
  - Do NOT make the guard so broad it flags safe primitive selectors (false positives).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — test/lint authoring with AST reasoning.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 2** (with 6,7,8)
  - **Blocks**: Final F1/F2 (guard must exist)
  - **Blocked By**: 3 (knows the selector inventory)

  **References**:
  - `webview/src/components/canvas/BlockEmbed.tsx` (positive case) + a known-safe primitive selector (negative case).
  - `webview/vitest.config.ts`; `ast_grep_search` for the scan rule.

  **Acceptance Criteria**:
  - [ ] Guard test present in `npm run test:all`; PASSES on the fixed tree.
  - [ ] Proven to FAIL on a deliberately-reverted BlockEmbed (temporarily, to prove it catches the class), then restored.

  **QA Scenarios**:
  ```
  Scenario: Guard catches the BlockEmbed-class bug
    Tool: Bash (Vitest)
    Steps:
      1. Temporarily revert BlockEmbed useShallow → fresh array selector.
      2. Run the guard test; assert it FAILS naming BlockEmbed.
      3. Restore the fix; assert the guard PASSES.
    Expected Result: Guard fails on the offender, passes when fixed.
    Evidence: .omo/evidence/task-9-guard-fail.txt, task-9-guard-pass.txt

  Scenario: Guard does not flag safe selectors
    Tool: Bash (Vitest)
    Steps:
      1. Run on the full tree.
    Expected Result: 0 false positives on primitive/stable-ref selectors.
    Evidence: .omo/evidence/task-9-no-false-positives.txt
  ```

  **Commit**: NO

- [ ] 10. Commit fix #1 + fix #2 (+ Gate-A-confirmed selector fixes) as task 0

  **What to do**:
  - ONLY after **Gate A** (Glen runtime-confirms #1 + #2): stage and commit the existing fixes plus any selector fixes from item 8 that Glen confirmed. Single commit. Inspect `git status`/`git diff` first; stage only the intended files; write a concise message in repo style.

  **Must NOT do**:
  - **Do NOT commit before Gate A.** Do NOT commit unrelated uncommitted files (e.g. `.claude/`, `build_number.txt`) — stage only the fix files.
  - Do NOT amend or force-push.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single curated commit.
  - **Skills**: `git-master` — atomic staging + repo-style message.
    - `git-master`: ensures only intended files are staged and the message matches history.

  **Parallelization**:
  - **Can Run In Parallel**: NO — Sequential, **after Gate A**.
  - **Blocked By**: 6, 8, Gate A.

  **References**:
  - Fix files: `src/ui/element_webview_host.cpp`, `webview/src/bridge/nativeGraph.ts`, `webview/src/bridge/juceBackend.ts`, `webview/src/components/canvas/BlockEmbed.tsx` (+ item-8 confirmed selectors).
  - Commit-style: `git log --oneline -10` (e.g. `fix(webview): ...`).

  **Acceptance Criteria**:
  - [ ] Gate A confirmation logged in `.omo/audit/confirmation-log.md` BEFORE the commit.
  - [ ] One commit containing only the intended fix files; `git status` clean of those files after.
  - [ ] Pre-commit: `npm run test:all` green + `cmake --build build-merged --target element_app` exit 0.

  **QA Scenarios**:
  ```
  Scenario: Only intended files committed
    Tool: Bash (git)
    Steps:
      1. git show --stat HEAD
    Expected Result: Stat lists only the fix files; no .claude/build artifacts.
    Evidence: .omo/evidence/task-10-commit-stat.txt

  Scenario: Gate A precedes the commit
    Tool: Read
    Steps:
      1. Confirm confirmation-log.md Gate-A row has Glen's verdict + a timestamp earlier than the commit.
    Expected Result: Verdict recorded before commit.
    Evidence: .omo/audit/confirmation-log.md
  ```

  **Commit**: YES — `fix(webview,host): resolve boot-hang (O(n²) bridge emit) + blank-UI (zustand v5 selector loop)`
  - Files: as above. Pre-commit: `npm run test:all` + app build exit 0.

- [ ] 11. Execute the fresh re-audit against the running app with real bridge data

  **What to do**:
  - With a stable, rendering UI (items 6+8 done, Gate A passed), work through `coverage-manifest.md` surface by surface IN THE RUNNING Element.app with REAL bridge data (not mocks). For each surface: exercise its controls, observe behavior vs the blueprint, and fill {repro steps, severity, evidence path, verdict: confirmed-bug / works / can't-repro}.
  - Record all confirmed bugs in `.omo/audit/findings.md` with severity (P0–P3) and concrete repro steps + evidence. This is the consolidated NEW backlog feeding item 23.

  **Must NOT do**:
  - Do NOT fix anything here (audit only; fixes are Wave 5).
  - Do NOT log subjective impressions — every finding needs reproducible steps + evidence.
  - Do NOT use mock/simulated data (the prior audit's mistake).

  **Recommended Agent Profile**:
  - **Category**: `deep` — systematic exhaustive runtime investigation with evidence discipline.
  - **Skills**: none (Playwright/AX/screencapture via Bash).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 3** (with 12)
  - **Blocks**: 23 (fixes triaged from findings)
  - **Blocked By**: 6, 8, 5, Gate A

  **References**:
  - `.omo/audit/coverage-manifest.md` (item 5) — the checklist to exhaust.
  - `docs/ELEMENT_UNIFIED_BLUEPRINT.md` — expected behavior per surface.
  - Toolchain: `docs/UI_DEBUGGING_STORYBOOK_STITCH.md` (Playwright), `tools/automation/element_verify.py` (AX).

  **Acceptance Criteria**:
  - [ ] Every manifest surface has a filled verdict (no blank rows).
  - [ ] `.omo/audit/findings.md` lists confirmed bugs with severity + repro + evidence path.

  **QA Scenarios**:
  ```
  Scenario: Manifest is exhausted with real data
    Tool: Read + Bash
    Steps:
      1. Diff coverage-manifest verdict column — assert 0 empty rows.
      2. Spot-check 3 findings: each has runnable repro steps + an evidence file.
    Expected Result: Full coverage; findings reproducible.
    Evidence: .omo/audit/findings.md, .omo/evidence/task-11-*/

  Scenario: A finding is reproduced from its own steps
    Tool: Bash (Playwright/AX)
    Steps:
      1. Follow one finding's repro steps in the running app.
    Expected Result: The bug reproduces as described.
    Evidence: .omo/evidence/task-11-repro-<id>.png
  ```

  **Commit**: NO

- [ ] 12. Build the 28-bug reconciliation table

  **What to do**:
  - For each of the 28 bugs in `docs/REACT_UI_AUDIT_2026-05-24.md`, re-test against the now-rendering UI with real data and classify in `.omo/audit/28-bug-reconciliation.md`: `still-present` (carry into fix waves), `fixed` (by #1/#2/selector or prior work), `artifact-of-blank-UI/simulated-data` (no longer applies), or `superseded` (replaced by a finding in item 11). Cross-link each to its Wave-5 fix task where applicable.

  **Must NOT do**:
  - Do NOT discard a bug without a verdict (preserves prior coverage).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — per-bug runtime re-test + classification.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 3** (with 11)
  - **Blocks**: 17-22 (confirms which known bugs are still in scope)
  - **Blocked By**: 6, Gate A

  **References**:
  - `docs/REACT_UI_AUDIT_2026-05-24.md` (28 bugs, P0-P3) + `docs/FORENSIC_AUDIT_REPORT.md` + `docs/WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md`.

  **Acceptance Criteria**:
  - [ ] All 28 bugs classified with a verdict + evidence note; still-present ones mapped to a Wave-5 task id.

  **QA Scenarios**:
  ```
  Scenario: Every prior bug has a verdict
    Tool: Read
    Steps:
      1. Count rows in reconciliation table = 28; assert no blank verdicts.
    Expected Result: 28/28 classified.
    Evidence: .omo/audit/28-bug-reconciliation.md

  Scenario: A "fixed" verdict is verified live
    Tool: Bash (running app)
    Steps:
      1. Pick one "fixed" bug; verify the behavior is correct in the running app.
    Expected Result: Behavior confirmed fixed (not assumed).
    Evidence: .omo/evidence/task-12-fixed-<id>.png
  ```

  **Commit**: NO

- [ ] 13. C++: implement plugin-scan native bridge functions (message-thread)

  **What to do**:
  - Implement the plugin-scan natives per `bridge-contract.md`: `elementScanPlugins` (trigger async scan), `elementGetPluginPaths`, `elementAddPluginPath`, `elementRemovePluginPath`, `elementGetPluginFormats`, `elementSetPluginFormat`. Register them in `src/ui/element_webview_host.cpp` following the existing native-registration pattern; return structured `var` via `postCompletion(...)` (NOT pre-serialized strings — preserves fix #1). Wire to the existing engine plugin-scan/format services on the MESSAGE thread.
  - Bridge async scan completion back to React (callback or pollable status) so the browser can refresh when scan finishes.

  **Must NOT do**:
  - Do NOT return large pre-serialized JSON strings (would re-introduce the O(n²) hang — fix #1 regression).
  - Do NOT run scan on the audio thread; no alloc/lock on any callback path.
  - Do NOT add functions beyond the contract set.

  **Recommended Agent Profile**:
  - **Category**: `deep` — C++ host + engine-service integration, correctness + threading critical.
  - **Skills**: none (C++/JUCE; consult docs per project rule before new APIs).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 4** (with 14,15)
  - **Blocks**: 16, 17, 18
  - **Blocked By**: 2 (contract), 7 (stable build)

  **References**:
  - `.omo/audit/bridge-contract.md` (item 2) — exact signatures + return schemas.
  - `src/ui/element_webview_host.cpp` — `elementGetPluginList` handler (fix #1 structured-var pattern, ~line 868), registration pattern.
  - Native preferences scan logic: `src/ui/preferences.cpp:203-365` (`PluginSettingsComponent`) — the behavior to expose.
  - `docs/REACT_UI_AUDIT_2026-05-24.md` BUG-002 (missing fns) + Bridge Coverage Matrix.
  - `.cursor/rules/element-audio-path.mdc` — realtime-safety rules (threading).

  **Acceptance Criteria**:
  - [ ] All 6 plugin-scan natives registered + invokable; return shapes match the contract.
  - [ ] A Boost.Test (or webview bridge contract test) invokes each and asserts JSON shape.
  - [ ] Scan runs off the audio thread; no realtime-safety violation introduced.

  **QA Scenarios**:
  ```
  Scenario: elementScanPlugins returns the contract shape
    Tool: Bash (ctest) or running app bridge call
    Steps:
      1. Build; invoke elementScanPlugins; on completion invoke elementGetPluginList.
      2. Assert result is a structured array of {name, format, category, uid} (no escaped-string blob).
    Expected Result: Structured var returned; matches contract.
    Evidence: .omo/evidence/task-13-scan.json

  Scenario: Empty/failed scan handled gracefully
    Tool: Bash (running app, no plugin paths)
    Steps:
      1. Remove all plugin paths; trigger scan.
    Expected Result: Returns empty list (not error/crash); React can render empty state.
    Evidence: .omo/evidence/task-13-empty-scan.json
  ```

  **Commit**: NO

- [ ] 14. C++: implement audio-device enumeration native (message-thread)

  **What to do**:
  - Implement `elementGetAudioDevices` per the contract: return available device types, output/input devices, sample rates, and buffer sizes (the data `useHostExtrasStore.audioSetup` expects). Register in `element_webview_host.cpp`; structured `var` via `postCompletion`. Source from the existing DeviceService/audio-device-manager on the message thread. Support re-enumeration when the driver type changes.

  **Must NOT do**:
  - Pre-serialized string returns; audio-thread access; functions beyond contract.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — focused C++ host fn wired to DeviceService.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 4** (with 13,15)
  - **Blocks**: 16, 17
  - **Blocked By**: 2, 7

  **References**:
  - `.omo/audit/bridge-contract.md` — `elementGetAudioDevices` schema.
  - `src/ui/element_webview_host.cpp` registration pattern; DeviceService (engine/services).
  - Consumer: `webview/src/stores/useHostExtrasStore.ts` `audioSetup` (deviceTypes/outputDevices/inputDevices/sampleRates/bufferSizes); `docs/REACT_UI_AUDIT_2026-05-24.md` BUG-004.

  **Acceptance Criteria**:
  - [ ] `elementGetAudioDevices` registered + returns the contract shape with real device data.
  - [ ] Test invokes it and asserts the schema; re-enumeration on driver-type change works.

  **QA Scenarios**:
  ```
  Scenario: Device enumeration returns populated arrays
    Tool: Bash (running app / ctest)
    Steps:
      1. Invoke elementGetAudioDevices.
      2. Assert deviceTypes/outputDevices/inputDevices/sampleRates/bufferSizes present + typed.
    Expected Result: Matches contract; non-empty on a real machine.
    Evidence: .omo/evidence/task-14-devices.json

  Scenario: Zero-device edge case
    Tool: Bash
    Steps:
      1. Simulate/observe a no-output-device state.
    Expected Result: Returns empty arrays, no crash.
    Evidence: .omo/evidence/task-14-zero-devices.json
  ```

  **Commit**: NO

- [ ] 15. C++: add format/category fields to block JSON + saved-session back-compat

  **What to do**:
  - In the graph-snapshot builder (`buildActiveGraphJson()` / block entry serialization), add `format` (VST3/AU/CLAP/LV2/INT) and `category` (instrument/effect/midi/etc.) per block, sourced from the plugin description. Ensure saved sessions WITHOUT these fields still load (React falls back gracefully — back-compat).

  **Must NOT do**:
  - Do NOT break loading of existing `.els` sessions lacking the new fields.
  - Do NOT pre-serialize large strings; keep structured.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — C++ serialization edit + back-compat.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 4** (with 13,14)
  - **Blocks**: 16, 19
  - **Blocked By**: 2, 7

  **References**:
  - `.omo/audit/bridge-contract.md` — block-JSON field spec + back-compat rule.
  - `buildActiveGraphJson()` in the host/engine snapshot builder (grep `buildActiveGraphJson`).
  - Consumer: `webview/src/hooks/useJuceBridge.ts` `mapBlock`/`inferFormat`:180/`inferCategory`:167; `docs/REACT_UI_AUDIT_2026-05-24.md` BUG-012/013.

  **Acceptance Criteria**:
  - [ ] Block JSON includes correct `format` + `category`; verified against a known plugin (e.g. a VST3 synth → format VST3, category instrument).
  - [ ] A saved session without the fields still loads (back-compat test).

  **QA Scenarios**:
  ```
  Scenario: Block JSON carries real format/category
    Tool: Bash (running app, capture snapshot)
    Steps:
      1. Add a known VST3 instrument; capture the graph snapshot JSON.
      2. Assert that block's format=="VST3" and category=="instrument" (or contract enum).
    Expected Result: Correct fields, not inferred defaults.
    Evidence: .omo/evidence/task-15-block-json.json

  Scenario: Legacy session loads
    Tool: Bash (running app)
    Steps:
      1. Open an existing .els saved before this change.
    Expected Result: Loads without error; blocks render (fields default gracefully).
    Evidence: .omo/evidence/task-15-legacy-load.png
  ```

  **Commit**: NO

- [ ] 16. cmake reconfigure + build both bridge groups + JSON-shape invoke tests

  **What to do**:
  - Reconfigure (`cmake -B build-merged`) so new/changed sources compile, build `element_app`, and add/run automated tests that invoke each new native and assert the exact contract JSON shape (Boost.Test under `test/webview/` and/or a Playwright bridge test against the running app). Batch this once after 13/14/15 to avoid reconfigure thrash.

  **Must NOT do**:
  - Do NOT skip the reconfigure (GLOB_RECURSE needs it for new .cpp).
  - Storybook-only evidence does NOT count for these integration tests.

  **Recommended Agent Profile**:
  - **Category**: `quick` — build + targeted contract tests.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — gathers 13/14/15; **end of Wave 4**.
  - **Blocked By**: 13, 14, 15

  **References**:
  - `test/CMakeLists.txt`, `test/webview/` (bridge contract tests), `test/TestMain.cpp`.
  - Build chain (CLAUDE.md / element-build-and-package skill).

  **Acceptance Criteria**:
  - [ ] `cmake --build build-merged --target element_app` exit 0 after reconfigure.
  - [ ] `ctest -R "WebView|Bridge"` (or the new suite) passes, asserting each native's JSON shape.

  **QA Scenarios**:
  ```
  Scenario: Bridge contract tests pass
    Tool: Bash
    Steps:
      1. cmake -B build-merged && cmake --build build-merged --target element_app -j8; echo EXIT=$?
      2. ctest --test-dir build-merged -R "WebView|Bridge" --output-on-failure
    Expected Result: Build exit 0; bridge tests pass.
    Evidence: .omo/evidence/task-16-build.txt, task-16-ctest.txt
  ```

  **Commit**: NO

- [ ] 17. React: Preferences plugin-scan UI + wire audio dropdowns to store (BUG-001/003)

  **What to do**:
  - Add a PluginSettings section to `PreferencesModal.tsx` calling the new scan natives (scan trigger, path add/remove, format toggles) with progress/empty states.
  - Wire the DRIVER TYPE / OUTPUT / INPUT / SAMPLE RATE / BUFFER `<select>` elements to populate `<option>` children from `useHostExtrasStore.audioSetup` (via `elementGetAudioDevices`), re-enumerating on driver-type change.

  **Must NOT do**:
  - No redesign of the Preferences layout (wire existing controls only).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — React UI wiring + states in a modal.
  - **Skills**: none (Storybook/Playwright via Bash for QA).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 5** (with 18-22, deps permitting)
  - **Blocked By**: 13, 14, 12

  **References**:
  - `webview/src/components/**/PreferencesModal.tsx` (grep) — sections + `<select>` sites; `docs/REACT_UI_AUDIT_2026-05-24.md` BUG-001/003.
  - `webview/src/bridge/nativePrefs.ts` + new natives (13/14); `useHostExtrasStore.audioSetup`.
  - Native parity reference: `src/ui/preferences.cpp:203-365`.

  **Acceptance Criteria**:
  - [ ] Preferences shows a working scan trigger + path/format controls; dropdowns list real options from the store.
  - [ ] Vitest test (mock bridge) asserts options render from `audioSetup`; Storybook story + screenshot.

  **QA Scenarios**:
  ```
  Scenario: Dropdowns populate from store
    Tool: Storybook + Playwright
    Steps:
      1. Story sets useHostExtrasStore.audioSetup with deviceTypes/sampleRates/bufferSizes.
      2. Screenshot the modal; assert each <select> has >0 <option> children.
    Expected Result: Options populated, not empty/hardcoded.
    Evidence: .omo/evidence/task-17-prefs.png

  Scenario: Scan with no paths
    Tool: Playwright (running app)
    Steps:
      1. Trigger scan with no plugin paths.
    Expected Result: Empty-state shown, no crash.
    Evidence: .omo/evidence/task-17-scan-empty.png
  ```

  **Commit**: NO

- [ ] 18. React: plugin-browser populate + SessionTree boot fetch (BUG-005/006)

  **What to do**:
  - Ensure `usePluginBrowserStore.refresh()` populates from the now-working scan/list path (and refreshes on scan-complete). Confirm the retry-poll stops once populated.
  - Call `nativeSessionGetGraphTree()` on `SessionTree.tsx` mount so the left panel shows real graphs (not "0 graphs").

  **Must NOT do**:
  - No redesign; only data wiring.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — store/effect wiring across browser + tree.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 5**
  - **Blocked By**: 13, 12

  **References**:
  - `webview/src/stores/usePluginBrowserStore.ts` (refresh, retry), `webview/src/hooks/useJuceBridge.ts:481-489` (plugin retry), `SessionTree.tsx`, `nativeSession.ts` (`elementSessionGetGraphTree`); BUG-005/006.

  **Acceptance Criteria**:
  - [ ] Plugin browser lists scanned plugins; retry-poll ceases once populated.
  - [ ] SessionTree shows real graph count/names on boot.

  **QA Scenarios**:
  ```
  Scenario: Browser populated after scan
    Tool: Playwright (running app)
    Steps: 1. Boot with plugins present. 2. Assert plugin browser list length > 0.
    Expected Result: Plugins listed.
    Evidence: .omo/evidence/task-18-browser.png

  Scenario: SessionTree populated on boot
    Tool: Playwright/AX
    Steps: 1. Boot with a multi-graph session. 2. Assert graph count > 0 in the tree.
    Expected Result: Real graphs shown.
    Evidence: .omo/evidence/task-18-tree.png
  ```

  **Commit**: NO

- [ ] 19. React: mapBlock reads format/category, remove inferFormat/inferCategory (BUG-012/013)

  **What to do**:
  - Update `mapBlock` in `useJuceBridge.ts` to read `format`/`category` from the C++ block JSON (item 15) and remove the naive `inferFormat()` (`return "INT"`) and `inferCategory()` heuristics. Keep a minimal fallback only for legacy sessions lacking the fields.

  **Must NOT do**:
  - Do NOT keep the heuristic as the primary path (it caused wrong badges).

  **Recommended Agent Profile**:
  - **Category**: `quick` — small, well-scoped React change.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 5**
  - **Blocked By**: 15

  **References**:
  - `webview/src/hooks/useJuceBridge.ts:167` (`inferCategory`), `:180` (`inferFormat`), `mapBlock`; BUG-012/013.

  **Acceptance Criteria**:
  - [ ] Blocks show correct format badge (VST3/AU/CLAP/LV2) + category from C++; a VST3 synth no longer shows "INT"/"modifier".
  - [ ] Vitest: `mapBlock` maps a fixture block with format/category correctly; legacy fallback covered.

  **QA Scenarios**:
  ```
  Scenario: Correct badge from real data
    Tool: Playwright (running app)
    Steps: 1. Add a known VST3 instrument. 2. Assert badge=="VST3", category accent=instrument.
    Expected Result: Correct, not inferred.
    Evidence: .omo/evidence/task-19-badge.png

  Scenario: Legacy block fallback
    Tool: Vitest
    Steps: 1. mapBlock on a block missing format/category. 2. Assert graceful fallback (no crash).
    Expected Result: Fallback value, no throw.
    Evidence: .omo/evidence/task-19-legacy.txt
  ```

  **Commit**: NO

- [ ] 20. React: Inspector parameter fetch on selection + session-op feedback (BUG-007/010)

  **What to do**:
  - On node selection, fetch parameters (`elementGetNodeParameters`, now object-tolerant per fix #1) and populate `useParameterStore` so the Inspector shows automatable params instead of "No automatable parameters".
  - Add loading/success/error feedback + UI update (session name, dirty flag) for New/Open/Save/As session operations.

  **Must NOT do**:
  - No redesign; add states + wiring only.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — inspector data path + session-op UX states.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 5**
  - **Blocked By**: 6

  **References**:
  - `webview/src/components/layout/InspectorHub.tsx`, `useParameterStore.ts`, `nativeGraph.ts` `nativeGetNodeParameters` (object-or-string tolerant), `nativeSession.ts`; BUG-007/010.

  **Acceptance Criteria**:
  - [ ] Selecting a block with params shows them in the Inspector (live app).
  - [ ] Session ops show in-progress + result feedback; session name/dirty update on completion.

  **QA Scenarios**:
  ```
  Scenario: Params load on selection
    Tool: Playwright (running app)
    Steps: 1. Select a block known to have params. 2. Assert Inspector lists >0 parameters.
    Expected Result: Params shown.
    Evidence: .omo/evidence/task-20-params.png

  Scenario: Save feedback
    Tool: Playwright
    Steps: 1. Trigger Save. 2. Assert a progress/success indicator + dirty flag clears.
    Expected Result: Feedback visible; state updates.
    Evidence: .omo/evidence/task-20-save.png
  ```

  **Commit**: NO

- [ ] 21. React: unify engine-state truth + latency/BPM/board-dropdown (BUG-014/015/026/027)

  **What to do**:
  - Eliminate the two-truth-source divergence: pick a single source for engine-running state (StatusBar `useEngineSnapshotStore` vs Perform `usePerformStore.isPlaying`) and have both read it.
  - Format latency `latencyMs.toFixed(1)` in `LiveHealth.tsx`.
  - Make the BPM field an editable input that calls `elementTransportSetTempo` (BUG-026).
  - Fix the board/graph dropdown so selecting a graph calls `elementSessionSetActiveGraph` and actually switches (BUG-027).

  **Must NOT do**:
  - No redesign; behavior fixes only.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — several small cross-component behavior fixes.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 5**
  - **Blocked By**: 6

  **References**:
  - `StatusBar.tsx`, `usePerformStore.ts`, `useEngineSnapshotStore.ts`, `LiveHealth.tsx`, transport in `Toolbar.tsx`, board dropdown component, `nativeSession.ts`; BUG-014/015/026/027.

  **Acceptance Criteria**:
  - [ ] StatusBar and Perform header agree on engine state (single source).
  - [ ] Latency renders 1-decimal; BPM editable + applies; graph dropdown switches the active graph.
  - [ ] Vitest covers latency formatting + BPM apply; Playwright covers graph switch.

  **QA Scenarios**:
  ```
  Scenario: Engine state consistent
    Tool: Playwright (running app)
    Steps: 1. Start engine. 2. Assert StatusBar + Perform header both show running.
    Expected Result: No divergence.
    Evidence: .omo/evidence/task-21-engine-state.png

  Scenario: BPM edit applies
    Tool: Playwright
    Steps: 1. Type 128 into BPM. 2. Assert transport tempo becomes 128.
    Expected Result: Tempo updates.
    Evidence: .omo/evidence/task-21-bpm.png

  Scenario: Graph dropdown switches
    Tool: Playwright
    Steps: 1. Select a second graph. 2. Assert canvas content changes to that graph.
    Expected Result: Active graph switches.
    Evidence: .omo/evidence/task-21-graph-switch.png
  ```

  **Commit**: NO

- [ ] 22. React: MIDI-learn feedback + molecule save + dbl-click editor + sparse keyboard (BUG-016/017/018/020)

  **What to do**:
  - MIDI Learn: add an active-mode visual indicator + a list to see/remove learned mappings (BUG-016).
  - Molecule save: add a "Save as Molecule" action on the canvas/selection (a create/save bridge call to complement `nativeMoleculeInsert`) (BUG-017).
  - Verify the block double-click handler calls `nativePluginEditorOpen` (open native editor); fix if it doesn't (BUG-018).
  - Fix the `VirtualKeyboard.tsx:49` sparse array (`no-sparse-arrays`) so no key map holes (BUG-020).

  **Must NOT do**:
  - No redesign; if molecule-save needs a NEW bridge fn, confirm it against the contract first (don't invent silently).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — UI affordances + small interaction fixes.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 5**
  - **Blocked By**: 6 (molecule-save bridge: coordinate with item 2 contract if new native needed)

  **References**:
  - `usePerformStore` mapping, MIDI-learn (`elementMappingSetLearning`), `nativeGraph.ts` (`nativeMoleculeInsert`), `nativePluginEditor.ts`, `Block.tsx` dbl-click, `VirtualKeyboard.tsx:49`; BUG-016/017/018/020.

  **Acceptance Criteria**:
  - [ ] MIDI-learn shows active indicator + mapping list; double-click opens the native editor; keyboard has no missing keys; molecule save works (or is documented blocked if a new native is out-of-contract).

  **QA Scenarios**:
  ```
  Scenario: MIDI-learn indicator
    Tool: Playwright
    Steps: 1. Enable MIDI learn. 2. Assert an active indicator is visible.
    Expected Result: Indicator shown.
    Evidence: .omo/evidence/task-22-midilearn.png

  Scenario: Virtual keyboard has all keys
    Tool: Vitest / Playwright
    Steps: 1. Render VirtualKeyboard. 2. Assert no undefined holes; expected key count.
    Expected Result: Full key map.
    Evidence: .omo/evidence/task-22-keyboard.txt
  ```

  **Commit**: NO

- [ ] 23. Triage NEW re-audit findings → fix P0/P1 in-plan

  **What to do**:
  - Read `.omo/audit/findings.md` (item 11). Triage each new finding by severity. FIX all P0 + P1 findings here (each with a regression test + QA scenario + runtime evidence). Record P2/P3 in a backlog section of `findings.md` for a future plan (with Glen's awareness), unless trivially fixable alongside related work.

  **Must NOT do**:
  - Do NOT silently defer a P0/P1. Do NOT expand into redesign.

  **Recommended Agent Profile**:
  - **Category**: `deep` — open-ended fixes of unknown-shape findings; high judgment.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: PARTIAL — **Wave 5** but content-dependent on item 11; run after findings exist.
  - **Blocked By**: 11

  **References**:
  - `.omo/audit/findings.md` (item 11); the relevant component/store/bridge per finding.

  **Acceptance Criteria**:
  - [ ] Every P0/P1 finding fixed with a test + evidence; P2/P3 logged in the backlog with rationale.

  **QA Scenarios**:
  ```
  Scenario: A P0/P1 finding no longer reproduces
    Tool: Playwright/AX (running app)
    Steps: 1. Follow the finding's original repro steps post-fix.
    Expected Result: Bug no longer reproduces; regression test added.
    Evidence: .omo/evidence/task-23-<id>.png

  Scenario: Deferred items are explicitly recorded
    Tool: Read
    Steps: 1. Confirm each non-fixed finding has a backlog entry + severity rationale.
    Expected Result: No silent drops.
    Evidence: .omo/audit/findings.md
  ```

  **Commit**: NO

- [ ] 24. Perf: raise engine snapshot 4Hz → 20Hz (timecode/transport) within budget (BUG-028)

  **What to do**:
  - Raise the `useEngineSnapshotStore` poll from 4Hz (250ms) toward the PRD 10-30Hz target (default 20Hz / 50ms) so timecode/transport update smoothly. Measure main-thread cost; ensure the higher rate stays within budget. If the C++ snapshot is expensive, throttle only what's needed or split a lightweight transport channel.
  - **Numeric budget**: snapshot handling adds < 2% main-thread CPU at 20Hz on the test machine; no dropped frames on the 60fps canvas; timecode visibly advances.

  **Must NOT do**:
  - Do NOT raise frequency if it breaches the CPU/frame budget — tune the payload instead.
  - Do NOT change snapshot DATA correctness.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — measured frequency change + budget assertion.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 6** (with 25)
  - **Blocked By**: 21 (engine-state unified first)

  **References**:
  - `webview/src/stores/useEngineSnapshotStore.ts:109` (startPolling, idempotent at :96-100); `useJuceBridge.ts`; AI_HANDOVER.md line ~295 (10-30Hz target); BUG-028.

  **Acceptance Criteria**:
  - [ ] Poll runs at the target rate; timecode advances smoothly in the running app.
  - [ ] Measured main-thread CPU delta < 2% at the new rate (evidence); no frame drops.

  **QA Scenarios**:
  ```
  Scenario: Timecode advances at higher rate within budget
    Tool: Playwright + sample/perf (running app)
    Steps:
      1. Start transport; record timecode update cadence + main-thread CPU for 10s.
    Expected Result: Smooth updates; CPU delta within budget; no dropped frames.
    Evidence: .omo/evidence/task-24-perf.txt, task-24-timecode.png

  Scenario: Data correctness preserved
    Tool: Bash
    Steps: 1. Compare snapshot field values at 4Hz vs 20Hz for a static engine state.
    Expected Result: Identical values; only cadence changed.
    Evidence: .omo/evidence/task-24-correctness.txt
  ```

  **Commit**: NO

- [ ] 25. Perf: profile + tune 60Hz metering / 15Hz delta render cost

  **What to do**:
  - Profile the ~60Hz cable metering (`useJuceBridge.ts:431`) and ~15Hz parameter delta (`:441`) paths and the components they re-render (`Cable.tsx`, `LiveHealth.tsx`, `InspectorHub.tsx`, `Block.tsx`). Reduce render cost via memoization / selector narrowing / batching WITHOUT lowering data fidelity unless a frequency reduction is proven equivalent visually. Keep cable-level data at 60Hz if visuals require it; cut render churn instead.
  - **Numeric budget**: with a populated graph (~20 cables) animating, main-thread stays < 60% during sustained metering; canvas holds 60fps (no long tasks > 50ms).

  **Must NOT do**:
  - Do NOT drop metering data correctness or animation smoothness to hit CPU numbers.

  **Recommended Agent Profile**:
  - **Category**: `deep` — profiling + targeted memoization across hot render paths.
  - **Skills**: none (Chrome DevTools perf trace / Playwright).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 6** (with 24)
  - **Blocked By**: 6

  **References**:
  - `useJuceBridge.ts:431-434` (cable), `:441-444` (param delta); `useCableMeterStore.ts`, `useParameterStore.ts`; `Cable.tsx:86`, `LiveHealth.tsx`, `InspectorHub.tsx`, `Block.tsx`.

  **Acceptance Criteria**:
  - [ ] Before/after perf trace shows reduced render cost; main-thread within budget on a populated animating graph.
  - [ ] Visual parity (screenshot-diff within tolerance); metering values unchanged.

  **QA Scenarios**:
  ```
  Scenario: Sustained metering within budget
    Tool: Playwright + Chrome DevTools perf trace (running app or dev URL)
    Steps:
      1. Load a ~20-cable graph with active signal; record a 10s perf trace.
      2. Assert no long tasks > 50ms; main-thread < 60%.
    Expected Result: Within budget; 60fps held.
    Evidence: .omo/evidence/task-25-trace-after.json, task-25-trace-before.json

  Scenario: Visual + value parity
    Tool: Playwright screenshot-diff
    Steps: 1. Compare metering visuals + sampled values pre/post.
    Expected Result: Within tolerance; values identical.
    Evidence: .omo/evidence/task-25-parity.png
  ```

  **Commit**: NO

- [ ] 26. React: per-I/O activity breakdown in Perform mode (BUG-022)

  **What to do**:
  - Replace the single aggregate master peak with per-Input / per-Output activity in Perform mode I/O display (currently "(n/a)"). If the bridge only emits one aggregate `onMetering` peak, define the minimal protocol addition (coordinate with the item-2 contract) to emit input + output breakdown, then consume it.

  **Must NOT do**:
  - Do NOT fabricate per-I/O values from the aggregate; either get real per-I/O data or clearly mark unavailable.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — React consume + possible small bridge protocol add.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — after 25 (shares metering paths).
  - **Blocked By**: 25

  **References**:
  - `usePerformStore` `liveHealth` (`onMetering` at `usePerformStore.ts:214-235`), `LiveHealth.tsx`, `QuickAccess.tsx`; BUG-022; item-2 contract for any protocol add.

  **Acceptance Criteria**:
  - [ ] Perform I/O shows real input + output activity (no "(n/a)") OR an explicit, honest unavailable state if data genuinely absent.

  **QA Scenarios**:
  ```
  Scenario: I/O activity shows real values
    Tool: Playwright (running app, signal present)
    Steps: 1. Enter Perform mode with active I/O. 2. Assert input + output show numeric activity.
    Expected Result: Real per-I/O values, not "(n/a)".
    Evidence: .omo/evidence/task-26-io.png

  Scenario: No signal → honest zero/idle
    Tool: Playwright
    Steps: 1. Silence I/O. 2. Assert idle/zero state, not stale values.
    Expected Result: Correct idle state.
    Evidence: .omo/evidence/task-26-idle.png
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents in PARALLEL (non-oracle per Glen's ban). ALL must APPROVE. Then **Gate B**:
> present consolidated results + per-batch confirm checklist to Glen and get explicit runtime
> "okay" per batch before completing. Do NOT auto-proceed. Never check F1–F4 before Glen's okay.

- [ ] F1. **Plan Compliance Audit** — `unspecified-high`
  Read the plan end-to-end. Each "Must Have": verify it exists (read file / invoke native / run command). Each "Must NOT Have": grep the codebase for the forbidden pattern (silent-deleted tests, redesigned components, audio-thread alloc/lock, bridge fns beyond contract) — REJECT with file:line if found. Confirm evidence files exist in `.omo/evidence/`. Compare deliverables vs plan.
  Output: `Must Have [N/N] | Must NOT [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality + Realtime-Safety Review** — `code-reviewer`
  Run `cd webview && npx tsc -b` + `npm run lint` + `npm run test:all`; build `cmake --build build-merged --target element_app`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, dead code, generic names. For any `src/engine/**` or `src/nodes/**` touch: assert no alloc/lock/blocking-IO on the callback path. Confirm new natives are message-thread.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | RT-safety [PASS/FAIL] | VERDICT`

- [ ] F3. **Real Manual QA** — `qa-tester` (+ `playwright` skill for UI)
  From clean state, run EVERY QA scenario from EVERY task against the running `build-merged` Element.app — exact steps, capture evidence. Test cross-task integration (plugin scan → browser populated → add block → inspector params → perform metering). Edge cases: empty plugin list, zero audio devices, scan timeout, saved session missing format/category, empty-store selectors. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N] | Integration [N/N] | Edge [N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read the actual diff (git diff, uncommitted). Verify 1:1 — everything specced was built, nothing beyond spec (no creep, no redesign, no extra bridge fns). Check "Must NOT do" compliance per task. Detect cross-task contamination (task N touching task M's files) and unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

— then **GATE B**: Glen batched runtime-confirm → log to `.omo/audit/confirmation-log.md`.

## Commit Strategy

- **Task 0 (item 10) ONLY** commits during this plan, and ONLY after Gate A:
  `fix(webview,host): resolve boot-hang (O(n²) bridge emit) and blank-UI (zustand v5 selector loop)`
  Files: `src/ui/element_webview_host.cpp`, `webview/src/bridge/nativeGraph.ts`,
  `webview/src/bridge/juceBackend.ts`, `webview/src/components/canvas/BlockEmbed.tsx`, + any
  Gate-A-confirmed selector fixes from item 8. Pre-commit: `npm run test:all` green + build exit 0.
- **All other work stays uncommitted** (Glen's standing rule). Glen decides later commits.

## Success Criteria

### Verification Commands
```bash
cd webview && npm run build          # exit 0 (prod build unblocked)
cd webview && npm run test:all       # 0 failures
cmake --build build-merged --target element_app -j8   # exit 0; POST_BUILD copies dist
python3 tools/automation/element_verify.py --suite all # AX suites pass on the Web shell
ctest --test-dir build-merged -R "WebView|Bridge" --output-on-failure  # native bridge tests pass
```

### Final Checklist
- [ ] All "Must Have" present; all "Must NOT Have" absent.
- [ ] F1–F4 APPROVE; Gate A + Gate B confirmed and logged.
- [ ] Build unblocked, tests green, selector guard in place, perf within budgets, fix #1/#2 committed.
