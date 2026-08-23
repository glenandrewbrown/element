# HANDOFF — Wave 3 "Lean & Fast UX" (ultrawork, in progress)

**Date:** 2026-06-08 · **Branch:** `wave-3-leanfast-ux` (base for PRs = `local-enhancements`, NOT main)
**Mode:** `/oh-my-claudecode:ultrawork` ACTIVE — autonomous execution to wave-complete, per-task **executor → reviewer ralph-loop → integrate → live-verify**. Glen: "the computer is yours, launch the app, control it… continue without stopping until all planned work is completed. Verify before claiming."
**STATUS AT HANDOFF:** Phase 0 + Phase 1 + Phase 2 + Phase 3 SHIPPED to git (verified + reviewer-approved). Phase 4 + Phase 5-rest + build/install + comprehensive native-QA REMAIN.

> **⚠️ Read these first (the authoritative state — this doc is just a pointer):**
> - **Approved plan:** `.omo/plans/wave-3-leanfast-ux-plan-2026-06-08.md` (v2, consensus-APPROVED; 6 phases; ADR; pre-mortem; expanded test plan). Plus the consensus reviews `.omo/plans/ralplan-architect-review-2026-06-08.md` + `ralplan-critic-review*-2026-06-08.md`.
> - **Phase-0 contracts (load-bearing, follow exactly):** `.omo/plans/phase0-loading-node-contract.md` + `.omo/plans/phase0-collapse-tier-contract.md`.
> - **Diagnoses + per-task reports:** `.omc/state/qa-wave-reports/w3-*.md` (perf-diag, plugin-window-diag, multicable, tier-render, name-match, collapse-state, panels, browser-ia, inspector-pin, panel-resize, cable-styles, review-{canvas,host,panels}).
> - **Research:** `.omo/research/nodegraph-ux-research-2026-06-08.md` (cutting-edge node/matrix/panel UX, TOP-10).

## COMMITS so far (newest last) on `wave-3-leanfast-ux`
- `9e0d4f62` atomic cable-splice undo (task #23)
- `da2b37f8` D1 cursor select-primary (pan on Space/middle/right)
- `bfadae8f` spectrum 30→15Hz + editor-open backoff tighten (1.1, 1.5)
- `4b57c811` graph-push dedupe + drop window-chrome pushes + O(1) plugin-list cache (1.2, 1.3)
- `05e9cce8` collapse-tier state + no-overlap + inspector idle-stop (2.0, 2.3, 1.4)
- `9c43bcd9` multi-cable fix + 3-tier blocks + name-match + collapsible panels (2.2, 2.4, 3.A, 3.B/C)
- `70c620f6` browser-IA + selection-inspector/pin + drag-resize + cable line-styles (3.D, 3.E, 3.F, 5.4) — **Wave 3 Phases 0–3 + 5.4 COMPLETE here**

## DONE (verified: tsc clean · vitest ~3026+ green w/ only the known fuzzyScore.perf flake · painter+terminology guards · C++ clean · ctests HostPushDedupe/CollapseTier/GroupNodes/ContainerDive · 3/3 reviewers APPROVE for Wave 1)
- **Phase 0** — loading-node + collapse-tier contracts (specs, no code).
- **Phase 1** — 1.1 spectrum, 1.2 push-dedupe+window-chrome, 1.3 plugin-list cache, 1.4 peakhold idle-stop, 1.5 backoff(interim) + D1 cursor.
- **Phase 2** — 2.0 collapse-tier state (dual-sided migration), 2.2 multi-cable (root cause: `.nodeblock-v3 overflow-hidden` clipped RF `<Handle>` hit-areas → fixed via overflow-visible), 2.3 no-overlap collision-resolve, 2.4 three-tier block render.
- **Phase 3** — 3.A inspector↔canvas name match (C++ `Binding::setDataProperties` seed-guard), 3.B/3.C collapsible panels + persist + keyboard (Cmd+\ / Cmd+Opt+\ / Cmd+.), 3.D browser-IA search-first, 3.E selection-inspector + pin-to-face + selection-driven auto-collapse (reviewer MAJOR fixed), 3.F panel drag-resize. **All committed in `70c620f6`; all reviewer-approved.**
- **Phase 5 (partial)** — 5.4 cable line-style axis (audio solid / MIDI dashed / CV dotted).

## REMAINING (resume here)
1. **Phase 4 — async plugin load (MED-HIGH, OWN BRANCH off the Phase-3 tip, merged last).** Tasks 4.1 + 4.2 + 4.3. **CRITICAL contract (see loading-node contract):** the placeholder→real swap MUST preserve the node **UUID** (NOT the engine nodeId); write into the SAME ValueTree; **do NOT reuse `EngineService::replace`/`ReplaceNodeMessage`** (mints a new UUID → Block detaches). RT-safe via `triggerAsyncUpdate → buildRenderingSequence → exchange(acq_rel)` — NEVER write `activeRenderingOps`. Loading node = NOT cable-targetable until ready; honest "loading…" face, no fake ports. Open Q: does an in-place `tags::object` swap trigger the op-republish? — verify/extend. **4.3 = Glen chose docked-DRAGGABLE editor** (React header → existing `elementPluginEditorSetBounds`), NOT a floating window. RT-safety reviewed in a SEPARATE verifier pass.
2. **Phase 5 rest** — 5.1 reroute knot gesture; 5.2 Cmd+G group alias (+ confirm Cmd+Shift+D works live); 5.3 always-on breadcrumb + collapsed-Container signature.
3. **Build + force-bundle ALL 8 products + reinstall** to `~/Applications/Element.app` (NOT /Applications — doesn't exist; ~/ is user-writable). Then **comprehensive native live-QA** (Glen's "control the app"): cursor select-primary, no-overlap, multi-cable fan-out (drag 2+ cables from one output), 3-tier collapse cycle, collapsible panels (Cmd+\ etc.), name match, browser-IA, inspector pin, draggable editor, plugin-open speed. Smoke alive/no-crash.
4. **MINOR follow-ups (non-blocking, deferred):** (a) confirm/dismiss a ~4px dark-well sliver on **muted/bypassed** blocks (overflow-visible side-effect from the 2.2 fix — LOW-confidence, cosmetic; a 30s look at the Muted Block story / a muted block); (b) `PinnedParamFace` allocates a new `ports` array per Block render (`Block.tsx:1710`) — optional `useMemo` micro-tidy (not a hot path); (c) `w3-inspector-pin-report.md` wording overstated 1b before the fix — already moot post-fix.

## TRAPS / CONSTRAINTS (all still apply)
- **Serialize commits** (stage+commit in ONE bash call; a hook runs `git reset` between calls). Never batch git with other tools. `rm` a stale `.git/index.lock` if a cancelled parallel call left one.
- **Lane file-isolation** for parallel agents (W2 contention is real). Serialize ALL `element_webview_host.cpp` edits to ONE actor. Verify edits on disk before commit (agents' edits can get reverted).
- **Never trust agent "done" claims** — verify on disk (tsc/vitest/build/ctest). Subagent final chat messages get eaten by hook-noise → have agents WRITE reports to files.
- `fuzzyScore.perf.test.ts` ratio assertion flakes under load — passes isolated; the ONLY acceptable vitest failure.
- ctest `GraphManager*` suites are **pre-disabled** in the repo (not a regression). SandboxStress/DeviceServiceController HANG (kill the test_element pid).
- New `.cpp` → `cmake -B build-merged` reconfigure (GLOB_RECURSE). Build dir = `build-merged`.
- Webview marker: `ls webview/dist/assets | grep '^index-.*js$'`; verify per-bundle after install. Last installed (Phase-1) marker = `index-DVToSLpl.js`.
- Multi-model CLIs: **codex wedges** (frozen CPU + localhost-proxy socket → `pkill -f "codex exec"` + fall back to a Claude agent). `agy` flaky. See `[[project_multimodel_cli_traps]]` + the updated `[[feedback_heartbeat_on_blocked]]` (background-shell-agent heartbeat: don't pipe through `tail`, probe real pid CPU/etime + lsof).
- Native computer-use on the JUCE app is flaky (CleanShot must be quit; Gatekeeper). The OSC bridge `agent-harness/.venv/bin/cli-anything-element` is the reliable launch/smoke path. Webview UI behaviour is reliably driven in Storybook/Playwright.
- Painter law (vitest-guarded): no per-tick inline blur/drop-shadow/animation/strokeWidth, no backdropFilter. Terminology guard (ctest + vitest). RT-safety: no audio-thread locks/allocs. Neumorphic, no glass. NOTHING-fake. Speed > appearance.

## RESUME PROMPT (paste after /clear)
Continue the Wave-3 ultrawork. Read `.omo/SESSION-HANDOFF-2026-06-08-wave3-ultrawork.md` then the approved plan + the two Phase-0 contracts. Phases 0–3 + Task 5.4 are committed on `wave-3-leanfast-ux`. Resume autonomous execution (parallel specialised executors → reviewer ralph-loop per task, verify on disk, never trust claims): (A) Phase 4 async-load on its OWN branch off the Phase-3 tip — UUID-preserving in-place swap (NOT EngineService::replace), loading node not cable-targetable, docked-draggable editor (Glen's pick); RT-safety in a separate verifier pass. (B) Phase 5 rest (5.1 reroute, 5.2 Cmd+G, 5.3 breadcrumb). (C) Build + force-bundle 8 + reinstall to ~/Applications, then comprehensive native live-QA driving every Wave-3 change; confirm/dismiss the muted-block well-sliver MINOR. Re-enter ultrawork if needed; /oh-my-claudecode:cancel when verified-complete.
