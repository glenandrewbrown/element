# Element — PROJECT STATE (canonical) — 2026-05-30

> **READ THIS FIRST. It supersedes every other plan/audit doc.** The doc index (§7) says what else to read and what to ignore. Branch: `chromatic-ui-review` (NOT pushed). Tip: `8d9575f9`.

---

## 1. Where we are right now (TL;DR)

- **Shipped UI on the branch = Waves 1-2 only** (quick-wins `a29ebbfc`, 4-cat taxonomy `dadc2c67`). That's the real current UI.
- **The big UI-redesign Pass-1 (Waves F/A/B) was BUILT, judged "absolute trash" by Glen, and REVERTED** (`8d9575f9`). Net new UI code on the branch from this session = **ZERO**. Preserved on branch `shelved/denied-ui-redesign-pass1` for reference only.
- **A correct, approved design DIRECTION now exists** (Stitch), but **no React implementation of it has begun.**
- **CF1: Element-as-plugin crashed Logic Pro** (macOS Accessibility use-after-free during JUCE editor teardown). HIGH severity, investigated, NOT fixed. Element standalone did not crash.

## 2. Ship definition (Glen, 2026-05-30)

- **Ship bar = the FULL V3 UI redesign implemented** (approved Stitch directions → React, working across all components — the Instrument Paradigm UI).
- **Priority = STABILISE EVERYTHING FIRST**, then resume UI. So two milestones, sequenced:
  - **M0 — Stabilise (do first):** fix CF1; clear C++/engine/stability backlog; 28-bug reconciliation + numeric perf re-verify. Crash-free standalone + plugin.
  - **M1 — Full V3 UI redesign (the ship gate):** convert the approved Stitch component directions to React, component-by-component, wired to real stores/bridge, per-component Glen+Chromatic gate.

## 3. What this session actually produced (honest audit)

**Durable outputs are NOT code — they are design + investigation + lessons:**
1. **Corrected design system "Element Instrument V3"** — `.stitch/DESIGN.md` (4-cat + `#A87FE0`, locked neu surfaces, no-glass, Inter+JetBrains Mono, ui-ux-pro-max-reviewed). Created in Stitch project **"Element V3 - Component Studio"** (`5588354666030058264`), DS asset `3cf5097be5ab4a9f9aeab1d164ca9c53`. The old Stitch `neomorph` DS was spec-stale (3-cat, M3 tonal) — see `audit/neomorph-vs-blueprint-comparison.md`.
2. **Approved design DIRECTIONS** (per-component picks, Glen-confirmed): Browser = streamlined **palette / library-search** (search, not active plugins); Block = **tiered** (collapsed/standard/expanded + Container + Portal) with **on-block direct controls**; Inspector = **contextual floating**; Nav = **rail-tree** (Board/Module/Container/Portal); Command palette → **QuickAdd + right-click context menu** (G-30). Refined coherent set in `.stitch/designs/v3c-*.png`. Glen's own refs: `.stitch/designs/glendesigns/design_01.png`, `design_02.png`.
3. **CF1 crash investigation** — `audit/crash-element-logic-2026-05-30.md` (root cause + recommended fix lane).
4. **Engineering specs** (still valid for M1): `audit/g29-busnode-spec.md` (G-29 Bus node: 2-node, Package B hidden-arcs — Glen-chosen), `audit/records-schema.md`, `audit/blockembed-tier2-spike.md`, `audit/g30-native-menu-bridge.md` (20b), `audit/perf-baselines.md`, `audit/storybook-chromatic-ready.md`.
5. **A hard lesson, now in permanent memory** (`feedback-explicit-design-tools-mandatory`): named design tools are mandatory and override prompt-trimming.
6. **Tooling proven**: the Stitch → (design system + variants/concepts) → screenshot pipeline works; the static-storybook `verify-stories` gate works (dev-server `verify-stories` does NOT — see §4).

## 4. Honest reflection (scope / productivity / methodology)

- **Net code progress this session = ~0 product LOC** (one trivial `juce::` header qualification `0936d558` is the only surviving code change). A full multi-wave team orchestration (Waves F/A/B, 7+ components, multiple gates) was built and **entirely thrown away.**
- **Root cause of the waste:** the orchestrator dropped the explicitly-required premium design tools (Stitch / ui-ux-pro-max / uiverse / image-gen) from sub-agent prompts "for surgical scope." Hand-authored React against tokens → trash → denied. **Lesson: user's how-to-build instructions outrank the orchestrator's optimizations. Never silently drop a named tool.**
- **Process cost #2 — `verify-stories` dev-server rabbit-hole:** 4 passes chasing Vite "504 Outdated Optimize Dep" before switching to a static-build verify. Lesson: gate UI against a **static storybook build**, not the live dev server.
- **What went RIGHT:** disciplined gates (didn't ship the trash to `main`; reverted cleanly, preserved on a branch); pivoted to the correct Stitch-first method; surfaced design decisions to Glen instead of guessing (after the failure); honest accounting.
- **Methodology correction for M1:** design in Stitch FIRST (approved), then convert one pilot component end-to-end, get sign-off, THEN scale. Do not fan out unproven methods.

## 5. Gap analysis — here → shippable

### M0 — Stabilise (BLOCKS M1; do first)
- **CF1** — reproduce w/ VoiceOver + Element-AU-in-Logic, attribute the freed AX peer to Element, fix JUCE AX-peer lifetime (`src/plugineditor.cpp/.hpp`; invalidate AX peers before native window destroy / `setAccessible(false)` on WebBrowser subtree / check bundled `deps/juce` AX fixes). Verify host doesn't crash. (HIGH — plugin crashing host = data loss.)
- **28-bug reconciliation + new findings** — `audit/28-bug-reconciliation.md`, `audit/findings.md`: close/triage open P0/P1.
- **Numeric perf re-verify** — run the `audit/perf-baselines.md` guard against a fresh build; confirm within budgets.
- **C++/engine backlog** — any open stability items; confirm `test:all` still 1058/0 + `ctest` green on a fresh build.
- **Exit M0:** crash-free standalone + plugin; tests green; perf within budget.

### M1 — Full V3 UI redesign (the ship gate)
- Per-component Stitch → React conversion in dependency order (foundation/tokens → shell+nav rail-tree → Block tiered+on-block-controls → Cable → Inspector contextual → Browser library-search → QuickAdd/right-click → SessionTree/QuickAccess/LiveHealth/BusInspector/VirtualKeyboard → Perform mode).
- Each: convert via `stitch-build:react-components`, wire to real stores + `window.__JUCE__` bridge, neu tokens, Storybook story w/ `addon-designs` → real Stitch export + cite source screen id, verify (`tsc -b` + `vitest --project storybook` + **static** `verify-stories` + run-story-tests), Glen+Chromatic gate.
- **C++ dependency:** G-29 Bus node (Package B) per `audit/g29-busnode-spec.md` + bridge `category` emit (B1 gap) feed the Block/BusInspector/SessionTree components.
- **Pilot first:** take ONE component fully end-to-end, get method sign-off, then scale.
- **Exit M1 / SHIP:** all approved components live in the app, gates passed, stable.

## 6. The plan (rock-solid, sequenced)
1. **M0 stabilise** (above) — fresh session starts here. CF1 first (reproduce→fix), then bug/perf/test re-verify.
2. **M1 design lock-in** — finish any remaining view designs in Stitch (Perform mode, full SessionTree/BusInspector/VirtualKeyboard) so the whole app is designed; approve the full set.
3. **M1 pilot** — one component Stitch→React→app, end-to-end, Glen sign-off on the method.
4. **M1 scale** — remaining components, per-component gates, in dependency order.
5. **Ship** — full V3 UI + stable, then Glen decides on push/release.

## 7. Doc index — READ vs IGNORE
**CANONICAL (read):**
- `.omo/PROJECT-STATE.md` (this) — the single source of truth for state + plan.
- `.omo/plans/pass2-stitch-redesign.md` — the active UI method + per-component picks.
- `CLAUDE.md`, `docs/ELEMENT_UNIFIED_BLUEPRINT.md` — product/design spec.
- `.stitch/DESIGN.md` — the V3 design system.

**ACTIVE REFERENCE (read when on that lane):** `audit/g29-busnode-spec.md`, `records-schema.md`, `g30-native-menu-bridge.md`, `blockembed-tier2-spike.md`, `perf-baselines.md`, `storybook-chromatic-ready.md`, `crash-element-logic-2026-05-30.md`, `neomorph-vs-blueprint-comparison.md`, `28-bug-reconciliation.md`, `findings.md`, `plan-baseline-allowlist.md`.

**SUPERSEDED / DEAD (do NOT execute — historical only):**
- `.omo/plans/ui-redesign-OMC-execution.md` — the 28-lane OMC wave plan. **DEAD** (Pass-1 built from it was denied+reverted; method replaced by Stitch-first). 
- `.omo/audit/OMC-PROGRESS.md` — Pass-1 wave ledger. **DEAD** (records the reverted work).
- `.omo/plans/ui-redesign-execution.md`, `ui-redesign-KICKOFF.md` — pre-Stitch UI plans. Historical.
- `.omo/audit/SHELVED-DENIED-ui-redesign-pass1.md` — the mark-of-shame record of the denied pass.
- `.omo/plans/{deep-app-audit,master-fix-plan,bug-catcher-wave2,phase-d-*,phase-h-*,snapshot-extension-design,autonomy-execution-spec,visual-asset-pipeline}.md` — older lineages, historical context only.
- `.omo/audit/{gate-a-bundle,coverage-manifest,ax-webshell-coverage,bridge-contract,build-block-triage,selector-verdicts,layout-finding,ultrawork-notepad,confirmation-log,SESSION-RESET-HANDOFF,creative-toolchain-validation}.md` — prior-session artifacts, historical.

## 8. Durable assets
- **Stitch project (current):** "Element V3 - Component Studio" `projects/5588354666030058264`; DS asset `assets/3cf5097be5ab4a9f9aeab1d164ca9c53`. (Older: "Element - Design Mode" `6302247051961702472` — Glen's earlier mockups + the stale `neomorph` DS.)
- **Design system source:** `.stitch/DESIGN.md`. **Screenshots:** `.stitch/designs/` (v3c-* = approved refined set; v3b-* = the 8 concepts; glendesigns/ = Glen's refs).
- **Git:** branch `chromatic-ui-review` @ `8d9575f9`; denied UI on `shelved/denied-ui-redesign-pass1`; baseline SHA for scope diffs `0936d558`.

## 9. Fresh-session kickoff
1. Read this doc + `pass2-stitch-redesign.md` + `crash-element-logic-2026-05-30.md`.
2. **Start M0**: reproduce CF1 (VoiceOver on, open/close Element AU editor in Logic on a scratch session), confirm it's Element, fix the AX-peer lifetime, verify.
3. Then 28-bug/perf/test re-verify on a fresh `build-merged`.
4. Only after M0 exit → M1: finish remaining Stitch designs, pilot one component conversion, scale.
5. **Do NOT** resume the dead OMC 28-lane plan or re-author UI by hand. Stitch-first, tools mandatory, pilot-then-scale.

> Pre-existing WIP in the tree (`test/integration/SessionChangedTest.cpp`, `.claude/settings.json`, `build_number.txt`, `webview/package-lock.json`) is Glen's, not this work — leave it (allow-listed in `audit/plan-baseline-allowlist.md`).
